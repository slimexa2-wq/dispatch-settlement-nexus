import type { FastifyInstance } from "fastify";
import {
  DataScopeType,
  Permission,
  idSchema,
  isWithinDataScope
} from "@xiangneng/shared";
import { z } from "zod";
import {
  andWhere,
  internalEmployeeWhere,
  organizationUnitWhere
} from "../data-scope.js";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import {
  deleteInternalEmployee,
  offboardInternalEmployee,
  transferInternalEmployee
} from "../services/internal-employees.js";
import { writeAudit } from "../audit.js";

const employeeStatusSchema = z.enum(["ACTIVE", "DISABLED", "LEFT", "ARCHIVED"]);
const employeeQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  keyword: z.string().trim().max(120).optional(),
  status: employeeStatusSchema.optional(),
  branchId: idSchema.optional(),
  organizationUnitId: idSchema.optional()
});
const employeeCreateSchema = z.object({
  employeeNo: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  phone: z.string().trim().regex(/^1\d{10}$/),
  idCard: z.string().trim().min(15).max(32),
  email: z.string().trim().email().max(200).optional().nullable(),
  userId: idSchema.optional().nullable(),
  legalEntityId: idSchema.optional().nullable(),
  branchId: idSchema.optional().nullable(),
  organizationUnitId: idSchema,
  positionId: idSchema,
  jobGradeId: idSchema.optional().nullable(),
  onboardDate: z.coerce.date(),
  reason: z.string().trim().max(500).optional()
});
const employeePatchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  phone: z.string().trim().regex(/^1\d{10}$/).optional(),
  idCard: z.string().trim().min(15).max(32).optional(),
  email: z.string().trim().email().max(200).optional().nullable(),
  expectedVersion: z.number().int().positive()
}).strict();
const transferSchema = z.object({
  expectedVersion: z.number().int().positive(),
  effectiveDate: z.coerce.date(),
  organizationUnitId: idSchema,
  positionId: idSchema,
  branchId: idSchema.optional().nullable(),
  reason: z.string().trim().min(1).max(500)
});
const offboardSchema = z.object({
  expectedVersion: z.number().int().positive(),
  offboardDate: z.coerce.date(),
  reason: z.string().trim().min(1).max(500)
});

const employeeInclude = {
  legalEntity: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, name: true } },
  organizationUnit: { select: { id: true, code: true, name: true, type: true } },
  position: { select: { id: true, code: true, name: true } },
  jobGrade: { select: { id: true, code: true, name: true, level: true } },
  employments: {
    include: {
      legalEntity: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      organizationUnit: { select: { id: true, name: true } },
      position: { select: { id: true, name: true } },
      jobGrade: { select: { id: true, name: true } }
    },
    orderBy: { startedAt: "desc" as const }
  },
  changes: {
    orderBy: [{ effectiveAt: "desc" as const }, { createdAt: "desc" as const }],
    take: 100
  }
};

export async function internalEmployeeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/organization/tree", {
    preHandler: [app.authenticate, app.requirePermission(Permission.ORG_READ)]
  }, async (request) => {
    const user = getSession(request);
    const items = await app.prisma.organizationUnit.findMany({
      where: andWhere(organizationUnitWhere(user), { isActive: true }),
      include: {
        legalEntity: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, name: true } }
      },
      orderBy: [{ path: "asc" }, { sortOrder: "asc" }]
    });
    return success(request, items);
  });

  app.get("/organization/options", {
    preHandler: [app.authenticate, app.requirePermission(Permission.ORG_READ)]
  }, async (request) => {
    const user = getSession(request);
    const organizationUnits = await app.prisma.organizationUnit.findMany({
      where: andWhere(organizationUnitWhere(user), { isActive: true }),
      orderBy: [{ path: "asc" }, { sortOrder: "asc" }]
    });
    const organizationUnitIds = organizationUnits.map((unit) => unit.id);
    const legalEntityIds = [
      ...new Set(organizationUnits.map((unit) => unit.legalEntityId).filter((id): id is string => Boolean(id)))
    ];
    const branchIds = [
      ...new Set(organizationUnits.map((unit) => unit.branchId).filter((id): id is string => Boolean(id)))
    ];
    const [legalEntities, branches, positions, jobGrades] = await Promise.all([
      app.prisma.legalEntity.findMany({
        where: { isActive: true, id: { in: legalEntityIds } },
        orderBy: { name: "asc" }
      }),
      app.prisma.branch.findMany({
        where: { id: { in: branchIds } },
        orderBy: { name: "asc" }
      }),
      app.prisma.position.findMany({
        where: {
          isActive: true,
          organizationUnitId: { in: organizationUnitIds }
        },
        orderBy: { name: "asc" }
      }),
      app.prisma.jobGrade.findMany({
        where: { isActive: true },
        orderBy: { level: "asc" }
      })
    ]);
    return success(request, {
      legalEntities,
      branches,
      organizationUnits,
      positions,
      jobGrades
    });
  });

  app.get("/internal-employees", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.INTERNAL_EMPLOYEE_READ)
    ]
  }, async (request) => {
    const query = employeeQuerySchema.parse(request.query);
    const user = getSession(request);
    const { page, pageSize, skip } = parsePagination(query);
    const where = andWhere(internalEmployeeWhere(user), {
      status: query.status,
      branchId: query.branchId,
      organizationUnitId: query.organizationUnitId,
      OR: query.keyword
        ? [
            { name: { contains: query.keyword, mode: "insensitive" as const } },
            { employeeNo: { contains: query.keyword, mode: "insensitive" as const } },
            { phone: { contains: query.keyword } },
            { idCard: { contains: query.keyword, mode: "insensitive" as const } }
          ]
        : undefined
    });
    const [items, total] = await app.prisma.$transaction([
      app.prisma.internalEmployee.findMany({
        where,
        include: {
          legalEntity: { select: { id: true, code: true, name: true } },
          branch: { select: { id: true, name: true } },
          organizationUnit: { select: { id: true, code: true, name: true, type: true } },
          position: { select: { id: true, code: true, name: true } },
          jobGrade: { select: { id: true, code: true, name: true, level: true } }
        },
        orderBy: [{ status: "asc" }, { employeeNo: "asc" }],
        skip,
        take: pageSize
      }),
      app.prisma.internalEmployee.count({ where })
    ]);
    return success(request, {
      items,
      pagination: paginationMeta(page, pageSize, total)
    });
  });

  app.get("/internal-employees/:id", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.INTERNAL_EMPLOYEE_READ)
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    const employee = await app.prisma.internalEmployee.findFirst({
      where: andWhere(internalEmployeeWhere(user), { id }),
      include: employeeInclude
    });
    if (!employee) notFound("内部员工");
    return success(request, employee);
  });

  app.post("/internal-employees", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.INTERNAL_EMPLOYEE_WRITE)
    ]
  }, async (request, reply) => {
    const input = employeeCreateSchema.parse(request.body);
    const user = getSession(request);
    const allowedByScope = isWithinDataScope(
      {
        userId: user.id,
        roles: user.roles,
        bindings: user.scopeBindings.map((binding) => ({
          type: binding.type,
          entityId:
            binding.type === DataScopeType.BRANCH
              ? binding.branchId
              : binding.type === DataScopeType.PROJECT
                ? binding.projectId
                : binding.type === DataScopeType.SUPPLIER
                  ? binding.supplierId
                  : binding.organizationUnitId
        }))
      },
      {
        branchId: input.branchId,
        orgUnitIds: [input.organizationUnitId]
      }
    );
    if (!allowedByScope) {
      throw new AppError(403, "OUT_OF_SCOPE", "不能在当前数据范围外创建员工");
    }
    const allowed = await app.prisma.organizationUnit.findFirst({
      where: {
        id: input.organizationUnitId,
        isActive: true,
        branchId: input.branchId ?? undefined
      }
    });
    if (!allowed) {
      throw new AppError(403, "OUT_OF_SCOPE", "组织范围不允许或组织单元不存在");
    }
    const employee = await app.prisma.$transaction(async (tx) => {
      const created = await tx.internalEmployee.create({
        data: {
          employeeNo: input.employeeNo,
          name: input.name,
          phone: input.phone,
          idCard: input.idCard.toUpperCase(),
          email: input.email,
          userId: input.userId,
          legalEntityId: input.legalEntityId,
          branchId: input.branchId,
          organizationUnitId: input.organizationUnitId,
          positionId: input.positionId,
          jobGradeId: input.jobGradeId,
          onboardDate: input.onboardDate
        }
      });
      await tx.internalEmployment.create({
        data: {
          employeeId: created.id,
          legalEntityId: input.legalEntityId,
          branchId: input.branchId,
          organizationUnitId: input.organizationUnitId,
          positionId: input.positionId,
          jobGradeId: input.jobGradeId,
          startedAt: input.onboardDate,
          reason: input.reason ?? "入职",
          isPrimary: true
        }
      });
      await tx.internalEmployeeChange.create({
        data: {
          employeeId: created.id,
          actorId: user.id,
          type: "ONBOARD",
          effectiveAt: input.onboardDate,
          reason: input.reason ?? "入职",
          after: {
            status: "ACTIVE",
            organizationUnitId: input.organizationUnitId,
            positionId: input.positionId,
            branchId: input.branchId
          }
        }
      });
      return created;
    });
    await writeAudit(app.prisma, request, {
      action: "INTERNAL_EMPLOYEE_CREATE",
      resourceType: "InternalEmployee",
      resourceId: employee.id,
      after: {
        employeeNo: employee.employeeNo,
        name: employee.name,
        branchId: employee.branchId,
        organizationUnitId: employee.organizationUnitId
      }
    });
    return reply.status(201).send(success(request, employee));
  });

  app.patch("/internal-employees/:id", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.INTERNAL_EMPLOYEE_WRITE)
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = employeePatchSchema.parse(request.body);
    const user = getSession(request);
    const existing = await app.prisma.internalEmployee.findFirst({
      where: andWhere(internalEmployeeWhere(user), { id })
    });
    if (!existing) notFound("内部员工");
    if (existing.version !== input.expectedVersion) {
      throw new AppError(409, "STALE_EMPLOYEE_VERSION", "员工档案已更新，请刷新后重试");
    }
    const { expectedVersion, ...data } = input;
    const updated = await app.prisma.internalEmployee.update({
      where: { id_version: { id, version: expectedVersion } },
      data: {
        ...data,
        idCard: data.idCard?.toUpperCase(),
        version: { increment: 1 }
      }
    });
    await writeAudit(app.prisma, request, {
      action: "INTERNAL_EMPLOYEE_UPDATE",
      resourceType: "InternalEmployee",
      resourceId: id,
      before: {
        name: existing.name,
        phone: existing.phone,
        status: existing.status,
        version: existing.version
      },
      after: {
        name: updated.name,
        phone: updated.phone,
        status: updated.status,
        version: updated.version
      }
    });
    return success(request, updated);
  });

  app.post("/internal-employees/:id/transfer", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.INTERNAL_EMPLOYEE_TRANSFER)
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = transferSchema.parse(request.body);
    const user = getSession(request);
    const scoped = await app.prisma.internalEmployee.findFirst({
      where: andWhere(internalEmployeeWhere(user), { id }),
      select: { id: true }
    });
    if (!scoped) notFound("内部员工");
    const targetWithinScope = isWithinDataScope(
      {
        userId: user.id,
        roles: user.roles,
        bindings: user.scopeBindings.map((binding) => ({
          type: binding.type,
          entityId:
            binding.type === DataScopeType.BRANCH
              ? binding.branchId
              : binding.organizationUnitId
        }))
      },
      {
        branchId: input.branchId,
        orgUnitIds: [input.organizationUnitId]
      }
    );
    if (!targetWithinScope) {
      throw new AppError(403, "OUT_OF_SCOPE", "不能把员工调入当前登录态数据范围之外");
    }
    const target = await app.prisma.organizationUnit.findFirst({
      where: {
        id: input.organizationUnitId,
        isActive: true,
        branchId: input.branchId ?? undefined,
        positions: { some: { id: input.positionId, isActive: true } }
      },
      select: { id: true }
    });
    if (!target) {
      throw new AppError(400, "INVALID_TRANSFER_TARGET", "目标组织或岗位不存在、已停用或归属不一致");
    }
    const result = await transferInternalEmployee(app.prisma, {
      employeeId: id,
      actorId: user.id,
      ...input
    });
    return success(request, result);
  });

  app.post("/internal-employees/:id/offboard", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.INTERNAL_EMPLOYEE_OFFBOARD)
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = offboardSchema.parse(request.body);
    const user = getSession(request);
    const scoped = await app.prisma.internalEmployee.findFirst({
      where: andWhere(internalEmployeeWhere(user), { id }),
      select: { id: true }
    });
    if (!scoped) notFound("内部员工");
    const result = await offboardInternalEmployee(app.prisma, {
      employeeId: id,
      actorId: user.id,
      ...input
    });
    return success(request, result);
  });

  app.delete("/internal-employees/:id", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.INTERNAL_EMPLOYEE_DELETE)
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    const scoped = await app.prisma.internalEmployee.findFirst({
      where: andWhere(internalEmployeeWhere(user), { id }),
      select: { id: true }
    });
    if (!scoped) notFound("内部员工");
    await deleteInternalEmployee(app.prisma, {
      employeeId: id,
      actorId: user.id
    });
    await writeAudit(app.prisma, request, {
      action: "INTERNAL_EMPLOYEE_DELETE",
      resourceType: "InternalEmployee",
      resourceId: id,
      before: { id }
    });
    return success(request, { id, deleted: true });
  });
}
