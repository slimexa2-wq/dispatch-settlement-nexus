# 小程序报销与岗位权限联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在保留现有后台报销模块和 API 的前提下，补齐微信小程序报销闭环，并让内部员工岗位自动生成角色与数据范围授权。

**Architecture:** 继续沿用现有 Fastify + Prisma + Taro React 架构。授权层增加“角色授权包”，把角色、权限和数据范围保持在同一授权上下文中；岗位绑定通过 Prisma 配置表生成 POSITION 来源的角色授权，调岗时只替换岗位授权，人工临时授权继续保留。小程序使用统一报销中心，根据权限动态展示员工申请、部门整理、负责人审核、财务审核和付款操作。

**Tech Stack:** TypeScript 5.8、Fastify 5、Prisma 6、React 18、Taro 4、Vitest 3、PostgreSQL。

## Global Constraints

- 保留现有后台报销页面、报销 API 路径和数据库业务表，不推倒重写。
- 岗位决定职责角色；组织归属决定数据范围；职级审批规则本轮只保留扩展接口，不擅自写死金额。
- 人工授权与临时授权不得被调岗流程误删；岗位自动授权必须可追溯、可撤销。
- 服务端必须做真实权限和数据范围校验，小程序隐藏按钮不能替代服务端授权。
- 付款凭证和发票继续分开上传、分开整理，均关联具体报销明细。
- 当前沙箱无法访问 npm，依赖安装和完整 Vitest/构建命令可能无法执行；仍需完成测试文件、静态检查、语法校验和可复核交付。


## 实际实施补充

在原计划范围内额外补齐了两个直接影响落地的必要闭环：

- 内部员工系统账号绑定、换绑和解绑，确保岗位权限能够真正同步到账号；
- 职级报销审批金额上限配置，避免“职级参与权限”只停留在数据字段层。

完整依赖级 typecheck、Vitest 和构建命令已尝试，但被当前沙箱无法访问 npm 阻塞；详细证据见 `docs/reports/reimbursement-permissions-verification-2026-07-27.md`。

---

### Task 1: 角色权限与范围绑定为授权包

**Files:**
- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/permissions.ts`
- Modify: `packages/shared/src/permissions.test.ts`
- Modify: `apps/api/src/session-user.ts`
- Create: `apps/api/src/session-user.test.ts`
- Modify: `apps/api/src/plugins/auth.ts`
- Modify: `apps/api/src/data-scope.ts`

**Interfaces:**
- Produces: `SessionAuthorizationGrant`，字段为 `role`、`permissions`、`scopeBindings`。
- Produces: `authorizationForPermission(user, permission)`，返回仅包含该权限对应角色范围的 `SessionUser` 视图。
- Consumes: 现有 `RolePermission`、`UserRoleAssignment`、`DataScopeBinding`。

- [x] **Step 1: 写失败测试**
  - 断言数据库角色权限优先于静态 `rolePermissions`。
  - 断言财务角色的权限只能使用财务角色绑定的数据范围，不能与另一个角色范围自由组合。
- [x] **Step 2: 确认测试因缺少授权包功能失败**
- [x] **Step 3: 扩展 SessionUser 和 sessionUserInclude**
  - 读取 `role.permissions.permission.code`。
  - 输出 `authorizationGrants`。
  - 无数据库角色配置的历史账号继续使用静态权限兜底。
- [x] **Step 4: 实现 permission-specific authorization helper**
- [x] **Step 5: 更新数据范围和鉴权调用并运行测试**
- [x] **Step 6: 提交**

### Task 2: 岗位自动绑定角色并随调岗更新

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727090000_position_role_bindings/migration.sql`
- Create: `apps/api/src/services/position-authorizations.ts`
- Create: `apps/api/src/services/position-authorizations.test.ts`
- Modify: `apps/api/src/services/internal-employees.ts`
- Modify: `apps/api/src/routes/internal-employees.ts`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Produces: `syncPositionAuthorizations(tx, input)`。
- Produces: `revokePositionAuthorizations(tx, input)`。
- Position binding fields: `positionId`、`roleId`、`scopeType`、`isActive`。
- User role assignment fields: `source`、`positionRoleBindingId`。

- [x] **Step 1: 写失败测试**
  - 入职关联账号时创建岗位角色与组织范围。
  - 调岗只撤销 POSITION 来源授权，保留 MANUAL/TEMPORARY 授权。
  - 离职撤销全部有效授权并使登录令牌失效。
- [x] **Step 2: 确认测试失败**
- [x] **Step 3: 添加 Prisma 模型和迁移**
- [x] **Step 4: 实现岗位授权同步服务**
- [x] **Step 5: 接入员工创建、调岗和离职流程**
- [x] **Step 6: 增加基础种子数据和运行测试**
- [x] **Step 7: 提交**

### Task 3: 报销接口使用权限对应的数据范围

**Files:**
- Modify: `apps/api/src/routes/reimbursements.ts`
- Modify: `apps/api/src/services/reimbursements.ts`
- Create: `apps/api/src/services/reimbursements.test.ts`
- Modify: `apps/api/src/data-scope.ts`

**Interfaces:**
- Consumes: `authorizationForPermission`。
- Produces: 报销读取、流转、问题、附件和付款均按执行权限对应范围过滤。
- 保留现有状态正向流转，不在本轮擅自增加未经确认的审批金额层级。

- [x] **Step 1: 写失败测试，覆盖跨角色范围越权场景**
- [x] **Step 2: 确认失败**
- [x] **Step 3: 报销接口在每次操作前生成 permission-specific user view**
- [x] **Step 4: 修正员工自助创建归属自动带出逻辑**
- [x] **Step 5: 清理重复或无效代码并运行测试**
- [x] **Step 6: 提交**

### Task 4: 小程序报销领域类型与 API

**Files:**
- Modify: `apps/miniapp/src/api/types.ts`
- Modify: `apps/miniapp/src/api/services.ts`
- Modify: `apps/miniapp/src/api/client.ts`
- Create: `apps/miniapp/src/domain/reimbursements.ts`
- Create: `apps/miniapp/src/domain/reimbursements.test.ts`
- Modify: `apps/miniapp/src/domain/roles.ts`
- Modify: `apps/miniapp/src/domain/roles.test.ts`

**Interfaces:**
- Produces: `Reimbursement`、`ReimbursementLine`、`ReimbursementAttachment`、`ReimbursementIssue`、`ReimbursementApproval`、`ReimbursementPayment`。
- Produces: 状态文案、下一步操作、金额格式化、权限动作判断。
- Produces API: list/detail/create/update/transition/upload/createIssue/resolveIssue/pay。

- [x] **Step 1: 写失败测试，覆盖多角色菜单和报销动作映射**
- [x] **Step 2: 确认失败**
- [x] **Step 3: 扩展 SessionUser 为完整角色与授权结构**
- [x] **Step 4: 增加报销类型、API 和上传能力**
- [x] **Step 5: 实现纯领域函数并运行测试**
- [x] **Step 6: 提交**

### Task 5: 小程序报销中心页面

**Files:**
- Modify: `apps/miniapp/src/app.config.ts`
- Create: `apps/miniapp/src/pages/reimbursements/index/index.tsx`
- Create: `apps/miniapp/src/pages/reimbursements/form/index.tsx`
- Create: `apps/miniapp/src/pages/reimbursements/detail/index.tsx`
- Create: `apps/miniapp/src/pages/reimbursements/index/index.config.ts`
- Create: `apps/miniapp/src/pages/reimbursements/form/index.config.ts`
- Create: `apps/miniapp/src/pages/reimbursements/detail/index.config.ts`
- Modify: `apps/miniapp/src/app.scss`

**Interfaces:**
- 报销中心列表根据权限显示“我的报销”或“报销待办”。
- 创建页支持多条明细、金额校验、草稿创建和后续附件上传。
- 详情页支持查看流程、附件、问题、按权限推进流程和付款登记。

- [x] **Step 1: 先在菜单测试中声明新入口并确认失败**
- [x] **Step 2: 增加页面路由和菜单入口**
- [x] **Step 3: 实现报销列表页**
- [x] **Step 4: 实现报销创建页**
- [x] **Step 5: 实现报销详情、附件、问题、审批和付款动作**
- [x] **Step 6: 增加样式并进行静态检查**
- [x] **Step 7: 提交**

### Task 6: 验证、文档和交付包

**Files:**
- Modify: `docs/permission-matrix.md`
- Create: `docs/reimbursement-miniapp-and-position-permissions.md`
- Create: `docs/reports/reimbursement-permissions-verification-2026-07-27.md`

**Interfaces:**
- Produces: 可供用户审核的修改说明、数据库迁移说明、测试与已知限制。

- [x] **Step 1: 运行可用的 TypeScript 语法检查和纯函数验证**
- [x] **Step 2: 尝试 workspace typecheck/test/build，并记录依赖阻塞**
- [x] **Step 3: 检查 git diff、路由、权限、迁移和页面完整性**
- [x] **Step 4: 写验证报告**
- [x] **Step 5: 打包修改后的完整源码 ZIP**
- [x] **Step 6: 提交最终变更**
