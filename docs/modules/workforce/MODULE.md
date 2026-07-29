# 求职者与派遣外包人员模块

## 定位

求职者、派遣外包员工、人员档案、生命周期状态和附件。

## 本模块负责

- 求职者和派遣外包人员主档
- 人员附件
- 报名到离职的人员状态

## 本模块不负责

- 内部员工花名册
- 岗位需求定义
- 项目和供应商主数据

## 直接依赖

`project`、`supplier`

## 主要入口

- `apps/api/src/routes/people.ts`
- `apps/api/src/services/person-lifecycle.ts`
- `apps/admin/src/pages/PeoplePage.tsx`
- `apps/miniapp/src/pages/operator/`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`Person`、`PersonFile`、`PersonStatusLog`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 同一人员生命周期沿用同一主档
- 状态变化必须保留日志

## 验证命令

- `pnpm --filter @xiangneng/api exec vitest run test/people*.test.ts`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- workforce`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
