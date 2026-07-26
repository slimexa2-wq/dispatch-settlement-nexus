# 祥能 HRMS —— Render 单服务部署指南

本文档面向**非运维同学**：照着步骤做，即可把「祥能人员与招聘信息管理系统」部署成一个固定网址、开箱即用的在线服务。部署完成后，门户（招聘/人员/结算）与 AI 助手由**同一个网址**提供，无需分别部署前后端。

---

## 一、前置条件

1. **代码已推送到 GitHub 仓库**（必须是 `main` 分支，Render 默认读 `main`）。
2. 有一个 **[Render 账号](https://render.com)**（免费注册即可）。
3. 有一个**云端大模型 API Key**（三选一，按价格/速度自选）：
   - DeepSeek：`https://platform.deepseek.com`
   - 硅基流动 SiliconFlow：`https://siliconflow.cn`
   - OpenAI：`https://platform.openai.com`
4. 本地已确认仓库根目录存在 `render.yaml`（本仓库已内置）。

---

## 二、部署步骤

### 方式 A：Blueprint 一键部署（推荐）

1. 登录 Render，进入 **Blueprints** → **New Blueprint Instance**。
2. 连接你的 GitHub 仓库，Render 会自动读取根目录的 `render.yaml`。
3. 确认要创建的资源：一个 `web` 服务（应用）+ 一个 `postgres` 数据库。
4. 点击 **Apply**，进入下一步填写密钥（见下方「必须手动填写的变量」）。
5. Render 会自动执行：`pnpm install` → 生成 Prisma Client → 构建 → 跑数据库迁移 → 导入演示数据 → 启动。

### 方式 B：手动创建（不使用 Blueprint）

1. 新建 **Postgres** → 名称 `xiangneng-db`，计划 `starter`，数据库名 `xiangneng_hrms_demo`。
2. 新建 **Web Service** → 关联同一仓库、`main` 分支。
   - Runtime：**Node**
   - Build Command：`pnpm install && pnpm prisma generate && pnpm build`
   - Start Command：`node apps/api/dist/server.js`
   - Health Check Path：`/api/ai/health`
   - 在 **Advanced** 里添加环境变量（见下），并设 `DATABASE_URL` 为上面 Postgres 的 Internal Connection String。
3. 在 **Deploys** → **Run release command** 阶段会自动执行迁移与演示数据导入。

### 必须手动填写的变量（Render 后台，标 `sync: false` 的）

| 变量名 | 说明 | 示例 |
|---|---|---|
| `JWT_SECRET` | 会话签名密钥，**≥32 字符**随机串 | `9f2c1a...（自己生成的长串）` |
| `XIANGNENG_LLM_BASE_URL` | 云端模型基址，**需含 `/v1`** | `https://api.deepseek.com/v1` |
| `XIANGNENG_LLM_MODEL` | 业务/对话主模型 | `deepseek-chat` |
| `XIANGNENG_LLM_CHAT_MODEL` | 闲聊模型（可同主模型） | `deepseek-chat` |
| `XIANGNENG_LLM_API_KEY` | 云端模型 API Key | `sk-...` |

`render.yaml` 中已预设：`NODE_ENV=production`、`AI_DEMO_MODE=true`、`ADMIN_ORIGIN=*`、`XIANGNENG_LLM_PROVIDER=openai`、`DATABASE_URL`（自动引用数据库）。通常无需改动。

**三种 provider 速查**（BASE_URL / MODEL / CHAT_MODEL）：

- DeepSeek：`https://api.deepseek.com/v1` / `deepseek-chat` / `deepseek-chat`
- 硅基流动：`https://api.siliconflow.cn/v1` / `Qwen/Qwen3-4B` / `Qwen/Qwen2.5-1.5B-Instruct`
- OpenAI：`https://api.openai.com/v1` / `gpt-4o-mini` / `gpt-4o-mini`

---

## 三、验证部署是否成功

1. 打开 Render 分配的网址 `https://<你的服务名>.onrender.com`。
2. 进入演示登录，选择一个身份（如「集团领导」）登录。
3. 在 AI 助手对话框输入：
   - **「今天几号」** → 应返回规则生成的日期答案（不依赖模型）。
   - **「邱玉彬是谁」** → 若演示数据中存在该人员，应返回真实业务数据（来自数据库，不依赖模型）。
   - 自由闲聊（如「你好」）→ 由云端模型回答（需上面密钥填对）。
4. 打开 `https://<你的服务名>.onrender.com/api/ai/health` 应返回 `200`，其中 `database: "ok"`、`status` 可为 `ok` 或 `degraded`（模型不可用也只是降级，不影响业务）。

---

## 四、注意事项（重要）

- **免费版会休眠**：`plan: free` 在 15 分钟无流量后休眠，下次访问冷启动十几秒；比赛/演示请用 `starter`（在 `render.yaml` 中已设为 `starter`）。
- **Postgres 容量**：free Postgres 仅 256MB，1.7 万人员演示数据可能偏紧，建议 `starter`；如数据导入报容量错误，见下方「遗留风险」。
- **模型不可用时门户照常可用**：即使云端 Key 未填或模型故障，门户浏览、业务查询、日期/规则问答仍正常工作，仅 AI 自由闲聊降级为友好提示。这正是我们让 `/api/ai/health` 在模型降级时仍返回 200 的原因——Render 不会因此误杀服务。
- **计划停机**：如需停机，在 Render 后台 Manual Deploy / Suspend 即可。

---

## 五、遗留风险与替代方案

1. **演示数据文件需进仓库**：`releaseCommand` 中的 `pnpm db:import-demo` 依赖仓库内 `data/derived/demo-data.full.json`（约 60MB+）。请确保该文件已提交；若文件过大被 Git 拒绝，可改用 [Git LFS](https://git-lfs.com/)，或把 `releaseCommand` 改为仅 `pnpm prisma migrate deploy`，部署后再在本地/CI 手动跑一次 `pnpm db:import-demo`。
2. **Prisma 迁移需进仓库**：`prisma/migrations` 目录必须随代码提交，否则 `migrate deploy` 无迁移可跑。
3. **真实云端模型联调**：本仓库代码层面已支持，但需在 Render 后台填好 `XIANGNENG_LLM_*` 变量并部署后才能实测；本地无 Key 时应用会以「模型降级」模式正常启动与服务。
