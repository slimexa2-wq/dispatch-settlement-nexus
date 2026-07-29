import { describe, expect, it } from "vitest";
import { DataScopeType, Permission, UserRole, type SessionUser } from "@xiangneng/shared";
import { authorizationForPermission } from "../src/authorization.js";

function scope(branchId: string) {
  return {
    type: DataScopeType.BRANCH,
    organizationUnitId: null,
    branchId,
    projectId: null,
    supplierId: null
  } as const;
}

describe("按权限隔离角色数据范围", () => {
  it("财务审核权限不能借用招聘角色绑定的分公司范围", () => {
    const financeScope = scope("branch-finance");
    const recruiterScope = scope("branch-recruitment");
    const user = {
      id: "user-1",
      username: "multi-role",
      displayName: "多角色用户",
      role: UserRole.FINANCE_REVIEWER,
      roles: [UserRole.FINANCE_REVIEWER, UserRole.RECRUITER],
      branchId: null,
      supplierId: null,
      personId: null,
      employeeType: "内部员工",
      projectIds: [],
      permissions: [Permission.REIMBURSEMENT_FINANCE_REVIEW, Permission.PEOPLE_READ],
      scopeBindings: [financeScope, recruiterScope],
      authorizationGrants: [
        {
          role: UserRole.FINANCE_REVIEWER,
          permissions: [Permission.REIMBURSEMENT_FINANCE_REVIEW],
          scopeBindings: [financeScope]
        },
        {
          role: UserRole.RECRUITER,
          permissions: [Permission.PEOPLE_READ],
          scopeBindings: [recruiterScope]
        }
      ]
    } satisfies SessionUser;

    const scoped = authorizationForPermission(
      user,
      Permission.REIMBURSEMENT_FINANCE_REVIEW
    );

    expect(scoped.roles).toEqual([UserRole.FINANCE_REVIEWER]);
    expect(scoped.scopeBindings).toEqual([financeScope]);
    expect(scoped.scopeBindings).not.toContainEqual(recruiterScope);
  });
});

it("多个报销权限只合并持有报销权限的授权范围", async () => {
  const { authorizationForAnyPermission } = await import("../src/authorization.js");
  const financeScope = scope("branch-finance");
  const approvalScope = scope("branch-approval");
  const unrelatedScope = scope("branch-unrelated");
  const user = {
    id: "user-2",
    username: "reimbursement-multi-role",
    displayName: "报销多角色用户",
    role: UserRole.FINANCE_REVIEWER,
    roles: [UserRole.FINANCE_REVIEWER, UserRole.DEPARTMENT_MANAGER, UserRole.RECRUITER],
    branchId: null,
    supplierId: null,
    personId: null,
    employeeType: "内部员工",
    projectIds: [],
    permissions: [
      Permission.REIMBURSEMENT_FINANCE_REVIEW,
      Permission.REIMBURSEMENT_APPROVE,
      Permission.PEOPLE_READ
    ],
    scopeBindings: [financeScope, approvalScope, unrelatedScope],
    authorizationGrants: [
      {
        role: UserRole.FINANCE_REVIEWER,
        permissions: [Permission.REIMBURSEMENT_FINANCE_REVIEW],
        scopeBindings: [financeScope]
      },
      {
        role: UserRole.DEPARTMENT_MANAGER,
        permissions: [Permission.REIMBURSEMENT_APPROVE],
        scopeBindings: [approvalScope]
      },
      {
        role: UserRole.RECRUITER,
        permissions: [Permission.PEOPLE_READ],
        scopeBindings: [unrelatedScope]
      }
    ]
  } satisfies SessionUser;

  const scoped = authorizationForAnyPermission(user, [
    Permission.REIMBURSEMENT_APPROVE,
    Permission.REIMBURSEMENT_FINANCE_REVIEW
  ]);

  expect(scoped.scopeBindings).toEqual([financeScope, approvalScope]);
  expect(scoped.scopeBindings).not.toContainEqual(unrelatedScope);
});
