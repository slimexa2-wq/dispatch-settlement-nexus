export type WorkflowNodeType = "START" | "APPROVAL" | "CC" | "END";
export type WorkflowAssigneeType =
  | "USER"
  | "ROLE"
  | "POSITION"
  | "DEPARTMENT_MANAGER"
  | "DIRECT_MANAGER"
  | "FINANCE_REVIEWER"
  | "SYSTEM_ADMIN";
export type WorkflowConditionOperator = "EQ" | "NE" | "GT" | "GTE" | "LT" | "LTE" | "IN" | "CONTAINS";

export type WorkflowCondition = {
  field: string;
  operator: WorkflowConditionOperator;
  value: unknown;
};

export type WorkflowNode = {
  key: string;
  type: WorkflowNodeType;
  name: string;
  assignee?: { type: WorkflowAssigneeType; refId?: string | null };
  mode?: "ANY" | "ALL";
  conditions?: WorkflowCondition[];
  allowReturn?: boolean;
  timeoutHours?: number | null;
};

export type WorkflowDefinition = {
  name: string;
  nodes: WorkflowNode[];
};

export type WorkflowValidationError = { code: string; message: string; nodeKey?: string };

export function normalizeWorkflowDefinition(input: WorkflowDefinition): WorkflowDefinition {
  return {
    name: input.name.trim(),
    nodes: input.nodes.map((node, index) => ({
      ...node,
      key: node.key.trim() || `node_${index + 1}`,
      name: node.name.trim(),
      mode: node.mode ?? "ANY",
      conditions: node.conditions ?? [],
      allowReturn: node.allowReturn ?? true,
      timeoutHours: node.timeoutHours ?? null
    }))
  };
}

export function validateWorkflowDefinition(input: WorkflowDefinition): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = [];
  if (!input.name.trim()) errors.push({ code: "NAME_REQUIRED", message: "流程名称不能为空" });
  const keys = new Set<string>();
  for (const node of input.nodes) {
    if (keys.has(node.key)) errors.push({ code: "DUPLICATE_NODE_KEY", message: `节点标识重复：${node.key}`, nodeKey: node.key });
    keys.add(node.key);
    if (!node.name.trim()) errors.push({ code: "NODE_NAME_REQUIRED", message: "节点名称不能为空", nodeKey: node.key });
    if (node.type === "APPROVAL" && !node.assignee) {
      errors.push({ code: "ASSIGNEE_REQUIRED", message: "审批节点必须设置审批人", nodeKey: node.key });
    }
    if (node.type === "APPROVAL" && node.assignee && ["USER", "ROLE", "POSITION"].includes(node.assignee.type) && !node.assignee.refId) {
      errors.push({ code: "ASSIGNEE_REFERENCE_REQUIRED", message: "指定人员、角色或岗位时必须选择具体对象", nodeKey: node.key });
    }
  }
  const starts = input.nodes.filter((node) => node.type === "START");
  const ends = input.nodes.filter((node) => node.type === "END");
  if (starts.length !== 1) errors.push({ code: "START_NODE_REQUIRED", message: "流程必须且只能有一个发起节点" });
  if (ends.length !== 1) errors.push({ code: "END_NODE_REQUIRED", message: "流程必须且只能有一个结束节点" });
  if (input.nodes[0]?.type !== "START") errors.push({ code: "START_NODE_FIRST", message: "发起节点必须位于第一步" });
  if (input.nodes.at(-1)?.type !== "END") errors.push({ code: "END_NODE_LAST", message: "结束节点必须位于最后一步" });
  return errors;
}

function compare(actual: unknown, operator: WorkflowConditionOperator, expected: unknown): boolean {
  switch (operator) {
    case "EQ": return actual === expected;
    case "NE": return actual !== expected;
    case "GT": return Number(actual) > Number(expected);
    case "GTE": return Number(actual) >= Number(expected);
    case "LT": return Number(actual) < Number(expected);
    case "LTE": return Number(actual) <= Number(expected);
    case "IN": return Array.isArray(expected) && expected.includes(actual);
    case "CONTAINS": return Array.isArray(actual)
      ? actual.includes(expected)
      : String(actual ?? "").includes(String(expected ?? ""));
  }
}

function conditionMatches(condition: WorkflowCondition, context: Record<string, unknown>): boolean {
  const path = condition.field.split(".");
  let actual: unknown = context;
  for (const segment of path) {
    if (!actual || typeof actual !== "object") return false;
    actual = (actual as Record<string, unknown>)[segment];
  }
  return compare(actual, condition.operator, condition.value);
}

export function simulateWorkflow(definition: WorkflowDefinition, context: Record<string, unknown>): {
  approvalNodes: WorkflowNode[];
  steps: Array<{ nodeKey: string; nodeName: string; status: "ACTIVE" | "SKIPPED" | "SYSTEM"; reason: string }>;
} {
  const errors = validateWorkflowDefinition(definition);
  if (errors.length) throw new Error(errors.map((item) => item.message).join("；"));
  const steps = definition.nodes.map((node) => {
    if (node.type === "START" || node.type === "END") {
      return { nodeKey: node.key, nodeName: node.name, status: "SYSTEM" as const, reason: "系统节点" };
    }
    const active = (node.conditions ?? []).every((condition) => conditionMatches(condition, context));
    return {
      nodeKey: node.key,
      nodeName: node.name,
      status: active ? "ACTIVE" as const : "SKIPPED" as const,
      reason: active ? "条件满足" : "条件不满足，自动跳过"
    };
  });
  const activeKeys = new Set(steps.filter((step) => step.status === "ACTIVE").map((step) => step.nodeKey));
  return {
    approvalNodes: definition.nodes.filter((node) => node.type === "APPROVAL" && activeKeys.has(node.key)),
    steps
  };
}

export function buildWorkflowTaskPlan(definition: WorkflowDefinition, context: Record<string, unknown>): Array<{
  node: WorkflowNode;
  nodeOrder: number;
  status: "PENDING" | "WAITING";
}> {
  const { approvalNodes } = simulateWorkflow(definition, context);
  return approvalNodes.map((node, nodeOrder) => ({
    node,
    nodeOrder,
    status: nodeOrder === 0 ? "PENDING" : "WAITING"
  }));
}

export function resolveWorkflowDecision(
  node: WorkflowNode,
  decision: "APPROVE" | "REJECT" | "RETURN"
): { taskStatus: "APPROVED" | "REJECTED" | "RETURNED"; instanceStatus: "RUNNING" | "APPROVED" | "REJECTED"; terminal: boolean } {
  if (decision === "RETURN") {
    if (node.allowReturn === false) throw new Error("当前审批环节不允许退回");
    return { taskStatus: "RETURNED", instanceStatus: "REJECTED", terminal: true };
  }
  if (decision === "REJECT") return { taskStatus: "REJECTED", instanceStatus: "REJECTED", terminal: true };
  return { taskStatus: "APPROVED", instanceStatus: "RUNNING", terminal: false };
}
