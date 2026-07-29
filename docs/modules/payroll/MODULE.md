# 工资与工资条模块

## 定位

工资批次、工资条、导入核验和员工工资查询。

## 本模块负责

- 工资导入批次
- 工资条发布和撤回
- 员工本人工资查询

## 本模块不负责

- 人员主档
- 银行卡权限底座
- 项目和供应商主数据

## 直接依赖

`workforce`、`project`、`auth`、`import-export`

## 主要入口

- `apps/api/src/routes/salary.ts`
- `apps/api/src/services/salary-workbook.ts`
- `apps/admin/src/pages/SalarySlipsPage.tsx`
- `apps/miniapp/src/pages/salary/`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`SalaryImportBatch`、`SalarySlip`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 工资敏感字段独立授权
- 导入必须保留批次和匹配结果

## 验证命令

- `pnpm --filter @xiangneng/api exec vitest run test/salary.test.ts`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- payroll`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
