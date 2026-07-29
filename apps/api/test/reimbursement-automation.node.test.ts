import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDepartmentSummaries,
  buildPaymentRoster,
  validateApprovedAmount,
  validateDepartmentBatchSelection,
  validateReimbursementSubmission
} from "../src/services/reimbursement-automation.ts";

test("submission validation completes deterministic amount and attachment checks", () => {
  const result = validateReimbursementSubmission({
    lines: [
      { id: "line-1", sequence: 1, paymentCents: 10000, invoiceCents: 10000 },
      { id: "line-2", sequence: 2, paymentCents: 20000, invoiceCents: 19000 }
    ],
    attachments: [
      { id: "pv-1", lineId: "line-1", type: "PAYMENT_VOUCHER", sha256: "pv-a" },
      { id: "inv-1", lineId: "line-1", type: "INVOICE", sha256: "inv-a" },
      { id: "inv-2", lineId: "line-2", type: "INVOICE", sha256: "inv-b" }
    ],
    existingInvoiceHashes: new Set(["inv-a"])
  });

  assert.equal(result.valid, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code).sort(),
    ["DUPLICATE_INVOICE", "INVOICE_BELOW_PAYMENT", "PAYMENT_VOUCHER_REQUIRED"].sort()
  );
});

test("identical invoice files inside one submission are blocked automatically", () => {
  const result = validateReimbursementSubmission({
    lines: [
      { id: "line-1", sequence: 1, paymentCents: 10000, invoiceCents: 10000 },
      { id: "line-2", sequence: 2, paymentCents: 10000, invoiceCents: 10000 }
    ],
    attachments: [
      { id: "pv-1", lineId: "line-1", type: "PAYMENT_VOUCHER", sha256: "pv-a" },
      { id: "inv-1", lineId: "line-1", type: "INVOICE", sha256: "same-invoice" },
      { id: "pv-2", lineId: "line-2", type: "PAYMENT_VOUCHER", sha256: "pv-b" },
      { id: "inv-2", lineId: "line-2", type: "INVOICE", sha256: "same-invoice" }
    ]
  });

  assert.equal(result.valid, false);
  assert.equal(result.issues.filter((issue) => issue.code === "DUPLICATE_INVOICE").length, 2);
});

test("department summaries group personal submissions into one finance audit row", () => {
  const summaries = buildDepartmentSummaries([
    {
      id: "b1", organizationUnitId: "org-1", organizationUnitName: "人力资源部",
      applicantUserId: "u1", applicantName: "甲", status: "FINANCE_REVIEWING",
      totalPaymentCents: 10000, totalInvoiceCents: 10000, openIssueCount: 0,
      createdAt: "2026-07-02T00:00:00.000Z"
    },
    {
      id: "b2", organizationUnitId: "org-1", organizationUnitName: "人力资源部",
      applicantUserId: "u2", applicantName: "乙", status: "FINANCE_REVIEWING",
      totalPaymentCents: 20000, totalInvoiceCents: 21000, openIssueCount: 1,
      createdAt: "2026-07-16T00:00:00.000Z"
    }
  ]);

  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0], {
    key: "org-1:2026-07",
    period: "2026-07",
    organizationUnitId: "org-1",
    organizationUnitName: "人力资源部",
    batchCount: 2,
    applicantCount: 2,
    totalPaymentCents: 30000,
    totalApprovedAmountCents: 0,
    totalInvoiceCents: 31000,
    openIssueCount: 1,
    readyForFinance: false,
    statusCounts: { FINANCE_REVIEWING: 2 },
    batchIds: ["b1", "b2"],
    categorySummaries: [],
    applicantSummaries: [
      { applicantUserId: "u1", applicantName: "甲", batchCount: 1, totalPaymentCents: 10000, totalApprovedAmountCents: 0, totalInvoiceCents: 10000 },
      { applicantUserId: "u2", applicantName: "乙", batchCount: 1, totalPaymentCents: 20000, totalApprovedAmountCents: 0, totalInvoiceCents: 21000 }
    ],
    detailRows: []
  });
});

test("department summary automatically includes category, applicant and detail tables", () => {
  const [summary] = buildDepartmentSummaries([{
    id: "b1", code: "BX-1", organizationUnitId: "org-1", organizationUnitName: "财务规划部",
    applicantUserId: "u1", applicantName: "甲", status: "FINANCE_REVIEWING",
    totalPaymentCents: 30000, totalInvoiceCents: 31000, openIssueCount: 0,
    createdAt: "2026-07-02T00:00:00.000Z",
    lines: [
      { id: "l1", sequence: 1, category: "差旅费", description: "项目巡检", paymentCents: 20000, invoiceCents: 21000 },
      { id: "l2", sequence: 2, category: "办公费", description: "打印耗材", paymentCents: 10000, invoiceCents: 10000 }
    ]
  }]);

  assert.deepEqual(summary.categorySummaries, [
    { category: "办公费", lineCount: 1, totalPaymentCents: 10000, totalInvoiceCents: 10000 },
    { category: "差旅费", lineCount: 1, totalPaymentCents: 20000, totalInvoiceCents: 21000 }
  ]);
  assert.deepEqual(summary.applicantSummaries, [{
    applicantUserId: "u1", applicantName: "甲", batchCount: 1,
    totalPaymentCents: 30000, totalApprovedAmountCents: 0, totalInvoiceCents: 31000
  }]);
  assert.deepEqual(summary.detailRows.map((row) => [row.code, row.applicantName, row.category, row.description]), [
    ["BX-1", "甲", "差旅费", "项目巡检"],
    ["BX-1", "甲", "办公费", "打印耗材"]
  ]);
});

test("payment roster uses approved amount once and reflects payment result", () => {
  const rows = buildPaymentRoster([
    {
      id: "b1", code: "BX-1", organizationUnitId: "org-1", organizationUnitName: "人力资源部",
      applicantUserId: "u1", applicantName: "甲", payeeAccount: "6222", payeeBank: "工行",
      status: "PENDING_PAYMENT", totalPaymentCents: 18800, approvedAmountCents: 17500, createdAt: "2026-07-02T00:00:00.000Z",
      payment: null
    },
    {
      id: "b2", code: "BX-2", organizationUnitId: "org-1", organizationUnitName: "人力资源部",
      applicantUserId: "u2", applicantName: "乙", payeeAccount: "6333", payeeBank: "建行",
      status: "PAID", totalPaymentCents: 9900, createdAt: "2026-07-03T00:00:00.000Z",
      payment: { amountCents: 9900, paidAt: "2026-07-20T00:00:00.000Z", reference: "PAY-2" }
    }
  ]);

  assert.deepEqual(rows.map((row) => [row.applicantName, row.approvedAmountCents, row.paymentStatus]), [
    ["甲", 17500, "PENDING"],
    ["乙", 9900, "PAID"]
  ]);
});


test("finance-approved amount defaults to requested amount but never exceeds it", () => {
  assert.deepEqual(validateApprovedAmount(18800, undefined), {
    valid: true,
    approvedAmountCents: 18800
  });
  assert.deepEqual(validateApprovedAmount(18800, 17500), {
    valid: true,
    approvedAmountCents: 17500
  });
  assert.equal(validateApprovedAmount(18800, 19000).valid, false);
  assert.equal(validateApprovedAmount(18800, 0).valid, false);
});

test("department transition only accepts one real organization and one month", () => {
  assert.deepEqual(validateDepartmentBatchSelection([
    { id: "b1", organizationUnitId: "org-1", createdAt: "2026-07-02T00:00:00.000Z" },
    { id: "b2", organizationUnitId: "org-1", createdAt: "2026-07-28T00:00:00.000Z" }
  ]), { valid: true, organizationUnitId: "org-1", period: "2026-07" });

  assert.equal(validateDepartmentBatchSelection([
    { id: "b1", organizationUnitId: "org-1", createdAt: "2026-07-02T00:00:00.000Z" },
    { id: "b2", organizationUnitId: "org-2", createdAt: "2026-07-28T00:00:00.000Z" }
  ]).valid, false);
  assert.equal(validateDepartmentBatchSelection([
    { id: "b1", organizationUnitId: "org-1", createdAt: "2026-07-02T00:00:00.000Z" },
    { id: "b2", organizationUnitId: "org-1", createdAt: "2026-08-01T00:00:00.000Z" }
  ]).valid, false);
});
