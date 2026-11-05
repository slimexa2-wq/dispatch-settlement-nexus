import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().optional(),
  API_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  ADMIN_ORIGIN: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().optional(),
  HOST: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  CORS_ORIGIN: z.string().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("8h"),
  UPLOAD_DIR: z.string().default(resolve(process.cwd(), "apps", "api", "uploads")),
  FILE_STORAGE_DRIVER: z.enum(["local", "cos"]).default("local"),
  COS_REGION: z.string().trim().optional(),
  COS_BUCKET: z.string().trim().optional(),
  COS_SECRET_ID: z.string().trim().optional(),
  COS_SECRET_KEY: z.string().trim().optional(),
  COS_ENDPOINT: z.string().url().optional(),
  WECHAT_MINIAPP_APP_ID: z.string().optional(),
  WECHAT_MINIAPP_APP_SECRET: z.string().optional(),
  WECHAT_OFFICIAL_APP_ID: z.string().optional(),
  WECHAT_OFFICIAL_APP_SECRET: z.string().optional(),
  WECHAT_TEMPLATE_APPLICATION_SUCCESS: z.string().optional(),
  WECHAT_TEMPLATE_INTERVIEW_REMINDER: z.string().optional(),
  WECHAT_TEMPLATE_EMPLOYMENT_STATUS: z.string().optional(),
  WECHAT_TEMPLATE_SALARY_PUBLISHED: z.string().optional(),
  WECHAT_TEMPLATE_JOB_DEMAND: z.string().optional(),
  WECHAT_MINIAPP_PATH: z.string().default("/pages/index/index"),
  XIANGNENG_LLM_PROVIDER: z.enum(["ollama", "openai"]).default("ollama"),
  XIANGNENG_LLM_BASE_URL: z.string().url().default("http://127.0.0.1:11434/v1"),
  XIANGNENG_LLM_MODEL: z.string().trim().min(1).default("qwen3.5:4b"),
  XIANGNENG_LLM_FALLBACK_MODEL: z.string().trim().min(1).default("qwen3.5:4b"),
  XIANGNENG_LLM_CHAT_MODEL: z.string().trim().min(1).default("qwen3.5:4b"),
  XIANGNENG_LLM_API_KEY: z.string().default("ollama-local"),
  AI_MODEL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  AI_ACTION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  AI_DEMO_MODE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  AI_SKILL_ROOT: z.string().optional()
});

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

export type AppConfig = {
  NODE_ENV: "development" | "test" | "production";
  API_HOST: string;
  API_PORT: number;
  ADMIN_ORIGIN: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  UPLOAD_DIR: string;
  MAX_UPLOAD_BYTES: number;
  FILE_STORAGE_DRIVER: "local" | "cos";
  COS_REGION?: string;
  COS_BUCKET?: string;
  COS_SECRET_ID?: string;
  COS_SECRET_KEY?: string;
  COS_ENDPOINT?: string;
  WECHAT_MINIAPP_APP_ID?: string;
  WECHAT_MINIAPP_APP_SECRET?: string;
  WECHAT_OFFICIAL_APP_ID?: string;
  WECHAT_OFFICIAL_APP_SECRET?: string;
  WECHAT_TEMPLATE_APPLICATION_SUCCESS?: string;
  WECHAT_TEMPLATE_INTERVIEW_REMINDER?: string;
  WECHAT_TEMPLATE_EMPLOYMENT_STATUS?: string;
  WECHAT_TEMPLATE_SALARY_PUBLISHED?: string;
  WECHAT_TEMPLATE_JOB_DEMAND?: string;
  WECHAT_MINIAPP_PATH: string;
  XIANGNENG_LLM_PROVIDER: "ollama" | "openai";
  XIANGNENG_LLM_BASE_URL: string;
  XIANGNENG_LLM_MODEL: string;
  XIANGNENG_LLM_FALLBACK_MODEL: string;
  XIANGNENG_LLM_CHAT_MODEL: string;
  XIANGNENG_LLM_API_KEY: string;
  AI_MODEL_TIMEOUT_MS: number;
  AI_ACTION_TTL_SECONDS: number;
  AI_DEMO_MODE: boolean;
  AI_SKILL_ROOT: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawEnvSchema.parse(env);
  return {
    NODE_ENV: parsed.NODE_ENV,
    API_HOST: parsed.API_HOST ?? parsed.HOST ?? "0.0.0.0",
    API_PORT: parsed.PORT ?? parsed.API_PORT ?? 3310,
    ADMIN_ORIGIN: parsed.ADMIN_ORIGIN ?? parsed.CORS_ORIGIN ?? "http://localhost:5173",
    DATABASE_URL: parsed.DATABASE_URL,
    JWT_SECRET: parsed.JWT_SECRET,
    JWT_EXPIRES_IN: parsed.JWT_EXPIRES_IN,
    UPLOAD_DIR: resolve(parsed.UPLOAD_DIR),
    MAX_UPLOAD_BYTES: parsed.MAX_UPLOAD_BYTES ?? Math.round((parsed.MAX_UPLOAD_MB ?? 20) * 1024 * 1024),
    FILE_STORAGE_DRIVER: parsed.FILE_STORAGE_DRIVER,
    COS_REGION: parsed.COS_REGION,
    COS_BUCKET: parsed.COS_BUCKET,
    COS_SECRET_ID: parsed.COS_SECRET_ID,
    COS_SECRET_KEY: parsed.COS_SECRET_KEY,
    COS_ENDPOINT: parsed.COS_ENDPOINT,
    WECHAT_MINIAPP_APP_ID: parsed.WECHAT_MINIAPP_APP_ID,
    WECHAT_MINIAPP_APP_SECRET: parsed.WECHAT_MINIAPP_APP_SECRET,
    WECHAT_OFFICIAL_APP_ID: parsed.WECHAT_OFFICIAL_APP_ID,
    WECHAT_OFFICIAL_APP_SECRET: parsed.WECHAT_OFFICIAL_APP_SECRET,
    WECHAT_TEMPLATE_APPLICATION_SUCCESS: parsed.WECHAT_TEMPLATE_APPLICATION_SUCCESS,
    WECHAT_TEMPLATE_INTERVIEW_REMINDER: parsed.WECHAT_TEMPLATE_INTERVIEW_REMINDER,
    WECHAT_TEMPLATE_EMPLOYMENT_STATUS: parsed.WECHAT_TEMPLATE_EMPLOYMENT_STATUS,
    WECHAT_TEMPLATE_SALARY_PUBLISHED: parsed.WECHAT_TEMPLATE_SALARY_PUBLISHED,
    WECHAT_TEMPLATE_JOB_DEMAND: parsed.WECHAT_TEMPLATE_JOB_DEMAND,
    WECHAT_MINIAPP_PATH: parsed.WECHAT_MINIAPP_PATH,
    XIANGNENG_LLM_PROVIDER: parsed.XIANGNENG_LLM_PROVIDER,
    XIANGNENG_LLM_BASE_URL: parsed.XIANGNENG_LLM_BASE_URL.replace(/\/$/, ""),
    XIANGNENG_LLM_MODEL: parsed.XIANGNENG_LLM_MODEL,
    XIANGNENG_LLM_FALLBACK_MODEL: parsed.XIANGNENG_LLM_FALLBACK_MODEL,
    XIANGNENG_LLM_CHAT_MODEL: parsed.XIANGNENG_LLM_CHAT_MODEL,
    XIANGNENG_LLM_API_KEY: parsed.XIANGNENG_LLM_API_KEY,
    AI_MODEL_TIMEOUT_MS: parsed.AI_MODEL_TIMEOUT_MS,
    AI_ACTION_TTL_SECONDS: parsed.AI_ACTION_TTL_SECONDS,
    AI_DEMO_MODE: parsed.AI_DEMO_MODE,
    AI_SKILL_ROOT: resolve(parsed.AI_SKILL_ROOT ?? resolve(repositoryRoot, "skills", "xiangneng-ai-business-assistant"))
  };
}
