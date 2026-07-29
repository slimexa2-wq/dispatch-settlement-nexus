import {
  DataScopeType,
  UserRole,
  Permission,
  permissionsForRoles,
  type Permission as PermissionValue,
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
  role: {
    code: string;
    permissions?: Array<{ permission: { code: string } }>;
  };
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
  portalAccesses?: Array<{ portal: string; enabled: boolean; validFrom: Date; validTo: Date | null }>;
};

const knownRoles = new Set<string>(Object.values(UserRole));
const knownPermissions = new Set<string>(Object.values(Permission));

function isUserRole(value: string): value is UserRoleValue {
  return knownRoles.has(value);
}

function isPermission(value: string): value is PermissionValue {
  return knownPermissions.has(value);
}

function uniqueScopes(
  scopes: SessionUser["scopeBindings"]
): SessionUser["scopeBindings"] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = [
      scope.type,
      scope.organizationUnitId ?? "",
      scope.branchId ?? "",
      scope.projectId ?? "",
      scope.supplierId ?? ""
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const hasManagedAssignments = Boolean(user.roleAssignments?.length);
  const hasManagedDirectScopes = Boolean(user.dataScopeBindings?.length);
  const directScopes = (user.dataScopeBindings ?? [])
    .filter((scope) => scope.isActive && isCurrent(scope, now))
    .map((scope) => ({
      type: scope.type,
      organizationUnitId: scope.organizationUnitId,
      branchId: scope.branchId,
      projectId: scope.projectId,
      supplierId: scope.supplierId
    }));

  const authorizationGrants: NonNullable<SessionUser["authorizationGrants"]> =
    activeAssignments.map((assignment) => {
      const role = assignment.role.code as UserRoleValue;
      const assignedScopes = assignment.scopes
        .filter((scope) => scope.isActive && isCurrent(scope, now))
        .map((scope) => ({
          type: scope.type,
          organizationUnitId: scope.organizationUnitId,
          branchId: scope.branchId,
          projectId: scope.projectId,
          supplierId: scope.supplierId
        }));
      const databasePermissions = assignment.role.permissions?.map(
        (link) => link.permission.code
      );
      const permissions = databasePermissions === undefined
        ? permissionsForRoles([role])
        : databasePermissions.filter(isPermission);
      return {
        role,
        permissions,
        scopeBindings: uniqueScopes(assignedScopes.length ? assignedScopes : directScopes)
      };
    });

  if (!hasManagedAssignments) {
    const scopes = directScopes.length
      ? directScopes
      : hasManagedDirectScopes
        ? []
        : legacyScopeBindings(user);
    authorizationGrants.push({
      role: user.role,
      permissions: permissionsForRoles([user.role]),
      scopeBindings: uniqueScopes(scopes)
    });
  }

  const roles = [...new Set(authorizationGrants.map((grant) => grant.role))];
  const permissions = [
    ...new Set(authorizationGrants.flatMap((grant) => grant.permissions))
  ];
  const scopeBindings = uniqueScopes([
    ...authorizationGrants.flatMap((grant) => grant.scopeBindings),
    ...directScopes
  ]);

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
    permissions,
    scopeBindings,
    authorizationGrants
  };
}

export const sessionUserInclude = {
  portalAccesses: {
    select: { portal: true, enabled: true, validFrom: true, validTo: true },
    orderBy: { createdAt: "desc" as const }
  },
  projectLinks: { select: { projectId: true } },
  roleAssignments: {
    include: {
      role: {
        select: {
          code: true,
          permissions: {
            select: { permission: { select: { code: true } } }
          }
        }
      },
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
