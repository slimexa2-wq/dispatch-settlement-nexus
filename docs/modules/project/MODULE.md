# 项目与经营区域模块

## 定位

项目、经营区域 Branch、项目图片、现场运营负责人和项目授权。

## 本模块负责

- 经营区域 Branch
- 项目和项目图片
- 项目负责人和指定项目授权

## 本模块不负责

- 内部花名册业务部门
- 合同主体
- 内部报销部门归属

## 直接依赖

`auth`

## 主要入口

- `apps/api/src/routes/projects.ts`
- `apps/admin/src/pages/ProjectsPage.tsx`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`Branch`、`Project`、`ProjectImage`、`UserProject`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- Branch 只表达项目经营区域
- 项目授权不能自动扩展为内部组织权限

## 验证命令

- `pnpm --filter @xiangneng/api exec vitest run test/projects.test.ts`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- project`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
