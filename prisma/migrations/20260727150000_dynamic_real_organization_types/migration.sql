-- Preserve the real organization node meaning while keeping the hierarchy configurable.
ALTER TYPE "OrganizationUnitType" ADD VALUE IF NOT EXISTS 'LEADERSHIP';
ALTER TYPE "OrganizationUnitType" ADD VALUE IF NOT EXISTS 'BUSINESS_DEPARTMENT';
ALTER TYPE "OrganizationUnitType" ADD VALUE IF NOT EXISTS 'SUBSIDIARY';
ALTER TYPE "OrganizationUnitType" ADD VALUE IF NOT EXISTS 'OTHER';

-- Enum values are added in their own migration transaction.
-- Existing node rows are recast in the following migration after PostgreSQL commits the enum additions.

-- Preserve duplicate or invalid source employee numbers without forcing false uniqueness.
ALTER TABLE "internal_employees"
  ADD COLUMN IF NOT EXISTS "source_employee_no" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "bank_account" VARCHAR(120);

CREATE INDEX IF NOT EXISTS "internal_employees_source_employee_no_idx"
ON "internal_employees"("source_employee_no");

-- Store the real weekly project counts as data, not as invented demo metrics.
CREATE TABLE IF NOT EXISTS "project_weekly_snapshots" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "snapshot_date" DATE NOT NULL,
  "self_recruited" INTEGER NOT NULL DEFAULT 0,
  "supplier_recruited" INTEGER NOT NULL DEFAULT 0,
  "active_count" INTEGER NOT NULL DEFAULT 0,
  "onboarded_count" INTEGER NOT NULL DEFAULT 0,
  "offboarded_count" INTEGER NOT NULL DEFAULT 0,
  "change_count" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_weekly_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_weekly_snapshots_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_weekly_snapshots_project_id_snapshot_date_key"
ON "project_weekly_snapshots"("project_id", "snapshot_date");
CREATE INDEX IF NOT EXISTS "project_weekly_snapshots_snapshot_date_active_count_idx"
ON "project_weekly_snapshots"("snapshot_date", "active_count");


-- Finance-approved amount is distinct from the employee's requested amount.
ALTER TABLE "reimbursement_batches"
  ADD COLUMN IF NOT EXISTS "approved_amount_cents" INTEGER;
