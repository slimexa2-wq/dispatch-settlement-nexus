# 祥能 HRMS、统一小程序与本地 AI 助手交付说明

更新日期：2026-07-26

交付分支：`codex/full-hrms-production`

本地工作树：`C:\Users\22381\Desktop\xiangneng-hrms-worktrees\full-hrms-production`

## 1. 交付结论

项目已经统一为一个 pnpm monorepo：

- `apps/admin`：PC 管理后台、领导驾驶舱、报销、人员、招聘、项目、供应商、工资条、推荐和 AI 助手。
- `apps/portal`：手机形态的个人端、供应商端、内部管理端 PWA；后台中的“小程序演示”指向这套真实交互界面。
- `apps/miniapp`：可编译的 Taro 4 微信小程序工程。
- `apps/api`：Fastify API、JWT 会话、RBAC、数据范围、审计、文件存储和 AI 接口。
- `prisma`：PostgreSQL 数据模型、迁移和 Seed。
- `data/synthetic`：公开比赛演示专用、可重置、无真实个人隐私的合成业务数据。

后台保持桌面端信息密度，小程序保持手机端布局。人员、项目、岗位、供应商、招聘、入离职等信息在授权范围内完整返回，不对内部授权用户隐藏电话或身份证；公开演示只使用合成身份数据。

## 2. 当前技术栈

| 范围 | 实现 |
|---|---|
| PC 后台 | React 18、TypeScript、Vite、Ant Design 6、React Router |
| 统一门户 | React 19、TypeScript、Vite、TanStack Query、PWA |
| 微信小程序 | Taro 4.2.1、React 18、TypeScript |
| API | Fastify 5、Zod、JWT、rate-limit、multipart |
| 数据库/ORM | PostgreSQL 17、Prisma 6 |
| AI | Ollama 0.32.3、Qwen3.5 4B（本机模型约 3.4 GB） |
| 测试 | Vitest、Fastify inject、Playwright/浏览器实测 |

## 3. 演示数据

当前公开演示数据是小而完整的确定性合成数据：

| 实体 | 数量 |
|---|---:|
| 分公司 | 3 |
| 项目 | 8 |
| 供应商 | 6 |
| 招聘岗位 | 12 |
| 外派人员 | 48 |
| 报名/招聘记录 | 48 |
| 内部员工 | 6 |

项目均具备图片、简介、负责人和联系电话；岗位均具备工作内容、要求、薪资、工时和地点；供应商均具备联系人、电话和合作项目；人员均具备编号、姓名、完整电话、合成身份证、项目、岗位、供应商和生命周期。

`pnpm data:verify` 会校验必填字段、唯一 ID 和全部实体引用。仓库中没有源 Excel 时执行自包含合成数据校验；若将原始项目主数据 Excel 放回约定路径，则自动切换为源文件哈希及项目对账。

## 4. 本地 AI 助手

AI 不是四个固定回复，也不是把业务数据训练进模型权重。实现链路为：

```text
用户问题
→ 规则优先路由
→ Qwen3.5 4B 复杂语义兜底
→ JSON Schema 校验
→ 权限和数据范围
→ 正式业务查询/写操作预览
→ 用户确认
→ Serializable 事务
→ 审计日志
```

动态业务数据通过权限受控检索实时读取，模型只负责意图和参数识别；查询结果、口径说明和写操作均由确定性的业务服务生成。这样人员状态变化后立即可查询，不需要重新训练模型，也不会让模型直接接触 SQL 或直接执行写操作。

五项 Skill：

| Skill | 能力 |
|---|---|
| `project_personnel_statistics` | 月度入职、离职、当前在职、净增减；按分公司、项目、月份筛选 |
| `employee_information_query` | 姓名、电话、尾号、编号、状态、项目、岗位、入离职、供应商、推荐人和生命周期 |
| `recruitment_progress_query` | 需求、完成、缺口、完成率及权限范围内排序 |
| `employee_entry` | 单人入职预览、用户确认、事务执行和审计 |
| `employee_resignation` | 单人离职预览、原因标准化、用户确认、事务执行和审计 |

明确拒绝：自由 SQL、批量入职、批量离职、删除人员、工资/结算写入、模型自行确认、绕过权限查询。

## 5. AI 环境变量

```dotenv
XIANGNENG_LLM_PROVIDER=ollama
XIANGNENG_LLM_BASE_URL=http://127.0.0.1:11434/v1
XIANGNENG_LLM_MODEL=qwen3.5:4b
XIANGNENG_LLM_FALLBACK_MODEL=qwen3.5:4b
XIANGNENG_LLM_CHAT_MODEL=qwen3.5:4b
XIANGNENG_LLM_API_KEY=ollama-local
AI_MODEL_TIMEOUT_MS=10000
AI_ACTION_TTL_SECONDS=600
AI_DEMO_MODE=true
```

模型温度为 0.1，单次超时 10 秒，支持预热、熔断和标准表单降级。断网时规则路由、本地模型、数据库和传统业务页面仍可工作。

Docker 运行 API 时，默认通过 `http://host.docker.internal:11434/v1` 访问宿主机 Ollama。

## 6. 权限与写操作安全

- 前端控制入口显示，后端控制 Skill 授权，Prisma 查询控制数据范围；三层同时生效。
- 总部/分公司负责人只有三项查询；项目运营和系统管理员可执行单人入离职；供应商只能查本供应商关联人员；员工只能查本人。
- 同名或参数歧义时停止并要求用户选择，不使用模糊首条记录。
- 预览不写数据库，返回用户绑定的 `action_id`、`action_token`、过期时间、before、after 和影响范围。
- 确认时重读用户、权限、数据范围和人员状态；唯一幂等键保证重复点击不重复执行。
- 入离职使用 Serializable 事务，同步人员主档、报名、生命周期、通知和审计，任一步失败整体回滚。

## 7. 启动、重置与部署

本机完整演示：

```powershell
pnpm demo:start
pnpm demo:stop
pnpm demo:reset-database
```

启动地址：

- PC 管理后台：`http://localhost:5173`
- 手机统一门户：`http://localhost:4320`
- API：`http://127.0.0.1:3310`
- Ollama：`http://127.0.0.1:11434`

`POST /api/ai/demo/reset` 只恢复隔离演示库中的 AI 入离职写操作；`pnpm demo:reset-database` 会在严格核验本机 `xiangneng_hrms_demo` 后重建完整演示库。两者都不会连接生产库。前端离线演示模式也提供相同的预览、确认、幂等和本地重置语义。

生产部署前必须更换 JWT secret、管理员初始密码，关闭 `AI_DEMO_MODE`，配置正式 PostgreSQL、文件存储和微信 AppID，并重新执行权限验收。

## 8. 2026-07-26 实测结果

| 检查 | 结果 |
|---|---|
| `pnpm db:validate` | Prisma Schema 有效 |
| `pnpm db:generate` | Prisma Client 生成成功 |
| `pnpm data:verify` | 7 类实体完整，全部引用一致 |
| `pnpm demo:safety` | `public_data_safe=true` |
| `pnpm check` | 类型检查、Lint、全部测试和全部构建通过 |
| 测试数量 | API 80、后台 30、门户 7、小程序 11、共享包 8、数据导入 4，共 140 |
| 微信小程序构建 | Taro `weapp` 编译成功 |
| `pnpm verify:ollama` | 真实 Qwen 模型语义路由成功，最终实测 8.065 秒 |
| `pnpm verify:ai` | 健康、三查询、入职、离职、token、事务、数据库业务日期、幂等、越权拒绝和最终重置全部通过 |
| 真实健康检查 | PostgreSQL `ok`、模型 `ok`、规则 `ok` |
| 浏览器实测 | PC AI 自由人员/电话/项目岗位查询、入职预览确认；手机内部端、供应商岗位详情、人员页面均通过 |

非阻断提示：后台和门户生产构建仍有大 chunk 性能提示；不影响功能正确性，后续可继续拆分。当前机器没有 Docker 命令，因此本轮未在本机执行 Docker build；Dockerfile 与 Compose 已保留，GitHub CI 可继续验证。

## 9. 最终交付定位

- 公开演示：`https://xiangneng-hrms-demo-20260726.slimexa2.chatgpt.site`
- 公开演示数据：只使用确定性合成业务快照，可直接登录和交互，不连接本机 PostgreSQL 或 Ollama。
- 本地完整演示：PostgreSQL + Ollama `qwen3.5:4b`，支持真实系统数据查询、单人入职/离职预览确认和权限审计。
- Git 分支：`codex/full-hrms-production`
- 最终源码提交：以交付时 `git rev-parse HEAD` 为准。
- 源码压缩包：桌面 `祥能HRMS-完整源码-<短提交号>.zip`，由 `git archive` 从最终提交生成。
- GitHub 状态：本机 `GITHUB_TOKEN` 无效，因此未伪造 Push/PR/CI 成功；完成 `gh auth login -h github.com` 后可继续正常推送该分支并创建 PR，未经确认不合并 `main`。
