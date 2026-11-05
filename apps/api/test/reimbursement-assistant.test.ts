import { describe, expect, it } from "vitest";
import { processZeroFrictionReimbursement } from "../src/services/reimbursement-assistant.js";

describe("zero friction assistant", () => {
  it("converts amounts and handles empty invoice", () => {
    const result = processZeroFrictionReimbursement({
      lines: [
        { id: "L1", sequence: 1, paymentAmount: "12.34" },
        { id: "L2", sequence: 2, paymentAmount: 50, invoiceAmount: 40 },
        { id: "L3", sequence: 3, paymentAmount: "100.00", invoiceAmount: "120.00" }
      ],
      attachments: []
    });

    expect(result.lines[0].paymentCents).toBe(1234);
    expect(result.lines[0].invoiceCents).toBe(1234); // Auto filled

    expect(result.lines[1].paymentCents).toBe(5000);
    expect(result.lines[1].invoiceCents).toBe(4000);

    expect(result.lines[2].paymentCents).toBe(10000);
    expect(result.lines[2].invoiceCents).toBe(12000);

    expect(result.prompts.some(p => p.includes("发票金额未填"))).toBe(true);
    expect(result.prompts.some(p => p.includes("低于付款金额"))).toBe(true);
  });

  it("deduplicates invoices silently", () => {
    const result = processZeroFrictionReimbursement({
      lines: [],
      attachments: [
        { id: "A1", type: "INVOICE", sha256: "hash1" },
        { id: "A2", type: "INVOICE", sha256: "hash1" },
        { id: "A3", type: "INVOICE", sha256: "hash2" },
      ],
      existingInvoiceHashes: new Set(["hash2"])
    });

    expect(result.attachments.length).toBe(1);
    expect(result.attachments[0].id).toBe("A1");
    expect(result.prompts.some(p => p.includes("重复"))).toBe(true);
  });
});
