CREATE TYPE "MigrationBatchStatus" AS ENUM ('DRAFT','PREVIEWING','READY','COMMITTING','COMMITTED','PARTIAL','FAILED','ROLLED_BACK');
CREATE TYPE "MigrationRowStatus" AS ENUM ('CREATE','UPDATE','SKIP','ERROR','COMMITTED','ROLLED_BACK');
CREATE TYPE "WorkflowTemplateStatus" AS ENUM ('DRAFT','PUBLISHED','DISABLED');
CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('RUNNING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('WAITING','PENDING','APPROVED','REJECTED','RETURNED','CANCELLED');
CREATE TYPE "AccessRequestStatus" AS ENUM ('DRAFT','PENDING','APPROVED','REJECTED','PROVISIONING','COMPLETED','REVOKED','FAILED');
CREATE TYPE "AccessRiskLevel" AS ENUM ('NORMAL','HIGH');
CREATE TYPE "PermissionProvisionTaskStatus" AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED');
CREATE TYPE "PortalType" AS ENUM ('ADMIN','INTERNAL_MINIAPP','SUPPLIER_MINIAPP','EMPLOYEE_MINIAPP');
CREATE TYPE "AccountLifecycleAction" AS ENUM ('CREATED','ACTIVATED','DISABLED','PASSWORD_RESET','FORCE_LOGOUT','WECHAT_BOUND','WECHAT_UNBOUND','PORTAL_GRANTED','PORTAL_REVOKED','MERGED');


ALTER TABLE "user_role_assignments" ADD COLUMN "access_request_id" UUID;
ALTER TABLE "data_scope_bindings" ADD COLUMN "access_request_id" UUID;
CREATE INDEX "user_role_assignments_access_request_id_status_idx" ON "user_role_assignments"("access_request_id","status");
CREATE INDEX "data_scope_bindings_access_request_id_is_active_idx" ON "data_scope_bindings"("access_request_id","is_active");

CREATE TABLE "migration_templates" (
  "id" UUID NOT NULL, "code" VARCHAR(64) NOT NULL, "name" VARCHAR(120) NOT NULL,
  "target_entity" VARCHAR(64) NOT NULL, "description" TEXT, "fields" JSONB NOT NULL,
  "unique_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "alias_map" JSONB NOT NULL DEFAULT '{}',
  "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "migration_templates_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "migration_batches" (
  "id" UUID NOT NULL, "template_id" UUID NOT NULL, "source_file" VARCHAR(255) NOT NULL,
  "source_hash" VARCHAR(64) NOT NULL, "source_storage_key" VARCHAR(128),
  "source_mime_type" VARCHAR(160), "source_size_bytes" INTEGER, "status" "MigrationBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "mapping" JSONB NOT NULL DEFAULT '{}', "conflict_policy" VARCHAR(32) NOT NULL DEFAULT 'UPDATE',
  "total_rows" INTEGER NOT NULL DEFAULT 0, "create_rows" INTEGER NOT NULL DEFAULT 0,
  "update_rows" INTEGER NOT NULL DEFAULT 0, "skip_rows" INTEGER NOT NULL DEFAULT 0,
  "error_rows" INTEGER NOT NULL DEFAULT 0, "processed_rows" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB NOT NULL DEFAULT '{}', "errors" JSONB NOT NULL DEFAULT '[]', "rollback_snapshot" JSONB,
  "created_by_id" UUID, "committed_at" TIMESTAMP(3), "rolled_back_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_batches_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "migration_row_results" (
  "id" UUID NOT NULL, "batch_id" UUID NOT NULL, "source_row" INTEGER NOT NULL,
  "status" "MigrationRowStatus" NOT NULL, "action" VARCHAR(32) NOT NULL,
  "unique_key" VARCHAR(500), "source_data" JSONB NOT NULL, "normalized_data" JSONB NOT NULL,
  "errors" JSONB NOT NULL DEFAULT '[]', "entity_id" VARCHAR(128), "before" JSONB, "after" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_row_results_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "workflow_templates" (
  "id" UUID NOT NULL, "code" VARCHAR(64) NOT NULL, "name" VARCHAR(120) NOT NULL,
  "business_type" VARCHAR(64) NOT NULL, "description" TEXT,
  "status" "WorkflowTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "workflow_versions" (
  "id" UUID NOT NULL, "template_id" UUID NOT NULL, "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL, "is_published" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMP(3), "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "workflow_instances" (
  "id" UUID NOT NULL, "template_id" UUID NOT NULL, "version_id" UUID NOT NULL,
  "business_type" VARCHAR(64) NOT NULL, "business_id" VARCHAR(128) NOT NULL,
  "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'RUNNING', "context" JSONB NOT NULL DEFAULT '{}',
  "current_node_key" VARCHAR(64), "initiated_by_id" UUID, "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "workflow_tasks" (
  "id" UUID NOT NULL, "instance_id" UUID NOT NULL, "node_key" VARCHAR(64) NOT NULL,
  "node_name" VARCHAR(120) NOT NULL, "node_order" INTEGER NOT NULL, "assignee_type" VARCHAR(64) NOT NULL,
  "assignee_ref_id" VARCHAR(128), "assigned_user_id" UUID,
  "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING', "action_by_id" UUID,
  "comment" TEXT, "due_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_tasks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "access_requests" (
  "id" UUID NOT NULL, "subject_user_id" UUID NOT NULL, "requested_by_id" UUID NOT NULL,
  "reviewed_by_id" UUID, "workflow_instance_id" UUID, "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
  "risk_level" "AccessRiskLevel" NOT NULL DEFAULT 'NORMAL', "portals" JSONB NOT NULL,
  "roles" JSONB NOT NULL, "scopes" JSONB NOT NULL, "valid_from" TIMESTAMP(3) NOT NULL,
  "valid_to" TIMESTAMP(3), "reason" TEXT NOT NULL, "review_comment" TEXT, "reviewed_at" TIMESTAMP(3),
  "provisioned_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "permission_provision_tasks" (
  "id" UUID NOT NULL, "access_request_id" UUID NOT NULL, "action" VARCHAR(64) NOT NULL,
  "status" "PermissionProvisionTaskStatus" NOT NULL DEFAULT 'PENDING', "payload" JSONB NOT NULL,
  "error" TEXT, "attempted_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "permission_provision_tasks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "user_portal_accesses" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "portal" "PortalType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "source" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "valid_to" TIMESTAMP(3),
  "granted_by_id" UUID, "access_request_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_portal_accesses_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "account_lifecycle_logs" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "actor_id" UUID,
  "action" "AccountLifecycleAction" NOT NULL, "portal" "PortalType", "before" JSONB,
  "after" JSONB, "reason" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_lifecycle_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "migration_templates_code_key" ON "migration_templates"("code");
CREATE INDEX "migration_templates_target_entity_is_active_idx" ON "migration_templates"("target_entity","is_active");
CREATE UNIQUE INDEX "migration_batches_template_id_source_hash_key" ON "migration_batches"("template_id","source_hash");
CREATE INDEX "migration_batches_status_created_at_idx" ON "migration_batches"("status","created_at");
CREATE INDEX "migration_batches_created_by_id_created_at_idx" ON "migration_batches"("created_by_id","created_at");
CREATE UNIQUE INDEX "migration_row_results_batch_id_source_row_key" ON "migration_row_results"("batch_id","source_row");
CREATE INDEX "migration_row_results_batch_id_status_idx" ON "migration_row_results"("batch_id","status");
CREATE INDEX "migration_row_results_unique_key_idx" ON "migration_row_results"("unique_key");
CREATE UNIQUE INDEX "workflow_templates_code_key" ON "workflow_templates"("code");
CREATE INDEX "workflow_templates_business_type_status_idx" ON "workflow_templates"("business_type","status");
CREATE UNIQUE INDEX "workflow_versions_template_id_version_key" ON "workflow_versions"("template_id","version");
CREATE INDEX "workflow_versions_template_id_is_published_version_idx" ON "workflow_versions"("template_id","is_published","version");
CREATE UNIQUE INDEX "workflow_instances_business_type_business_id_key" ON "workflow_instances"("business_type","business_id");
CREATE INDEX "workflow_instances_status_created_at_idx" ON "workflow_instances"("status","created_at");
CREATE INDEX "workflow_instances_template_id_version_id_idx" ON "workflow_instances"("template_id","version_id");
CREATE UNIQUE INDEX "workflow_tasks_instance_id_node_key_assigned_user_id_key" ON "workflow_tasks"("instance_id","node_key","assigned_user_id");
CREATE INDEX "workflow_tasks_assigned_user_id_status_created_at_idx" ON "workflow_tasks"("assigned_user_id","status","created_at");
CREATE INDEX "workflow_tasks_instance_id_status_node_order_idx" ON "workflow_tasks"("instance_id","status","node_order");
CREATE UNIQUE INDEX "access_requests_workflow_instance_id_key" ON "access_requests"("workflow_instance_id");
CREATE INDEX "access_requests_subject_user_id_status_created_at_idx" ON "access_requests"("subject_user_id","status","created_at");
CREATE INDEX "access_requests_requested_by_id_created_at_idx" ON "access_requests"("requested_by_id","created_at");
CREATE INDEX "access_requests_status_risk_level_created_at_idx" ON "access_requests"("status","risk_level","created_at");
CREATE INDEX "permission_provision_tasks_access_request_id_status_idx" ON "permission_provision_tasks"("access_request_id","status");
CREATE INDEX "user_portal_accesses_user_id_portal_enabled_idx" ON "user_portal_accesses"("user_id","portal","enabled");
CREATE INDEX "user_portal_accesses_portal_enabled_valid_to_idx" ON "user_portal_accesses"("portal","enabled","valid_to");
CREATE INDEX "user_portal_accesses_access_request_id_idx" ON "user_portal_accesses"("access_request_id");
CREATE INDEX "account_lifecycle_logs_user_id_created_at_idx" ON "account_lifecycle_logs"("user_id","created_at");
CREATE INDEX "account_lifecycle_logs_actor_id_created_at_idx" ON "account_lifecycle_logs"("actor_id","created_at");

ALTER TABLE "migration_batches" ADD CONSTRAINT "migration_batches_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "migration_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_batches" ADD CONSTRAINT "migration_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "migration_row_results" ADD CONSTRAINT "migration_row_results_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "migration_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_action_by_id_fkey" FOREIGN KEY ("action_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_workflow_instance_id_fkey" FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "permission_provision_tasks" ADD CONSTRAINT "permission_provision_tasks_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "access_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_portal_accesses" ADD CONSTRAINT "user_portal_accesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_portal_accesses" ADD CONSTRAINT "user_portal_accesses_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_portal_accesses" ADD CONSTRAINT "user_portal_accesses_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "access_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_lifecycle_logs" ADD CONSTRAINT "account_lifecycle_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_lifecycle_logs" ADD CONSTRAINT "account_lifecycle_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "access_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_scope_bindings" ADD CONSTRAINT "data_scope_bindings_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "access_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
