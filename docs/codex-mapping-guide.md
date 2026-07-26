# Codex 代码映射指南

> 审查日期：2026-07-22  
> 阶段结论：审查、映射、开发、数据归口、权限写操作与验收均已完成。  
> 依据包：`C:\Users\22381\Downloads\祥能AI业务助手_Skill完整包_v1.0.0-demo.zip`  
> 正式业务仓库：`C:\Users\22381\Desktop\xiangneng-hrms`  
> 目标小程序 UI 来源：`C:\Users\22381\Documents\祥能之家小程序`；合并后正式路径：`apps/portal`

## 1. 数据归口与合并边界

1. `xiangneng-hrms` 的 PostgreSQL/Prisma 模型、Fastify API、JWT 登录态、RBAC 和数据范围过滤作为唯一正式业务后端与唯一数据源。
2. `祥能之家小程序` 保留已确认的三端 UI、页面结构和交互；其 `apps/api`、SQLite 数据库、Drizzle 模型、演示身份 Cookie 和种子数组不作为合并后的正式数据源，也不做双写。
3. 合并后，小程序仅通过统一业务 API 读取/写入 `xiangneng-hrms`；管理后台、内部管理端、供应商端和个人端读取同一 PostgreSQL 数据。
4. 旧 Taro 小程序可作为 API 契约和正式入离职页面的参考，但最终小程序视觉以 `祥能之家小程序/apps/web` 为准。
5. AI 不把动态人员数据固化进模型参数。Qwen 负责意图理解和基于检索结果生成回答；回答所需数据按当前登录人的权限范围实时查询。本地 Ollama 不向第三方外发数据，完整字段的访问仍由后端权限控制。
6. 旧管理端的 AI 实现不能作为正式实现基础：它在浏览器端保存模型凭据、把人员数据拼入提示词、允许模型工具在用户确认前尝试写操作、使用模糊姓名首个命中，并调用了不存在的通用人员 `PUT` 接口。后续必须替换为后端规则优先路由和两阶段确认链路。

## 2. 审查结果

### 2.1 前后端技术栈

| 范围 | 真实技术栈 | 真实路径 |
|---|---|---|
| 管理后台 | React 18、TypeScript、Vite、Ant Design 6、React Router 7 | `apps/admin/package.json`、`apps/admin/src` |
| 现有微信端 | Taro 4、React 18、TypeScript | `apps/miniapp/package.json`、`apps/miniapp/src` |
| 目标小程序/PWA UI | React 19、Vite、React Router 7、TanStack Query、PWA | `C:\Users\22381\Documents\祥能之家小程序\apps\web` |
| 正式 API | Fastify 5、TypeScript、Zod、JWT、multipart、rate-limit | `apps/api/package.json`、`apps/api/src/app.ts` |
| 共享契约 | TypeScript 枚举、Zod Schema、权限矩阵 | `packages/shared/src` |
| 自动化 | Vitest、Playwright、Taro build、pnpm workspace | 根 `package.json`、`playwright.config.ts`、`scripts/run-e2e.mjs` |

### 2.2 数据库与 ORM

- 正式模型：PostgreSQL + Prisma，入口为 `prisma/schema.prisma`，迁移为 `prisma/migrations`，客户端生成到 `apps/api/src/generated/prisma`。
- 正式 seed：`prisma/seed.ts` 当前只幂等写入 7 个分子公司、243 个组织项目和可选管理员；不会把演示人员、供应商和招聘需求写入正式库。
- 人员演示数据：`data/derived/demo-data.full.json`，约 64 MB；对账为 17,180 个人员主档、18,841 条报名/项目经历、1,661 条重复/跨项目经历、457 个供应商、309 个演示项目。
- 演示数据在 `apps/admin/src/lib/demo.ts` 中进入浏览器内存/localStorage；这不是正式数据库联动。
- 当前机器没有 `.env`、PostgreSQL 客户端、Docker 或正在监听的 3100 API，因此正式数据库/API 未启动。
- 目标 PWA 现有 `apps/api/data/xiangneng.db` 是 SQLite 演示库，仅供 UI 基线；合并后不得继续作为业务主库。

### 2.3 登录与会话

- 正式登录：`POST /api/auth/login`，代码在 `apps/api/src/routes/auth.ts`。
- 正式会话：JWT Bearer；载荷绑定 `sub` 和 `tokenVersion`，每次请求重新读取用户、停用状态、tokenVersion 和项目关联，代码在 `apps/api/src/plugins/auth.ts`。
- 正式前端保存 token：`apps/admin/src/lib/api.ts`；小程序保存 token：`apps/miniapp/src/auth/session.ts`。
- 演示登录：管理端验证码 `8888` + 固定 demo token，代码在 `apps/admin/src/auth/AuthContext.tsx` 和 `apps/admin/src/lib/demo.ts`。它绕过正式 JWT/API，仅可用于隔离演示。
- 目标 PWA 当前使用 `xn_session` Cookie + 预置 persona，代码在 `C:\Users\22381\Documents\祥能之家小程序\apps\api\src\app.ts`；合并时必须改接正式 JWT 会话。

### 2.4 角色、权限与数据范围

正式角色定义在 `prisma/schema.prisma` 和 `packages/shared/src/enums.ts`，操作权限定义在 `packages/shared/src/permissions.ts`，后端强制校验在 `apps/api/src/plugins/auth.ts`，数据范围在 `apps/api/src/data-scope.ts`。

| AI 包角色 | 正式角色映射 | 读取范围 | AI 写权限结论 |
|---|---|---|---|
| `group_leader` | `HEADQUARTERS_MANAGER` | 全集团 | 禁止 |
| `branch_leader` | `BRANCH_MANAGER` | `branchId` 所属项目/人员 | 即使正式角色有 `PEOPLE_WRITE`，AI 层仍禁止 |
| `project_leader` | 当前无一一对应正式角色 | 待新增明确角色/能力标记前拒绝 | 禁止 |
| `onsite_operator` | `PROJECT_OPERATOR` | `UserProject` 授权项目 | 仅单人入职、单人离职 |
| `supplier` | `SUPPLIER` | 本供应商关联项目/本人报送人员 | 禁止 |
| `employee` | `EMPLOYEE` | 本人 | 禁止；当前传统 `/people` 缺少员工自查入口，需专用只读适配 |

未在 AI 包声明的 `RESOURCE_SPECIALIST`、`JOB_SEEKER`、`SYSTEM_ADMIN` 默认拒绝 AI Skill，除非后续在权限配置中显式确认。前端隐藏只用于体验，安全边界必须同时包含后端 Skill 授权和 Prisma 数据范围过滤。

### 2.5 核心业务实体

| 实体 | Prisma 模型 | 关键关系/字段 |
|---|---|---|
| 分子公司 | `Branch` | `Project.branchId` |
| 项目 | `Project` | 分公司、人员、岗位需求、供应商关联、用户项目授权 |
| 岗位/招聘需求 | `JobDemand` | `requiredCount`、`status`、`Application[]` |
| 人员主档 | `Person` | 身份证唯一；当前项目/岗位、状态、入离职日期、供应商/推荐人 |
| 报名/项目经历 | `Application` | 人员、岗位、来源、面试/就业状态、入离职日期 |
| 供应商 | `Supplier` | `SupplierProject`、人员和报名来源 |
| 生命周期 | `PersonStatusLog` | 前后状态、面试状态、动作、操作者、时间 |
| 用户与范围 | `User`、`UserProject` | 角色、分公司、供应商、本人、授权项目 |
| 审计 | `AuditLog` | 操作者、动作、资源、before/after、IP、UA、时间 |

### 2.6 人员状态

- 就业状态 `EmploymentStatus`：`APPLICANT`、`INTERVIEWING`、`PENDING_ONBOARD`、`ACTIVE`、`LEFT`。
- 面试状态 `InterviewStatus`：`PENDING_ARRIVAL`、`ARRIVED`、`PASSED`、`FAILED`、`ABANDONED`。
- 传统入职要求：面试状态为 `PASSED` 且未在职，日期不得早于面试日期；AI 入口将进一步收紧为唯一人员且状态为 `PENDING_ONBOARD`（兼容包中的 `interview_passed/pending_onboard` 语义）。
- 传统离职要求：当前状态必须为 `ACTIVE`，离职日期不得早于入职日期。
- 目标 PWA 的 8 状态只用于 UI 映射，正式存储统一落到上述两套枚举，不再维护第二套状态字段。

### 2.7 现有入职、离职页面与服务

- 管理端人员页：`apps/admin/src/pages/PeoplePage.tsx`。当前存在一个通用 `PATCH /people/:id` 调用，但正式 API 没有该路由，不能作为 AI 写适配器。
- Taro 入职页：`apps/miniapp/src/pages/operator/onboarding/index.tsx`。
- Taro 离职页：`apps/miniapp/src/pages/operator/offboarding/index.tsx`。
- 共用页面组件：`apps/miniapp/src/components/lifecycle-page.tsx`。
- 前端正式调用：`apps/miniapp/src/api/services.ts` 的 `api.onboard` / `api.offboard`。
- 后端现有事务实现：`apps/api/src/routes/people.ts` 的 `PATCH /people/:id/onboard` 和 `PATCH /people/:id/offboard`。
- 现有事务会同步 `Person`、最新 `Application`、`PersonStatusLog`、`AuditLog` 和通知队列；但逻辑仍内嵌在路由中。AI 适配前需提取为可复用正式业务服务，传统路由和 AI 确认接口共同调用，避免复制逻辑。

### 2.8 统计口径

| 指标 | 当前实现 | 口径/差距 |
|---|---|---|
| 当前在职 | `apps/api/src/routes/statistics.ts` | `Person.status = ACTIVE`，受 `personWhere(user)` 限制 |
| 入职 | 同上 | `Person.onboardDate` 落在时间范围；现有概览含今日入职和 7 日趋势，缺任意月份/分组查询服务 |
| 离职 | 同上 | `Person.offboardDate` 落在时间范围；现有概览含今日/本月离职 |
| 净增减 | `packages/shared`/目标 PWA 有计算函数 | 正式 API 尚无按月、分公司、项目分组的 `入职-离职` 查询接口 |
| 招聘完成 | `apps/api/src/routes/jobs.ts` 的 `attachProgress` | 每岗位取每人最新报名；有 `onboardDate` 计为完成 |
| 招聘缺口 | 同上 | `max(requiredCount - onboarded, 0)` |
| 招聘完成率 | 前端可计算 | 正式 API 未统一返回完成率字段，AI 工具需在服务端按同一口径计算 |

### 2.9 可复用组件

- 管理端：`ContentCard.tsx`、`AsyncState.tsx`、`PermissionGuard.tsx`、`ReferenceSelect.tsx`、`StatusTag.tsx`、`MetricBars.tsx`。
- 旧 `AiChat.tsx` 只能参考视觉结构，不能复用其旧执行逻辑。
- 目标 PWA：`apps/web/src/components/AppShell.tsx`、`Ui.tsx`、`DataCards.tsx`、`StatusTag.tsx`，以及 `features/personal`、`features/internal`、`features/supplier` 三端页面。
- Taro：`components/lifecycle-page.tsx`、`registration-form.tsx`、`form.tsx`、`ui.tsx`。

### 2.10 测试与构建命令及本次真实结果

| 命令 | 2026-07-22 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 失败：管理端 13 个 ESLint 错误；主要为旧 AI、MiniappDemo、ProductIntro 的未使用符号及 1 个显式 `any` |
| `pnpm test` | 通过：57/57 |
| `pnpm build` | 通过：共享包、数据导入、官网、API、管理端、Taro 小程序均构建成功；管理端有非阻断大 chunk 提示 |
| `pnpm data:verify` | 通过：源哈希、分公司数、项目数、项目归属、对账均为 true |
| `pnpm check` | 失败于上述 Lint，因短路未在该命令中继续测试/构建 |
| `pnpm test:e2e --workers=1` | 本审查阶段未运行；现有文档声称的旧结果不能替代后续合并后的实测 |

### 2.11 演示与正式环境隔离

- 正式路径依赖 PostgreSQL、JWT、`NODE_ENV` 和 `.env`；当前未配置/未运行。
- 便携演示服务正在 `127.0.0.1:4173` 运行，数据来自静态演示 JSON 和 localStorage，不写正式数据库。
- 目标 PWA 正在 `http://localhost:4320` 运行，数据来自其 SQLite 演示库。
- 当前没有后端级独立演示数据库，也没有 `/api/ai/demo/reset`；后续必须通过单独数据库连接/Schema 或独立数据库实现，禁止比赛写操作连接正式生产库。
- `apps/admin/src/lib/demo.ts` 的 `/demo/reset` 只是浏览器演示态重置，不能作为 AI 后端重置接口。

### 2.12 本地模型环境

- 用户指定：Ollama + Qwen3.5 4B。
- 当前机器未发现 `ollama` 命令、进程或默认安装目录；尚未安装或拉取模型。
- 后续后端配置使用 `XIANGNENG_LLM_BASE_URL`、`XIANGNENG_LLM_MODEL`、`XIANGNENG_LLM_API_KEY`；本地 Ollama 密钥只允许作为后端占位，不进入前端包。
- 规则唯一命中时可直接调用业务工具；需要自然语言归纳时，本地模型只接收命中 Skill 所需的最小权限内上下文，温度 0.1，超时 10 秒，模型故障走确定性检索结果和标准表单降级。

## 3. 固定业务能力映射

| 业务能力 | 现有页面 | 前端调用 | 后端接口/服务 | 数据实体 | 权限校验 |
|---|---|---|---|---|---|
| 人员搜索 | 管理端 `apps/admin/src/pages/PeoplePage.tsx`；Taro `apps/miniapp/src/pages/operator/people/index.tsx`；目标 UI `祥能之家小程序/apps/web/src/features/internal/InternalPages.tsx` | 管理端 `api.get('/people')`；Taro `api.people()`；目标 PWA 当前 `/api/people` 需改接正式 API | `GET /api/people`，`apps/api/src/routes/people.ts`；AI 适配器必须复用 `personWhere(user)` | `Person`、`Project`、`Branch`、`Supplier`、`User` | `authenticate` + `PEOPLE_READ` + `personWhere(user)`；员工本人查询需新增专用只读服务，不放宽全量权限 |
| 人员详情 | 管理端 People 详情抽屉；Taro `pages/operator/person-detail`；目标 UI 内部/供应商/个人详情 | `GET /people/:id` / `api.person(id)` | `GET /api/people/:id`，`apps/api/src/routes/people.ts` | `Person`、`Application`、`PersonStatusLog`、`Supplier`、`User` | `PEOPLE_READ` + `personWhere(user)`；字段在授权数据范围内完整返回，跨分公司、跨项目、跨供应商访问仍由后端拒绝；AI 同名返回候选并停止 |
| 入职统计 | 管理端 `DashboardPage.tsx`、`StatisticsPage.tsx`；目标 UI `InternalDashboard` | `GET /statistics/overview` | `apps/api/src/routes/statistics.ts`；需新增只读业务服务支持月份、分公司、项目和月度分组 | `Person.onboardDate`、`Project`、`Branch` | `DASHBOARD_READ` + `personWhere(user)`；筛选条件必须与登录范围做 AND |
| 离职统计 | 同上 | `GET /statistics/overview` | 同上 | `Person.offboardDate`、`Project`、`Branch` | 同上 |
| 在职统计 | 同上；`/statistics/drilldown?metric=active` | `GET /statistics/overview`、`GET /statistics/drilldown` | `apps/api/src/routes/statistics.ts`、`statistics-scope.ts` | `Person.status = ACTIVE` | `DASHBOARD_READ` + `personWhere(user)`；与传统卡片/下钻对账 |
| 招聘进度 | 管理端 `RecruitmentProgressPage.tsx`、`JobDemandsPage.tsx`；目标 UI `InternalProjects`/岗位详情/供应商岗位 | `GET /applications`、`GET /job-demands` | `apps/api/src/routes/jobs.ts` 的 `attachProgress` 和 `GET /api/job-demands`；AI 查询服务复用同一算法 | `JobDemand`、`Application`、`Person`、`Project` | `JOB_READ` + `jobScope/projectWhere(user)`；结果只在权限范围内排序 |
| 办理入职 | Taro `pages/operator/onboarding` + `components/lifecycle-page.tsx`；目标 UI 人员详情状态表单 | `api.onboard(id, input)` | `PATCH /api/people/:id/onboard`，当前在 `apps/api/src/routes/people.ts`；需提取 `services/person-lifecycle.ts` 后由传统接口与 AI confirm 共用 | `Person`、`Application`、`PersonStatusLog`、`AuditLog`、`Notification`、`Policy` | 传统：`PEOPLE_WRITE` + `personWhere(user)`；AI 额外限制 `PROJECT_OPERATOR/onsite_operator`、唯一人员、`PENDING_ONBOARD`、授权项目、预览确认 |
| 办理离职 | Taro `pages/operator/offboarding` + `components/lifecycle-page.tsx`；目标 UI 人员详情状态表单 | `api.offboard(id, input)` | `PATCH /api/people/:id/offboard`，当前在 `apps/api/src/routes/people.ts`；需提取同一生命周期服务 | `Person`、`Application`、`PersonStatusLog`、`AuditLog`、`Notification` | 传统：`PEOPLE_WRITE` + `personWhere(user)`；AI 额外限制 `PROJECT_OPERATOR/onsite_operator`、唯一在职人员、标准化原因、授权项目、预览确认 |

## 4. 五项 Skill 到正式服务的调用映射

| Skill | AI 工具职责 | 正式服务适配目标 | 禁止项 |
|---|---|---|---|
| `project_personnel_statistics` | 月度入职、离职、当前在职、净增减，按分公司/项目/月度分组 | 从 `statistics.ts` 提取的权限过滤统计服务 | 不读前端数组、不自由 SQL、不绕过数据范围 |
| `employee_information_query` | 姓名/手机号/尾号/编号/状态/项目/入离职/供应商/推荐人/生命周期 | 从 `people.ts` 提取的人员匹配与详情服务 | 不返回越权候选、不用模糊首条命中、不暴露完整敏感字段 |
| `recruitment_progress_query` | 需求、完成、缺口、完成率及权限内排序 | 复用 `jobs.ts::attachProgress` 的服务化实现 | 不自行发明完成口径、不读取静态演示数组 |
| `employee_entry` | 生成单人入职预览；用户点击确认后事务执行 | 复用服务化后的正式入职事务 | 不批量、不由模型确认、不在预览时写库 |
| `employee_resignation` | 生成单人离职预览；用户点击确认后事务执行 | 复用服务化后的正式离职事务 | 不批量、不删除、不由模型确认、不在预览时写库 |

## 5. 写操作前置缺口

以下缺口未补齐前，不得开发或启用 AI 写操作：

1. 正式 PostgreSQL 未启动，人员/报名/供应商/岗位真实演示数据尚未导入正式库。
2. 入职/离职事务仍内嵌路由，需先抽成传统接口和 AI 共用的正式业务服务。
3. Prisma 尚无 AI action、token、过期时间、用户绑定、幂等键和完整 AI 审计字段的持久化模型。
4. `SYSTEM_ADMIN`、`project_leader` 的 AI 权限映射尚未明确；必须默认拒绝。
5. `EMPLOYEE` 的本人信息查询需专用服务，不能通过增加全量 `PEOPLE_READ` 解决。
6. 管理端现有 AI 页面存在前端凭据和确认前执行问题，必须停用旧执行链路并轮换已暴露的第三方凭据。
7. 演示环境尚无独立后端数据库和可审计的 `/api/ai/demo/reset`。
8. 当前 `pnpm check` 未通过，需先修复 13 个 Lint 错误并建立新的绿色基线。

完成以上前置条件后，开发顺序固定为：三项只读 MVP → 入职/离职预览 → 确认、事务、幂等和日志 → 健康检查、Ollama 降级和演示重置 → 全量验收。

## 6. 2026-07-22 最终落地映射

本节为实施后的真实状态；前述第 2、5 节保留为“开发前审查快照”，其中的缺口均已闭环。

| 范围 | 最终正式路径/状态 |
|---|---|
| 统一小程序/PWA | `apps/portal`，保留个人端、供应商端、内部管理端 UI，传统页面与 AI 共用正式 JWT 和 PostgreSQL |
| 统一业务 API | `apps/api/src/routes/portal.ts`、`apps/api/src/routes/ai.ts` |
| 正式业务适配 | `apps/api/src/portal/mappers.ts`、`apps/api/src/services/person-lifecycle.ts`、`apps/api/src/ai/data-tools.ts`、`apps/api/src/ai/action-service.ts` |
| AI 路由 | `apps/api/src/ai/intent-router.ts`：规则优先，复杂表达调用本地 Qwen3.5 4B，失败进入标准表单降级 |
| 本地模型 | Ollama `qwen3.5:4b`，仅监听本机；实测复杂招聘语义约 8 秒完成路由 |
| 写操作安全 | `ai_actions` + `ai_audit_logs`；用户绑定 token、10 分钟过期、唯一幂等键、Serializable 事务、执行前重读、失败回滚 |
| 演示隔离 | 独立数据库 `xiangneng_hrms_demo`；`POST /api/ai/demo/reset` 只恢复 AI 演示写操作快照 |
| 一键启动 | `pnpm demo:start`；自动检查 PostgreSQL、迁移、数据、Ollama 模型、预热、API、管理后台和 Portal |
| 一键停止 | `pnpm demo:stop`；只停止 3310/4320/5173 的本项目前后端，保留 PostgreSQL 与 Ollama |

最终 PostgreSQL 对账：8 个分公司、309 个项目、457 个供应商、156 个岗位、17,180 个人员主档、18,841 条报名/项目经历；其中当前在职 4,437、待入职 3,802、已离职 4,236。原始导入保持可追溯；独立演示库按确定性规则补齐负责人、联系方式、岗位说明和员工编号，不改写正式库。

最终角色/范围：`SYSTEM_ADMIN` 和 `PROJECT_OPERATOR` 可使用五项 AI 能力并进行单人入离职；总部/分公司/项目负责人按配置只读；供应商按本供应商与关联项目只读；员工仅本人范围且无 AI 写权限。前端显示、后端 Skill 授权、Prisma 数据范围三层同时生效。

最终验证：`pnpm typecheck`、`pnpm lint`、`pnpm test`（64 项）、`pnpm build`、`pnpm data:verify`、`pnpm verify:ollama`、`pnpm verify:ai` 全部通过；浏览器实测个人端、供应商端、内部端、管理后台、两处 AI 入口、真实查询、写预览与取消锁定。
