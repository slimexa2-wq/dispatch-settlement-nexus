import type { Permission, SessionUser } from "@xiangneng/shared";

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function authorizationForPermission(
  user: SessionUser,
  permission: Permission
): SessionUser {
  const grants = user.authorizationGrants?.filter((grant) =>
    grant.permissions.includes(permission)
  ) ?? [];

  if (!grants.length) {
    return user.permissions.includes(permission)
      ? user
      : {
          ...user,
          roles: [],
          permissions: [],
          scopeBindings: [],
          authorizationGrants: []
        };
  }

  const scopeBindings = uniqueBy(
    grants.flatMap((grant) => grant.scopeBindings),
    (binding) => [
      binding.type,
      binding.organizationUnitId ?? "",
      binding.branchId ?? "",
      binding.projectId ?? "",
      binding.supplierId ?? ""
    ].join(":")
  );
  const roles = [...new Set(grants.map((grant) => grant.role))];
  const permissions = [
    ...new Set(grants.flatMap((grant) => grant.permissions))
  ];

  return {
    ...user,
    role: roles[0] ?? user.role,
    roles,
    permissions,
    scopeBindings,
    authorizationGrants: grants
  };
}

export function authorizationForAnyPermission(
  user: SessionUser,
  permissions: readonly Permission[]
): SessionUser {
  const expected = new Set<Permission>(permissions);
  const grants = user.authorizationGrants?.filter((grant) =>
    grant.permissions.some((permission) => expected.has(permission))
  ) ?? [];

  if (!grants.length) {
    return permissions.some((permission) => user.permissions.includes(permission))
      ? user
      : {
          ...user,
          roles: [],
          permissions: [],
          scopeBindings: [],
          authorizationGrants: []
        };
  }

  const scopeBindings = uniqueBy(
    grants.flatMap((grant) => grant.scopeBindings),
    (binding) => [
      binding.type,
      binding.organizationUnitId ?? "",
      binding.branchId ?? "",
      binding.projectId ?? "",
      binding.supplierId ?? ""
    ].join(":")
  );
  const roles = [...new Set(grants.map((grant) => grant.role))];
  return {
    ...user,
    role: roles[0] ?? user.role,
    roles,
    permissions: [...new Set(grants.flatMap((grant) => grant.permissions))],
    scopeBindings,
    authorizationGrants: grants
  };
}
