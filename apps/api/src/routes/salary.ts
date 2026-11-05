import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ImportStatus,
  NotificationStatus,
  Permission,
  SalarySlipStatus,
  idSchema,
  normalizeIdCard,
  salarySlipRowSchema
} from "@xiangneng/shared";
import { Prisma } from "../generated/prisma/client.js";
import { AppError, conflict, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { writeAudit } from "../audit.js";
import { createSalaryTemplate, exportSalaryWorkbook, parseSalaryWorkbook } from "../services/salary-workbook.js";

const salaryImportSchema = z.object({
  sourceFile: z.string().trim().min(1).max(255),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.unknown()).min(1).max(10000)
});
const stagedCommitSchema = z.object({ importId: idSchema, sourceHash: z.string().regex(/^[a-f0-9]{64}$/) });
const idsSchema = z.object({ ids: z.array(idSchema).min(1).max(10000) });
const salaryQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  salaryMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  status: z.nativeEnum(SalarySlipStatus).optional(),
  batchId: idSchema.optional()
  ,keyword: z.string().trim().max(100).optional()
});

const matchedRowSchema = salarySlipRowSchema.and(z.object({
  row: z.number().int().positive(),
  personId: idSchema,
  personName: z.string()
}));
type MatchedSalaryRow = z.infer<typeof matchedRowSchema>;

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function salaryWhere(query: z.infer<typeof salaryQuerySchema>): Prisma.SalarySlipWhereInput {
  return {
    salaryMonth: query.salaryMonth,
    status: query.status,
    batchId: query.batchId,
    person: query.keyword ? {
      OR: [
        { name: { contains: query.keyword, mode: "insensitive" } },
        { employeeNo: { contains: query.keyword, mode: "insensitive" } },
        { idCard: { contains: query.keyword, mode: "insensitive" } }
      ]
    } : undefined
  };
}

async function importBody(request: FastifyRequest) {
  if (request.isMultipart()) {
    const file = await request.file();
    if (!file) throw new AppError(400, "FILE_REQUIRED", "请选择工资条 Excel 文件");
    if (!/\.(xlsx|xls)$/i.test(file.filename)) throw new AppError(400, "INVALID_FILE_TYPE", "工资条仅支持 xlsx/xls 文件");
    const buffer = await file.toBuffer();
    try {
      const parsed = parseSalaryWorkbook(buffer);
      return salaryImportSchema.parse({ sourceFile: file.filename, sourceHash: parsed.sourceHash, rows: parsed.rows });
    } catch (error) {
      throw new AppError(400, "INVALID_SALARY_WORKBOOK", error instanceof Error ? error.message : "工资条文件解析失败");
    }
  }
  return salaryImportSchema.parse(request.body);
}

async function validateSalaryRows(app: FastifyInstance, body: z.infer<typeof salaryImportSchema>) {
  const accepted: MatchedSalaryRow[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  const seenPeople = new Set<string>();
  let salaryMonth: string | null = null;
  for (const [index, raw] of body.rows.entries()) {
    const sourceRow = typeof raw === "object" && raw !== null && "sourceRow" in raw && Number.isInteger(Number(raw.sourceRow))
      ? Number(raw.sourceRow)
      : index + 2;
    const parsed = salarySlipRowSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ row: sourceRow, reason: parsed.error.issues.map((issue) => issue.message).join("；") });
      continue;
    }
    if (salaryMonth && parsed.data.salaryMonth !== salaryMonth) {
      skipped.push({ row: sourceRow, reason: "同一导入批次只能包含一个工资月份" });
      continue;
    }
    salaryMonth ??= parsed.data.salaryMonth;
    const byIdCard = parsed.data.idCard
      ? await app.prisma.person.findUnique({ where: { idCard: normalizeIdCard(parsed.data.idCard) }, select: { id: true, name: true } })
      : null;
    const byEmployeeNo = parsed.data.employeeNo
      ? await app.prisma.person.findUnique({ where: { employeeNo: parsed.data.employeeNo }, select: { id: true, name: true } })
      : null;
    if (byIdCard && byEmployeeNo && byIdCard.id !== byEmployeeNo.id) {
      skipped.push({ row: sourceRow, reason: "身份证号与员工编号匹配到不同人员" });
      continue;
    }
    const person = byIdCard ?? byEmployeeNo;
    if (!person) {
      skipped.push({ row: sourceRow, reason: "未匹配到人员档案" });
      continue;
    }
    if (seenPeople.has(person.id)) {
      skipped.push({ row: sourceRow, reason: "同一人员在本批次中重复" });
      continue;
    }
    seenPeople.add(person.id);
    accepted.push({ ...parsed.data, row: sourceRow, personId: person.id, personName: person.name });
  }
  return { salaryMonth, accepted, skipped };
}

async function stagePreview(app: FastifyInstance, request: FastifyRequest, body: z.infer<typeof salaryImportSchema>) {
  const preview = await validateSalaryRows(app, body);
  if (!preview.salaryMonth) throw new AppError(400, "NO_VALID_SALARY_MONTH", "工资条没有有效月份", preview.skipped);
  const existing = await app.prisma.salaryImportBatch.findUnique({
    where: { sourceHash_salaryMonth: { sourceHash: body.sourceHash, salaryMonth: preview.salaryMonth } }
  });
  if (existing && existing.status !== ImportStatus.PREVIEW) {
    throw new AppError(409, "IMPORT_ALREADY_COMMITTED", "相同来源的工资条批次已提交，不能重新预览后重复导入", {
      importId: existing.id,
      status: existing.status
    });
  }
  if (existing?.publishedAt && !existing.withdrawnAt) conflict("相同来源的工资条批次已经发布，不能覆盖预览");
  const user = getSession(request);
  const batch = await app.prisma.salaryImportBatch.upsert({
    where: { sourceHash_salaryMonth: { sourceHash: body.sourceHash, salaryMonth: preview.salaryMonth } },
    create: {
      sourceFile: body.sourceFile,
      sourceHash: body.sourceHash,
      salaryMonth: preview.salaryMonth,
      status: ImportStatus.PREVIEW,
      totalRows: body.rows.length,
      acceptedRows: preview.accepted.length,
      skippedRows: preview.skipped.length,
      previewRows: jsonValue(preview.accepted),
      errors: jsonValue(preview.skipped),
      createdById: user.id
    },
    update: {
      sourceFile: body.sourceFile,
      status: ImportStatus.PREVIEW,
      totalRows: body.rows.length,
      acceptedRows: preview.accepted.length,
      skippedRows: preview.skipped.length,
      previewRows: jsonValue(preview.accepted),
      errors: jsonValue(preview.skipped)
    }
  });
  return { batch, preview };
}

async function commitStaged(app: FastifyInstance, request: FastifyRequest, batchId: string, sourceHash: string) {
  const batch = await app.prisma.salaryImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) notFound("工资条导入预览");
  if (batch.sourceHash !== sourceHash) throw new AppError(409, "SOURCE_HASH_MISMATCH", "导入预览哈希与提交哈希不一致");
  if (batch.status !== ImportStatus.PREVIEW) throw new AppError(409, "IMPORT_ALREADY_COMMITTED", "该工资条预览已提交，不能重复执行");
  const accepted = z.array(matchedRowSchema).parse(batch.previewRows);
  if (!accepted.length) throw new AppError(400, "NO_ACCEPTED_SALARY_ROWS", "没有可提交的工资条数据");
  const published = await app.prisma.salarySlip.count({
    where: { personId: { in: accepted.map((row) => row.personId) }, salaryMonth: batch.salaryMonth, status: SalarySlipStatus.PUBLISHED }
  });
  if (published) conflict("该月份存在已发布工资条，请先撤回后再重新导入");
  const committed = await app.prisma.$transaction(async (tx) => {
    for (const row of accepted) {
      await tx.salarySlip.upsert({
        where: { personId_salaryMonth: { personId: row.personId, salaryMonth: row.salaryMonth } },
        create: {
          personId: row.personId,
          batchId: batch.id,
          salaryMonth: row.salaryMonth,
          grossPay: row.grossPay,
          netPay: row.netPay,
          hourlyPay: row.hourlyPay,
          overtimePay: row.overtimePay,
          allowance: row.allowance,
          referralReward: row.referralReward,
          socialSecurityDeduction: row.socialSecurityDeduction,
          otherDeduction: row.otherDeduction,
          notes: row.notes,
          status: SalarySlipStatus.DRAFT
        },
        update: {
          batchId: batch.id,
          grossPay: row.grossPay,
          netPay: row.netPay,
          hourlyPay: row.hourlyPay,
          overtimePay: row.overtimePay,
          allowance: row.allowance,
          referralReward: row.referralReward,
          socialSecurityDeduction: row.socialSecurityDeduction,
          otherDeduction: row.otherDeduction,
          notes: row.notes,
          status: SalarySlipStatus.DRAFT,
          publishedAt: null,
          withdrawnAt: null
        }
      });
    }
    const updated = await tx.salaryImportBatch.update({
      where: { id: batch.id },
      data: { status: batch.skippedRows ? ImportStatus.PARTIAL : ImportStatus.COMMITTED }
    });
    await writeAudit(tx, request, {
      action: "SALARY_IMPORT_COMMIT",
      resourceType: "SalaryImportBatch",
      resourceId: batch.id,
      after: { salaryMonth: batch.salaryMonth, acceptedRows: accepted.length, skippedRows: batch.skippedRows }
    });
    return updated;
  });
  return { batch: committed, acceptedCount: accepted.length, skipped: batch.errors };
}

async function changeSlipStatus(app: FastifyInstance, request: FastifyRequest, ids: string[], mode: "publish" | "withdraw") {
  const slips = await app.prisma.salarySlip.findMany({ where: { id: { in: ids } }, select: { id: true, personId: true, salaryMonth: true, batchId: true } });
  if (slips.length !== new Set(ids).size) throw new AppError(404, "SALARY_SLIP_NOT_FOUND", "部分工资条不存在");
  const now = new Date();
  const status = mode === "publish" ? SalarySlipStatus.PUBLISHED : SalarySlipStatus.WITHDRAWN;
  const count = await app.prisma.$transaction(async (tx) => {
    const updated = await tx.salarySlip.updateMany({
      where: { id: { in: ids } },
      data: mode === "publish"
        ? { status, publishedAt: now, withdrawnAt: null }
        : { status, withdrawnAt: now }
    });
    const batchIds = [...new Set(slips.map((slip) => slip.batchId))];
    const batches = await tx.salaryImportBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true, status: true } });
    for (const batch of batches) {
      const publishedCount = await tx.salarySlip.count({ where: { batchId: batch.id, status: SalarySlipStatus.PUBLISHED } });
      await tx.salaryImportBatch.update({
        where: { id: batch.id },
        data: mode === "publish"
          ? {
              status: batch.status === ImportStatus.PREVIEW ? ImportStatus.COMMITTED : batch.status,
              publishedAt: now,
              withdrawnAt: null
            }
          : {
              status: batch.status === ImportStatus.PREVIEW ? ImportStatus.COMMITTED : batch.status,
              withdrawnAt: publishedCount === 0 ? now : null
            }
      });
    }
    if (mode === "publish") {
      const users = await tx.user.findMany({ where: { personId: { in: slips.map((slip) => slip.personId) }, isActive: true }, select: { id: true, personId: true } });
      const configured = Boolean(app.config.WECHAT_OFFICIAL_APP_ID && app.config.WECHAT_OFFICIAL_APP_SECRET && app.config.WECHAT_TEMPLATE_SALARY_PUBLISHED);
      await tx.notification.createMany({
        data: users.flatMap((user) => slips
          .filter((slip) => slip.personId === user.personId)
          .map((slip) => ({
            recipientUserId: user.id,
            type: "SALARY_SLIP_PUBLISHED",
            title: "工资条已发布",
            content: "请进入小程序查看本人工资条",
            targetPath: "/pages/salary/index/index",
            dedupeKey: `SALARY_SLIP_PUBLISHED:${slip.id}:${user.id}`,
            status: configured ? NotificationStatus.PENDING : NotificationStatus.SKIPPED_NOT_CONFIGURED,
            lastError: configured ? null : "微信公众号模板消息未配置，工资条已发布但未外发提醒"
          }))),
        skipDuplicates: true
      });
    }
    await writeAudit(tx, request, {
      action: mode === "publish" ? "SALARY_SLIPS_PUBLISH" : "SALARY_SLIPS_WITHDRAW",
      resourceType: "SalarySlip",
      after: { ids, count: updated.count }
    });
    return updated.count;
  });
  return count;
}

export async function salaryRoutes(app: FastifyInstance): Promise<void> {
  const guards = [app.authenticate, app.requirePermission(Permission.SALARY_MANAGE)];

  app.get("/salary-slips/template", { preHandler: guards }, async (_request, reply) => reply
    .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent("工资条导入模板.xlsx")}`)
    .send(createSalaryTemplate()));

  app.post("/salary-slips/import-preview", { preHandler: guards }, async (request) => {
    const body = await importBody(request);
    const { batch, preview } = await stagePreview(app, request, body);
    return success(request, {
      importId: batch.id,
      sourceFile: body.sourceFile,
      sourceHash: body.sourceHash,
      salaryMonth: preview.salaryMonth,
      totalRows: body.rows.length,
      accepted: preview.accepted,
      skipped: preview.skipped,
      warnings: [],
      reconciliation: { accepted: preview.accepted.length, skipped: preview.skipped.length }
    });
  });

  app.post("/salary-slips/import-commit", { preHandler: guards }, async (request) => {
    const staged = stagedCommitSchema.safeParse(request.body);
    if (!staged.success) throw new AppError(400, "IMPORT_PREVIEW_REQUIRED", "请先上传工资条预览，再使用 importId 和 sourceHash 提交");
    return success(request, await commitStaged(app, request, staged.data.importId, staged.data.sourceHash));
  });

  app.get("/salary-slips", { preHandler: guards }, async (request) => {
    const query = salaryQuerySchema.parse(request.query);
    const { page, pageSize, skip } = parsePagination(query);
    const where = salaryWhere(query);
    const [items, total] = await app.prisma.$transaction([
      app.prisma.salarySlip.findMany({
        where,
        include: { person: { select: { id: true, name: true, employeeNo: true, project: { select: { id: true, name: true } } } }, batch: true },
        orderBy: [{ salaryMonth: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize
      }),
      app.prisma.salarySlip.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.get("/salary-slips/export", { preHandler: guards }, async (request, reply) => {
    const query = salaryQuerySchema.parse(request.query);
    const rows = await app.prisma.salarySlip.findMany({
      where: salaryWhere(query),
      include: { person: { select: { name: true, idCard: true, employeeNo: true } } },
      orderBy: [{ salaryMonth: "desc" }, { createdAt: "desc" }],
      take: 10000
    });
    const buffer = exportSalaryWorkbook(rows.map((row) => ({
      personName: row.person.name,
      idCard: row.person.idCard,
      employeeNo: row.person.employeeNo,
      salaryMonth: row.salaryMonth,
      grossPay: row.grossPay.toString(),
      netPay: row.netPay.toString(),
      hourlyPay: row.hourlyPay.toString(),
      overtimePay: row.overtimePay.toString(),
      allowance: row.allowance.toString(),
      referralReward: row.referralReward.toString(),
      socialSecurityDeduction: row.socialSecurityDeduction.toString(),
      otherDeduction: row.otherDeduction.toString(),
      notes: row.notes
    })));
    return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent("工资条.xlsx")}`).send(buffer);
  });

  app.post("/salary-slips/publish", { preHandler: guards }, async (request) => {
    const { ids } = idsSchema.parse(request.body);
    return success(request, { publishedCount: await changeSlipStatus(app, request, ids, "publish") });
  });
  app.post("/salary-slips/withdraw", { preHandler: guards }, async (request) => {
    const { ids } = idsSchema.parse(request.body);
    return success(request, { withdrawnCount: await changeSlipStatus(app, request, ids, "withdraw") });
  });

  app.post("/salary-slips/:batchId/publish", { preHandler: guards }, async (request) => {
    const { batchId } = z.object({ batchId: idSchema }).parse(request.params);
    const ids = (await app.prisma.salarySlip.findMany({ where: { batchId }, select: { id: true } })).map((item) => item.id);
    if (!ids.length) notFound("工资条批次");
    return success(request, { batchId, publishedCount: await changeSlipStatus(app, request, ids, "publish") });
  });
  app.post("/salary-slips/:batchId/withdraw", { preHandler: guards }, async (request) => {
    const { batchId } = z.object({ batchId: idSchema }).parse(request.params);
    const ids = (await app.prisma.salarySlip.findMany({ where: { batchId }, select: { id: true } })).map((item) => item.id);
    if (!ids.length) notFound("工资条批次");
    return success(request, { batchId, withdrawnCount: await changeSlipStatus(app, request, ids, "withdraw") });
  });

  app.get("/salary-slips/me", { preHandler: [app.authenticate, app.requirePermission(Permission.SALARY_SELF_READ)] }, async (request) => {
    const user = getSession(request);
    if (!user.personId) throw new AppError(403, "PERSON_BINDING_REQUIRED", "账号未绑定人员档案");
    const query = z.object({ salaryMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }).parse(request.query);
    const items = await app.prisma.salarySlip.findMany({
      where: { personId: user.personId, status: SalarySlipStatus.PUBLISHED, salaryMonth: query.salaryMonth },
      orderBy: { salaryMonth: "desc" }
    });
    return success(request, items);
  });
}
