# Codex 业务与代码映射指南

映射日期：2026-07-26

正式实现路径：`C:\Users\22381\Desktop\xiangneng-hrms-worktrees\full-hrms-production`

## 1. 技术与运行映射

| 能力 | 真实路径 |
|---|---|
| PC 管理后台 | `apps/admin` |
| 手机统一门户 | `apps/portal` |
| 微信小程序 | `apps/miniapp` |
| 产品官网 | `apps/website` |
| Fastify API | `apps/api` |
| 共享枚举/权限 | `packages/shared` |
| PostgreSQL/Prisma | `prisma/schema.prisma`、`prisma/migrations`、`prisma/seed.ts` |
| 演示数据 | `data/synthetic/demo-data.json` |
| 数据导入校验 | `packages/data-import` |
| 本地 AI Skill 包 | `skills/xiangneng-ai-business-assistant` |
| Docker | `docker-compose.yml`、`apps/api/Dockerfile`、`apps/admin/Dockerfile` |

登录使用 Bearer JWT。认证插件每次读取用户、角色、tokenVersion 和数据范围；演示登录仍签发真实 JWT。前端的离线业务快照只服务公开比赛演示，后端在线时优先走正式 API。

## 2. 核心实体

| 业务 | Prisma 实体 |
|---|---|
| 组织/项目 | `Branch`、`Project` |
| 人员/生命周期 | `Person`、`Application`、`PersonStatusLog` |
| 岗位/招聘 | `JobDemand` |
| 供应商 | `Supplier`、`SupplierProject` |
| 登录/范围 | `User`、`UserProject`、角色分配和范围绑定 |
| 工资/结算/推荐 | 工资条、结算、推荐奖励相关实体 |
| 报销 | 报销单、明细、流转、发票、支付、附件和审计实体 |
| AI | `AiAction`、`AiAuditLog` |
| 通用审计 | `AuditLog` |

人员就业状态统一为 `APPLICANT`、`INTERVIEWING`、`PENDING_ONBOARD`、`ACTIVE`、`LEFT`；面试状态统一为 `PENDING_ARRIVAL`、`ARRIVED`、`PASSED`、`FAILED`、`ABANDONED`。

## 3. 角色和数据范围

三层权限：

1. 前端根据角色隐藏不可用入口。
2. 后端按权限和 AI Skill 白名单授权。
3. 查询条件与登录态分公司、项目、供应商或本人范围做 AND，客户端参数不能扩大范围。

| AI 角色 | 系统角色 | 查询范围 | 写能力 |
|---|---|---|---|
| 集团/总部领导 | `HEADQUARTERS_MANAGER` | 全集团授权范围 | 无 |
| 分公司负责人 | `BRANCH_MANAGER` | 所属分公司 | 无 |
| 项目运营 | `PROJECT_OPERATOR` | 授权项目 | 单人入职、单人离职 |
| 系统管理员 | `SYSTEM_ADMIN` | 全局演示管理范围 | 单人入职、单人离职 |
| 供应商 | `SUPPLIER` | 本供应商关联人员 | 无 |
| 员工 | `EMPLOYEE` | 本人 | 无 |

未显式映射的角色默认不能调用 AI Skill。

## 4. 五项 AI Skill 映射

| Skill | 路由/工具 | 业务服务与实体 | 权限 |
|---|---|---|---|
| `project_personnel_statistics` | `apps/api/src/ai/intent-router.ts` → `data-tools.ts` | `Person` 入离职日期、状态、`Project`、`Branch` | 三项查询角色；范围过滤 |
| `employee_information_query` | 同上 | 人员匹配、详情、生命周期、供应商、推荐人 | 同名停住；只返回范围内候选 |
| `recruitment_progress_query` | 同上 | `JobDemand` + 每人最新 `Application`，计算完成和缺口 | 岗位/项目范围过滤 |
| `employee_entry` | `action-service.ts` → `person-lifecycle.ts` | 预览后复用正式入职事务 | 仅运营/系统管理员 |
| `employee_resignation` | `action-service.ts` → `person-lifecycle.ts` | 原因标准化、预览后复用正式离职事务 | 仅运营/系统管理员 |

API：

- `POST /api/ai/chat`
- `POST /api/ai/actions/confirm`
- `GET /api/ai/actions/:actionId`
- `GET /api/ai/health`
- `POST /api/ai/demo/reset`

规则唯一命中直接进入 Schema 校验和业务工具；复杂表达调用本机 Qwen；模型超时或不可用时返回确定性结果/标准表单，不影响传统系统。

## 5. 页面与服务映射

| 业务 | PC 页面 | 手机/小程序页面 | API/服务 |
|---|---|---|---|
| 工作台/统计 | `DashboardPage`、`LeadershipDashboardPage` | 内部工作台 | `routes/statistics.ts`、领导聚合服务 |
| 人员 | `PeoplePage` | 内部人员、人员详情、个人中心 | `routes/people.ts`、`person-lifecycle.ts` |
| 招聘 | `JobDemandsPage`、`RecruitmentProgressPage` | 个人岗位、供应商岗位、岗位详情 | `routes/jobs.ts`、`routes/portal.ts` |
| 项目 | `ProjectsPage` | 内部项目、供应商项目 | `routes/projects.ts`、`routes/portal.ts` |
| 供应商 | `SuppliersPage` | 供应商首页/人员/结算 | 供应商路由和范围服务 |
| 内部员工 | `InternalEmployeesPage` | 内部人员 | 内部员工路由和领域服务 |
| 工资/推荐 | `SalarySlipsPage`、`ReferralRewardsPage` | 个人工资、推荐 | 工资/推荐路由 |
| 报销 | `ReimbursementsPage` | 员工报销服务 | 报销路由、领域服务、文件存储 |
| AI | `AiAssistantPanel` | `features/ai/AiAssistant.tsx` | `routes/ai.ts` |

## 6. 数据、演示和正式环境

- 唯一公开演示数据为 `data/synthetic/demo-data.json`，当前为 3/8/6/12/48/48/6 的完整小数据集。
- 本机 `pnpm demo:start` 使用独立数据库 `xiangneng_hrms_demo`，不连接生产库。
- 浏览器离线时使用同一业务语义的合成快照；重新联网后请求正式 API。
- `/api/ai/demo/reset` 只恢复演示写操作；生产环境必须关闭 `AI_DEMO_MODE`。
- 文件存储有 Local/COS 抽象；生产 COS、微信 AppID、域名、HTTPS 和管理员凭据均从环境变量注入。

## 7. 构建和验收

```powershell
pnpm db:validate
pnpm db:generate
pnpm data:verify
pnpm demo:safety
pnpm check
pnpm verify:ollama
pnpm verify:ai
```

2026-07-26 的真实结果：Schema/Client、数据完整性、公开数据安全、140 项自动化测试、PC/Portal/API/官网/小程序/公开演示构建、Qwen 语义路由、五项 AI 真接口、数据库业务日期和演示重置全部通过。
