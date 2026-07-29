# 供应商与政策模块

## 定位

供应商、项目合作关系、供应商政策和员工推荐政策。

## 本模块负责

- 供应商主档
- 供应商与项目关系
- 供应商政策和员工推荐政策

## 本模块不负责

- 项目主档
- 人员主档
- 员工工资和报销

## 直接依赖

`project`、`auth`

## 主要入口

- `apps/api/src/routes/suppliers.ts`
- `apps/api/src/routes/policies.ts`
- `apps/admin/src/pages/SuppliersPage.tsx`
- `apps/portal/src/features/supplier/`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`Supplier`、`SupplierProject`、`Policy`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 供应商账号只访问关联项目和自身业务数据

## 验证命令

- `pnpm --filter @xiangneng/api exec vitest run test/suppliers.test.ts test/policies.test.ts`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- supplier`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
