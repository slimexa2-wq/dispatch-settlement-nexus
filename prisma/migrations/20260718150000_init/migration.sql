-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('HEADQUARTERS_MANAGER', 'BRANCH_MANAGER', 'PROJECT_OPERATOR', 'RESOURCE_SPECIALIST', 'SUPPLIER', 'EMPLOYEE', 'JOB_SEEKER', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'HISTORICAL', 'PENDING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "ResponsibilityType" AS ENUM ('CLIENT', 'OURS', 'JOINT', 'PENDING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('PENDING_ARRIVAL', 'ARRIVED', 'PASSED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('APPLICANT', 'INTERVIEWING', 'PENDING_ONBOARD', 'ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('SUPPLIER', 'EMPLOYEE_REFERRAL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RECRUITING', 'PAUSED', 'FILLED', 'ENDED');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('OPERATOR', 'SUPPLIER', 'SELF', 'REFERRAL');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'ACHIEVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalarySlipStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED_NOT_CONFIGURED');

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "source_code" VARCHAR(64),
    "name" VARCHAR(200) NOT NULL,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "source_project_id" VARCHAR(64),
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "is_external" BOOLEAN NOT NULL DEFAULT false,
    "business_type" VARCHAR(64),
    "status" "ProjectStatus",
    "manager_name" VARCHAR(64),
    "manager_phone" VARCHAR(32),
    "cooperation_start" DATE,
    "cooperation_end" DATE,
    "responsibility" "ResponsibilityType",
    "description" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_images" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "storage_key" VARCHAR(128) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(64),
    "contact_phone" VARCHAR(32),
    "level" VARCHAR(32),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_project_relations" (
    "supplier_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_project_relations_pkey" PRIMARY KEY ("supplier_id","project_id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "PolicyType" NOT NULL,
    "project_id" UUID NOT NULL,
    "job_title" VARCHAR(120),
    "supplier_id" UUID,
    "supplier_level" VARCHAR(32),
    "employee_type" VARCHAR(64),
    "amount" DECIMAL(12,2) NOT NULL,
    "achievement_conditions" TEXT NOT NULL,
    "exclusion_conditions" TEXT,
    "effective_at" DATE NOT NULL,
    "expires_at" DATE,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_demands" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "required_count" INTEGER NOT NULL,
    "requirements" TEXT NOT NULL,
    "salary" VARCHAR(500) NOT NULL,
    "work_time" VARCHAR(500) NOT NULL,
    "work_location" VARCHAR(500) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'RECRUITING',
    "supplier_policy_id" UUID,
    "referral_policy_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_demands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "id_card" VARCHAR(18) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "project_id" UUID NOT NULL,
    "job_title" VARCHAR(120) NOT NULL,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'APPLICANT',
    "interview_status" "InterviewStatus" NOT NULL DEFAULT 'PENDING_ARRIVAL',
    "interview_date" DATE,
    "supplier_id" UUID,
    "recommender_user_id" UUID,
    "emergency_contact_name" VARCHAR(64),
    "emergency_contact_phone" VARCHAR(32),
    "emergency_contact_relation" VARCHAR(32),
    "onboard_date" DATE,
    "offboard_date" DATE,
    "offboard_reason" VARCHAR(500),
    "employee_no" VARCHAR(64),
    "insurance_types" JSONB NOT NULL DEFAULT '[]',
    "supplier_policy_id" UUID,
    "supplier_policy_snapshot" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_files" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "storage_key" VARCHAR(128) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_status_logs" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "from_status" "EmploymentStatus",
    "to_status" "EmploymentStatus" NOT NULL,
    "interview_status" "InterviewStatus",
    "action" VARCHAR(64) NOT NULL,
    "notes" TEXT,
    "actor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "job_demand_id" UUID NOT NULL,
    "source" "ApplicationSource" NOT NULL,
    "supplier_id" UUID,
    "recommender_user_id" UUID,
    "interview_status" "InterviewStatus" NOT NULL DEFAULT 'PENDING_ARRIVAL',
    "interview_date" DATE,
    "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'APPLICANT',
    "onboard_date" DATE,
    "offboard_date" DATE,
    "offboard_reason" VARCHAR(500),
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_records" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "job_demand_id" UUID NOT NULL,
    "recommender_user_id" UUID NOT NULL,
    "policy_id" UUID,
    "policy_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_reward_records" (
    "id" UUID NOT NULL,
    "referral_id" UUID NOT NULL,
    "policy_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'PENDING',
    "achieved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_reward_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_import_batches" (
    "id" UUID NOT NULL,
    "source_file" VARCHAR(255) NOT NULL,
    "source_hash" VARCHAR(64) NOT NULL,
    "salary_month" VARCHAR(7) NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "total_rows" INTEGER NOT NULL,
    "accepted_rows" INTEGER NOT NULL,
    "skipped_rows" INTEGER NOT NULL,
    "preview_rows" JSONB NOT NULL DEFAULT '[]',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" UUID,
    "published_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_slips" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "salary_month" VARCHAR(7) NOT NULL,
    "gross_pay" DECIMAL(12,2) NOT NULL,
    "net_pay" DECIMAL(12,2) NOT NULL,
    "hourly_pay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtime_pay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "referral_reward" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "social_security_deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "SalarySlipStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(64) NOT NULL,
    "role" "UserRole" NOT NULL,
    "branch_id" UUID,
    "supplier_id" UUID,
    "person_id" UUID,
    "employee_type" VARCHAR(64),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "wechat_miniapp_open_id" VARCHAR(128),
    "wechat_official_open_id" VARCHAR(128),
    "wechat_union_id" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_project_relations" (
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_project_relations_pkey" PRIMARY KEY ("user_id","project_id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "source_file" VARCHAR(255) NOT NULL,
    "source_hash" VARCHAR(64) NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "preview_rows" JSONB NOT NULL DEFAULT '[]',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" UUID,
    "committed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_user_id" UUID,
    "type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "target_path" VARCHAR(500),
    "dedupe_key" VARCHAR(200),
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(128),
    "before" JSONB,
    "after" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_shares" (
    "id" UUID NOT NULL,
    "token" VARCHAR(32) NOT NULL,
    "job_demand_id" UUID NOT NULL,
    "recommender_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_source_code_key" ON "branches"("source_code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_source_project_id_key" ON "projects"("source_project_id");

-- CreateIndex
CREATE INDEX "projects_branch_id_status_idx" ON "projects"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_branch_id_name_key" ON "projects"("branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "project_images_storage_key_key" ON "project_images"("storage_key");

-- CreateIndex
CREATE INDEX "project_images_project_id_sort_order_idx" ON "project_images"("project_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "supplier_project_relations_project_id_idx" ON "supplier_project_relations"("project_id");

-- CreateIndex
CREATE INDEX "policies_project_id_type_is_active_idx" ON "policies"("project_id", "type", "is_active");

-- CreateIndex
CREATE INDEX "policies_supplier_id_type_idx" ON "policies"("supplier_id", "type");

-- CreateIndex
CREATE INDEX "job_demands_project_id_status_deadline_idx" ON "job_demands"("project_id", "status", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "people_id_card_key" ON "people"("id_card");

-- CreateIndex
CREATE UNIQUE INDEX "people_employee_no_key" ON "people"("employee_no");

-- CreateIndex
CREATE INDEX "people_project_id_status_idx" ON "people"("project_id", "status");

-- CreateIndex
CREATE INDEX "people_supplier_id_status_idx" ON "people"("supplier_id", "status");

-- CreateIndex
CREATE INDEX "people_recommender_user_id_idx" ON "people"("recommender_user_id");

-- CreateIndex
CREATE INDEX "people_phone_idx" ON "people"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "person_files_storage_key_key" ON "person_files"("storage_key");

-- CreateIndex
CREATE INDEX "person_files_person_id_idx" ON "person_files"("person_id");

-- CreateIndex
CREATE INDEX "person_status_logs_person_id_created_at_idx" ON "person_status_logs"("person_id", "created_at");

-- CreateIndex
CREATE INDEX "applications_person_id_job_demand_id_applied_at_idx" ON "applications"("person_id", "job_demand_id", "applied_at");

-- CreateIndex
CREATE INDEX "applications_job_demand_id_source_idx" ON "applications"("job_demand_id", "source");

-- CreateIndex
CREATE INDEX "applications_supplier_id_idx" ON "applications"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_records_application_id_key" ON "referral_records"("application_id");

-- CreateIndex
CREATE INDEX "referral_records_recommender_user_id_created_at_idx" ON "referral_records"("recommender_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "referral_reward_records_referral_id_key" ON "referral_reward_records"("referral_id");

-- CreateIndex
CREATE INDEX "referral_reward_records_status_idx" ON "referral_reward_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "salary_import_batches_source_hash_salary_month_key" ON "salary_import_batches"("source_hash", "salary_month");

-- CreateIndex
CREATE INDEX "salary_slips_batch_id_status_idx" ON "salary_slips"("batch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "salary_slips_person_id_salary_month_key" ON "salary_slips"("person_id", "salary_month");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_person_id_key" ON "users"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_wechat_miniapp_open_id_key" ON "users"("wechat_miniapp_open_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_wechat_official_open_id_key" ON "users"("wechat_official_open_id");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "user_project_relations_project_id_idx" ON "user_project_relations"("project_id");

-- CreateIndex
CREATE INDEX "import_jobs_status_created_at_idx" ON "import_jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_type_source_hash_key" ON "import_jobs"("type", "source_hash");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_status_idx" ON "notifications"("recipient_user_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "referral_shares_token_key" ON "referral_shares"("token");

-- CreateIndex
CREATE INDEX "referral_shares_recommender_user_id_created_at_idx" ON "referral_shares"("recommender_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_images" ADD CONSTRAINT "project_images_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_project_relations" ADD CONSTRAINT "supplier_project_relations_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_project_relations" ADD CONSTRAINT "supplier_project_relations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_demands" ADD CONSTRAINT "job_demands_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_demands" ADD CONSTRAINT "job_demands_supplier_policy_id_fkey" FOREIGN KEY ("supplier_policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_demands" ADD CONSTRAINT "job_demands_referral_policy_id_fkey" FOREIGN KEY ("referral_policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_demands" ADD CONSTRAINT "job_demands_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_recommender_user_id_fkey" FOREIGN KEY ("recommender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_supplier_policy_id_fkey" FOREIGN KEY ("supplier_policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_files" ADD CONSTRAINT "person_files_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_files" ADD CONSTRAINT "person_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_status_logs" ADD CONSTRAINT "person_status_logs_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_status_logs" ADD CONSTRAINT "person_status_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_demand_id_fkey" FOREIGN KEY ("job_demand_id") REFERENCES "job_demands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_recommender_user_id_fkey" FOREIGN KEY ("recommender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_records" ADD CONSTRAINT "referral_records_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_records" ADD CONSTRAINT "referral_records_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_records" ADD CONSTRAINT "referral_records_job_demand_id_fkey" FOREIGN KEY ("job_demand_id") REFERENCES "job_demands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_records" ADD CONSTRAINT "referral_records_recommender_user_id_fkey" FOREIGN KEY ("recommender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_records" ADD CONSTRAINT "referral_records_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_reward_records" ADD CONSTRAINT "referral_reward_records_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referral_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_reward_records" ADD CONSTRAINT "referral_reward_records_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_import_batches" ADD CONSTRAINT "salary_import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "salary_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_project_relations" ADD CONSTRAINT "user_project_relations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_project_relations" ADD CONSTRAINT "user_project_relations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_shares" ADD CONSTRAINT "referral_shares_job_demand_id_fkey" FOREIGN KEY ("job_demand_id") REFERENCES "job_demands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_shares" ADD CONSTRAINT "referral_shares_recommender_user_id_fkey" FOREIGN KEY ("recommender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
