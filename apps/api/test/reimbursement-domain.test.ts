import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/errors.js";
import {
  buildReimbursementArtifactPlan,
  summarizeReimbursement,
  transitionReimbursement,
  validateReimbursementLine
} from "../src/services/reimbursements.js";

describe("报销七态领域", () => {
  it.each([
    { paymentCents: 10_000, invoiceCents: 10_000 },
    { paymentCents: 10_000, invoiceCents: 9_999 }
  ])("发票金额不严格大于付款金额时拒绝", (line) => {
    expect(() =>
      validateReimbursementLine({
        sequence: 1,
        description: "差旅费用",
        ...line
      })
    ).toThrowError(
      expect.objectContaining({ code: "INVOICE_MUST_EXCEED_PAYMENT" })
    );
  });

  it("汇总金额只由正式明细计算，不接受前端合计", () => {
    expect(
      summarizeReimbursement([
        { sequence: 2, description: "住宿", paymentCents: 20_000, invoiceCents: 20_100 },
        { sequence: 1, description: "交通", paymentCents: 8_000, invoiceCents: 8_100 }
      ])
    ).toEqual({
      lineCount: 2,
      totalPaymentCents: 28_000,
      totalInvoiceCents: 28_200,
      invoiceExcessCents: 200
    });
  });

  it("禁止从部门制单中跳过负责人审核直接进入财务审核", async () => {
    const tx = {
      reimbursementBatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: "batch-1",
          status: "DEPARTMENT_PREPARING",
          version: 2,
          issues: []
        }),
        update: vi.fn()
      },
      reimbursementApproval: { create: vi.fn() }
    };

    await expect(
      transitionReimbursement(tx, {
        batchId: "batch-1",
        actorId: "actor-1",
        expectedVersion: 2,
        targetStatus: "FINANCE_REVIEWING",
        permission: "reimbursement:approve"
      })
    ).rejects.toMatchObject<AppError>({
      code: "INVALID_REIMBURSEMENT_TRANSITION",
      statusCode: 409
    });
  });

  it("未解决问题和并发版本变化都会阻止状态推进", async () => {
    const tx = {
      reimbursementBatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: "batch-1",
          status: "OWNER_REVIEWING",
          version: 3,
          issues: [{ id: "issue-1", status: "OPEN" }]
        }),
        update: vi.fn()
      },
      reimbursementApproval: { create: vi.fn() }
    };

    await expect(
      transitionReimbursement(tx, {
        batchId: "batch-1",
        actorId: "actor-1",
        expectedVersion: 3,
        targetStatus: "FINANCE_REVIEWING",
        permission: "reimbursement:approve"
      })
    ).rejects.toMatchObject({ code: "UNRESOLVED_REIMBURSEMENT_ISSUES" });

    tx.reimbursementBatch.findUnique.mockResolvedValueOnce({
      id: "batch-1",
      status: "OWNER_REVIEWING",
      version: 4,
      issues: []
    });
    await expect(
      transitionReimbursement(tx, {
        batchId: "batch-1",
        actorId: "actor-1",
        expectedVersion: 3,
        targetStatus: "FINANCE_REVIEWING",
        permission: "reimbursement:approve"
      })
    ).rejects.toMatchObject({ code: "CONCURRENT_MODIFICATION" });
  });

  it("付款包、发票包和报销单共用明细顺序，缺失附件进入提示页", () => {
    const plan = buildReimbursementArtifactPlan({
      id: "batch-1",
      code: "BX-2026-001",
      lines: [
        {
          id: "line-2",
          sequence: 2,
          description: "住宿",
          paymentCents: 20_000,
          invoiceCents: 20_100,
          attachments: [
            { id: "attachment-2", type: "INVOICE", originalName: "住宿发票.pdf" }
          ]
        },
        {
          id: "line-1",
          sequence: 1,
          description: "交通",
          paymentCents: 8_000,
          invoiceCents: 8_100,
          attachments: [
            { id: "attachment-1", type: "PAYMENT_VOUCHER", originalName: "交通付款截图.png" },
            { id: "attachment-3", type: "INVOICE", originalName: "交通发票.pdf" }
          ]
        }
      ]
    });

    expect(plan.map((item) => item.type)).toEqual([
      "REIMBURSEMENT_FORM",
      "PAYMENT_PACKAGE",
      "INVOICE_PACKAGE"
    ]);
    expect(plan[1]?.entries.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(plan[1]?.entries[1]).toMatchObject({
      sequence: 2,
      placeholder: true,
      message: "缺少付款凭证"
    });
    expect(plan[2]?.entries.map((entry) => entry.sequence)).toEqual([1, 2]);
  });
});
