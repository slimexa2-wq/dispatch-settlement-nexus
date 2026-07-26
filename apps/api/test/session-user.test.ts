import { describe, expect, it } from "vitest";
import { DataScopeType, UserRole } from "@xiangneng/shared";
import {
  toSessionUser,
  type SessionUserRecord
} from "../src/session-user.js";

describe("登录态数据范围", () => {
  it("调动后的活动顶层范围优先于用户旧分公司字段，撤权不会被旧字段恢复", () => {
    const now = new Date("2026-08-02T00:00:00.000Z");
    const record = {
      id: "10000000-0000-4000-8000-000000000001",
      username: "employee",
      displayName: "测试员工",
      role: UserRole.INTERNAL_HR,
      branchId: "20000000-0000-4000-8000-000000000001",
      supplierId: null,
      personId: null,
      employeeType: "内部员工",
      projectLinks: [],
      roleAssignments: [{
        status: "ACTIVE",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null,
        role: { code: UserRole.INTERNAL_HR },
        scopes: []
      }],
      dataScopeBindings: [{
        type: DataScopeType.BRANCH,
        organizationUnitId: null,
        branchId: "20000000-0000-4000-8000-000000000002",
        projectId: null,
        supplierId: null,
        isActive: true,
        validFrom: new Date("2026-08-01T00:00:00.000Z"),
        validTo: null
      }]
    } as unknown as SessionUserRecord;

    expect(toSessionUser(record, now).scopeBindings).toEqual([
      expect.objectContaining({
        type: DataScopeType.BRANCH,
        branchId: "20000000-0000-4000-8000-000000000002"
      })
    ]);
  });
});
