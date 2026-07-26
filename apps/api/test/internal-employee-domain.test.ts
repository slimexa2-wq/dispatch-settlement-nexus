import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { AppError } from "../src/errors.js";
import {
  deleteInternalEmployee,
  offboardInternalEmployee,
  transferInternalEmployee
} from "../src/services/internal-employees.js";

function transactionClient(overrides: Record<string, unknown>): PrismaClient {
  const client = {
    $transaction: async (callback: (tx: unknown) => unknown) => callback(client),
    ...overrides
  };
  return client as unknown as PrismaClient;
}

describe("内部员工生命周期", () => {
  it("调动会关闭旧任职、撤销旧范围并创建新任职和变更记录", async () => {
    const employmentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const employmentCreate = vi.fn().mockResolvedValue({ id: "employment-new" });
    const scopeUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const scopeCreate = vi.fn().mockResolvedValue({ id: "scope-new" });
    const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const employeeUpdate = vi.fn().mockResolvedValue({
      id: "employee-1",
      organizationUnitId: "org-b",
      positionId: "position-b",
      branchId: "branch-b",
      version: 4
    });
    const changeCreate = vi.fn().mockResolvedValue({ id: "change-1" });
    const db = transactionClient({
      internalEmployee: {
        findUnique: vi.fn().mockResolvedValue({
          id: "employee-1",
          userId: "user-1",
          status: "ACTIVE",
          organizationUnitId: "org-a",
          positionId: "position-a",
          branchId: "branch-a",
          version: 3
        }),
        update: employeeUpdate
      },
      internalEmployment: {
        updateMany: employmentUpdateMany,
        create: employmentCreate
      },
      dataScopeBinding: { updateMany: scopeUpdateMany, create: scopeCreate },
      user: { updateMany: userUpdateMany },
      internalEmployeeChange: { create: changeCreate }
    });

    await transferInternalEmployee(db, {
      employeeId: "employee-1",
      actorId: "actor-1",
      expectedVersion: 3,
      effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
      organizationUnitId: "org-b",
      positionId: "position-b",
      branchId: "branch-b",
      reason: "组织调动"
    });

    expect(employmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ employeeId: "employee-1", endedAt: null })
      })
    );
    expect(scopeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: { internalEmployee: { id: "employee-1" } } })
      })
    );
    expect(scopeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "BRANCH",
        branchId: "branch-b",
        createdById: "actor-1"
      })
    });
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-1", isActive: true },
      data: {
        branchId: "branch-b",
        tokenVersion: { increment: 1 }
      }
    });
    expect(employmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: "employee-1",
          organizationUnitId: "org-b",
          positionId: "position-b"
        })
      })
    );
    expect(changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "TRANSFER", actorId: "actor-1" })
      })
    );
  });

  it("离职会一次事务关闭任职并撤销账号角色和数据范围", async () => {
    const employmentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const roleUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const scopeUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = transactionClient({
      internalEmployee: {
        findUnique: vi.fn().mockResolvedValue({
          id: "employee-1",
          userId: "user-1",
          status: "ACTIVE",
          version: 2
        }),
        update: vi.fn().mockResolvedValue({ id: "employee-1", status: "LEFT" })
      },
      internalEmployment: { updateMany: employmentUpdateMany },
      userRoleAssignment: { updateMany: roleUpdateMany },
      dataScopeBinding: { updateMany: scopeUpdateMany },
      user: { updateMany: userUpdateMany },
      internalEmployeeChange: { create: vi.fn().mockResolvedValue({ id: "change-1" }) }
    });

    await offboardInternalEmployee(db, {
      employeeId: "employee-1",
      actorId: "actor-1",
      expectedVersion: 2,
      offboardDate: new Date("2026-08-10T00:00:00.000Z"),
      reason: "个人原因"
    });

    expect(employmentUpdateMany).toHaveBeenCalledOnce();
    expect(roleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", status: "ACTIVE" } })
    );
    expect(scopeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", isActive: true } })
    );
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) })
    );
  });

  it("存在任职、变更或账号关联时禁止物理删除", async () => {
    const deleteCall = vi.fn();
    const db = transactionClient({
      internalEmployee: {
        findUnique: vi.fn().mockResolvedValue({
          id: "employee-1",
          userId: null,
          _count: { employments: 1, changes: 2 }
        }),
        delete: deleteCall
      }
    });

    await expect(
      deleteInternalEmployee(db, { employeeId: "employee-1", actorId: "actor-1" })
    ).rejects.toMatchObject<AppError>({
      statusCode: 409,
      code: "INTERNAL_EMPLOYEE_HAS_RELATIONS"
    });
    expect(deleteCall).not.toHaveBeenCalled();
  });

  it("乐观锁版本不一致时拒绝覆盖他人刚完成的调动", async () => {
    const db = transactionClient({
      internalEmployee: {
        findUnique: vi.fn().mockResolvedValue({
          id: "employee-1",
          status: "ACTIVE",
          version: 5
        })
      }
    });

    await expect(
      transferInternalEmployee(db, {
        employeeId: "employee-1",
        actorId: "actor-1",
        expectedVersion: 4,
        effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
        organizationUnitId: "org-b",
        positionId: "position-b",
        branchId: "branch-b",
        reason: "组织调动"
      })
    ).rejects.toMatchObject<AppError>({
      statusCode: 409,
      code: "STALE_EMPLOYEE_VERSION"
    });
  });
});
