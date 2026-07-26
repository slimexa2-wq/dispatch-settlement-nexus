# 祥能 HRMS —— Render 正式服务部署指南

`render.yaml` 用于部署正式 API、PostgreSQL 和移动门户，不承载公开比赛合成演示。公开演示由 Sites 的隔离合成数据版本提供；正式服务必须使用真实账号、真实权限和受控内网 Ollama。

## 一、部署前提

1. 代码已经推送到待部署分支，数据库迁移位于 `prisma/migrations`。
2. Render Postgres 已创建，`DATABASE_URL` 使用 Internal Connection String。
3. 已有可从 Render 私网访问的 Ollama 服务，并已拉取 `qwen3.5:4b`。
4. 已生成至少 32 字符的随机 `JWT_SECRET`。

## 二、Blueprint 部署

1. 在 Render 新建 Blueprint 并选择本仓库。
2. Render 按 `render.yaml` 创建 Web Service 和 PostgreSQL。
3. 填写：

   - `JWT_SECRET`
   - `XIANGNENG_LLM_BASE_URL`，例如 `http://ollama.internal:11434/v1`

4. 构建阶段执行：

   - `pnpm install --frozen-lockfile`
   - `pnpm db:generate`
   - `pnpm build`

5. Release 阶段只执行 `pnpm db:migrate`，不会自动导入比赛数据或随机密码账号。
6. 服务启动命令为 `node apps/api/dist/server.js`。

## 三、安全默认值

- `NODE_ENV=production`
- `AI_DEMO_MODE=false`
- `XIANGNENG_LLM_PROVIDER=ollama`
- `XIANGNENG_LLM_MODEL=qwen3.5:4b`
- 健康检查为公开的 `/health`，只返回服务和数据库状态，不返回用户权限或业务数据。
- `/api/ai/health` 仍要求登录，用于授权用户查看模型、规则、能力和数据范围状态。
- 演示身份快捷登录在生产环境关闭；正式用户必须走账号密码或微信认证。
- 模型仅做意图与参数识别，所有查数、权限、事务和审计均由程序完成。

## 四、验收

1. `GET /health` 返回 `200` 和 `{"status":"ok","database":"ok"}`。
2. 使用正式账号登录，确认角色、权限和数据范围正确。
3. 检查传统人员、项目、招聘、报销页面。
4. 在 AI 助手验证三项查询和单人入离职预览；写操作必须由用户点击确认。
5. 关闭 Ollama 后复验：传统系统继续可用，AI 强规则和标准表单仍能工作。

## 五、比赛演示

比赛公开网址使用仓库中的 `apps/sites-demo` 构建，数据全部来自 `data/synthetic/demo-data.json`。它与正式 PostgreSQL、真实人员信息和生产账号完全隔离，不得把公开演示站点当作生产服务。
