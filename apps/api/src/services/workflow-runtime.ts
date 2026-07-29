import { Prisma, WorkflowInstanceStatus, WorkflowTaskStatus, type PrismaClient } from "../generated/prisma/client.js";
import type { SessionUser } from "@xiangneng/shared";
import { canSessionActOnWorkflowNode } from "./workflow-authorization.js";
import { buildWorkflowTaskPlan, resolveWorkflowDecision, type WorkflowDefinition, type WorkflowNode } from "./workflow-designer.js";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function assignedUserId(
  prisma: PrismaClient | Prisma.TransactionClient,
  node: WorkflowNode
): Promise<string | null> {
  if (node.assignee?.type === "USER") return node.assignee.refId ?? null;
  if (node.assignee?.type !== "POSITION" || !node.assignee.refId) return null;
  const employee = await prisma.internalEmployee.findFirst({
    where: { status: "ACTIVE", userId: { not: null }, user: { isActive: true }, position: { code: node.assignee.refId } },
    select: { userId: true },
    orderBy: [{ onboardDate: "asc" }, { employeeNo: "asc" }]
  });
  return employee?.userId ?? null;
}

export function canActOnWorkflowNode(
  user: SessionUser,
  node: WorkflowNode,
  assignedToUserId?: string | null,
  context: Record<string, unknown> = {}
): boolean {
  return canSessionActOnWorkflowNode(user, node, assignedToUserId, context);
}

export async function createWorkflowInstance(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    templateId: string;
    versionId: string;
    businessType: string;
    businessId: string;
    context: Record<string, unknown>;
    initiatedById?: string | null;
    definition: WorkflowDefinition;
  }
) {
  const taskPlan = buildWorkflowTaskPlan(input.definition, input.context);
  const resolvedTaskPlan = await Promise.all(taskPlan.map(async (task) => ({
    ...task,
    assignedUserId: await assignedUserId(prisma, task.node)
  })));
  const first = resolvedTaskPlan[0]?.node ?? null;
  return prisma.workflowInstance.create({
    data: {
      templateId: input.templateId,
      versionId: input.versionId,
      businessType: input.businessType,
      businessId: input.businessId,
      context: jsonValue(input.context),
      initiatedById: input.initiatedById ?? null,
      currentNodeKey: first?.key ?? null,
      status: first ? WorkflowInstanceStatus.RUNNING : WorkflowInstanceStatus.APPROVED,
      completedAt: first ? null : new Date(),
      tasks: {
        create: resolvedTaskPlan.map(({ node, nodeOrder, status, assignedUserId }) => ({
          nodeKey: node.key,
          nodeName: node.name,
          nodeOrder,
          assigneeType: node.assignee?.type ?? "SYSTEM_ADMIN",
          assigneeRefId: node.assignee?.refId ?? null,
          assignedUserId,
          status: status === "PENDING" ? WorkflowTaskStatus.PENDING : WorkflowTaskStatus.WAITING,
          dueAt: node.timeoutHours ? new Date(Date.now() + node.timeoutHours * 60 * 60 * 1000) : null
        }))
      }
    },
    include: { tasks: { orderBy: { nodeOrder: "asc" } } }
  });
}

export async function advanceWorkflowTask(
  prisma: PrismaClient,
  input: { taskId: string; actor: SessionUser; decision: "APPROVE" | "REJECT" | "RETURN"; comment?: string | null }
) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.workflowTask.findUnique({
      where: { id: input.taskId },
      include: { instance: { include: { version: true, tasks: { orderBy: { nodeOrder: "asc" } } } } }
    });
    if (!task || task.status !== WorkflowTaskStatus.PENDING) throw new Error("审批任务不存在或已处理");
    const definition = task.instance.version.definition as unknown as WorkflowDefinition;
    const node = definition.nodes.find((item) => item.key === task.nodeKey);
    if (!node || !canActOnWorkflowNode(input.actor, node, task.assignedUserId, task.instance.context as Record<string, unknown>)) throw new Error("当前账号无权处理此审批节点");
    if (task.instance.currentNodeKey !== task.nodeKey) throw new Error("前一审批环节尚未完成");

    const decision = resolveWorkflowDecision(node, input.decision);
    if (decision.terminal) {
      await tx.workflowTask.update({
        where: { id: task.id },
        data: { status: decision.taskStatus as WorkflowTaskStatus, actionById: input.actor.id, comment: input.comment, completedAt: new Date() }
      });
      await tx.workflowTask.updateMany({
        where: { instanceId: task.instanceId, status: WorkflowTaskStatus.WAITING },
        data: { status: WorkflowTaskStatus.CANCELLED }
      });
      return tx.workflowInstance.update({
        where: { id: task.instanceId },
        data: { currentNodeKey: null, status: WorkflowInstanceStatus.REJECTED, completedAt: new Date() },
        include: { tasks: { orderBy: { nodeOrder: "asc" } } }
      });
    }

    await tx.workflowTask.update({ where: { id: task.id }, data: { status: WorkflowTaskStatus.APPROVED, actionById: input.actor.id, comment: input.comment, completedAt: new Date() } });
    const next = task.instance.tasks.find((item) => item.nodeOrder > task.nodeOrder && item.status === WorkflowTaskStatus.WAITING);
    if (next) {
      await tx.workflowTask.update({ where: { id: next.id }, data: { status: WorkflowTaskStatus.PENDING } });
    }
    return tx.workflowInstance.update({
      where: { id: task.instanceId },
      data: next ? { currentNodeKey: next.nodeKey } : { currentNodeKey: null, status: WorkflowInstanceStatus.APPROVED, completedAt: new Date() },
      include: { tasks: { orderBy: { nodeOrder: "asc" } } }
    });
  });
}
