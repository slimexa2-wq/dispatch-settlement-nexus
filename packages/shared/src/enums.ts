export const UserRole = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  GROUP_LEADER: "GROUP_LEADER",
  HEADQUARTERS_MANAGER: "HEADQUARTERS_MANAGER",
  BRANCH_MANAGER: "BRANCH_MANAGER",
  DEPARTMENT_MANAGER: "DEPARTMENT_MANAGER",
  INTERNAL_HR: "INTERNAL_HR",
  RECRUITER: "RECRUITER",
  PROJECT_OPERATOR: "PROJECT_OPERATOR",
  RESOURCE_SPECIALIST: "RESOURCE_SPECIALIST",
  FINANCE_REVIEWER: "FINANCE_REVIEWER",
  CASHIER: "CASHIER",
  DEPARTMENT_REIMBURSEMENT_CLERK: "DEPARTMENT_REIMBURSEMENT_CLERK",
  SUPPLIER_ADMIN: "SUPPLIER_ADMIN",
  SUPPLIER: "SUPPLIER",
  OUTSOURCED_EMPLOYEE: "OUTSOURCED_EMPLOYEE",
  EMPLOYEE: "EMPLOYEE",
  JOB_SEEKER: "JOB_SEEKER"
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ProjectStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  HISTORICAL: "HISTORICAL",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION"
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ResponsibilityType = {
  CLIENT: "CLIENT",
  OURS: "OURS",
  JOINT: "JOINT",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION"
} as const;
export type ResponsibilityType =
  (typeof ResponsibilityType)[keyof typeof ResponsibilityType];

export const InterviewStatus = {
  PENDING_ARRIVAL: "PENDING_ARRIVAL",
  ARRIVED: "ARRIVED",
  PASSED: "PASSED",
  FAILED: "FAILED",
  ABANDONED: "ABANDONED"
} as const;
export type InterviewStatus =
  (typeof InterviewStatus)[keyof typeof InterviewStatus];

export const EmploymentStatus = {
  APPLICANT: "APPLICANT",
  INTERVIEWING: "INTERVIEWING",
  PENDING_ONBOARD: "PENDING_ONBOARD",
  ACTIVE: "ACTIVE",
  LEFT: "LEFT"
} as const;
export type EmploymentStatus =
  (typeof EmploymentStatus)[keyof typeof EmploymentStatus];

export const InsuranceType = {
  COMMERCIAL: "COMMERCIAL",
  SOCIAL: "SOCIAL",
  RISK_FUND: "RISK_FUND"
} as const;
export type InsuranceType =
  (typeof InsuranceType)[keyof typeof InsuranceType];

export const PolicyType = {
  SUPPLIER: "SUPPLIER",
  EMPLOYEE_REFERRAL: "EMPLOYEE_REFERRAL"
} as const;
export type PolicyType = (typeof PolicyType)[keyof typeof PolicyType];

export const JobStatus = {
  RECRUITING: "RECRUITING",
  PAUSED: "PAUSED",
  FILLED: "FILLED",
  ENDED: "ENDED"
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const ApplicationSource = {
  OPERATOR: "OPERATOR",
  SUPPLIER: "SUPPLIER",
  SELF: "SELF",
  REFERRAL: "REFERRAL"
} as const;
export type ApplicationSource =
  (typeof ApplicationSource)[keyof typeof ApplicationSource];

export const RewardStatus = {
  PENDING: "PENDING",
  ACHIEVED: "ACHIEVED",
  PAID: "PAID",
  CANCELLED: "CANCELLED"
} as const;
export type RewardStatus = (typeof RewardStatus)[keyof typeof RewardStatus];

export const SalarySlipStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  WITHDRAWN: "WITHDRAWN"
} as const;
export type SalarySlipStatus =
  (typeof SalarySlipStatus)[keyof typeof SalarySlipStatus];

export const ImportStatus = {
  PREVIEW: "PREVIEW",
  COMMITTED: "COMMITTED",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED"
} as const;
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const NotificationStatus = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
  SKIPPED_NOT_CONFIGURED: "SKIPPED_NOT_CONFIGURED"
} as const;
export type NotificationStatus =
  (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const labels = {
  roles: {
    [UserRole.SUPER_ADMIN]: "超级管理员",
    [UserRole.SYSTEM_ADMIN]: "系统管理员",
    [UserRole.GROUP_LEADER]: "集团领导",
    [UserRole.DEPARTMENT_MANAGER]: "部门负责人",
    [UserRole.INTERNAL_HR]: "内部人事",
    [UserRole.RECRUITER]: "招聘专员",
    [UserRole.FINANCE_REVIEWER]: "财务审核",
    [UserRole.CASHIER]: "出纳",
    [UserRole.DEPARTMENT_REIMBURSEMENT_CLERK]: "部门报销制单员",
    [UserRole.SUPPLIER_ADMIN]: "供应商管理员",
    [UserRole.OUTSOURCED_EMPLOYEE]: "外包员工",
    [UserRole.HEADQUARTERS_MANAGER]: "总部管理者",
    [UserRole.BRANCH_MANAGER]: "分子公司负责人",
    [UserRole.PROJECT_OPERATOR]: "项目运营人员",
    [UserRole.RESOURCE_SPECIALIST]: "资源人员",
    [UserRole.SUPPLIER]: "供应商",
    [UserRole.EMPLOYEE]: "内部员工",
    [UserRole.JOB_SEEKER]: "求职者"
  },
  interviewStatus: {
    [InterviewStatus.PENDING_ARRIVAL]: "待到场",
    [InterviewStatus.ARRIVED]: "已到场",
    [InterviewStatus.PASSED]: "面试通过",
    [InterviewStatus.FAILED]: "面试未通过",
    [InterviewStatus.ABANDONED]: "放弃"
  },
  employmentStatus: {
    [EmploymentStatus.APPLICANT]: "已报名",
    [EmploymentStatus.INTERVIEWING]: "面试中",
    [EmploymentStatus.PENDING_ONBOARD]: "待入职",
    [EmploymentStatus.ACTIVE]: "在职",
    [EmploymentStatus.LEFT]: "离职"
  },
  insurance: {
    [InsuranceType.COMMERCIAL]: "商保",
    [InsuranceType.SOCIAL]: "社保",
    [InsuranceType.RISK_FUND]: "风险金"
  },
  policyType: {
    [PolicyType.SUPPLIER]: "供应商政策",
    [PolicyType.EMPLOYEE_REFERRAL]: "内部推荐政策"
  },
  jobStatus: {
    [JobStatus.RECRUITING]: "招聘中",
    [JobStatus.PAUSED]: "暂停招聘",
    [JobStatus.FILLED]: "已招满",
    [JobStatus.ENDED]: "已结束"
  }
} as const;
