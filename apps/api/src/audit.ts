import type { FastifyRequest } from "fastify";
import type { PrismaClient, Prisma } from "./generated/prisma/client.js";

type AuditClient = Pick<PrismaClient, "auditLog"> | Pick<Prisma.TransactionClient, "auditLog">;

export async function writeAudit(
  db: AuditClient,
  request: FastifyRequest,
  input: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    before?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    after?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }
): Promise<void> {
  const userAgentHeader = request.headers["user-agent"];
  await db.auditLog.create({
    data: {
      actorId: request.sessionUser?.id ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      before: input.before,
      after: input.after,
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgentHeader) ? userAgentHeader.join(", ") : userAgentHeader
    }
  });
}
