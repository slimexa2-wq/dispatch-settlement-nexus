import type { FastifyInstance } from "fastify";
import { hash } from "bcryptjs";
import { z } from "zod";
import {
  Permission,
  UserRole,
  idSchema,
  rolePermissions,
  userCreateSchema
} from "@xiangneng/shared";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { writeAudit } from "../audit.js";

const userQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  role: z.nativeEnum(UserRole).optional(),
  keyword: z.string().trim().max(64).optional()
});

const managedUserCreateSchema = userCreateSchema.extend({
  employeeType: z.string().trim().min(1).max(64).optional().nullable()
});

const userUpdateSchema = managedUserCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(128).optional()
});

function validateScope(input: {
  role?: (typeof UserRole)[keyof typeof UserRole];
  branchId?: string | null;
  supplierId?: string | null;
  personId?: string | null;
  projectIds?: string[];
}): void {
  if (input.role === UserRole.BRANCH_MANAGER && !input.branchId) {
    throw new AppError(400, "SCOPE_REQUIRED", "分子公司负责人必须绑定分子公司");
  }
  if (input.role === UserRole.PROJECT_OPERATOR && !input.projectIds?.length) {
    throw new AppError(400, "SCOPE_REQUIRED", "项目运营人员必须至少绑定一个项目");
  }
  if (input.role === UserRole.SUPPLIER && !input.supplierId) {
    throw new AppError(400, "SCOPE_REQUIRED", "供应商账号必须绑定供应商");
  }
  if ((input.role === UserRole.EMPLOYEE || input.role === UserRole.JOB_SEEKER) && !input.personId) {
    throw new AppError(400, "SCOPE_REQUIRED", "员工或求职者账号必须绑定人员档案");
  }
}

function publicUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  branchId: string | null;
  supplierId: string | null;
  personId: string | null;
  employeeType: string | null;
  isActive: boolean;
  createdAt: Date;
  projectLinks: Array<{ projectId: string }>;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    branchId: user.branchId,
    supplierId: user.supplierId,
    personId: user.personId,
    employeeType: user.employeeType,
    isActive: user.isActive,
    createdAt: user.createdAt,
    projectIds: user.projectLinks.map((link) => link.projectId),
    permissions: rolePermissions[user.role]
  };
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const guards = [app.authenticate, app.requirePermission(Permission.USER_MANAGE)];

  app.get("/users", { preHandler: guards }, async (request) => {
    const query = userQuerySchema.parse(request.query);
    const { page, pageSize, skip } = parsePagination(query);
    const where = {
      role: query.role,
      OR: query.keyword
        ? [
            { username: { contains: query.keyword, mode: "insensitive" as const } },
            { displayName: { contains: query.keyword, mode: "insensitive" as const } }
          ]
        : undefined
    };
    const [items, total] = await app.prisma.$transaction([
      app.prisma.user.findMany({
        where,
        include: { projectLinks: { select: { projectId: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      app.prisma.user.count({ where })
    ]);
    return success(request, {
      items: items.map(publicUser),
      pagination: paginationMeta(page, pageSize, total)
    });
  });

  app.post("/users", { preHandler: guards }, async (request, reply) => {
    const input = managedUserCreateSchema.parse(request.body);
    validateScope(input);
    const user = await app.prisma.user.create({
      data: {
        username: input.username,
        passwordHash: await hash(input.password, 12),
        displayName: input.displayName,
        role: input.role,
        branchId: input.branchId,
        supplierId: input.supplierId,
        personId: input.personId,
        employeeType: input.employeeType,
        projectLinks: { create: input.projectIds.map((projectId) => ({ projectId })) }
      },
      include: { projectLinks: { select: { projectId: true } } }
    });
    await writeAudit(app.prisma, request, {
      action: "USER_CREATE",
      resourceType: "User",
      resourceId: user.id,
      after: { username: user.username, role: user.role, isActive: user.isActive }
    });
    return reply.status(201).send(success(request, publicUser(user)));
  });

  app.patch("/users/:id", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = userUpdateSchema.parse(request.body);
    const existing = await app.prisma.user.findUnique({
      where: { id },
      include: { projectLinks: { select: { projectId: true } } }
    });
    if (!existing) notFound("用户");
    validateScope({
      role: input.role ?? existing.role,
      branchId: input.branchId === undefined ? existing.branchId : input.branchId,
      supplierId: input.supplierId === undefined ? existing.supplierId : input.supplierId,
      personId: input.personId === undefined ? existing.personId : input.personId,
      projectIds: input.projectIds ?? existing.projectLinks.map((link) => link.projectId)
    });
    const passwordHash = input.password ? await hash(input.password, 12) : undefined;
    const user = await app.prisma.user.update({
      where: { id },
      data: {
        username: input.username,
        passwordHash,
        displayName: input.displayName,
        role: input.role,
        branchId: input.branchId,
        supplierId: input.supplierId,
        personId: input.personId,
        employeeType: input.employeeType,
        isActive: input.isActive,
        tokenVersion: input.password || input.isActive === false ? { increment: 1 } : undefined,
        projectLinks: input.projectIds
          ? { deleteMany: {}, create: input.projectIds.map((projectId) => ({ projectId })) }
          : undefined
      },
      include: { projectLinks: { select: { projectId: true } } }
    });
    await writeAudit(app.prisma, request, {
      action: "USER_UPDATE",
      resourceType: "User",
      resourceId: id,
      before: { role: existing.role, isActive: existing.isActive },
      after: { role: user.role, isActive: user.isActive }
    });
    return success(request, publicUser(user));
  });
}
