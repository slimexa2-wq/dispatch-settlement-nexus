import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { PrismaClient } from "./generated/prisma/client.js";
import type { AppConfig } from "./config.js";
import { CosFileStore, DiskFileStore, type FileStore } from "./files.js";
import { registerErrorHandler } from "./errors.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { auditRoutes } from "./routes/audit.js";
import { projectRoutes } from "./routes/projects.js";
import { supplierRoutes } from "./routes/suppliers.js";
import { policyRoutes } from "./routes/policies.js";
import { peopleRoutes } from "./routes/people.js";
import { applicationRoutes } from "./routes/applications.js";
import { referralRoutes } from "./routes/referrals.js";
import { jobRoutes } from "./routes/jobs.js";
import { statisticsRoutes } from "./routes/statistics.js";
import { importRoutes } from "./routes/imports.js";
import { salaryRoutes } from "./routes/salary.js";
import { notificationRoutes } from "./routes/notifications.js";
import { aiRoutes } from "./routes/ai.js";
import { portalRoutes } from "./routes/portal.js";
import { internalEmployeeRoutes } from "./routes/internal-employees.js";
import { reimbursementRoutes } from "./routes/reimbursements.js";
import { leadershipRoutes } from "./routes/leadership.js";
import "./types.js";

export type BuildAppOptions = {
  config: AppConfig;
  prisma?: PrismaClient;
  fileStore?: FileStore;
  logger?: FastifyServerOptions["logger"];
};

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? options.config.NODE_ENV !== "test",
    trustProxy: true,
    requestIdHeader: "x-request-id"
  });
  const ownsPrisma = !options.prisma;
  const prisma = options.prisma ?? new PrismaClient({ datasourceUrl: options.config.DATABASE_URL });
  app.decorate("prisma", prisma);
  app.decorate("config", options.config);
  let fileStore = options.fileStore;
  if (!fileStore) {
    if (options.config.FILE_STORAGE_DRIVER === "cos") {
      if (
        !options.config.COS_REGION ||
        !options.config.COS_BUCKET ||
        !options.config.COS_SECRET_ID ||
        !options.config.COS_SECRET_KEY
      ) {
        throw new Error(
          "FILE_STORAGE_DRIVER=cos 时必须配置 COS_REGION、COS_BUCKET、COS_SECRET_ID、COS_SECRET_KEY"
        );
      }
      fileStore = new CosFileStore({
        region: options.config.COS_REGION,
        bucket: options.config.COS_BUCKET,
        secretId: options.config.COS_SECRET_ID,
        secretKey: options.config.COS_SECRET_KEY,
        endpoint: options.config.COS_ENDPOINT,
        maxBytes: options.config.MAX_UPLOAD_BYTES
      });
    } else {
      fileStore = new DiskFileStore(
        options.config.UPLOAD_DIR,
        options.config.MAX_UPLOAD_BYTES
      );
    }
  }
  app.decorate("fileStore", fileStore);

  await app.register(cors, {
    origin: options.config.ADMIN_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true
  });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { files: 1, fileSize: options.config.MAX_UPLOAD_BYTES, fields: 10 }
  });
  await app.register(authPlugin);
  registerErrorHandler(app);

  app.get("/health", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "ok" };
    } catch {
      return reply.status(503).send({ status: "degraded", database: "unavailable" });
    }
  });

  await app.register(async (api) => {
    await authRoutes(api);
    await userRoutes(api);
    await auditRoutes(api);
    await projectRoutes(api);
    await supplierRoutes(api);
    await policyRoutes(api);
    await peopleRoutes(api);
    await applicationRoutes(api);
    await referralRoutes(api);
    await jobRoutes(api);
    await statisticsRoutes(api);
    await importRoutes(api);
    await salaryRoutes(api);
    await notificationRoutes(api);
    await aiRoutes(api);
    await portalRoutes(api);
    await internalEmployeeRoutes(api);
    await reimbursementRoutes(api);
    await leadershipRoutes(api);
  }, { prefix: "/api" });

  // 单服务部署：API 进程同时托管门户生产构建（Render Web Service 即如此）。
  // 守卫：portal/dist 不存在时（本地 dev 走 Vite 代理）不注册，避免影响 tsx watch 开发模式。
  const portalDistDir = resolve(fileURLToPath(new URL("../../../", import.meta.url)), "apps", "portal", "dist");
  if (existsSync(portalDistDir)) {
    await app.register(fastifyStatic, { root: portalDistDir });
    // SPA 回退：非 /api 路由兜底 index.html；/api 未知路径仍返回 JSON 404，不误入门户。
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api")) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "资源不存在" } });
      }
      return reply.sendFile("index.html");
    });
  }

  if (ownsPrisma) {
    app.addHook("onClose", async () => prisma.$disconnect());
  }
  return app;
}
