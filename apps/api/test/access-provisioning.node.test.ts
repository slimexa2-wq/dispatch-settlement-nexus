import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccessProvisionPlan,
  validateAccessRequest
} from "../src/services/access-provisioning.ts";

test("权限申请同时描述端口角色数据范围和有效期", () => {
  const input = {
    subjectUserId: "user-1",
    portals: ["ADMIN", "INTERNAL_MINIAPP"],
    roles: ["INTERNAL_HR"],
    scopes: [{ type: "ORG_UNIT", entityId: "dept-1" }],
    validFrom: "2026-07-29T00:00:00.000Z",
    validTo: "2026-08-29T00:00:00.000Z",
    reason: "临时协助数据迁移"
  } as const;
  assert.deepEqual(validateAccessRequest(input), []);
  const plan = buildAccessProvisionPlan(input);
  assert.equal(plan.portalChanges.length, 2);
  assert.equal(plan.roleAssignments.length, 1);
  assert.equal(plan.scopeBindings.length, 1);
  assert.equal(plan.temporary, true);
});

test("集团权限和无期限高风险权限必须进入高风险审批", () => {
  const plan = buildAccessProvisionPlan({
    subjectUserId: "user-2",
    portals: ["ADMIN"],
    roles: ["SYSTEM_ADMIN"],
    scopes: [{ type: "GROUP" }],
    validFrom: "2026-07-29T00:00:00.000Z",
    validTo: null,
    reason: "系统维护"
  });
  assert.equal(plan.riskLevel, "HIGH");
  assert.equal(plan.requiresApproval, true);
});

test("项目范围必须提供目标ID且结束时间不能早于开始时间", () => {
  const errors = validateAccessRequest({
    subjectUserId: "user-3",
    portals: ["SUPPLIER_MINIAPP"],
    roles: ["SUPPLIER"],
    scopes: [{ type: "PROJECT" }],
    validFrom: "2026-08-01T00:00:00.000Z",
    validTo: "2026-07-01T00:00:00.000Z",
    reason: "测试"
  });
  assert.ok(errors.some((item) => item.code === "SCOPE_TARGET_REQUIRED"));
  assert.ok(errors.some((item) => item.code === "INVALID_VALIDITY_RANGE"));
});

test("重复端口角色和数据范围在开通计划中只保留一次", () => {
  const plan = buildAccessProvisionPlan({
    subjectUserId: "user-4",
    portals: ["ADMIN", "ADMIN"],
    roles: ["INTERNAL_HR", "INTERNAL_HR"],
    scopes: [
      { type: "ORG_UNIT", entityId: "dept-1" },
      { type: "ORG_UNIT", entityId: "dept-1" },
      { type: "SELF" },
      { type: "SELF", entityId: null }
    ],
    validFrom: "2026-07-29T00:00:00.000Z",
    validTo: null,
    reason: "防止重复授权"
  });
  assert.equal(plan.portalChanges.length, 1);
  assert.equal(plan.roleAssignments.length, 1);
  assert.deepEqual(plan.scopeBindings.map((item) => `${item.type}:${item.entityId ?? ""}`), ["ORG_UNIT:dept-1", "SELF:"]);
});
