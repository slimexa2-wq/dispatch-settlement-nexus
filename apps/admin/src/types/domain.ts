import type {
  ApplicationSource,
  EmploymentStatus,
  InsuranceType,
  InterviewStatus,
  JobStatus,
  PolicyType,
  ProjectStatus,
  ResponsibilityType,
  RewardStatus,
  SalarySlipStatus,
  UserRole
} from "@xiangneng/shared";
import type { Permission } from "@xiangneng/shared";

export type Nullable<T> = T | null | undefined;

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
};

export type ListResult<T> = {
  items: T[];
  pagination: Pagination;
};

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  roles?: UserRole[];
  branchId: Nullable<string>;
  supplierId: Nullable<string>;
  personId: Nullable<string>;
  projectIds: string[];
  permissions: Permission[];
  scopeBindings?: Array<{
    type: string;
    organizationUnitId?: Nullable<string>;
    branchId?: Nullable<string>;
    projectId?: Nullable<string>;
    supplierId?: Nullable<string>;
  }>;
};

export type Branch = {
  id: string;
  name: string;
  code?: Nullable<string>;
};

export type OrganizationUnit = {
  id: string;
  code: string;
  name: string;
  type: "GROUP" | "LEGAL_ENTITY" | "BRANCH" | "CENTER" | "DEPARTMENT";
  parentId?: Nullable<string>;
  legalEntityId?: Nullable<string>;
  branchId?: Nullable<string>;
  path: string;
};

export type OrganizationOptionSet = {
  legalEntities: Array<{ id: string; code: string; name: string }>;
  branches: Branch[];
  organizationUnits: OrganizationUnit[];
  positions: Array<{ id: string; code: string; name: string; organizationUnitId?: Nullable<string> }>;
  jobGrades: Array<{ id: string; code: string; name: string; level: number }>;
};

export type InternalEmployment = {
  id: string;
  startedAt: string;
  endedAt?: Nullable<string>;
  isPrimary: boolean;
  reason?: Nullable<string>;
  legalEntity?: Nullable<{ id: string; name: string }>;
  branch?: Nullable<Branch>;
  organizationUnit: { id: string; name: string };
  position: { id: string; name: string };
  jobGrade?: Nullable<{ id: string; name: string }>;
};

export type InternalEmployeeChange = {
  id: string;
  type: "ONBOARD" | "TRANSFER" | "DISABLE" | "ENABLE" | "OFFBOARD" | "ARCHIVE";
  effectiveAt: string;
  reason?: Nullable<string>;
  before?: unknown;
  after?: unknown;
  createdAt: string;
};

export type InternalEmployee = {
  id: string;
  employeeNo: string;
  userId?: Nullable<string>;
  name: string;
  phone: string;
  idCard: string;
  email?: Nullable<string>;
  legalEntityId?: Nullable<string>;
  branchId?: Nullable<string>;
  organizationUnitId?: Nullable<string>;
  positionId?: Nullable<string>;
  jobGradeId?: Nullable<string>;
  status: "ACTIVE" | "DISABLED" | "LEFT" | "ARCHIVED";
  onboardDate: string;
  offboardDate?: Nullable<string>;
  offboardReason?: Nullable<string>;
  version: number;
  legalEntity?: Nullable<{ id: string; code: string; name: string }>;
  branch?: Nullable<Branch>;
  organizationUnit?: Nullable<OrganizationUnit>;
  position?: Nullable<{ id: string; code: string; name: string }>;
  jobGrade?: Nullable<{ id: string; code: string; name: string; level: number }>;
  employments?: InternalEmployment[];
  changes?: InternalEmployeeChange[];
};

export type ProjectImage = {
  id: string;
  projectId: string;
  url?: Nullable<string>;
  fileUrl?: Nullable<string>;
  fileName?: Nullable<string>;
  originalName?: Nullable<string>;
  sortOrder: number;
  remark?: Nullable<string>;
  note?: Nullable<string>;
};

export type Project = {
  id: string;
  sourceProjectId?: Nullable<string>;
  name: string;
  branchId: string;
  branch?: Nullable<Branch>;
  branchName?: Nullable<string>;
  isExternal: boolean;
  businessType?: Nullable<string>;
  status?: Nullable<ProjectStatus>;
  managerName?: Nullable<string>;
  managerPhone?: Nullable<string>;
  cooperationStart?: Nullable<string>;
  cooperationEnd?: Nullable<string>;
  responsibility?: Nullable<ResponsibilityType>;
  description?: Nullable<string>;
  remark?: Nullable<string>;
  images?: ProjectImage[];
  activeCount?: number;
  onboardCount?: number;
  offboardCount?: number;
  interviewCount?: number;
  statistics?: {
    activeCount?: number;
    periodOnboard?: number;
    periodOffboard?: number;
    interviewCount?: number;
  };
};

export type Supplier = {
  id: string;
  name: string;
  contactName?: Nullable<string>;
  contactPhone?: Nullable<string>;
  level?: Nullable<string>;
  projects?: Project[];
  projectIds?: string[];
  activeCount?: number;
  applicationCount?: number;
  arrivedCount?: number;
  passedCount?: number;
  onboardCount?: number;
  offboardCount?: number;
  projectLinks?: Array<{ project: Project }>;
  statistics?: {
    registered?: number;
    arrived?: number;
    passed?: number;
    onboarded?: number;
    active?: number;
    left?: number;
  };
  _count?: { people?: number; policies?: number };
};

export type Policy = {
  id: string;
  name: string;
  type: PolicyType;
  projectId: string;
  project?: Nullable<Project>;
  projectName?: Nullable<string>;
  jobTitle?: Nullable<string>;
  supplierId?: Nullable<string>;
  supplier?: Nullable<Supplier>;
  supplierLevel?: Nullable<string>;
  employeeType?: Nullable<string>;
  amount: number | string;
  achievementConditions: string;
  exclusionConditions?: Nullable<string>;
  effectiveAt: string;
  expiresAt?: Nullable<string>;
  notes?: Nullable<string>;
  active?: boolean;
  isActive?: boolean;
};

export type PersonFile = {
  id: string;
  fileName: string;
  originalName?: string;
  url?: Nullable<string>;
  fileUrl?: Nullable<string>;
  createdAt?: string;
};

export type PersonStatusLog = {
  id: string;
  fromStatus?: Nullable<EmploymentStatus>;
  toStatus: EmploymentStatus;
  notes?: Nullable<string>;
  createdAt: string;
  operator?: Nullable<{ displayName: string }>;
};

export type PersonLifecycleRecord = {
  id: string;
  personId: string;
  operatedAt: string;
  type: "REGISTRATION" | "INTERVIEW" | "ONBOARD" | "INSURANCE" | "OFFBOARD";
  result: string;
  businessInfo: string;
  operatorName?: Nullable<string>;
};

export type Person = {
  id: string;
  name: string;
  idCard: string;
  phone: string;
  branchId?: Nullable<string>;
  branch?: Nullable<Branch>;
  branchName?: Nullable<string>;
  projectId: string;
  project?: Nullable<Project>;
  projectName?: Nullable<string>;
  jobDemandId?: Nullable<string>;
  jobTitle: string;
  interviewDate?: Nullable<string>;
  interviewStatus?: Nullable<InterviewStatus>;
  employmentStatus: EmploymentStatus;
  status?: EmploymentStatus;
  onboardDate?: Nullable<string>;
  offboardDate?: Nullable<string>;
  offboardReason?: Nullable<string>;
  insuranceTypes: InsuranceType[];
  employeeNo?: Nullable<string>;
  supplierId?: Nullable<string>;
  supplier?: Nullable<Supplier>;
  supplierName?: Nullable<string>;
  supplierPolicyId?: Nullable<string>;
  supplierPolicy?: Nullable<Policy>;
  recommenderUserId?: Nullable<string>;
  recommender?: Nullable<{ displayName?: string; name?: string }>;
  recommenderName?: Nullable<string>;
  emergencyContactName?: Nullable<string>;
  emergencyContactPhone?: Nullable<string>;
  emergencyContactRelation?: Nullable<string>;
  source?: ApplicationSource;
  notes?: Nullable<string>;
  files?: PersonFile[];
  statusLogs?: PersonStatusLog[];
  lifecycle?: PersonLifecycleRecord[];
  applications?: Application[];
  createdAt: string;
  updatedAt?: string;
};

export type JobDemand = {
  id: string;
  projectId: string;
  project?: Nullable<Project>;
  projectName?: Nullable<string>;
  branchName?: Nullable<string>;
  title: string;
  requiredCount: number;
  requirements: string;
  workContent?: Nullable<string>;
  salary: string;
  workTime: string;
  workLocation: string;
  deadline: string;
  status: JobStatus;
  supplierPolicyId?: Nullable<string>;
  supplierPolicy?: Nullable<Policy>;
  referralPolicyId?: Nullable<string>;
  referralPolicy?: Nullable<Policy>;
  notes?: Nullable<string>;
  applicationCount?: number;
  arrivedCount?: number;
  passedCount?: number;
  onboardCount?: number;
  remainingCount?: number;
  createdAt?: string;
  progress?: {
    registered?: number;
    arrived?: number;
    passed?: number;
    onboarded?: number;
    remainingGap?: number;
  };
};

export type Application = {
  id: string;
  personId: string;
  person?: Nullable<Person>;
  jobDemandId: string;
  jobDemand?: Nullable<JobDemand>;
  source: ApplicationSource;
  interviewStatus?: Nullable<InterviewStatus>;
  interviewDate?: Nullable<string>;
  employmentStatus?: Nullable<EmploymentStatus>;
  onboardDate?: Nullable<string>;
  offboardDate?: Nullable<string>;
  offboardReason?: Nullable<string>;
  createdAt: string;
  appliedAt?: string;
  supplier?: Nullable<Supplier>;
  recommender?: Nullable<{ id?: string; displayName?: string }>;
};

export type ReferralReward = {
  id: string;
  personId?: string;
  person?: Nullable<Person>;
  recommender?: Nullable<{ displayName?: string; username?: string }>;
  policy?: Nullable<Policy>;
  amount: number | string;
  status: RewardStatus;
  notes?: Nullable<string>;
  achievedAt?: Nullable<string>;
  paidAt?: Nullable<string>;
  createdAt: string;
  referral?: {
    person?: Nullable<Person>;
    recommender?: Nullable<{ displayName?: string; username?: string }>;
    jobDemand?: Nullable<JobDemand>;
  };
};

export type SalarySlip = {
  id: string;
  personId?: Nullable<string>;
  person?: Nullable<Person>;
  salaryMonth: string;
  grossPay: number | string;
  netPay: number | string;
  hourlyPay: number | string;
  overtimePay: number | string;
  allowance: number | string;
  referralReward: number | string;
  socialSecurityDeduction: number | string;
  otherDeduction: number | string;
  notes?: Nullable<string>;
  status: SalarySlipStatus;
  createdAt?: string;
  batchId?: string;
  batch?: Nullable<{ id: string; sourceFile?: string; salaryMonth?: string }>;
};

export type StatPoint = {
  name: string;
  value: number;
  date?: string;
  branchId?: string;
  projectId?: string;
  supplierId?: string;
  status?: string;
};

export type StatisticsAnomaly = {
  id: string;
  type: string;
  scopeName: string;
  expected: number;
  actual: number;
  difference: number;
  personIds?: string[];
};

export type DashboardData = {
  todayInterviews?: number;
  interviewPassed?: number;
  activePeople?: number;
  todayOnboard?: number;
  todayOffboard?: number;
  monthOffboard?: number;
  sevenDayTrend?: Array<{ date: string; onboard: number; offboard: number }>;
  branchActive?: StatPoint[];
  statusDistribution?: StatPoint[];
  projectTop?: StatPoint[];
  supplierTop?: StatPoint[];
  anomalies?: StatisticsAnomaly[];
  recruitment?: {
    requiredCount?: number;
    applicationCount?: number;
    onboardCount?: number;
    remainingCount?: number;
  };
  pendingItems?: Array<{
    id?: string;
    type?: string;
    title: string;
    count?: number;
    level?: "info" | "warning" | "error";
    path?: string;
  }>;
};

export type UserAccount = SessionUser & {
  active?: boolean;
  isActive?: boolean;
  employeeType?: Nullable<string>;
  createdAt?: string;
};

export type AuditLog = {
  id: string;
  action: string;
  entityType?: Nullable<string>;
  entityId?: Nullable<string>;
  operator?: Nullable<{ displayName?: string; username?: string }>;
  summary?: Nullable<string>;
  ipAddress?: Nullable<string>;
  createdAt: string;
  resourceType?: Nullable<string>;
  resourceId?: Nullable<string>;
  actor?: Nullable<{ displayName?: string; username?: string }>;
  before?: unknown;
  after?: unknown;
};

export type ImportPreview = {
  importId?: string;
  sourceFile: string;
  sourceHash?: string;
  totalRows: number;
  accepted: unknown[];
  skipped: Array<{ row: number; reason: string }>;
  warnings?: Array<{ row?: number; code?: string; message: string }>;
  reconciliation: Record<string, number>;
};

export type BlacklistRecord = {
  id: string;
  personId?: Nullable<string>;
  name: string;
  idCard: string;
  phone?: Nullable<string>;
  reason: string;
  status: "ACTIVE" | "REVOKED";
  operatorName?: Nullable<string>;
  createdAt: string;
  revokedAt?: Nullable<string>;
};

export type AppealRecord = {
  id: string;
  ownerType: "SUPPLIER" | "EMPLOYEE";
  ownerName: string;
  type: "POLICY" | "EMPLOYEE_STATUS" | "SALARY" | "SETTLEMENT";
  content: string;
  status: "PENDING" | "PROCESSING" | "RESOLVED" | "REJECTED";
  relatedPersonId?: Nullable<string>;
  relatedSalarySlipId?: Nullable<string>;
  relatedSettlementItemId?: Nullable<string>;
  appealAmount?: Nullable<number>;
  expectedStatusText?: Nullable<string>;
  evidenceNames?: string[];
  companyReply?: Nullable<string>;
  createdAt: string;
  handledAt?: Nullable<string>;
};

export type AdvanceRequest = {
  id: string;
  personId?: Nullable<string>;
  personName: string;
  amount: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID";
  createdAt: string;
  handledAt?: Nullable<string>;
};

export type ContractTemplate = {
  id: string;
  name: string;
  contractType: string;
  originalName: string;
  version: string;
  isActive: boolean;
  uploadedByName?: Nullable<string>;
  createdAt: string;
};

export type ElectronicSeal = {
  id: string;
  name: string;
  originalName: string;
  status: "ACTIVE" | "DISABLED";
  uploadedByName?: Nullable<string>;
  createdAt: string;
};

export type ElectronicContract = {
  id: string;
  personId: string;
  person?: Nullable<Person>;
  personName: string;
  templateId: string;
  templateName: string;
  sealId?: Nullable<string>;
  sealName?: Nullable<string>;
  contractNo: string;
  status: "PENDING_UPLOAD" | "READY_TO_SIGN" | "SIGNED" | "ARCHIVED" | "CANCELLED";
  materialNames: string[];
  signedFileId?: Nullable<string>;
  signedFileName?: Nullable<string>;
  dueDate?: Nullable<string>;
  createdAt: string;
  signedAt?: Nullable<string>;
  archivedAt?: Nullable<string>;
};

export type DemoMessage = {
  id: string;
  ownerType: "PERSONAL" | "INTERNAL" | "SUPPLIER";
  ownerName: string;
  type:
    | "SALARY_UPDATED"
    | "ADVANCE_RESULT"
    | "SALARY_APPEAL_RESULT"
    | "APPLICATION_SUCCESS"
    | "INTERVIEW_NOTICE"
    | "INTERVIEW_RESULT"
    | "ONBOARD_NOTICE"
    | "REFERRAL_REWARD_ACHIEVED"
    | "REFERRAL_REWARD_PAID"
    | "COMPANY_ANNOUNCEMENT"
    | "CONTRACT_TODO"
    | "SETTLEMENT_UPDATED"
    | "APPEAL_UPDATED";
  title: string;
  content: string;
  targetView?: Nullable<string>;
  relatedPersonId?: Nullable<string>;
  relatedJobDemandId?: Nullable<string>;
  relatedSalarySlipId?: Nullable<string>;
  relatedContractId?: Nullable<string>;
  relatedSettlementItemId?: Nullable<string>;
  unread: boolean;
  createdAt: string;
};

export type RegistrationQr = {
  id: string;
  projectId: string;
  projectName: string;
  jobDemandId?: Nullable<string>;
  jobTitle?: Nullable<string>;
  interviewDate: string;
  source: "现场扫码报名";
  generatedAt: string;
  expiresAt: string;
  operatorName: string;
  status: "ACTIVE" | "EXPIRED";
};

export type SupplierSettlementItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  personId: string;
  personName: string;
  projectId: string;
  projectName: string;
  jobTitle: string;
  onboardDate?: Nullable<string>;
  offboardDate?: Nullable<string>;
  activeDays: number;
  policyName: string;
  expectedAmount: number;
  actualAmount: number;
  status: "PENDING_CALC" | "PENDING_CONFIRM" | "CONFIRMED" | "PAID" | "DISPUTED";
  month: string;
};

export type SupplierSettlementSummary = {
  month: string;
  payableAmount: number;
  confirmedAmount: number;
  pendingAmount: number;
  disputedAmount: number;
  items: SupplierSettlementItem[];
};

export type ReimbursementStatus =
  | "PENDING_SUBMISSION"
  | "DEPARTMENT_PREPARING"
  | "OWNER_REVIEWING"
  | "FINANCE_REVIEWING"
  | "APPROVED"
  | "PENDING_PAYMENT"
  | "PAID";

export type ReimbursementAttachment = {
  id: string;
  batchId: string;
  lineId?: Nullable<string>;
  type: "PAYMENT_VOUCHER" | "INVOICE" | "SUPPORTING";
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

export type ReimbursementLine = {
  id: string;
  sequence: number;
  expenseDate: string;
  category: string;
  description: string;
  payeeName?: Nullable<string>;
  payeeAccount?: Nullable<string>;
  payeeBank?: Nullable<string>;
  paymentCents: number;
  invoiceCents: number;
  attachments: ReimbursementAttachment[];
};

export type ReimbursementIssue = {
  id: string;
  lineId?: Nullable<string>;
  type: string;
  description: string;
  status: "OPEN" | "RESOLVED";
  resolution?: Nullable<string>;
  raisedBy?: Nullable<{ id: string; displayName: string }>;
  resolvedBy?: Nullable<{ id: string; displayName: string }>;
  createdAt: string;
  resolvedAt?: Nullable<string>;
};

export type ReimbursementArtifact = {
  id: string;
  type: "REIMBURSEMENT_FORM" | "PAYMENT_PACKAGE" | "INVOICE_PACKAGE";
  status: "PENDING" | "GENERATED" | "FAILED";
  originalName?: Nullable<string>;
  error?: Nullable<string>;
  generatedAt?: Nullable<string>;
};

export type Reimbursement = {
  id: string;
  code: string;
  title: string;
  applicantUserId: string;
  applicant: { id: string; displayName: string };
  branchId?: Nullable<string>;
  branch?: Nullable<{ id: string; name: string }>;
  organizationUnitId?: Nullable<string>;
  organizationUnit?: Nullable<{ id: string; name: string }>;
  projectId?: Nullable<string>;
  project?: Nullable<{ id: string; name: string }>;
  supplierId?: Nullable<string>;
  supplier?: Nullable<{ id: string; name: string }>;
  status: ReimbursementStatus;
  totalPaymentCents: number;
  totalInvoiceCents: number;
  invoiceExcessCents: number;
  version: number;
  submittedAt?: Nullable<string>;
  approvedAt?: Nullable<string>;
  paidAt?: Nullable<string>;
  createdAt: string;
  updatedAt: string;
  lines: ReimbursementLine[];
  attachments: ReimbursementAttachment[];
  issues: ReimbursementIssue[];
  approvals: Array<{
    id: string;
    fromStatus: ReimbursementStatus;
    toStatus: ReimbursementStatus;
    decision: "APPROVED" | "REJECTED" | "RETURNED";
    comment?: Nullable<string>;
    actor?: Nullable<{ id: string; displayName: string }>;
    createdAt: string;
  }>;
  payment?: Nullable<{
    id: string;
    amountCents: number;
    reference: string;
    paidAt: string;
  }>;
  artifacts: ReimbursementArtifact[];
  _count?: { lines: number; issues: number; attachments: number };
};

export type LeadershipDashboard = {
  asOf: string;
  period: { start: string; end: string; label: string };
  people: {
    outsourcedActive: number;
    internalActive: number;
    totalActive: number;
    onboardMonth: number;
    offboardMonth: number;
    netGrowth: number;
  };
  projects: { active: number; activeSuppliers: number };
  recruitment: {
    activeDemands: number;
    requiredCount: number;
    applicationCount: number;
    remainingCount: number;
    completionRate: number;
  };
  reimbursements: {
    count: number;
    totalPaymentCents: number;
    totalInvoiceCents: number;
    invoiceExcessCents: number;
    paidCount: number;
    pendingCount: number;
    openIssues: number;
    byStatus: Array<{
      status: ReimbursementStatus;
      count: number;
      paymentCents: number;
    }>;
  };
  definitions: string[];
};
