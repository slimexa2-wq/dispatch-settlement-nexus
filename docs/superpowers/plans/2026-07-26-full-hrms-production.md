# 祥能 HRMS 全量开发与部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有祥能 HRMS 源码上完成组织人事、多角色权限、完整报销、真实微信小程序、受控本地 AI、合成演示数据、部署与 GitHub PR 交付。

**Architecture:** 保留现有 pnpm monorepo、Fastify、Prisma、PostgreSQL、React/Ant Design、Portal 和 Taro。所有端使用同一 API 和数据库；新业务封装在领域服务中；AI 只能调用固定工具；公开环境只使用确定性合成数据。

**Tech Stack:** Node.js 24、pnpm 11、TypeScript、React 18/19、Vite、Ant Design 6、Fastify 5、Prisma 6、PostgreSQL 17、Taro 4、Vitest、Playwright、Ollama `qwen3.5:4b`。

## Global Constraints

- PC 后台保持桌面界面；小程序和 Portal 演示保持手机界面。
- 内部授权范围内电话、身份证等字段完整展示，不做统一脱敏。
- 公开 GitHub、构建和演示环境只能使用合成数据。
- 不使用静态 JSON 冒充业务查询；所有展示从正式 API 和数据库读取。
- 不引入自由 SQL；模型不得直接修改数据库。
- 报销正式状态只能是固定七态，问题标记不能替代主状态。
- 发票金额必须严格大于付款金额，等于也不能提交。
- 未经用户确认不得合并 `main`，不得正式发布微信小程序。

---

### Task 1: 建立安全的正式源码基线和确定性合成数据

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `prisma/seed.ts`
- Create: `scripts/generate-synthetic-demo-data.mts`
- Create: `scripts/verify-public-data-safety.mts`
- Create: `data/synthetic/demo-data.json`
- Test: `tests/public-data-safety.test.mts`

**Interfaces:**
- Produces: `generateSyntheticDemoData(seed: number): SyntheticDemoData`
- Produces: `assertPublicDataSafe(root: string): Promise<void>`
- Consumed by: Prisma seed、Demo 重置、CI。

- [x] **Step 1: 编写公开数据安全失败测试**

```ts
it("rejects files containing a real-roster source marker", async () => {
  await expect(scanFixture({ meta: { sourceFile: "唯一数据.xls" } }))
    .rejects.toThrow("PUBLIC_DATA_SAFETY");
});

it("accepts deterministic synthetic identities", async () => {
  const first = generateSyntheticDemoData(20260726);
  const second = generateSyntheticDemoData(20260726);
  expect(first).toEqual(second);
  expect(first.people.every((person) => person.synthetic === true)).toBe(true);
});
```

- [x] **Step 2: 运行测试并确认因生成器和扫描器不存在而失败**

Run: `pnpm exec vitest run tests/public-data-safety.test.mts`

Expected: FAIL，提示模块或导出不存在。

- [x] **Step 3: 实现最小生成器和安全扫描器**

生成 3 个分公司、8 个项目、6 个供应商、12 个岗位需求、48 个人员、6 个内部员工、工资条、推荐和通知。身份证、手机号、银行卡、合同编号均使用明确的合成规则并带 `synthetic: true` 元数据。

- [x] **Step 4: 改造 Seed 和脚本**

`prisma/seed.ts` 只读取 `data/synthetic/demo-data.json`；Demo 重置重新导入同一份合成数据；删除对 `data/derived/demo-data.full.json` 和原始 Excel 哈希的运行依赖。

- [x] **Step 5: 验证**

Run:

```powershell
pnpm exec vitest run tests/public-data-safety.test.mts
pnpm db:validate
pnpm db:generate
pnpm exec tsx scripts/verify-public-data-safety.mts
```

Expected: 全部 PASS，安全扫描输出 `public_data_safe=true`。

- [x] **Step 6: 提交**

```powershell
git add .gitignore package.json prisma/seed.ts scripts data/synthetic tests/public-data-safety.test.mts
git commit -m "build: establish synthetic public data baseline"
```

### Task 2: 扩展组织、内部员工和多角色 RBAC 数据模型

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727010000_internal_hr_rbac/migration.sql`
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/permissions.ts`
- Modify: `packages/shared/src/schemas.ts`
- Create: `apps/api/src/services/authorization.ts`
- Create: `apps/api/src/services/internal-employee-domain.ts`
- Test: `packages/shared/src/permissions.test.ts`
- Test: `apps/api/test/internal-employee-domain.test.ts`

**Interfaces:**
- Produces: `loadAuthorizationContext(db, userId): Promise<AuthorizationContext>`
- Produces: `authorize(context, permission, resource): AuthorizationDecision`
- Produces: `transferInternalEmployee(tx, command): Promise<InternalEmployeeView>`
- Produces: `offboardInternalEmployee(tx, command): Promise<InternalEmployeeView>`

- [x] **Step 1: 编写多角色和范围失败测试**

```ts
it("combines active role permissions but never trusts request scope", () => {
  const context = authorizationFixture({
    assignments: [
      { role: "INTERNAL_HR", scope: { type: "BRANCH", targetId: "branch-a" } },
      { role: "DEPARTMENT_REIMBURSEMENT_CLERK", scope: { type: "ORG_UNIT", targetId: "dept-a" } }
    ]
  });
  expect(authorize(context, "internal-employee:write", { branchId: "branch-a" }).allowed).toBe(true);
  expect(authorize(context, "internal-employee:write", { branchId: "branch-b" }).allowed).toBe(false);
});
```

- [x] **Step 2: 运行并确认 RED**

Run: `pnpm --filter @xiangneng/shared test && pnpm --filter @xiangneng/api test -- internal-employee-domain.test.ts`

Expected: FAIL，缺少新角色、权限和服务。

- [x] **Step 3: 增加 Prisma 模型与迁移**

增加 `LegalEntity`、`OrganizationUnit`、`Position`、`JobGrade`、`InternalEmployee`、`InternalEmployment`、`InternalEmployeeChange`、`Role`、`PermissionDefinition`、`RolePermission`、`UserRoleAssignment`、`DataScopeBinding`，为全部外键和范围查询增加索引。

- [x] **Step 4: 实现授权上下文**

后端从有效角色、有效期、内部员工状态和范围绑定构造上下文；停用或离职员工返回拒绝；集团范围只能来自高权限授权。

- [x] **Step 5: 实现调动与离职事务**

调动必须结束旧主任职、创建新任职、结束旧组织范围绑定并记录变动；离职必须结束全部任职和授权。物理删除只有零业务关联时允许。

- [x] **Step 6: 验证**

Run:

```powershell
pnpm db:validate
pnpm db:generate
pnpm --filter @xiangneng/shared test
pnpm --filter @xiangneng/api test -- internal-employee-domain.test.ts
```

Expected: PASS。

- [x] **Step 7: 提交**

```powershell
git add prisma packages/shared apps/api/src/services apps/api/test/internal-employee-domain.test.ts
git commit -m "feat: add internal HR and scoped multi-role authorization"
```

### Task 3: 建设内部人事 API 和 PC 管理页面

**Files:**
- Create: `apps/api/src/routes/organization.ts`
- Create: `apps/api/src/routes/internal-employees.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/admin/src/pages/OrganizationPage.tsx`
- Create: `apps/admin/src/pages/InternalEmployeesPage.tsx`
- Create: `apps/admin/src/pages/InternalEmployeeDetailPage.tsx`
- Modify: `apps/admin/src/routes/AppRoutes.tsx`
- Modify: `apps/admin/src/layout/AppLayout.tsx`
- Modify: `apps/admin/src/types/domain.ts`
- Test: `apps/api/test/internal-employees.test.ts`
- Test: `apps/admin/src/pages/InternalEmployeesPage.test.tsx`

**Interfaces:**
- API: `GET/POST/PATCH /organization/units`
- API: `GET/POST/PATCH /internal-employees`
- API: `POST /internal-employees/:id/transfer`
- API: `POST /internal-employees/:id/offboard`
- API: `DELETE /internal-employees/:id`

- [x] **Step 1: 编写 API 权限和生命周期失败测试**

覆盖：分公司 HR 不能查看其他分公司、调动撤销旧范围、离职撤销登录、有关联记录时删除返回 `409`。

- [x] **Step 2: 运行并确认 RED**

Run: `pnpm --filter @xiangneng/api test -- internal-employees.test.ts`

Expected: FAIL，路由不存在。

- [x] **Step 3: 实现路由和审计**

路由只调用领域服务；所有写操作记录 actor、角色、范围、before、after、requestId 和结果。

- [x] **Step 4: 编写页面失败测试**

```tsx
it("opens transfer form and refreshes the employee detail after success", async () => {
  renderInternalEmployeesPage();
  await user.click(screen.getByRole("button", { name: "调动" }));
  await user.click(screen.getByRole("button", { name: "确认调动" }));
  expect(await screen.findByText("调动成功")).toBeInTheDocument();
});
```

- [x] **Step 5: 运行并确认 RED**

Run: `pnpm --filter @xiangneng/admin test -- InternalEmployeesPage.test.tsx`

Expected: FAIL，页面不存在。

- [x] **Step 6: 实现桌面页面**

使用现有 `AppLayout`、筛选条、Ant Design 表格和详情抽屉；提供新建、编辑、调动、停用、离职、删除和历史查看；按钮按后端权限显示并处理加载、空、失败和成功状态。

- [x] **Step 7: 验证并提交**

Run:

```powershell
pnpm --filter @xiangneng/api test -- internal-employees.test.ts
pnpm --filter @xiangneng/admin test -- InternalEmployeesPage.test.tsx
pnpm --filter @xiangneng/admin typecheck
pnpm --filter @xiangneng/admin lint
```

Expected: PASS。

Commit: `feat: deliver internal employee management`

### Task 4: 实现报销领域规则、七态工作流和并发控制

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727020000_reimbursement_workflow/migration.sql`
- Create: `apps/api/src/services/reimbursement-domain.ts`
- Create: `apps/api/src/services/reimbursement-artifacts.ts`
- Test: `apps/api/test/reimbursement-domain.test.ts`

**Interfaces:**
- Produces: `validateReimbursementLine(line): void`
- Produces: `summarizeReimbursement(lines): ReimbursementSummary`
- Produces: `transitionReimbursement(tx, command): Promise<ReimbursementBatchView>`
- Produces: `buildReimbursementArtifacts(batch): Promise<GeneratedArtifact[]>`

- [ ] **Step 1: 编写金额和七态失败测试**

```ts
it.each([
  { paymentCents: 10000, invoiceCents: 10000 },
  { paymentCents: 10000, invoiceCents: 9999 }
])("rejects invoice not strictly greater than payment", (line) => {
  expect(() => validateReimbursementLine(line)).toThrow("INVOICE_MUST_EXCEED_PAYMENT");
});

it("rejects skipping from department preparation to finance review", async () => {
  await expect(transition("DEPARTMENT_PREPARING", "FINANCE_REVIEWING"))
    .rejects.toThrow("INVALID_REIMBURSEMENT_TRANSITION");
});
```

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm --filter @xiangneng/api test -- reimbursement-domain.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 增加报销模型和约束**

实现批次、明细、附件、问题、审批、打款和产物模型；金额使用整数分；七态使用数据库枚举；明细顺序唯一；全部外键有索引。

- [ ] **Step 4: 实现最小领域服务**

金额从明细聚合；三张表由同一明细数组生成；推进状态时检查当前状态、权限、未解决问题和 `version`；更新条件包含旧版本，失败返回 `409 CONCURRENT_MODIFICATION`。

- [ ] **Step 5: 实现产物排序合同**

付款包与发票包分别生成，均使用表3明细 `sequence`；缺失附件进入提示页；附件 SHA-256 用于重复检测。

- [ ] **Step 6: 验证并提交**

Run:

```powershell
pnpm db:validate
pnpm db:generate
pnpm --filter @xiangneng/api test -- reimbursement-domain.test.ts
```

Expected: PASS。

Commit: `feat: add seven-state reimbursement domain`

### Task 5: 实现文件存储、报销 API、导出和审计

**Files:**
- Create: `apps/api/src/storage/file-storage.ts`
- Create: `apps/api/src/storage/local-file-storage.ts`
- Create: `apps/api/src/storage/cos-file-storage.ts`
- Create: `apps/api/src/routes/reimbursements.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/config.ts`
- Create: `apps/api/test/reimbursements.test.ts`
- Create: `apps/api/test/file-storage.test.ts`

**Interfaces:**
- Produces: `FileStorage.put/get/delete/createSignedDownload`
- API: `POST /reimbursements`
- API: `POST /reimbursements/:id/lines`
- API: `POST /reimbursements/:id/submit`
- API: `POST /reimbursements/:id/issues`
- API: `POST /reimbursements/:id/transition`
- API: `POST /reimbursements/:id/payment`
- API: `POST /reimbursements/:id/artifacts`

- [ ] **Step 1: 编写存储和 API 失败测试**

覆盖上传权限、下载权限、付款和发票分类、重复附件、七态权限、并发版本、事务回滚及审计。

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm --filter @xiangneng/api test -- file-storage.test.ts reimbursements.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现存储抽象**

本地实现使用随机对象键和路径归一化；COS 实现从环境变量读取配置；下载必须通过后端授权或短期签名地址；日志不写入密钥。

- [ ] **Step 4: 实现 API 和事务**

路由先做 Zod 校验和权限判断，再调用领域服务；外部 OCR 在事务外执行；数据库事务仅进行状态校验和写入。

- [ ] **Step 5: 验证并提交**

Run:

```powershell
pnpm --filter @xiangneng/api test -- file-storage.test.ts reimbursements.test.ts
pnpm --filter @xiangneng/api typecheck
```

Expected: PASS。

Commit: `feat: expose secure reimbursement and file APIs`

### Task 6: 完成 PC 报销、领导看板和核心后台联动

**Files:**
- Create: `apps/admin/src/pages/ReimbursementsPage.tsx`
- Create: `apps/admin/src/pages/ReimbursementDetailPage.tsx`
- Create: `apps/admin/src/pages/LeadershipDashboardPage.tsx`
- Modify: `apps/admin/src/pages/DashboardPage.tsx`
- Modify: `apps/admin/src/pages/PeoplePage.tsx`
- Modify: `apps/admin/src/pages/ProjectsPage.tsx`
- Modify: `apps/admin/src/pages/SuppliersPage.tsx`
- Modify: `apps/admin/src/pages/RecruitmentProgressPage.tsx`
- Modify: `apps/admin/src/routes/AppRoutes.tsx`
- Modify: `apps/admin/src/layout/AppLayout.tsx`
- Test: `apps/admin/src/pages/ReimbursementsPage.test.tsx`
- Test: `apps/admin/src/pages/LeadershipDashboardPage.test.tsx`

**Interfaces:**
- Consumes: 正式报销、统计、人员、项目、供应商和招聘 API。
- Produces: 桌面报销工作台、权限范围看板和可下钻统计。

- [ ] **Step 1: 编写真实交互失败测试**

覆盖新建明细、金额校验、上传分类、状态推进、问题解决、生成文件、下钻人员、项目详情和供应商详情。

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm --filter @xiangneng/admin test -- ReimbursementsPage.test.tsx LeadershipDashboardPage.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现桌面页面**

沿用已确认蓝白视觉和 Ant Design 表格/抽屉；不把 PC 页面改成手机卡片；所有统计卡可下钻；报销详情同时显示主状态和问题状态。

- [ ] **Step 4: 完善现有模块数据和按钮**

项目图片、岗位描述、任职要求、供应商联系人和电话全部来自 API 合成 Seed；查看详情、编辑、导出、报名、状态操作均有有效行为。

- [ ] **Step 5: 性能检查**

独立数据请求使用 `Promise.all`；路由保持懒加载；大表使用分页；筛选值使用稳定依赖；不把完整数据复制进 localStorage。

- [ ] **Step 6: 验证并提交**

Run:

```powershell
pnpm --filter @xiangneng/admin test
pnpm --filter @xiangneng/admin typecheck
pnpm --filter @xiangneng/admin lint
pnpm --filter @xiangneng/admin build
```

Expected: PASS。

Commit: `feat: complete desktop HR and reimbursement workflows`

### Task 7: 完成员工、供应商、现场运营和领导手机端

**Files:**
- Modify: `apps/portal/src`
- Modify: `apps/miniapp/src/app.config.ts`
- Create: `apps/miniapp/src/pages/reimbursements/index/index.tsx`
- Create: `apps/miniapp/src/pages/reimbursements/detail/index.tsx`
- Create: `apps/miniapp/src/pages/leadership/index.tsx`
- Modify: `apps/miniapp/src/pages/operator`
- Modify: `apps/miniapp/src/pages/supplier`
- Modify: `apps/miniapp/src/pages/profile`
- Test: `apps/portal/src/features/reimbursement/ReimbursementFlow.test.tsx`
- Test: `apps/miniapp/src/domain/roles.test.ts`
- Test: `apps/miniapp/src/domain/validation.test.ts`

**Interfaces:**
- Consumes: 同一 Fastify API。
- Produces: 求职者、供应商、现场运营、内部员工和领导五类入口。

- [ ] **Step 1: 编写角色导航和报销交互失败测试**

覆盖每个角色可见导航、供应商项目详情、员工报销、现场运营入离职和领导简化看板。

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm --filter @xiangneng/portal test && pnpm --filter @xiangneng/miniapp test`

Expected: FAIL，新页面和规则不存在。

- [ ] **Step 3: 实现 Portal 手机演示**

保持 390px 手机容器、状态栏、底部导航和参考图密度；使用正式 API；不以静态数组保存业务数据。

- [ ] **Step 4: 实现 Taro 页面**

复用领域校验和 API 客户端；所有必需页面加入 `app.config.ts`；准备隐私协议、权限说明、环境配置、版本号和 `miniprogram-ci` 上传脚本。

- [ ] **Step 5: 验证并提交**

Run:

```powershell
pnpm --filter @xiangneng/portal test
pnpm --filter @xiangneng/portal build
pnpm --filter @xiangneng/miniapp test
pnpm --filter @xiangneng/miniapp build:weapp
```

Expected: PASS，生成可导入微信开发者工具的 `apps/miniapp/dist`。

Commit: `feat: deliver interactive multi-role mobile experience`

### Task 8: 完成本地 Qwen3.5 AI 受控查询和写操作

**Files:**
- Modify: `apps/api/src/ai/ollama-provider.ts`
- Modify: `apps/api/src/ai/intent-router.ts`
- Modify: `apps/api/src/ai/data-tools.ts`
- Modify: `apps/api/src/ai/action-service.ts`
- Modify: `apps/api/src/routes/ai.ts`
- Modify: `apps/admin/src/components/AiAssistantPanel.tsx`
- Modify: `apps/portal/src/features`
- Test: `apps/api/test/ai-router.test.ts`
- Create: `apps/api/test/ai-live-data.test.ts`

**Interfaces:**
- API: 现有 `/api/ai/chat`、`/actions/confirm`、`/actions/:id`、`/health`、`/demo/reset`。
- Provider: `XIANGNENG_LLM_BASE_URL=http://127.0.0.1:11434/v1`
- Provider: `XIANGNENG_LLM_MODEL=qwen3.5:4b`

- [ ] **Step 1: 编写自由查询和权限失败测试**

覆盖任意自然语言统计、真实 DB 结果、同名候选、缺参、越权、Schema 失败、模型超时、无模型规则路由、预览不写、确认写入、幂等和 token 过期。

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm --filter @xiangneng/api test -- ai-router.test.ts ai-live-data.test.ts`

Expected: FAIL，复杂问句和新增统计未覆盖。

- [ ] **Step 3: 实现权限绑定工具**

每次工具调用从 session 加载授权上下文；模型只收到命中 Skill 的 2 至 4 个工具；参数和响应通过 JSON Schema；失败不得调用业务服务。

- [ ] **Step 4: 完善本地模型稳定性**

固定 `temperature=0.1`、10 秒超时、预热、失败计数熔断和表单降级；输出剥离思考标记；健康检查报告模型、数据库和工具状态。

- [ ] **Step 5: 实现可用聊天体验**

支持自由输入、快捷入口、结果表格、口径、更新时间、补参表单、同名选择、写操作预览、确认/修改/取消和健康状态。

- [ ] **Step 6: 验证并提交**

Run:

```powershell
pnpm --filter @xiangneng/api test -- ai-router.test.ts ai-live-data.test.ts
pnpm verify:ollama
pnpm verify:ai
```

Expected: 本地模型和无模型降级均 PASS。

Commit: `feat: connect permission-bound local qwen assistant`

### Task 9: 官网产品介绍、设计系统与视觉一致性

**Files:**
- Modify: `apps/admin/src/pages/ProductIntroPage.tsx`
- Modify: `apps/admin/src/styles`
- Modify: `apps/portal/src/styles`
- Modify: `apps/miniapp/src/app.scss`
- Create: `docs/design-system.md`
- Create: `docs/reports/ui-fidelity-ledger.md`
- Test: `apps/admin/src/pages/ProductIntroPage.test.tsx`

**Interfaces:**
- Consumes: 用户提供的 5 张端侧参考图和 3 张产品概念图。
- Produces: 统一设计 token、完整产品介绍和视觉差异台账。

- [ ] **Step 1: 编写产品页面交互失败测试**

验证产品介绍包含内部人事、报销、AI、多角色小程序和演示入口，入口可进入实际页面。

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm --filter @xiangneng/admin test -- ProductIntroPage.test.tsx`

Expected: FAIL，新增内容和链接不存在。

- [ ] **Step 3: 固化设计系统**

记录蓝白色板、字体层级、间距、圆角、阴影、图标和 PC/手机容器规则；后台保持桌面表格，小程序保持手机卡片和底部导航。

- [ ] **Step 4: 实现并进行分段浏览器对照**

先首屏，再产品思路、核心价值和 AI/报销能力；每段截图与对应概念图比较并修复。

- [ ] **Step 5: 验证并提交**

Run:

```powershell
pnpm --filter @xiangneng/admin test
pnpm --filter @xiangneng/admin build
```

Expected: PASS。

Commit: `feat: align product story and unified visual system`

### Task 10: 修复部署、健康检查和生产准备

**Files:**
- Modify: `apps/api/Dockerfile`
- Modify: `apps/admin/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `render.yaml`
- Modify: `package.json`
- Modify: `.env.example`
- Create: `scripts/start-production.ps1`
- Create: `scripts/check-deployment.mjs`
- Create: `scripts/upload-miniapp.mjs`
- Create: `docs/deployment.md`
- Test: `tests/deployment-config.test.mts`

**Interfaces:**
- Produces: 单命令本地启动、Docker Compose、Render 配置、COS/云数据库/微信上传模板。

- [ ] **Step 1: 编写配置行为失败测试**

运行配置检查器，断言 API 镜像包含 Portal 构建、Render 使用存在的 pnpm 脚本、Demo reset 仅在 demo 环境开放、CORS 不允许凭据与通配源组合。

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm exec vitest run tests/deployment-config.test.mts`

Expected: FAIL，当前 Dockerfile 和 Render 命令不符合要求。

- [ ] **Step 3: 修复构建与运行**

API 镜像构建 shared、Portal 和 API；后台单独构建；迁移和 Seed 使用根脚本；增加健康检查和持久上传卷；生产脚本不写入密钥。

- [ ] **Step 4: 准备微信和云配置**

上传脚本从 `WECHAT_APP_ID`、`WECHAT_PRIVATE_KEY_PATH`、版本号和说明读取；缺失时明确失败；正式提交审核不自动执行。

- [ ] **Step 5: 验证并提交**

Run:

```powershell
pnpm exec vitest run tests/deployment-config.test.mts
pnpm check
docker compose build
```

Expected: 在 Docker 可用环境全部 PASS；本机缺少 Docker 时保留真实阻塞证据并由 CI 执行镜像构建。

Commit: `build: harden demo and production deployment`

### Task 11: 全量自动化与真实浏览器验收

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/full-business-flow.spec.ts`
- Create: `tests/e2e/reimbursement-flow.spec.ts`
- Create: `tests/e2e/ai-assistant.spec.ts`
- Create: `docs/acceptance-report.md`
- Create: `docs/reports/ui-fidelity-ledger.md`

**Interfaces:**
- Produces: 登录、人员生命周期、供应商详情、报销七态、AI 查询/确认和手机端的可重复验收。

- [ ] **Step 1: 编写端到端失败测试**

测试必须通过浏览器实际登录、创建合成人员、面试、入职、离职、提交报销、推进七态、查看供应商项目详情、让 AI 查询并执行单人状态操作。

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:e2e`

Expected: 在未完成页面或服务时 FAIL。

- [ ] **Step 3: 修复所有发现的问题**

每个缺陷先增加或收紧失败测试，再修改生产代码；不得跳过测试或隐藏错误。

- [ ] **Step 4: 运行完整质量门**

Run:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @xiangneng/miniapp build:weapp
pnpm test:e2e
```

Expected: 全部 PASS。

- [ ] **Step 5: 视觉对照**

通过 Browser/IAB 获取桌面与 390px 手机截图；使用 `view_image` 同时检查参考图和最新实现；在台账中记录至少五个对照点及修复结果。

- [ ] **Step 6: 提交**

Commit: `test: complete full-system acceptance coverage`

### Task 12: GitHub PR、CI、公开演示和最终交付

**Files:**
- Create: `.github/workflows/ci.yml`
- Update: `docs/deployment.md`
- Update: `docs/acceptance-report.md`
- Update: `README.md`

**Interfaces:**
- Produces: 正常源码分支、Commit、Draft PR、CI、公开演示 URL、演示账号和验收证据。

- [ ] **Step 1: 增加 CI**

CI 安装 Node 24、pnpm 11、PostgreSQL，运行 Prisma 迁移、合成 Seed、typecheck、lint、test、Web/Taro 构建和 Docker 构建。

- [ ] **Step 2: 最终安全扫描**

Run:

```powershell
pnpm exec tsx scripts/verify-public-data-safety.mts
git status --short
git diff --check
```

Expected: 无敏感数据、无未跟踪产物、无空白错误。

- [ ] **Step 3: 推送正常源码分支**

```powershell
git push -u origin codex/full-hrms-production
```

- [ ] **Step 4: 创建 Draft Pull Request**

PR 标题使用 `feat: deliver full Xiangneng HRMS platform`，正文列出模块、迁移、权限、数据隔离、验证、部署和已知外部凭据限制；不关闭或合并 `main`。

- [ ] **Step 5: 处理 CI**

使用 `gh-fix-ci` 获取 Actions 日志，逐项修复可修复失败并重新推送；如出现评审意见，使用 `gh-address-comments` 逐项处理。

- [ ] **Step 6: 部署公开合成演示**

部署独立 PostgreSQL、API、后台和 Portal，导入合成 Seed，通过公开 URL 实际登录并完成核心流程。缺少部署账号时保留可直接执行配置并明确唯一外部阻塞。

- [ ] **Step 7: 完成验收报告**

记录仓库、分支、Commit、PR、CI、演示网址、演示账号、测试命令与真实结果、微信/COS/数据库/域名配置入口、已知限制和对现有系统的影响。
