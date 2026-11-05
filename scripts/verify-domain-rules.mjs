import assert from "node:assert/strict";
import {
  canPhysicallyDeleteInternalEmployee,
  createImmediateTransferPlan,
  normalizeRosterStatus
} from "../review/apps/api/src/services/internal-employee-domain.ts";
import {
  buildReimbursementSummaries,
  canSubmitReimbursement,
  createAttachmentPrintOrder
} from "../review/apps/api/src/services/reimbursement-domain.ts";

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
};

check("错误人员记录仅在无账号、无变更、无业务数据时允许物理删除", () => {
  assert.equal(canPhysicallyDeleteInternalEmployee({ hasUser: false, changeCount: 0, businessRecordCount: 0 }), true);
  assert.equal(canPhysicallyDeleteInternalEmployee({ hasUser: true, changeCount: 0, businessRecordCount: 0 }), false);
  assert.equal(canPhysicallyDeleteInternalEmployee({ hasUser: false, changeCount: 1, businessRecordCount: 0 }), false);
  assert.equal(canPhysicallyDeleteInternalEmployee({ hasUser: false, changeCount: 0, businessRecordCount: 1 }), false);
});

check("部门调动只关闭原部门范围权限", () => {
  const plan = createImmediateTransferPlan({
    oldDepartmentId: "dept-old",
    nextDepartmentId: "dept-new",
    assignments: [
      { id: "a1", departmentId: "dept-old", scope: "DEPARTMENT", isActive: true },
      { id: "a2", departmentId: null, scope: "GROUP", isActive: true },
      { id: "a3", departmentId: "dept-other", scope: "DEPARTMENT", isActive: true }
    ]
  });
  assert.deepEqual(plan.assignmentIdsToDeactivate, ["a1"]);
  assert.equal(plan.nextDepartmentId, "dept-new");
});

check("花名册状态映射稳定", () => {
  assert.equal(normalizeRosterStatus("在职"), "ACTIVE");
  assert.equal(normalizeRosterStatus("离职"), "LEFT");
  assert.equal(normalizeRosterStatus("停薪留职"), "SUSPENDED");
});

const details = [
  { id: "d2", sequence: 2, reimburserId: "u1", reimburserName: "张三", expenseTypeId: "t1", expenseTypeName: "餐饮类", purpose: "项目员工餐费", paymentAmount: 100, invoiceAmount: 120, attachments: [{ id: "p2", type: "PAYMENT_PROOF", sortOrder: 0 }, { id: "i2", type: "INVOICE", sortOrder: 0 }] },
  { id: "d1", sequence: 1, reimburserId: "u2", reimburserName: "李四", expenseTypeId: "t2", expenseTypeName: "交通类", purpose: "异常处理交通费", paymentAmount: 50, invoiceAmount: 60, attachments: [{ id: "p1", type: "PAYMENT_PROOF", sortOrder: 0 }, { id: "i1a", type: "INVOICE", sortOrder: 0 }, { id: "i1b", type: "INVOICE", sortOrder: 1 }] }
];

check("发票金额必须严格大于付款金额", () => {
  assert.deepEqual(canSubmitReimbursement(100, 100), { allowed: false, missingAmount: 0.01, difference: 0 });
  assert.deepEqual(canSubmitReimbursement(100, 100.01), { allowed: true, missingAmount: 0, difference: 0.01 });
});

check("三张表由同一明细生成并保持稳定序号", () => {
  const summaries = buildReimbursementSummaries(details);
  assert.deepEqual(summaries.table3.map((row) => row.sequence), [1, 2]);
  assert.equal(summaries.table1.reduce((sum, row) => sum + row.paymentAmount, 0), 150);
  assert.equal(summaries.table2.reduce((sum, row) => sum + row.reimbursementTotal, 0), 150);
});

check("付款凭证与发票打印顺序分开", () => {
  assert.deepEqual(createAttachmentPrintOrder(details, "PAYMENT_PROOF").map((row) => row.printSequence), ["1-1", "2-1"]);
  assert.deepEqual(createAttachmentPrintOrder(details, "INVOICE").map((row) => row.printSequence), ["1-1", "1-2", "2-1"]);
});

console.log(`Domain verification passed: ${passed} checks`);
