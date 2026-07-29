import assert from "node:assert/strict";
import test from "node:test";

import {
  departmentSummaryApplicantPreview,
  departmentSummaryCategoryPreview
} from "../src/domain/reimbursements.ts";

test("小程序部门汇总直接展示费用类型自动汇总", () => {
  const preview = departmentSummaryCategoryPreview([
    { category: "差旅费", lineCount: 2, totalPaymentCents: 12345, totalInvoiceCents: 12000 },
    { category: "办公费", lineCount: 1, totalPaymentCents: 5000, totalInvoiceCents: 5000 }
  ]);

  assert.equal(preview, "差旅费 2笔 ¥123.45；办公费 1笔 ¥50.00");
});

test("小程序部门汇总直接展示报销人自动汇总并限制预览数量", () => {
  const preview = departmentSummaryApplicantPreview([
    { applicantUserId: "u1", applicantName: "张三", batchCount: 2, totalPaymentCents: 10000, totalApprovedAmountCents: 9000, totalInvoiceCents: 10000 },
    { applicantUserId: "u2", applicantName: "李四", batchCount: 1, totalPaymentCents: 8000, totalApprovedAmountCents: 8000, totalInvoiceCents: 8000 },
    { applicantUserId: "u3", applicantName: "王五", batchCount: 1, totalPaymentCents: 6000, totalApprovedAmountCents: 0, totalInvoiceCents: 6000 },
    { applicantUserId: "u4", applicantName: "赵六", batchCount: 1, totalPaymentCents: 4000, totalApprovedAmountCents: 0, totalInvoiceCents: 4000 }
  ], 3);

  assert.equal(preview, "张三 ¥90.00；李四 ¥80.00；王五 ¥60.00；另1人");
});
