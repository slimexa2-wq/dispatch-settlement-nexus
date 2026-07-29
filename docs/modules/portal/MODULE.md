# 员工、供应商与公开端体验模块

## 定位

Portal 手机网页演示、个人服务、供应商服务和公开产品展示。

## 本模块负责

- Portal 手机网页
- 公开产品站和演示站
- 个人端与供应商端页面体验

## 本模块不负责

- 服务端业务规则
- 权限事实来源
- 独立复制业务数据

## 直接依赖

`auth`、`workforce`、`recruitment`、`supplier`、`payroll`、`reimbursement`、`notification`

## 主要入口

- `apps/portal/`
- `apps/website/`
- `apps/sites-demo/`
- `apps/admin/src/pages/ProductIntroPage.tsx`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`PortalFavorite`、`PortalAdvance`、`PortalAppeal`、`PortalSettlement`、`PortalSettlementItem`、`PortalQrCode`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 多端共享同一 API 和权限
- 演示数据与真实数据隔离

## 验证命令

- `pnpm --filter @xiangneng/portal test`
- `pnpm build:website`
- `pnpm build:public-demo`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- portal`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。
