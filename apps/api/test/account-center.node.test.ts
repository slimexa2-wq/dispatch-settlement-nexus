import assert from "node:assert/strict";
import test from "node:test";
import {
  accountCategory,
  mergeAccountCandidates,
  normalizePortalAccess
} from "../src/services/account-center.ts";

test("同一主账号可以同时开通后台和多个小程序端口", () => {
  const accesses = normalizePortalAccess([
    { portal: "ADMIN", enabled: true },
    { portal: "INTERNAL_MINIAPP", enabled: true },
    { portal: "ADMIN", enabled: true }
  ]);
  assert.deepEqual(accesses.map((item) => item.portal), ["ADMIN", "INTERNAL_MINIAPP"]);
});

test("账户按真实关联对象分类而不是只看单一角色", () => {
  assert.equal(accountCategory({ internalEmployeeId: "ie-1" }), "INTERNAL_EMPLOYEE");
  assert.equal(accountCategory({ supplierId: "supplier-1" }), "SUPPLIER");
  assert.equal(accountCategory({ personId: "person-1", employmentStatus: "ACTIVE" }), "OUTSOURCED_EMPLOYEE");
  assert.equal(accountCategory({ personId: "person-2", employmentStatus: "APPLICANT" }), "JOB_SEEKER");
});

test("重复账户合并保留全部端口和微信绑定并选用活跃主账号", () => {
  const merged = mergeAccountCandidates([
    {
      id: "disabled",
      isActive: false,
      portals: [{ portal: "ADMIN", enabled: true }],
      wechatMiniappOpenId: null
    },
    {
      id: "active",
      isActive: true,
      portals: [{ portal: "INTERNAL_MINIAPP", enabled: true }],
      wechatMiniappOpenId: "openid"
    }
  ]);
  assert.equal(merged.primaryAccountId, "active");
  assert.deepEqual(merged.portals.map((item) => item.portal), ["ADMIN", "INTERNAL_MINIAPP"]);
  assert.equal(merged.wechatMiniappOpenId, "openid");
  assert.deepEqual(merged.deactivateAccountIds, ["disabled"]);
});

test("账户列表布尔查询不会把字符串false误判成true", async () => {
  const { parseOptionalBooleanQuery } = await import("../src/services/account-center.ts");
  assert.equal(parseOptionalBooleanQuery("false"), false);
  assert.equal(parseOptionalBooleanQuery("0"), false);
  assert.equal(parseOptionalBooleanQuery("true"), true);
  assert.equal(parseOptionalBooleanQuery("1"), true);
  assert.equal(parseOptionalBooleanQuery(undefined), undefined);
});

test("账户类别筛选在分页前生成数据库条件", async () => {
  const { accountCategoryWhere } = await import("../src/services/account-center.ts");
  assert.deepEqual(accountCategoryWhere("INTERNAL_EMPLOYEE"), { internalEmployee: { isNot: null } });
  assert.deepEqual(accountCategoryWhere("SUPPLIER"), { supplierId: { not: null } });
  assert.deepEqual(accountCategoryWhere("OUTSOURCED_EMPLOYEE"), { person: { is: { status: "ACTIVE" } } });
  assert.deepEqual(accountCategoryWhere("JOB_SEEKER"), { person: { is: { status: { not: "ACTIVE" } } } });
  assert.deepEqual(accountCategoryWhere("SYSTEM"), { internalEmployee: { is: null }, supplierId: null, personId: null });
});

test("端口账户在存在精细配置后只允许有效期内已开通的端口登录", async () => {
  const { hasCurrentPortalAccess } = await import("../src/services/account-center.ts");
  const now = new Date("2026-07-29T00:00:00.000Z");
  assert.equal(hasCurrentPortalAccess([], "ADMIN", now), true, "没有端口配置时兼容旧账号");
  assert.equal(hasCurrentPortalAccess([{ portal: "EMPLOYEE_MINIAPP", enabled: true }], "ADMIN", now), false);
  assert.equal(hasCurrentPortalAccess([{ portal: "ADMIN", enabled: true, validFrom: "2026-07-01T00:00:00.000Z", validTo: "2026-08-01T00:00:00.000Z" }], "ADMIN", now), true);
  assert.equal(hasCurrentPortalAccess([{ portal: "ADMIN", enabled: true, validTo: "2026-07-01T00:00:00.000Z" }], "ADMIN", now), false);
});

test("账户列表不会把已过期端口显示为仍然启用", () => {
  const accesses = normalizePortalAccess([
    { portal: "ADMIN", enabled: true, validTo: "2026-07-01T00:00:00.000Z" }
  ], new Date("2026-07-29T00:00:00.000Z"));
  assert.equal(accesses[0]?.enabled, false);
});


test("管理员不能停用自己或移除自己的后台入口", async () => {
  const { validateSelfAccountMutation } = await import("../src/services/account-center.ts");
  assert.equal(validateSelfAccountMutation({ actorId: "user-1", targetUserId: "user-1", action: "DISABLE" }), "不能停用当前登录账户");
  assert.equal(validateSelfAccountMutation({
    actorId: "user-1",
    targetUserId: "user-1",
    portals: [{ portal: "ADMIN", enabled: false }]
  }), "不能移除当前登录账户的电脑后台入口");
  assert.equal(validateSelfAccountMutation({ actorId: "user-1", targetUserId: "user-2", action: "DISABLE" }), null);
});
