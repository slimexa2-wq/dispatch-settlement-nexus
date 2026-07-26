import type { Prisma } from "./generated/prisma/client.js";
import { PolicyType, UserRole, type SessionUser } from "@xiangneng/shared";

export function projectWhere(user: SessionUser): Prisma.ProjectWhereInput {
  switch (user.role) {
    case UserRole.BRANCH_MANAGER:
      return { branchId: user.branchId ?? "00000000-0000-0000-0000-000000000000" };
    case UserRole.PROJECT_OPERATOR:
      return { id: { in: user.projectIds } };
    case UserRole.SUPPLIER:
      return { supplierLinks: { some: { supplierId: user.supplierId ?? "00000000-0000-0000-0000-000000000000" } } };
    default:
      return {};
  }
}

export function personWhere(user: SessionUser): Prisma.PersonWhereInput {
  switch (user.role) {
    case UserRole.BRANCH_MANAGER:
      return { project: { branchId: user.branchId ?? "00000000-0000-0000-0000-000000000000" } };
    case UserRole.PROJECT_OPERATOR:
      return { projectId: { in: user.projectIds } };
    case UserRole.SUPPLIER:
      return { supplierId: user.supplierId ?? "00000000-0000-0000-0000-000000000000" };
    case UserRole.EMPLOYEE:
    case UserRole.JOB_SEEKER:
      return { id: user.personId ?? "00000000-0000-0000-0000-000000000000" };
    default:
      return {};
  }
}

export function applicationWhere(user: SessionUser): Prisma.ApplicationWhereInput {
  switch (user.role) {
    case UserRole.SUPPLIER:
      return { supplierId: user.supplierId ?? "00000000-0000-0000-0000-000000000000" };
    case UserRole.EMPLOYEE:
      return { OR: [{ personId: user.personId ?? "" }, { recommenderUserId: user.id }] };
    case UserRole.JOB_SEEKER:
      return { personId: user.personId ?? "00000000-0000-0000-0000-000000000000" };
    case UserRole.BRANCH_MANAGER:
      return { jobDemand: { project: { branchId: user.branchId ?? "" } } };
    case UserRole.PROJECT_OPERATOR:
      return { jobDemand: { projectId: { in: user.projectIds } } };
    default:
      return {};
  }
}

export function policyWhere(user: SessionUser): Prisma.PolicyWhereInput {
  switch (user.role) {
    case UserRole.SUPPLIER:
      return {
        type: PolicyType.SUPPLIER,
        isActive: true,
        OR: [
          { supplierId: user.supplierId ?? "" },
          { supplierId: null, supplierLevel: { not: null } }
        ]
      };
    case UserRole.EMPLOYEE:
      return { type: PolicyType.EMPLOYEE_REFERRAL, isActive: true };
    case UserRole.JOB_SEEKER:
      return { id: "00000000-0000-0000-0000-000000000000" };
    case UserRole.BRANCH_MANAGER:
      return { project: { branchId: user.branchId ?? "" } };
    case UserRole.PROJECT_OPERATOR:
      return { projectId: { in: user.projectIds } };
    default:
      return {};
  }
}

export function andWhere<T>(...conditions: T[]): { AND: T[] } {
  return { AND: conditions };
}
