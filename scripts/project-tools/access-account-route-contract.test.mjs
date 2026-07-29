import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const access = () => readFileSync(new URL('../../apps/api/src/routes/access-requests.ts', import.meta.url), 'utf8');
const accounts = () => readFileSync(new URL('../../apps/api/src/routes/account-center.ts', import.meta.url), 'utf8');
const app = () => readFileSync(new URL('../../apps/api/src/app.ts', import.meta.url), 'utf8');
const migration = () => readFileSync(new URL('../../apps/api/src/routes/migration-center.ts', import.meta.url), 'utf8');

test('access request API exposes create, list, decision, revoke and options endpoints', () => {
  const source = access();
  for (const route of ['/access-requests', '/access-requests/options', '/access-requests/:id/decision', '/access-requests/:id/revoke']) {
    assert.match(source, new RegExp(route.replace(/[/:]/g, (value) => `\\${value}`)));
  }
  assert.match(source, /createWorkflowInstance/);
  assert.match(source, /provisionAccessRequest/);
});

test('account center API exposes multi-portal and lifecycle operations', () => {
  const source = accounts();
  for (const route of ['/account-center', '/account-center/batch-create', '/account-center/:id/portals', '/account-center/:id/action']) {
    assert.match(source, new RegExp(route.replace(/[/:]/g, (value) => `\\${value}`)));
  }
  assert.match(source, /AccountLifecycleAction/);
  assert.match(source, /userPortalAccess|portalAccesses/);
});

test('API app registers migration, workflow, access and account routes', () => {
  const source = app();
  for (const identifier of ['migrationCenterRoutes', 'workflowRoutes', 'accessRequestRoutes', 'accountCenterRoutes']) {
    assert.match(source, new RegExp(identifier));
  }
});

test("migration commit can resume partial batches without replaying committed or skipped rows", () => {
  const source = migration();
  const routeStart = source.indexOf('app.post("/migration-center/batches/:id/commit"');
  const routeEnd = source.indexOf('app.post("/migration-center/batches/:id/rollback"', routeStart);
  const route = source.slice(routeStart, routeEnd);
  assert.match(route, /MigrationBatchStatus\.PARTIAL/);
  assert.match(route, /alreadyProcessed[\s\S]*MigrationRowStatus\.COMMITTED,\s*MigrationRowStatus\.SKIP/);
  assert.match(route, /status:\s*\{\s*in:\s*\[MigrationRowStatus\.CREATE,\s*MigrationRowStatus\.UPDATE,\s*MigrationRowStatus\.ERROR\]/s);
  assert.doesNotMatch(route, /status:\s*\{\s*in:\s*\[MigrationRowStatus\.CREATE,\s*MigrationRowStatus\.UPDATE,\s*MigrationRowStatus\.SKIP/);
});


test("migration center accepts the source file once and previews it from server storage", () => {
  const source = migration();
  assert.match(source, /\/migration-center\/analyze-file/);
  assert.match(source, /\/migration-center\/batches\/:id\/preview-file/);
  assert.match(source, /fileStore\.save/);
  assert.match(source, /sourceStorageKey/);
  assert.match(source, /createMany/);
});


test('account portal changes close previous active grants before creating a replacement', () => {
  const source = accounts();
  const routeStart = source.indexOf('app.patch("/account-center/:id/portals"');
  const routeEnd = source.indexOf('app.post("/account-center/:id/action"', routeStart);
  const route = source.slice(routeStart, routeEnd);
  assert.ok(route.indexOf('userPortalAccess.updateMany') >= 0);
  assert.ok(route.indexOf('userPortalAccess.create') >= 0);
  assert.ok(route.indexOf('userPortalAccess.updateMany') < route.indexOf('userPortalAccess.create'));
  assert.match(route, /validateSelfAccountMutation/);
});


test('workflow-assigned approvers can act without a global approval permission', () => {
  const source = access();
  const routeStart = source.indexOf('app.post("/access-requests/:id/decision"');
  const routeEnd = source.indexOf('app.post("/access-requests/:id/revoke"', routeStart);
  const route = source.slice(routeStart, routeEnd);
  assert.match(route, /preHandler:\s*\[app\.authenticate\]/);
  assert.doesNotMatch(route, /requirePermission\(Permission\.ACCESS_REQUEST_APPROVE\)/);
  assert.match(source, /canCurrentUserAct/);
});
