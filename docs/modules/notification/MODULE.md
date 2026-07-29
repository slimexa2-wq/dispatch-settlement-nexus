# 通知与待办模块

## 定位

站内通知、读取状态和业务待办提醒。

## 本模块负责

- 站内通知
- 通知读取状态
- 业务事件提醒

## 本模块不负责

- 业务流程最终状态
- 微信平台配置本身
- 业务对象权限

## 直接依赖

`auth`

## 主要入口

- `apps/api/src/routes/notifications.ts`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`Notification`、`PortalNotificationRead`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 通知失败不得伪报成功
- 通知不能替代业务状态和审计记录

## 验证命令

- `pnpm --filter @xiangneng/api exec vitest run test/notifications.test.ts`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- notification`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
