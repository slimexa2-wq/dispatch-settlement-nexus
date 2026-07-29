import type { WorkflowNode } from "./workflow-designer.js";

export type WorkflowActor = {
  id: string;
  roles: readonly string[];
  scopeBindings?: readonly Array<{
    type: string;
    organizationUnitId?: string | null;
    branchId?: string | null;
    projectId?: string | null;
    supplierId?: string | null;
  }>;
};

function contextId(context: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = context[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function hasOrganizationScope(user: WorkflowActor, organizationUnitId: string, centerId: string | null): boolean {
  return (user.scopeBindings ?? []).some((scope) => {
    if (scope.type === "GROUP") return true;
    if (scope.type === "ORG_UNIT" && scope.organizationUnitId === organizationUnitId) return true;
    return Boolean(centerId && scope.type === "CENTER" && scope.organizationUnitId === centerId);
  });
}

export function canSessionActOnWorkflowNode(
  user: WorkflowActor,
  node: WorkflowNode,
  assignedToUserId?: string | null,
  context: Record<string, unknown> = {}
): boolean {
  if (assignedToUserId) return assignedToUserId === user.id;

  const type = node.assignee?.type;
  const refId = node.assignee?.refId;
  if (type === "ROLE") return Boolean(refId && user.roles.includes(refId));
  if (type === "POSITION") return false;

  if (type === "DEPARTMENT_MANAGER" || type === "DIRECT_MANAGER") {
    const hasManagerRole = user.roles.some((role) => ["DEPARTMENT_MANAGER", "BRANCH_MANAGER", "HEADQUARTERS_MANAGER", "GROUP_LEADER"].includes(role));
    if (!hasManagerRole) return false;
    const organizationUnitId = contextId(context, "organizationUnitId", "subjectOrganizationUnitId");
    if (!organizationUnitId) return true;
    const centerId = contextId(context, "centerId", "subjectCenterId");
    return hasOrganizationScope(user, organizationUnitId, centerId);
  }

  if (type === "FINANCE_REVIEWER") {
    return user.roles.some((role) => ["FINANCE_REVIEWER", "HEADQUARTERS_MANAGER", "GROUP_LEADER"].includes(role));
  }
  if (type === "SYSTEM_ADMIN") return user.roles.some((role) => ["SYSTEM_ADMIN", "SUPER_ADMIN"].includes(role));
  if (type === "USER") return false;
  return false;
}
