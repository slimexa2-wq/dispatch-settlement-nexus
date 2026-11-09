# 工程维护基线

> 自动生成，请勿手工编辑。源指纹：`7eaaa95568ff032b`。

## 当前规模

| 指标 | 数量 |
| --- | --- |
| 项目文件 | 913 |
| 源代码文件 | 351 |
| 源代码总行数 | 52085 |
| 业务模块 | 14 |
| API 路由 | 171 |
| 后台页面路由 | 22 |
| 小程序页面 | 21 |
| Prisma 模型 | 61 |

## 治理原则

- 超大文件本阶段只预警，不阻断构建。
- 新需求触及超大文件时，优先提取本次职责相关的纯函数、服务或组件。
- 不为追求目录整齐进行无业务收益的大规模搬迁。
- 每次新增模块、依赖、入口或模型后更新注册表并重新生成索引。

## 最大拆分候选

| 文件 | 行数 | 建议阈值 | 超出 |
| --- | --- | --- | --- |
| `apps/admin/src/lib/demo.ts` | 3152 | 500 | 2652 |
| `prisma/schema.prisma` | 1632 | 1400 | 232 |
| `apps/portal/src/app/demo.ts` | 1091 | 500 | 591 |
| `apps/api/src/routes/reimbursements.ts` | 1029 | 500 | 529 |
| `apps/admin/src/pages/ProductIntroPage.tsx` | 947 | 500 | 447 |
| `apps/admin/src/pages/ReimbursementsPage.tsx` | 871 | 500 | 371 |
| `apps/admin/src/pages/PeoplePage.tsx` | 828 | 500 | 328 |
| `apps/api/src/routes/portal.ts` | 813 | 500 | 313 |
| `apps/admin/src/types/domain.ts` | 784 | 500 | 284 |
| `apps/api/src/services/migration-targets.ts` | 677 | 500 | 177 |
| `scripts/import-demo-data.mts` | 618 | 500 | 118 |
| `apps/admin/src/pages/InternalEmployeesPage.tsx` | 586 | 500 | 86 |
| `apps/admin/src/pages/ImportsPage.tsx` | 548 | 500 | 48 |
| `apps/miniapp/src/pages/demo/index.tsx` | 544 | 500 | 44 |
| `apps/api/src/routes/migration-center.ts` | 537 | 500 | 37 |
| `apps/api/src/routes/imports.ts` | 511 | 500 | 11 |
| `scripts/import-real-business-data.mts` | 506 | 500 | 6 |
