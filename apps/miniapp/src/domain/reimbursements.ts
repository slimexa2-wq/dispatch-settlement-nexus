import type { Reimbursement, ReimbursementStatus, SessionUser } from "../api/types";

export const reimbursementPermissions = {
  self: "reimbursement:self",
  manage: "reimbursement:manage",
  approve: "reimbursement:approve",
  financeReview: "reimbursement:finance-review",
  pay: "reimbursement:pay",
  export: "reimbursement:export"
} as const;

const statusLabels: Record<ReimbursementStatus, string> = {
  PENDING_SUBMISSION: "待提交",
  DEPARTMENT_PREPARING: "部门制单中",
  OWNER_REVIEWING: "负责人审核中",
  FINANCE_REVIEWING: "财务审核中",
  APPROVED: "审核通过",
  PENDING_PAYMENT: "待付款",
  PAID: "已付款"
};

export type ReimbursementAction =
  | {
      kind: "transition";
      label: string;
      targetStatus: ReimbursementStatus;
      permission: string;
    }
  | {
      kind: "payment";
      label: string;
      permission: string;
    };

export function reimbursementStatusLabel(status: ReimbursementStatus): string {
  return statusLabels[status];
}

export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function yuanToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [yuan, fraction = ""] = normalized.split(".");
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function editableReimbursement(user: SessionUser, batch: Reimbursement): boolean {
  if (batch.status === "PENDING_SUBMISSION") {
    return batch.applicantUserId === user.id && user.permissions.includes(reimbursementPermissions.self);
  }
  return batch.status === "DEPARTMENT_PREPARING" && user.permissions.includes(reimbursementPermissions.manage);
}

export function canCreateReimbursement(user: SessionUser): boolean {
  return user.permissions.includes(reimbursementPermissions.self);
}

export function canManageIssues(user: SessionUser): boolean {
  return [
    reimbursementPermissions.manage,
    reimbursementPermissions.approve,
    reimbursementPermissions.financeReview
  ].some((permission) => user.permissions.includes(permission));
}

export function reimbursementAction(user: SessionUser, batch: Reimbursement): ReimbursementAction | null {
  const has = (permission: string) => user.permissions.includes(permission);
  switch (batch.status) {
    case "PENDING_SUBMISSION":
      if (batch.applicantUserId === user.id && has(reimbursementPermissions.self)) {
        return {
          kind: "transition",
          label: "提交部门制单",
          targetStatus: "DEPARTMENT_PREPARING",
          permission: reimbursementPermissions.self
        };
      }
      return null;
    case "DEPARTMENT_PREPARING":
      return has(reimbursementPermissions.manage)
        ? {
            kind: "transition",
            label: "提交负责人审核",
            targetStatus: "OWNER_REVIEWING",
            permission: reimbursementPermissions.manage
          }
        : null;
    case "OWNER_REVIEWING":
      return has(reimbursementPermissions.approve)
        ? {
            kind: "transition",
            label: "负责人审核通过",
            targetStatus: "FINANCE_REVIEWING",
            permission: reimbursementPermissions.approve
          }
        : null;
    case "FINANCE_REVIEWING":
      return has(reimbursementPermissions.financeReview)
        ? {
            kind: "transition",
            label: "财务审核通过",
            targetStatus: "APPROVED",
            permission: reimbursementPermissions.financeReview
          }
        : null;
    case "APPROVED":
      return has(reimbursementPermissions.financeReview)
        ? {
            kind: "transition",
            label: "转入待付款",
            targetStatus: "PENDING_PAYMENT",
            permission: reimbursementPermissions.financeReview
          }
        : null;
    case "PENDING_PAYMENT":
      return has(reimbursementPermissions.pay)
        ? { kind: "payment", label: "登记付款", permission: reimbursementPermissions.pay }
        : null;
    case "PAID":
      return null;
  }
}

type DepartmentCategorySummaryPreview = {
  category: string;
  lineCount: number;
  totalPaymentCents: number;
};

type DepartmentApplicantSummaryPreview = {
  applicantName: string;
  totalPaymentCents: number;
  totalApprovedAmountCents: number;
};

export function departmentSummaryCategoryPreview(
  summaries: readonly DepartmentCategorySummaryPreview[],
  limit = 3
): string {
  const visible = summaries.slice(0, limit);
  const text = visible
    .map((item) => `${item.category} ${item.lineCount}笔 ¥${centsToYuan(item.totalPaymentCents)}`)
    .join("；");
  const remaining = summaries.length - visible.length;
  return remaining > 0 ? `${text}；另${remaining}类` : text;
}

export function departmentSummaryApplicantPreview(
  summaries: readonly DepartmentApplicantSummaryPreview[],
  limit = 3
): string {
  const visible = summaries.slice(0, limit);
  const text = visible
    .map((item) => {
      const amount = item.totalApprovedAmountCents > 0
        ? item.totalApprovedAmountCents
        : item.totalPaymentCents;
      return `${item.applicantName} ¥${centsToYuan(amount)}`;
    })
    .join("；");
  const remaining = summaries.length - visible.length;
  return remaining > 0 ? `${text}；另${remaining}人` : text;
}

