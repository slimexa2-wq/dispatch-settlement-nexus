import { buffer as streamToBuffer } from "node:stream/consumers";
import type { FastifyInstance } from "fastify";
import * as XLSX from "xlsx";
import { z } from "zod";
import {
  MigrationBatchStatus,
  MigrationRowStatus,
  Prisma
} from "../generated/prisma/client.js";
import { Permission } from "@xiangneng/shared";
import { writeAudit } from "../audit.js";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import {
  autoMapMigrationHeaders,
  buildMigrationPreview,
  deriveMigrationBatchStatus,
  validateMigrationMapping,
  type MigrationConflictPolicy,
  type MigrationFieldDefinition
} from "../services/migration-center.js";
import {
  applyMigrationRow,
  defaultMigrationTemplates,
  loadExistingMigrationKeys,
  rollbackMigrationRow
} from "../services/migration-targets.js";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function multipartFieldValue(field: unknown): unknown {
  if (!field || typeof field !== "object") return field;
  if ("value" in field) return (field as { value?: unknown }).value;
  return field;
}

function parseMigrationWorkbook(content: Buffer, sourceFile: string): { headers: string[]; rows: Array<Record<string, unknown>> } {
  if (!/\.(xlsx|xls|csv)$/i.test(sourceFile)) {
    throw new AppError(400, "INVALID_MIGRATION_FILE_TYPE", "数据迁移仅支持 xlsx、xls 或 csv 文件");
  }
  const workbook = XLSX.read(content, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new AppError(400, "EMPTY_MIGRATION_WORKBOOK", "文件中没有可读取的工作表");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (!rows.length) throw new AppError(400, "EMPTY_MIGRATION_FILE", "文件没有数据行");
  if (rows.length > 100_000) throw new AppError(413, "MIGRATION_ROW_LIMIT", "单个迁移文件最多支持10万行，请拆分后上传");
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith("__rowNum"))))];
  if (!headers.length) throw new AppError(400, "MIGRATION_HEADER_REQUIRED", "未识别到表头");
  if (headers.length > 500) throw new AppError(413, "MIGRATION_COLUMN_LIMIT", "迁移文件列数不能超过500列");
  return { headers, rows };
}

async function replaceMigrationPreviewRows(
  app: FastifyInstance,
  batchId: string,
  sourceRows: readonly Record<string, unknown>[],
  preview: ReturnType<typeof buildMigrationPreview>
): Promise<void> {
  await app.prisma.migrationRowResult.deleteMany({ where: { batchId } });
  const data = preview.rows.map((row, index) => ({
    batchId,
    sourceRow: row.sourceRow,
    status: row.action as MigrationRowStatus,
    action: row.action,
    uniqueKey: row.uniqueKey,
    sourceData: jsonValue(sourceRows[index] ?? {}),
    normalizedData: jsonValue(row.data),
    errors: jsonValue(row.errors)
  }));
  const chunkSize = 500;
  for (let start = 0; start < data.length; start += chunkSize) {
    await app.prisma.migrationRowResult.createMany({ data: data.slice(start, start + chunkSize) });
  }
}

const fieldSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  required: z.boolean().optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).optional(),
  format: z.enum(["TEXT", "PHONE", "ID_CARD", "DATE", "INTEGER", "NUMBER", "BOOLEAN"]).optional(),
  allowedValues: z.array(z.string().trim().min(1).max(120)).max(100).optional()
});

const templateInputSchema = z.object({
  code: z.string().trim().min(2).max(64).regex(/^[A-Z0-9_]+$/),
  name: z.string().trim().min(1).max(120),
  targetEntity: z.string().trim().min(1).max(64).regex(/^[A-Z0-9_]+$/),
  description: z.string().trim().max(1000).optional().nullable(),
  fields: z.array(fieldSchema).min(1).max(200),
  uniqueKeys: z.array(z.string().trim().min(1).max(64)).min(1).max(10),
  aliasMap: z.record(z.string()).optional(),
  isActive: z.boolean().optional()
});

const previewSchema = z.object({
  templateId: z.string().uuid(),
  sourceFile: z.string().trim().min(1).max(255),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  headers: z.array(z.string().max(200)).min(1).max(500),
  rows: z.array(z.record(z.unknown())).min(1).max(100000),
  mapping: z.record(z.string()).optional(),
  conflictPolicy: z.enum(["CREATE_ONLY", "UPDATE", "SKIP"]).default("UPDATE"),
  ignoredSourceRows: z.array(z.number().int().positive()).max(100000).optional()
});

const batchQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  status: z.nativeEnum(MigrationBatchStatus).optional(),
  templateId: z.string().uuid().optional()
});

async function ensureDefaultTemplates(app: FastifyInstance): Promise<void> {
  for (const template of defaultMigrationTemplates) {
    await app.prisma.migrationTemplate.upsert({
      where: { code: template.code },
      create: {
        code: template.code,
        name: template.name,
        targetEntity: template.targetEntity,
        description: template.description,
        fields: jsonValue(template.fields),
        uniqueKeys: template.uniqueKeys
      },
      update: {
        name: template.name,
        targetEntity: template.targetEntity,
        description: template.description,
        fields: jsonValue(template.fields),
        uniqueKeys: template.uniqueKeys
      }
    });
  }
}

export async function migrationCenterRoutes(app: FastifyInstance): Promise<void> {
  const guards = [app.authenticate, app.requirePermission(Permission.IMPORT_MANAGE)];

  app.get("/migration-center/templates", { preHandler: guards }, async (request) => {
    await ensureDefaultTemplates(app);
    const items = await app.prisma.migrationTemplate.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
    return success(request, items);
  });

  app.post("/migration-center/templates", { preHandler: guards }, async (request, reply) => {
    const input = templateInputSchema.parse(request.body);
    const template = await app.prisma.migrationTemplate.create({
      data: {
        code: input.code,
        name: input.name,
        targetEntity: input.targetEntity,
        description: input.description,
        fields: jsonValue(input.fields),
        uniqueKeys: input.uniqueKeys,
        aliasMap: jsonValue(input.aliasMap ?? {}),
        isActive: input.isActive ?? true
      }
    });
    await writeAudit(app.prisma, request, {
      action: "MIGRATION_TEMPLATE_CREATE",
      resourceType: "MigrationTemplate",
      resourceId: template.id,
      after: { code: template.code, targetEntity: template.targetEntity }
    });
    return reply.status(201).send(success(request, template));
  });

  app.patch("/migration-center/templates/:id", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = templateInputSchema.partial().parse(request.body);
    const existing = await app.prisma.migrationTemplate.findUnique({ where: { id } });
    if (!existing) notFound("迁移模板");
    const template = await app.prisma.migrationTemplate.update({
      where: { id },
      data: {
        code: input.code,
        name: input.name,
        targetEntity: input.targetEntity,
        description: input.description,
        fields: input.fields ? jsonValue(input.fields) : undefined,
        uniqueKeys: input.uniqueKeys,
        aliasMap: input.aliasMap ? jsonValue(input.aliasMap) : undefined,
        isActive: input.isActive
      }
    });
    await writeAudit(app.prisma, request, {
      action: "MIGRATION_TEMPLATE_UPDATE",
      resourceType: "MigrationTemplate",
      resourceId: template.id,
      before: { name: existing.name, isActive: existing.isActive },
      after: { name: template.name, isActive: template.isActive }
    });
    return success(request, template);
  });

  app.post("/migration-center/analyze-file", { preHandler: guards }, async (request) => {
    if (!request.isMultipart()) throw new AppError(400, "MIGRATION_FILE_REQUIRED", "请上传Excel或CSV文件");
    const upload = await request.file();
    if (!upload) throw new AppError(400, "MIGRATION_FILE_REQUIRED", "请上传Excel或CSV文件");
    const templateId = z.string().uuid().parse(multipartFieldValue(upload.fields.templateId));
    const template = await app.prisma.migrationTemplate.findUnique({ where: { id: templateId } });
    if (!template || !template.isActive) notFound("可用迁移模板");

    const saved = await app.fileStore.save({ stream: upload.file, filename: upload.filename, mimeType: upload.mimetype });
    let retained = false;
    try {
      const parsed = parseMigrationWorkbook(await streamToBuffer(await app.fileStore.open(saved.storageKey)), saved.originalName);
      const fields = z.array(fieldSchema).parse(template.fields) as MigrationFieldDefinition[];
      const autoMapping = autoMapMigrationHeaders(parsed.headers, { fields });
      const existing = await app.prisma.migrationBatch.findUnique({
        where: { templateId_sourceHash: { templateId, sourceHash: saved.sha256 } }
      });
      if (existing && [MigrationBatchStatus.COMMITTED, MigrationBatchStatus.PARTIAL].includes(existing.status)) {
        throw new AppError(409, "MIGRATION_ALREADY_COMMITTED", "同一模板和文件已执行过迁移", { batchId: existing.id, status: existing.status });
      }
      const user = getSession(request);
      const batch = await app.prisma.migrationBatch.upsert({
        where: { templateId_sourceHash: { templateId, sourceHash: saved.sha256 } },
        create: {
          templateId, sourceFile: saved.originalName, sourceHash: saved.sha256, sourceStorageKey: saved.storageKey,
          sourceMimeType: saved.mimeType, sourceSizeBytes: saved.sizeBytes, status: MigrationBatchStatus.DRAFT,
          mapping: jsonValue(autoMapping.mapping), totalRows: parsed.rows.length, summary: jsonValue({ analyzedRows: parsed.rows.length }),
          createdById: user.id
        },
        update: {
          sourceFile: saved.originalName, sourceStorageKey: saved.storageKey, sourceMimeType: saved.mimeType,
          sourceSizeBytes: saved.sizeBytes, status: MigrationBatchStatus.DRAFT, mapping: jsonValue(autoMapping.mapping),
          totalRows: parsed.rows.length, createRows: 0, updateRows: 0, skipRows: 0, errorRows: 0, processedRows: 0,
          summary: jsonValue({ analyzedRows: parsed.rows.length }), errors: jsonValue([]), committedAt: null, rolledBackAt: null
        }
      });
      retained = true;
      if (existing?.sourceStorageKey && existing.sourceStorageKey !== saved.storageKey) {
        await app.fileStore.remove(existing.sourceStorageKey);
      }
      await writeAudit(app.prisma, request, {
        action: "MIGRATION_FILE_ANALYZE", resourceType: "MigrationBatch", resourceId: batch.id,
        after: { template: template.code, sourceFile: saved.originalName, sourceHash: saved.sha256, rows: parsed.rows.length, columns: parsed.headers.length }
      });
      return success(request, {
        batch, template, headers: parsed.headers, rowCount: parsed.rows.length, autoMapping, mapping: autoMapping.mapping,
        sampleRows: parsed.rows.slice(0, 20)
      });
    } catch (error) {
      if (!retained) await app.fileStore.remove(saved.storageKey);
      throw error;
    }
  });

  app.post("/migration-center/batches/:id/preview-file", { bodyLimit: 5 * 1024 * 1024, preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({
      mapping: z.record(z.string()).optional(),
      conflictPolicy: z.enum(["CREATE_ONLY", "UPDATE", "SKIP"]).default("UPDATE"),
      ignoredSourceRows: z.array(z.number().int().positive()).max(100000).optional()
    }).parse(request.body);
    const batch = await app.prisma.migrationBatch.findUnique({ where: { id }, include: { template: true } });
    if (!batch) notFound("迁移批次");
    if (!batch.sourceStorageKey) throw new AppError(409, "MIGRATION_SOURCE_MISSING", "当前批次没有已上传的源文件，请重新上传");
    if ([MigrationBatchStatus.COMMITTED, MigrationBatchStatus.COMMITTING].includes(batch.status)) {
      throw new AppError(409, "MIGRATION_PREVIEW_LOCKED", "迁移已提交或正在执行，不能重新预览");
    }

    const parsed = parseMigrationWorkbook(await streamToBuffer(await app.fileStore.open(batch.sourceStorageKey)), batch.sourceFile);
    const fields = z.array(fieldSchema).parse(batch.template.fields) as MigrationFieldDefinition[];
    const autoMapping = autoMapMigrationHeaders(parsed.headers, { fields });
    const mapping = input.mapping && Object.keys(input.mapping).length ? input.mapping : autoMapping.mapping;
    const mappingErrors = validateMigrationMapping(mapping, fields);
    if (mappingErrors.length) throw new AppError(400, "MIGRATION_MAPPING_CONFLICT", "字段映射存在冲突", mappingErrors);
    const usedTargets = new Set(Object.values(mapping));
    const missingRequired = fields.filter((field) => field.required && !usedTargets.has(field.key)).map((field) => field.label);
    if (missingRequired.length) {
      throw new AppError(400, "MIGRATION_MAPPING_INCOMPLETE", `以下必填字段尚未映射：${missingRequired.join("、")}`, { autoMapping, missingRequired });
    }
    const existingKeys = await app.prisma.$transaction((tx) => loadExistingMigrationKeys(tx, batch.template.targetEntity));
    const preview = buildMigrationPreview({
      rows: parsed.rows, mapping, fields, uniqueKeys: batch.template.uniqueKeys, existingKeys,
      conflictPolicy: input.conflictPolicy as MigrationConflictPolicy, ignoredSourceRows: new Set(input.ignoredSourceRows ?? [])
    });
    await app.prisma.migrationBatch.update({ where: { id }, data: { status: MigrationBatchStatus.PREVIEWING, processedRows: 0 } });
    await replaceMigrationPreviewRows(app, id, parsed.rows, preview);
    const updated = await app.prisma.migrationBatch.update({
      where: { id },
      data: {
        status: preview.summary.errors ? MigrationBatchStatus.PREVIEWING : MigrationBatchStatus.READY,
        mapping: jsonValue(mapping), conflictPolicy: input.conflictPolicy, totalRows: preview.summary.total,
        createRows: preview.summary.creates, updateRows: preview.summary.updates, skipRows: preview.summary.skips,
        errorRows: preview.summary.errors, processedRows: 0, summary: jsonValue(preview.summary),
        errors: jsonValue(preview.rows.filter((row) => row.errors.length).map((row) => ({ sourceRow: row.sourceRow, errors: row.errors })))
      }
    });
    await writeAudit(app.prisma, request, {
      action: "MIGRATION_BATCH_PREVIEW", resourceType: "MigrationBatch", resourceId: id,
      after: { template: batch.template.code, sourceFile: batch.sourceFile, ...preview.summary }
    });
    return success(request, {
      batch: updated, template: batch.template, autoMapping, mapping, previewRows: preview.rows.slice(0, 500),
      previewTruncated: preview.rows.length > 500, summary: preview.summary
    });
  });

  app.post("/migration-center/preview", { preHandler: guards }, async (request) => {
    const input = previewSchema.parse(request.body);
    const template = await app.prisma.migrationTemplate.findUnique({ where: { id: input.templateId } });
    if (!template || !template.isActive) notFound("可用迁移模板");
    const fields = z.array(fieldSchema).parse(template.fields) as MigrationFieldDefinition[];
    const autoMapping = autoMapMigrationHeaders(input.headers, { fields });
    const mapping = input.mapping && Object.keys(input.mapping).length ? input.mapping : autoMapping.mapping;
    const mappingErrors = validateMigrationMapping(mapping, fields);
    if (mappingErrors.length) {
      throw new AppError(400, "MIGRATION_MAPPING_CONFLICT", "字段映射存在冲突", mappingErrors);
    }
    const usedTargets = new Set(Object.values(mapping));
    const missingRequired = fields.filter((field) => field.required && !usedTargets.has(field.key)).map((field) => field.label);
    if (missingRequired.length) {
      throw new AppError(400, "MIGRATION_MAPPING_INCOMPLETE", `以下必填字段尚未映射：${missingRequired.join("、")}`, {
        autoMapping,
        missingRequired
      });
    }
    const existingKeys = await app.prisma.$transaction((tx) => loadExistingMigrationKeys(tx, template.targetEntity));
    const preview = buildMigrationPreview({
      rows: input.rows,
      mapping,
      fields,
      uniqueKeys: template.uniqueKeys,
      existingKeys,
      conflictPolicy: input.conflictPolicy as MigrationConflictPolicy,
      ignoredSourceRows: new Set(input.ignoredSourceRows ?? [])
    });
    const user = getSession(request);
    const existingBatch = await app.prisma.migrationBatch.findUnique({
      where: { templateId_sourceHash: { templateId: template.id, sourceHash: input.sourceHash } }
    });
    if (existingBatch && [MigrationBatchStatus.COMMITTED, MigrationBatchStatus.PARTIAL].includes(existingBatch.status)) {
      throw new AppError(409, "MIGRATION_ALREADY_COMMITTED", "同一模板和文件已执行过迁移", { batchId: existingBatch.id, status: existingBatch.status });
    }
    const batch = await app.prisma.$transaction(async (tx) => {
      const record = await tx.migrationBatch.upsert({
        where: { templateId_sourceHash: { templateId: template.id, sourceHash: input.sourceHash } },
        create: {
          templateId: template.id,
          sourceFile: input.sourceFile,
          sourceHash: input.sourceHash,
          status: preview.summary.errors ? MigrationBatchStatus.PREVIEWING : MigrationBatchStatus.READY,
          mapping: jsonValue(mapping),
          conflictPolicy: input.conflictPolicy,
          totalRows: preview.summary.total,
          createRows: preview.summary.creates,
          updateRows: preview.summary.updates,
          skipRows: preview.summary.skips,
          errorRows: preview.summary.errors,
          summary: jsonValue(preview.summary),
          errors: jsonValue(preview.rows.filter((row) => row.errors.length).map((row) => ({ sourceRow: row.sourceRow, errors: row.errors }))),
          createdById: user.id
        },
        update: {
          status: preview.summary.errors ? MigrationBatchStatus.PREVIEWING : MigrationBatchStatus.READY,
          mapping: jsonValue(mapping),
          conflictPolicy: input.conflictPolicy,
          totalRows: preview.summary.total,
          createRows: preview.summary.creates,
          updateRows: preview.summary.updates,
          skipRows: preview.summary.skips,
          errorRows: preview.summary.errors,
          processedRows: 0,
          summary: jsonValue(preview.summary),
          errors: jsonValue(preview.rows.filter((row) => row.errors.length).map((row) => ({ sourceRow: row.sourceRow, errors: row.errors })))
        }
      });
      await tx.migrationRowResult.deleteMany({ where: { batchId: record.id } });
      await tx.migrationRowResult.createMany({
        data: preview.rows.map((row, index) => ({
          batchId: record.id,
          sourceRow: row.sourceRow,
          status: row.action as MigrationRowStatus,
          action: row.action,
          uniqueKey: row.uniqueKey,
          sourceData: jsonValue(input.rows[index] ?? {}),
          normalizedData: jsonValue(row.data),
          errors: jsonValue(row.errors)
        }))
      });
      return record;
    });
    await writeAudit(app.prisma, request, {
      action: "MIGRATION_BATCH_PREVIEW",
      resourceType: "MigrationBatch",
      resourceId: batch.id,
      after: { template: template.code, sourceFile: input.sourceFile, ...preview.summary }
    });
    return success(request, {
      batch,
      template,
      autoMapping,
      mapping,
      previewRows: preview.rows.slice(0, 500),
      previewTruncated: preview.rows.length > 500,
      summary: preview.summary
    });
  });

  app.get("/migration-center/batches", { preHandler: guards }, async (request) => {
    const query = batchQuerySchema.parse(request.query);
    const { page, pageSize, skip } = parsePagination(query);
    const where = { status: query.status, templateId: query.templateId };
    const [items, total] = await app.prisma.$transaction([
      app.prisma.migrationBatch.findMany({
        where,
        include: { template: true, createdBy: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: "desc" }, skip, take: pageSize
      }),
      app.prisma.migrationBatch.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.get("/migration-center/batches/:id", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const batch = await app.prisma.migrationBatch.findUnique({
      where: { id },
      include: {
        template: true,
        createdBy: { select: { id: true, displayName: true } },
        rows: { orderBy: { sourceRow: "asc" }, take: 2000 }
      }
    });
    if (!batch) notFound("迁移批次");
    return success(request, batch);
  });

  app.post("/migration-center/batches/:id/commit", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const batch = await app.prisma.migrationBatch.findUnique({ where: { id }, include: { template: true } });
    if (!batch) notFound("迁移批次");
    if (![MigrationBatchStatus.READY, MigrationBatchStatus.PREVIEWING, MigrationBatchStatus.FAILED, MigrationBatchStatus.PARTIAL].includes(batch.status)) {
      throw new AppError(409, "MIGRATION_NOT_COMMITTABLE", "当前迁移批次不能提交", { status: batch.status });
    }
    if (batch.status === MigrationBatchStatus.PREVIEWING && batch.errorRows > 0) throw new AppError(409, "MIGRATION_HAS_ERRORS", "仍有预览校验错误，请修复或在预览时跳过后再提交", { errorRows: batch.errorRows });
    const alreadyProcessed = await app.prisma.migrationRowResult.count({ where: { batchId: id, status: { in: [MigrationRowStatus.COMMITTED, MigrationRowStatus.SKIP] } } });
    await app.prisma.migrationBatch.update({ where: { id }, data: { status: MigrationBatchStatus.COMMITTING, processedRows: alreadyProcessed } });
    const rows = await app.prisma.migrationRowResult.findMany({
      where: { batchId: id, status: { in: [MigrationRowStatus.CREATE, MigrationRowStatus.UPDATE, MigrationRowStatus.ERROR] } },
      orderBy: { sourceRow: "asc" }
    });
    let succeeded = 0;
    const failures: Array<{ sourceRow: number; message: string }> = [];
    for (const row of rows) {
      try {
        const result = await app.prisma.$transaction((tx) => applyMigrationRow(
          tx,
          batch.template.targetEntity,
          row.action as "CREATE" | "UPDATE",
          z.record(z.unknown()).parse(row.normalizedData)
        ));
        await app.prisma.migrationRowResult.update({
          where: { id: row.id },
          data: {
            status: MigrationRowStatus.COMMITTED,
            entityId: result.entityId,
            before: result.before === null ? Prisma.JsonNull : jsonValue(result.before),
            after: jsonValue(result.after),
            errors: []
          }
        });
        succeeded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知迁移错误";
        failures.push({ sourceRow: row.sourceRow, message });
        await app.prisma.migrationRowResult.update({ where: { id: row.id }, data: { status: MigrationRowStatus.ERROR, errors: jsonValue([message]) } });
      }
      await app.prisma.migrationBatch.update({ where: { id }, data: { processedRows: { increment: 1 } } });
    }
    const committedRows = await app.prisma.migrationRowResult.count({
      where: { batchId: id, status: MigrationRowStatus.COMMITTED }
    });
    const finalStatus = deriveMigrationBatchStatus({ committedRows, failedRows: failures.length }) as MigrationBatchStatus;
    const finalBatch = await app.prisma.migrationBatch.update({
      where: { id },
      data: { status: finalStatus, errorRows: failures.length, errors: jsonValue(failures), committedAt: new Date() }
    });
    await writeAudit(app.prisma, request, {
      action: "MIGRATION_BATCH_COMMIT",
      resourceType: "MigrationBatch",
      resourceId: id,
      after: { status: finalStatus, succeeded, failed: failures.length }
    });
    return success(request, { batch: finalBatch, succeeded, failures });
  });

  app.post("/migration-center/batches/:id/rollback", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const batch = await app.prisma.migrationBatch.findUnique({ where: { id }, include: { template: true } });
    if (!batch) notFound("迁移批次");
    if (![MigrationBatchStatus.COMMITTED, MigrationBatchStatus.PARTIAL].includes(batch.status)) {
      throw new AppError(409, "MIGRATION_NOT_ROLLBACKABLE", "只有已提交的迁移批次可以撤销");
    }
    const rows = await app.prisma.migrationRowResult.findMany({
      where: { batchId: id, status: MigrationRowStatus.COMMITTED, entityId: { not: null } },
      orderBy: { sourceRow: "desc" }
    });
    const failures: Array<{ sourceRow: number; message: string }> = [];
    for (const row of rows) {
      try {
        await app.prisma.$transaction((tx) => rollbackMigrationRow(tx, batch.template.targetEntity, row.entityId!, row.before));
        await app.prisma.migrationRowResult.update({ where: { id: row.id }, data: { status: MigrationRowStatus.ROLLED_BACK } });
      } catch (error) {
        failures.push({ sourceRow: row.sourceRow, message: error instanceof Error ? error.message : "撤销失败" });
      }
    }
    if (failures.length) throw new AppError(409, "MIGRATION_ROLLBACK_PARTIAL", "部分数据无法撤销，请人工处理", failures);
    const result = await app.prisma.migrationBatch.update({ where: { id }, data: { status: MigrationBatchStatus.ROLLED_BACK, rolledBackAt: new Date() } });
    await writeAudit(app.prisma, request, {
      action: "MIGRATION_BATCH_ROLLBACK",
      resourceType: "MigrationBatch",
      resourceId: id,
      after: { rolledBackRows: rows.length }
    });
    return success(request, result);
  });

  app.get("/migration-center/batches/:id/errors.csv", { preHandler: guards }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const rows = await app.prisma.migrationRowResult.findMany({ where: { batchId: id, status: MigrationRowStatus.ERROR }, orderBy: { sourceRow: "asc" } });
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = ["原始行号,错误原因,原始数据", ...rows.map((row) => [row.sourceRow, (row.errors as unknown[]).join("；"), JSON.stringify(row.sourceData)].map(quote).join(","))];
    return reply.type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`迁移错误-${id}.csv`)}`)
      .send(`\uFEFF${lines.join("\n")}`);
  });
}
