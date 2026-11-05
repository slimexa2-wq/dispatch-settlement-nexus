import type { SubmissionAttachment, SubmissionLine } from "./reimbursement-automation.js";
import { AppError } from "../errors.js";

export type ZeroFrictionLineInput = {
  id: string;
  sequence: number;
  paymentAmount: string | number;
  invoiceAmount?: string | number | null;
};

export type ZeroFrictionAttachmentInput = {
  id: string;
  type: "PAYMENT_VOUCHER" | "INVOICE" | "SUPPORTING";
  sha256: string;
};

export type ZeroFrictionResult = {
  lines: SubmissionLine[];
  attachments: SubmissionAttachment[];
  prompts: string[];
};

function parseAmountToCents(amount: string | number | null | undefined): number | null {
  if (amount == null) return null;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

export function processZeroFrictionReimbursement(input: {
  lines: readonly ZeroFrictionLineInput[];
  attachments: readonly ZeroFrictionAttachmentInput[];
  existingInvoiceHashes?: ReadonlySet<string>;
}): ZeroFrictionResult {
  const prompts: string[] = [];
  const processedLines: SubmissionLine[] = [];

  for (const line of input.lines) {
    const paymentCents = parseAmountToCents(line.paymentAmount);
    if (paymentCents == null || paymentCents <= 0) {
      throw new AppError(400, "INVALID_PAYMENT_AMOUNT", `第${line.sequence}笔付款金额无效`);
    }

    let invoiceCents = parseAmountToCents(line.invoiceAmount);
    if (invoiceCents == null) {
      invoiceCents = paymentCents;
      prompts.push(`第${line.sequence}笔发票金额未填，自动取付款金额`);
    } else if (invoiceCents < paymentCents) {
      prompts.push(`第${line.sequence}笔发票金额低于付款金额，请留意`);
    }

    processedLines.push({
      id: line.id,
      sequence: line.sequence,
      paymentCents,
      invoiceCents
    });
  }

  const processedAttachments: SubmissionAttachment[] = [];
  const seenHashes = new Set(input.existingInvoiceHashes);

  for (const attachment of input.attachments) {
    if (attachment.type === "INVOICE" && attachment.sha256) {
      if (seenHashes.has(attachment.sha256)) {
        prompts.push(`自动去重：发现重复发票附件（ID: ${attachment.id}）`);
        continue;
      }
      seenHashes.add(attachment.sha256);
    }
    processedAttachments.push({
      id: attachment.id,
      type: attachment.type,
      sha256: attachment.sha256,
      lineId: null // Zero friction mode might map these later, but for now we just keep the type signature matching
    });
  }

  return {
    lines: processedLines,
    attachments: processedAttachments,
    prompts
  };
}
