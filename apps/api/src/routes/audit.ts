import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Permission, idSchema } from "@xiangneng/shared";
import { paginationMeta, parsePagination, success } from "../http.js";

const auditQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  actorId: idSchema.optional(),
  resourceType: z.string().trim().max(100).optional(),
  resourceId: z.string().trim().max(128).optional(),
  action: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
  ,keyword: z.string().trim().max(100).optional()
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/audit-logs", {
    preHandler: [app.authenticate, app.requirePermission(Permission.AUDIT_READ)]
  }, async (request) => {
    const query = auditQuerySchema.parse(request.query);
    const { page, pageSize, skip } = parsePagination(query);
    const where = {
      actorId: query.actorId,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      action: query.action,
      OR: query.keyword ? [
        { action: { contains: query.keyword, mode: "insensitive" as const } },
        { resourceType: { contains: query.keyword, mode: "insensitive" as const } },
        { resourceId: { contains: query.keyword, mode: "insensitive" as const } },
        { actor: { displayName: { contains: query.keyword, mode: "insensitive" as const } } }
      ] : undefined,
      createdAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined
    };
    const [items, total] = await app.prisma.$transaction([
      app.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, displayName: true, username: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      app.prisma.auditLog.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });
}
