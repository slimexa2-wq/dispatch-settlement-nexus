import { describe, expect, it } from "vitest";
import { UserRole, type SessionUser } from "@xiangneng/shared";
import { allowedAiSkills } from "../src/ai/permissions.js";

function session(role: SessionUser["role"]): SessionUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    username: "demo",
    displayName: "演示用户",
    role,
    roles: [role],
    branchId: null,
    supplierId: null,
    personId: null,
    employeeType: null,
    projectIds: [],
    permissions: [],
    scopeBindings: []
  };
}

describe("AI 角色别名映射", () => {
  it("集团领导和超级管理员分别获得只读与受控写能力", () => {
    expect(allowedAiSkills(session(UserRole.GROUP_LEADER))).toEqual([
      "project_personnel_statistics",
      "employee_information_query",
      "recruitment_progress_query"
    ]);
    expect(allowedAiSkills(session(UserRole.SUPER_ADMIN))).toEqual(expect.arrayContaining([
      "employee_entry",
      "employee_resignation"
    ]));
  });

  it("供应商管理员和外包员工沿用供应商与本人只读能力", () => {
    expect(allowedAiSkills(session(UserRole.SUPPLIER_ADMIN))).toEqual([
      "employee_information_query"
    ]);
    expect(allowedAiSkills(session(UserRole.OUTSOURCED_EMPLOYEE))).toEqual([
      "employee_information_query"
    ]);
  });
});
