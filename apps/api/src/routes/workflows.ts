import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Permission, type SessionUser } from "@xiangneng/shared";
import { Prisma, WorkflowTemplateStatus, WorkflowTaskStatus } from "../generated/prisma/client.js";
import { writeAudit } from "../audit.js";
import { AppError, notFound } from "../errors.js";
import { success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import {
  normalizeWorkflowDefinition,
  simulateWorkflow,
  validateWorkflowDefinition,
  type WorkflowDefinition
} from "../services/workflow-designer.js";
import { advanceWorkflowTask, canActOnWorkflowNode, createWorkflowInstance } from "../services/workflow-runtime.js";
import { provisionAccessRequest } from "../services/access-request-provisioner.js";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const conditionSchema = z.object({
  field: z.string().trim().min(1).max(120),
  operator: z.enum(["EQ", "NE", "GT", "GTE", "LT", "LTE", "IN", "CONTAINS"]),
  value: z.unknown()
});
const nodeSchema = z.object({
  key: z.string().trim().min(1).max(64),
  type: z.enum(["START", "APPROVAL", "CC", "END"]),
  name: z.string().trim().min(1).max(120),
  assignee: z.object({
    type: z.enum(["USER", "ROLE", "POSITION", "DEPARTMENT_MANAGER", "DIRECT_MANAGER", "FINANCE_REVIEWER", "SYSTEM_ADMIN"]),
    refId: z.string().trim().max(128).optional().nullable()
  }).optional(),
  mode: z.enum(["ANY", "ALL"]).optional(),
  conditions: z.array(conditionSchema).max(20).optional(),
  allowReturn: z.boolean().optional(),
  timeoutHours: z.number().int().positive().max(8760).optional().nullable()
});
const definitionSchema = z.object({ name: z.string().trim().min(1).max(120), nodes: z.array(nodeSchema).min(2).max(50) });
const createSchema = z.object({
  code: z.string().trim().min(2).max(64).regex(/^[A-Z0-9_]+$/),
  name: z.string().trim().min(1).max(120),
  businessType: z.string().trim().min(2).max(64).regex(/^[A-Z0-9_]+$/),
  description: z.string().trim().max(1000).optional().nullable(),
  definition: definitionSchema
});

export const defaultAccessWorkflowDefinition: WorkflowDefinition = {
  name: "权限开通审批",
  nodes: [
    { key: "start", type: "START", name: "发起申请" },
    { key: "department", type: "APPROVAL", name: "部门负责人审批", assignee: { type: "DEPARTMENT_MANAGER" } },
    { key: "system", type: "APPROVAL", name: "系统管理员开通", assignee: { type: "SYSTEM_ADMIN" } },
    { key: "end", type: "END", name: "完成" }
  ]
};

export async function ensureDefaultAccessWorkflow(app: FastifyInstance, createdById?: string | null) {
  const existing = await app.prisma.workflowTemplate.findUnique({ where: { code: "ACCESS_REQUEST_DEFAULT" }, include: { versions: { orderBy: { version: "desc" } } } });
  if (existing) return existing;
  return app.prisma.workflowTemplate.create({
    data: {
      code: "ACCESS_REQUEST_DEFAULT",
      name: "权限开通审批",
      businessType: "ACCESS_REQUEST",
      description: "默认两步审批，可由管理员复制、调整节点并发布新版本",
      status: WorkflowTemplateStatus.PUBLISHED,
      versions: {
        create: { version: 1, definition: jsonValue(defaultAccessWorkflowDefinition), isPublished: true, publishedAt: new Date(), createdById: createdById ?? null }
      }
    },
    include: { versions: true }
  });
}

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  const manageGuards = [app.authenticate, app.requirePermission(Permission.WORKFLOW_MANAGE)];

  app.get("/workflow-templates/options", { preHandler: manageGuards }, async (request) => {
    const [users, roles, positions] = await app.prisma.$transaction([
      app.prisma.user.findMany({ where: { isActive: true }, select: { id: true, username: true, displayName: true }, orderBy: { displayName: "asc" }, take: 1000 }),
      app.prisma.role.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      app.prisma.position.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } })
    ]);
    return success(request, { users, roles, positions });
  });

  app.get("/workflow-templates", { preHandler: manageGuards }, async (request) => {
    await ensureDefaultAccessWorkflow(app, getSession(request).id);
    const items = await app.prisma.workflowTemplate.findMany({
      include: { versions: { orderBy: { version: "desc" }, take: 5 } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
    return success(request, items);
  });

  app.post("/workflow-templates", { preHandler: manageGuards }, async (request, reply) => {
    const input = createSchema.parse(request.body);
    const definition = normalizeWorkflowDefinition(input.definition as WorkflowDefinition);
    const errors = validateWorkflowDefinition(definition);
    if (errors.length) throw new AppError(400, "INVALID_WORKFLOW", "审批流配置不完整", errors);
    const user = getSession(request);
    const template = await app.prisma.workflowTemplate.create({
      data: {
        code: input.code,
        name: input.name,
        businessType: input.businessType,
        description: input.description,
        versions: { create: { version: 1, definition: jsonValue(definition), createdById: user.id } }
      },
      include: { versions: true }
    });
    await writeAudit(app.prisma, request, { action: "WORKFLOW_TEMPLATE_CREATE", resourceType: "WorkflowTemplate", resourceId: template.id, after: { code: template.code, businessType: template.businessType } });
    return reply.status(201).send(success(request, template));
  });

  app.post("/workflow-templates/:id/versions", { preHandler: manageGuards }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ definition: definitionSchema }).parse(request.body);
    const template = await app.prisma.workflowTemplate.findUnique({ where: { id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!template) notFound("审批流模板");
    const definition = normalizeWorkflowDefinition(input.definition as WorkflowDefinition);
    const errors = validateWorkflowDefinition(definition);
    if (errors.length) throw new AppError(400, "INVALID_WORKFLOW", "审批流配置不完整", errors);
    const version = await app.prisma.workflowVersion.create({
      data: { templateId: id, version: (template.versions[0]?.version ?? 0) + 1, definition: jsonValue(definition), createdById: getSession(request).id }
    });
    await writeAudit(app.prisma, request, { action: "WORKFLOW_VERSION_CREATE", resourceType: "WorkflowVersion", resourceId: version.id, after: { templateId: id, version: version.version } });
    return reply.status(201).send(success(request, version));
  });

  app.post("/workflow-templates/:id/publish", { preHandler: manageGuards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { versionId } = z.object({ versionId: z.string().uuid() }).parse(request.body);
    const version = await app.prisma.workflowVersion.findFirst({ where: { id: versionId, templateId: id } });
    if (!version) notFound("审批流版本");
    const errors = validateWorkflowDefinition(version.definition as unknown as WorkflowDefinition);
    if (errors.length) throw new AppError(400, "INVALID_WORKFLOW", "该版本配置不完整，不能发布", errors);
    const result = await app.prisma.$transaction(async (tx) => {
      await tx.workflowVersion.updateMany({ where: { templateId: id }, data: { isPublished: false } });
      const published = await tx.workflowVersion.update({ where: { id: versionId }, data: { isPublished: true, publishedAt: new Date() } });
      await tx.workflowTemplate.update({ where: { id }, data: { status: WorkflowTemplateStatus.PUBLISHED } });
      return published;
    });
    await writeAudit(app.prisma, request, { action: "WORKFLOW_VERSION_PUBLISH", resourceType: "WorkflowVersion", resourceId: versionId, after: { templateId: id, version: result.version } });
    return success(request, result);
  });

  app.post("/workflow-templates/simulate", { preHandler: manageGuards }, async (request) => {
    const input = z.object({ definition: definitionSchema, context: z.record(z.unknown()).default({}) }).parse(request.body);
    const definition = normalizeWorkflowDefinition(input.definition as WorkflowDefinition);
    return success(request, { errors: validateWorkflowDefinition(definition), simulation: simulateWorkflow(definition, input.context) });
  });

  app.post("/workflow-instances", { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = z.object({ templateCode: z.string(), businessType: z.string(), businessId: z.string().max(128), context: z.record(z.unknown()).default({}) }).parse(request.body);
    const template = await app.prisma.workflowTemplate.findUnique({ where: { code: input.templateCode }, include: { versions: { where: { isPublished: true }, orderBy: { version: "desc" }, take: 1 } } });
    const version = template?.versions[0];
    if (!template || !version) throw new AppError(409, "WORKFLOW_NOT_PUBLISHED", "没有可用的已发布审批流");
    const instance = await createWorkflowInstance(app.prisma, {
      templateId: template.id, versionId: version.id, businessType: input.businessType,
      businessId: input.businessId, context: input.context, initiatedById: getSession(request).id,
      definition: version.definition as unknown as WorkflowDefinition
    });
    return reply.status(201).send(success(request, instance));
  });

  app.get("/workflow-tasks/my", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const candidates = await app.prisma.workflowTask.findMany({
      where: { status: WorkflowTaskStatus.PENDING, OR: [{ assignedUserId: user.id }, { assignedUserId: null }] },
      include: { instance: { include: { version: true } } }, orderBy: { createdAt: "asc" }, take: 200
    });
    const items = candidates.filter((task) => {
      const definition = task.instance.version.definition as unknown as WorkflowDefinition;
      const node = definition.nodes.find((item) => item.key === task.nodeKey);
      return Boolean(node && canActOnWorkflowNode(user as SessionUser, node, task.assignedUserId, task.instance.context as Record<string, unknown>));
    });
    return success(request, items);
  });

  app.post("/workflow-tasks/:id/action", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ decision: z.enum(["APPROVE", "REJECT", "RETURN"]), comment: z.string().max(2000).optional().nullable() }).parse(request.body);
    try {
      const actor = getSession(request);
      const result = await advanceWorkflowTask(app.prisma, { taskId: id, actor, decision: input.decision, comment: input.comment });
      if (result.businessType === "ACCESS_REQUEST") {
        if (result.status === "REJECTED") {
          await app.prisma.accessRequest.update({ where: { id: result.businessId }, data: { status: "REJECTED", reviewedById: actor.id, reviewedAt: new Date(), reviewComment: input.comment } });
        } else if (result.status === "APPROVED") {
          await app.prisma.accessRequest.update({ where: { id: result.businessId }, data: { status: "APPROVED", reviewedById: actor.id, reviewedAt: new Date(), reviewComment: input.comment } });
          await provisionAccessRequest(app.prisma, result.businessId, actor.id);
        }
      }
      await writeAudit(app.prisma, request, { action: `WORKFLOW_TASK_${input.decision}`, resourceType: "WorkflowTask", resourceId: id, after: { instanceId: result.id, status: result.status } });
      return success(request, result);
    } catch (error) {
      throw new AppError(403, "WORKFLOW_ACTION_DENIED", error instanceof Error ? error.message : "审批操作失败");
    }
  });
}
