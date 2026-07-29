import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { buffer as streamToBuffer } from "node:stream/consumers";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  DataScopeType,
  Permission,
  idSchema,
  isWithinDataScope,
  type Permission as PermissionValue,
  type SessionUser
} from "@xiangneng/shared";
import { z } from "zod";
import { writeAudit } from "../audit.js";
import { authorizationForAnyPermission, authorizationForPermission } from "../authorization.js";
import {
  andWhere,
  reimbursementWhere
} from "../data-scope.js";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import {
  ReimbursementStatus,
  assertFinalPaymentProof,
  assertReimbursementApprovalLimit,
  buildReimbursementArtifactPlan,
  normalizeEmployeeReimbursementScope,
  reimbursementAttachmentUploadAuthorization,
  summarizeReimbursement,
  transitionReimbursement,
  validateReimbursementLine,
  type ReimbursementStatus as ReimbursementStatusValue,
  type TransitionPermission
} from "../services/reimbursements.js";
import {
  createReimbursementWorkbook,
  createStoredZip
} from "../services/reimbursement-artifacts.js";
import {
  buildDepartmentSummaries,
  buildPaymentRoster,
  validateDepartmentBatchSelection,
  validateReimbursementSubmission
} from "../services/reimbursement-automation.js";

const reimbursementStatuses = [
  "PENDING_SUBMISSION",
  "DEPARTMENT_PREPARING",
  "OWNER_REVIEWING",
  "FINANCE_REVIEWING",
  "APPROVED",
  "PENDING_PAYMENT",
  "PAID"
] as const;
const statusSchema = z.enum(reimbursementStatuses);
const querySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  keyword: z.string().trim().max(120).optional(),
  status: statusSchema.optional(),
  branchId: idSchema.optional(),
  organizationUnitId: idSchema.optional(),
  projectId: idSchema.optional(),
  supplierId: idSchema.optional()
});
const lineSchema = z.object({
  sequence: z.number().int().positive(),
  expenseDate: z.coerce.date(),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  payeeName: z.string().trim().max(120).optional().nullable(),
  payeeAccount: z.string().trim().max(120).optional().nullable(),
  payeeBank: z.string().trim().max(200).optional().nullable(),
  paymentCents: z.number().int().positive(),
  invoiceCents: z.number().int().positive()
});
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  branchId: idSchema.optional().nullable(),
  organizationUnitId: idSchema.optional().nullable(),
  projectId: idSchema.optional().nullable(),
  supplierId: idSchema.optional().nullable(),
  lines: z.array(lineSchema).min(1).max(200)
});
const patchSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  lines: z.array(lineSchema).min(1).max(200).optional()
}).refine((value) => value.title !== undefined || value.lines !== undefined, {
  message: "至少修改一个字段"
});
const transitionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  targetStatus: statusSchema,
  comment: z.string().trim().max(500).optional(),
  approvedAmountCents: z.number().int().positive().optional()
});
const issueSchema = z.object({
  lineId: idSchema.optional().nullable(),
  type: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500)
});
const resolveIssueSchema = z.object({
  resolution: z.string().trim().min(1).max(500)
});
const paymentSchema = z.object({
  expectedVersion: z.number().int().positive(),
  amountCents: z.number().int().positive(),
  reference: z.string().trim().min(1).max(120),
  paidAt: z.coerce.date(),
  proofAttachmentId: idSchema
});
const attachmentQuerySchema = z.object({
  type: z.enum(["PAYMENT_VOUCHER", "INVOICE", "SUPPORTING"]),
  lineId: idSchema.optional()
});
const artifactSchema = z.object({
  type: z.enum([
    "REIMBURSEMENT_FORM",
    "PAYMENT_PACKAGE",
    "INVOICE_PACKAGE"
  ])
});
const summaryQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  organizationUnitId: idSchema.optional()
});
const departmentTransitionSchema = z.object({
  batchIds: z.array(idSchema).min(1).max(500),
  targetStatus: z.enum([
    "OWNER_REVIEWING",
    "FINANCE_REVIEWING",
    "APPROVED",
    "PENDING_PAYMENT"
  ]),
  comment: z.string().trim().max(500).optional(),
  approvedAmounts: z.array(z.object({
    batchId: idSchema,
    approvedAmountCents: z.number().int().positive()
  })).max(500).optional()
});

function monthRange(period: string | undefined): { gte?: Date; lt?: Date } | undefined {
  if (!period) return undefined;
  const [year, month] = period.split("-").map(Number);
  const gte = new Date(Date.UTC(year, month - 1, 1));
  const lt = new Date(Date.UTC(year, month, 1));
  return { gte, lt };
}

const listInclude = {
  applicant: { select: { id: true, displayName: true } },
  branch: { select: { id: true, name: true } },
  organizationUnit: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  issues: {
    where: { status: "OPEN" as const },
    select: { id: true, status: true }
  },
  _count: { select: { lines: true, issues: true, attachments: true } }
};
const detailInclude = {
  ...listInclude,
  attachments: { orderBy: { createdAt: "asc" as const } },
  lines: {
    include: { attachments: { orderBy: { createdAt: "asc" as const } } },
    orderBy: { sequence: "asc" as const }
  },
  issues: {
    include: {
      raisedBy: { select: { id: true, displayName: true } },
      resolvedBy: { select: { id: true, displayName: true } }
    },
    orderBy: { createdAt: "desc" as const }
  },
  approvals: {
    include: { actor: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "asc" as const }
  },
  payment: true,
  artifacts: { orderBy: { type: "asc" as const } }
};

const allowedAttachmentExtensions =
  /\.(pdf|png|jpe?g|webp|docx?|xlsx?)$/i;
const allowedAttachmentMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream"
]);

const readPermissions: readonly PermissionValue[] = [
  Permission.REIMBURSEMENT_SELF,
  Permission.REIMBURSEMENT_MANAGE,
  Permission.REIMBURSEMENT_APPROVE,
  Permission.REIMBURSEMENT_FINANCE_REVIEW,
  Permission.REIMBURSEMENT_PAY,
  Permission.REIMBURSEMENT_EXPORT
];

function requireAnyPermission(permissions: readonly PermissionValue[]) {
  return async (request: FastifyRequest): Promise<void> => {
    const user = getSession(request);
    if (!permissions.some((permission) => user.permissions.includes(permission))) {
      throw new AppError(403, "FORBIDDEN", "当前账号没有报销业务权限");
    }
  };
}

function scopeContext(user: SessionUser) {
  return {
    userId: user.id,
    roles: user.roles,
    bindings: user.scopeBindings.map((binding) => ({
      type: binding.type,
      entityId:
        binding.type === DataScopeType.BRANCH
          ? binding.branchId
          : binding.type === DataScopeType.PROJECT
            ? binding.projectId
            : binding.type === DataScopeType.SUPPLIER
              ? binding.supplierId
              : binding.organizationUnitId
    }))
  };
}

type ReimbursementCreateScope = Pick<
  z.infer<typeof createSchema>,
  "branchId" | "organizationUnitId" | "projectId" | "supplierId"
>;

function normalizeManagedCreateScope(
  user: SessionUser,
  input: ReimbursementCreateScope
): ReimbursementCreateScope {
  if (
    !isWithinDataScope(scopeContext(user), {
      ownerUserId: user.id,
      orgUnitIds: input.organizationUnitId ? [input.organizationUnitId] : [],
      branchId: input.branchId,
      projectId: input.projectId,
      supplierId: input.supplierId
    })
  ) {
    throw new AppError(403, "OUT_OF_SCOPE", "报销单不在当前账号的数据范围内");
  }
  return input;
}

function transitionPermission(
  target: ReimbursementStatusValue,
  user: SessionUser,
  applicantUserId: string
): TransitionPermission {
  if (target === ReimbursementStatus.DEPARTMENT_PREPARING) {
    if (
      applicantUserId === user.id &&
      user.permissions.includes(Permission.REIMBURSEMENT_SELF)
    ) {
      return Permission.REIMBURSEMENT_SELF;
    }
    return Permission.REIMBURSEMENT_MANAGE;
  }
  if (target === ReimbursementStatus.OWNER_REVIEWING) {
    return Permission.REIMBURSEMENT_MANAGE;
  }
  if (target === ReimbursementStatus.FINANCE_REVIEWING) {
    return Permission.REIMBURSEMENT_APPROVE;
  }
  if (
    target === ReimbursementStatus.APPROVED ||
    target === ReimbursementStatus.PENDING_PAYMENT
  ) {
    return Permission.REIMBURSEMENT_FINANCE_REVIEW;
  }
  if (target === ReimbursementStatus.PAID) {
    return Permission.REIMBURSEMENT_PAY;
  }
  throw new AppError(400, "INVALID_REIMBURSEMENT_TRANSITION", "不支持回退到该报销状态");
}

async function scopedBatch(
  app: FastifyInstance,
  user: SessionUser,
  id: string
) {
  const batch = await app.prisma.reimbursementBatch.findFirst({
    where: andWhere(reimbursementWhere(user), { id }),
    include: detailInclude
  });
  if (!batch) notFound("报销单");
  return batch;
}

function nextCode(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `BX-${date}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export async function reimbursementRoutes(app: FastifyInstance): Promise<void> {
  app.get("/reimbursements", {
    preHandler: [app.authenticate, requireAnyPermission(readPermissions)]
  }, async (request) => {
    const query = querySchema.parse(request.query);
    const user = authorizationForAnyPermission(getSession(request), readPermissions);
    const { page, pageSize, skip } = parsePagination(query);
    const where = andWhere(reimbursementWhere(user), {
      status: query.status,
      branchId: query.branchId,
      organizationUnitId: query.organizationUnitId,
      projectId: query.projectId,
      supplierId: query.supplierId,
      OR: query.keyword
        ? [
            { code: { contains: query.keyword, mode: "insensitive" as const } },
            { title: { contains: query.keyword, mode: "insensitive" as const } },
            {
              applicant: {
                displayName: { contains: query.keyword, mode: "insensitive" as const }
              }
            }
          ]
        : undefined
    });
    const [items, total] = await app.prisma.$transaction([
      app.prisma.reimbursementBatch.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      app.prisma.reimbursementBatch.count({ where })
    ]);
    return success(request, {
      items,
      pagination: paginationMeta(page, pageSize, total)
    });
  });

  app.get("/reimbursements/department-summaries", {
    preHandler: [
      app.authenticate,
      requireAnyPermission([
        Permission.REIMBURSEMENT_MANAGE,
        Permission.REIMBURSEMENT_APPROVE,
        Permission.REIMBURSEMENT_FINANCE_REVIEW,
        Permission.REIMBURSEMENT_EXPORT
      ])
    ]
  }, async (request) => {
    const query = summaryQuerySchema.parse(request.query);
    const user = authorizationForAnyPermission(getSession(request), [
      Permission.REIMBURSEMENT_MANAGE,
      Permission.REIMBURSEMENT_APPROVE,
      Permission.REIMBURSEMENT_FINANCE_REVIEW,
      Permission.REIMBURSEMENT_EXPORT
    ]);
    const batches = await app.prisma.reimbursementBatch.findMany({
      where: andWhere(reimbursementWhere(user), {
        organizationUnitId: query.organizationUnitId ?? { not: null },
        status: { not: "PENDING_SUBMISSION" },
        submittedAt: monthRange(query.period)
      }),
      select: {
        id: true,
        code: true,
        organizationUnitId: true,
        organizationUnit: { select: { name: true } },
        applicantUserId: true,
        applicant: { select: { displayName: true } },
        status: true,
        totalPaymentCents: true,
        approvedAmountCents: true,
        totalInvoiceCents: true,
        submittedAt: true,
        createdAt: true,
        issues: { where: { status: "OPEN" }, select: { id: true } },
        lines: {
          select: {
            id: true,
            sequence: true,
            expenseDate: true,
            category: true,
            description: true,
            paymentCents: true,
            invoiceCents: true
          },
          orderBy: { sequence: "asc" }
        }
      },
      orderBy: [{ createdAt: "desc" }, { code: "asc" }]
    });
    return success(request, buildDepartmentSummaries(batches.map((batch) => ({
      id: batch.id,
      code: batch.code,
      organizationUnitId: batch.organizationUnitId,
      organizationUnitName: batch.organizationUnit?.name ?? null,
      applicantUserId: batch.applicantUserId,
      applicantName: batch.applicant.displayName,
      status: batch.status,
      totalPaymentCents: batch.totalPaymentCents,
      approvedAmountCents: batch.approvedAmountCents,
      totalInvoiceCents: batch.totalInvoiceCents,
      openIssueCount: batch.issues.length,
      createdAt: batch.submittedAt ?? batch.createdAt,
      lines: batch.lines
    }))));
  });

  app.get("/reimbursements/payment-roster", {
    preHandler: [
      app.authenticate,
      requireAnyPermission([
        Permission.REIMBURSEMENT_FINANCE_REVIEW,
        Permission.REIMBURSEMENT_PAY,
        Permission.REIMBURSEMENT_EXPORT
      ])
    ]
  }, async (request) => {
    const query = summaryQuerySchema.parse(request.query);
    const user = authorizationForAnyPermission(getSession(request), [
      Permission.REIMBURSEMENT_FINANCE_REVIEW,
      Permission.REIMBURSEMENT_PAY,
      Permission.REIMBURSEMENT_EXPORT
    ]);
    const batches = await app.prisma.reimbursementBatch.findMany({
      where: andWhere(reimbursementWhere(user), {
        status: { in: ["APPROVED", "PENDING_PAYMENT", "PAID"] },
        organizationUnitId: query.organizationUnitId,
        submittedAt: monthRange(query.period)
      }),
      select: {
        id: true,
        code: true,
        organizationUnitId: true,
        organizationUnit: { select: { name: true } },
        applicantUserId: true,
        applicant: {
          select: {
            displayName: true,
            internalEmployee: { select: { bankAccount: true } }
          }
        },
        status: true,
        totalPaymentCents: true,
        approvedAmountCents: true,
        createdAt: true,
        lines: {
          select: { payeeAccount: true, payeeBank: true },
          orderBy: { sequence: "asc" },
          take: 1
        },
        payment: { select: { amountCents: true, paidAt: true, reference: true } }
      },
      orderBy: [{ organizationUnitId: "asc" }, { createdAt: "asc" }]
    });
    return success(request, buildPaymentRoster(batches.map((batch) => ({
      id: batch.id,
      code: batch.code,
      organizationUnitId: batch.organizationUnitId,
      organizationUnitName: batch.organizationUnit?.name ?? null,
      applicantUserId: batch.applicantUserId,
      applicantName: batch.applicant.displayName,
      payeeAccount: batch.lines[0]?.payeeAccount ?? batch.applicant.internalEmployee?.bankAccount ?? null,
      payeeBank: batch.lines[0]?.payeeBank ?? null,
      status: batch.status,
      totalPaymentCents: batch.totalPaymentCents,
      approvedAmountCents: batch.approvedAmountCents,
      createdAt: batch.createdAt,
      payment: batch.payment
    }))));
  });

  app.post("/reimbursements/department-summaries/transition", {
    preHandler: [app.authenticate, requireAnyPermission(readPermissions)]
  }, async (request) => {
    const input = departmentTransitionSchema.parse(request.body);
    const session = getSession(request);
    const candidateUser = authorizationForAnyPermission(session, readPermissions);
    const batches = await app.prisma.reimbursementBatch.findMany({
      where: andWhere(reimbursementWhere(candidateUser), { id: { in: input.batchIds } }),
      include: { issues: { where: { status: "OPEN" }, select: { id: true } } },
      orderBy: { code: "asc" }
    });
    if (batches.length !== new Set(input.batchIds).size) {
      throw new AppError(404, "REIMBURSEMENT_BATCH_NOT_FOUND", "部分报销单不存在或不在当前数据范围内");
    }
    const selection = validateDepartmentBatchSelection(
      batches.map((batch) => ({
        id: batch.id,
        organizationUnitId: batch.organizationUnitId,
        createdAt: batch.submittedAt ?? batch.createdAt
      }))
    );
    if (!selection.valid) {
      throw new AppError(400, selection.code, selection.message);
    }
    const permission = transitionPermission(input.targetStatus, session, batches[0]!.applicantUserId);
    const user = authorizationForPermission(session, permission);
    const approvedAmounts = new Map(
      (input.approvedAmounts ?? []).map((item) => [item.batchId, item.approvedAmountCents])
    );
    if (input.targetStatus !== ReimbursementStatus.APPROVED && approvedAmounts.size) {
      throw new AppError(400, "APPROVED_AMOUNT_NOT_ALLOWED", "只有财务审核通过时才能填写审核通过金额");
    }
    if ([...approvedAmounts.keys()].some((batchId) => !input.batchIds.includes(batchId))) {
      throw new AppError(400, "APPROVED_AMOUNT_BATCH_MISMATCH", "审核金额包含不属于当前部门汇总的报销单");
    }
    const updated = await app.prisma.$transaction(async (tx) => {
      const values = [];
      for (const batch of batches) {
        values.push(await transitionReimbursement(tx, {
          batchId: batch.id,
          actorId: user.id,
          expectedVersion: batch.version,
          targetStatus: input.targetStatus,
          permission,
          comment: input.comment,
          approvedAmountCents: approvedAmounts.get(batch.id)
        }));
      }
      return values;
    });
    return success(request, { updatedCount: updated.length, items: updated });
  });

  app.get("/reimbursements/:id", {
    preHandler: [app.authenticate, requireAnyPermission(readPermissions)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = authorizationForAnyPermission(getSession(request), readPermissions);
    return success(request, await scopedBatch(app, user, id));
  });

  app.post("/reimbursements", {
    preHandler: [
      app.authenticate,
      requireAnyPermission([
        Permission.REIMBURSEMENT_SELF,
        Permission.REIMBURSEMENT_MANAGE
      ])
    ]
  }, async (request, reply) => {
    const input = createSchema.parse(request.body);
    const session = getSession(request);
    const createPermission = session.permissions.includes(Permission.REIMBURSEMENT_SELF)
      ? Permission.REIMBURSEMENT_SELF
      : Permission.REIMBURSEMENT_MANAGE;
    const user = authorizationForPermission(session, createPermission);
    input.lines.forEach(validateReimbursementLine);
    const { lineCount: _lineCount, ...summary } =
      summarizeReimbursement(input.lines);
    const createScope = createPermission === Permission.REIMBURSEMENT_SELF
      ? normalizeEmployeeReimbursementScope(
          input,
          await app.prisma.internalEmployee.findFirst({
            where: { userId: user.id, status: "ACTIVE" },
            select: { organizationUnitId: true }
          }).then((employee) => {
            if (!employee) {
              throw new AppError(409, "INTERNAL_EMPLOYEE_PROFILE_REQUIRED", "发起报销前请先绑定有效的内部员工档案");
            }
            return employee;
          })
        )
      : normalizeManagedCreateScope(user, input);
    const created = await app.prisma.$transaction(async (tx) => {
      const batch = await tx.reimbursementBatch.create({
        data: {
          code: nextCode(),
          title: input.title,
          applicantUserId: user.id,
          branchId: createScope.branchId,
          organizationUnitId: createScope.organizationUnitId,
          projectId: createScope.projectId,
          supplierId: createScope.supplierId,
          ...summary,
          lines: {
            create: input.lines.map((line) => ({
              ...line,
              expenseDate: line.expenseDate
            }))
          }
        },
        include: detailInclude
      });
      await writeAudit(tx, request, {
        action: "reimbursement.create",
        resourceType: "ReimbursementBatch",
        resourceId: batch.id,
        after: {
          code: batch.code,
          status: batch.status,
          totalPaymentCents: batch.totalPaymentCents,
          totalInvoiceCents: batch.totalInvoiceCents,
          invoiceExcessCents: batch.invoiceExcessCents,
          branchId: batch.branchId,
          organizationUnitId: batch.organizationUnitId,
          projectId: batch.projectId,
          supplierId: batch.supplierId
        }
      });
      return batch;
    });
    return reply.status(201).send(success(request, created));
  });

  app.patch("/reimbursements/:id", {
    preHandler: [
      app.authenticate,
      requireAnyPermission([
        Permission.REIMBURSEMENT_SELF,
        Permission.REIMBURSEMENT_MANAGE
      ])
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = patchSchema.parse(request.body);
    const session = getSession(request);
    const candidateUser = authorizationForAnyPermission(session, [
      Permission.REIMBURSEMENT_SELF,
      Permission.REIMBURSEMENT_MANAGE
    ]);
    let before = await scopedBatch(app, candidateUser, id);
    const editPermission = before.applicantUserId === session.id &&
      session.permissions.includes(Permission.REIMBURSEMENT_SELF)
      ? Permission.REIMBURSEMENT_SELF
      : Permission.REIMBURSEMENT_MANAGE;
    const user = authorizationForPermission(session, editPermission);
    before = await scopedBatch(app, user, id);
    if (
      before.status !== ReimbursementStatus.PENDING_SUBMISSION &&
      before.status !== ReimbursementStatus.DEPARTMENT_PREPARING
    ) {
      throw new AppError(409, "REIMBURSEMENT_LOCKED", "报销单已进入审核，不能修改明细");
    }
    if (
      before.applicantUserId !== user.id &&
      !user.permissions.includes(Permission.REIMBURSEMENT_MANAGE)
    ) {
      throw new AppError(403, "FORBIDDEN", "只能修改自己的报销单");
    }
    if (before.version !== input.expectedVersion) {
      throw new AppError(409, "STALE_REIMBURSEMENT_VERSION", "报销单已更新，请刷新后重试");
    }
    if (
      input.lines &&
      (before.attachments.length > 0 || before.issues.length > 0)
    ) {
      throw new AppError(
        409,
        "REIMBURSEMENT_LINES_HAVE_DEPENDENCIES",
        "已有附件或问题记录时不能整体替换明细，可新建报销单或先处理关联材料"
      );
    }
    input.lines?.forEach(validateReimbursementLine);
    const summary = input.lines
      ? (() => {
          const { lineCount: _lineCount, ...totals } =
            summarizeReimbursement(input.lines);
          return totals;
        })()
      : {
          totalPaymentCents: before.totalPaymentCents,
          totalInvoiceCents: before.totalInvoiceCents,
          invoiceExcessCents: before.invoiceExcessCents
        };
    const updated = await app.prisma.$transaction(async (tx) => {
      const value = await tx.reimbursementBatch.update({
        where: {
          id_version: { id, version: input.expectedVersion }
        },
        data: {
          title: input.title,
          ...summary,
          version: { increment: 1 },
          lines: input.lines
            ? {
                deleteMany: {},
                create: input.lines
              }
            : undefined
        },
        include: detailInclude
      });
      await writeAudit(tx, request, {
        action: "reimbursement.update",
        resourceType: "ReimbursementBatch",
        resourceId: id,
        before: {
          title: before.title,
          totalPaymentCents: before.totalPaymentCents,
          totalInvoiceCents: before.totalInvoiceCents,
          version: before.version
        },
        after: {
          title: value.title,
          totalPaymentCents: value.totalPaymentCents,
          totalInvoiceCents: value.totalInvoiceCents,
          version: value.version
        }
      });
      return value;
    });
    return success(request, updated);
  });

  app.post("/reimbursements/:id/transition", {
    preHandler: [app.authenticate, requireAnyPermission(readPermissions)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = transitionSchema.parse(request.body);
    const session = getSession(request);
    const candidateUser = authorizationForAnyPermission(session, readPermissions);
    let before = await scopedBatch(app, candidateUser, id);
    const permission = transitionPermission(input.targetStatus, session, before.applicantUserId);
    const user = authorizationForPermission(session, permission);
    before = await scopedBatch(app, user, id);
    if (!user.permissions.includes(permission)) {
      throw new AppError(403, "FORBIDDEN", "当前账号不能执行该报销流转");
    }
    if (
      before.status === ReimbursementStatus.PENDING_SUBMISSION &&
      input.targetStatus === ReimbursementStatus.DEPARTMENT_PREPARING
    ) {
      const invoiceHashes = before.attachments
        .filter((attachment) => attachment.type === "INVOICE")
        .map((attachment) => attachment.sha256);
      const duplicateRows = invoiceHashes.length
        ? await app.prisma.reimbursementAttachment.findMany({
            where: {
              batchId: { not: id },
              type: "INVOICE",
              sha256: { in: invoiceHashes }
            },
            select: { sha256: true }
          })
        : [];
      const validation = validateReimbursementSubmission({
        lines: before.lines.map((line) => ({
          id: line.id,
          sequence: line.sequence,
          paymentCents: line.paymentCents,
          invoiceCents: line.invoiceCents
        })),
        attachments: before.attachments.map((attachment) => ({
          id: attachment.id,
          lineId: attachment.lineId,
          type: attachment.type,
          sha256: attachment.sha256
        })),
        existingInvoiceHashes: new Set(duplicateRows.map((row) => row.sha256))
      });
      if (!validation.valid) {
        throw new AppError(
          409,
          "REIMBURSEMENT_AUTOMATIC_VALIDATION_FAILED",
          "系统自动校验未通过，请按提示补齐或修正材料",
          { issues: validation.issues }
        );
      }
    }
    if (permission === Permission.REIMBURSEMENT_APPROVE) {
      const approver = await app.prisma.internalEmployee.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
        select: {
          jobGrade: {
            select: {
              reimbursementApprovalPolicy: {
                select: { maxReimbursementApprovalCents: true, isActive: true }
              }
            }
          }
        }
      });
      const policy = approver?.jobGrade?.reimbursementApprovalPolicy;
      assertReimbursementApprovalLimit(
        before.totalPaymentCents,
        policy?.isActive ? policy.maxReimbursementApprovalCents : null
      );
    }
    const updated = await app.prisma.$transaction(async (tx) => {
      const value = await transitionReimbursement(tx, {
        batchId: id,
        actorId: user.id,
        expectedVersion: input.expectedVersion,
        targetStatus: input.targetStatus,
        permission,
        comment: input.comment,
        approvedAmountCents: input.approvedAmountCents
      });
      await writeAudit(tx, request, {
        action: "reimbursement.transition",
        resourceType: "ReimbursementBatch",
        resourceId: id,
        before: { status: before.status, version: before.version },
        after: {
          status: input.targetStatus,
          version: input.expectedVersion + 1,
          comment: input.comment ?? null
        }
      });
      return value;
    });
    return success(request, updated);
  });

  app.post("/reimbursements/:id/attachments", {
    preHandler: [
      app.authenticate,
      requireAnyPermission([
        Permission.REIMBURSEMENT_SELF,
        Permission.REIMBURSEMENT_MANAGE,
        Permission.REIMBURSEMENT_PAY
      ])
    ]
  }, async (request, reply) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const query = attachmentQuerySchema.parse(request.query);
    const session = getSession(request);
    const candidateUser = authorizationForAnyPermission(session, [
      Permission.REIMBURSEMENT_SELF,
      Permission.REIMBURSEMENT_MANAGE,
      Permission.REIMBURSEMENT_PAY
    ]);
    let batch = await scopedBatch(app, candidateUser, id);
    const uploadAccess = reimbursementAttachmentUploadAuthorization({
      status: batch.status,
      applicantUserId: batch.applicantUserId,
      userId: session.id,
      permissions: session.permissions,
      type: query.type,
      lineId: query.lineId,
      openIssueCount: batch.issues.filter((issue) => issue.status === "OPEN").length
    });
    if (!uploadAccess) {
      throw new AppError(
        409,
        "REIMBURSEMENT_ATTACHMENTS_LOCKED",
        "当前报销节点不允许上传该类型材料"
      );
    }
    const user = authorizationForPermission(session, uploadAccess.permission);
    batch = await scopedBatch(app, user, id);
    const isFinalPaymentProof = uploadAccess.mode === "FINAL_PAYMENT_PROOF";
    if (query.lineId && !batch.lines.some((line) => line.id === query.lineId)) {
      notFound("报销明细");
    }
    if (query.type !== "SUPPORTING" && !query.lineId && !isFinalPaymentProof) {
      throw new AppError(
        400,
        "REIMBURSEMENT_LINE_REQUIRED",
        "报销阶段的付款凭证和发票必须关联到具体报销明细"
      );
    }
    const upload = await request.file();
    if (!upload) {
      throw new AppError(400, "FILE_REQUIRED", "请选择要上传的报销材料");
    }
    if (
      !allowedAttachmentExtensions.test(upload.filename) ||
      !allowedAttachmentMimeTypes.has(upload.mimetype)
    ) {
      upload.file.resume();
      throw new AppError(
        400,
        "INVALID_REIMBURSEMENT_FILE_TYPE",
        "报销材料仅支持 PDF、图片、Word 和 Excel"
      );
    }
    const saved = await app.fileStore.save({
      stream: upload.file,
      filename: upload.filename,
      mimeType: upload.mimetype
    });
    try {
      const attachment = await app.prisma.$transaction(async (tx) => {
        const created = await tx.reimbursementAttachment.create({
          data: {
            batchId: id,
            lineId: query.lineId,
            type: query.type,
            storageKey: saved.storageKey,
            originalName: saved.originalName,
            mimeType: saved.mimeType,
            sizeBytes: saved.sizeBytes,
            sha256: saved.sha256,
            uploadedById: user.id
          }
        });
        await writeAudit(tx, request, {
          action: "reimbursement.attachment.upload",
          resourceType: "ReimbursementAttachment",
          resourceId: created.id,
          after: {
            batchId: id,
            lineId: created.lineId,
            type: created.type,
            originalName: created.originalName,
            sizeBytes: created.sizeBytes,
            sha256: created.sha256
          }
        });
        return created;
      });
      return reply.status(201).send(success(request, attachment));
    } catch (error) {
      await app.fileStore.remove(saved.storageKey);
      throw error;
    }
  });

  app.get("/reimbursements/:id/attachments/:attachmentId", {
    preHandler: [app.authenticate, requireAnyPermission(readPermissions)]
  }, async (request, reply) => {
    const { id, attachmentId } = z.object({
      id: idSchema,
      attachmentId: idSchema
    }).parse(request.params);
    const user = authorizationForAnyPermission(getSession(request), readPermissions);
    await scopedBatch(app, user, id);
    const attachment = await app.prisma.reimbursementAttachment.findFirst({
      where: { id: attachmentId, batchId: id }
    });
    if (!attachment) notFound("报销附件");
    return reply
      .type(attachment.mimeType)
      .header(
        "content-disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`
      )
      .send(await app.fileStore.open(attachment.storageKey));
  });

  app.post("/reimbursements/:id/artifacts/generate", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.REIMBURSEMENT_EXPORT)
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = artifactSchema.parse(request.body);
    const user = authorizationForPermission(
      getSession(request),
      Permission.REIMBURSEMENT_EXPORT
    );
    const batch = await scopedBatch(app, user, id);
    if (
      batch.status !== ReimbursementStatus.APPROVED &&
      batch.status !== ReimbursementStatus.PENDING_PAYMENT &&
      batch.status !== ReimbursementStatus.PAID
    ) {
      throw new AppError(409, "REIMBURSEMENT_NOT_APPROVED", "报销单审核通过后才能生成最终材料");
    }
    const existing = batch.artifacts.find((artifact) => artifact.type === input.type);
    await app.prisma.reimbursementArtifact.upsert({
      where: { batchId_type: { batchId: id, type: input.type } },
      create: {
        batchId: id,
        type: input.type,
        status: "PENDING",
        generatedById: user.id
      },
      update: {
        status: "PENDING",
        error: null,
        generatedById: user.id
      }
    });
    let saved: Awaited<ReturnType<typeof app.fileStore.save>> | undefined;
    try {
      let content: Buffer;
      let fileName: string;
      let mimeType: string;
      if (input.type === "REIMBURSEMENT_FORM") {
        content = createReimbursementWorkbook({
          code: batch.code,
          title: batch.title,
          status: batch.status,
          applicantName: batch.applicant.displayName,
          branchName: batch.branch?.name,
          organizationUnitName: batch.organizationUnit?.name,
          totalPaymentCents: batch.totalPaymentCents,
          totalInvoiceCents: batch.totalInvoiceCents,
          invoiceExcessCents: batch.invoiceExcessCents,
          lines: batch.lines
        });
        fileName = `${batch.code}-报销单.xlsx`;
        mimeType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else {
        const plan = buildReimbursementArtifactPlan({
          id: batch.id,
          code: batch.code,
          lines: batch.lines
        }).find((candidate) => candidate.type === input.type);
        if (!plan) {
          throw new AppError(500, "ARTIFACT_PLAN_MISSING", "报销材料计划生成失败");
        }
        const attachmentsById = new Map(
          batch.attachments.map((attachment) => [attachment.id, attachment])
        );
        const entries = [];
        for (const [index, entry] of plan.entries.entries()) {
          const prefix = String(entry.sequence).padStart(3, "0");
          if (entry.placeholder || !entry.attachmentId) {
            entries.push({
              name: `${prefix}-${input.type === "PAYMENT_PACKAGE" ? "缺少付款凭证" : "缺少发票"}.txt`,
              content: Buffer.from(entry.message ?? "材料缺失", "utf8")
            });
            continue;
          }
          const attachment = attachmentsById.get(entry.attachmentId);
          if (!attachment) {
            entries.push({
              name: `${prefix}-材料记录缺失-${index + 1}.txt`,
              content: Buffer.from("数据库附件记录不存在，请补充后重新生成。", "utf8")
            });
            continue;
          }
          const safeName = attachment.originalName.replace(/[\\/:*?"<>|]/g, "_");
          entries.push({
            name: `${prefix}-${String(index + 1).padStart(2, "0")}-${safeName}`,
            content: await streamToBuffer(await app.fileStore.open(attachment.storageKey))
          });
        }
        content = createStoredZip(entries);
        fileName = plan.fileName.replace(/\.pdf$/i, ".zip");
        mimeType = "application/zip";
      }
      saved = await app.fileStore.save({
        stream: Readable.from(content),
        filename: fileName,
        mimeType
      });
      const artifact = await app.prisma.$transaction(async (tx) => {
        const updated = await tx.reimbursementArtifact.update({
          where: { batchId_type: { batchId: id, type: input.type } },
          data: {
            status: "GENERATED",
            storageKey: saved?.storageKey,
            originalName: saved?.originalName,
            error: null,
            generatedById: user.id,
            generatedAt: new Date()
          }
        });
        await writeAudit(tx, request, {
          action: "reimbursement.artifact.generate",
          resourceType: "ReimbursementArtifact",
          resourceId: updated.id,
          after: {
            batchId: id,
            type: updated.type,
            originalName: updated.originalName,
            status: updated.status
          }
        });
        return updated;
      });
      if (existing?.storageKey && existing.storageKey !== saved.storageKey) {
        await app.fileStore.remove(existing.storageKey);
      }
      return success(request, artifact);
    } catch (error) {
      if (saved) await app.fileStore.remove(saved.storageKey);
      await app.prisma.reimbursementArtifact.update({
        where: { batchId_type: { batchId: id, type: input.type } },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : "生成失败"
        }
      });
      throw error;
    }
  });

  app.get("/reimbursements/:id/artifacts/:artifactId", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.REIMBURSEMENT_EXPORT)
    ]
  }, async (request, reply) => {
    const { id, artifactId } = z.object({
      id: idSchema,
      artifactId: idSchema
    }).parse(request.params);
    const user = authorizationForPermission(
      getSession(request),
      Permission.REIMBURSEMENT_EXPORT
    );
    await scopedBatch(app, user, id);
    const artifact = await app.prisma.reimbursementArtifact.findFirst({
      where: {
        id: artifactId,
        batchId: id,
        status: "GENERATED",
        storageKey: { not: null }
      }
    });
    if (!artifact?.storageKey || !artifact.originalName) notFound("报销生成物");
    const mimeType = artifact.type === "REIMBURSEMENT_FORM"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/zip";
    return reply
      .type(mimeType)
      .header(
        "content-disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(artifact.originalName)}`
      )
      .send(await app.fileStore.open(artifact.storageKey));
  });

  app.post("/reimbursements/:id/issues", {
    preHandler: [
      app.authenticate,
      requireAnyPermission([
        Permission.REIMBURSEMENT_MANAGE,
        Permission.REIMBURSEMENT_APPROVE,
        Permission.REIMBURSEMENT_FINANCE_REVIEW
      ])
    ]
  }, async (request, reply) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = issueSchema.parse(request.body);
    const user = authorizationForAnyPermission(getSession(request), [
      Permission.REIMBURSEMENT_MANAGE,
      Permission.REIMBURSEMENT_APPROVE,
      Permission.REIMBURSEMENT_FINANCE_REVIEW
    ]);
    await scopedBatch(app, user, id);
    const issue = await app.prisma.$transaction(async (tx) => {
      if (input.lineId) {
        const line = await tx.reimbursementLine.findFirst({
          where: { id: input.lineId, batchId: id },
          select: { id: true }
        });
        if (!line) notFound("报销明细");
      }
      const created = await tx.reimbursementIssue.create({
        data: {
          batchId: id,
          lineId: input.lineId,
          raisedById: user.id,
          type: input.type,
          description: input.description
        }
      });
      await writeAudit(tx, request, {
        action: "reimbursement.issue.create",
        resourceType: "ReimbursementIssue",
        resourceId: created.id,
        after: {
          batchId: id,
          lineId: created.lineId,
          type: created.type,
          description: created.description,
          status: created.status
        }
      });
      return created;
    });
    return reply.status(201).send(success(request, issue));
  });

  app.post("/reimbursements/:id/issues/:issueId/resolve", {
    preHandler: [
      app.authenticate,
      requireAnyPermission([
        Permission.REIMBURSEMENT_MANAGE,
        Permission.REIMBURSEMENT_APPROVE,
        Permission.REIMBURSEMENT_FINANCE_REVIEW
      ])
    ]
  }, async (request) => {
    const { id, issueId } = z.object({
      id: idSchema,
      issueId: idSchema
    }).parse(request.params);
    const input = resolveIssueSchema.parse(request.body);
    const user = authorizationForAnyPermission(getSession(request), [
      Permission.REIMBURSEMENT_MANAGE,
      Permission.REIMBURSEMENT_APPROVE,
      Permission.REIMBURSEMENT_FINANCE_REVIEW
    ]);
    await scopedBatch(app, user, id);
    const issue = await app.prisma.reimbursementIssue.findFirst({
      where: { id: issueId, batchId: id }
    });
    if (!issue) notFound("报销问题");
    if (issue.status === "RESOLVED") {
      throw new AppError(409, "ISSUE_ALREADY_RESOLVED", "该问题已经解决");
    }
    const resolved = await app.prisma.$transaction(async (tx) => {
      const value = await tx.reimbursementIssue.update({
        where: { id: issueId },
        data: {
          status: "RESOLVED",
          resolution: input.resolution,
          resolvedById: user.id,
          resolvedAt: new Date()
        }
      });
      await writeAudit(tx, request, {
        action: "reimbursement.issue.resolve",
        resourceType: "ReimbursementIssue",
        resourceId: issueId,
        before: { status: issue.status },
        after: {
          status: value.status,
          resolution: value.resolution,
          resolvedById: user.id
        }
      });
      return value;
    });
    return success(request, resolved);
  });

  app.post("/reimbursements/:id/payments", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.REIMBURSEMENT_PAY)
    ]
  }, async (request, reply) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = paymentSchema.parse(request.body);
    const user = authorizationForPermission(
      getSession(request),
      Permission.REIMBURSEMENT_PAY
    );
    const before = await scopedBatch(app, user, id);
    if (before.status !== ReimbursementStatus.PENDING_PAYMENT) {
      throw new AppError(409, "REIMBURSEMENT_NOT_PAYABLE", "报销单尚未进入待打款状态");
    }
    const payableAmountCents = before.approvedAmountCents ?? before.totalPaymentCents;
    if (payableAmountCents !== input.amountCents) {
      throw new AppError(400, "PAYMENT_AMOUNT_MISMATCH", "打款金额必须与财务审核通过金额一致");
    }
    assertFinalPaymentProof(before.attachments, input.proofAttachmentId);
    const payment = await app.prisma.$transaction(async (tx) => {
      const created = await tx.reimbursementPayment.create({
        data: {
          batchId: id,
          amountCents: input.amountCents,
          reference: input.reference,
          paidById: user.id,
          paidAt: input.paidAt,
          proofAttachmentId: input.proofAttachmentId
        }
      });
      await transitionReimbursement(tx, {
        batchId: id,
        actorId: user.id,
        expectedVersion: input.expectedVersion,
        targetStatus: ReimbursementStatus.PAID,
        permission: Permission.REIMBURSEMENT_PAY,
        comment: `付款流水号：${input.reference}`
      });
      await writeAudit(tx, request, {
        action: "reimbursement.payment.create",
        resourceType: "ReimbursementPayment",
        resourceId: created.id,
        before: { batchStatus: before.status },
        after: {
          batchId: id,
          amountCents: created.amountCents,
          reference: created.reference,
          paidAt: created.paidAt.toISOString(),
          batchStatus: ReimbursementStatus.PAID
        }
      });
      return created;
    });
    return reply.status(201).send(success(request, payment));
  });
}
