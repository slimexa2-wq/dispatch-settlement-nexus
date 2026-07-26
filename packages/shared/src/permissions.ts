import { UserRole, type UserRole as UserRoleValue } from "./enums.js";

export const Permission = {
  DASHBOARD_READ: "dashboard:read",
  PEOPLE_READ: "people:read",
  PEOPLE_WRITE: "people:write",
  PEOPLE_EXPORT: "people:export",
  PROJECT_READ: "project:read",
  PROJECT_WRITE: "project:write",
  SUPPLIER_READ: "supplier:read",
  SUPPLIER_WRITE: "supplier:write",
  POLICY_READ: "policy:read",
  POLICY_WRITE: "policy:write",
  JOB_READ: "job:read",
  JOB_WRITE: "job:write",
  APPLICATION_CREATE: "application:create",
  REFERRAL_CREATE: "referral:create",
  REWARD_REVIEW: "reward:review",
  SALARY_MANAGE: "salary:manage",
  SALARY_SELF_READ: "salary:self-read",
  CONTRACT_MANAGE: "contract:manage",
  CONTRACT_SIGN: "contract:sign",
  IMPORT_MANAGE: "import:manage",
  USER_MANAGE: "user:manage",
  AUDIT_READ: "audit:read",
  ORG_READ: "org:read",
  ORG_WRITE: "org:write",
  INTERNAL_EMPLOYEE_READ: "internal-employee:read",
  INTERNAL_EMPLOYEE_WRITE: "internal-employee:write",
  INTERNAL_EMPLOYEE_TRANSFER: "internal-employee:transfer",
  INTERNAL_EMPLOYEE_OFFBOARD: "internal-employee:offboard",
  INTERNAL_EMPLOYEE_DELETE: "internal-employee:delete",
  REIMBURSEMENT_SELF: "reimbursement:self",
  REIMBURSEMENT_MANAGE: "reimbursement:manage",
  REIMBURSEMENT_APPROVE: "reimbursement:approve",
  REIMBURSEMENT_FINANCE_REVIEW: "reimbursement:finance-review",
  REIMBURSEMENT_PAY: "reimbursement:pay",
  REIMBURSEMENT_EXPORT: "reimbursement:export",
  LEADERSHIP_DASHBOARD_READ: "leadership-dashboard:read"
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const allPermissions = Object.values(Permission);

export const rolePermissions: Record<UserRoleValue, readonly Permission[]> = {
  [UserRole.SUPER_ADMIN]: allPermissions,
  [UserRole.SYSTEM_ADMIN]: allPermissions,
  [UserRole.GROUP_LEADER]: [
    Permission.DASHBOARD_READ,
    Permission.LEADERSHIP_DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.PEOPLE_EXPORT,
    Permission.PROJECT_READ,
    Permission.SUPPLIER_READ,
    Permission.POLICY_READ,
    Permission.JOB_READ,
    Permission.ORG_READ,
    Permission.INTERNAL_EMPLOYEE_READ,
    Permission.REIMBURSEMENT_EXPORT,
    Permission.AUDIT_READ
  ],
  [UserRole.HEADQUARTERS_MANAGER]: [
    Permission.DASHBOARD_READ,
    Permission.LEADERSHIP_DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.PEOPLE_EXPORT,
    Permission.PROJECT_READ,
    Permission.SUPPLIER_READ,
    Permission.POLICY_READ,
    Permission.JOB_READ,
    Permission.ORG_READ,
    Permission.INTERNAL_EMPLOYEE_READ,
    Permission.REIMBURSEMENT_EXPORT,
    Permission.CONTRACT_MANAGE,
    Permission.AUDIT_READ
  ],
  [UserRole.BRANCH_MANAGER]: [
    Permission.DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.PEOPLE_WRITE,
    Permission.PEOPLE_EXPORT,
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.SUPPLIER_READ,
    Permission.POLICY_READ,
    Permission.JOB_READ,
    Permission.JOB_WRITE,
    Permission.CONTRACT_MANAGE,
    Permission.ORG_READ,
    Permission.INTERNAL_EMPLOYEE_READ,
    Permission.INTERNAL_EMPLOYEE_WRITE,
    Permission.REIMBURSEMENT_APPROVE,
    Permission.LEADERSHIP_DASHBOARD_READ
  ],
  [UserRole.DEPARTMENT_MANAGER]: [
    Permission.DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.PROJECT_READ,
    Permission.JOB_READ,
    Permission.ORG_READ,
    Permission.INTERNAL_EMPLOYEE_READ,
    Permission.REIMBURSEMENT_APPROVE
  ],
  [UserRole.INTERNAL_HR]: [
    Permission.DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.PEOPLE_WRITE,
    Permission.PEOPLE_EXPORT,
    Permission.PROJECT_READ,
    Permission.JOB_READ,
    Permission.JOB_WRITE,
    Permission.ORG_READ,
    Permission.ORG_WRITE,
    Permission.INTERNAL_EMPLOYEE_READ,
    Permission.INTERNAL_EMPLOYEE_WRITE,
    Permission.INTERNAL_EMPLOYEE_TRANSFER,
    Permission.INTERNAL_EMPLOYEE_OFFBOARD,
    Permission.INTERNAL_EMPLOYEE_DELETE,
    Permission.IMPORT_MANAGE,
    Permission.USER_MANAGE,
    Permission.AUDIT_READ
  ],
  [UserRole.RECRUITER]: [
    Permission.DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.PEOPLE_WRITE,
    Permission.PEOPLE_EXPORT,
    Permission.PROJECT_READ,
    Permission.SUPPLIER_READ,
    Permission.POLICY_READ,
    Permission.JOB_READ,
    Permission.JOB_WRITE,
    Permission.APPLICATION_CREATE,
    Permission.REFERRAL_CREATE
  ],
  [UserRole.PROJECT_OPERATOR]: [
    Permission.DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.PEOPLE_WRITE,
    Permission.PROJECT_READ,
    Permission.SUPPLIER_READ,
    Permission.POLICY_READ,
    Permission.JOB_READ,
    Permission.JOB_WRITE,
    Permission.APPLICATION_CREATE,
    Permission.CONTRACT_MANAGE
  ],
  [UserRole.RESOURCE_SPECIALIST]: [
    Permission.PROJECT_READ,
    Permission.SUPPLIER_READ,
    Permission.SUPPLIER_WRITE,
    Permission.POLICY_READ,
    Permission.POLICY_WRITE,
    Permission.REWARD_REVIEW
  ],
  [UserRole.FINANCE_REVIEWER]: [
    Permission.DASHBOARD_READ,
    Permission.ORG_READ,
    Permission.REIMBURSEMENT_FINANCE_REVIEW,
    Permission.REIMBURSEMENT_EXPORT,
    Permission.AUDIT_READ
  ],
  [UserRole.CASHIER]: [
    Permission.DASHBOARD_READ,
    Permission.ORG_READ,
    Permission.REIMBURSEMENT_PAY,
    Permission.REIMBURSEMENT_EXPORT,
    Permission.AUDIT_READ
  ],
  [UserRole.DEPARTMENT_REIMBURSEMENT_CLERK]: [
    Permission.DASHBOARD_READ,
    Permission.ORG_READ,
    Permission.REIMBURSEMENT_MANAGE,
    Permission.REIMBURSEMENT_EXPORT
  ],
  [UserRole.SUPPLIER_ADMIN]: [
    Permission.DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.PEOPLE_WRITE,
    Permission.PROJECT_READ,
    Permission.SUPPLIER_READ,
    Permission.POLICY_READ,
    Permission.JOB_READ,
    Permission.APPLICATION_CREATE,
    Permission.CONTRACT_MANAGE
  ],
  [UserRole.SUPPLIER]: [
    Permission.DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.POLICY_READ,
    Permission.JOB_READ,
    Permission.APPLICATION_CREATE
  ],
  [UserRole.EMPLOYEE]: [
    Permission.JOB_READ,
    Permission.APPLICATION_CREATE,
    Permission.REFERRAL_CREATE,
    Permission.SALARY_SELF_READ,
    Permission.CONTRACT_SIGN,
    Permission.REIMBURSEMENT_SELF
  ],
  [UserRole.OUTSOURCED_EMPLOYEE]: [
    Permission.JOB_READ,
    Permission.APPLICATION_CREATE,
    Permission.REFERRAL_CREATE,
    Permission.SALARY_SELF_READ,
    Permission.CONTRACT_SIGN
  ],
  [UserRole.JOB_SEEKER]: [Permission.JOB_READ, Permission.APPLICATION_CREATE],
};

export function hasPermission(
  role: UserRoleValue,
  permission: Permission
): boolean {
  return rolePermissions[role].includes(permission);
}

export function permissionsForRoles(
  roles: readonly UserRoleValue[]
): Permission[] {
  return [
    ...new Set(
      roles.flatMap((role) => rolePermissions[role] ?? [])
    )
  ];
}

export function hasAnyRolePermission(
  roles: readonly UserRoleValue[],
  permission: Permission
): boolean {
  return roles.some((role) => hasPermission(role, permission));
}

export const DataScopeType = {
  SELF: "SELF",
  ORG_UNIT: "ORG_UNIT",
  CENTER: "CENTER",
  BRANCH: "BRANCH",
  PROJECT: "PROJECT",
  SUPPLIER: "SUPPLIER",
  GROUP: "GROUP"
} as const;
export type DataScopeType =
  (typeof DataScopeType)[keyof typeof DataScopeType];

export type ScopeBinding = {
  type: DataScopeType;
  entityId?: string | null;
};

export type AuthorizationContext = {
  userId: string;
  roles: readonly UserRoleValue[];
  bindings: readonly ScopeBinding[];
};

export type ResourceScope = {
  ownerUserId?: string | null;
  orgUnitIds?: readonly string[];
  branchId?: string | null;
  projectId?: string | null;
  supplierId?: string | null;
};

export function isWithinDataScope(
  context: AuthorizationContext,
  resource: ResourceScope
): boolean {
  if (
    context.roles.includes(UserRole.SUPER_ADMIN) ||
    context.roles.includes(UserRole.SYSTEM_ADMIN)
  ) {
    return true;
  }

  return context.bindings.some((binding) => {
    switch (binding.type) {
      case DataScopeType.GROUP:
        return true;
      case DataScopeType.SELF:
        return Boolean(
          resource.ownerUserId && resource.ownerUserId === context.userId
        );
      case DataScopeType.ORG_UNIT:
      case DataScopeType.CENTER:
        return Boolean(
          binding.entityId &&
            resource.orgUnitIds?.includes(binding.entityId)
        );
      case DataScopeType.BRANCH:
        return Boolean(
          binding.entityId && resource.branchId === binding.entityId
        );
      case DataScopeType.PROJECT:
        return Boolean(
          binding.entityId && resource.projectId === binding.entityId
        );
      case DataScopeType.SUPPLIER:
        return Boolean(
          binding.entityId && resource.supplierId === binding.entityId
        );
    }
  });
}

export type DataScope = {
  role: UserRoleValue;
  userId: string;
  branchId?: string | null;
  supplierId?: string | null;
  personId?: string | null;
  projectIds: string[];
};
