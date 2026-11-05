import { describe, expect, it } from "vitest";
import { DataScopeType, Permission, UserRole } from "@xiangneng/shared";
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

  it("存在受管角色记录但所有范围均撤销或过期时不得回退旧分公司字段", () => {
    const now = new Date("2026-08-02T00:00:00.000Z");
    const record = {
      id: "10000000-0000-4000-8000-000000000002",
      username: "revoked-employee",
      displayName: "已撤权员工",
      role: UserRole.INTERNAL_HR,
      branchId: "20000000-0000-4000-8000-000000000001",
      supplierId: null,
      personId: null,
      employeeType: "内部员工",
      projectLinks: [],
      roleAssignments: [{
        status: "REVOKED",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: new Date("2026-07-31T23:59:59.000Z"),
        role: { code: UserRole.INTERNAL_HR },
        scopes: []
      }],
      dataScopeBindings: [{
        type: DataScopeType.BRANCH,
        organizationUnitId: null,
        branchId: "20000000-0000-4000-8000-000000000001",
        projectId: null,
        supplierId: null,
        isActive: false,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: new Date("2026-07-31T23:59:59.000Z")
      }]
    } as unknown as SessionUserRecord;

    const session = toSessionUser(record, now);
    expect(session.scopeBindings).toEqual([]);
    expect(session.roles).toEqual([]);
    expect(session.permissions).not.toContain(Permission.PEOPLE_READ);
  });
});
