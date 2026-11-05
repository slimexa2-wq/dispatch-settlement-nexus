import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  DataScopeType,
  Permission,
  UserRole,
  idSchema,
  type SessionUser
} from "@xiangneng/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";

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

export function auditScopeWhere(user: SessionUser): Prisma.AuditLogWhereInput {
  if (
    user.roles.some((role) =>
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.SYSTEM_ADMIN ||
      role === UserRole.GROUP_LEADER ||
      role === UserRole.HEADQUARTERS_MANAGER
    ) ||
    user.scopeBindings.some((binding) => binding.type === DataScopeType.GROUP)
  ) {
    return {};
  }
  const branchIds = user.scopeBindings
    .filter((binding) => binding.type === DataScopeType.BRANCH)
    .map((binding) => binding.branchId)
    .filter((value): value is string => Boolean(value));
  const projectIds = user.scopeBindings
    .filter((binding) => binding.type === DataScopeType.PROJECT)
    .map((binding) => binding.projectId)
    .filter((value): value is string => Boolean(value));
  const supplierIds = user.scopeBindings
    .filter((binding) => binding.type === DataScopeType.SUPPLIER)
    .map((binding) => binding.supplierId)
    .filter((value): value is string => Boolean(value));
  const conditions: Prisma.AuditLogWhereInput[] = [{ actorId: user.id }];
  for (const branchId of branchIds) {
    conditions.push(
      { actor: { branchId } },
      { before: { path: ["branchId"], equals: branchId } },
      { after: { path: ["branchId"], equals: branchId } }
    );
  }
  for (const projectId of projectIds) {
    conditions.push(
      { before: { path: ["projectId"], equals: projectId } },
      { after: { path: ["projectId"], equals: projectId } }
    );
  }
  for (const supplierId of supplierIds) {
    conditions.push(
      { before: { path: ["supplierId"], equals: supplierId } },
      { after: { path: ["supplierId"], equals: supplierId } }
    );
  }
  return { OR: conditions };
}

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/audit-logs", {
    preHandler: [app.authenticate, app.requirePermission(Permission.AUDIT_READ)]
  }, async (request) => {
    const query = auditQuerySchema.parse(request.query);
    const user = getSession(request);
    const { page, pageSize, skip } = parsePagination(query);
    const where = {
      AND: [auditScopeWhere(user), {
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
      }]
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
