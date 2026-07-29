# 平台与工程基础模块

## 定位

工作区配置、部署、构建、演示环境和跨应用公共工程能力。

## 本模块负责

- 工作区与根脚本
- 本地演示、部署和打包基础
- 跨应用构建与验证入口

## 本模块不负责

- 具体业务状态流转
- 业务权限口径
- 页面业务交互

## 直接依赖

无直接依赖

## 主要入口

- `package.json`
- `pnpm-workspace.yaml`
- `scripts/`
- `docker-compose.yml`
- `render.yaml`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

无专属模型

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 工程脚本不得读取或打包真实敏感数据
- 基础设施变更必须验证所有应用的兼容性

## 验证命令

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- platform`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
