import assert from "node:assert/strict";
import test from "node:test";

import {
  createDepartmentSummaryCsv,
  createPaymentRosterCsv
} from "../src/domain/reimbursement-exports.ts";

test("department summary export uses the same automatic totals shown to finance", () => {
  const csv = createDepartmentSummaryCsv([{
    key: "org-1:2026-07",
    period: "2026-07",
    organizationUnitId: "org-1",
    organizationUnitName: "宜宾分公司",
    batchCount: 3,
    applicantCount: 2,
    totalPaymentCents: 12345,
    totalApprovedAmountCents: 12000,
    totalInvoiceCents: 12500,
    openIssueCount: 0,
    readyForFinance: true,
    statusCounts: { FINANCE_REVIEWING: 3 },
    batchIds: ["1", "2", "3"]
  }]);

  assert.match(csv, /^\uFEFF月份,部门,报销人数,报销笔数,申报金额\（元\）,审核通过金额\（元\）,发票金额\（元\）,未解决异常,状态/m);
  assert.match(csv, /2026-07,宜宾分公司,2,3,123\.45,120\.00,125\.00,0,财务审核中 3笔/);
});

test("payment roster export contains real account and approved amount once", () => {
  const csv = createPaymentRosterCsv([{
    batchId: "batch-1",
    code: "BX-001",
    organizationUnitId: "org-1",
    organizationUnitName: "宜宾分公司",
    applicantUserId: "u1",
    applicantName: "李某",
    payeeAccount: "622200001234",
    payeeBank: "中国工商银行",
    approvedAmountCents: 9876,
    paymentStatus: "PENDING",
    paidAmountCents: null,
    paidAt: null,
    paymentReference: null
  }]);

  assert.match(csv, /BX-001,李某,宜宾分公司,622200001234,中国工商银行,98\.76,待付款/);
});
