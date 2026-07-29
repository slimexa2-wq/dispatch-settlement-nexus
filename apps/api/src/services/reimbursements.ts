import { AppError, notFound } from "../errors.js";
import { validateApprovedAmount } from "./reimbursement-automation.js";

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


export type EmployeeReimbursementScopeInput = {
  branchId?: string | null;
  organizationUnitId?: string | null;
  projectId?: string | null;
  supplierId?: string | null;
};

export function normalizeEmployeeReimbursementScope(
  input: EmployeeReimbursementScopeInput,
  employee: { organizationUnitId: string | null }
): Required<EmployeeReimbursementScopeInput> {
  if (!employee.organizationUnitId) {
    throw new AppError(
      409,
      "INTERNAL_EMPLOYEE_ORG_REQUIRED",
      "当前内部员工档案尚未绑定部门，不能发起报销"
    );
  }
  const expected = {
    branchId: null,
    organizationUnitId: employee.organizationUnitId,
    projectId: null,
    supplierId: null
  };
  for (const key of ["branchId", "organizationUnitId", "projectId", "supplierId"] as const) {
    const requested = input[key];
    if (requested && requested !== expected[key]) {
      throw new AppError(
        403,
        "OUT_OF_SCOPE",
        "员工自助报销的组织归属必须与当前内部员工档案一致"
      );
    }
  }
  return expected;
}

export type PaymentProofAttachment = {
  id: string;
  type: "PAYMENT_VOUCHER" | "INVOICE" | "SUPPORTING";
  lineId?: string | null;
};

export function assertFinalPaymentProof<T extends PaymentProofAttachment>(
  attachments: readonly T[],
  proofAttachmentId: string | null | undefined
): T {
  if (!proofAttachmentId) {
    throw new AppError(
      400,
      "PAYMENT_PROOF_REQUIRED",
      "登记付款前必须上传最终付款凭证"
    );
  }
  const proof = attachments.find((attachment) => attachment.id === proofAttachmentId);
  if (
    !proof ||
    proof.type !== "PAYMENT_VOUCHER" ||
    Boolean(proof.lineId)
  ) {
    throw new AppError(
      400,
      "INVALID_PAYMENT_PROOF",
      "付款凭证必须是当前报销单的整单最终付款凭证"
    );
  }
  return proof;
}

export function assertReimbursementApprovalLimit(
  totalPaymentCents: number,
  maxApprovalCents: number | null | undefined
): void {
  if (maxApprovalCents === null || maxApprovalCents === undefined) return;
  if (totalPaymentCents > maxApprovalCents) {
    throw new AppError(
      403,
      "REIMBURSEMENT_APPROVAL_LIMIT_EXCEEDED",
      "报销金额超过当前职级审批上限，请由更高职级的负责人处理",
      { totalPaymentCents, maxApprovalCents }
    );
  }
}

export type ReimbursementAttachmentUploadAuthorization = {
  mode: "EDITABLE_MATERIAL" | "APPLICANT_SUPPLEMENT" | "FINAL_PAYMENT_PROOF";
  permission: "reimbursement:self" | "reimbursement:manage" | "reimbursement:pay";
};

export function reimbursementAttachmentUploadAuthorization(input: {
  status: ReimbursementStatus;
  applicantUserId: string;
  userId: string;
  permissions: readonly string[];
  type: "PAYMENT_VOUCHER" | "INVOICE" | "SUPPORTING";
  lineId?: string | null;
  openIssueCount: number;
}): ReimbursementAttachmentUploadAuthorization | null {
  const has = (permission: string) => input.permissions.includes(permission);
  const hasNoLine = !input.lineId;

  if (
    input.status === ReimbursementStatus.PENDING_PAYMENT &&
    has("reimbursement:pay") &&
    input.type === "PAYMENT_VOUCHER" &&
    hasNoLine
  ) {
    return { mode: "FINAL_PAYMENT_PROOF", permission: "reimbursement:pay" };
  }

  if (
    input.applicantUserId === input.userId &&
    has("reimbursement:self") &&
    input.type === "SUPPORTING" &&
    hasNoLine &&
    input.openIssueCount > 0 &&
    (input.status === ReimbursementStatus.OWNER_REVIEWING ||
      input.status === ReimbursementStatus.FINANCE_REVIEWING)
  ) {
    return { mode: "APPLICANT_SUPPLEMENT", permission: "reimbursement:self" };
  }

  if (
    input.status === ReimbursementStatus.PENDING_SUBMISSION &&
    input.applicantUserId === input.userId &&
    has("reimbursement:self")
  ) {
    return { mode: "EDITABLE_MATERIAL", permission: "reimbursement:self" };
  }

  if (
    (input.status === ReimbursementStatus.PENDING_SUBMISSION ||
      input.status === ReimbursementStatus.DEPARTMENT_PREPARING) &&
    has("reimbursement:manage")
  ) {
    return { mode: "EDITABLE_MATERIAL", permission: "reimbursement:manage" };
  }

  return null;
}

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
  if (line.invoiceCents < line.paymentCents) {
    throw new AppError(
      400,
      "INVOICE_BELOW_PAYMENT",
      "发票金额不能低于付款金额"
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
  approvedAmountCents?: number | null;
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

  let approvedAmountCents: number | undefined;
  if (command.targetStatus === ReimbursementStatus.APPROVED) {
    const validation = validateApprovedAmount(
      Number(batch.totalPaymentCents),
      command.approvedAmountCents
    );
    if (!validation.valid) {
      throw new AppError(400, validation.code, validation.message);
    }
    approvedAmountCents = validation.approvedAmountCents;
  }
  if (
    command.targetStatus === ReimbursementStatus.PENDING_PAYMENT &&
    !Number.isSafeInteger(batch.approvedAmountCents)
  ) {
    throw new AppError(409, "APPROVED_AMOUNT_REQUIRED", "财务审核通过金额尚未确定，不能进入待付款");
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
      approvedAmountCents,
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
