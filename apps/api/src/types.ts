import type { PrismaClient } from "./generated/prisma/client.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permission, SessionUser } from "@xiangneng/shared";
import type { AppConfig } from "./config.js";
import type { FileStore } from "./files.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
    fileStore: FileStore;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      permission: Permission
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    sessionUser: SessionUser | null;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; tokenVersion: number };
    user: { sub: string; tokenVersion: number };
  }
}
