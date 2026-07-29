# 真实数据与报销闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实业务数据替换内部虚构数据，并完成小程序报销、部门汇总审核、财务付款汇总的可用闭环。

**Architecture:** 将两份 Excel 标准化为内部业务数据 JSON，内部 Seed 与离线内部演示读取该数据，公开演示仍使用独立合成数据。报销保留个人明细主档，新增按组织和周期聚合的部门批次视图、自动校验结果与付款汇总。

**Tech Stack:** Node.js 22、TypeScript、Fastify、Prisma、React、Taro、Vitest、SheetJS。

## Global Constraints

- 不脱敏、不编造真实内部数据。
- 公开演示不得包含真实身份证、电话或源文件内容。
- 确定性校验由系统自动完成。
- 同一信息只录入一次，汇总与输出由明细自动生成。
- 组织架构可配置，不写死当前部门数量和层级。

---

### Task 1: 真实数据标准化器

**Files:**
- Create: `scripts/real-data/normalize-real-business-data.mjs`
- Create: `scripts/real-data/normalize-real-business-data.test.mjs`
- Create: `data/internal/real-business-data.json`
- Create: `data/internal/real-business-data-reconciliation.json`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: 两份用户上传工作簿路径。
- Produces: `normalizeRealBusinessData({ weeklyRows, enterpriseRows })` 与统一业务数据 JSON。

- [ ] 写失败测试：过滤汇总行、真实项目归属、身份证去重、报名记录保留、部门名称归一。
- [ ] 运行测试确认失败。
- [ ] 实现标准化器并生成真实数据文件。
- [ ] 运行测试和对账检查。
- [ ] 提交。

### Task 2: 内部与公开数据源隔离

**Files:**
- Create: `scripts/lib/business-data-source.mts`
- Create: `scripts/lib/business-data-source.test.mjs`
- Modify: `scripts/import-demo-data.mts`
- Modify: `apps/admin/src/lib/demo-data.generated.ts`
- Modify: `apps/sites-demo/build.mjs`

**Interfaces:**
- Consumes: `XIANGNENG_DATA_MODE=internal|public-demo`。
- Produces: 内部模式读取真实数据，公开模式强制读取合成数据。

- [ ] 写失败测试：内部模式选真实数据，公开模式拒绝真实数据。
- [ ] 运行测试确认失败。
- [ ] 实现数据源选择与公开构建保护。
- [ ] 运行测试。
- [ ] 提交。

### Task 3: 真实组织树与数据映射

**Files:**
- Create: `scripts/real-data/organization-blueprint.mjs`
- Create: `scripts/real-data/organization-blueprint.test.mjs`
- Modify: `scripts/import-demo-data.mts`
- Modify: `apps/admin/src/lib/demo.ts`

**Interfaces:**
- Produces: `createXiangnengOrganizationBlueprint()` 和 `normalizeOrganizationName(name)`。

- [ ] 写失败测试覆盖公司、四个中心、职能部门、MOC分公司和保安公司。
- [ ] 运行测试确认失败。
- [ ] 实现组织蓝图与源表部门归一。
- [ ] 将 Seed 和离线内部演示切换为真实组织。
- [ ] 运行测试。
- [ ] 提交。

### Task 4: 报销自动校验

**Files:**
- Create: `apps/api/src/services/reimbursement-validation.ts`
- Create: `apps/api/test/reimbursement-validation.test.ts`
- Modify: `apps/api/src/routes/reimbursements.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727160000_reimbursement_validation/migration.sql`

**Interfaces:**
- Produces: `validateReimbursementSubmission(input)`、发票指纹和结构化校验结果。

- [ ] 写失败测试覆盖金额、附件完整、确定重复、疑似重复、合计勾稽。
- [ ] 运行测试确认失败。
- [ ] 实现校验服务与持久化字段。
- [ ] 接入提交和财务审核前置检查。
- [ ] 运行报销模块测试。
- [ ] 提交。

### Task 5: 部门报销批次与付款汇总

**Files:**
- Create: `apps/api/src/services/reimbursement-department-summary.ts`
- Create: `apps/api/test/reimbursement-department-summary.test.ts`
- Modify: `apps/api/src/routes/reimbursements.ts`
- Modify: `apps/api/src/services/reimbursement-artifacts.ts`
- Modify: `apps/admin/src/types/domain.ts`
- Modify: `apps/miniapp/src/api/types.ts`
- Modify: `apps/miniapp/src/api/services.ts`

**Interfaces:**
- Produces: `buildDepartmentReimbursementSummary(batches)`、`buildPaymentRoster(batches)`、部门汇总接口与付款表导出。

- [ ] 写失败测试覆盖部门、费用类型、报销人金额和付款名单聚合。
- [ ] 运行测试确认失败。
- [ ] 实现聚合服务与 API。
- [ ] 扩展工作簿生成部门汇总和付款名单。
- [ ] 运行测试。
- [ ] 提交。

### Task 6: 小程序报销入口与角色工作台

**Files:**
- Modify: `apps/miniapp/src/domain/roles.ts`
- Modify: `apps/miniapp/src/domain/roles.test.ts`
- Modify: `apps/miniapp/src/pages/index/index.tsx`
- Modify: `apps/miniapp/src/pages/reimbursements/index/index.tsx`
- Create: `apps/miniapp/src/pages/reimbursements/department/index.tsx`
- Create: `apps/miniapp/src/pages/reimbursements/payment/index.tsx`
- Modify: `apps/miniapp/src/app.config.ts`

**Interfaces:**
- 内部员工固定显示“我的报销”；制单、负责人、财务、出纳显示与职责对应的部门待办和付款汇总。

- [ ] 写失败测试：内部员工菜单始终包含报销；管理角色显示对应工作台。
- [ ] 运行测试确认失败。
- [ ] 实现菜单、页面与接口调用。
- [ ] 运行小程序模块测试。
- [ ] 提交。

### Task 7: 管理后台部门汇总审核

**Files:**
- Modify: `apps/admin/src/pages/ReimbursementsPage.tsx`
- Modify: `apps/admin/src/pages/ReimbursementsPage.test.tsx`
- Modify: `apps/admin/src/lib/demo.ts`

**Interfaces:**
- 财务默认查看部门批次汇总，支持下钻明细；付款阶段显示报销人与审核金额。

- [ ] 写失败测试覆盖部门汇总主视图与付款名单。
- [ ] 运行测试确认失败。
- [ ] 实现页面和内部离线数据行为。
- [ ] 运行测试。
- [ ] 提交。

### Task 8: 完整验证与交付包

**Files:**
- Modify: `docs/requirements-matrix.md`
- Create: `docs/真实数据与报销闭环验收报告.md`

**Interfaces:**
- Produces: 可重复验证命令、源数据对账结果和最终 ZIP。

- [ ] 运行真实数据标准化测试和对账。
- [ ] 运行项目结构检查、TypeScript 类型检查和可执行测试。
- [ ] 扫描公开构建引用，确认不存在真实 PII。
- [ ] 生成源码 ZIP、补丁和验收报告。
- [ ] 提交。
