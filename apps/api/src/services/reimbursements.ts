import { AppError, notFound } from "../errors.js";

export const ReimbursementStatus = {
  PENDING_SUBMISSION: "PENDING_SUBMISSION",
  DEPARTMENT_PREPARING: "DEPARTMENT_PREPARING",
  OWNER_REVIEWING: "OWNER_REVIEWING",
  FINANCE_REVIEWING: "FINANCE_REVIEWING",
  APPROVED: "APPROVED",
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PAID: "PAID"
} as const;
export type ReimbursementStatus =
  (typeof ReimbursementStatus)[keyof typeof ReimbursementStatus];

export type ReimbursementLineInput = {
  sequence: number;
  description: string;
  paymentCents: number;
  invoiceCents: number;
};

export type ReimbursementSummary = {
  lineCount: number;
  totalPaymentCents: number;
  totalInvoiceCents: number;
  invoiceExcessCents: number;
};

export function validateReimbursementLine(line: ReimbursementLineInput): void {
  if (!Number.isInteger(line.sequence) || line.sequence < 1) {
    throw new AppError(400, "INVALID_REIMBURSEMENT_SEQUENCE", "明细序号必须为正整数");
  }
  if (!line.description.trim()) {
    throw new AppError(400, "REIMBURSEMENT_DESCRIPTION_REQUIRED", "报销说明不能为空");
  }
  if (!Number.isSafeInteger(line.paymentCents) || line.paymentCents <= 0) {
    throw new AppError(400, "INVALID_PAYMENT_AMOUNT", "付款金额必须为正整数分");
  }
  if (!Number.isSafeInteger(line.invoiceCents) || line.invoiceCents <= 0) {
    throw new AppError(400, "INVALID_INVOICE_AMOUNT", "发票金额必须为正整数分");
  }
  if (line.invoiceCents <= line.paymentCents) {
    throw new AppError(
      400,
      "INVOICE_MUST_EXCEED_PAYMENT",
      "发票金额必须严格大于付款金额"
    );
  }
}

export function summarizeReimbursement(
  lines: readonly ReimbursementLineInput[]
): ReimbursementSummary {
  lines.forEach(validateReimbursementLine);
  const totalPaymentCents = lines.reduce(
    (sum, line) => sum + line.paymentCents,
    0
  );
  const totalInvoiceCents = lines.reduce(
    (sum, line) => sum + line.invoiceCents,
    0
  );
  return {
    lineCount: lines.length,
    totalPaymentCents,
    totalInvoiceCents,
    invoiceExcessCents: totalInvoiceCents - totalPaymentCents
  };
}

export type TransitionPermission =
  | "reimbursement:self"
  | "reimbursement:manage"
  | "reimbursement:approve"
  | "reimbursement:finance-review"
  | "reimbursement:pay";

type TransitionCommand = {
  batchId: string;
  actorId: string;
  expectedVersion: number;
  targetStatus: ReimbursementStatus;
  permission: TransitionPermission;
  comment?: string;
};

type ReimbursementDelegate = {
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
};

type ApprovalDelegate = {
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export type ReimbursementTransitionDb = {
  reimbursementBatch: ReimbursementDelegate;
  reimbursementApproval: ApprovalDelegate;
};

const transitionRules: Record<
  ReimbursementStatus,
  { target: ReimbursementStatus; permissions: readonly TransitionPermission[] } | null
> = {
  [ReimbursementStatus.PENDING_SUBMISSION]: {
    target: ReimbursementStatus.DEPARTMENT_PREPARING,
    permissions: ["reimbursement:self", "reimbursement:manage"]
  },
  [ReimbursementStatus.DEPARTMENT_PREPARING]: {
    target: ReimbursementStatus.OWNER_REVIEWING,
    permissions: ["reimbursement:manage"]
  },
  [ReimbursementStatus.OWNER_REVIEWING]: {
    target: ReimbursementStatus.FINANCE_REVIEWING,
    permissions: ["reimbursement:approve"]
  },
  [ReimbursementStatus.FINANCE_REVIEWING]: {
    target: ReimbursementStatus.APPROVED,
    permissions: ["reimbursement:finance-review"]
  },
  [ReimbursementStatus.APPROVED]: {
    target: ReimbursementStatus.PENDING_PAYMENT,
    permissions: ["reimbursement:finance-review"]
  },
  [ReimbursementStatus.PENDING_PAYMENT]: {
    target: ReimbursementStatus.PAID,
    permissions: ["reimbursement:pay"]
  },
  [ReimbursementStatus.PAID]: null
};

export async function transitionReimbursement(
  tx: ReimbursementTransitionDb,
  command: TransitionCommand
): Promise<Record<string, unknown>> {
  const batch = await tx.reimbursementBatch.findUnique({
    where: { id: command.batchId },
    include: { issues: { where: { status: "OPEN" }, select: { id: true } } }
  });
  if (!batch) notFound("报销批次");
  if (batch.version !== command.expectedVersion) {
    throw new AppError(
      409,
      "CONCURRENT_MODIFICATION",
      "报销单已被其他用户更新，请刷新后重试",
      { expectedVersion: command.expectedVersion, currentVersion: batch.version }
    );
  }
  const currentStatus = batch.status as ReimbursementStatus;
  const rule = transitionRules[currentStatus];
  if (!rule || rule.target !== command.targetStatus) {
    throw new AppError(
      409,
      "INVALID_REIMBURSEMENT_TRANSITION",
      `不能从 ${currentStatus} 直接进入 ${command.targetStatus}`
    );
  }
  if (!rule.permissions.includes(command.permission)) {
    throw new AppError(403, "FORBIDDEN", "当前角色不能执行此报销状态操作");
  }
  const issues = Array.isArray(batch.issues) ? batch.issues : [];
  if (issues.length) {
    throw new AppError(
      409,
      "UNRESOLVED_REIMBURSEMENT_ISSUES",
      "存在未解决问题，不能推进报销状态",
      { issueIds: issues.map((issue) => (issue as { id?: string }).id) }
    );
  }

  const now = new Date();
  const updated = await tx.reimbursementBatch.update({
    where: {
      id_version: {
        id: command.batchId,
        version: command.expectedVersion
      }
    },
    data: {
      status: command.targetStatus,
      version: { increment: 1 },
      submittedAt:
        currentStatus === ReimbursementStatus.PENDING_SUBMISSION ? now : undefined,
      approvedAt:
        command.targetStatus === ReimbursementStatus.APPROVED ? now : undefined,
      paidAt: command.targetStatus === ReimbursementStatus.PAID ? now : undefined
    }
  });
  await tx.reimbursementApproval.create({
    data: {
      batchId: command.batchId,
      actorId: command.actorId,
      fromStatus: currentStatus,
      toStatus: command.targetStatus,
      decision: "APPROVED",
      comment: command.comment
    }
  });
  return updated;
}

type ArtifactAttachment = {
  id: string;
  type: "PAYMENT_VOUCHER" | "INVOICE" | "SUPPORTING";
  originalName: string;
};

type ArtifactLine = ReimbursementLineInput & {
  id: string;
  attachments: ArtifactAttachment[];
};

type ReimbursementArtifactEntry = {
  lineId: string;
  sequence: number;
  description: string;
  attachmentId?: string;
  originalName?: string;
  placeholder: boolean;
  message?: string;
};

export type ReimbursementArtifactPlan = {
  type: "REIMBURSEMENT_FORM" | "PAYMENT_PACKAGE" | "INVOICE_PACKAGE";
  fileName: string;
  entries: ReimbursementArtifactEntry[];
};

function attachmentEntries(
  lines: readonly ArtifactLine[],
  type: ArtifactAttachment["type"],
  missingMessage: string
): ReimbursementArtifactPlan["entries"] {
  return [...lines]
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap<ReimbursementArtifactEntry>((line) => {
      const matches = line.attachments.filter((attachment) => attachment.type === type);
      if (!matches.length) {
        return [{
          lineId: line.id,
          sequence: line.sequence,
          description: line.description,
          placeholder: true,
          message: missingMessage
        }];
      }
      return matches.map((attachment) => ({
        lineId: line.id,
        sequence: line.sequence,
        description: line.description,
        attachmentId: attachment.id,
        originalName: attachment.originalName,
        placeholder: false
      }));
    });
}

export function buildReimbursementArtifactPlan(batch: {
  id: string;
  code: string;
  lines: ArtifactLine[];
}): ReimbursementArtifactPlan[] {
  const orderedLines = [...batch.lines].sort(
    (left, right) => left.sequence - right.sequence
  );
  return [
    {
      type: "REIMBURSEMENT_FORM",
      fileName: `${batch.code}-报销单.xlsx`,
      entries: orderedLines.map((line) => ({
        lineId: line.id,
        sequence: line.sequence,
        description: line.description,
        placeholder: false
      }))
    },
    {
      type: "PAYMENT_PACKAGE",
      fileName: `${batch.code}-付款凭证包.pdf`,
      entries: attachmentEntries(
        orderedLines,
        "PAYMENT_VOUCHER",
        "缺少付款凭证"
      )
    },
    {
      type: "INVOICE_PACKAGE",
      fileName: `${batch.code}-发票包.pdf`,
      entries: attachmentEntries(orderedLines, "INVOICE", "缺少发票")
    }
  ];
}
