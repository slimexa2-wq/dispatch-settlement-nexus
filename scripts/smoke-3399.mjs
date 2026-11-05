// 本地生产构建冒烟验证脚本（临时，不在交付范围）。
// 用法：先 pnpm build，再 node scripts/smoke-3399.mjs
// 使用独立端口 3399，模型降级模式（不连 Ollama），验证无模型也能启动并服务门户 + 业务查询。

import { spawn } from "node:child_process";

const PORT = 3399;
const BASE = `http://127.0.0.1:${PORT}`;
const DATABASE_URL = "postgresql://postgres@127.0.0.1:5432/xiangneng_hrms_demo";

const env = {
  ...process.env,
  NODE_ENV: "production",
  AI_DEMO_MODE: "true",
  API_PORT: String(PORT),
  PORT: String(PORT),
  DATABASE_URL,
  // 不设置 XIANGNENG_LLM_PROVIDER -> 默认 ollama；本机未运行 Ollama -> 模型不可用（降级）
  JWT_SECRET: "smoke-test-secret-please-change-32chars-min"
};

const child = spawn("node", ["apps/api/dist/server.js"], {
  cwd: process.cwd(),
  env,
  stdio: ["ignore", "pipe", "pipe"]
});

let log = "";
child.stdout.on("data", (d) => { log += d; process.stdout.write(`[api] ${d}`); });
child.stderr.on("data", (d) => { log += d; process.stderr.write(`[api] ${d}`); });

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate(log)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`等待超时：${label}`);
}

async function main() {
  // 1) 等待监听
  await waitFor((l) => /listening|Server listening|3399/i.test(l), 20000, "server 启动");
  await new Promise((r) => setTimeout(r, 1500));

  // 2) 门户 index.html
  const portalRes = await fetch(`${BASE}/`);
  const portalHtml = await portalRes.text();
  console.log("\n[SMOKE] 门户 / 状态:", portalRes.status, "含 <title>:", /<title>/i.test(portalHtml));

  // 3) 健康检查（模型降级也应 200）
  const healthRes = await fetch(`${BASE}/api/ai/health`, { headers: { authorization: "Bearer x" } });
  const healthBody = await healthRes.json().catch(() => ({}));
  console.log("[SMOKE] /api/ai/health 状态:", healthRes.status, "body:", JSON.stringify(healthBody).slice(0, 200));

  // 4) demo 登录拿 token（需要 demo_hq 已导入）
  const loginRes = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ persona: "headquarters" })
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  const token = loginBody?.data?.token ?? loginBody?.token;
  console.log("[SMOKE] demo-login 状态:", loginRes.status, "有 token:", Boolean(token));
  if (!token) throw new Error("demo 登录失败，可能演示数据未导入：" + JSON.stringify(loginBody).slice(0, 200));

  // 5) 业务查询：邱玉彬是谁
  const chatBiz = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: "邱玉彬是谁" })
  });
  const bizBody = await chatBiz.json().catch(() => ({}));
  console.log("[SMOKE] 业务查询[邱玉彬是谁] 状态:", chatBiz.status, "type:", bizBody?.data?.type, "| 片段:", JSON.stringify(bizBody).slice(0, 300));

  // 6) 日期规则：今天几号
  const chatDate = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: "今天几号" })
  });
  const dateBody = await chatDate.json().catch(() => ({}));
  console.log("[SMOKE] 日期规则[今天几号] 状态:", chatDate.status, "消息:", String(dateBody?.data?.message ?? "").slice(0, 80));

  console.log("\n[SMOKE] 完成。准备关闭临时进程 (端口 3399)。");
  child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1000);
}

main().catch((err) => {
  console.error("\n[SMOKE] 失败:", err.message);
  console.error("[SMOKE] 最近日志:\n", log.slice(-2000));
  child.kill("SIGTERM");
  setTimeout(() => process.exit(1), 1000);
});
