import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Permission } from "@xiangneng/shared";
import { AccessRequestStatus, Prisma } from "../generated/prisma/client.js";
import { writeAudit } from "../audit.js";
import { AppError, notFound } from "../errors.js";
import { success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { buildAccessProvisionPlan } from "../services/access-provisioning.js";
import { provisionAccessRequest, revokeAccessRequest } from "../services/access-request-provisioner.js";
import { advanceWorkflowTask, canActOnWorkflowNode, createWorkflowInstance } from "../services/workflow-runtime.js";
import { ensureDefaultAccessWorkflow } from "./workflows.js";
import type { WorkflowDefinition } from "../services/workflow-designer.js";

const scopeSchema = z.object({
  type: z.enum(["SELF", "ORG_UNIT", "CENTER", "BRANCH", "PROJECT", "SUPPLIER", "GROUP"]),
  entityId: z.string().uuid().optional().nullable()
});
const createSchema = z.object({
  subjectUserId: z.string().uuid(),
  portals: z.array(z.enum(["ADMIN", "INTERNAL_MINIAPP", "SUPPLIER_MINIAPP", "EMPLOYEE_MINIAPP"])).min(1),
  roles: z.array(z.string().trim().min(1).max(64)).min(1),
  scopes: z.array(scopeSchema).min(1),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().optional().nullable(),
  reason: z.string().trim().min(2).max(2000)
});

export async function accessRequestRoutes(app: FastifyInstance): Promise<void> {
  app.get("/access-requests/options", { preHandler: [app.authenticate] }, async (request) => {
    const session = getSession(request);
    if (![Permission.ACCESS_REQUEST_CREATE, Permission.ACCESS_REQUEST_APPROVE, Permission.ACCOUNT_MANAGE].some((permission) => session.permissions.includes(permission))) {
      throw new AppError(403, "FORBIDDEN", "当前账号没有权限查看权限开通选项");
    }
    const [users, roles, orgUnits, branches, projects, suppliers] = await app.prisma.$transaction([
      app.prisma.user.findMany({ where: { isActive: true }, select: { id: true, username: true, displayName: true }, orderBy: { displayName: "asc" }, take: 1000 }),
      app.prisma.role.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, isSystem: true }, orderBy: { name: "asc" } }),
      app.prisma.organizationUnit.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, type: true }, orderBy: { name: "asc" } }),
      app.prisma.branch.findMany({ select: { id: true, sourceCode: true, name: true }, orderBy: { name: "asc" } }),
      app.prisma.project.findMany({ select: { id: true, sourceProjectId: true, name: true }, orderBy: { name: "asc" } }),
      app.prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
    ]);
    return success(request, {
      users,
      roles,
      orgUnits,
      branches: branches.map((item) => ({ id: item.id, code: item.sourceCode, name: item.name })),
      projects: projects.map((item) => ({ id: item.id, code: item.sourceProjectId, name: item.name })),
      suppliers
    });
  });

  app.get("/access-requests", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const query = z.object({ status: z.nativeEnum(AccessRequestStatus).optional(), subjectUserId: z.string().uuid().optional() }).parse(request.query);
    const canReviewAll = user.permissions.includes(Permission.ACCESS_REQUEST_APPROVE) || user.permissions.includes(Permission.ACCOUNT_MANAGE);
    const items = await app.prisma.accessRequest.findMany({
      where: {
        status: query.status,
        subjectUserId: query.subjectUserId,
        ...(canReviewAll ? {} : {
          OR: [
            { requestedById: user.id },
            { subjectUserId: user.id },
            {
              workflowInstance: {
                is: {
                  tasks: {
                    some: {
                      status: "PENDING",
                      OR: [{ assignedUserId: user.id }, { assignedUserId: null }]
                    }
                  }
                }
              }
            }
          ]
        })
      },
      include: {
        subjectUser: { select: { id: true, username: true, displayName: true, isActive: true } },
        requestedBy: { select: { id: true, displayName: true } },
        reviewedBy: { select: { id: true, displayName: true } },
        workflowInstance: { include: { version: true, tasks: { orderBy: { nodeOrder: "asc" } } } },
        provisionTasks: true
      },
      orderBy: { createdAt: "desc" },
      take: 500
    });
    const visibleItems = items.flatMap((item) => {
      const pendingTask = item.workflowInstance?.tasks.find((task) => task.status === "PENDING");
      const definition = item.workflowInstance?.version.definition as unknown as WorkflowDefinition | undefined;
      const node = pendingTask ? definition?.nodes.find((candidate) => candidate.key === pendingTask.nodeKey) : undefined;
      const canCurrentUserAct = Boolean(pendingTask && node && canActOnWorkflowNode(user, node, pendingTask.assignedUserId, item.workflowInstance?.context as Record<string, unknown>));
      const ownsRequest = item.requestedById === user.id || item.subjectUserId === user.id;
      if (!canReviewAll && !ownsRequest && !canCurrentUserAct) return [];
      return [{ ...item, canCurrentUserAct }];
    });
    return success(request, visibleItems);
  });

  app.post("/access-requests", { preHandler: [app.authenticate, app.requirePermission(Permission.ACCESS_REQUEST_CREATE)] }, async (request, reply) => {
    const parsed = createSchema.parse(request.body);
    const user = getSession(request);
    const input = {
      ...parsed,
      validFrom: parsed.validFrom.toISOString(),
      validTo: parsed.validTo?.toISOString() ?? null
    };
    let plan;
    try { plan = buildAccessProvisionPlan(input); } catch (error) {
      throw new AppError(400, "INVALID_ACCESS_REQUEST", error instanceof Error ? error.message : "权限申请不完整");
    }
    const subject = await app.prisma.user.findUnique({
      where: { id: input.subjectUserId },
      include: { internalEmployee: { select: { organizationUnitId: true, organizationUnit: { select: { parentId: true, type: true } } } } }
    });
    if (!subject) notFound("开通对象");
    const template = await ensureDefaultAccessWorkflow(app, user.id);
    const version = template.versions.find((item) => item.isPublished) ?? template.versions[0];
    if (!version) throw new AppError(409, "WORKFLOW_NOT_PUBLISHED", "权限审批流尚未发布");

    const created = await app.prisma.$transaction(async (tx) => {
      const access = await tx.accessRequest.create({
        data: {
          subjectUserId: input.subjectUserId,
          requestedById: user.id,
          status: AccessRequestStatus.PENDING,
          riskLevel: plan.riskLevel,
          portals: input.portals as Prisma.InputJsonValue,
          roles: input.roles as Prisma.InputJsonValue,
          scopes: input.scopes as Prisma.InputJsonValue,
          validFrom: parsed.validFrom,
          validTo: parsed.validTo ?? null,
          reason: input.reason
        }
      });
      const instance = await createWorkflowInstance(tx, {
        templateId: template.id,
        versionId: version.id,
        businessType: "ACCESS_REQUEST",
        businessId: access.id,
        context: {
          riskLevel: plan.riskLevel,
          portals: input.portals,
          roles: input.roles,
          subjectUserId: input.subjectUserId,
          organizationUnitId: subject.internalEmployee?.organizationUnitId ?? null,
          centerId: subject.internalEmployee?.organizationUnit?.type === "CENTER"
            ? subject.internalEmployee.organizationUnitId
            : subject.internalEmployee?.organizationUnit?.parentId ?? null
        },
        initiatedById: user.id,
        definition: version.definition as unknown as WorkflowDefinition
      });
      return tx.accessRequest.update({ where: { id: access.id }, data: { workflowInstanceId: instance.id }, include: { workflowInstance: { include: { tasks: { orderBy: { nodeOrder: "asc" } } } } } });
    });
    await writeAudit(app.prisma, request, { action: "ACCESS_REQUEST_CREATE", resourceType: "AccessRequest", resourceId: created.id, after: { subjectUserId: input.subjectUserId, riskLevel: plan.riskLevel, portals: input.portals, roles: input.roles } });
    return reply.status(201).send(success(request, created));
  });

  app.post("/access-requests/:id/decision", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ decision: z.enum(["APPROVE", "REJECT"]), comment: z.string().trim().max(2000).optional().nullable() }).parse(request.body);
    const existing = await app.prisma.accessRequest.findUnique({
      where: { id },
      include: { workflowInstance: { include: { tasks: { where: { status: "PENDING" }, orderBy: { nodeOrder: "asc" } } } } }
    });
    if (!existing) notFound("权限申请");
    if (existing.status !== AccessRequestStatus.PENDING || !existing.workflowInstance) {
      throw new AppError(409, "ACCESS_REQUEST_ALREADY_HANDLED", "该申请已处理或审批流不可用");
    }
    const task = existing.workflowInstance.tasks[0];
    if (!task) throw new AppError(409, "WORKFLOW_TASK_NOT_FOUND", "当前没有待处理审批环节");
    const actor = getSession(request);
    let instance;
    try {
      instance = await advanceWorkflowTask(app.prisma, {
        taskId: task.id,
        actor,
        decision: input.decision,
        comment: input.comment
      });
    } catch (error) {
      throw new AppError(403, "ACCESS_DECISION_DENIED", error instanceof Error ? error.message : "无权处理该审批环节");
    }
    if (instance.status === "REJECTED") {
      const rejected = await app.prisma.accessRequest.update({ where: { id }, data: { status: AccessRequestStatus.REJECTED, reviewedById: actor.id, reviewedAt: new Date(), reviewComment: input.comment } });
      await writeAudit(app.prisma, request, { action: "ACCESS_REQUEST_REJECT", resourceType: "AccessRequest", resourceId: id, after: { comment: input.comment } });
      return success(request, rejected);
    }
    if (instance.status === "APPROVED") {
      await app.prisma.accessRequest.update({ where: { id }, data: { status: AccessRequestStatus.APPROVED, reviewedById: actor.id, reviewedAt: new Date(), reviewComment: input.comment } });
      const completed = await provisionAccessRequest(app.prisma, id, actor.id);
      await writeAudit(app.prisma, request, { action: "ACCESS_REQUEST_APPROVE", resourceType: "AccessRequest", resourceId: id, after: { status: completed.status } });
      return success(request, completed);
    }
    await writeAudit(app.prisma, request, { action: "ACCESS_REQUEST_NODE_APPROVE", resourceType: "AccessRequest", resourceId: id, after: { currentNodeKey: instance.currentNodeKey } });
    return success(request, await app.prisma.accessRequest.findUnique({ where: { id }, include: { workflowInstance: { include: { tasks: { orderBy: { nodeOrder: "asc" } } } } } }));
  });

  app.post("/access-requests/:id/revoke", { preHandler: [app.authenticate, app.requirePermission(Permission.ACCOUNT_MANAGE)] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().trim().min(2).max(2000) }).parse(request.body);
    try {
      const result = await revokeAccessRequest(app.prisma, id, getSession(request).id, reason);
      await writeAudit(app.prisma, request, { action: "ACCESS_REQUEST_REVOKE", resourceType: "AccessRequest", resourceId: id, after: { reason } });
      return success(request, result);
    } catch (error) {
      throw new AppError(409, "ACCESS_REVOKE_FAILED", error instanceof Error ? error.message : "权限回收失败");
    }
  });
}
