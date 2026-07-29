import { describe, expect, it } from "vitest";
import type { Reimbursement, SessionUser } from "../api/types";
import {
  editableReimbursement,
  reimbursementAction,
  reimbursementStatusLabel,
  yuanToCents
} from "./reimbursements";

function user(permissions: string[], id = "user-1"): SessionUser {
  return {
    id,
    username: "tester",
    displayName: "测试用户",
    role: "EMPLOYEE",
    roles: ["EMPLOYEE"],
    branchId: null,
    supplierId: null,
    personId: null,
    employeeType: "内部员工",
    projectIds: [],
    permissions,
    scopeBindings: [],
    authorizationGrants: []
  };
}

function batch(status: Reimbursement["status"], applicantUserId = "user-1"): Reimbursement {
  return {
    id: "batch-1",
    code: "BX-001",
    title: "差旅报销",
    applicantUserId,
    applicant: { id: applicantUserId, displayName: "申请人" },
    status,
    totalPaymentCents: 10000,
    totalInvoiceCents: 10000,
    invoiceExcessCents: 0,
    version: 1,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    lines: [],
    attachments: [],
    issues: [],
    approvals: [],
    artifacts: []
  };
}

describe("报销小程序领域规则", () => {
  it("按当前节点和权限给出唯一下一步动作", () => {
    expect(reimbursementAction(user(["reimbursement:self"]), batch("PENDING_SUBMISSION")))
      .toMatchObject({ label: "提交部门制单", targetStatus: "DEPARTMENT_PREPARING" });
    expect(reimbursementAction(user(["reimbursement:approve"]), batch("OWNER_REVIEWING", "other")))
      .toMatchObject({ label: "负责人审核通过", targetStatus: "FINANCE_REVIEWING" });
    expect(reimbursementAction(user(["reimbursement:pay"]), batch("PENDING_PAYMENT", "other")))
      .toMatchObject({ kind: "payment", label: "登记付款" });
  });

  it("仅申请人或制单人在可编辑节点维护明细附件", () => {
    expect(editableReimbursement(user(["reimbursement:self"]), batch("PENDING_SUBMISSION"))).toBe(true);
    expect(editableReimbursement(user(["reimbursement:self"], "other"), batch("PENDING_SUBMISSION"))).toBe(false);
    expect(editableReimbursement(user(["reimbursement:manage"], "clerk"), batch("DEPARTMENT_PREPARING"))).toBe(true);
    expect(editableReimbursement(user(["reimbursement:manage"], "clerk"), batch("OWNER_REVIEWING"))).toBe(false);
  });

  it("金额按人民币元精确转换为分", () => {
    expect(yuanToCents("123.45")).toBe(12345);
    expect(yuanToCents("0")).toBeNull();
    expect(yuanToCents("12.345")).toBeNull();
  });

  it("报销状态显示中文业务节点", () => {
    expect(reimbursementStatusLabel("FINANCE_REVIEWING")).toBe("财务审核中");
    expect(reimbursementStatusLabel("PAID")).toBe("已付款");
  });
});
