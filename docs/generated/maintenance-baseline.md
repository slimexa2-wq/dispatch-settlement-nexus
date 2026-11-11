# 工程维护基线

> 自动生成，请勿手工编辑。源指纹：`454ad430c5ec9848`。

## 当前规模

| 指标 | 数量 |
| --- | --- |
| 项目文件 | 994 |
| 源代码文件 | 421 |
| 源代码总行数 | 202287 |
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
| `apps/api/src/generated/prisma/models/User.ts` | 15903 | 500 | 15403 |
| `apps/api/src/generated/prisma/internal/prismaNamespace.ts` | 6885 | 500 | 6385 |
| `apps/api/src/generated/prisma/models/Person.ts` | 5334 | 500 | 4834 |
| `apps/api/src/generated/prisma/models/ReimbursementBatch.ts` | 4020 | 500 | 3520 |
| `apps/api/src/generated/prisma/models/Project.ts` | 3450 | 500 | 2950 |
| `apps/api/src/generated/prisma/models/InternalEmployee.ts` | 3373 | 500 | 2873 |
| `apps/api/src/generated/prisma/models/JobDemand.ts` | 3333 | 500 | 2833 |
| `apps/api/src/generated/prisma/models/AccessRequest.ts` | 3200 | 500 | 2700 |
| `apps/admin/src/lib/demo.ts` | 3164 | 500 | 2664 |
| `apps/api/src/generated/prisma/models/OrganizationUnit.ts` | 3067 | 500 | 2567 |
| `apps/api/src/generated/prisma/models/DataScopeBinding.ts` | 3031 | 500 | 2531 |
| `apps/api/src/generated/prisma/models/Policy.ts` | 3022 | 500 | 2522 |
| `apps/api/src/generated/prisma/models/Supplier.ts` | 2486 | 500 | 1986 |
| `apps/api/src/generated/prisma/models/InternalEmployment.ts` | 2453 | 500 | 1953 |
| `apps/api/src/generated/prisma/models/Application.ts` | 2426 | 500 | 1926 |
| `apps/api/src/generated/prisma/models/WorkflowInstance.ts` | 2267 | 500 | 1767 |
| `apps/api/src/generated/prisma/models/Branch.ts` | 2212 | 500 | 1712 |
| `apps/api/src/generated/prisma/models/WorkflowTask.ts` | 2144 | 500 | 1644 |
| `apps/api/src/generated/prisma/models/MigrationBatch.ts` | 2137 | 500 | 1637 |
| `apps/api/src/generated/prisma/models/UserRoleAssignment.ts` | 2115 | 500 | 1615 |
