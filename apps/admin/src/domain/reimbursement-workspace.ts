export type ReimbursementWorkspace = "department" | "payment" | "personal";

export type DepartmentSummaryLike = {
  statusCounts: Record<string, number>;
  openIssueCount: number;
};

export type DepartmentSummaryTargetStatus =
  | "OWNER_REVIEWING"
  | "FINANCE_REVIEWING"
  | "APPROVED"
  | "PENDING_PAYMENT";

export type DepartmentSummaryAction = {
  targetStatus: DepartmentSummaryTargetStatus;
  label: string;
};

const permission = {
  self: "reimbursement:self",
  manage: "reimbursement:manage",
  approve: "reimbursement:approve",
  financeReview: "reimbursement:finance-review",
  pay: "reimbursement:pay",
  export: "reimbursement:export"
} as const;

function hasAny(userPermissions: readonly string[], candidates: readonly string[]): boolean {
  return candidates.some((candidate) => userPermissions.includes(candidate));
}

export function availableReimbursementWorkspaces(
  userPermissions: readonly string[]
): ReimbursementWorkspace[] {
  const workspaces: ReimbursementWorkspace[] = [];
  if (hasAny(userPermissions, [
    permission.manage,
    permission.approve,
    permission.financeReview,
    permission.export
  ])) {
    workspaces.push("department");
  }
  if (hasAny(userPermissions, [
    permission.financeReview,
    permission.pay,
    permission.export
  ])) {
    workspaces.push("payment");
  }
  if (hasAny(userPermissions, [permission.self, permission.manage])) {
    workspaces.push("personal");
  }
  return workspaces;
}

export function initialReimbursementWorkspace(
  userPermissions: readonly string[]
): ReimbursementWorkspace {
  return availableReimbursementWorkspaces(userPermissions)[0] ?? "personal";
}

export function departmentSummaryAction(
  summary: DepartmentSummaryLike,
  userPermissions: readonly string[]
): DepartmentSummaryAction | null {
  const statuses = Object.keys(summary.statusCounts);
  if (summary.openIssueCount > 0 || statuses.length !== 1) return null;
  const status = statuses[0];
  if (status === "DEPARTMENT_PREPARING" && userPermissions.includes(permission.manage)) {
    return {
      targetStatus: "OWNER_REVIEWING",
      label: "确认部门汇总并提交负责人"
    };
  }
  if (status === "OWNER_REVIEWING" && userPermissions.includes(permission.approve)) {
    return {
      targetStatus: "FINANCE_REVIEWING",
      label: "负责人按部门汇总审核通过"
    };
  }
  if (status === "FINANCE_REVIEWING" && userPermissions.includes(permission.financeReview)) {
    return {
      targetStatus: "APPROVED",
      label: "财务按部门汇总审核通过"
    };
  }
  if (
    status === "APPROVED" &&
    userPermissions.includes(permission.financeReview)
  ) {
    return {
      targetStatus: "PENDING_PAYMENT",
      label: "生成报销人付款名单"
    };
  }
  return null;
}
