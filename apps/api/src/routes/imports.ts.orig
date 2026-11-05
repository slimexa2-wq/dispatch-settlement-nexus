import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { Prisma } from "../generated/prisma/client.js";
import { z } from "zod";
import {
  ImportStatus,
  Permission,
  ProjectStatus,
  ResponsibilityType,
  normalizeIdCard,
  personRegistrationSchema
  ,ApplicationSource
} from "@xiangneng/shared";
import { AppError } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { registerPerson } from "../services/registration.js";
import { writeAudit } from "../audit.js";
import { createPeopleTemplate, parsePeopleWorkbook } from "../services/people-workbook.js";

const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
  sourceRows: z.array(z.number()).optional(),
  projectIds: z.array(z.string()).optional()
}).passthrough();

const organizationSchema = z.object({
  schemaVersion: z.literal(1),
  sourceFile: z.string(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  branches: z.array(z.object({
    name: z.string().min(1).max(200),
    projectCount: z.number().int().nonnegative(),
    externalProjectCount: z.number().int().nonnegative(),
    nonExternalProjectCount: z.number().int().nonnegative()
  })),
  projects: z.array(z.object({
    sourceRow: z.number().int().positive(),
    sourceNo: z.number().int().positive(),
    sourceProjectId: z.string().min(1).max(64),
    branchName: z.string().min(1).max(200),
    projectName: z.string().min(1).max(200),
    isExternal: z.boolean(),
    businessType: z.string().max(64).nullable(),
    projectStatus: z.nativeEnum(ProjectStatus).nullable(),
    managerName: z.string().max(64).nullable(),
    managerPhone: z.string().max(32).nullable(),
    cooperationStart: z.string().nullable(),
    cooperationEnd: z.string().nullable(),
    responsibility: z.nativeEnum(ResponsibilityType).nullable(),
    remark: z.string().max(2000).nullable()
  })),
  skipped: z.array(z.unknown()),
  warnings: z.array(warningSchema),
  reconciliation: z.object({
    branchCount: z.number().int(),
    projectCount: z.number().int(),
    externalProjectCount: z.number().int(),
    nonExternalProjectCount: z.number().int(),
    summaryMatchesDetail: z.boolean(),
    duplicateProjectIdCount: z.number().int(),
    duplicateBranchProjectNameCount: z.number().int(),
    duplicateGlobalProjectNameCount: z.number().int(),
    missingBusinessTypeCount: z.number().int(),
    missingMaintenanceFieldProjectCount: z.number().int()
  })
});

const commitSchema = z.object({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/), importId: z.string().uuid() });
const peopleImportSchema = z.object({
  sourceFile: z.string().trim().min(1).max(255),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.unknown()).max(10000)
});
const peopleWorkbookRowSchema = z.object({
  sourceRow: z.number().int().positive(),
  name: z.string(),
  idCard: z.string(),
  phone: z.string(),
  sourceProjectId: z.string().optional(),
  branchName: z.string().optional(),
  projectName: z.string().optional(),
  jobTitle: z.string(),
  interviewDate: z.string().optional(),
  supplierName: z.string().optional(),
  recommenderUsername: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  source: z.nativeEnum(ApplicationSource),
  notes: z.string().optional()
});
const stagedPeopleCommitSchema = z.object({ importId: z.string().uuid(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) });
const stagedPeopleRowSchema = z.object({
  row: z.number().int().positive(),
  data: personRegistrationSchema
});

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function loadOrganizationArtifact() {
  const paths = [
    resolve(process.cwd(), "data", "synthetic", "organization-projects.json"),
    resolve(process.cwd(), "..", "..", "data", "synthetic", "organization-projects.json"),
    fileURLToPath(new URL("../../../../data/synthetic/organization-projects.json", import.meta.url))
  ];
  for (const path of [...new Set(paths)]) {
    try {
      const raw = await readFile(path, "utf8");
      return organizationSchema.parse(JSON.parse(raw) as unknown);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }
  throw new AppError(503, "ORGANIZATION_ARTIFACT_MISSING", `未找到已核验的组织项目派生数据：${paths.join("；")}`);
}

async function previewPeople(app: FastifyInstance, body: z.infer<typeof peopleImportSchema>) {
  const accepted: Array<{ row: number; data: z.infer<typeof personRegistrationSchema>; action: "CREATE" | "MERGE"; existingPersonId?: string }> = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  const seen = new Set<string>();
  for (const [index, raw] of body.rows.entries()) {
    let normalized: unknown = raw;
    const workbookRow = peopleWorkbookRowSchema.safeParse(raw);
    if (workbookRow.success) {
      const row = workbookRow.data;
      const project = await app.prisma.project.findFirst({
        where: row.sourceProjectId
          ? { sourceProjectId: row.sourceProjectId }
          : { name: row.projectName ?? "", branch: { name: row.branchName ?? "" } },
        select: { id: true }
      });
      if (!project) {
        skipped.push({ row: row.sourceRow, reason: "未匹配到项目；必须使用有效源项目ID或分子公司+项目名称" });
        continue;
      }
      const supplier = row.supplierName
        ? await app.prisma.supplier.findUnique({ where: { name: row.supplierName }, select: { id: true } })
        : null;
      if (row.supplierName && !supplier) {
        skipped.push({ row: row.sourceRow, reason: "未匹配到供应商，导入不会自由文本新建" });
        continue;
      }
      const recommender = row.recommenderUsername
        ? await app.prisma.user.findUnique({ where: { username: row.recommenderUsername }, select: { id: true } })
        : null;
      if (row.recommenderUsername && !recommender) {
        skipped.push({ row: row.sourceRow, reason: "未匹配到推荐人账号" });
        continue;
      }
      normalized = {
        name: row.name,
        idCard: row.idCard,
        phone: row.phone,
        projectId: project.id,
        jobTitle: row.jobTitle,
        interviewDate: row.interviewDate,
        supplierId: supplier?.id,
        recommenderUserId: recommender?.id,
        emergencyContactName: row.emergencyContactName,
        emergencyContactPhone: row.emergencyContactPhone,
        emergencyContactRelation: row.emergencyContactRelation,
        source: row.source,
        notes: row.notes
      };
    }
    const parsed = personRegistrationSchema.safeParse(normalized);
    const sourceRow = workbookRow.success ? workbookRow.data.sourceRow : index + 2;
    if (!parsed.success) {
      skipped.push({ row: sourceRow, reason: parsed.error.issues.map((issue) => issue.message).join("；") });
      continue;
    }
    if (parsed.data.source === ApplicationSource.SUPPLIER && !parsed.data.supplierId) {
      skipped.push({ row: sourceRow, reason: "供应商报名必须匹配供应商主体" });
      continue;
    }
    if (parsed.data.source === ApplicationSource.REFERRAL && !parsed.data.recommenderUserId) {
      skipped.push({ row: sourceRow, reason: "内部推荐必须匹配推荐人账号" });
      continue;
    }
    if (parsed.data.source !== ApplicationSource.SUPPLIER && parsed.data.supplierId) {
      skipped.push({ row: sourceRow, reason: "非供应商来源不能携带供应商主体" });
      continue;
    }
    if (parsed.data.source !== ApplicationSource.REFERRAL && parsed.data.recommenderUserId) {
      skipped.push({ row: sourceRow, reason: "非内部推荐来源不能携带推荐人" });
      continue;
    }
    const idCard = normalizeIdCard(parsed.data.idCard);
    if (seen.has(idCard)) {
      skipped.push({ row: sourceRow, reason: "同一导入文件内身份证号重复" });
      continue;
    }
    seen.add(idCard);
    const existing = await app.prisma.person.findUnique({ where: { idCard }, select: { id: true } });
    accepted.push({ row: sourceRow, data: parsed.data, action: existing ? "MERGE" : "CREATE", existingPersonId: existing?.id });
  }
  return { accepted, skipped };
}

export async function importRoutes(app: FastifyInstance): Promise<void> {
  const guards = [app.authenticate, app.requirePermission(Permission.IMPORT_MANAGE)];

  app.post("/imports/organization/preview", { preHandler: guards }, async (request) => {
    const artifact = await loadOrganizationArtifact();
    if (request.isMultipart()) {
      const upload = await request.file();
      if (!upload) throw new AppError(400, "FILE_REQUIRED", "请选择组织项目源 Excel");
      const buffer = await upload.toBuffer();
      const uploadHash = createHash("sha256").update(buffer).digest("hex");
      if (uploadHash !== artifact.sourceSha256) {
        throw new AppError(409, "UNVERIFIED_ORGANIZATION_SOURCE", "上传文件与已核验组织项目源文件哈希不一致，未进行预览", {
          uploadedHash: uploadHash,
          expectedHash: artifact.sourceSha256
        });
      }
    }
    if (!artifact.reconciliation.summaryMatchesDetail || artifact.reconciliation.duplicateProjectIdCount > 0 || artifact.reconciliation.duplicateBranchProjectNameCount > 0) {
      throw new AppError(409, "RECONCILIATION_FAILED", "组织项目派生数据未通过关键对账", artifact.reconciliation);
    }
    const job = await app.prisma.importJob.upsert({
      where: { type_sourceHash: { type: "ORGANIZATION_PROJECTS", sourceHash: artifact.sourceSha256 } },
      create: {
        type: "ORGANIZATION_PROJECTS",
        sourceFile: artifact.sourceFile,
        sourceHash: artifact.sourceSha256,
        status: ImportStatus.PREVIEW,
        totalRows: artifact.projects.length,
        successRows: artifact.projects.length,
        skippedRows: artifact.skipped.length,
        summary: artifact.reconciliation,
        errors: jsonValue(artifact.warnings),
        createdById: getSession(request).id
      },
      update: {
        totalRows: artifact.projects.length,
        successRows: artifact.projects.length,
        skippedRows: artifact.skipped.length,
        summary: artifact.reconciliation,
        errors: jsonValue(artifact.warnings)
      }
    });
    return success(request, {
      importId: job.id,
      importJobId: job.id,
      sourceFile: artifact.sourceFile,
      sourceHash: artifact.sourceSha256,
      branches: artifact.branches,
      accepted: artifact.projects,
      projects: artifact.projects,
      skipped: artifact.skipped,
      warnings: artifact.warnings,
      reconciliation: artifact.reconciliation
    });
  });

  app.post("/imports/organization/commit", { preHandler: guards }, async (request) => {
    const input = commitSchema.parse(request.body);
    const artifact = await loadOrganizationArtifact();
    if (input.sourceHash !== artifact.sourceSha256) {
      throw new AppError(409, "SOURCE_HASH_MISMATCH", "提交的文件哈希与当前已核验派生数据不一致");
    }
    const previewJob = await app.prisma.importJob.findFirst({
      where: { id: input.importId, type: "ORGANIZATION_PROJECTS", sourceHash: input.sourceHash }
    });
    if (!previewJob) throw new AppError(409, "IMPORT_PREVIEW_NOT_FOUND", "未找到与提交信息匹配的组织项目预览");
    if (previewJob.status !== ImportStatus.PREVIEW) throw new AppError(409, "IMPORT_ALREADY_COMMITTED", "该组织项目预览已提交，不能重复执行");
    if (!artifact.reconciliation.summaryMatchesDetail || artifact.reconciliation.duplicateProjectIdCount || artifact.reconciliation.duplicateBranchProjectNameCount) {
      throw new AppError(409, "RECONCILIATION_FAILED", "组织项目数据对账失败，禁止写入", artifact.reconciliation);
    }
    const user = getSession(request);
    const result = await app.prisma.$transaction(async (tx) => {
      const branchIds = new Map<string, string>();
      let branchesCreated = 0;
      let branchesUpdated = 0;
      for (const branch of artifact.branches) {
        const existing = await tx.branch.findUnique({ where: { name: branch.name }, select: { id: true } });
        const record = existing
          ? await tx.branch.update({ where: { id: existing.id }, data: {} })
          : await tx.branch.create({ data: { name: branch.name } });
        branchIds.set(branch.name, record.id);
        if (existing) branchesUpdated += 1;
        else branchesCreated += 1;
      }
      let projectsCreated = 0;
      let projectsUpdated = 0;
      for (const item of artifact.projects) {
        const branchId = branchIds.get(item.branchName);
        if (!branchId) throw new AppError(409, "BRANCH_MAPPING_MISSING", `项目 ${item.sourceProjectId} 的分子公司不存在`);
        const existing = await tx.project.findFirst({
          where: { OR: [{ sourceProjectId: item.sourceProjectId }, { branchId, name: item.projectName }] },
          select: { id: true }
        });
        const data = {
          sourceProjectId: item.sourceProjectId,
          branchId,
          name: item.projectName,
          isExternal: item.isExternal,
          businessType: item.businessType,
          status: item.projectStatus,
          managerName: item.managerName,
          managerPhone: item.managerPhone,
          cooperationStart: item.cooperationStart ? new Date(item.cooperationStart) : null,
          cooperationEnd: item.cooperationEnd ? new Date(item.cooperationEnd) : null,
          responsibility: item.responsibility,
          remark: item.remark
        };
        if (existing) {
          await tx.project.update({ where: { id: existing.id }, data });
          projectsUpdated += 1;
        } else {
          await tx.project.create({ data });
          projectsCreated += 1;
        }
      }
      const job = await tx.importJob.upsert({
        where: { type_sourceHash: { type: "ORGANIZATION_PROJECTS", sourceHash: artifact.sourceSha256 } },
        create: {
          type: "ORGANIZATION_PROJECTS",
          sourceFile: artifact.sourceFile,
          sourceHash: artifact.sourceSha256,
          status: ImportStatus.COMMITTED,
          totalRows: artifact.projects.length,
          successRows: artifact.projects.length,
          skippedRows: artifact.skipped.length,
          summary: { ...artifact.reconciliation, branchesCreated, branchesUpdated, projectsCreated, projectsUpdated },
          errors: jsonValue(artifact.warnings),
          createdById: user.id,
          committedAt: new Date()
        },
        update: {
          status: ImportStatus.COMMITTED,
          successRows: artifact.projects.length,
          skippedRows: artifact.skipped.length,
          summary: { ...artifact.reconciliation, branchesCreated, branchesUpdated, projectsCreated, projectsUpdated },
          errors: jsonValue(artifact.warnings),
          committedAt: new Date()
        }
      });
      await writeAudit(tx, request, {
        action: "ORGANIZATION_PROJECTS_IMPORT_COMMIT",
        resourceType: "ImportJob",
        resourceId: job.id,
        after: { sourceHash: artifact.sourceSha256, branchesCreated, branchesUpdated, projectsCreated, projectsUpdated }
      });
      return { job, branchesCreated, branchesUpdated, projectsCreated, projectsUpdated };
    }, { timeout: 60_000 });
    return success(request, { ...result, reconciliation: artifact.reconciliation, warnings: artifact.warnings });
  });

  app.post("/imports/people/preview", { preHandler: guards }, async (request) => {
    let body: z.infer<typeof peopleImportSchema>;
    if (request.isMultipart()) {
      const file = await request.file();
      if (!file) throw new AppError(400, "FILE_REQUIRED", "请选择人员 Excel 文件");
      if (!/\.(xlsx|xls)$/i.test(file.filename)) throw new AppError(400, "INVALID_FILE_TYPE", "人员导入仅支持 xlsx/xls 文件");
      try {
        const parsed = parsePeopleWorkbook(await file.toBuffer());
        body = { sourceFile: file.filename, sourceHash: parsed.sourceHash, rows: parsed.rows };
      } catch (error) {
        throw new AppError(400, "INVALID_PEOPLE_WORKBOOK", error instanceof Error ? error.message : "人员 Excel 解析失败");
      }
    } else {
      body = peopleImportSchema.parse(request.body);
    }
    const preview = await previewPeople(app, body);
    const user = getSession(request);
    const existingJob = await app.prisma.importJob.findUnique({
      where: { type_sourceHash: { type: "PEOPLE", sourceHash: body.sourceHash } }
    });
    if (existingJob && existingJob.status !== ImportStatus.PREVIEW) {
      throw new AppError(409, "IMPORT_ALREADY_COMMITTED", "相同来源文件已提交，不能重新预览后重复导入", {
        importId: existingJob.id,
        status: existingJob.status
      });
    }
    const job = await app.prisma.importJob.upsert({
      where: { type_sourceHash: { type: "PEOPLE", sourceHash: body.sourceHash } },
      create: {
        type: "PEOPLE",
        sourceFile: body.sourceFile,
        sourceHash: body.sourceHash,
        status: ImportStatus.PREVIEW,
        totalRows: body.rows.length,
        successRows: preview.accepted.length,
        skippedRows: preview.skipped.length,
        previewRows: jsonValue(preview.accepted.map(({ row, data }) => ({ row, data }))),
        summary: { creates: preview.accepted.filter((item) => item.action === "CREATE").length, merges: preview.accepted.filter((item) => item.action === "MERGE").length },
        errors: jsonValue(preview.skipped),
        createdById: user.id
      },
      update: {
        totalRows: body.rows.length,
        successRows: preview.accepted.length,
        skippedRows: preview.skipped.length,
        previewRows: jsonValue(preview.accepted.map(({ row, data }) => ({ row, data }))),
        summary: { creates: preview.accepted.filter((item) => item.action === "CREATE").length, merges: preview.accepted.filter((item) => item.action === "MERGE").length },
        errors: jsonValue(preview.skipped)
      }
    });
    return success(request, {
      importId: job.id,
      sourceFile: body.sourceFile,
      sourceHash: body.sourceHash,
      totalRows: body.rows.length,
      ...preview,
      warnings: [],
      reconciliation: {
        accepted: preview.accepted.length,
        skipped: preview.skipped.length,
        creates: preview.accepted.filter((item) => item.action === "CREATE").length,
        merges: preview.accepted.filter((item) => item.action === "MERGE").length
      }
    });
  });

  app.post("/imports/people/commit", { preHandler: guards }, async (request) => {
    const staged = stagedPeopleCommitSchema.safeParse(request.body);
    let body: z.infer<typeof peopleImportSchema>;
    let preview: Awaited<ReturnType<typeof previewPeople>>;
    if (staged.success) {
      const importJob = await app.prisma.importJob.findFirst({ where: { id: staged.data.importId, type: "PEOPLE", sourceHash: staged.data.sourceHash } });
      if (!importJob) throw new AppError(409, "IMPORT_PREVIEW_NOT_FOUND", "未找到与提交信息匹配的人员导入预览");
      if (importJob.status !== ImportStatus.PREVIEW) throw new AppError(409, "IMPORT_ALREADY_COMMITTED", "该人员导入预览已提交，不能重复执行");
      if (importJob.committedAt) throw new AppError(409, "IMPORT_ALREADY_COMMITTED", "该人员导入预览已被提交，不能重复执行");
      const rows = z.array(stagedPeopleRowSchema).parse(importJob.previewRows);
      const skipped = z.array(z.object({ row: z.number().int().positive(), reason: z.string() })).catch([]).parse(importJob.errors);
      const accepted: Awaited<ReturnType<typeof previewPeople>>["accepted"] = [];
      for (const row of rows) {
        const existing = await app.prisma.person.findUnique({
          where: { idCard: normalizeIdCard(row.data.idCard) },
          select: { id: true }
        });
        accepted.push({ row: row.row, data: row.data, action: existing ? "MERGE" : "CREATE", existingPersonId: existing?.id });
      }
      body = { sourceFile: importJob.sourceFile, sourceHash: importJob.sourceHash, rows: rows.map((row) => row.data) };
      preview = { accepted, skipped };
      const claim = await app.prisma.importJob.updateMany({
        where: { id: importJob.id, status: ImportStatus.PREVIEW, committedAt: null },
        data: { committedAt: new Date() }
      });
      if (claim.count !== 1) throw new AppError(409, "IMPORT_ALREADY_COMMITTED", "该人员导入预览已被其他请求提交");
    } else throw new AppError(400, "IMPORT_PREVIEW_REQUIRED", "请先上传文件预览，再使用 importId 和 sourceHash 提交");
    const user = getSession(request);
    const results: Array<{ row: number; personId: string; action: "CREATE" | "MERGE" }> = [];
    const failures = [...preview.skipped];
    for (const item of preview.accepted) {
      try {
        const registered = await registerPerson(app.prisma, app.config, request, item.data, user);
        results.push({ row: item.row, personId: registered.person.id, action: registered.deduplicated ? "MERGE" : "CREATE" });
      } catch (error) {
        failures.push({ row: item.row, reason: error instanceof Error ? error.message : "未知导入错误" });
      }
    }
    const status = failures.length === 0 ? ImportStatus.COMMITTED : results.length > 0 ? ImportStatus.PARTIAL : ImportStatus.FAILED;
    const job = await app.prisma.importJob.upsert({
      where: { type_sourceHash: { type: "PEOPLE", sourceHash: body.sourceHash } },
      create: {
        type: "PEOPLE",
        sourceFile: body.sourceFile,
        sourceHash: body.sourceHash,
        status,
        totalRows: body.rows.length,
        successRows: results.length,
        skippedRows: preview.skipped.length,
        failedRows: failures.length - preview.skipped.length,
        summary: { created: results.filter((item) => item.action === "CREATE").length, merged: results.filter((item) => item.action === "MERGE").length },
        errors: failures,
        createdById: user.id,
        committedAt: new Date()
      },
      update: {
        status,
        successRows: results.length,
        skippedRows: preview.skipped.length,
        failedRows: failures.length - preview.skipped.length,
        summary: { created: results.filter((item) => item.action === "CREATE").length, merged: results.filter((item) => item.action === "MERGE").length },
        errors: failures,
        committedAt: new Date()
      }
    });
    return success(request, { job, results, failures });
  });

  app.get("/imports/people/template", { preHandler: guards }, async (_request, reply) => reply
    .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent("人员导入模板.xlsx")}`)
    .send(createPeopleTemplate()));

  app.get("/imports", { preHandler: guards }, async (request) => {
    const { page, pageSize, skip } = parsePagination(request.query);
    const [items, total] = await app.prisma.$transaction([
      app.prisma.importJob.findMany({
        include: { createdBy: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      app.prisma.importJob.count()
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });
}
