-- Extend the legacy single-role enum while multi-role assignments are introduced.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'GROUP_LEADER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DEPARTMENT_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INTERNAL_HR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'RECRUITER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCE_REVIEWER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CASHIER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DEPARTMENT_REIMBURSEMENT_CLERK';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPPLIER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OUTSOURCED_EMPLOYEE';

CREATE TYPE "OrganizationUnitType" AS ENUM ('GROUP', 'LEGAL_ENTITY', 'BRANCH', 'CENTER', 'DEPARTMENT');
CREATE TYPE "InternalEmployeeStatus" AS ENUM ('ACTIVE', 'DISABLED', 'LEFT', 'ARCHIVED');
CREATE TYPE "InternalEmployeeChangeType" AS ENUM ('ONBOARD', 'TRANSFER', 'DISABLE', 'ENABLE', 'OFFBOARD', 'ARCHIVE');
CREATE TYPE "RoleAssignmentStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "DataScopeType" AS ENUM ('SELF', 'ORG_UNIT', 'CENTER', 'BRANCH', 'PROJECT', 'SUPPLIER', 'GROUP');

CREATE TABLE "legal_entities" (
  "id" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "tax_number" VARCHAR(64),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_units" (
  "id" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "type" "OrganizationUnitType" NOT NULL,
  "parent_id" UUID,
  "legal_entity_id" UUID,
  "branch_id" UUID,
  "path" VARCHAR(1000) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "positions" (
  "id" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "organization_unit_id" UUID,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_grades" (
  "id" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "level" INTEGER NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "job_grades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_employees" (
  "id" UUID NOT NULL,
  "employee_no" VARCHAR(64) NOT NULL,
  "user_id" UUID,
  "name" VARCHAR(64) NOT NULL,
  "phone" VARCHAR(32) NOT NULL,
  "id_card" VARCHAR(32) NOT NULL,
  "email" VARCHAR(200),
  "legal_entity_id" UUID,
  "branch_id" UUID,
  "organization_unit_id" UUID,
  "position_id" UUID,
  "job_grade_id" UUID,
  "status" "InternalEmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  "onboard_date" DATE NOT NULL,
  "offboard_date" DATE,
  "offboard_reason" VARCHAR(500),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "internal_employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_employments" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "legal_entity_id" UUID,
  "branch_id" UUID,
  "organization_unit_id" UUID NOT NULL,
  "position_id" UUID NOT NULL,
  "job_grade_id" UUID,
  "started_at" DATE NOT NULL,
  "ended_at" DATE,
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_employments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_employee_changes" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "actor_id" UUID,
  "type" "InternalEmployeeChangeType" NOT NULL,
  "effective_at" DATE NOT NULL,
  "reason" VARCHAR(500),
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_employee_changes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
  "id" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permission_definitions" (
  "id" UUID NOT NULL,
  "code" VARCHAR(120) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "module" VARCHAR(64) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permission_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
  "role_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
);

CREATE TABLE "user_role_assignments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "status" "RoleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_to" TIMESTAMP(3),
  "created_by_id" UUID,
  "revoked_by_id" UUID,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_scope_bindings" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role_assignment_id" UUID,
  "type" "DataScopeType" NOT NULL,
  "organization_unit_id" UUID,
  "branch_id" UUID,
  "project_id" UUID,
  "supplier_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_to" TIMESTAMP(3),
  "created_by_id" UUID,
  "revoked_by_id" UUID,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_scope_bindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_entities_code_key" ON "legal_entities"("code");
CREATE UNIQUE INDEX "legal_entities_name_key" ON "legal_entities"("name");
CREATE UNIQUE INDEX "legal_entities_tax_number_key" ON "legal_entities"("tax_number");
CREATE INDEX "legal_entities_is_active_name_idx" ON "legal_entities"("is_active", "name");
CREATE UNIQUE INDEX "organization_units_code_key" ON "organization_units"("code");
CREATE UNIQUE INDEX "organization_units_parent_id_name_key" ON "organization_units"("parent_id", "name");
CREATE INDEX "organization_units_parent_id_sort_order_idx" ON "organization_units"("parent_id", "sort_order");
CREATE INDEX "organization_units_legal_entity_id_type_is_active_idx" ON "organization_units"("legal_entity_id", "type", "is_active");
CREATE INDEX "organization_units_branch_id_type_is_active_idx" ON "organization_units"("branch_id", "type", "is_active");
CREATE INDEX "organization_units_path_idx" ON "organization_units"("path");
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");
CREATE INDEX "positions_organization_unit_id_is_active_idx" ON "positions"("organization_unit_id", "is_active");
CREATE INDEX "positions_name_idx" ON "positions"("name");
CREATE UNIQUE INDEX "job_grades_code_key" ON "job_grades"("code");
CREATE UNIQUE INDEX "job_grades_name_key" ON "job_grades"("name");
CREATE INDEX "job_grades_level_is_active_idx" ON "job_grades"("level", "is_active");
CREATE UNIQUE INDEX "internal_employees_employee_no_key" ON "internal_employees"("employee_no");
CREATE UNIQUE INDEX "internal_employees_user_id_key" ON "internal_employees"("user_id");
CREATE UNIQUE INDEX "internal_employees_phone_key" ON "internal_employees"("phone");
CREATE UNIQUE INDEX "internal_employees_id_card_key" ON "internal_employees"("id_card");
CREATE UNIQUE INDEX "internal_employees_id_version_key" ON "internal_employees"("id", "version");
CREATE INDEX "internal_employees_status_branch_id_organization_unit_id_idx" ON "internal_employees"("status", "branch_id", "organization_unit_id");
CREATE INDEX "internal_employees_legal_entity_id_status_idx" ON "internal_employees"("legal_entity_id", "status");
CREATE INDEX "internal_employees_position_id_status_idx" ON "internal_employees"("position_id", "status");
CREATE INDEX "internal_employees_name_idx" ON "internal_employees"("name");
CREATE INDEX "internal_employments_employee_id_ended_at_idx" ON "internal_employments"("employee_id", "ended_at");
CREATE INDEX "internal_employments_organization_unit_id_ended_at_idx" ON "internal_employments"("organization_unit_id", "ended_at");
CREATE INDEX "internal_employments_branch_id_ended_at_idx" ON "internal_employments"("branch_id", "ended_at");
CREATE INDEX "internal_employments_position_id_ended_at_idx" ON "internal_employments"("position_id", "ended_at");
CREATE INDEX "internal_employee_changes_employee_id_effective_at_idx" ON "internal_employee_changes"("employee_id", "effective_at");
CREATE INDEX "internal_employee_changes_actor_id_created_at_idx" ON "internal_employee_changes"("actor_id", "created_at");
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE INDEX "roles_is_active_name_idx" ON "roles"("is_active", "name");
CREATE UNIQUE INDEX "permission_definitions_code_key" ON "permission_definitions"("code");
CREATE INDEX "permission_definitions_module_code_idx" ON "permission_definitions"("module", "code");
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE UNIQUE INDEX "user_role_assignments_user_id_role_id_valid_from_key" ON "user_role_assignments"("user_id", "role_id", "valid_from");
CREATE INDEX "user_role_assignments_user_id_status_valid_to_idx" ON "user_role_assignments"("user_id", "status", "valid_to");
CREATE INDEX "user_role_assignments_role_id_status_idx" ON "user_role_assignments"("role_id", "status");
CREATE INDEX "user_role_assignments_created_by_id_created_at_idx" ON "user_role_assignments"("created_by_id", "created_at");
CREATE INDEX "user_role_assignments_revoked_by_id_revoked_at_idx" ON "user_role_assignments"("revoked_by_id", "revoked_at");
CREATE INDEX "data_scope_bindings_user_id_is_active_valid_to_idx" ON "data_scope_bindings"("user_id", "is_active", "valid_to");
CREATE INDEX "data_scope_bindings_role_assignment_id_is_active_idx" ON "data_scope_bindings"("role_assignment_id", "is_active");
CREATE INDEX "data_scope_bindings_organization_unit_id_is_active_idx" ON "data_scope_bindings"("organization_unit_id", "is_active");
CREATE INDEX "data_scope_bindings_branch_id_is_active_idx" ON "data_scope_bindings"("branch_id", "is_active");
CREATE INDEX "data_scope_bindings_project_id_is_active_idx" ON "data_scope_bindings"("project_id", "is_active");
CREATE INDEX "data_scope_bindings_supplier_id_is_active_idx" ON "data_scope_bindings"("supplier_id", "is_active");
CREATE INDEX "data_scope_bindings_created_by_id_created_at_idx" ON "data_scope_bindings"("created_by_id", "created_at");
CREATE INDEX "data_scope_bindings_revoked_by_id_revoked_at_idx" ON "data_scope_bindings"("revoked_by_id", "revoked_at");

ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_organization_unit_id_fkey" FOREIGN KEY ("organization_unit_id") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employees" ADD CONSTRAINT "internal_employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employees" ADD CONSTRAINT "internal_employees_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employees" ADD CONSTRAINT "internal_employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employees" ADD CONSTRAINT "internal_employees_organization_unit_id_fkey" FOREIGN KEY ("organization_unit_id") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employees" ADD CONSTRAINT "internal_employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employees" ADD CONSTRAINT "internal_employees_job_grade_id_fkey" FOREIGN KEY ("job_grade_id") REFERENCES "job_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employments" ADD CONSTRAINT "internal_employments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "internal_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employments" ADD CONSTRAINT "internal_employments_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employments" ADD CONSTRAINT "internal_employments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employments" ADD CONSTRAINT "internal_employments_organization_unit_id_fkey" FOREIGN KEY ("organization_unit_id") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employments" ADD CONSTRAINT "internal_employments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employments" ADD CONSTRAINT "internal_employments_job_grade_id_fkey" FOREIGN KEY ("job_grade_id") REFERENCES "job_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_employee_changes" ADD CONSTRAINT "internal_employee_changes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "internal_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_scope_bindings" ADD CONSTRAINT "data_scope_bindings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_scope_bindings" ADD CONSTRAINT "data_scope_bindings_role_assignment_id_fkey" FOREIGN KEY ("role_assignment_id") REFERENCES "user_role_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_scope_bindings" ADD CONSTRAINT "data_scope_bindings_organization_unit_id_fkey" FOREIGN KEY ("organization_unit_id") REFERENCES "organization_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_scope_bindings" ADD CONSTRAINT "data_scope_bindings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_scope_bindings" ADD CONSTRAINT "data_scope_bindings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_scope_bindings" ADD CONSTRAINT "data_scope_bindings_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
