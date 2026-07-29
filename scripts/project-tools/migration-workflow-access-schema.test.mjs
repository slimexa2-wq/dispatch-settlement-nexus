import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(new URL("../../prisma/migrations/20260729010000_migration_workflow_access_accounts/migration.sql", import.meta.url), "utf8");
const migrationTargets = await readFile(new URL("../../apps/api/src/services/migration-targets.ts", import.meta.url), "utf8");

const requiredModels = [
  "MigrationTemplate", "MigrationBatch", "MigrationRowResult",
  "WorkflowTemplate", "WorkflowVersion", "WorkflowInstance", "WorkflowTask",
  "AccessRequest", "PermissionProvisionTask", "UserPortalAccess", "AccountLifecycleLog"
];

test("schema contains all migration workflow access and account models", () => {
  for (const model of requiredModels) assert.match(schema, new RegExp(`model ${model} \\{`));
});

test("user model keeps explicit named relations for multi-account workflows", () => {
  for (const relation of [
    "MigrationBatchCreators", "WorkflowTaskAssignees", "WorkflowTaskActors",
    "AccessRequestSubjects", "UserPortalAccessUsers", "AccountLifecycleUsers"
  ]) assert.match(schema, new RegExp(`@relation\\(\"${relation}\"`));
});

test("migration SQL creates each persisted table and enum", () => {
  for (const table of [
    "migration_templates", "migration_batches", "migration_row_results", "workflow_templates",
    "workflow_versions", "workflow_instances", "workflow_tasks", "access_requests",
    "permission_provision_tasks", "user_portal_accesses", "account_lifecycle_logs"
  ]) assert.match(migration, new RegExp(`CREATE TABLE \\"${table}\\"`));
  for (const enumName of ["PortalType", "AccessRequestStatus", "WorkflowTemplateStatus", "MigrationBatchStatus"]) {
    assert.match(migration, new RegExp(`CREATE TYPE \\"${enumName}\\"`));
  }
});

test("migration SQL keeps the indexes declared by the new Prisma models", () => {
  for (const indexName of [
    "migration_batches_created_by_id_created_at_idx",
    "migration_row_results_unique_key_idx",
    "workflow_versions_template_id_is_published_version_idx",
    "workflow_instances_template_id_version_id_idx",
    "access_requests_requested_by_id_created_at_idx",
    "user_portal_accesses_access_request_id_idx",
    "account_lifecycle_logs_actor_id_created_at_idx"
  ]) assert.match(migration, new RegExp(indexName));
});

test("权限申请生成的角色和数据范围保持数据库外键关联", () => {
  assert.match(schema, /accessRequest\s+AccessRequest\?\s+@relation\("AccessRequestRoleAssignments"/);
  assert.match(schema, /accessRequest\s+AccessRequest\?\s+@relation\("AccessRequestScopeBindings"/);
  assert.match(schema, /roleAssignments\s+UserRoleAssignment\[\]/);
  assert.match(schema, /scopeBindings\s+DataScopeBinding\[\]/);
  assert.match(migration, /user_role_assignments_access_request_id_fkey/);
  assert.match(migration, /data_scope_bindings_access_request_id_fkey/);
});


test("迁移批次保存服务端源文件定位和文件元数据", () => {
  assert.match(schema, /sourceStorageKey\s+String\?/);
  assert.match(schema, /sourceMimeType\s+String\?/);
  assert.match(schema, /sourceSizeBytes\s+Int\?/);
  assert.match(migration, /source_storage_key/);
  assert.match(migration, /source_mime_type/);
  assert.match(migration, /source_size_bytes/);
});


test("迁移SQL非空约束与Prisma模型保持一致", () => {
  assert.match(migration, /"unique_keys" TEXT\[\] NOT NULL DEFAULT/);
  assert.match(migration, /"fields" JSONB NOT NULL/);
  assert.match(migration, /"source_data" JSONB NOT NULL/);
});

test("内部员工迁移不会把不存在的组织岗位职级和合同主体静默写成空值", () => {
  assert.match(migrationTargets, /合同主体编码不存在/);
  assert.match(migrationTargets, /组织编码不存在/);
  assert.match(migrationTargets, /岗位编码不存在/);
  assert.match(migrationTargets, /职级编码不存在/);
});

test("人员迁移遇到跨分公司同名项目时要求明确经营分公司", () => {
  assert.match(migrationTargets, /存在多个同名项目/);
  assert.match(migrationTargets, /请填写经营分公司/);
});
