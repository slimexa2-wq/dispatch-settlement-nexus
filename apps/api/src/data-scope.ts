import type { Prisma } from "./generated/prisma/client.js";
import {
  DataScopeType,
  PolicyType,
  UserRole,
  type SessionUser
} from "@xiangneng/shared";

const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

function rolesOf(user: SessionUser): SessionUser["roles"] {
  return user.roles ?? [user.role];
}

function bindingsOf(user: SessionUser): SessionUser["scopeBindings"] {
  if (user.scopeBindings) return user.scopeBindings;
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
  if (user.projectIds?.length) {
    return user.projectIds.map((projectId) => ({
      type: DataScopeType.PROJECT,
      organizationUnitId: null,
      branchId: null,
      projectId,
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

function hasGlobalScope(user: SessionUser): boolean {
  return (
    rolesOf(user).some(
      (role) =>
        role === UserRole.SUPER_ADMIN ||
        role === UserRole.SYSTEM_ADMIN ||
        role === UserRole.GROUP_LEADER ||
        role === UserRole.HEADQUARTERS_MANAGER
    ) ||
    bindingsOf(user).some((binding) => binding.type === DataScopeType.GROUP)
  );
}

function scopeIds(
  user: SessionUser,
  type: SessionUser["scopeBindings"][number]["type"],
  key: "branchId" | "projectId" | "supplierId" | "organizationUnitId"
): string[] {
  return [
    ...new Set(
      bindingsOf(user)
        .filter((binding) => binding.type === type)
        .map((binding) => binding[key])
        .filter((value): value is string => Boolean(value))
    )
  ];
}

export function projectWhere(user: SessionUser): Prisma.ProjectWhereInput {
  if (hasGlobalScope(user)) return {};
  const branchIds = scopeIds(user, DataScopeType.BRANCH, "branchId");
  const projectIds = scopeIds(user, DataScopeType.PROJECT, "projectId");
  const supplierIds = scopeIds(user, DataScopeType.SUPPLIER, "supplierId");
  const conditions: Prisma.ProjectWhereInput[] = [];
  if (branchIds.length) conditions.push({ branchId: { in: branchIds } });
  if (projectIds.length) conditions.push({ id: { in: projectIds } });
  if (supplierIds.length) {
    conditions.push({ supplierLinks: { some: { supplierId: { in: supplierIds } } } });
  }
  if (conditions.length === 1) return conditions[0] ?? { id: NO_ACCESS_ID };
  return conditions.length ? { OR: conditions } : { id: NO_ACCESS_ID };
}

export function personWhere(user: SessionUser): Prisma.PersonWhereInput {
  if (hasGlobalScope(user)) return {};
  const branchIds = scopeIds(user, DataScopeType.BRANCH, "branchId");
  const projectIds = scopeIds(user, DataScopeType.PROJECT, "projectId");
  const supplierIds = scopeIds(user, DataScopeType.SUPPLIER, "supplierId");
  const isSelf = bindingsOf(user).some(
    (binding) => binding.type === DataScopeType.SELF
  );
  const conditions: Prisma.PersonWhereInput[] = [];
  if (branchIds.length) {
    conditions.push({ project: { branchId: { in: branchIds } } });
  }
  if (projectIds.length) conditions.push({ projectId: { in: projectIds } });
  if (supplierIds.length) conditions.push({ supplierId: { in: supplierIds } });
  if (isSelf) conditions.push({ id: user.personId ?? NO_ACCESS_ID });
  if (conditions.length === 1) return conditions[0] ?? { id: NO_ACCESS_ID };
  return conditions.length ? { OR: conditions } : { id: NO_ACCESS_ID };
}

export function applicationWhere(user: SessionUser): Prisma.ApplicationWhereInput {
  if (hasGlobalScope(user)) return {};
  const branchIds = scopeIds(user, DataScopeType.BRANCH, "branchId");
  const projectIds = scopeIds(user, DataScopeType.PROJECT, "projectId");
  const supplierIds = scopeIds(user, DataScopeType.SUPPLIER, "supplierId");
  const isSelf = bindingsOf(user).some(
    (binding) => binding.type === DataScopeType.SELF
  );
  const conditions: Prisma.ApplicationWhereInput[] = [];
  if (branchIds.length) {
    conditions.push({
      jobDemand: { project: { branchId: { in: branchIds } } }
    });
  }
  if (projectIds.length) {
    conditions.push({ jobDemand: { projectId: { in: projectIds } } });
  }
  if (supplierIds.length) {
    conditions.push({ supplierId: { in: supplierIds } });
  }
  if (isSelf) {
    conditions.push({
      OR: [
        { personId: user.personId ?? NO_ACCESS_ID },
        { recommenderUserId: user.id }
      ]
    });
  }
  if (conditions.length === 1) return conditions[0] ?? { id: NO_ACCESS_ID };
  return conditions.length ? { OR: conditions } : { id: NO_ACCESS_ID };
}

export function policyWhere(user: SessionUser): Prisma.PolicyWhereInput {
  if (hasGlobalScope(user)) return {};
  const supplierIds = scopeIds(user, DataScopeType.SUPPLIER, "supplierId");
  if (
    rolesOf(user).some(
      (role) =>
        role === UserRole.SUPPLIER || role === UserRole.SUPPLIER_ADMIN
    )
  ) {
      return {
        type: PolicyType.SUPPLIER,
        isActive: true,
        OR: [
          { supplierId: { in: supplierIds.length ? supplierIds : [NO_ACCESS_ID] } },
          { supplierId: null, supplierLevel: { not: null } }
        ]
      };
  }
  if (rolesOf(user).includes(UserRole.EMPLOYEE)) {
    return { type: PolicyType.EMPLOYEE_REFERRAL, isActive: true };
  }
  const branchIds = scopeIds(user, DataScopeType.BRANCH, "branchId");
  const projectIds = scopeIds(user, DataScopeType.PROJECT, "projectId");
  const conditions: Prisma.PolicyWhereInput[] = [];
  if (branchIds.length) {
    conditions.push({ project: { branchId: { in: branchIds } } });
  }
  if (projectIds.length) conditions.push({ projectId: { in: projectIds } });
  if (conditions.length === 1) return conditions[0] ?? { id: NO_ACCESS_ID };
  return conditions.length ? { OR: conditions } : { id: NO_ACCESS_ID };
}

export function internalEmployeeWhere(
  user: SessionUser
): Prisma.InternalEmployeeWhereInput {
  if (hasGlobalScope(user)) return {};
  const branchIds = scopeIds(user, DataScopeType.BRANCH, "branchId");
  const organizationUnitIds = [
    ...scopeIds(user, DataScopeType.ORG_UNIT, "organizationUnitId"),
    ...scopeIds(user, DataScopeType.CENTER, "organizationUnitId")
  ];
  const isSelf = bindingsOf(user).some(
    (binding) => binding.type === DataScopeType.SELF
  );
  const conditions: Prisma.InternalEmployeeWhereInput[] = [];
  if (branchIds.length) conditions.push({ branchId: { in: branchIds } });
  if (organizationUnitIds.length) {
    conditions.push({
      organizationUnit: {
        OR: [
          { id: { in: organizationUnitIds } },
          {
            path: {
              contains: organizationUnitIds[0] ?? NO_ACCESS_ID
            }
          }
        ]
      }
    });
  }
  if (isSelf) conditions.push({ userId: user.id });
  if (conditions.length === 1) return conditions[0] ?? { id: NO_ACCESS_ID };
  return conditions.length ? { OR: conditions } : { id: NO_ACCESS_ID };
}

export function organizationUnitWhere(
  user: SessionUser
): Prisma.OrganizationUnitWhereInput {
  if (hasGlobalScope(user)) return {};
  const branchIds = scopeIds(user, DataScopeType.BRANCH, "branchId");
  const organizationUnitIds = [
    ...scopeIds(user, DataScopeType.ORG_UNIT, "organizationUnitId"),
    ...scopeIds(user, DataScopeType.CENTER, "organizationUnitId")
  ];
  const conditions: Prisma.OrganizationUnitWhereInput[] = [];
  if (branchIds.length) conditions.push({ branchId: { in: branchIds } });
  if (organizationUnitIds.length) {
    conditions.push({
      OR: [
        { id: { in: organizationUnitIds } },
        ...organizationUnitIds.map((id) => ({ path: { contains: id } }))
      ]
    });
  }
  if (conditions.length === 1) return conditions[0] ?? { id: NO_ACCESS_ID };
  return conditions.length ? { OR: conditions } : { id: NO_ACCESS_ID };
}

export function reimbursementWhere(
  user: SessionUser
): Prisma.ReimbursementBatchWhereInput {
  if (hasGlobalScope(user)) return {};
  const branchIds = scopeIds(user, DataScopeType.BRANCH, "branchId");
  const organizationUnitIds = [
    ...scopeIds(user, DataScopeType.ORG_UNIT, "organizationUnitId"),
    ...scopeIds(user, DataScopeType.CENTER, "organizationUnitId")
  ];
  const projectIds = scopeIds(user, DataScopeType.PROJECT, "projectId");
  const supplierIds = scopeIds(user, DataScopeType.SUPPLIER, "supplierId");
  const isSelf = bindingsOf(user).some(
    (binding) => binding.type === DataScopeType.SELF
  );
  const conditions: Prisma.ReimbursementBatchWhereInput[] = [];
  if (branchIds.length) conditions.push({ branchId: { in: branchIds } });
  if (organizationUnitIds.length) {
    conditions.push({
      organizationUnit: {
        OR: [
          { id: { in: organizationUnitIds } },
          ...organizationUnitIds.map((id) => ({ path: { contains: id } }))
        ]
      }
    });
  }
  if (projectIds.length) conditions.push({ projectId: { in: projectIds } });
  if (supplierIds.length) conditions.push({ supplierId: { in: supplierIds } });
  if (isSelf) conditions.push({ applicantUserId: user.id });
  if (conditions.length === 1) return conditions[0] ?? { id: NO_ACCESS_ID };
  return conditions.length ? { OR: conditions } : { id: NO_ACCESS_ID };
}

export function andWhere<T>(...conditions: T[]): { AND: T[] } {
  return { AND: conditions };
}
