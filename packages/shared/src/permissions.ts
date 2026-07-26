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
  AUDIT_READ: "audit:read"
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const allPermissions = Object.values(Permission);

export const rolePermissions: Record<UserRoleValue, readonly Permission[]> = {
  [UserRole.HEADQUARTERS_MANAGER]: [
    Permission.DASHBOARD_READ,
    Permission.PEOPLE_READ,
    Permission.PEOPLE_EXPORT,
    Permission.PROJECT_READ,
    Permission.SUPPLIER_READ,
    Permission.POLICY_READ,
    Permission.JOB_READ,
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
    Permission.CONTRACT_MANAGE
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
    Permission.CONTRACT_MANAGE,
    Permission.AUDIT_READ
  ],
  [UserRole.RESOURCE_SPECIALIST]: [
    Permission.PROJECT_READ,
    Permission.SUPPLIER_READ,
    Permission.SUPPLIER_WRITE,
    Permission.POLICY_READ,
    Permission.POLICY_WRITE,
    Permission.REWARD_REVIEW
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
    Permission.CONTRACT_SIGN
  ],
  [UserRole.JOB_SEEKER]: [Permission.JOB_READ, Permission.APPLICATION_CREATE],
  [UserRole.SYSTEM_ADMIN]: allPermissions
};

export function hasPermission(
  role: UserRoleValue,
  permission: Permission
): boolean {
  return rolePermissions[role].includes(permission);
}

export type DataScope = {
  role: UserRoleValue;
  userId: string;
  branchId?: string | null;
  supplierId?: string | null;
  personId?: string | null;
  projectIds: string[];
};
