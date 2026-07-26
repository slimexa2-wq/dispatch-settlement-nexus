import { describe, expect, it } from "vitest";
import {
  createReimbursementWorkbook,
  createStoredZip
} from "../src/services/reimbursement-artifacts.js";

describe("报销最终生成物", () => {
  it("生成可下载的Excel报销单并包含完整金额口径", () => {
    const workbook = createReimbursementWorkbook({
      code: "BX-202607-0001",
      title: "宜宾分公司七月差旅报销",
      status: "APPROVED",
      applicantName: "张伟",
      branchName: "宜宾分公司",
      organizationUnitName: "运营管理部",
      totalPaymentCents: 28_000_00,
      totalInvoiceCents: 28_200_00,
      invoiceExcessCents: 200_00,
      lines: [{
        sequence: 1,
        expenseDate: new Date("2026-07-20T00:00:00.000Z"),
        category: "差旅费",
        description: "宜宾至成都项目巡检",
        payeeName: "张伟",
        paymentCents: 28_000_00,
        invoiceCents: 28_200_00
      }]
    });

    expect(workbook.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(workbook.length).toBeGreaterThan(1_000);
  });

  it("按顺序生成标准ZIP材料包并保留缺件占位说明", () => {
    const archive = createStoredZip([
      { name: "001-付款凭证.pdf", content: Buffer.from("%PDF-synthetic") },
      { name: "002-缺少付款凭证.txt", content: Buffer.from("第2项缺少付款凭证", "utf8") }
    ]);

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.includes(Buffer.from("001-付款凭证.pdf", "utf8"))).toBe(true);
    expect(archive.includes(Buffer.from("002-缺少付款凭证.txt", "utf8"))).toBe(true);
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
  });
});
