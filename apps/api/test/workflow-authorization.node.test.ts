import assert from "node:assert/strict";
import test from "node:test";
import { canSessionActOnWorkflowNode } from "../src/services/workflow-authorization.ts";

const departmentNode = {
  key: "department",
  type: "APPROVAL" as const,
  name: "部门负责人审批",
  assignee: { type: "DEPARTMENT_MANAGER" as const }
};

const manager = {
  id: "manager-1",
  roles: ["DEPARTMENT_MANAGER"],
  scopeBindings: [
    { type: "ORG_UNIT", organizationUnitId: "dept-a", branchId: null, projectId: null, supplierId: null }
  ]
};

test("部门负责人只能处理自己部门范围内的审批", () => {
  assert.equal(canSessionActOnWorkflowNode(manager, departmentNode, null, { organizationUnitId: "dept-a" }), true);
  assert.equal(canSessionActOnWorkflowNode(manager, departmentNode, null, { organizationUnitId: "dept-b" }), false);
});

test("审批任务已明确指派人员时只允许该人员处理", () => {
  assert.equal(canSessionActOnWorkflowNode(manager, departmentNode, "manager-1", { organizationUnitId: "dept-b" }), true);
  assert.equal(canSessionActOnWorkflowNode(manager, departmentNode, "manager-2", { organizationUnitId: "dept-a" }), false);
});

test("旧流程没有组织上下文时保留按角色审批的兼容行为", () => {
  assert.equal(canSessionActOnWorkflowNode(manager, departmentNode, null, {}), true);
});
