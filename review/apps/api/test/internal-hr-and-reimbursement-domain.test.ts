import { describe, expect, it } from "vitest";
import {
  canPhysicallyDeleteInternalEmployee,
  createImmediateTransferPlan,
  normalizeRosterStatus
} from "../src/services/internal-employee-domain.js";
import {
  buildReimbursementSummaries,
  canSubmitReimbursement,
  createAttachmentPrintOrder
} from "../src/services/reimbursement-domain.js";

describe("内部人事领域规则", () => {
  it("只有无账号、无变更、无业务数据的错误记录才允许物理删除", () => {
    expect(canPhysicallyDeleteInternalEmployee({ hasUser: false, changeCount: 0, businessRecordCount: 0 })).toBe(true);
    expect(canPhysicallyDeleteInternalEmployee({ hasUser: true, changeCount: 0, businessRecordCount: 0 })).toBe(false);
    expect(canPhysicallyDeleteInternalEmployee({ hasUser: false, changeCount: 1, businessRecordCount: 0 })).toBe(false);
    expect(canPhysicallyDeleteInternalEmployee({ hasUser: false, changeCount: 0, businessRecordCount: 1 })).toBe(false);
  });

  it("部门转移会关闭原部门范围权限，但保留集团范围权限", () => {
    const plan = createImmediateTransferPlan({
      oldDepartmentId: "dept-old",
      nextDepartmentId: "dept-new",
      assignments: [
        { id: "a1", departmentId: "dept-old", scope: "DEPARTMENT", isActive: true },
        { id: "a2", departmentId: null, scope: "GROUP", isActive: true },
        { id: "a3", departmentId: "dept-other", scope: "DEPARTMENT", isActive: true }
      ]
    });
    expect(plan.assignmentIdsToDeactivate).toEqual(["a1"]);
    expect(plan.nextDepartmentId).toBe("dept-new");
  });

  it("花名册状态统一映射为内部员工状态", () => {
    expect(normalizeRosterStatus("在职")).toBe("ACTIVE");
    expect(normalizeRosterStatus("离职")).toBe("LEFT");
    expect(normalizeRosterStatus("停薪留职")).toBe("SUSPENDED");
  });
});

describe("报销领域规则", () => {
  const details = [
    { id: "d2", sequence: 2, reimburserId: "u1", reimburserName: "张三", expenseTypeId: "t1", expenseTypeName: "餐饮类", purpose: "项目员工餐费", paymentAmount: 100, invoiceAmount: 120, attachments: [{ id: "p2", type: "PAYMENT_PROOF", sortOrder: 0 }, { id: "i2", type: "INVOICE", sortOrder: 0 }] },
    { id: "d1", sequence: 1, reimburserId: "u2", reimburserName: "李四", expenseTypeId: "t2", expenseTypeName: "交通类", purpose: "异常处理交通费", paymentAmount: 50, invoiceAmount: 60, attachments: [{ id: "p1", type: "PAYMENT_PROOF", sortOrder: 0 }, { id: "i1a", type: "INVOICE", sortOrder: 0 }, { id: "i1b", type: "INVOICE", sortOrder: 1 }] }
  ] as const;

  it("发票金额必须严格大于付款金额，金额相等也不能提交", () => {
    expect(canSubmitReimbursement(100, 100)).toEqual({ allowed: false, missingAmount: 0.01, difference: 0 });
    expect(canSubmitReimbursement(100, 100.01)).toEqual({ allowed: true, missingAmount: 0, difference: 0.01 });
  });

  it("三张表由同一明细自动生成并保持稳定序号", () => {
    const summaries = buildReimbursementSummaries(details);
    expect(summaries.table1).toEqual([
      { expenseTypeId: "t2", expenseTypeName: "交通类", paymentAmount: 50, invoiceAmount: 60 },
      { expenseTypeId: "t1", expenseTypeName: "餐饮类", paymentAmount: 100, invoiceAmount: 120 }
    ]);
    expect(summaries.table2).toEqual([
      { reimburserId: "u2", reimburserName: "李四", reimbursementTotal: 50 },
      { reimburserId: "u1", reimburserName: "张三", reimbursementTotal: 100 }
    ]);
    expect(summaries.table3.map((row) => row.sequence)).toEqual([1, 2]);
  });

  it("付款凭证和发票分开排序，并沿用表3序号和子序号", () => {
    expect(createAttachmentPrintOrder(details, "PAYMENT_PROOF").map((row) => row.printSequence)).toEqual(["1-1", "2-1"]);
    expect(createAttachmentPrintOrder(details, "INVOICE").map((row) => row.printSequence)).toEqual(["1-1", "1-2", "2-1"]);
  });
});
