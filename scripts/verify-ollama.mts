import { fileURLToPath } from "node:url";
import { AiSchemaRegistry } from "../apps/api/src/ai/schema-registry.js";
import { OllamaClient } from "../apps/api/src/ai/ollama-client.js";
import { IntentRouter } from "../apps/api/src/ai/intent-router.js";
import type { AppConfig } from "../apps/api/src/config.js";

const config: AppConfig = {
  NODE_ENV: "test", API_HOST: "127.0.0.1", API_PORT: 3100, ADMIN_ORIGIN: "http://localhost:4320",
  DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/xiangneng_hrms_demo",
  JWT_SECRET: "local-verification-only-secret-32-characters", JWT_EXPIRES_IN: "1h",
  UPLOAD_DIR: fileURLToPath(new URL("../apps/api/uploads", import.meta.url)), MAX_UPLOAD_BYTES: 1024,
  WECHAT_MINIAPP_PATH: "/pages/index/index", XIANGNENG_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
  XIANGNENG_LLM_MODEL: "qwen3.5:4b", XIANGNENG_LLM_API_KEY: "ollama-local",
  AI_MODEL_TIMEOUT_MS: 30_000, AI_ACTION_TTL_SECONDS: 600, AI_DEMO_MODE: true,
  AI_SKILL_ROOT: fileURLToPath(new URL("../skills/xiangneng-ai-business-assistant", import.meta.url))
};

const schemas = new AiSchemaRegistry(config);
await schemas.load();
const client = new OllamaClient(config);
const router = new IntentRouter(config, schemas, client);
await router.load();
const started = performance.now();
const result = await router.route(
  "请综合判断祥能智造示范项目的人才补充态势",
  ["project_personnel_statistics", "recruitment_progress_query"]
);
if (!["project_personnel_statistics", "recruitment_progress_query"].includes(result.skill) || result.routeType !== "model") {
  throw new Error(`Expected a valid model-routed personnel/recruitment skill, received ${result.skill}/${result.routeType}`);
}
console.log(JSON.stringify({ status: "ok", elapsed_ms: Math.round(performance.now() - started), result }, null, 2));
