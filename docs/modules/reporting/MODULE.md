# 统计与经营看板模块

## 定位

管理看板、招聘统计、领导驾驶舱和跨模块只读汇总。

## 本模块负责

- 跨模块只读指标
- 领导驾驶舱
- 招聘和经营统计展示

## 本模块不负责

- 业务主数据写入
- 审批和状态修改
- 独立维护重复口径

## 直接依赖

`workforce`、`recruitment`、`project`、`supplier`、`payroll`、`reimbursement`

## 主要入口

- `apps/api/src/routes/statistics.ts`
- `apps/api/src/routes/leadership.ts`
- `apps/admin/src/pages/DashboardPage.tsx`
- `apps/admin/src/pages/LeadershipDashboardPage.tsx`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

无专属模型

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 统计口径必须引用业务模块事实
- 看板接口默认只读并执行数据范围

## 验证命令

- `pnpm --filter @xiangneng/admin exec vitest run src/pages/LeadershipDashboardPage.test.tsx`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- reporting`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
