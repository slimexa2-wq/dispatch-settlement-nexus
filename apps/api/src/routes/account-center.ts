import type { FastifyInstance } from "fastify";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Permission, UserRole } from "@xiangneng/shared";
import { AccountLifecycleAction, PortalType } from "../generated/prisma/client.js";
import { writeAudit } from "../audit.js";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { accountCategory, accountCategoryWhere, normalizePortalAccess, parseOptionalBooleanQuery, validateSelfAccountMutation } from "../services/account-center.js";

const portalSchema = z.object({
  portal: z.nativeEnum(PortalType),
  enabled: z.boolean().default(true),
  validFrom: z.coerce.date().optional().nullable(),
  validTo: z.coerce.date().optional().nullable()
});

function accountInclude() {
  return {
    projectLinks: { select: { projectId: true } },
    internalEmployee: { select: { id: true, employeeNo: true, name: true, status: true, organizationUnitId: true } },
    person: { select: { id: true, name: true, phone: true, status: true, employeeNo: true } },
    supplier: { select: { id: true, name: true, isActive: true } },
    portalAccesses: { orderBy: { createdAt: "desc" as const } },
    roleAssignments: { where: { status: "ACTIVE" as const }, include: { role: { select: { id: true, code: true, name: true } }, scopes: true }, orderBy: { createdAt: "desc" as const } },
    accountLifecycleLogs: { include: { actor: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "desc" as const }, take: 20 }
  };
}

function toAccount(user: any) {
  return {
    ...user,
    passwordHash: undefined,
    category: accountCategory({
      internalEmployeeId: user.internalEmployee?.id,
      supplierId: user.supplierId,
      personId: user.personId,
      employmentStatus: user.person?.status
    }),
    effectivePortals: normalizePortalAccess(user.portalAccesses)
  };
}

async function uniqueUsername(app: FastifyInstance, preferred: string) {
  const base = preferred.trim().replace(/\s+/g, "").slice(0, 54) || `user${Date.now()}`;
  for (let index = 0; index < 100; index += 1) {
    const candidate = index ? `${base}${String(index).padStart(2, "0")}` : base;
    const exists = await app.prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  throw new AppError(409, "USERNAME_EXHAUSTED", `无法为 ${preferred} 生成唯一账号`);
}

export async function accountCenterRoutes(app: FastifyInstance): Promise<void> {
  const guards = [app.authenticate, app.requirePermission(Permission.ACCOUNT_MANAGE)];

  app.get("/account-center", { preHandler: guards }, async (request) => {
    const query = z.object({
      page: z.coerce.number().optional(),
      pageSize: z.coerce.number().optional(),
      keyword: z.string().trim().max(80).optional(),
      portal: z.nativeEnum(PortalType).optional(),
      active: z.unknown().optional().transform((value, context) => {
        try { return parseOptionalBooleanQuery(value); }
        catch (error) { context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "布尔参数格式错误" }); return z.NEVER; }
      }),
      category: z.enum(["INTERNAL_EMPLOYEE", "SUPPLIER", "OUTSOURCED_EMPLOYEE", "JOB_SEEKER", "SYSTEM"]).optional()
    }).parse(request.query);
    const { page, pageSize, skip } = parsePagination(query);
    const now = new Date();
    const where = {
      ...accountCategoryWhere(query.category),
      isActive: query.active,
      OR: query.keyword ? [
        { username: { contains: query.keyword, mode: "insensitive" as const } },
        { displayName: { contains: query.keyword, mode: "insensitive" as const } },
        { person: { phone: { contains: query.keyword } } },
        { internalEmployee: { phone: { contains: query.keyword } } },
        { supplier: { name: { contains: query.keyword, mode: "insensitive" as const } } }
      ] : undefined,
      portalAccesses: query.portal ? { some: { portal: query.portal, enabled: true, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] } } : undefined
    };
    const [items, total] = await app.prisma.$transaction([
      app.prisma.user.findMany({ where, include: accountInclude(), orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      app.prisma.user.count({ where })
    ]);
    const mapped = items.map(toAccount);
    return success(request, { items: mapped, pagination: paginationMeta(page, pageSize, total) });
  });

  app.post("/account-center/batch-create", { preHandler: guards }, async (request, reply) => {
    const input = z.object({
      sourceType: z.enum(["INTERNAL_EMPLOYEE", "PERSON", "SUPPLIER"]),
      sourceIds: z.array(z.string().uuid()).min(1).max(1000),
      defaultPassword: z.string().min(8).max(128),
      portals: z.array(z.nativeEnum(PortalType)).min(1),
      skipExisting: z.boolean().default(true)
    }).parse(request.body);
    const actor = getSession(request);
    const passwordHash = await hash(input.defaultPassword, 12);
    const result = { created: [] as Array<{ id: string; username: string; displayName: string }>, skipped: [] as Array<{ sourceId: string; reason: string }>, failed: [] as Array<{ sourceId: string; reason: string }> };

    for (const sourceId of input.sourceIds) {
      try {
        if (input.sourceType === "INTERNAL_EMPLOYEE") {
          const source = await app.prisma.internalEmployee.findUnique({ where: { id: sourceId } });
          if (!source) { result.failed.push({ sourceId, reason: "内部员工不存在" }); continue; }
          if (source.userId) { result.skipped.push({ sourceId, reason: "已有关联账号" }); continue; }
          const username = await uniqueUsername(app, source.phone || source.employeeNo);
          const user = await app.prisma.user.create({
            data: {
              username, passwordHash, displayName: source.name, role: UserRole.EMPLOYEE,
              employeeType: "INTERNAL", internalEmployee: { connect: { id: source.id } },
              portalAccesses: { create: input.portals.map((portal) => ({ portal, source: "BATCH_CREATE", grantedById: actor.id })) },
              accountLifecycleLogs: { create: { action: AccountLifecycleAction.CREATED, actorId: actor.id, reason: "内部员工批量开户" } }
            }
          });
          result.created.push({ id: user.id, username: user.username, displayName: user.displayName });
        } else if (input.sourceType === "PERSON") {
          const source = await app.prisma.person.findUnique({ where: { id: sourceId }, include: { user: true } });
          if (!source) { result.failed.push({ sourceId, reason: "人员档案不存在" }); continue; }
          if (source.user) { result.skipped.push({ sourceId, reason: "已有关联账号" }); continue; }
          const username = await uniqueUsername(app, source.phone || source.employeeNo || source.name);
          const role = source.status === "ACTIVE" ? UserRole.OUTSOURCED_EMPLOYEE : UserRole.JOB_SEEKER;
          const user = await app.prisma.user.create({
            data: {
              username, passwordHash, displayName: source.name, role, personId: source.id,
              portalAccesses: { create: input.portals.map((portal) => ({ portal, source: "BATCH_CREATE", grantedById: actor.id })) },
              accountLifecycleLogs: { create: { action: AccountLifecycleAction.CREATED, actorId: actor.id, reason: "人员档案批量开户" } }
            }
          });
          result.created.push({ id: user.id, username: user.username, displayName: user.displayName });
        } else {
          const source = await app.prisma.supplier.findUnique({ where: { id: sourceId }, include: { users: { where: { isActive: true }, take: 1 } } });
          if (!source) { result.failed.push({ sourceId, reason: "供应商不存在" }); continue; }
          if (source.users.length && input.skipExisting) { result.skipped.push({ sourceId, reason: "已存在供应商账号" }); continue; }
          const username = await uniqueUsername(app, source.contactPhone || source.name);
          const user = await app.prisma.user.create({
            data: {
              username, passwordHash, displayName: source.contactName || `${source.name}管理员`, role: UserRole.SUPPLIER_ADMIN, supplierId: source.id,
              portalAccesses: { create: input.portals.map((portal) => ({ portal, source: "BATCH_CREATE", grantedById: actor.id })) },
              accountLifecycleLogs: { create: { action: AccountLifecycleAction.CREATED, actorId: actor.id, reason: "供应商批量开户" } }
            }
          });
          result.created.push({ id: user.id, username: user.username, displayName: user.displayName });
        }
      } catch (error) {
        result.failed.push({ sourceId, reason: error instanceof Error ? error.message : "创建失败" });
      }
    }
    await writeAudit(app.prisma, request, { action: "ACCOUNT_BATCH_CREATE", resourceType: "User", after: { sourceType: input.sourceType, created: result.created.length, skipped: result.skipped.length, failed: result.failed.length } });
    return reply.status(201).send(success(request, result));
  });

  app.patch("/account-center/:id/portals", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { portals, reason } = z.object({ portals: z.array(portalSchema).min(1), reason: z.string().trim().min(2).max(500) }).parse(request.body);
    const existing = await app.prisma.user.findUnique({ where: { id } });
    if (!existing) notFound("账户");
    const actor = getSession(request);
    const selfMutationError = validateSelfAccountMutation({ actorId: actor.id, targetUserId: id, portals });
    if (selfMutationError) throw new AppError(409, "SELF_ACCOUNT_LOCKOUT", selfMutationError);
    const result = await app.prisma.$transaction(async (tx) => {
      for (const portal of portals) {
        const changedAt = new Date();
        await tx.userPortalAccess.updateMany({
          where: { userId: id, portal: portal.portal, enabled: true },
          data: { enabled: false, validTo: changedAt }
        });
        if (portal.enabled) {
          await tx.userPortalAccess.create({ data: { userId: id, portal: portal.portal, enabled: true, source: "MANUAL", validFrom: portal.validFrom ?? changedAt, validTo: portal.validTo ?? null, grantedById: actor.id } });
        }
        await tx.accountLifecycleLog.create({ data: { userId: id, actorId: actor.id, portal: portal.portal, action: portal.enabled ? AccountLifecycleAction.PORTAL_GRANTED : AccountLifecycleAction.PORTAL_REVOKED, reason } });
      }
      return tx.user.findUnique({ where: { id }, include: accountInclude() });
    });
    await writeAudit(app.prisma, request, { action: "ACCOUNT_PORTALS_UPDATE", resourceType: "User", resourceId: id, after: { portals, reason } });
    if (!result) notFound("账户");
    return success(request, toAccount(result));
  });

  app.post("/account-center/:id/action", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ action: z.enum(["ACTIVATE", "DISABLE", "RESET_PASSWORD", "FORCE_LOGOUT", "UNBIND_WECHAT"]), password: z.string().min(8).max(128).optional(), reason: z.string().trim().min(2).max(500) }).parse(request.body);
    const existing = await app.prisma.user.findUnique({ where: { id } });
    if (!existing) notFound("账户");
    if (input.action === "RESET_PASSWORD" && !input.password) throw new AppError(400, "PASSWORD_REQUIRED", "重置密码时必须填写新密码");
    const actor = getSession(request);
    const selfMutationError = validateSelfAccountMutation({ actorId: actor.id, targetUserId: id, action: input.action });
    if (selfMutationError) throw new AppError(409, "SELF_ACCOUNT_LOCKOUT", selfMutationError);
    const actionMap = {
      ACTIVATE: AccountLifecycleAction.ACTIVATED,
      DISABLE: AccountLifecycleAction.DISABLED,
      RESET_PASSWORD: AccountLifecycleAction.PASSWORD_RESET,
      FORCE_LOGOUT: AccountLifecycleAction.FORCE_LOGOUT,
      UNBIND_WECHAT: AccountLifecycleAction.WECHAT_UNBOUND
    } as const;
    const data: Record<string, unknown> = {};
    if (input.action === "ACTIVATE") data.isActive = true;
    if (input.action === "DISABLE") { data.isActive = false; data.tokenVersion = { increment: 1 }; }
    if (input.action === "FORCE_LOGOUT") data.tokenVersion = { increment: 1 };
    if (input.action === "RESET_PASSWORD") { data.passwordHash = await hash(input.password!, 12); data.tokenVersion = { increment: 1 }; }
    if (input.action === "UNBIND_WECHAT") { data.wechatMiniappOpenId = null; data.wechatOfficialOpenId = null; data.wechatUnionId = null; data.tokenVersion = { increment: 1 }; }
    const user = await app.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data, include: accountInclude() });
      await tx.accountLifecycleLog.create({ data: { userId: id, actorId: actor.id, action: actionMap[input.action], before: { isActive: existing.isActive } as any, after: { isActive: updated.isActive } as any, reason: input.reason } });
      return updated;
    });
    await writeAudit(app.prisma, request, { action: `ACCOUNT_${input.action}`, resourceType: "User", resourceId: id, before: { isActive: existing.isActive }, after: { isActive: user.isActive, reason: input.reason } });
    return success(request, toAccount(user));
  });
}
