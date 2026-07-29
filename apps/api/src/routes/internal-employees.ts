import type { FastifyInstance } from "fastify";
import {
  Permission,
  UserRole,
  idSchema
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
  bindInternalEmployeeAccount,
  deleteInternalEmployee,
  offboardInternalEmployee,
  transferInternalEmployee
} from "../services/internal-employees.js";
import { writeAudit } from "../audit.js";
import { authorizationForPermission } from "../authorization.js";
import {
  assertPositionRoleBindingsAssignable,
  clearPositionAuthorizations,
  syncPositionAuthorizations,
  type PositionAuthorizationDb
} from "../services/position-authorizations.js";


const positionAssignableRoles = [
  UserRole.GROUP_LEADER,
  UserRole.HEADQUARTERS_MANAGER,
  UserRole.DEPARTMENT_MANAGER,
  UserRole.INTERNAL_HR,
  UserRole.RECRUITER,
  UserRole.PROJECT_OPERATOR,
  UserRole.RESOURCE_SPECIALIST,
  UserRole.FINANCE_REVIEWER,
  UserRole.CASHIER,
  UserRole.DEPARTMENT_REIMBURSEMENT_CLERK,
  UserRole.EMPLOYEE
] as const;
const positionAssignableRoleSet = new Set<UserRole>(positionAssignableRoles);
const jobGradeApprovalPolicySchema = z.object({
  maxReimbursementApprovalCents: z.number().int().positive().nullable()
});

const employeeStatusSchema = z.enum(["ACTIVE", "DISABLED", "LEFT", "ARCHIVED"]);
const employeeQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  keyword: z.string().trim().max(120).optional(),
  status: employeeStatusSchema.optional(),
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
  jobGradeId: idSchema.optional().nullable(),
  reason: z.string().trim().min(1).max(500)
});
const offboardSchema = z.object({
  expectedVersion: z.number().int().positive(),
  offboardDate: z.coerce.date(),
  reason: z.string().trim().min(1).max(500)
});
const accountBindingSchema = z.object({
  expectedVersion: z.number().int().positive(),
  userId: idSchema.nullable()
});
const positionScopeSchema = z.enum(["SELF", "ORG_UNIT", "CENTER", "GROUP"]);
const visibleOrganizationTypes = [
  "GROUP",
  "LEADERSHIP",
  "CENTER",
  "DEPARTMENT",
  "BUSINESS_DEPARTMENT",
  "BRANCH",
  "SUBSIDIARY",
  "OTHER"
] as const;
const assignableOrganizationTypes = visibleOrganizationTypes.filter((type) => type !== "GROUP");

const positionRoleBindingsSchema = z.object({
  bindings: z.array(z.object({
    roleCode: z.nativeEnum(UserRole),
    scopeType: positionScopeSchema
  })).max(20)
}).superRefine((value, context) => {
  const keys = value.bindings.map((binding) => `${binding.roleCode}:${binding.scopeType}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "同一岗位不能重复配置相同角色和数据范围" });
  }
  value.bindings.forEach((binding, index) => {
    if (!positionAssignableRoleSet.has(binding.roleCode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bindings", index, "roleCode"],
        message: "该角色不能由内部岗位自动授予"
      });
    }
  });
});

const employeeInclude = {
  user: { select: { id: true, username: true, displayName: true, isActive: true } },
  legalEntity: { select: { id: true, code: true, name: true } },
  organizationUnit: { select: { id: true, code: true, name: true, type: true } },
  position: { select: { id: true, code: true, name: true } },
  jobGrade: { select: { id: true, code: true, name: true, level: true } },
  employments: {
    include: {
      legalEntity: { select: { id: true, name: true } },
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
      where: andWhere(organizationUnitWhere(user), {
        isActive: true,
        type: { in: [...visibleOrganizationTypes] }
      }),
      orderBy: [{ path: "asc" }, { sortOrder: "asc" }]
    });
    return success(request, items);
  });

  app.get("/organization/options", {
    preHandler: [app.authenticate, app.requirePermission(Permission.ORG_READ)]
  }, async (request) => {
    const user = getSession(request);
    const organizationUnits = await app.prisma.organizationUnit.findMany({
      where: andWhere(organizationUnitWhere(user), {
        isActive: true,
        type: { in: [...assignableOrganizationTypes] }
      }),
      orderBy: [{ path: "asc" }, { sortOrder: "asc" }]
    });
    const organizationUnitIds = organizationUnits.map((unit) => unit.id);
    const canManageRoles = user.permissions.includes(Permission.USER_MANAGE);
    const [legalEntities, positions, jobGrades] = await Promise.all([
      app.prisma.legalEntity.findMany({
        where: { isActive: true },
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
    const canGrantGlobalPositionAuthorization = user.roles.some(
      (role) => role === UserRole.SUPER_ADMIN || role === UserRole.SYSTEM_ADMIN
    );
    const grantablePositionRoles = canGrantGlobalPositionAuthorization
      ? [...positionAssignableRoles]
      : positionAssignableRoles.filter(
          (role) => role !== UserRole.GROUP_LEADER && role !== UserRole.HEADQUARTERS_MANAGER
        );
    const roles = canManageRoles
      ? await app.prisma.role.findMany({
          where: { isActive: true, code: { in: grantablePositionRoles } },
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" }
        })
      : [];
    const positionRoleBindings = canManageRoles
      ? await app.prisma.positionRoleBinding.findMany({
          where: { positionId: { in: positions.map((position) => position.id) }, isActive: true },
          select: {
            id: true,
            positionId: true,
            scopeType: true,
            role: { select: { id: true, code: true, name: true } }
          },
          orderBy: [{ positionId: "asc" }, { createdAt: "asc" }]
        })
      : [];
    const jobGradeApprovalPolicies = canManageRoles
      ? await app.prisma.jobGradeApprovalPolicy.findMany({
          where: { jobGradeId: { in: jobGrades.map((grade) => grade.id) }, isActive: true },
          select: { id: true, jobGradeId: true, maxReimbursementApprovalCents: true },
          orderBy: { createdAt: "asc" }
        })
      : [];
    const accounts = canManageRoles
      ? await app.prisma.user.findMany({
          where: { isActive: true },
          select: {
            id: true,
            username: true,
            displayName: true,
            internalEmployee: { select: { id: true, employeeNo: true, name: true } }
          },
          orderBy: [{ displayName: "asc" }, { username: "asc" }]
        })
      : [];
    return success(request, {
      legalEntities,
      branches: [],
      organizationUnits,
      positions,
      jobGrades,
      roles,
      positionRoleBindings,
      jobGradeApprovalPolicies,
      accounts
    });
  });

  app.put("/organization/positions/:id/role-bindings", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.USER_MANAGE)
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = positionRoleBindingsSchema.parse(request.body);
    const user = authorizationForPermission(
      getSession(request),
      Permission.USER_MANAGE
    );
    assertPositionRoleBindingsAssignable(user.roles, input.bindings);
    const position = await app.prisma.position.findFirst({
      where: {
        id,
        isActive: true,
        organizationUnit: { is: organizationUnitWhere(user) }
      },
      include: {
        internalEmployees: {
          where: { status: "ACTIVE", userId: { not: null } },
          select: {
            userId: true,
            organizationUnitId: true
          }
        }
      }
    });
    if (!position) notFound("岗位");
    const roleCodes = [...new Set(input.bindings.map((binding) => binding.roleCode))];
    const roles = await app.prisma.role.findMany({
      where: { code: { in: roleCodes }, isActive: true },
      select: { id: true, code: true }
    });
    if (roles.length !== roleCodes.length) {
      throw new AppError(400, "ROLE_NOT_FOUND", "岗位权限中包含不存在或已停用的角色");
    }
    const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));
    const saved = await app.prisma.$transaction(async (tx) => {
      await tx.positionRoleBinding.updateMany({
        where: { positionId: id, isActive: true },
        data: { isActive: false }
      });
      for (const binding of input.bindings) {
        const roleId = roleIdByCode.get(binding.roleCode);
        if (!roleId) continue;
        await tx.positionRoleBinding.upsert({
          where: {
            positionId_roleId_scopeType: {
              positionId: id,
              roleId,
              scopeType: binding.scopeType
            }
          },
          create: {
            positionId: id,
            roleId,
            scopeType: binding.scopeType,
            isActive: true
          },
          update: { isActive: true }
        });
      }
      const effectiveAt = new Date();
      for (const employee of position.internalEmployees) {
        if (!employee.userId || !employee.organizationUnitId) continue;
        if (input.bindings.length === 0) {
          await clearPositionAuthorizations(tx as unknown as PositionAuthorizationDb, {
            userId: employee.userId,
            actorId: user.id,
            effectiveAt
          });
          continue;
        }
        await syncPositionAuthorizations(tx as unknown as PositionAuthorizationDb, {
          userId: employee.userId,
          actorId: user.id,
          effectiveAt,
          positionId: id,
          organizationUnitId: employee.organizationUnitId
        });
      }
      return tx.positionRoleBinding.findMany({
        where: { positionId: id, isActive: true },
        select: {
          id: true,
          positionId: true,
          scopeType: true,
          role: { select: { id: true, code: true, name: true } }
        },
        orderBy: { createdAt: "asc" }
      });
    });
    await writeAudit(app.prisma, request, {
      action: "POSITION_ROLE_BINDINGS_UPDATE",
      resourceType: "Position",
      resourceId: id,
      after: saved.map((binding) => ({
        roleCode: binding.role.code,
        scopeType: binding.scopeType
      }))
    });
    return success(request, saved);
  });

  app.put("/organization/job-grades/:id/reimbursement-policy", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.USER_MANAGE)
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = jobGradeApprovalPolicySchema.parse(request.body);
    const user = getSession(request);
    const grade = await app.prisma.jobGrade.findFirst({
      where: { id, isActive: true },
      select: { id: true, code: true, name: true }
    });
    if (!grade) notFound("职级");
    const policy = await app.prisma.jobGradeApprovalPolicy.upsert({
      where: { jobGradeId: id },
      create: {
        jobGradeId: id,
        maxReimbursementApprovalCents: input.maxReimbursementApprovalCents,
        isActive: true
      },
      update: {
        maxReimbursementApprovalCents: input.maxReimbursementApprovalCents,
        isActive: true
      },
      select: { id: true, jobGradeId: true, maxReimbursementApprovalCents: true }
    });
    await writeAudit(app.prisma, request, {
      action: "JOB_GRADE_REIMBURSEMENT_POLICY_UPDATE",
      resourceType: "JobGrade",
      resourceId: id,
      after: {
        code: grade.code,
        name: grade.name,
        maxReimbursementApprovalCents: policy.maxReimbursementApprovalCents,
        updatedById: user.id
      }
    });
    return success(request, policy);
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
    if (input.userId && !user.permissions.includes(Permission.USER_MANAGE)) {
      throw new AppError(403, "USER_MANAGE_REQUIRED", "绑定系统账号需要账号与权限管理权限");
    }
    if (input.userId) {
      const account = await app.prisma.user.findFirst({
        where: { id: input.userId, isActive: true },
        select: {
          id: true,
          internalEmployee: { select: { id: true, employeeNo: true, name: true } }
        }
      });
      if (!account) {
        throw new AppError(409, "ACTIVE_USER_REQUIRED", "只能绑定当前启用的系统账号");
      }
      if (account.internalEmployee) {
        throw new AppError(409, "USER_ALREADY_BOUND_TO_INTERNAL_EMPLOYEE", "该系统账号已绑定其他内部员工");
      }
    }
    const allowed = await app.prisma.organizationUnit.findFirst({
      where: andWhere(organizationUnitWhere(user), {
        id: input.organizationUnitId,
        isActive: true,
        type: { in: [...assignableOrganizationTypes] },
        positions: { some: { id: input.positionId, isActive: true } }
      })
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
          organizationUnitId: input.organizationUnitId,
          positionId: input.positionId,
          jobGradeId: input.jobGradeId,
          startedAt: input.onboardDate,
          reason: input.reason ?? "入职",
          isPrimary: true
        }
      });
      if (input.userId) {
        await syncPositionAuthorizations(tx as unknown as PositionAuthorizationDb, {
          userId: input.userId,
          actorId: user.id,
          effectiveAt: input.onboardDate,
          positionId: input.positionId,
          organizationUnitId: input.organizationUnitId
        });
      }
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
            positionId: input.positionId
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
        organizationUnitId: employee.organizationUnitId
      }
    });
    return reply.status(201).send(success(request, employee));
  });


  app.put("/internal-employees/:id/account", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.INTERNAL_EMPLOYEE_WRITE),
      app.requirePermission(Permission.USER_MANAGE)
    ]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = accountBindingSchema.parse(request.body);
    const user = authorizationForPermission(
      getSession(request),
      Permission.INTERNAL_EMPLOYEE_WRITE
    );
    const scoped = await app.prisma.internalEmployee.findFirst({
      where: andWhere(internalEmployeeWhere(user), { id }),
      select: { id: true }
    });
    if (!scoped) notFound("内部员工");
    const updated = await bindInternalEmployeeAccount(app.prisma, {
      employeeId: id,
      actorId: user.id,
      expectedVersion: input.expectedVersion,
      userId: input.userId,
      effectiveAt: new Date()
    });
    await writeAudit(app.prisma, request, {
      action: input.userId ? "INTERNAL_EMPLOYEE_ACCOUNT_BIND" : "INTERNAL_EMPLOYEE_ACCOUNT_UNBIND",
      resourceType: "InternalEmployee",
      resourceId: id,
      after: { userId: input.userId, version: input.expectedVersion + 1 }
    });
    return success(request, updated);
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
    const target = await app.prisma.organizationUnit.findFirst({
      where: andWhere(organizationUnitWhere(user), {
        id: input.organizationUnitId,
        isActive: true,
        type: { in: [...assignableOrganizationTypes] },
        positions: { some: { id: input.positionId, isActive: true } }
      }),
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
