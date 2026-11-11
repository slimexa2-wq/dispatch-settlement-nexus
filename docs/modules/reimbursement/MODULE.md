# 员工报销模块

## 定位

员工报销申请、部门制单、审批、财务审核、付款和打印材料。

## 本模块负责

- 员工报销申请与明细
- 部门制单和审批状态
- 财务、付款、问题和打印材料

## 本模块不负责

- 员工组织事实
- 权限计算底座
- 合同主体和项目经营区域

## 直接依赖

`auth`、`organization`、`notification`

## 主要入口

- `apps/api/src/routes/reimbursements.ts`
- `apps/api/src/services/reimbursements.ts`
- `apps/admin/src/pages/ReimbursementsPage.tsx`
- `apps/miniapp/src/pages/reimbursements/`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`ReimbursementBatch`、`ReimbursementLine`、`ReimbursementAttachment`、`ReimbursementIssue`、`ReimbursementApproval`、`ReimbursementPayment`、`ReimbursementArtifact`

## 业务规则文档

- `docs/business-rules/reimbursement.md`

## 固定边界

- 员工报销归属业务部门
- 明细发票金额不得低于付款金额，允许等额，UI、演示和API一致
- 付款截图、发票和整单最终付款凭证语义分离：最终凭证必须属于当前单据且不绑定明细
- 打款在同一事务重新校验状态、金额、版本与凭证并写入付款、终态和审计；通用推进不能直接进入PAID
- 新建草稿按当前用户在标签页暂存，关闭与离页保留全部明细，明确放弃才清空
- 推进状态必须校验版本、问题和授权包

## 验证命令

- 管理端：在 `apps/admin` 执行 `pnpm exec vitest run src`，原生测试单独使用 `node --experimental-strip-types --test test/*.node.test.ts`
- API定向：在 `apps/api` 执行 `pnpm exec vitest run test/reimbursement-state-contracts.test.ts test/reimbursement-routes.test.ts test/reimbursements.test.ts test/reimbursement-artifacts.test.ts`
- 浏览器回归：`apps/admin/test/reimbursement-ux.browser.cjs`，仅隔离本地演示
- `node scripts/generate-project-index.mjs --check` 与 `node scripts/check-architecture.mjs`

## 安全修改方式

1. 先生成本模块局部上下文：`node scripts/build-ai-context.mjs reimbursement`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`node scripts/generate-project-index.mjs` 和 `node scripts/check-architecture.mjs`。
