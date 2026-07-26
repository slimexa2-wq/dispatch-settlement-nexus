import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { hash } from "bcryptjs";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import type { AppConfig } from "../src/config.js";
import type { FileStore, SavedFile } from "../src/files.js";
import { buildApp } from "../src/app.js";

type MockMethod = (...args: unknown[]) => unknown;
type DelegateOverrides = Record<string, Record<string, MockMethod>>;

const defaultFileStore: FileStore = {
  async save(input): Promise<SavedFile> {
    input.stream.resume();
    return {
      storageKey: randomUUID(),
      originalName: input.filename,
      mimeType: input.mimeType,
      sizeBytes: 0,
      sha256: "0".repeat(64)
    };
  },
  async open(): Promise<Readable> {
    throw new Error("test file not configured");
  },
  async remove(): Promise<void> {}
};

export const testConfig: AppConfig = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: 3100,
  ADMIN_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  JWT_SECRET: "test-only-secret-with-at-least-thirty-two-characters",
  JWT_EXPIRES_IN: "1h",
  UPLOAD_DIR: "./test-uploads",
  MAX_UPLOAD_BYTES: 1024 * 1024,
  FILE_STORAGE_DRIVER: "local",
  WECHAT_MINIAPP_PATH: "/pages/index/index",
  XIANGNENG_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
  XIANGNENG_LLM_MODEL: "qwen3.5:4b",
  XIANGNENG_LLM_API_KEY: "test-local",
  AI_MODEL_TIMEOUT_MS: 1000,
  AI_ACTION_TTL_SECONDS: 600,
  AI_DEMO_MODE: true,
  AI_SKILL_ROOT: fileURLToPath(new URL("../../../skills/xiangneng-ai-business-assistant", import.meta.url))
};

export function createPrismaMock(overrides: DelegateOverrides = {}): PrismaClient {
  let client: Record<string, unknown>;
  const delegateCache = new Map<string, Record<string, MockMethod>>();
  const defaultDelegate = (name: string): Record<string, MockMethod> => {
    const cached = delegateCache.get(name);
    if (cached) return cached;
    const delegate = new Proxy<Record<string, MockMethod>>({}, {
      get(_target, methodName) {
        const method = String(methodName);
        const override = overrides[name]?.[method];
        if (override) return override;
        if (method === "findMany") return async () => [];
        if (method === "findFirst" || method === "findUnique") return async () => null;
        if (method === "count") return async () => 0;
        if (method === "create") return async (args: unknown) => {
          const data = (args as { data?: Record<string, unknown> })?.data ?? {};
          return { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
        };
        if (method === "update") return async (args: unknown) => {
          const data = (args as { data?: Record<string, unknown>; where?: Record<string, unknown> })?.data ?? {};
          return { id: (args as { where?: { id?: string } }).where?.id ?? randomUUID(), updatedAt: new Date(), ...data };
        };
        if (method === "upsert") return async (args: unknown) => {
          const data = (args as { create?: Record<string, unknown> })?.create ?? {};
          return { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
        };
        if (method === "createMany" || method === "updateMany" || method === "deleteMany") return async () => ({ count: 0 });
        if (method === "delete") return async (args: unknown) => args;
        return async () => undefined;
      }
    });
    delegateCache.set(name, delegate);
    return delegate;
  };
  client = new Proxy<Record<string, unknown>>({}, {
    get(_target, property) {
      const name = String(property);
      if (name === "$transaction") {
        return async (input: unknown) => {
          if (Array.isArray(input)) return Promise.all(input);
          if (typeof input === "function") return (input as (tx: unknown) => unknown)(client);
          return input;
        };
      }
      if (name === "$queryRaw") return async () => [{ "?column?": 1 }];
      if (name === "$disconnect") return async () => undefined;
      return defaultDelegate(name);
    }
  });
  return client as unknown as PrismaClient;
}

export async function buildTestApp(
  prisma: PrismaClient,
  config: AppConfig = testConfig,
  fileStore: FileStore = defaultFileStore
): Promise<FastifyInstance> {
  return buildApp({ config, prisma, fileStore, logger: false });
}

export async function passwordHash(password = "Password123!"): Promise<string> {
  return hash(password, 4);
}

export function userFixture(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    username: "admin",
    passwordHash: "",
    displayName: "测试管理员",
    role: "SYSTEM_ADMIN",
    branchId: null,
    supplierId: null,
    personId: null,
    employeeType: null,
    isActive: true,
    tokenVersion: 0,
    projectLinks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...input
  };
}

export async function login(app: FastifyInstance, username = "admin", password = "Password123!"): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username, password } });
  if (response.statusCode !== 200) throw new Error(`login failed: ${response.body}`);
  return (response.json() as { data: { token: string } }).data.token;
}
