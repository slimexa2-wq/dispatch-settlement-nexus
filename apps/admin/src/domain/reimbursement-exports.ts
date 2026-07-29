import type {
  DepartmentReimbursementSummary,
  ReimbursementPaymentRosterRow
} from "../types/domain";

const statusLabels: Record<string, string> = {
  PENDING_SUBMISSION: "待提交",
  DEPARTMENT_PREPARING: "部门制单中",
  OWNER_REVIEWING: "负责人审核中",
  FINANCE_REVIEWING: "财务审核中",
  APPROVED: "审核通过",
  PENDING_PAYMENT: "待打款",
  PAID: "已打款"
};

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(rows: readonly (readonly unknown[])[]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function yuan(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2);
}

function statusSummary(statusCounts: Record<string, number>): string {
  return Object.entries(statusCounts)
    .map(([status, count]) => `${statusLabels[status] ?? status} ${count}笔`)
    .join("、");
}

export function createDepartmentSummaryCsv(
  rows: readonly DepartmentReimbursementSummary[]
): string {
  return csv([
    ["月份", "部门", "报销人数", "报销笔数", "申报金额（元）", "审核通过金额（元）", "发票金额（元）", "未解决异常", "状态"],
    ...rows.map((row) => [
      row.period,
      row.organizationUnitName,
      row.applicantCount,
      row.batchCount,
      yuan(row.totalPaymentCents),
      yuan(row.totalApprovedAmountCents),
      yuan(row.totalInvoiceCents),
      row.openIssueCount,
      statusSummary(row.statusCounts)
    ])
  ]);
}

export function createPaymentRosterCsv(
  rows: readonly ReimbursementPaymentRosterRow[]
): string {
  return csv([
    ["报销编号", "报销人", "所属部门", "银行卡号", "开户行", "审核通过金额（元）", "付款状态", "实付金额（元）", "付款时间", "付款流水号"],
    ...rows.map((row) => [
      row.code,
      row.applicantName,
      row.organizationUnitName,
      row.payeeAccount ?? "",
      row.payeeBank ?? "",
      yuan(row.approvedAmountCents),
      row.paymentStatus === "PAID" ? "已付款" : "待付款",
      row.paidAmountCents === null ? "" : yuan(row.paidAmountCents),
      row.paidAt ?? "",
      row.paymentReference ?? ""
    ])
  ]);
}
