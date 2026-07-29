# 业务模块索引

> 自动生成，请勿手工编辑。源指纹：`fcc8dddb324cc313`。

| ID | 模块 | 文件 | 源码行 | 依赖 | 职责 |
| --- | --- | --- | --- | --- | --- |
| `platform` | 平台与工程基础 | 57 | 4964 | 无 | 工作区配置、部署、构建、演示环境和跨应用公共工程能力。 |
| `auth` | 账号、会话与权限 | 17 | 3907 | `organization` | 登录会话、多角色授权、权限定义、数据范围和账号管理。 |
| `organization` | 组织与内部员工 | 24 | 4910 | 无 | 集团、中心、业务部门、岗位、职级、合同主体和内部员工任职关系。 |
| `workforce` | 求职者与派遣外包人员 | 15 | 4088 | `project`、`supplier` | 求职者、派遣外包员工、人员档案、生命周期状态和附件。 |
| `recruitment` | 招聘需求与进度 | 17 | 3533 | `project`、`supplier`、`workforce`、`auth` | 岗位需求、报名、面试、入职进度、员工推荐和奖励。 |
| `project` | 项目与经营区域 | 9 | 2335 | `auth` | 项目、经营区域 Branch、项目图片、现场运营负责人和项目授权。 |
| `supplier` | 供应商与政策 | 9 | 2630 | `project`、`auth` | 供应商、项目合作关系、供应商政策和员工推荐政策。 |
| `reimbursement` | 员工报销 | 21 | 7486 | `auth`、`organization`、`notification` | 员工报销申请、部门制单、审批、财务审核、付款和打印材料。 |
| `payroll` | 工资与工资条 | 5 | 2508 | `workforce`、`project`、`auth`、`import-export` | 工资批次、工资条、导入核验和员工工资查询。 |
| `reporting` | 统计与经营看板 | 7 | 1289 | `workforce`、`recruitment`、`project`、`supplier`、`payroll`、`reimbursement` | 管理看板、招聘统计、领导驾驶舱和跨模块只读汇总。 |
| `notification` | 通知与待办 | 2 | 1917 | `auth` | 站内通知、读取状态和业务待办提醒。 |
| `import-export` | 导入导出与数据安全 | 15 | 4448 | `auth` | Excel 导入、导出、模板解析、数据预览和表格安全校验。 |
| `ai` | AI 业务助手 | 23 | 5541 | `auth`、`organization`、`workforce`、`recruitment`、`project`、`supplier`、`reimbursement`、`payroll`、`reporting` | 意图识别、受控工具调用、确认令牌、模型适配和 AI 审计。 |
| `portal` | 员工、供应商与公开端体验 | 61 | 5091 | `auth`、`workforce`、`recruitment`、`supplier`、`payroll`、`reimbursement`、`notification` | Portal 手机网页演示、个人服务、供应商服务和公开产品展示。 |

## 平台与工程基础（`platform`）

- 文件数：57
- 源码行数：4964
- 依赖：无
- 数据模型：无专属模型
- 测试命令：`pnpm typecheck`；`pnpm lint`；`pnpm test`；`pnpm build`

<details><summary>文件清单</summary>

- `.env.example`
- `apps/admin/package.json`
- `apps/api/package.json`
- `apps/miniapp/package.json`
- `apps/portal/package.json`
- `apps/sites-demo/package.json`
- `apps/website/package.json`
- `docker-compose.yml`
- `package.json`
- `packages/data-import/package.json`
- `packages/shared/package.json`
- `pnpm-workspace.yaml`
- `render.yaml`
- `scripts/bootstrap-real-employee-accounts.mts`
- `scripts/build-ai-context.mjs`
- `scripts/check-architecture.mjs`
- `scripts/compact-demo-data.mjs`
- `scripts/enrich-demo-data.mts`
- `scripts/generate-project-index.mjs`
- `scripts/generate-synthetic-demo-data.mts`
- `scripts/import-demo-data.mts`
- `scripts/import-real-business-data.mts`
- `scripts/package-demo.mjs`
- `scripts/portable-demo-server.mjs`
- `scripts/project-tools/access-account-route-contract.test.mjs`
- `scripts/project-tools/admin-operation-centers-contract.test.mjs`
- `scripts/project-tools/architecture-check.mjs`
- `scripts/project-tools/architecture-check.test.mjs`
- `scripts/project-tools/business-data-source.test.mjs`
- `scripts/project-tools/context-builder.mjs`
- `scripts/project-tools/context-builder.test.mjs`
- `scripts/project-tools/core.mjs`
- `scripts/project-tools/core.test.mjs`
- `scripts/project-tools/index-generator.mjs`
- `scripts/project-tools/index-generator.test.mjs`
- `scripts/project-tools/internal-startup-contract.test.mjs`
- `scripts/project-tools/migration-workflow-access-schema.test.mjs`
- `scripts/project-tools/real-business-import-plan.test.mjs`
- `scripts/project-tools/upsert-collection.test.mjs`
- `scripts/reset-demo-database.ps1`
- `scripts/run-e2e.mjs`
- `scripts/seed-internal-admin.mts`
- `scripts/seed-internal-system.mts`
- `scripts/smoke-3399.mjs`
- `scripts/start-api-demo-background.ps1`
- `scripts/start-internal-system.ps1`
- `scripts/start-local-demo.ps1`
- `scripts/stop-internal-system.ps1`
- `scripts/stop-local-demo.ps1`
- `scripts/verify-ai-integration.mts`
- `scripts/verify-internal-org-model.mjs`
- `scripts/verify-ollama.mts`
- `scripts/verify-package-manifest.mjs`
- `scripts/verify-packaged-demo.mjs`
- `scripts/verify-public-data-safety.mts`
- `scripts/watchdog-demo.ps1`
- `tsconfig.base.json`

</details>

## 账号、会话与权限（`auth`）

- 文件数：17
- 源码行数：3907
- 依赖：`organization`
- 数据模型：`Role`、`PermissionDefinition`、`RolePermission`、`UserRoleAssignment`、`DataScopeBinding`、`User`、`UserProject`
- 测试命令：`pnpm test:module:authorization`

<details><summary>文件清单</summary>

- `apps/admin/src/auth/AuthContext.test.tsx`
- `apps/admin/src/auth/AuthContext.tsx`
- `apps/admin/src/components/PermissionGuard.tsx`
- `apps/admin/src/pages/LoginPage.tsx`
- `apps/admin/src/pages/SettingsPage.tsx`
- `apps/api/src/authorization.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/users.ts`
- `apps/api/src/session-user.ts`
- `apps/api/test/authorization.test.ts`
- `apps/api/test/position-authorizations.test.ts`
- `apps/miniapp/src/auth/session.ts`
- `apps/miniapp/src/domain/roles.test.ts`
- `apps/miniapp/src/domain/roles.ts`
- `apps/miniapp/src/pages/login/index.tsx`
- `packages/shared/src/permissions.ts`
- `prisma/schema.prisma`

</details>

## 组织与内部员工（`organization`）

- 文件数：24
- 源码行数：4910
- 依赖：无
- 数据模型：`LegalEntity`、`OrganizationUnit`、`Position`、`JobGrade`、`JobGradeApprovalPolicy`、`InternalEmployee`、`InternalEmployment`、`InternalEmployeeChange`
- 测试命令：`pnpm test:module:organization`

<details><summary>文件清单</summary>

- `apps/admin/src/pages/InternalEmployeesPage.test.tsx`
- `apps/admin/src/pages/InternalEmployeesPage.tsx`
- `apps/api/src/routes/internal-employees.ts`
- `apps/api/src/services/internal-employees.ts`
- `apps/api/src/services/position-authorizations.ts`
- `apps/api/test/internal-employee-domain.test.ts`
- `apps/api/test/internal-employee-routes.test.ts`
- `apps/api/test/position-authorizations.test.ts`
- `prisma/migrations/20260718150000_init/migration.sql`
- `prisma/migrations/20260722075359_ai_business_assistant/migration.sql`
- `prisma/migrations/20260722083629_portal_unification/migration.sql`
- `prisma/migrations/20260722083919_portal_notification_reads/migration.sql`
- `prisma/migrations/20260726230500_internal_hr_rbac/migration.sql`
- `prisma/migrations/20260726234000_reimbursement_domain/migration.sql`
- `prisma/migrations/20260727090000_position_role_bindings/migration.sql`
- `prisma/migrations/20260727091000_reimbursement_invoice_cover/migration.sql`
- `prisma/migrations/20260727100000_job_grade_reimbursement_policies/migration.sql`
- `prisma/migrations/20260727101000_internal_employee_account_binding/migration.sql`
- `prisma/migrations/20260727130000_internal_departments_not_branches/migration.sql`
- `prisma/migrations/20260727150000_dynamic_real_organization_types/migration.sql`
- `prisma/migrations/20260727150100_recast_real_organization_nodes/migration.sql`
- `prisma/migrations/20260729010000_migration_workflow_access_accounts/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `prisma/schema.prisma`

</details>

## 求职者与派遣外包人员（`workforce`）

- 文件数：15
- 源码行数：4088
- 依赖：`project`、`supplier`
- 数据模型：`Person`、`PersonFile`、`PersonStatusLog`
- 测试命令：`pnpm --filter @xiangneng/api exec vitest run test/registration.test.ts test/portal-mappers.test.ts`

<details><summary>文件清单</summary>

- `apps/admin/src/lib/people.ts`
- `apps/admin/src/pages/PeoplePage.tsx`
- `apps/api/src/routes/people.ts`
- `apps/api/src/services/people-workbook.ts`
- `apps/api/src/services/person-lifecycle.ts`
- `apps/api/src/services/registration.ts`
- `apps/api/test/registration.test.ts`
- `apps/miniapp/src/pages/operator/interviews/index.tsx`
- `apps/miniapp/src/pages/operator/offboarding/index.tsx`
- `apps/miniapp/src/pages/operator/onboarding/index.tsx`
- `apps/miniapp/src/pages/operator/people/index.tsx`
- `apps/miniapp/src/pages/operator/person-detail/index.tsx`
- `apps/miniapp/src/pages/operator/register/index.tsx`
- `apps/miniapp/src/pages/supplier/people/index.tsx`
- `prisma/schema.prisma`

</details>

## 招聘需求与进度（`recruitment`）

- 文件数：17
- 源码行数：3533
- 依赖：`project`、`supplier`、`workforce`、`auth`
- 数据模型：`JobDemand`、`Application`、`ReferralRecord`、`ReferralReward`、`ReferralShare`
- 测试命令：`pnpm --filter @xiangneng/api exec vitest run test/registration.test.ts test/job-notification.test.ts`

<details><summary>文件清单</summary>

- `apps/admin/src/pages/JobDemandsPage.tsx`
- `apps/admin/src/pages/RecruitmentProgressPage.tsx`
- `apps/admin/src/pages/ReferralRewardsPage.tsx`
- `apps/api/src/routes/applications.ts`
- `apps/api/src/routes/jobs.ts`
- `apps/api/src/routes/referrals.ts`
- `apps/api/src/services/recruitment-progress.ts`
- `apps/api/src/services/referral-share.ts`
- `apps/miniapp/src/pages/application/form/index.tsx`
- `apps/miniapp/src/pages/application/mine/index.tsx`
- `apps/miniapp/src/pages/jobs/detail/index.config.ts`
- `apps/miniapp/src/pages/jobs/detail/index.tsx`
- `apps/miniapp/src/pages/jobs/index/index.tsx`
- `apps/miniapp/src/pages/referrals/index/index.tsx`
- `apps/miniapp/src/pages/referrals/mine/index.tsx`
- `apps/miniapp/src/pages/referrals/rewards/index.tsx`
- `prisma/schema.prisma`

</details>

## 项目与经营区域（`project`）

- 文件数：9
- 源码行数：2335
- 依赖：`auth`
- 数据模型：`Branch`、`Project`、`ProjectImage`、`UserProject`
- 测试命令：`pnpm --filter @xiangneng/api exec vitest run test/auth-and-scope.test.ts test/public-resources.test.ts`

<details><summary>文件清单</summary>

- `apps/admin/public/project-assets/electronics-workshop.png`
- `apps/admin/public/project-assets/logistics-warehouse.png`
- `apps/admin/public/project-assets/new-energy-campus.png`
- `apps/admin/src/pages/ProjectsPage.tsx`
- `apps/api/src/routes/projects.ts`
- `apps/portal/public/project-assets/electronics-workshop.png`
- `apps/portal/public/project-assets/logistics-warehouse.png`
- `apps/portal/public/project-assets/new-energy-campus.png`
- `prisma/schema.prisma`

</details>

## 供应商与政策（`supplier`）

- 文件数：9
- 源码行数：2630
- 依赖：`project`、`auth`
- 数据模型：`Supplier`、`SupplierProject`、`Policy`
- 测试命令：`pnpm --filter @xiangneng/api exec vitest run test/portal-mappers.test.ts test/portal-security.test.ts`

<details><summary>文件清单</summary>

- `apps/admin/src/pages/PoliciesPage.tsx`
- `apps/admin/src/pages/SuppliersPage.tsx`
- `apps/api/src/routes/policies.ts`
- `apps/api/src/routes/suppliers.ts`
- `apps/miniapp/src/pages/supplier/metrics/index.tsx`
- `apps/miniapp/src/pages/supplier/people/index.tsx`
- `apps/miniapp/src/pages/supplier/policies/index.tsx`
- `apps/portal/src/features/supplier/SupplierPages.tsx`
- `prisma/schema.prisma`

</details>

## 员工报销（`reimbursement`）

- 文件数：21
- 源码行数：7486
- 依赖：`auth`、`organization`、`notification`
- 数据模型：`ReimbursementBatch`、`ReimbursementLine`、`ReimbursementAttachment`、`ReimbursementIssue`、`ReimbursementApproval`、`ReimbursementPayment`、`ReimbursementArtifact`
- 测试命令：`pnpm test:module:reimbursement`

<details><summary>文件清单</summary>

- `apps/admin/src/lib/demo-reimbursement.test.ts`
- `apps/admin/src/pages/ReimbursementsPage.test.tsx`
- `apps/admin/src/pages/ReimbursementsPage.tsx`
- `apps/api/src/routes/reimbursements.ts`
- `apps/api/src/services/reimbursement-artifacts.ts`
- `apps/api/src/services/reimbursements.ts`
- `apps/api/test/reimbursement-artifacts.test.ts`
- `apps/api/test/reimbursement-automation.node.test.ts`
- `apps/api/test/reimbursement-domain.test.ts`
- `apps/api/test/reimbursement-routes.test.ts`
- `apps/api/test/reimbursements.test.ts`
- `apps/miniapp/src/api/services.ts`
- `apps/miniapp/src/domain/reimbursements.test.ts`
- `apps/miniapp/src/domain/reimbursements.ts`
- `apps/miniapp/src/pages/reimbursements/detail/index.config.ts`
- `apps/miniapp/src/pages/reimbursements/detail/index.tsx`
- `apps/miniapp/src/pages/reimbursements/form/index.config.ts`
- `apps/miniapp/src/pages/reimbursements/form/index.tsx`
- `apps/miniapp/src/pages/reimbursements/index/index.config.ts`
- `apps/miniapp/src/pages/reimbursements/index/index.tsx`
- `prisma/schema.prisma`

</details>

## 工资与工资条（`payroll`）

- 文件数：5
- 源码行数：2508
- 依赖：`workforce`、`project`、`auth`、`import-export`
- 数据模型：`SalaryImportBatch`、`SalarySlip`
- 测试命令：`pnpm --filter @xiangneng/api exec vitest run test/workflow-and-salary.test.ts`

<details><summary>文件清单</summary>

- `apps/admin/src/pages/SalarySlipsPage.tsx`
- `apps/api/src/routes/salary.ts`
- `apps/api/src/services/salary-workbook.ts`
- `apps/miniapp/src/pages/salary/index/index.tsx`
- `prisma/schema.prisma`

</details>

## 统计与经营看板（`reporting`）

- 文件数：7
- 源码行数：1289
- 依赖：`workforce`、`recruitment`、`project`、`supplier`、`payroll`、`reimbursement`
- 数据模型：无专属模型
- 测试命令：`pnpm --filter @xiangneng/api exec vitest run test/statistics-and-import.test.ts test/leadership-dashboard.test.ts`；`pnpm --filter @xiangneng/admin exec vitest run src/pages/LeadershipDashboardPage.test.tsx`

<details><summary>文件清单</summary>

- `apps/admin/src/lib/statistics.ts`
- `apps/admin/src/pages/DashboardPage.tsx`
- `apps/admin/src/pages/LeadershipDashboardPage.test.tsx`
- `apps/admin/src/pages/LeadershipDashboardPage.tsx`
- `apps/admin/src/pages/StatisticsPage.tsx`
- `apps/api/src/routes/leadership.ts`
- `apps/api/src/routes/statistics.ts`

</details>

## 通知与待办（`notification`）

- 文件数：2
- 源码行数：1917
- 依赖：`auth`
- 数据模型：`Notification`、`PortalNotificationRead`
- 测试命令：`pnpm --filter @xiangneng/api exec vitest run test/job-notification.test.ts`

<details><summary>文件清单</summary>

- `apps/api/src/routes/notifications.ts`
- `prisma/schema.prisma`

</details>

## 导入导出与数据安全（`import-export`）

- 文件数：15
- 源码行数：4448
- 依赖：`auth`
- 数据模型：`ImportJob`
- 测试命令：`pnpm --filter @xiangneng/api exec vitest run test/statistics-and-import.test.ts test/spreadsheet-safety.test.ts test/workbook-row-numbers.test.ts`；`pnpm --filter @xiangneng/data-import test`

<details><summary>文件清单</summary>

- `apps/admin/src/pages/ImportsPage.tsx`
- `apps/api/src/routes/imports.ts`
- `apps/api/src/services/people-workbook.ts`
- `apps/api/src/services/salary-workbook.ts`
- `apps/api/src/services/spreadsheet-safety.ts`
- `packages/data-import/package.json`
- `packages/data-import/src/cli.ts`
- `packages/data-import/src/index.ts`
- `packages/data-import/src/project-master.test.ts`
- `packages/data-import/src/project-master.ts`
- `packages/data-import/src/synthetic-demo.test.ts`
- `packages/data-import/src/synthetic-demo.ts`
- `packages/data-import/tsconfig.json`
- `prisma/schema.prisma`
- `scripts/import-demo-data.mts`

</details>

## AI 业务助手（`ai`）

- 文件数：23
- 源码行数：5541
- 依赖：`auth`、`organization`、`workforce`、`recruitment`、`project`、`supplier`、`reimbursement`、`payroll`、`reporting`
- 数据模型：`AiAction`、`AiAuditLog`、`AiDemoSnapshot`
- 测试命令：`pnpm verify:ai`；`pnpm verify:ollama`

<details><summary>文件清单</summary>

- `apps/admin/src/components/AdminAiDrawer.tsx`
- `apps/admin/src/components/AiAssistantPanel.tsx`
- `apps/admin/src/components/AiChat.tsx`
- `apps/admin/src/lib/ai-assistant.ts`
- `apps/admin/src/lib/demo-ai.test.ts`
- `apps/admin/src/lib/demo-ai.ts`
- `apps/admin/src/pages/AiAssistantPage.tsx`
- `apps/api/src/ai/action-service.ts`
- `apps/api/src/ai/business-knowledge.ts`
- `apps/api/src/ai/chat-fastpath.ts`
- `apps/api/src/ai/data-tools.ts`
- `apps/api/src/ai/date-time.ts`
- `apps/api/src/ai/intent-router.ts`
- `apps/api/src/ai/ollama-client.ts`
- `apps/api/src/ai/permissions.ts`
- `apps/api/src/ai/schema-registry.ts`
- `apps/api/src/ai/system-prompt.ts`
- `apps/api/src/ai/types.ts`
- `apps/api/src/routes/ai.ts`
- `apps/portal/src/features/ai/AiAssistant.tsx`
- `prisma/schema.prisma`
- `scripts/verify-ai-integration.mts`
- `scripts/verify-ollama.mts`

</details>

## 员工、供应商与公开端体验（`portal`）

- 文件数：61
- 源码行数：5091
- 依赖：`auth`、`workforce`、`recruitment`、`supplier`、`payroll`、`reimbursement`、`notification`
- 数据模型：`PortalFavorite`、`PortalAdvance`、`PortalAppeal`、`PortalSettlement`、`PortalSettlementItem`、`PortalQrCode`
- 测试命令：`pnpm --filter @xiangneng/api exec vitest run test/portal-mappers.test.ts test/portal-security.test.ts test/public-resources.test.ts`；`pnpm --filter @xiangneng/portal test`

<details><summary>文件清单</summary>

- `apps/admin/public/product-assets/admin-dashboard.png`
- `apps/admin/public/product-assets/miniapp-employee.png`
- `apps/admin/public/product-assets/miniapp-operations.png`
- `apps/admin/public/product-assets/miniapp-supplier.png`
- `apps/admin/src/pages/MiniappDemoPage.tsx`
- `apps/admin/src/pages/ProductIntroPage.tsx`
- `apps/portal/index.html`
- `apps/portal/package.json`
- `apps/portal/public/brand-mark.svg`
- `apps/portal/public/project-assets/electronics-workshop.png`
- `apps/portal/public/project-assets/logistics-warehouse.png`
- `apps/portal/public/project-assets/new-energy-campus.png`
- `apps/portal/src/app/api.ts`
- `apps/portal/src/app/App.tsx`
- `apps/portal/src/app/demo.test.ts`
- `apps/portal/src/app/demo.ts`
- `apps/portal/src/app/format.ts`
- `apps/portal/src/app/session.tsx`
- `apps/portal/src/app/types.ts`
- `apps/portal/src/components/AppShell.tsx`
- `apps/portal/src/components/Avatar.tsx`
- `apps/portal/src/components/BrandMark.tsx`
- `apps/portal/src/components/DataCards.tsx`
- `apps/portal/src/components/StatusTag.test.tsx`
- `apps/portal/src/components/StatusTag.tsx`
- `apps/portal/src/components/Ui.tsx`
- `apps/portal/src/features/ai/AiAssistant.tsx`
- `apps/portal/src/features/entry/IdentityEntry.test.tsx`
- `apps/portal/src/features/entry/IdentityEntry.tsx`
- `apps/portal/src/features/internal/InternalPages.tsx`
- `apps/portal/src/features/personal/PersonalPages.tsx`
- `apps/portal/src/features/supplier/SupplierPages.tsx`
- `apps/portal/src/main.tsx`
- `apps/portal/src/styles/ai-assistant.css`
- `apps/portal/src/styles/app.css`
- `apps/portal/src/styles/global.css`
- `apps/portal/src/styles/internal.css`
- `apps/portal/src/styles/personal.css`
- `apps/portal/src/styles/supplier.css`
- `apps/portal/src/styles/tokens.css`
- `apps/portal/src/test/setup.ts`
- `apps/portal/tsconfig.json`
- `apps/portal/vite.config.ts`
- `apps/sites-demo/.gitignore`
- `apps/sites-demo/.openai/hosting.json`
- `apps/sites-demo/build.mjs`
- `apps/sites-demo/package.json`
- `apps/sites-demo/public-data-policy.mjs`
- `apps/sites-demo/public-data-policy.test.mjs`
- `apps/website/#U4ea4#U4ed8#U8d28#U68c0#U62a5#U544a.md`
- `apps/website/index.html`
- `apps/website/package.json`
- `apps/website/public/screenshots/dashboard-desktop.png`
- `apps/website/public/screenshots/projects-mobile.png`
- `apps/website/public/screenshots/resource-scope.png`
- `apps/website/screenshots-desktop.png`
- `apps/website/screenshots-mobile.png`
- `apps/website/src/main.tsx`
- `apps/website/src/styles.css`
- `apps/website/tsconfig.json`
- `apps/website/vite.config.ts`

</details>
