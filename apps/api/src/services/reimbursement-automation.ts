export type AutomationIssueCode =
  | "INVALID_PAYMENT_AMOUNT"
  | "INVALID_INVOICE_AMOUNT"
  | "INVOICE_BELOW_PAYMENT"
  | "PAYMENT_VOUCHER_REQUIRED"
  | "INVOICE_REQUIRED"
  | "DUPLICATE_INVOICE";

export type AutomationIssue = {
  code: AutomationIssueCode;
  lineId: string;
  sequence: number;
  message: string;
  attachmentId?: string;
};

export type SubmissionLine = {
  id: string;
  sequence: number;
  paymentCents: number;
  invoiceCents: number;
};

export type SubmissionAttachment = {
  id: string;
  lineId?: string | null;
  type: "PAYMENT_VOUCHER" | "INVOICE" | "SUPPORTING";
  sha256: string;
};

export function validateReimbursementSubmission(input: {
  lines: readonly SubmissionLine[];
  attachments: readonly SubmissionAttachment[];
  existingInvoiceHashes?: ReadonlySet<string>;
}): { valid: boolean; issues: AutomationIssue[] } {
  const issues: AutomationIssue[] = [];
  const attachmentsByLine = new Map<string, SubmissionAttachment[]>();
  for (const attachment of input.attachments) {
    if (!attachment.lineId) continue;
    const current = attachmentsByLine.get(attachment.lineId) ?? [];
    current.push(attachment);
    attachmentsByLine.set(attachment.lineId, current);
  }

  const invoiceHashCounts = new Map<string, number>();
  for (const attachment of input.attachments) {
    if (attachment.type !== "INVOICE" || !attachment.sha256) continue;
    invoiceHashCounts.set(attachment.sha256, (invoiceHashCounts.get(attachment.sha256) ?? 0) + 1);
  }

  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.paymentCents) || line.paymentCents <= 0) {
      issues.push({
        code: "INVALID_PAYMENT_AMOUNT",
        lineId: line.id,
        sequence: line.sequence,
        message: `第${line.sequence}笔付款金额必须大于0`
      });
    }
    if (!Number.isSafeInteger(line.invoiceCents) || line.invoiceCents <= 0) {
      issues.push({
        code: "INVALID_INVOICE_AMOUNT",
        lineId: line.id,
        sequence: line.sequence,
        message: `第${line.sequence}笔发票金额必须大于0`
      });
    } else if (line.invoiceCents < line.paymentCents) {
      issues.push({
        code: "INVOICE_BELOW_PAYMENT",
        lineId: line.id,
        sequence: line.sequence,
        message: `第${line.sequence}笔发票金额比付款金额少${line.paymentCents - line.invoiceCents}分`
      });
    }

    const lineAttachments = attachmentsByLine.get(line.id) ?? [];
    if (!lineAttachments.some((attachment) => attachment.type === "PAYMENT_VOUCHER")) {
      issues.push({
        code: "PAYMENT_VOUCHER_REQUIRED",
        lineId: line.id,
        sequence: line.sequence,
        message: `第${line.sequence}笔缺少付款凭证`
      });
    }
    const invoices = lineAttachments.filter((attachment) => attachment.type === "INVOICE");
    if (!invoices.length) {
      issues.push({
        code: "INVOICE_REQUIRED",
        lineId: line.id,
        sequence: line.sequence,
        message: `第${line.sequence}笔缺少发票`
      });
    }
    for (const invoice of invoices) {
      if (
        (invoiceHashCounts.get(invoice.sha256) ?? 0) > 1 ||
        input.existingInvoiceHashes?.has(invoice.sha256)
      ) {
        issues.push({
          code: "DUPLICATE_INVOICE",
          lineId: line.id,
          sequence: line.sequence,
          attachmentId: invoice.id,
          message: `第${line.sequence}笔发票与本批次或历史报销中的发票重复`
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export type DepartmentSummarySource = {
  id: string;
  code?: string;
  organizationUnitId: string | null;
  organizationUnitName: string | null;
  applicantUserId: string;
  applicantName: string;
  status: string;
  totalPaymentCents: number;
  approvedAmountCents?: number | null;
  totalInvoiceCents: number;
  openIssueCount: number;
  createdAt: string | Date;
  lines?: readonly {
    id: string;
    sequence: number;
    expenseDate?: string | Date | null;
    category: string;
    description: string;
    paymentCents: number;
    invoiceCents: number;
  }[];
};

export type DepartmentCategorySummary = {
  category: string;
  lineCount: number;
  totalPaymentCents: number;
  totalInvoiceCents: number;
};

export type DepartmentApplicantSummary = {
  applicantUserId: string;
  applicantName: string;
  batchCount: number;
  totalPaymentCents: number;
  totalApprovedAmountCents: number;
  totalInvoiceCents: number;
};

export type DepartmentDetailRow = {
  batchId: string;
  code: string;
  lineId: string;
  sequence: number;
  expenseDate: string | Date | null;
  applicantUserId: string;
  applicantName: string;
  category: string;
  description: string;
  paymentCents: number;
  invoiceCents: number;
};

export type DepartmentSummary = {
  key: string;
  period: string;
  organizationUnitId: string;
  organizationUnitName: string;
  batchCount: number;
  applicantCount: number;
  totalPaymentCents: number;
  totalApprovedAmountCents: number;
  totalInvoiceCents: number;
  openIssueCount: number;
  readyForFinance: boolean;
  statusCounts: Record<string, number>;
  batchIds: string[];
  categorySummaries: DepartmentCategorySummary[];
  applicantSummaries: DepartmentApplicantSummary[];
  detailRows: DepartmentDetailRow[];
};

function monthOf(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "UNKNOWN";
  return date.toISOString().slice(0, 7);
}

export type ApprovedAmountValidation =
  | { valid: true; approvedAmountCents: number }
  | { valid: false; code: "INVALID_APPROVED_AMOUNT" | "APPROVED_AMOUNT_EXCEEDS_REQUESTED"; message: string };

export function validateApprovedAmount(
  requestedAmountCents: number,
  approvedAmountCents?: number | null
): ApprovedAmountValidation {
  const approved = approvedAmountCents ?? requestedAmountCents;
  if (!Number.isSafeInteger(approved) || approved <= 0) {
    return {
      valid: false,
      code: "INVALID_APPROVED_AMOUNT",
      message: "审核通过金额必须为大于0的整数分"
    };
  }
  if (approved > requestedAmountCents) {
    return {
      valid: false,
      code: "APPROVED_AMOUNT_EXCEEDS_REQUESTED",
      message: "审核通过金额不能超过员工申报金额"
    };
  }
  return { valid: true, approvedAmountCents: approved };
}

export type DepartmentBatchSelectionSource = {
  id: string;
  organizationUnitId: string | null;
  createdAt: string | Date;
};

export type DepartmentBatchSelectionValidation =
  | { valid: true; organizationUnitId: string; period: string }
  | { valid: false; code: "EMPTY_DEPARTMENT_BATCH" | "MISSING_ORGANIZATION" | "MIXED_DEPARTMENT_BATCH" | "MIXED_PERIOD_BATCH"; message: string };

export function validateDepartmentBatchSelection(
  batches: readonly DepartmentBatchSelectionSource[]
): DepartmentBatchSelectionValidation {
  if (!batches.length) {
    return { valid: false, code: "EMPTY_DEPARTMENT_BATCH", message: "部门汇总至少包含一张报销单" };
  }
  const organizationUnitId = batches[0]?.organizationUnitId;
  if (!organizationUnitId || batches.some((batch) => !batch.organizationUnitId)) {
    return { valid: false, code: "MISSING_ORGANIZATION", message: "部门汇总中的报销单必须关联真实组织单元" };
  }
  if (batches.some((batch) => batch.organizationUnitId !== organizationUnitId)) {
    return { valid: false, code: "MIXED_DEPARTMENT_BATCH", message: "部门汇总只能处理同一组织单元的报销单" };
  }
  const period = monthOf(batches[0]!.createdAt);
  if (period === "UNKNOWN" || batches.some((batch) => monthOf(batch.createdAt) !== period)) {
    return { valid: false, code: "MIXED_PERIOD_BATCH", message: "部门汇总只能处理同一个月份的报销单" };
  }
  return { valid: true, organizationUnitId, period };
}

export function buildDepartmentSummaries(
  batches: readonly DepartmentSummarySource[]
): DepartmentSummary[] {
  const grouped = new Map<string, {
    period: string;
    organizationUnitId: string;
    organizationUnitName: string;
    applicantIds: Set<string>;
    applicantSummaries: Map<string, DepartmentApplicantSummary>;
    categorySummaries: Map<string, DepartmentCategorySummary>;
    detailRows: DepartmentDetailRow[];
    totalPaymentCents: number;
    totalApprovedAmountCents: number;
    totalInvoiceCents: number;
    openIssueCount: number;
    statusCounts: Record<string, number>;
    batchIds: string[];
  }>();

  for (const batch of batches) {
    if (!batch.organizationUnitId) continue;
    const period = monthOf(batch.createdAt);
    const key = `${batch.organizationUnitId}:${period}`;
    const group = grouped.get(key) ?? {
      period,
      organizationUnitId: batch.organizationUnitId,
      organizationUnitName: batch.organizationUnitName ?? "未命名组织",
      applicantIds: new Set<string>(),
      applicantSummaries: new Map<string, DepartmentApplicantSummary>(),
      categorySummaries: new Map<string, DepartmentCategorySummary>(),
      detailRows: [],
      totalPaymentCents: 0,
      totalApprovedAmountCents: 0,
      totalInvoiceCents: 0,
      openIssueCount: 0,
      statusCounts: {},
      batchIds: []
    };
    group.applicantIds.add(batch.applicantUserId);
    group.totalPaymentCents += batch.totalPaymentCents;
    group.totalApprovedAmountCents += batch.approvedAmountCents ?? 0;
    group.totalInvoiceCents += batch.totalInvoiceCents;
    group.openIssueCount += batch.openIssueCount;
    group.statusCounts[batch.status] = (group.statusCounts[batch.status] ?? 0) + 1;
    group.batchIds.push(batch.id);

    const applicant = group.applicantSummaries.get(batch.applicantUserId) ?? {
      applicantUserId: batch.applicantUserId,
      applicantName: batch.applicantName,
      batchCount: 0,
      totalPaymentCents: 0,
      totalApprovedAmountCents: 0,
      totalInvoiceCents: 0
    };
    applicant.batchCount += 1;
    applicant.totalPaymentCents += batch.totalPaymentCents;
    applicant.totalApprovedAmountCents += batch.approvedAmountCents ?? 0;
    applicant.totalInvoiceCents += batch.totalInvoiceCents;
    group.applicantSummaries.set(batch.applicantUserId, applicant);

    for (const line of batch.lines ?? []) {
      const category = group.categorySummaries.get(line.category) ?? {
        category: line.category,
        lineCount: 0,
        totalPaymentCents: 0,
        totalInvoiceCents: 0
      };
      category.lineCount += 1;
      category.totalPaymentCents += line.paymentCents;
      category.totalInvoiceCents += line.invoiceCents;
      group.categorySummaries.set(line.category, category);
      group.detailRows.push({
        batchId: batch.id,
        code: batch.code ?? batch.id,
        lineId: line.id,
        sequence: line.sequence,
        expenseDate: line.expenseDate ?? null,
        applicantUserId: batch.applicantUserId,
        applicantName: batch.applicantName,
        category: line.category,
        description: line.description,
        paymentCents: line.paymentCents,
        invoiceCents: line.invoiceCents
      });
    }
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .map(([key, group]) => ({
      key,
      period: group.period,
      organizationUnitId: group.organizationUnitId,
      organizationUnitName: group.organizationUnitName,
      batchCount: group.batchIds.length,
      applicantCount: group.applicantIds.size,
      totalPaymentCents: group.totalPaymentCents,
      totalApprovedAmountCents: group.totalApprovedAmountCents,
      totalInvoiceCents: group.totalInvoiceCents,
      openIssueCount: group.openIssueCount,
      readyForFinance:
        group.openIssueCount === 0 &&
        Object.keys(group.statusCounts).length === 1 &&
        group.statusCounts.FINANCE_REVIEWING === group.batchIds.length,
      statusCounts: group.statusCounts,
      batchIds: group.batchIds,
      categorySummaries: [...group.categorySummaries.values()].sort((left, right) =>
        left.category.localeCompare(right.category, "zh-CN")
      ),
      applicantSummaries: [...group.applicantSummaries.values()].sort((left, right) =>
        left.applicantName.localeCompare(right.applicantName, "zh-CN")
      ),
      detailRows: [...group.detailRows].sort((left, right) =>
        left.code.localeCompare(right.code, "zh-CN") || left.sequence - right.sequence
      )
    }))
    .sort((left, right) => right.period.localeCompare(left.period) || left.organizationUnitName.localeCompare(right.organizationUnitName, "zh-CN"));
}

export type PaymentRosterSource = {
  id: string;
  code: string;
  organizationUnitId: string | null;
  organizationUnitName: string | null;
  applicantUserId: string;
  applicantName: string;
  payeeAccount?: string | null;
  payeeBank?: string | null;
  status: string;
  totalPaymentCents: number;
  approvedAmountCents?: number | null;
  createdAt: string | Date;
  payment?: {
    amountCents: number;
    paidAt: string | Date;
    reference: string;
  } | null;
};

export type PaymentRosterRow = {
  batchId: string;
  code: string;
  organizationUnitId: string | null;
  organizationUnitName: string;
  applicantUserId: string;
  applicantName: string;
  payeeAccount: string | null;
  payeeBank: string | null;
  approvedAmountCents: number;
  paymentStatus: "PENDING" | "PAID";
  paidAmountCents: number | null;
  paidAt: string | Date | null;
  paymentReference: string | null;
};

export function buildPaymentRoster(
  batches: readonly PaymentRosterSource[]
): PaymentRosterRow[] {
  return batches
    .filter((batch) => ["APPROVED", "PENDING_PAYMENT", "PAID"].includes(batch.status))
    .map((batch) => ({
      batchId: batch.id,
      code: batch.code,
      organizationUnitId: batch.organizationUnitId,
      organizationUnitName: batch.organizationUnitName ?? "未关联组织",
      applicantUserId: batch.applicantUserId,
      applicantName: batch.applicantName,
      payeeAccount: batch.payeeAccount ?? null,
      payeeBank: batch.payeeBank ?? null,
      approvedAmountCents: batch.approvedAmountCents ?? batch.totalPaymentCents,
      paymentStatus: batch.payment ? "PAID" as const : "PENDING" as const,
      paidAmountCents: batch.payment?.amountCents ?? null,
      paidAt: batch.payment?.paidAt ?? null,
      paymentReference: batch.payment?.reference ?? null
    }));
}
