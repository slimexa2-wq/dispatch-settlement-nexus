import { describe, expect, it, vi } from "vitest";
import {
  assertPositionRoleBindingsAssignable,
  clearPositionAuthorizations,
  revokePositionAuthorizations,
  syncPositionAuthorizations,
  type PositionAuthorizationDb
} from "../src/services/position-authorizations.js";

function db(overrides: Partial<PositionAuthorizationDb> = {}): PositionAuthorizationDb {
  return {
    positionRoleBinding: { findMany: vi.fn().mockResolvedValue([]) },
    organizationUnit: { findUnique: vi.fn().mockResolvedValue(null) },
    userRoleAssignment: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "assignment" })
    },
    dataScopeBinding: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "scope" })
    },
    user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...overrides
  };
}

describe("岗位自动授权", () => {
  it("只撤销岗位来源授权，保留人工和临时授权", async () => {
    const roleUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const scopeUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const store = db({
      userRoleAssignment: {
        updateMany: roleUpdateMany,
        create: vi.fn().mockResolvedValue({ id: "assignment" })
      },
      dataScopeBinding: {
        updateMany: scopeUpdateMany,
        create: vi.fn().mockResolvedValue({ id: "scope" })
      }
    });

    await revokePositionAuthorizations(store, {
      userId: "user-1",
      actorId: "actor-1",
      effectiveAt: new Date("2026-08-01T00:00:00.000Z")
    });

    expect(scopeUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        isActive: true,
        roleAssignment: { source: "POSITION" }
      },
      data: expect.objectContaining({ isActive: false, revokedById: "actor-1" })
    });
    expect(roleUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "ACTIVE", source: "POSITION" },
      data: expect.objectContaining({ status: "REVOKED", revokedById: "actor-1" })
    });
  });


  it("管理员清空岗位配置时撤销岗位授权并刷新登录令牌", async () => {
    const roleUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const scopeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const store = db({
      userRoleAssignment: {
        updateMany: roleUpdateMany,
        create: vi.fn().mockResolvedValue({ id: "assignment" })
      },
      dataScopeBinding: {
        updateMany: scopeUpdateMany,
        create: vi.fn().mockResolvedValue({ id: "scope" })
      },
      user: { updateMany: userUpdateMany }
    });

    await clearPositionAuthorizations(store, {
      userId: "user-1",
      actorId: "actor-1",
      effectiveAt: new Date("2026-08-01T00:00:00.000Z")
    });

    expect(roleUpdateMany).toHaveBeenCalledOnce();
    expect(scopeUpdateMany).toHaveBeenCalledOnce();
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-1", isActive: true },
      data: { tokenVersion: { increment: 1 } }
    });
  });

  it("按岗位绑定创建本人、部门和中心范围，不再写入分公司归属", async () => {
    const assignmentCreate = vi
      .fn()
      .mockResolvedValueOnce({ id: "assignment-employee" })
      .mockResolvedValueOnce({ id: "assignment-clerk" })
      .mockResolvedValueOnce({ id: "assignment-manager" });
    const scopeCreate = vi.fn().mockResolvedValue({ id: "scope" });
    const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const store = db({
      positionRoleBinding: {
        findMany: vi.fn().mockResolvedValue([
          { id: "binding-employee", roleId: "role-employee", scopeType: "SELF" },
          { id: "binding-clerk", roleId: "role-clerk", scopeType: "ORG_UNIT" },
          { id: "binding-manager", roleId: "role-manager", scopeType: "CENTER" }
        ])
      },
      organizationUnit: {
        findUnique: vi.fn().mockResolvedValue({
          id: "dept-1",
          type: "DEPARTMENT",
          parent: { id: "center-1", type: "CENTER" }
        })
      },
      userRoleAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: assignmentCreate
      },
      dataScopeBinding: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: scopeCreate
      },
      user: { updateMany: userUpdateMany }
    });

    const result = await syncPositionAuthorizations(store, {
      userId: "user-1",
      actorId: "actor-1",
      positionId: "position-1",
      organizationUnitId: "dept-1",
      effectiveAt: new Date("2026-08-01T00:00:00.000Z")
    });

    expect(result.createdAssignments).toBe(3);
    expect(assignmentCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        userId: "user-1",
        roleId: "role-employee",
        source: "POSITION",
        positionRoleBindingId: "binding-employee"
      })
    });
    expect(scopeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        roleAssignmentId: "assignment-clerk",
        type: "ORG_UNIT",
        organizationUnitId: "dept-1"
      })
    });
    expect(scopeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        roleAssignmentId: "assignment-manager",
        type: "CENTER",
        organizationUnitId: "center-1"
      })
    });
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-1", isActive: true },
      data: { tokenVersion: { increment: 1 } }
    });
  });
});


describe("岗位授权防越权", () => {
  it("非系统管理员不能通过岗位配置授予系统管理员角色", () => {
    expect(() => assertPositionRoleBindingsAssignable(
      ["INTERNAL_HR"],
      [{ roleCode: "SYSTEM_ADMIN", scopeType: "SELF" }]
    )).toThrowError(expect.objectContaining({ code: "POSITION_BINDING_ESCALATION" }));
  });

  it("非系统管理员不能授予集团角色或集团数据范围", () => {
    expect(() => assertPositionRoleBindingsAssignable(
      ["INTERNAL_HR"],
      [{ roleCode: "GROUP_LEADER", scopeType: "ORG_UNIT" }]
    )).toThrowError(expect.objectContaining({ code: "POSITION_BINDING_ESCALATION" }));

    expect(() => assertPositionRoleBindingsAssignable(
      ["INTERNAL_HR"],
      [{ roleCode: "DEPARTMENT_MANAGER", scopeType: "GROUP" }]
    )).toThrowError(expect.objectContaining({ code: "POSITION_BINDING_ESCALATION" }));
  });


  it("拒绝内部岗位继续配置分公司数据范围", () => {
    expect(() => assertPositionRoleBindingsAssignable(
      ["SYSTEM_ADMIN"],
      [{ roleCode: "DEPARTMENT_MANAGER", scopeType: "BRANCH" }]
    )).toThrowError(expect.objectContaining({ code: "POSITION_BINDING_BRANCH_SCOPE_UNSUPPORTED" }));
  });

  it("系统管理员可以配置集团级岗位授权", () => {
    expect(() => assertPositionRoleBindingsAssignable(
      ["SYSTEM_ADMIN"],
      [{ roleCode: "GROUP_LEADER", scopeType: "GROUP" }]
    )).not.toThrow();
  });
});
