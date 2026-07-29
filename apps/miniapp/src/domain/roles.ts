import type { SessionUser, UserRole } from "../api/types";
import { reimbursementPermissions } from "./reimbursements";

export type Portal = "operator" | "supplier" | "job-seeker" | "employee";
export type MenuItem = {
  title: string;
  description: string;
  path: string;
  permission?: string;
  permissions?: string[];
};

const operatorRoles: readonly UserRole[] = [
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "GROUP_LEADER",
  "HEADQUARTERS_MANAGER",
  "BRANCH_MANAGER",
  "DEPARTMENT_MANAGER",
  "INTERNAL_HR",
  "RECRUITER",
  "PROJECT_OPERATOR",
  "RESOURCE_SPECIALIST",
  "FINANCE_REVIEWER",
  "CASHIER",
  "DEPARTMENT_REIMBURSEMENT_CLERK"
];

export const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "超级管理员",
  SYSTEM_ADMIN: "系统管理员",
  GROUP_LEADER: "集团负责人",
  HEADQUARTERS_MANAGER: "总部管理者",
  BRANCH_MANAGER: "分子公司负责人",
  DEPARTMENT_MANAGER: "部门负责人",
  INTERNAL_HR: "内部人事",
  RECRUITER: "招聘人员",
  PROJECT_OPERATOR: "项目运营人员",
  RESOURCE_SPECIALIST: "资源人员",
  FINANCE_REVIEWER: "财务审核人员",
  CASHIER: "出纳",
  DEPARTMENT_REIMBURSEMENT_CLERK: "部门报销制单人",
  SUPPLIER_ADMIN: "供应商管理员",
  SUPPLIER: "供应商",
  OUTSOURCED_EMPLOYEE: "派遣外包员工",
  EMPLOYEE: "内部员工",
  JOB_SEEKER: "求职者"
};

export function portalForRole(role: UserRole): Portal {
  if (role === "SUPPLIER" || role === "SUPPLIER_ADMIN") return "supplier";
  if (role === "EMPLOYEE" || role === "OUTSOURCED_EMPLOYEE") return "employee";
  if (role === "JOB_SEEKER") return "job-seeker";
  return "operator";
}

function rolesForUser(user: Pick<SessionUser, "role" | "roles">): UserRole[] {
  return user.roles?.length ? user.roles : [user.role];
}

export function hasRole(
  user: Pick<SessionUser, "role" | "roles">,
  role: UserRole
): boolean {
  return rolesForUser(user).includes(role);
}

export function portalForUser(user: Pick<SessionUser, "role" | "roles">): Portal {
  const roles = rolesForUser(user);
  if (roles.some((role) => operatorRoles.includes(role))) return "operator";
  if (roles.some((role) => role === "SUPPLIER" || role === "SUPPLIER_ADMIN")) return "supplier";
  if (roles.some((role) => role === "EMPLOYEE" || role === "OUTSOURCED_EMPLOYEE")) return "employee";
  return "job-seeker";
}

export function jobPortalForUser(user: Pick<SessionUser, "role" | "roles" | "permissions">): Portal {
  const roles = rolesForUser(user);
  if (roles.some((role) => role === "SUPPLIER" || role === "SUPPLIER_ADMIN")) return "supplier";
  if (roles.includes("EMPLOYEE") && user.permissions.includes("referral:create")) return "employee";
  return portalForUser(user);
}

export function isOperatorRole(role: UserRole): boolean {
  return operatorRoles.includes(role);
}

export function isOperatorUser(user: Pick<SessionUser, "role" | "roles">): boolean {
  return rolesForUser(user).some(isOperatorRole);
}

const menus: Record<Portal, MenuItem[]> = {
  operator: [
    { title: "人员报名", description: "一次录入，后续持续更新", path: "/pages/operator/register/index", permission: "people:write" },
    { title: "面试名单", description: "到场与面试结果快速更新", path: "/pages/operator/interviews/index", permission: "people:write" },
    { title: "入职登记", description: "补充日期、工号与保险", path: "/pages/operator/onboarding/index", permission: "people:write" },
    { title: "离职登记", description: "记录日期、原因与保险", path: "/pages/operator/offboarding/index", permission: "people:write" },
    { title: "人员查询", description: "按姓名、手机、项目和状态查询", path: "/pages/operator/people/index", permission: "people:read" }
  ],
  supplier: [
    { title: "招聘需求", description: "查看开放岗位并立即报人", path: "/pages/jobs/index/index", permission: "job:read" },
    { title: "我的人员", description: "仅查看本供应商报送人员", path: "/pages/supplier/people/index", permission: "people:read" },
    { title: "我的数据", description: "报名、面试、入职与在职统计", path: "/pages/supplier/metrics/index", permission: "dashboard:read" },
    { title: "我的政策", description: "仅展示当前适用供应商政策", path: "/pages/supplier/policies/index", permission: "policy:read" }
  ],
  "job-seeker": [
    { title: "招聘岗位", description: "查看项目岗位与实拍信息", path: "/pages/jobs/index/index", permission: "job:read" },
    { title: "我的报名", description: "查询报名与面试进度", path: "/pages/application/mine/index", permission: "application:create" },
    { title: "我的信息", description: "账号与微信配置状态", path: "/pages/profile/index/index" }
  ],
  employee: [
    { title: "招聘岗位", description: "查看可推荐岗位", path: "/pages/jobs/index/index", permission: "job:read" },
    { title: "内部推荐", description: "推荐报名并自动绑定本人", path: "/pages/referrals/index/index", permission: "referral:create" },
    { title: "我的推荐", description: "查看被推荐人完整进度", path: "/pages/referrals/mine/index", permission: "referral:create" },
    { title: "推荐奖励", description: "查看待达成、已达成与已发放", path: "/pages/referrals/rewards/index", permission: "referral:create" },
    { title: "我的工资条", description: "仅查看本人已发布工资条", path: "/pages/salary/index/index", permission: "salary:self-read" },
    { title: "我的信息", description: "本人信息与账号状态", path: "/pages/profile/index/index" }
  ]
};

const reimbursementWorkPermissions = [
  reimbursementPermissions.manage,
  reimbursementPermissions.approve,
  reimbursementPermissions.financeReview,
  reimbursementPermissions.pay,
  reimbursementPermissions.export
];

function permitted(user: SessionUser, item: MenuItem): boolean {
  if (item.permission && !user.permissions.includes(item.permission)) return false;
  if (item.permissions && !item.permissions.some((permission) => user.permissions.includes(permission))) return false;
  return true;
}

export function menuForUser(user: SessionUser): MenuItem[] {
  const portals = [...new Set(rolesForUser(user).map(portalForRole))];
  const seenPaths = new Set<string>();
  const items = portals
    .flatMap((portal) => menus[portal])
    .filter((item) => permitted(user, item))
    .filter((item) => {
      if (seenPaths.has(item.path)) return false;
      seenPaths.add(item.path);
      return true;
    });
  const hasReimbursementPermission = user.permissions.some((permission) => permission.startsWith("reimbursement:"));
  if (!hasReimbursementPermission) return items;
  const workMode = reimbursementWorkPermissions.some((permission) => user.permissions.includes(permission));
  return [
    ...items,
    {
      title: workMode ? "报销待办" : "我的报销",
      description: workMode ? "按岗位权限处理制单、审核和付款" : "提交费用明细并跟踪审批与付款",
      path: "/pages/reimbursements/index/index",
      permissions: [reimbursementPermissions.self, ...reimbursementWorkPermissions]
    }
  ];
}

export function canAccess(user: SessionUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}
