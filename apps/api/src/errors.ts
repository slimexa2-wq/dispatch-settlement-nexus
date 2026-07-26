import type { FastifyError, FastifyInstance } from "fastify";
import { Prisma } from "./generated/prisma/client.js";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(resource = "资源"): never {
  throw new AppError(404, "NOT_FOUND", `${resource}不存在或无权访问`);
}

export function conflict(message: string, details?: unknown): never {
  throw new AppError(409, "CONFLICT", message, details);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
        requestId: request.id
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数校验失败",
          details: error.flatten()
        },
        requestId: request.id
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return reply.status(409).send({
          error: { code: "DUPLICATE", message: "数据已存在，不能重复创建", details: error.meta },
          requestId: request.id
        });
      }
      if (error.code === "P2003") {
        return reply.status(400).send({
          error: { code: "INVALID_RELATION", message: "关联数据不存在或不能删除", details: error.meta },
          requestId: request.id
        });
      }
    }
    request.log.error({ err: error }, "request failed");
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "服务器处理失败" },
      requestId: request.id
    });
  });
}
