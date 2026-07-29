import assert from "node:assert/strict";
import test from "node:test";
import {
  availableReimbursementWorkspaces,
  departmentSummaryAction,
  initialReimbursementWorkspace,
  type DepartmentSummaryLike
} from "../src/domain/reimbursement-workspace.ts";

const permissions = {
  self: "reimbursement:self",
  manage: "reimbursement:manage",
  approve: "reimbursement:approve",
  finance: "reimbursement:finance-review",
  pay: "reimbursement:pay",
  export: "reimbursement:export"
} as const;

test("管理端按岗位权限只展示需要的报销工作区", () => {
  assert.deepEqual(
    availableReimbursementWorkspaces([permissions.self]),
    ["personal"]
  );
  assert.deepEqual(
    availableReimbursementWorkspaces([permissions.manage, permissions.self]),
    ["department", "personal"]
  );
  assert.deepEqual(
    availableReimbursementWorkspaces([permissions.finance, permissions.pay]),
    ["department", "payment"]
  );
});

test("管理岗位默认进入部门汇总，普通员工默认进入个人报销", () => {
  assert.equal(initialReimbursementWorkspace([permissions.manage, permissions.self]), "department");
  assert.equal(initialReimbursementWorkspace([permissions.self]), "personal");
  assert.equal(initialReimbursementWorkspace([permissions.pay]), "payment");
});

test("部门汇总只有状态一致且无未解决问题时才产生批量动作", () => {
  const base: DepartmentSummaryLike = {
    statusCounts: { FINANCE_REVIEWING: 3 },
    openIssueCount: 0
  };
  assert.deepEqual(
    departmentSummaryAction(base, [permissions.finance]),
    { targetStatus: "APPROVED", label: "财务按部门汇总审核通过" }
  );
  assert.equal(
    departmentSummaryAction({ ...base, openIssueCount: 1 }, [permissions.finance]),
    null
  );
  assert.equal(
    departmentSummaryAction({ ...base, statusCounts: { FINANCE_REVIEWING: 2, APPROVED: 1 } }, [permissions.finance]),
    null
  );
});


test("已审核部门批次只能由财务审核权限生成付款名单", () => {
  const approved: DepartmentSummaryLike = {
    statusCounts: { APPROVED: 2 },
    openIssueCount: 0
  };
  assert.deepEqual(
    departmentSummaryAction(approved, [permissions.finance]),
    { targetStatus: "PENDING_PAYMENT", label: "生成报销人付款名单" }
  );
  assert.equal(
    departmentSummaryAction(approved, [permissions.pay]),
    null
  );
});
