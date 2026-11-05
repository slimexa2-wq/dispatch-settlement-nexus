import { describe, expect, it } from "vitest";
import {
  DataScopeType,
  Permission,
  UserRole,
  type SessionUser
} from "@xiangneng/shared";
import {
  applicationWhere,
  personWhere,
  projectWhere
} from "../src/data-scope.js";

function session(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user-1",
    username: "tester",
    displayName: "测试用户",
    role: UserRole.INTERNAL_HR,
    roles: [UserRole.INTERNAL_HR],
    branchId: null,
    supplierId: null,
    personId: null,
    employeeType: null,
    projectIds: [],
    permissions: [Permission.PEOPLE_READ],
    scopeBindings: [],
    ...overrides
  };
}

describe("数据库查询范围", () => {
  it("新角色没有任何范围绑定时默认拒绝，不返回全库条件", () => {
    expect(projectWhere(session())).toEqual({
      id: "00000000-0000-0000-0000-000000000000"
    });
    expect(personWhere(session())).toEqual({
      id: "00000000-0000-0000-0000-000000000000"
    });
  });

  it("分公司范围由服务端登录态生成项目、人员和招聘查询条件", () => {
    const user = session({
      scopeBindings: [
        {
          type: DataScopeType.BRANCH,
          organizationUnitId: null,
          branchId: "branch-a",
          projectId: null,
          supplierId: null
        }
      ]
    });

    for (const where of [
      projectWhere(user),
      personWhere(user),
      applicationWhere(user)
    ]) {
      const serialized = JSON.stringify(where);
      expect(serialized).toContain("branchId");
      expect(serialized).toContain("branch-a");
    }
  });

  it("集团范围允许全库，项目范围只命中绑定项目", () => {
    expect(
      projectWhere(
        session({
          roles: [UserRole.GROUP_LEADER],
          role: UserRole.GROUP_LEADER,
          scopeBindings: [
            {
              type: DataScopeType.GROUP,
              organizationUnitId: null,
              branchId: null,
              projectId: null,
              supplierId: null
            }
          ]
        })
      )
    ).toEqual({});

    expect(
      projectWhere(
        session({
          role: UserRole.PROJECT_OPERATOR,
          roles: [UserRole.PROJECT_OPERATOR],
          scopeBindings: [
            {
              type: DataScopeType.PROJECT,
              organizationUnitId: null,
              branchId: null,
              projectId: "project-a",
              supplierId: null
            }
          ]
        })
      )
    ).toEqual({ id: { in: ["project-a"] } });
  });
});
