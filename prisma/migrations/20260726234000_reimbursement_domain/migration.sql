CREATE TYPE "ReimbursementStatus" AS ENUM (
  'PENDING_SUBMISSION',
  'DEPARTMENT_PREPARING',
  'OWNER_REVIEWING',
  'FINANCE_REVIEWING',
  'APPROVED',
  'PENDING_PAYMENT',
  'PAID'
);

CREATE TYPE "ReimbursementAttachmentType" AS ENUM (
  'PAYMENT_VOUCHER',
  'INVOICE',
  'SUPPORTING'
);

CREATE TYPE "ReimbursementIssueStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "ReimbursementApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'RETURNED');
CREATE TYPE "ReimbursementArtifactType" AS ENUM (
  'REIMBURSEMENT_FORM',
  'PAYMENT_PACKAGE',
  'INVOICE_PACKAGE'
);
CREATE TYPE "ReimbursementArtifactStatus" AS ENUM ('PENDING', 'GENERATED', 'FAILED');

CREATE TABLE "reimbursement_batches" (
  "id" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "applicant_user_id" UUID NOT NULL,
  "branch_id" UUID,
  "organization_unit_id" UUID,
  "project_id" UUID,
  "supplier_id" UUID,
  "status" "ReimbursementStatus" NOT NULL DEFAULT 'PENDING_SUBMISSION',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'CNY',
  "total_payment_cents" INTEGER NOT NULL DEFAULT 0,
  "total_invoice_cents" INTEGER NOT NULL DEFAULT 0,
  "invoice_excess_cents" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reimbursement_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reimbursement_batches_totals_check" CHECK (
    "total_payment_cents" >= 0
    AND "total_invoice_cents" >= 0
    AND "invoice_excess_cents" = "total_invoice_cents" - "total_payment_cents"
  ),
  CONSTRAINT "reimbursement_batches_version_check" CHECK ("version" > 0)
);

CREATE TABLE "reimbursement_lines" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "expense_date" DATE NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "payee_name" VARCHAR(120),
  "payee_account" VARCHAR(120),
  "payee_bank" VARCHAR(200),
  "payment_cents" INTEGER NOT NULL,
  "invoice_cents" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reimbursement_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reimbursement_lines_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "reimbursement_lines_payment_check" CHECK ("payment_cents" > 0),
  CONSTRAINT "reimbursement_lines_invoice_check" CHECK ("invoice_cents" > "payment_cents")
);

CREATE TABLE "reimbursement_attachments" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "line_id" UUID,
  "type" "ReimbursementAttachmentType" NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL,
  "original_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(128) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "uploaded_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reimbursement_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reimbursement_attachments_size_check" CHECK ("size_bytes" > 0)
);

CREATE TABLE "reimbursement_issues" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "line_id" UUID,
  "raised_by_id" UUID NOT NULL,
  "resolved_by_id" UUID,
  "type" VARCHAR(80) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "status" "ReimbursementIssueStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" VARCHAR(500),
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reimbursement_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reimbursement_issues_resolution_check" CHECK (
    ("status" = 'OPEN' AND "resolved_at" IS NULL)
    OR ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL)
  )
);

CREATE TABLE "reimbursement_approvals" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "from_status" "ReimbursementStatus" NOT NULL,
  "to_status" "ReimbursementStatus" NOT NULL,
  "decision" "ReimbursementApprovalDecision" NOT NULL,
  "comment" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reimbursement_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reimbursement_payments" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "reference" VARCHAR(120) NOT NULL,
  "paid_by_id" UUID NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL,
  "proof_attachment_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reimbursement_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reimbursement_payments_amount_check" CHECK ("amount_cents" > 0)
);

CREATE TABLE "reimbursement_artifacts" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "type" "ReimbursementArtifactType" NOT NULL,
  "status" "ReimbursementArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "storage_key" VARCHAR(500),
  "original_name" VARCHAR(255),
  "error" TEXT,
  "generated_by_id" UUID,
  "generated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reimbursement_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reimbursement_batches_code_key" ON "reimbursement_batches"("code");
CREATE UNIQUE INDEX "reimbursement_batches_id_version_key" ON "reimbursement_batches"("id", "version");
CREATE INDEX "reimbursement_batches_applicant_status_created_idx" ON "reimbursement_batches"("applicant_user_id", "status", "created_at");
CREATE INDEX "reimbursement_batches_branch_status_created_idx" ON "reimbursement_batches"("branch_id", "status", "created_at");
CREATE INDEX "reimbursement_batches_org_status_created_idx" ON "reimbursement_batches"("organization_unit_id", "status", "created_at");
CREATE INDEX "reimbursement_batches_project_status_created_idx" ON "reimbursement_batches"("project_id", "status", "created_at");
CREATE INDEX "reimbursement_batches_supplier_status_created_idx" ON "reimbursement_batches"("supplier_id", "status", "created_at");

CREATE UNIQUE INDEX "reimbursement_lines_batch_sequence_key" ON "reimbursement_lines"("batch_id", "sequence");
CREATE INDEX "reimbursement_lines_batch_expense_date_idx" ON "reimbursement_lines"("batch_id", "expense_date");

CREATE UNIQUE INDEX "reimbursement_attachments_storage_key" ON "reimbursement_attachments"("storage_key");
CREATE INDEX "reimbursement_attachments_batch_type_created_idx" ON "reimbursement_attachments"("batch_id", "type", "created_at");
CREATE INDEX "reimbursement_attachments_line_type_created_idx" ON "reimbursement_attachments"("line_id", "type", "created_at");
CREATE INDEX "reimbursement_attachments_uploader_created_idx" ON "reimbursement_attachments"("uploaded_by_id", "created_at");

CREATE INDEX "reimbursement_issues_batch_status_created_idx" ON "reimbursement_issues"("batch_id", "status", "created_at");
CREATE INDEX "reimbursement_issues_line_status_idx" ON "reimbursement_issues"("line_id", "status");
CREATE INDEX "reimbursement_issues_raiser_created_idx" ON "reimbursement_issues"("raised_by_id", "created_at");

CREATE INDEX "reimbursement_approvals_batch_created_idx" ON "reimbursement_approvals"("batch_id", "created_at");
CREATE INDEX "reimbursement_approvals_actor_created_idx" ON "reimbursement_approvals"("actor_id", "created_at");

CREATE UNIQUE INDEX "reimbursement_payments_batch_key" ON "reimbursement_payments"("batch_id");
CREATE UNIQUE INDEX "reimbursement_payments_reference_key" ON "reimbursement_payments"("reference");
CREATE UNIQUE INDEX "reimbursement_payments_proof_key" ON "reimbursement_payments"("proof_attachment_id");
CREATE INDEX "reimbursement_payments_payer_paid_at_idx" ON "reimbursement_payments"("paid_by_id", "paid_at");
CREATE INDEX "reimbursement_payments_paid_at_idx" ON "reimbursement_payments"("paid_at");

CREATE UNIQUE INDEX "reimbursement_artifacts_storage_key" ON "reimbursement_artifacts"("storage_key");
CREATE UNIQUE INDEX "reimbursement_artifacts_batch_type_key" ON "reimbursement_artifacts"("batch_id", "type");
CREATE INDEX "reimbursement_artifacts_batch_status_idx" ON "reimbursement_artifacts"("batch_id", "status");
CREATE INDEX "reimbursement_artifacts_generator_created_idx" ON "reimbursement_artifacts"("generated_by_id", "created_at");

ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_applicant_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_org_fkey" FOREIGN KEY ("organization_unit_id") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_project_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_supplier_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reimbursement_lines" ADD CONSTRAINT "reimbursement_lines_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "reimbursement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reimbursement_attachments" ADD CONSTRAINT "reimbursement_attachments_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "reimbursement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reimbursement_attachments" ADD CONSTRAINT "reimbursement_attachments_line_fkey" FOREIGN KEY ("line_id") REFERENCES "reimbursement_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reimbursement_attachments" ADD CONSTRAINT "reimbursement_attachments_uploader_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reimbursement_issues" ADD CONSTRAINT "reimbursement_issues_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "reimbursement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reimbursement_issues" ADD CONSTRAINT "reimbursement_issues_line_fkey" FOREIGN KEY ("line_id") REFERENCES "reimbursement_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reimbursement_issues" ADD CONSTRAINT "reimbursement_issues_raiser_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reimbursement_issues" ADD CONSTRAINT "reimbursement_issues_resolver_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reimbursement_approvals" ADD CONSTRAINT "reimbursement_approvals_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "reimbursement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reimbursement_approvals" ADD CONSTRAINT "reimbursement_approvals_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reimbursement_payments" ADD CONSTRAINT "reimbursement_payments_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "reimbursement_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reimbursement_payments" ADD CONSTRAINT "reimbursement_payments_payer_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reimbursement_payments" ADD CONSTRAINT "reimbursement_payments_proof_fkey" FOREIGN KEY ("proof_attachment_id") REFERENCES "reimbursement_attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reimbursement_artifacts" ADD CONSTRAINT "reimbursement_artifacts_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "reimbursement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reimbursement_artifacts" ADD CONSTRAINT "reimbursement_artifacts_generator_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
