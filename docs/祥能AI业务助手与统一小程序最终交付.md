# 祥能 AI 业务助手与统一小程序最终交付

交付日期：2026-07-22  
唯一正式仓库：`C:\Users\22381\Desktop\xiangneng-hrms`

## 1. 交付结论

两个系统已经合并为一个 pnpm monorepo。原“祥能之家”三端界面作为 `apps/portal` 保留，管理后台为 `apps/admin`，两者统一使用 `apps/api`、JWT/RBAC、Prisma 和 PostgreSQL 数据库，不存在 SQLite/前端数组双写。

AI 助手已嵌入管理后台和内部管理端：后台为右侧抽屉，移动端为全屏抽屉。运行模型为本机 Ollama 的 Qwen3.5 4B。系统业务数据没有被复制进模型参数或提示词；模型只做意图与参数识别，回答内容由程序在当前登录人的权限范围内实时查询正式业务库生成。这比把不断变化的人员数据“训练进模型”更准确、可撤回、可审计。

## 2. 技术与数据审查结果

| 项目 | 当前实现 |
|---|---|
| 管理后台 | React 18 + TypeScript + Vite + Ant Design 6 |
| 统一三端 Portal | React 19 + TypeScript + Vite + React Router + TanStack Query + PWA |
| API | Fastify 5 + Zod + JWT + rate-limit |
| 数据库/ORM | PostgreSQL 17 + Prisma 6 |
| 本地模型 | Ollama 0.32.1 + `qwen3.5:4b` |
| 会话 | 正式 Bearer JWT；每次请求重读用户、角色、tokenVersion 与项目关联 |
| 权限 | 前端显示 + 后端 Skill/RBAC + Prisma 数据范围三层控制 |
| 测试 | Vitest、Fastify inject、真实 API 集成校验、浏览器视觉与交互检查 |

数据库对账：8 个分公司、309 个项目、457 个供应商、156 个岗位、17,180 个人员、18,841 条报名/项目经历；当前在职 4,437、待入职 3,802、已离职 4,236。所有三端页面和 AI 查询均从这套数据读取。

## 3. 主要文件清单

- `apps/portal`：合并后的个人端、内部管理端、供应商端及移动 AI 助手。
- `apps/admin/src/components/AiAssistantPanel.tsx`：管理后台 AI 对话、表格、歧义选择、补参、预览和确认。
- `apps/admin/src/components/AdminAiDrawer.tsx`：管理后台右下角入口与右侧抽屉。
- `apps/api/src/routes/portal.ts`：三端传统业务统一 API。
- `apps/api/src/routes/ai.ts`：AI chat、confirm、action、health、demo reset 接口。
- `apps/api/src/ai/intent-router.ts`：规则优先、本地模型兜底与表单降级。
- `apps/api/src/ai/data-tools.ts`：三项实时查询工具。
- `apps/api/src/ai/action-service.ts`：入离职预览、token、幂等、事务和审计。
- `apps/api/src/services/person-lifecycle.ts`：传统页面与 AI 共用的正式入离职服务。
- `prisma/schema.prisma`、`prisma/migrations`：统一实体、Portal 扩展、AI Action/Audit 持久化。
- `scripts/start-local-demo.ps1`、`scripts/stop-local-demo.ps1`：本机一键启停。
- `scripts/verify-ollama.mts`：真实 Qwen 语义路由检查。
- `scripts/verify-ai-integration.mts`：五项能力、权限、token、事务、幂等和重置的真实 API 验收。

## 4. AI 入口与五项 Skill 映射

| 入口/Skill | 程序调用 |
|---|---|
| 管理后台右下角/“AI 助手”菜单 | `AdminAiDrawer` / `AiAssistantPanel` → `/api/ai/*` |
| 内部管理端右下角 | `apps/portal/src/features/ai/AiAssistant.tsx` → `/api/ai/*` |
| `project_personnel_statistics` | 权限过滤后的月度入职、离职、当前在职、净增减查询 |
| `employee_information_query` | 姓名/手机号/尾号/编号匹配；同名返回当前账号权限范围内的完整候选并停止，等待用户明确选择 |
| `recruitment_progress_query` | 与传统岗位页相同口径的需求、完成、缺口、完成率 |
| `employee_entry` | 唯一待入职人员 → 预览 → 用户确认 → 正式入职事务 |
| `employee_resignation` | 唯一在职人员 → 原因标准化 → 预览 → 用户确认 → 正式离职事务 |

禁止能力：自由 SQL、批量入职、批量离职、删除、工资与结算写入。模型不能确认或直接修改数据库。

## 5. 模型环境变量

```dotenv
XIANGNENG_LLM_BASE_URL=http://127.0.0.1:11434/v1
XIANGNENG_LLM_MODEL=qwen3.5:4b
XIANGNENG_LLM_API_KEY=ollama-local
AI_MODEL_TIMEOUT_MS=10000
AI_ACTION_TTL_SECONDS=600
AI_DEMO_MODE=true
```

温度固定 0.1；一次只提供命中 Skill 相关的少量工具；模型连续失败触发 60 秒熔断，并保留标准表单和传统页面。断网时规则路由、已下载模型和数据库均可在本机工作。

## 6. 权限、事务、幂等与审计

- 权限来自真实 JWT 登录态，客户端不能通过 branchId/projectId 参数扩大范围。
- 写预览不写数据库，返回用户绑定的 `action_id`、`action_token`、过期时间、before/after 和影响范围。
- 确认时校验用户、角色、Skill、数据范围、token、过期时间、当前状态和幂等键。
- 事务隔离级别为 Serializable；正式入离职服务同步人员主档、当前报名、生命周期、通知与审计，任一步失败整体回滚。
- 同一幂等键重复提交返回同一已执行结果，不重复入离职。
- AI 审计记录原始指令、Skill、参数、工具、路由方式、模型、操作人/角色/范围、确认、前后数据、结果和错误；在权限范围内保留完整业务字段，访问由后端权限和审计追踪控制。

## 7. 演示环境与重置

本机演示数据库为 `xiangneng_hrms_demo`，不连接生产库。演示账号由 `/api/auth/demo-login` 生成正式 JWT，支持总部、分公司、项目、现场运营、供应商、员工和系统管理员。

```powershell
pnpm demo:start
pnpm demo:stop
```

启动后：

- 统一小程序：`http://localhost:4320`
- 管理后台：`http://localhost:5173`，演示验证码 `8888`
- API：`http://127.0.0.1:3310`

AI 抽屉中的“重置演示写操作”调用 `POST /api/ai/demo/reset`，只恢复 AI 演示入离职快照。脚本不保存 JWT、密码或模型密钥。

## 8. 真实测试结果

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 通过，7 个工作区项目 |
| `pnpm lint` | 通过，0 error |
| `pnpm test` | 通过，23 个 API + 21 个管理端 + 11 个 Taro + 2 个 Portal + 7 个共享/数据导入，共 64 项 |
| `pnpm build` | 通过，Portal、管理后台、API、Taro、小官网、共享包、数据导入全部成功 |
| `pnpm data:verify` | 源哈希、分公司、项目、归属和汇总对账全部为 true |
| `pnpm verify:ollama` | 通过；复杂语句正确路由到招聘进度，实测约 8.0 秒 |
| `pnpm verify:ai` | 通过；三项查询、两项写预览/确认、错误 token、事务、幂等、越权拒绝和最终重置 |
| `pnpm test:e2e --workers=1` | 通过，桌面端与移动端共 10/10；使用隔离的 UI 测试夹具覆盖登录、指标展示、人员状态流转、权限隔离、产品介绍和响应式布局 |
| 浏览器检查 | 个人端、供应商端、内部端、管理后台、两个 AI 入口、真实查询、离职预览、取消锁定均通过 |

视觉对照参考图：蓝白主色、圆角卡片、移动顶部栏、指标宫格、项目进度、四栏底部导航与悬浮 AI 入口保持一致；实际数据量更大，因此列表内容与参考图演示数字不同。截图证据位于 `output/qa`。

## 9. 演示步骤

1. 执行 `pnpm demo:start`，看到 database/model 均验证完成。
2. 打开 `http://localhost:4320`，依次进入个人端、内部管理端、供应商端，展示同一项目与人员数据。
3. 内部管理端打开 AI，点击“查招聘进度”，展示极米光电外包的需求、完成、缺口、口径和更新时间。
4. 点击“办理离职”，核对 before/after；点“取消”可看到按钮锁定且数据库不变。
5. 如演示确认写入，点击“确认执行”，再用传统人员页面核对状态；重复确认不会重复执行。
6. 在管理后台用验证码 `8888` 登录，展示同一 4,437 在职人数与右侧 AI 抽屉。
7. 演示结束点击“重置演示写操作”。

## 10. 对现有系统的影响与安全提醒

- 没有删除原管理页面、Taro 小程序、数据导入和传统入离职入口。
- 新 Portal 只替换原 PWA 的 SQLite/静态会话数据访问层，UI 和路由结构保留。
- 新增 Portal 业务表、AI Action/Audit 表和演示账号/重置数据；迁移可重复部署。
- 已删除浏览器直连第三方模型和硬编码 Agnes API Key 的旧实现。该凭据曾出现在历史源码中，仍应在原供应方后台撤销/轮换；本交付包不包含该 key。
- 人员薪资源字段缺失时显示“薪资面议”，不会用参考图金额冒充正式数据。
