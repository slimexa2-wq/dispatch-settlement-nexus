import { describe, expect, it } from "vitest";
import { AppError } from "../src/errors.js";
import {
  assertFinalPaymentProof,
  assertReimbursementApprovalLimit,
  normalizeEmployeeReimbursementScope,
  reimbursementAttachmentUploadAuthorization,
  summarizeReimbursement,
  validateReimbursementLine
} from "../src/services/reimbursements.js";

const line = {
  sequence: 1,
  description: "交通费",
  paymentCents: 10000,
  invoiceCents: 10000
};

describe("报销金额校验", () => {
  it("允许发票金额等于实际付款金额", () => {
    expect(() => validateReimbursementLine(line)).not.toThrow();
    expect(summarizeReimbursement([line])).toEqual({
      lineCount: 1,
      totalPaymentCents: 10000,
      totalInvoiceCents: 10000,
      invoiceExcessCents: 0
    });
  });

  it("发票金额低于付款金额时拒绝提交", () => {
    expect(() => validateReimbursementLine({ ...line, invoiceCents: 9999 }))
      .toThrowError(expect.objectContaining<AppError>({
        code: "INVOICE_BELOW_PAYMENT"
      }));
  });
});


describe("员工自助报销归属", () => {
  const employee = { organizationUnitId: "org-1" };

  it("始终从当前内部员工档案带出部门，分公司归属固定为空", () => {
    expect(normalizeEmployeeReimbursementScope({}, employee)).toEqual({
      branchId: null,
      organizationUnitId: "org-1",
      projectId: null,
      supplierId: null
    });
  });

  it("拒绝申请人伪造其他组织归属", () => {
    expect(() => normalizeEmployeeReimbursementScope(
      { organizationUnitId: "org-2" },
      employee
    )).toThrowError(expect.objectContaining<AppError>({ code: "OUT_OF_SCOPE" }));
  });

  it("内部员工未绑定部门时拒绝发起报销", () => {
    expect(() => normalizeEmployeeReimbursementScope(
      {},
      { organizationUnitId: null }
    )).toThrowError(expect.objectContaining<AppError>({
      code: "INTERNAL_EMPLOYEE_ORG_REQUIRED"
    }));
  });
});

describe("审核阶段补充材料权限", () => {
  const base = {
    status: "OWNER_REVIEWING" as const,
    applicantUserId: "employee-1",
    userId: "employee-1",
    permissions: ["reimbursement:self"],
    openIssueCount: 1
  };

  it("申请人有待处理问题时只能补传整单辅助材料", () => {
    expect(reimbursementAttachmentUploadAuthorization({
      ...base,
      type: "SUPPORTING",
      lineId: null
    })).toEqual({ mode: "APPLICANT_SUPPLEMENT", permission: "reimbursement:self" });

    expect(reimbursementAttachmentUploadAuthorization({
      ...base,
      type: "INVOICE",
      lineId: "line-1"
    })).toBeNull();
  });

  it("没有待处理问题时不能在审核阶段补传材料", () => {
    expect(reimbursementAttachmentUploadAuthorization({
      ...base,
      openIssueCount: 0,
      type: "SUPPORTING",
      lineId: null
    })).toBeNull();
  });
});


describe("职级报销审批上限", () => {
  it("未配置审批上限时保持兼容", () => {
    expect(() => assertReimbursementApprovalLimit(500000, null)).not.toThrow();
  });

  it("金额超过当前职级上限时拒绝审批", () => {
    expect(() => assertReimbursementApprovalLimit(500001, 500000))
      .toThrowError(expect.objectContaining<AppError>({
        code: "REIMBURSEMENT_APPROVAL_LIMIT_EXCEEDED"
      }));
  });
});


describe("最终付款凭证", () => {
  const attachments = [
    { id: "line-proof", type: "PAYMENT_VOUCHER" as const, lineId: "line-1" },
    { id: "final-proof", type: "PAYMENT_VOUCHER" as const, lineId: null }
  ];

  it("付款登记必须引用当前报销单的整单最终付款凭证", () => {
    expect(assertFinalPaymentProof(attachments, "final-proof")).toMatchObject({
      id: "final-proof",
      lineId: null
    });
    expect(() => assertFinalPaymentProof(attachments, null))
      .toThrowError(expect.objectContaining<AppError>({ code: "PAYMENT_PROOF_REQUIRED" }));
    expect(() => assertFinalPaymentProof(attachments, "line-proof"))
      .toThrowError(expect.objectContaining<AppError>({ code: "INVALID_PAYMENT_PROOF" }));
  });
});
