CREATE TABLE "job_grade_approval_policies" (
  "id" UUID NOT NULL,
  "job_grade_id" UUID NOT NULL,
  "max_reimbursement_approval_cents" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "job_grade_approval_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_grade_approval_policies_job_grade_id_key"
  ON "job_grade_approval_policies"("job_grade_id");
CREATE INDEX "job_grade_approval_policies_is_active_job_grade_id_idx"
  ON "job_grade_approval_policies"("is_active", "job_grade_id");

ALTER TABLE "job_grade_approval_policies"
  ADD CONSTRAINT "job_grade_approval_policies_job_grade_id_fkey"
  FOREIGN KEY ("job_grade_id") REFERENCES "job_grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
