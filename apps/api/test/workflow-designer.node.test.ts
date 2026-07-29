import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeWorkflowDefinition,
  simulateWorkflow,
  validateWorkflowDefinition
} from "../src/services/workflow-designer.ts";

test("简单审批流按管理员配置顺序执行审批节点", () => {
  const workflow = normalizeWorkflowDefinition({
    name: "权限开通审批",
    nodes: [
      { key: "start", type: "START", name: "发起" },
      { key: "department", type: "APPROVAL", name: "部门负责人", assignee: { type: "DEPARTMENT_MANAGER" } },
      { key: "system", type: "APPROVAL", name: "系统管理员", assignee: { type: "ROLE", refId: "SYSTEM_ADMIN" } },
      { key: "end", type: "END", name: "完成" }
    ]
  });
  assert.deepEqual(validateWorkflowDefinition(workflow), []);
  const result = simulateWorkflow(workflow, { amount: 0, portal: "ADMIN" });
  assert.deepEqual(result.approvalNodes.map((node) => node.key), ["department", "system"]);
});

test("审批节点条件不满足时自动跳过且预览给出原因", () => {
  const workflow = normalizeWorkflowDefinition({
    name: "报销审批",
    nodes: [
      { key: "start", type: "START", name: "发起" },
      {
        key: "leader",
        type: "APPROVAL",
        name: "集团领导",
        assignee: { type: "ROLE", refId: "GROUP_LEADER" },
        conditions: [{ field: "amount", operator: "GT", value: 5000 }]
      },
      { key: "end", type: "END", name: "完成" }
    ]
  });
  const result = simulateWorkflow(workflow, { amount: 3000 });
  assert.deepEqual(result.approvalNodes, []);
  assert.equal(result.steps.find((step) => step.nodeKey === "leader")?.status, "SKIPPED");
});

test("审批流必须只有一个起点和终点且节点标识不能重复", () => {
  const errors = validateWorkflowDefinition({
    name: "错误流程",
    nodes: [
      { key: "same", type: "START", name: "发起" },
      { key: "same", type: "APPROVAL", name: "审批", assignee: { type: "USER", refId: "u1" } }
    ]
  });
  assert.ok(errors.some((item) => item.code === "DUPLICATE_NODE_KEY"));
  assert.ok(errors.some((item) => item.code === "END_NODE_REQUIRED"));
});

test("审批实例只激活第一个审批环节，后续环节保持等待", async () => {
  const { buildWorkflowTaskPlan } = await import("../src/services/workflow-designer.ts");
  const definition = {
    name: "三级审批",
    nodes: [
      { key: "start", type: "START", name: "发起" },
      { key: "manager", type: "APPROVAL", name: "负责人", assignee: { type: "DEPARTMENT_MANAGER" } },
      { key: "finance", type: "APPROVAL", name: "财务", assignee: { type: "FINANCE_REVIEWER" } },
      { key: "end", type: "END", name: "结束" }
    ]
  } as const;
  assert.deepEqual(buildWorkflowTaskPlan(definition, {}).map((item) => item.status), ["PENDING", "WAITING"]);
});

test("管理员关闭退回时审批人不能退回，允许退回时流程结束并要求重新提交", async () => {
  const { resolveWorkflowDecision } = await import("../src/services/workflow-designer.ts");
  assert.throws(
    () => resolveWorkflowDecision({ key: "finance", type: "APPROVAL", name: "财务", assignee: { type: "FINANCE_REVIEWER" }, allowReturn: false }, "RETURN"),
    /不允许退回/
  );
  assert.deepEqual(
    resolveWorkflowDecision({ key: "manager", type: "APPROVAL", name: "部门负责人", assignee: { type: "DEPARTMENT_MANAGER" }, allowReturn: true }, "RETURN"),
    { taskStatus: "RETURNED", instanceStatus: "REJECTED", terminal: true }
  );
});
