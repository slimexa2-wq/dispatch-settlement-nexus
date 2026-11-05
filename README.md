# 祥能人员与招聘信息管理系统 V2.0

## 2026-07-26 统一 Portal、微信小程序与本地 AI

`apps/portal` 已合并个人端、内部管理端和供应商端，并与 `apps/admin` 共用 Fastify、JWT/RBAC、Prisma 和 PostgreSQL。管理后台与内部端均内嵌“祥能AI业务助手”，模型固定为本机 Ollama `qwen3.5:4b`；模型只识别意图，实时查数、权限、事务、幂等和审计均由后端程序负责。

本机一键启动：

```powershell
pnpm demo:start
```

- Portal：`http://localhost:4320`
- 管理后台：`http://localhost:5173`（演示验证码 `8888`）
- 将隔离演示库完整恢复为确定性合成数据：`pnpm demo:reset-database`
- 停止前后端：`pnpm demo:stop`
- AI 集成验收：`pnpm verify:ai`
- 本地模型验收：`pnpm verify:ollama`

完整说明见 [祥能AI业务助手与统一小程序最终交付](docs/祥能AI业务助手与统一小程序最终交付.md)。

这是一个面向真实人员与招聘业务的单体优先系统，包含 React 管理端、Taro 微信小程序、Fastify API、PostgreSQL/Prisma 数据库，以及可重复执行的 Excel 初始化与导入链路。人员从报名、面试、入职、在职到离职始终沿用同一主档案；招聘需求、项目、供应商、政策、推荐和工资条使用同一数据库与权限体系。

## 技术与目录

- `apps/admin`：React 18 + TypeScript + Ant Design 管理端。
- `apps/miniapp`：Taro 4 + React 微信小程序，覆盖运营、供应商、求职者、内部员工四类入口。
- `apps/api`：Fastify + TypeScript 单体 API，包含 JWT、RBAC、数据范围、审计日志、文件与通知队列。
- `prisma`：PostgreSQL 模型、初始迁移和幂等 seed。
- `packages/shared`：前后端共享枚举、校验和角色权限。
- `packages/data-import`：源 Excel 提取、对账和派生数据验证。
- `data/derived`：经源文件哈希与数量对账的组织项目派生数据。
- `docs`：开发计划、源资料、数据报告、测试与验收说明。

选择 pnpm monorepo 和单体 API 是为了共享类型与校验、减少部署组件，并保持当前业务规模下的可维护性；项目未引入微服务或大型审批引擎。

## 环境要求

- Node.js 22 或更高版本；当前工程已在 Node.js 24 验证。
- pnpm 11。
- PostgreSQL 17，或安装 Docker Desktop 后使用 Compose。
- 小程序预览/发布需要微信开发者工具和真实小程序配置；源码构建不依赖真实微信密钥。

## 一键演示封装包

用于会议、客户交流和现场演示时，可生成无需安装数据库或开发工具的 Windows 便携版：

```powershell
pnpm demo:package
```

输出目录为 `output/祥能人员与招聘信息管理系统_演示版`。双击其中的 `启动演示系统.cmd` 后会自动打开登录页，演示验证码为 `8888`。便携版自带 Node.js 运行环境，默认仅监听本机地址；后台管理端、小程序演示和角色切换继续共用同一份演示状态，并支持恢复初始数据。

演示数据由完整源派生文件压缩生成，完整备份保留在 `data/derived/demo-data.full.json`。压缩只删除重复嵌套和可由主数据恢复的冗余字段，不改变人员、报名、项目数量及源文件哈希。

## 本地启动

1. 安装依赖并准备环境变量：

```powershell
Copy-Item .env.example .env
pnpm install
```

2. 修改 `.env`：至少设置可连接的 `DATABASE_URL`、长度不少于 32 字符的 `JWT_SECRET`，以及仅用于开发环境的 `SEED_ADMIN_USERNAME`、`SEED_ADMIN_PASSWORD`。请勿在生产环境沿用示例密码。

3. 生成客户端、部署迁移并写入真实组织项目主数据：

```powershell
pnpm db:generate
pnpm db:validate
pnpm db:migrate
pnpm db:seed
```

`db:seed` 会先验证源 Excel SHA-256 与派生数据对账，再幂等写入 7 个分子公司和 243 个项目；不会生成虚构项目、负责人、电话或合作期限。再次运行只更新相同来源项目，不重复插入。

4. 启动 API 和管理端：

```powershell
pnpm dev
```

- 管理端：`http://localhost:5173`
- API：`http://localhost:3310`
- 健康检查：`http://localhost:3310/api/ai/health`（登录后访问）

5. 构建微信小程序：

```powershell
pnpm dev:miniapp
# 或生产构建
pnpm --filter @xiangneng/miniapp build
```

构建输出在 `apps/miniapp/dist`。在微信开发者工具中导入该目录前，需要按 [微信真实配置清单](docs/微信真实配置清单.md) 配置 AppID、请求域名、模板与跳转页面。

## Docker Compose

先在 `.env` 中设置至少以下值：

```dotenv
POSTGRES_PASSWORD=replace-with-a-strong-password
JWT_SECRET=replace-with-at-least-32-random-characters
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=replace-with-a-strong-development-password
SEED_ADMIN_DISPLAY_NAME=系统管理员
```

然后运行：

```powershell
docker compose config
docker compose up --build
```

Compose 会先等待 PostgreSQL 健康，再由一次性 `init` 服务执行迁移和 seed，成功后启动 API；管理端通过 Nginx 的 `/api` 反向代理访问 API。访问地址为：

- 管理端：`http://localhost:8080`
- API：`http://localhost:3310`

上传文件和 PostgreSQL 数据分别保存在具名卷 `uploads`、`postgres_data`。本机交付环境未安装 Docker/PostgreSQL，因此本次完成了 Compose 结构、镜像构建路径和迁移静态验证，但没有伪称已经在本机启动容器；见 [测试报告](docs/测试报告.md)。

## 初始化数据与 Excel 导入

原始 Excel 保存在 `docs/source` 且不会被修改。可单独复核提取链路：

```powershell
pnpm data:preview
pnpm data:extract
pnpm data:verify
```

原始导入数据继续保留来源与变更痕迹，不覆盖原始文件。比赛演示库通过 `scripts/enrich-demo-data.mts` 单独补齐项目负责人、联系方式、岗位说明、供应商对接人、员工编号等演示字段；脚本仅允许作用于名称含 `demo` 的数据库，正式库不会自动生成这些信息。详细对账见 [组织项目初始化数据预处理报告](docs/reports/组织项目初始化数据预处理报告.md)。

管理端“数据导入”支持：

- 组织项目源文件哈希校验、预览、异常清单和 staged commit。
- 人员模板下载、multipart 预览、身份证查重、逐行新建/归并/跳过结果和 staged commit。
- 工资条模板、预览、人员匹配、异常提示、批次提交、发布与撤回。

## 测试账号与权限

工程不内置固定生产账号。`pnpm db:seed` 只在提供 `SEED_ADMIN_*` 环境变量时创建或更新一个系统管理员；示例开发账号为 `.env.example` 中的 `admin`，首次使用前必须修改示例密码。

其余账号由系统管理员在“权限与审计”中按真实人员、分子公司、项目或供应商创建：

- 总部管理者：全局业务读取和人员/项目管理。
- 分子公司负责人：仅本分公司项目与人员。
- 项目运营：仅被分配项目，可报名、面试、入离职。
- 资源专员：供应商、政策和奖励复核；无人员敏感档案读取权。
- 供应商：仅关联项目、本人报送人员和适用政策。
- 内部员工：本人推荐、奖励和已发布工资条。
- 求职者：本人报名进度；未登录访客可查看开放岗位和提交首次报名。
- 系统管理员：用户、权限、导入和审计维护。

公开报名不会返回档案是否已存在，也不会匿名覆盖既有姓名、电话或紧急联系人；既有人员再次报名仅幂等关联岗位，查看进度仍需完成账号或微信身份绑定。

## 验证命令

```powershell
# 类型检查、静态检查、单元/业务测试与生产构建
pnpm check

# Excel 派生数据再次对账
pnpm data:verify

# 自动启动测试管理端并运行桌面 + 移动视口 UI E2E
pnpm test:e2e --workers=1
```

Playwright 用例使用明确标记的 mock API 夹具验证管理端交互，不等同于 PostgreSQL 联调；API 的 Fastify inject 测试覆盖认证、数据范围、报名归并、导入与公开接口，迁移则通过 Prisma 校验和 migration/schema 静态一致性检查。准确的数量、边界与截图路径以 [测试报告](docs/测试报告.md) 为准。

## 微信能力边界

代码已实现小程序 `code` 登录/绑定、公开岗位、签名推荐链接、推荐二维码接口、通知队列、失败重试和小程序跳转。真实发送和二维码生成只有在 `.env` 中配置真实 AppID/AppSecret、合法域名和模板 ID 后才会启用；缺失配置时返回明确的 `WECHAT_NOT_CONFIGURED` 或记录 `SKIPPED_NOT_CONFIGURED`，不会伪报发送成功。

通知队列覆盖报名、面试/就业状态、奖励、工资条和新招聘需求。公众号模板字段仍需按实际审核通过的模板映射后再开放生产发送。

## 交付索引

- [开发理解与执行计划](docs/开发理解与执行计划.md)
- [产品验收追踪清单](docs/验收追踪清单.md)
- [测试报告](docs/测试报告.md)
- [最终验收说明](docs/最终验收说明.md)
- [微信真实配置清单](docs/微信真实配置清单.md)
- [阶段交付报告](docs/reports/阶段交付报告.md)
- 管理端截图：`apps/admin/screenshots`、`output/playwright/screenshots`

## 已知边界

- 用户未提供需求中提到的 18 张页面参考图；当前页面依据产品说明中的信息层级与视觉规则实现，未复制参考图假数据。
- 本机没有 Docker/PostgreSQL 和微信开发者工具，故容器实启、真实数据库迁移执行、小程序真机预览、微信真实消息与二维码生成需在具备相应环境和凭据后完成。
- 项目图片支持上传、查看与后端删除接口；管理端当前未提供图片重排操作。
- Ant Design 公共包生产构建约 840 KB，Vite 给出非阻断 chunk 提示；业务页面已按路由懒加载。
