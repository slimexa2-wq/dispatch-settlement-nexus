ALTER TABLE "reimbursement_lines"
  DROP CONSTRAINT IF EXISTS "reimbursement_lines_invoice_check";
ALTER TABLE "reimbursement_lines"
  ADD CONSTRAINT "reimbursement_lines_invoice_check"
  CHECK ("invoice_cents" >= "payment_cents");
