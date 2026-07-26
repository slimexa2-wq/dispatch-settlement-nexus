import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { UserRole } from "@xiangneng/shared";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  createPrismaMock,
  login,
  passwordHash,
  testConfig,
  userFixture
} from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("本地模型职责边界", () => {
  it("未命中业务能力时模型只做一次意图判断，不生成自由对话或业务答案", async () => {
    let modelCalls = 0;
    const modelServer = createServer((_request, response) => {
      modelCalls += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        message: {
          content: modelCalls === 1
            ? JSON.stringify({ skill: "unsupported" })
            : "这是一段不应由模型生成的自由回答"
        }
      }));
    });
    await new Promise<void>((resolve) => modelServer.listen(0, "127.0.0.1", resolve));
    const address = modelServer.address();
    if (!address || typeof address === "string") throw new Error("model test server did not bind");

    try {
      const user = userFixture({
        username: "admin",
        role: UserRole.SYSTEM_ADMIN,
        passwordHash: await passwordHash()
      });
      const prisma = createPrismaMock({
        user: { findUnique: async () => user },
        auditLog: { create: async () => ({ id: "audit" }) },
        project: { findMany: async () => [] }
      });
      const app = await buildTestApp(prisma, {
        ...testConfig,
        XIANGNENG_LLM_PROVIDER: "ollama",
        XIANGNENG_LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        XIANGNENG_LLM_MODEL: "qwen3.5:4b",
        XIANGNENG_LLM_FALLBACK_MODEL: "qwen3.5:4b",
        XIANGNENG_LLM_CHAT_MODEL: "qwen3.5:4b"
      });
      apps.push(app);
      const token = await login(app, "admin");

      const response = await app.inject({
        method: "POST",
        url: "/api/ai/chat",
        headers: { authorization: `Bearer ${token}` },
        payload: { message: "请讲一个笑话" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          type: "clarification",
          skill: "unsupported",
          route_type: "form"
        }
      });
      expect(modelCalls).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        modelServer.close((error) => error ? reject(error) : resolve())
      );
    }
  });
});
