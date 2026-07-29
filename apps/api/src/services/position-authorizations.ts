import { AppError } from "../errors.js";
import { resolveOrganizationScopeIds, type OrganizationUnitScopeRecord } from "./organization-structure.js";

export type PositionRoleBindingInput = {
  roleCode: string;
  scopeType: string;
};

const globalAuthorizationRoles = new Set(["SUPER_ADMIN", "SYSTEM_ADMIN"]);
const restrictedPositionRoleCodes = new Set([
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "GROUP_LEADER",
  "HEADQUARTERS_MANAGER"
]);

export function assertPositionRoleBindingsAssignable(
  actorRoles: readonly string[],
  bindings: readonly PositionRoleBindingInput[]
): void {
  if (bindings.some((binding) => binding.scopeType === "BRANCH")) {
    throw new AppError(
      409,
      "POSITION_BINDING_BRANCH_SCOPE_UNSUPPORTED",
      "内部岗位不再使用分公司数据范围，请改为本部门或本中心"
    );
  }
  if (actorRoles.some((role) => globalAuthorizationRoles.has(role))) return;
  const attemptsGlobalGrant = bindings.some(
    (binding) =>
      binding.scopeType === "GROUP" ||
      restrictedPositionRoleCodes.has(binding.roleCode)
  );
  if (attemptsGlobalGrant) {
    throw new AppError(
      403,
      "POSITION_BINDING_ESCALATION",
      "集团级角色或集团数据范围只能由超级管理员或系统管理员配置"
    );
  }
}

type Delegate = {
  findMany?(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  findUnique?(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export type PositionAuthorizationDb = {
  positionRoleBinding: Required<Pick<Delegate, "findMany">>;
  organizationUnit: Required<Pick<Delegate, "findUnique">>;
  userRoleAssignment: Pick<Delegate, "updateMany" | "create">;
  dataScopeBinding: Pick<Delegate, "updateMany" | "create">;
  user: Pick<Delegate, "updateMany">;
};

export type RevokePositionAuthorizationInput = {
  userId: string;
  actorId: string;
  effectiveAt: Date;
};

export type SyncPositionAuthorizationInput = RevokePositionAuthorizationInput & {
  positionId: string;
  organizationUnitId: string;
};

export async function revokePositionAuthorizations(
  tx: PositionAuthorizationDb,
  input: RevokePositionAuthorizationInput
): Promise<void> {
  await tx.dataScopeBinding.updateMany({
    where: {
      userId: input.userId,
      isActive: true,
      roleAssignment: { source: "POSITION" }
    },
    data: {
      isActive: false,
      validTo: input.effectiveAt,
      revokedAt: input.effectiveAt,
      revokedById: input.actorId
    }
  });
  await tx.userRoleAssignment.updateMany({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      source: "POSITION"
    },
    data: {
      status: "REVOKED",
      validTo: input.effectiveAt,
      revokedAt: input.effectiveAt,
      revokedById: input.actorId
    }
  });
}

export async function clearPositionAuthorizations(
  tx: PositionAuthorizationDb,
  input: RevokePositionAuthorizationInput
): Promise<void> {
  await revokePositionAuthorizations(tx, input);
  await tx.user.updateMany({
    where: { id: input.userId, isActive: true },
    data: { tokenVersion: { increment: 1 } }
  });
}

async function resolveOrganizationScope(
  tx: PositionAuthorizationDb,
  organizationUnitId: string,
  needsCenter: boolean
): Promise<{ departmentId: string; centerId: string | null }> {
  const unit = await tx.organizationUnit.findUnique({
    where: { id: organizationUnitId },
    select: {
      id: true,
      type: true,
      parent: { select: { id: true, type: true } }
    }
  }) as OrganizationUnitScopeRecord | null;
  if (!unit) {
    throw new AppError(409, "POSITION_AUTHORIZATION_ORG_REQUIRED", "岗位授权对应的组织单元不存在");
  }
  const resolved = resolveOrganizationScopeIds(unit, needsCenter);
  if (!resolved) {
    throw new AppError(
      409,
      "POSITION_AUTHORIZATION_CENTER_REQUIRED",
      "本中心权限要求员工当前组织单元直接归属于中心"
    );
  }
  return { departmentId: resolved.organizationUnitId, centerId: resolved.centerId };
}

function scopeData(
  scopeType: string,
  organizationUnitId: string,
  centerId: string | null
): Record<string, unknown> {
  switch (scopeType) {
    case "SELF":
    case "GROUP":
      return {};
    case "ORG_UNIT":
      return { organizationUnitId };
    case "CENTER":
      if (!centerId) {
        throw new AppError(
          409,
          "POSITION_AUTHORIZATION_CENTER_REQUIRED",
          "本中心权限无法解析员工所属中心"
        );
      }
      return { organizationUnitId: centerId };
    case "BRANCH":
      throw new AppError(
        409,
        "POSITION_BINDING_BRANCH_SCOPE_UNSUPPORTED",
        "内部岗位不再使用分公司数据范围，请改为本部门或本中心"
      );
    default:
      throw new AppError(
        409,
        "UNSUPPORTED_POSITION_SCOPE",
        `岗位自动授权暂不支持 ${scopeType} 数据范围`
      );
  }
}

export async function syncPositionAuthorizations(
  tx: PositionAuthorizationDb,
  input: SyncPositionAuthorizationInput
): Promise<{ createdAssignments: number }> {
  const bindings = await tx.positionRoleBinding.findMany({
    where: { positionId: input.positionId, isActive: true },
    select: { id: true, roleId: true, scopeType: true },
    orderBy: { createdAt: "asc" }
  });
  if (!bindings.length) {
    throw new AppError(
      409,
      "POSITION_ROLE_BINDING_MISSING",
      "当前岗位尚未配置系统角色，不能自动生成账号权限"
    );
  }

  const { departmentId, centerId } = await resolveOrganizationScope(
    tx,
    input.organizationUnitId,
    bindings.some((binding) => String(binding.scopeType) === "CENTER")
  );

  await revokePositionAuthorizations(tx, input);

  for (const binding of bindings) {
    const assignment = await tx.userRoleAssignment.create({
      data: {
        userId: input.userId,
        roleId: binding.roleId,
        status: "ACTIVE",
        source: "POSITION",
        positionRoleBindingId: binding.id,
        validFrom: input.effectiveAt,
        createdById: input.actorId
      }
    });
    await tx.dataScopeBinding.create({
      data: {
        userId: input.userId,
        roleAssignmentId: assignment.id,
        type: binding.scopeType,
        ...scopeData(String(binding.scopeType), departmentId, centerId),
        validFrom: input.effectiveAt,
        createdById: input.actorId
      }
    });
  }

  await tx.user.updateMany({
    where: { id: input.userId, isActive: true },
    data: { tokenVersion: { increment: 1 } }
  });

  return { createdAssignments: bindings.length };
}
