const MONEY_SCALE = 100;
const toCents = (value: number | string) => Math.round(Number(value || 0) * MONEY_SCALE);
const fromCents = (value: number) => Number((value / MONEY_SCALE).toFixed(2));

export type ReimbursementAttachmentLike = {
  id: string;
  type: "INVOICE" | "PAYMENT_PROOF";
  sortOrder: number;
};

export type ReimbursementDetailLike = {
  id: string;
  sequence: number;
  reimburserId: string;
  reimburserName: string;
  expenseTypeId: string;
  expenseTypeName: string;
  purpose: string;
  paymentAmount: number | string;
  invoiceAmount: number | string;
  attachments: readonly ReimbursementAttachmentLike[];
};

export function canSubmitReimbursement(paymentAmount: number | string, invoiceAmount: number | string) {
  const payment = toCents(paymentAmount);
  const invoice = toCents(invoiceAmount);
  const difference = invoice - payment;
  return {
    allowed: difference > 0,
    missingAmount: difference > 0 ? 0 : fromCents(Math.max(payment - invoice + 1, 1)),
    difference: fromCents(Math.max(difference, 0))
  };
}

export function buildReimbursementSummaries(details: readonly ReimbursementDetailLike[]) {
  const ordered = [...details].sort((a, b) => a.sequence - b.sequence);
  const typeMap = new Map<string, { expenseTypeId: string; expenseTypeName: string; paymentCents: number; invoiceCents: number }>();
  const personMap = new Map<string, { reimburserId: string; reimburserName: string; paymentCents: number }>();

  for (const detail of ordered) {
    const type = typeMap.get(detail.expenseTypeId) ?? {
      expenseTypeId: detail.expenseTypeId,
      expenseTypeName: detail.expenseTypeName,
      paymentCents: 0,
      invoiceCents: 0
    };
    type.paymentCents += toCents(detail.paymentAmount);
    type.invoiceCents += toCents(detail.invoiceAmount);
    typeMap.set(detail.expenseTypeId, type);

    const person = personMap.get(detail.reimburserId) ?? {
      reimburserId: detail.reimburserId,
      reimburserName: detail.reimburserName,
      paymentCents: 0
    };
    person.paymentCents += toCents(detail.paymentAmount);
    personMap.set(detail.reimburserId, person);
  }

  return {
    table1: [...typeMap.values()].map((row) => ({
      expenseTypeId: row.expenseTypeId,
      expenseTypeName: row.expenseTypeName,
      paymentAmount: fromCents(row.paymentCents),
      invoiceAmount: fromCents(row.invoiceCents)
    })),
    table2: [...personMap.values()].map((row) => ({
      reimburserId: row.reimburserId,
      reimburserName: row.reimburserName,
      reimbursementTotal: fromCents(row.paymentCents)
    })),
    table3: ordered.map((detail) => ({
      detailId: detail.id,
      sequence: detail.sequence,
      reimburserId: detail.reimburserId,
      reimburserName: detail.reimburserName,
      purpose: detail.purpose,
      paymentAmount: fromCents(toCents(detail.paymentAmount)),
      invoiceAmount: fromCents(toCents(detail.invoiceAmount))
    }))
  };
}

export function createAttachmentPrintOrder(
  details: readonly ReimbursementDetailLike[],
  type: ReimbursementAttachmentLike["type"]
) {
  return [...details]
    .sort((a, b) => a.sequence - b.sequence)
    .flatMap((detail) => detail.attachments
      .filter((attachment) => attachment.type === type)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((attachment, index) => ({
        attachmentId: attachment.id,
        detailSequence: detail.sequence,
        printSequence: `${detail.sequence}-${index + 1}`,
        reimburserName: detail.reimburserName,
        purpose: detail.purpose,
        amount: type === "INVOICE" ? Number(detail.invoiceAmount) : Number(detail.paymentAmount)
      }))
  );
}
