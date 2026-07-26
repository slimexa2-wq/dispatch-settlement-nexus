import {
  DataScopeType,
  UserRole,
  permissionsForRoles,
  type SessionUser,
  type UserRole as UserRoleValue
} from "@xiangneng/shared";

type SessionScopeRecord = {
  type: SessionUser["scopeBindings"][number]["type"];
  organizationUnitId: string | null;
  branchId: string | null;
  projectId: string | null;
  supplierId: string | null;
  isActive: boolean;
  validFrom: Date;
  validTo: Date | null;
};

type SessionRoleAssignmentRecord = {
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  validFrom: Date;
  validTo: Date | null;
  role: { code: string };
  scopes: SessionScopeRecord[];
};

export type SessionUserRecord = {
  id: string;
  username: string;
  displayName: string;
  role: SessionUser["role"];
  branchId: string | null;
  supplierId: string | null;
  personId: string | null;
  employeeType: string | null;
  projectLinks: Array<{ projectId: string }>;
  roleAssignments?: SessionRoleAssignmentRecord[];
  dataScopeBindings?: SessionScopeRecord[];
};

const knownRoles = new Set<string>(Object.values(UserRole));

function isUserRole(value: string): value is UserRoleValue {
  return knownRoles.has(value);
}

function isCurrent(
  value: { validFrom: Date; validTo: Date | null },
  now: Date
): boolean {
  return value.validFrom <= now && (!value.validTo || value.validTo >= now);
}

function legacyScopeBindings(
  user: SessionUserRecord
): SessionUser["scopeBindings"] {
  if (
    user.role === UserRole.SUPER_ADMIN ||
    user.role === UserRole.SYSTEM_ADMIN ||
    user.role === UserRole.GROUP_LEADER ||
    user.role === UserRole.HEADQUARTERS_MANAGER
  ) {
    return [{
      type: DataScopeType.GROUP,
      organizationUnitId: null,
      branchId: null,
      projectId: null,
      supplierId: null
    }];
  }
  if (user.branchId) {
    return [{
      type: DataScopeType.BRANCH,
      organizationUnitId: null,
      branchId: user.branchId,
      projectId: null,
      supplierId: null
    }];
  }
  if (user.supplierId) {
    return [{
      type: DataScopeType.SUPPLIER,
      organizationUnitId: null,
      branchId: null,
      projectId: null,
      supplierId: user.supplierId
    }];
  }
  if (user.projectLinks.length) {
    return user.projectLinks.map((link) => ({
      type: DataScopeType.PROJECT,
      organizationUnitId: null,
      branchId: null,
      projectId: link.projectId,
      supplierId: null
    }));
  }
  return [{
    type: DataScopeType.SELF,
    organizationUnitId: null,
    branchId: null,
    projectId: null,
    supplierId: null
  }];
}

export function toSessionUser(
  user: SessionUserRecord,
  now = new Date()
): SessionUser {
  const activeAssignments = (user.roleAssignments ?? []).filter(
    (assignment) =>
      assignment.status === "ACTIVE" &&
      isCurrent(assignment, now) &&
      isUserRole(assignment.role.code)
  );
  const assignedRoles = activeAssignments
    .map((assignment) => assignment.role.code)
    .filter(isUserRole);
  const hasManagedAssignments = Boolean(user.roleAssignments?.length);
  const hasManagedDirectScopes = Boolean(user.dataScopeBindings?.length);
  const roles = [...new Set(
    assignedRoles.length
      ? assignedRoles
      : hasManagedAssignments
        ? []
        : [user.role]
  )];
  const assignedScopes = activeAssignments.flatMap((assignment) =>
    assignment.scopes
      .filter((scope) => scope.isActive && isCurrent(scope, now))
      .map((scope) => ({
        type: scope.type,
        organizationUnitId: scope.organizationUnitId,
        branchId: scope.branchId,
        projectId: scope.projectId,
        supplierId: scope.supplierId
      }))
  );
  const directScopes = (user.dataScopeBindings ?? [])
    .filter((scope) => scope.isActive && isCurrent(scope, now))
    .map((scope) => ({
      type: scope.type,
      organizationUnitId: scope.organizationUnitId,
      branchId: scope.branchId,
      projectId: scope.projectId,
      supplierId: scope.supplierId
    }));

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: roles[0] ?? user.role,
    roles,
    branchId: user.branchId,
    supplierId: user.supplierId,
    personId: user.personId,
    employeeType: user.employeeType,
    projectIds: user.projectLinks.map((link) => link.projectId),
    permissions: permissionsForRoles(roles),
    scopeBindings: assignedScopes.length || directScopes.length
      ? [...assignedScopes, ...directScopes]
      : hasManagedAssignments || hasManagedDirectScopes
        ? []
        : legacyScopeBindings(user)
  };
}

export const sessionUserInclude = {
  projectLinks: { select: { projectId: true } },
  roleAssignments: {
    include: {
      role: { select: { code: true } },
      scopes: {
        select: {
          type: true,
          organizationUnitId: true,
          branchId: true,
          projectId: true,
          supplierId: true,
          isActive: true,
          validFrom: true,
          validTo: true
        }
      }
    }
  },
  dataScopeBindings: {
    where: { roleAssignmentId: null },
    select: {
      type: true,
      organizationUnitId: true,
      branchId: true,
      projectId: true,
      supplierId: true,
      isActive: true,
      validFrom: true,
      validTo: true
    }
  }
} as const;
