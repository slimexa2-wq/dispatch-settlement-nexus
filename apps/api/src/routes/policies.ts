import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Permission, PolicyType, UserRole, idSchema, policySchema } from "@xiangneng/shared";
import { andWhere, policyWhere } from "../data-scope.js";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { writeAudit } from "../audit.js";

const policyQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  type: z.nativeEnum(PolicyType).optional(),
  projectId: idSchema.optional(),
  isActive: z.enum(["true", "false"]).optional(),
  keyword: z.string().trim().max(200).optional()
});

function validatePolicy(input: z.infer<typeof policySchema>): void {
  if (input.type === PolicyType.SUPPLIER) {
    if (!input.supplierId && !input.supplierLevel) {
      throw new AppError(400, "POLICY_AUDIENCE_REQUIRED", "供应商政策必须指定供应商或供应商级别");
    }
    if (input.employeeType) throw new AppError(400, "INVALID_POLICY_AUDIENCE", "供应商政策不能设置员工类型");
  } else {
    if (!input.employeeType) throw new AppError(400, "POLICY_AUDIENCE_REQUIRED", "内部推荐政策必须指定员工类型");
    if (input.supplierId || input.supplierLevel) {
      throw new AppError(400, "INVALID_POLICY_AUDIENCE", "内部推荐政策不能设置供应商对象");
    }
  }
  if (input.expiresAt && input.expiresAt < input.effectiveAt) {
    throw new AppError(400, "INVALID_EFFECTIVE_RANGE", "失效日期不能早于生效日期");
  }
}

export async function policyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/policies", {
    preHandler: [app.authenticate, app.requirePermission(Permission.POLICY_READ)]
  }, async (request) => {
    const query = policyQuerySchema.parse(request.query);
    const user = getSession(request);
    const { page, pageSize, skip } = parsePagination(query);
    let scope = policyWhere(user);
    if (user.role === UserRole.SUPPLIER) {
      const supplier = user.supplierId
        ? await app.prisma.supplier.findUnique({ where: { id: user.supplierId }, select: { level: true } })
        : null;
      scope = {
        type: PolicyType.SUPPLIER,
        isActive: true,
        project: { supplierLinks: { some: { supplierId: user.supplierId ?? "00000000-0000-0000-0000-000000000000" } } },
        OR: [
          { supplierId: user.supplierId ?? "" },
          ...(supplier?.level ? [{ supplierId: null, supplierLevel: supplier.level }] : [])
        ]
      };
    } else if (user.role === UserRole.EMPLOYEE) {
      const account = await app.prisma.user.findUnique({ where: { id: user.id }, select: { employeeType: true } });
      scope = {
        type: PolicyType.EMPLOYEE_REFERRAL,
        isActive: true,
        employeeType: account?.employeeType ?? "普通员工"
      };
    }
    const where = andWhere(scope, {
      type: query.type,
      projectId: query.projectId,
      isActive: query.isActive === undefined ? undefined : query.isActive === "true",
      name: query.keyword ? { contains: query.keyword, mode: "insensitive" as const } : undefined
    });
    const [items, total] = await app.prisma.$transaction([
      app.prisma.policy.findMany({
        where,
        include: {
          project: { select: { id: true, name: true, branchId: true } },
          supplier: { select: { id: true, name: true, level: true } }
        },
        orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize
      }),
      app.prisma.policy.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.post("/policies", {
    preHandler: [app.authenticate, app.requirePermission(Permission.POLICY_WRITE)]
  }, async (request, reply) => {
    const input = policySchema.parse(request.body);
    validatePolicy(input);
    const policy = await app.prisma.policy.create({ data: input });
    await writeAudit(app.prisma, request, {
      action: "POLICY_CREATE",
      resourceType: "Policy",
      resourceId: policy.id,
      after: { name: policy.name, type: policy.type, projectId: policy.projectId, version: policy.version }
    });
    return reply.status(201).send(success(request, policy));
  });

  app.patch("/policies/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.POLICY_WRITE)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const patch = policySchema.partial().parse(request.body);
    const existing = await app.prisma.policy.findUnique({ where: { id } });
    if (!existing) notFound("政策");
    const merged = policySchema.parse({
      ...existing,
      ...patch,
      amount: patch.amount ?? existing.amount.toNumber()
    });
    validatePolicy(merged);
    const policy = await app.prisma.policy.update({
      where: { id },
      data: { ...patch, version: { increment: 1 } }
    });
    await writeAudit(app.prisma, request, {
      action: "POLICY_UPDATE",
      resourceType: "Policy",
      resourceId: id,
      before: { version: existing.version, isActive: existing.isActive },
      after: { version: policy.version, isActive: policy.isActive }
    });
    return success(request, policy);
  });
}
