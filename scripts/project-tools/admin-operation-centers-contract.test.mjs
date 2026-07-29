import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../../apps/admin/src/pages/${name}`, import.meta.url), 'utf8');

test('data migration page supports template, mapping, preview, commit, rollback and errors', () => {
  const source = read('DataMigrationPage.tsx');
  for (const term of ['XLSX', '字段映射', '预览校验', 'api.upload', '/migration-center/analyze-file', '/preview-file', '/commit', '/rollback', 'errors.csv']) assert.match(source, new RegExp(term));
});

test('workflow designer uses simple ordered approval steps', () => {
  const source = read('WorkflowDesignerPage.tsx');
  for (const term of ['审批流程', '添加审批环节', '上移', '下移', '适用条件', '测试金额', '指定岗位', '发布流程', '/workflow-templates/simulate']) assert.match(source, new RegExp(term));
  assert.doesNotMatch(source, /BPMN/);
});

test('access center and account center expose actual operations', () => {
  const access = read('AccessCenterPage.tsx');
  for (const term of ['权限申请', '审批', '权限回收', '/access-requests/options', 'canCurrentUserAct']) assert.match(access, new RegExp(term));
  assert.match(access, /Permission\.ACCOUNT_MANAGE/);
  assert.match(access, /row\.canCurrentUserAct/);
  assert.match(access, /item\.type === \"CENTER\"/);
  const account = read('AccountCenterPage.tsx');
  for (const term of ['各端口账户', '批量开户', '强制下线', '解绑微信', '操作记录', 'accountLifecycleLogs', '/account-center']) assert.match(account, new RegExp(term));
});

test('routes and navigation register all four centers', () => {
  const routes = readFileSync(new URL('../../apps/admin/src/routes/AppRoutes.tsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../../apps/admin/src/layout/AppLayout.tsx', import.meta.url), 'utf8');
  for (const path of ['/data-migration', '/workflow-designer', '/access-center', '/account-center']) {
    assert.match(routes, new RegExp(path));
    assert.match(layout, new RegExp(path));
  }
});
