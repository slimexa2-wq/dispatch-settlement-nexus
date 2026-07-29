# 账号、会话与权限模块

## 定位

登录会话、多角色授权、权限定义、数据范围和账号管理。

## 本模块负责

- 登录和会话
- 角色、权限和数据范围
- 账号绑定后的授权计算

## 本模块不负责

- 内部员工任职事实
- 项目和供应商主数据
- 具体业务审批规则

## 直接依赖

`organization`

## 主要入口

- `apps/api/src/authorization.ts`
- `apps/api/src/session-user.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/users.ts`
- `packages/shared/src/permissions.ts`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`Role`、`PermissionDefinition`、`RolePermission`、`UserRoleAssignment`、`DataScopeBinding`、`User`、`UserProject`

## 业务规则文档

- `docs/business-rules/authorization.md`

## 固定边界

- 权限与范围按同一授权包判断
- 客户端声明不能替代服务端授权

## 验证命令

- `pnpm test:module:authorization`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- auth`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
