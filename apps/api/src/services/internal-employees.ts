import type { PrismaClient } from "../generated/prisma/client.js";
import { AppError, notFound } from "../errors.js";
import {
  clearPositionAuthorizations,
  syncPositionAuthorizations,
  type PositionAuthorizationDb
} from "./position-authorizations.js";

type AsyncDelegate = {
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  findMany(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
};

type InternalEmployeeTx = {
  internalEmployee: AsyncDelegate;
  internalEmployment: AsyncDelegate;
  internalEmployeeChange: AsyncDelegate;
  userRoleAssignment: AsyncDelegate;
  positionRoleBinding: AsyncDelegate;
  organizationUnit: AsyncDelegate;
  dataScopeBinding: AsyncDelegate;
  user: AsyncDelegate;
};

type InternalEmployeeDb = InternalEmployeeTx & {
  $transaction?<T>(
    callback: (tx: InternalEmployeeTx) => Promise<T>
  ): Promise<T>;
};

export type InternalEmployeeTransferInput = {
  employeeId: string;
  actorId: string;
  expectedVersion: number;
  effectiveDate: Date;
  organizationUnitId: string;
  positionId: string;
  jobGradeId?: string | null;
  reason: string;
};

export type InternalEmployeeOffboardInput = {
  employeeId: string;
  actorId: string;
  expectedVersion: number;
  offboardDate: Date;
  reason: string;
};

export type InternalEmployeeDeleteInput = {
  employeeId: string;
  actorId: string;
};

export type InternalEmployeeAccountBindingInput = {
  employeeId: string;
  actorId: string;
  expectedVersion: number;
  userId: string | null;
  effectiveAt: Date;
};


function domainDb(db: PrismaClient): InternalEmployeeDb {
  return db as unknown as InternalEmployeeDb;
}

async function inTransaction<T>(
  db: PrismaClient,
  callback: (tx: InternalEmployeeTx) => Promise<T>
): Promise<T> {
  const adapted = domainDb(db);
  return adapted.$transaction ? adapted.$transaction(callback) : callback(adapted);
}

function assertCurrentVersion(
  employee: Record<string, unknown>,
  expectedVersion: number
): void {
  if (employee.version !== expectedVersion) {
    throw new AppError(
      409,
      "STALE_EMPLOYEE_VERSION",
      "员工档案已被其他操作更新，请刷新后重试",
      { expectedVersion, currentVersion: employee.version }
    );
  }
}


export async function bindInternalEmployeeAccount(
  db: PrismaClient,
  input: InternalEmployeeAccountBindingInput
): Promise<Record<string, unknown>> {
  return inTransaction(db, async (tx) => {
    const employee = await tx.internalEmployee.findUnique({
      where: { id: input.employeeId }
    });
    if (!employee) notFound("内部员工");
    if (employee.status !== "ACTIVE") {
      throw new AppError(409, "EMPLOYEE_NOT_ACTIVE", "仅在职内部员工可以绑定系统账号");
    }
    assertCurrentVersion(employee, input.expectedVersion);

    const previousUserId = typeof employee.userId === "string" ? employee.userId : null;
    if (previousUserId === input.userId) return employee;

    if (input.userId) {
      const targetUser = await tx.user.findUnique({
        where: { id: input.userId }
      });
      if (!targetUser || targetUser.isActive !== true) {
        throw new AppError(409, "ACTIVE_USER_REQUIRED", "只能绑定当前启用的系统账号");
      }
      const linkedEmployee = await tx.internalEmployee.findUnique({
        where: { userId: input.userId }
      });
      if (linkedEmployee && linkedEmployee.id !== input.employeeId) {
        throw new AppError(409, "USER_ALREADY_BOUND_TO_INTERNAL_EMPLOYEE", "该系统账号已绑定其他内部员工");
      }
      if (typeof employee.organizationUnitId !== "string" || typeof employee.positionId !== "string") {
        throw new AppError(409, "EMPLOYEE_POSITION_REQUIRED", "内部员工必须先绑定部门和岗位，才能同步账号权限");
      }
    }

    if (previousUserId) {
      await clearPositionAuthorizations(tx as unknown as PositionAuthorizationDb, {
        userId: previousUserId,
        actorId: input.actorId,
        effectiveAt: input.effectiveAt
      });
    }

    if (input.userId) {
      await syncPositionAuthorizations(tx as unknown as PositionAuthorizationDb, {
        userId: input.userId,
        actorId: input.actorId,
        effectiveAt: input.effectiveAt,
        positionId: String(employee.positionId),
        organizationUnitId: String(employee.organizationUnitId)
      });
    }

    const updated = await tx.internalEmployee.update({
      where: {
        id_version: {
          id: input.employeeId,
          version: input.expectedVersion
        }
      },
      data: {
        userId: input.userId,
        version: { increment: 1 }
      }
    });
    await tx.internalEmployeeChange.create({
      data: {
        employeeId: input.employeeId,
        actorId: input.actorId,
        type: input.userId ? "ACCOUNT_BIND" : "ACCOUNT_UNBIND",
        effectiveAt: input.effectiveAt,
        reason: input.userId ? "绑定系统账号" : "解除系统账号绑定",
        before: { userId: previousUserId, version: input.expectedVersion },
        after: { userId: input.userId, version: input.expectedVersion + 1 }
      }
    });
    return updated;
  });
}

export async function transferInternalEmployee(
  db: PrismaClient,
  input: InternalEmployeeTransferInput
): Promise<Record<string, unknown>> {
  return inTransaction(db, async (tx) => {
    const employee = await tx.internalEmployee.findUnique({
      where: { id: input.employeeId }
    });
    if (!employee) notFound("内部员工");
    if (employee.status !== "ACTIVE") {
      throw new AppError(409, "EMPLOYEE_NOT_ACTIVE", "仅在职内部员工可以办理调动");
    }
    assertCurrentVersion(employee, input.expectedVersion);

    const before = {
      organizationUnitId: employee.organizationUnitId ?? null,
      positionId: employee.positionId ?? null,
      jobGradeId: employee.jobGradeId ?? null,
      version: employee.version
    };

    await tx.internalEmployment.updateMany({
      where: { employeeId: input.employeeId, endedAt: null },
      data: { endedAt: input.effectiveDate, isPrimary: false }
    });
    if (typeof employee.userId === "string") {
      await syncPositionAuthorizations(tx as unknown as PositionAuthorizationDb, {
        userId: employee.userId,
        actorId: input.actorId,
        effectiveAt: input.effectiveDate,
        positionId: input.positionId,
        organizationUnitId: input.organizationUnitId
      });
    }
    await tx.internalEmployment.create({
      data: {
        employeeId: input.employeeId,
        organizationUnitId: input.organizationUnitId,
        positionId: input.positionId,
        jobGradeId: input.jobGradeId ?? null,
        startedAt: input.effectiveDate,
        isPrimary: true
      }
    });
    const updated = await tx.internalEmployee.update({
      where: {
        id_version: {
          id: input.employeeId,
          version: input.expectedVersion
        }
      },
      data: {
        organizationUnitId: input.organizationUnitId,
        positionId: input.positionId,
        jobGradeId: input.jobGradeId ?? null,
        version: { increment: 1 }
      }
    });
    await tx.internalEmployeeChange.create({
      data: {
        employeeId: input.employeeId,
        actorId: input.actorId,
        type: "TRANSFER",
        effectiveAt: input.effectiveDate,
        reason: input.reason,
        before,
        after: {
          organizationUnitId: input.organizationUnitId,
          positionId: input.positionId,
          jobGradeId: input.jobGradeId ?? null,
          version: input.expectedVersion + 1
        }
      }
    });
    return updated;
  });
}

export async function offboardInternalEmployee(
  db: PrismaClient,
  input: InternalEmployeeOffboardInput
): Promise<Record<string, unknown>> {
  return inTransaction(db, async (tx) => {
    const employee = await tx.internalEmployee.findUnique({
      where: { id: input.employeeId }
    });
    if (!employee) notFound("内部员工");
    if (employee.status !== "ACTIVE") {
      throw new AppError(409, "EMPLOYEE_NOT_ACTIVE", "仅在职内部员工可以办理离职");
    }
    assertCurrentVersion(employee, input.expectedVersion);

    await tx.internalEmployment.updateMany({
      where: { employeeId: input.employeeId, endedAt: null },
      data: { endedAt: input.offboardDate, isPrimary: false }
    });
    if (typeof employee.userId === "string") {
      await tx.userRoleAssignment.updateMany({
        where: { userId: employee.userId, status: "ACTIVE" },
        data: {
          status: "REVOKED",
          revokedAt: input.offboardDate,
          revokedById: input.actorId
        }
      });
      await tx.dataScopeBinding.updateMany({
        where: { userId: employee.userId, isActive: true },
        data: {
          isActive: false,
          revokedAt: input.offboardDate,
          revokedById: input.actorId
        }
      });
      await tx.user.updateMany({
        where: { id: employee.userId, isActive: true },
        data: { isActive: false, tokenVersion: { increment: 1 } }
      });
    }
    const updated = await tx.internalEmployee.update({
      where: {
        id_version: {
          id: input.employeeId,
          version: input.expectedVersion
        }
      },
      data: {
        status: "LEFT",
        offboardDate: input.offboardDate,
        offboardReason: input.reason,
        version: { increment: 1 }
      }
    });
    await tx.internalEmployeeChange.create({
      data: {
        employeeId: input.employeeId,
        actorId: input.actorId,
        type: "OFFBOARD",
        effectiveAt: input.offboardDate,
        reason: input.reason,
        before: { status: employee.status, version: employee.version },
        after: {
          status: "LEFT",
          offboardDate: input.offboardDate,
          version: input.expectedVersion + 1
        }
      }
    });
    return updated;
  });
}

export async function deleteInternalEmployee(
  db: PrismaClient,
  input: InternalEmployeeDeleteInput
): Promise<Record<string, unknown>> {
  return inTransaction(db, async (tx) => {
    const employee = await tx.internalEmployee.findUnique({
      where: { id: input.employeeId },
      select: {
        id: true,
        userId: true,
        _count: { select: { employments: true, changes: true } }
      }
    });
    if (!employee) notFound("内部员工");
    const counts = employee._count as
      | { employments?: number; changes?: number }
      | undefined;
    if (
      employee.userId ||
      (counts?.employments ?? 0) > 0 ||
      (counts?.changes ?? 0) > 0
    ) {
      throw new AppError(
        409,
        "INTERNAL_EMPLOYEE_HAS_RELATIONS",
        "该员工已有任职、变更或账号关联，只能归档，不能物理删除"
      );
    }
    void input.actorId;
    return tx.internalEmployee.delete({
      where: { id: input.employeeId }
    });
  });
}
