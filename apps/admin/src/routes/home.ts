import { Permission } from "@xiangneng/shared";

export function homePathForPermissions(permissions: readonly Permission[]): string {
  const has = (permission: Permission) => permissions.includes(permission);
  if (has(Permission.LEADERSHIP_DASHBOARD_READ)) return "/leadership";
  if (has(Permission.DASHBOARD_READ)) return "/dashboard";
  if (has(Permission.PEOPLE_READ)) return "/people";
  if (has(Permission.PROJECT_READ)) return "/projects";
  if (has(Permission.SUPPLIER_READ)) return "/suppliers";
  if (has(Permission.POLICY_READ)) return "/policies/supplier";
  if (has(Permission.JOB_READ)) return "/recruitment/demands";
  if (has(Permission.REWARD_REVIEW)) return "/recruitment/rewards";
  if (has(Permission.SALARY_MANAGE)) return "/salary-slips";
  if (has(Permission.IMPORT_MANAGE)) return "/imports";
  if (has(Permission.USER_MANAGE) || has(Permission.AUDIT_READ)) return "/settings";
  return "/login";
}
