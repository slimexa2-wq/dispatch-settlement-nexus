# AI 业务助手模块

## 定位

意图识别、受控工具调用、确认令牌、模型适配和 AI 审计。

## 本模块负责

- 意图识别和模型适配
- 受控工具注册与调用
- 确认令牌和 AI 审计

## 本模块不负责

- 直接数据库连接
- 自由 SQL
- 绕过传统权限和业务服务

## 直接依赖

`auth`、`organization`、`workforce`、`recruitment`、`project`、`supplier`、`reimbursement`、`payroll`、`reporting`

## 主要入口

- `apps/api/src/ai/`
- `apps/api/src/routes/ai.ts`
- `apps/admin/src/components/AiAssistantPanel.tsx`
- `apps/portal/src/features/ai/`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`AiAction`、`AiAuditLog`、`AiDemoSnapshot`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 规则路由优先
- 模型只解析意图和参数
- 写操作确认时重新校验权限和状态

## 验证命令

- `pnpm verify:ai`
- `pnpm verify:ollama`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- ai`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
