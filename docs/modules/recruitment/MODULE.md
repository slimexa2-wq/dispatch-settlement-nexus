# 招聘需求与进度模块

## 定位

岗位需求、报名、面试、入职进度、员工推荐和奖励。

## 本模块负责

- 招聘需求
- 报名、面试和入职进度
- 员工推荐、分享和奖励

## 本模块不负责

- 人员主档底层生命周期
- 项目主数据
- 工资条

## 直接依赖

`project`、`supplier`、`workforce`、`auth`

## 主要入口

- `apps/api/src/routes/jobs.ts`
- `apps/api/src/routes/applications.ts`
- `apps/api/src/routes/referrals.ts`
- `apps/admin/src/pages/JobDemandsPage.tsx`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`JobDemand`、`Application`、`ReferralRecord`、`ReferralReward`、`ReferralShare`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 报名关联既有人员时不得匿名覆盖敏感档案
- 招聘需求必须关联项目

## 验证命令

- `pnpm --filter @xiangneng/api exec vitest run test/applications.test.ts test/referrals.test.ts`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- recruitment`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
