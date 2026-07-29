# 工程维护基线

> 自动生成，请勿手工编辑。源指纹：`fcc8dddb324cc313`。

## 当前规模

| 指标 | 数量 |
| --- | --- |
| 项目文件 | 550 |
| 源代码文件 | 333 |
| 源代码总行数 | 53153 |
| 业务模块 | 14 |
| API 路由 | 176 |
| 后台页面路由 | 26 |
| 小程序页面 | 24 |
| Prisma 模型 | 64 |

## 治理原则

- 超大文件本阶段只预警，不阻断构建。
- 新需求触及超大文件时，优先提取本次职责相关的纯函数、服务或组件。
- 不为追求目录整齐进行无业务收益的大规模搬迁。
- 每次新增模块、依赖、入口或模型后更新注册表并重新生成索引。

## 最大拆分候选

| 文件 | 行数 | 建议阈值 | 超出 |
| --- | --- | --- | --- |
| `apps/admin/src/lib/demo.ts` | 3268 | 500 | 2768 |
| `prisma/schema.prisma` | 1728 | 1400 | 328 |
| `apps/admin/src/pages/ReimbursementsPage.tsx` | 1295 | 500 | 795 |
| `apps/api/src/routes/reimbursements.ts` | 1288 | 500 | 788 |
| `apps/portal/src/app/demo.ts` | 1091 | 500 | 591 |
| `apps/admin/src/pages/ProductIntroPage.tsx` | 947 | 500 | 447 |
| `apps/admin/src/pages/InternalEmployeesPage.tsx` | 875 | 500 | 375 |
| `apps/admin/src/types/domain.ts` | 832 | 500 | 332 |
| `apps/admin/src/pages/PeoplePage.tsx` | 828 | 500 | 328 |
| `apps/api/src/routes/portal.ts` | 812 | 500 | 312 |
| `apps/api/src/routes/internal-employees.ts` | 725 | 500 | 225 |
| `scripts/import-demo-data.mts` | 697 | 500 | 197 |
| `apps/api/src/services/migration-targets.ts` | 677 | 500 | 177 |
| `apps/admin/src/pages/ImportsPage.tsx` | 548 | 500 | 48 |
| `apps/miniapp/src/pages/demo/index.tsx` | 544 | 500 | 44 |
| `apps/api/src/routes/migration-center.ts` | 537 | 500 | 37 |
| `apps/miniapp/src/api/types.ts` | 513 | 500 | 13 |
| `apps/api/src/routes/imports.ts` | 510 | 500 | 10 |
| `scripts/import-real-business-data.mts` | 506 | 500 | 6 |
