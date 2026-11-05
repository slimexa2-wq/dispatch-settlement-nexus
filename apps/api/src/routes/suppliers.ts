import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Permission, UserRole, idSchema, supplierSchema, type SessionUser } from "@xiangneng/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { writeAudit } from "../audit.js";
import { andWhere, projectWhere } from "../data-scope.js";
import { getSession } from "../plugins/auth.js";

const supplierQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  keyword: z.string().trim().max(200).optional(),
  level: z.string().trim().max(32).optional(),
  isActive: z.enum(["true", "false"]).optional()
});

function hasRestrictedProjectScope(user: SessionUser): boolean {
  return user.role === UserRole.BRANCH_MANAGER || user.role === UserRole.PROJECT_OPERATOR;
}

function supplierWhere(user: SessionUser): Prisma.SupplierWhereInput {
  return hasRestrictedProjectScope(user)
    ? { projectLinks: { some: { project: projectWhere(user) } } }
    : {};
}

function supplierInclude(user: SessionUser) {
  const restricted = hasRestrictedProjectScope(user);
  const visibleProject = projectWhere(user);
  return {
    projectLinks: {
      where: restricted ? { project: visibleProject } : undefined,
      include: { project: { select: { id: true, name: true, branchId: true } } }
    },
    _count: {
      select: {
        people: { where: restricted ? { project: visibleProject } : undefined },
        policies: { where: restricted ? { project: visibleProject } : undefined }
      }
    }
  };
}

export async function supplierRoutes(app: FastifyInstance): Promise<void> {
  app.get("/suppliers", {
    preHandler: [app.authenticate, app.requirePermission(Permission.SUPPLIER_READ)]
  }, async (request) => {
    const query = supplierQuerySchema.parse(request.query);
    const user = getSession(request);
    const { page, pageSize, skip } = parsePagination(query);
    const where = andWhere<Prisma.SupplierWhereInput>(supplierWhere(user), {
      name: query.keyword ? { contains: query.keyword, mode: "insensitive" as const } : undefined,
      level: query.level,
      isActive: query.isActive === undefined ? undefined : query.isActive === "true"
    });
    const [items, total] = await app.prisma.$transaction([
      app.prisma.supplier.findMany({ where, include: supplierInclude(user), orderBy: { name: "asc" }, skip, take: pageSize }),
      app.prisma.supplier.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.get("/suppliers/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.SUPPLIER_READ)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    const supplier = await app.prisma.supplier.findFirst({ where: andWhere<Prisma.SupplierWhereInput>(supplierWhere(user), { id }), include: supplierInclude(user) });
    if (!supplier) notFound("供应商");
    const visiblePerson = hasRestrictedProjectScope(user) ? { project: projectWhere(user) } : {};
    const [registered, arrived, passed, onboarded, active, left] = await Promise.all([
      app.prisma.person.count({ where: { supplierId: id, ...visiblePerson } }),
      app.prisma.person.count({ where: { supplierId: id, ...visiblePerson, interviewStatus: "ARRIVED" } }),
      app.prisma.person.count({ where: { supplierId: id, ...visiblePerson, interviewStatus: "PASSED" } }),
      app.prisma.person.count({ where: { supplierId: id, ...visiblePerson, onboardDate: { not: null } } }),
      app.prisma.person.count({ where: { supplierId: id, ...visiblePerson, status: "ACTIVE" } }),
      app.prisma.person.count({ where: { supplierId: id, ...visiblePerson, status: "LEFT" } })
    ]);
    return success(request, { ...supplier, statistics: { registered, arrived, passed, onboarded, active, left } });
  });

  app.post("/suppliers", {
    preHandler: [app.authenticate, app.requirePermission(Permission.SUPPLIER_WRITE)]
  }, async (request, reply) => {
    const input = supplierSchema.parse(request.body);
    const supplier = await app.prisma.supplier.create({
      data: {
        name: input.name,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        level: input.level,
        projectLinks: { create: input.projectIds.map((projectId) => ({ projectId })) }
      },
      include: supplierInclude(getSession(request))
    });
    await writeAudit(app.prisma, request, {
      action: "SUPPLIER_CREATE",
      resourceType: "Supplier",
      resourceId: supplier.id,
      after: { name: supplier.name, level: supplier.level }
    });
    return reply.status(201).send(success(request, supplier));
  });

  app.patch("/suppliers/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.SUPPLIER_WRITE)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = supplierSchema.partial().parse(request.body);
    const existing = await app.prisma.supplier.findUnique({ where: { id } });
    if (!existing) notFound("供应商");
    const supplier = await app.prisma.supplier.update({
      where: { id },
      data: {
        name: input.name,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        level: input.level,
        projectLinks: input.projectIds
          ? { deleteMany: {}, create: input.projectIds.map((projectId) => ({ projectId })) }
          : undefined
      },
      include: supplierInclude(getSession(request))
    });
    await writeAudit(app.prisma, request, {
      action: "SUPPLIER_UPDATE",
      resourceType: "Supplier",
      resourceId: id,
      before: { name: existing.name, level: existing.level },
      after: { name: supplier.name, level: supplier.level }
    });
    return success(request, supplier);
  });
}
