# 导入导出与数据安全模块

## 定位

Excel 导入、导出、模板解析、数据预览和表格安全校验。

## 本模块负责

- Excel 模板和解析
- 导入预览、异常和提交
- 导出与表格安全

## 本模块不负责

- 业务主数据规则
- 未经校验直接写数据库
- 真实源文件公开打包

## 直接依赖

`auth`

## 主要入口

- `apps/api/src/routes/imports.ts`
- `packages/data-import/`
- `apps/admin/src/pages/ImportsPage.tsx`
- `scripts/import-demo-data.mts`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`ImportJob`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 先预览再提交
- 保留来源和行号
- 公式注入和敏感数据必须校验

## 验证命令

- `pnpm --filter @xiangneng/data-import test`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- import-export`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
