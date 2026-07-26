export type UserRole =
  | "HEADQUARTERS_MANAGER"
  | "BRANCH_MANAGER"
  | "PROJECT_OPERATOR"
  | "RESOURCE_SPECIALIST"
  | "SUPPLIER"
  | "EMPLOYEE"
  | "JOB_SEEKER"
  | "SYSTEM_ADMIN";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  branchId: string | null;
  supplierId: string | null;
  personId: string | null;
  employeeType: string | null;
  projectIds: string[];
  permissions: string[];
};

export type ApiSuccess<T> = { data: T; requestId: string };
export type ApiFailure = { error: { code: string; message: string; details?: unknown }; requestId: string };
export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
export type Paginated<T> = { items: T[]; pagination: Pagination };

export type ProjectImage = {
  id: string;
  url?: string;
  originalName?: string;
  mimeType?: string;
  note?: string | null;
  sortOrder?: number;
};
export type Project = {
  id: string;
  name: string;
  branchId?: string;
  branch?: { id: string; name: string } | null;
  branchName?: string | null;
  managerName?: string | null;
  managerPhone?: string | null;
  description?: string | null;
  images?: ProjectImage[];
};

export type JobDemand = {
  id: string;
  title: string;
  projectId: string;
  project?: Project | null;
  projectName?: string | null;
  requiredCount: number;
  appliedCount?: number;
  passedCount?: number;
  onboardedCount?: number;
  remainingCount?: number;
  progress?: {
    registered: number;
    arrived: number;
    passed: number;
    onboarded: number;
    remainingGap: number;
  };
  requirements: string;
  workContent?: string | null;
  salary: string;
  workTime: string;
  workLocation: string;
  deadline: string;
  status: "RECRUITING" | "PAUSED" | "FILLED" | "ENDED";
  projectImages?: ProjectImage[];
};

export type Person = {
  id: string;
  name: string;
  idCard?: string;
  phone: string;
  projectId?: string | null;
  project?: Project | null;
  projectName?: string | null;
  jobTitle?: string | null;
  employmentStatus?: string | null;
  status?: string | null;
  interviewStatus?: string | null;
  interviewDate?: string | null;
  onboardDate?: string | null;
  offboardDate?: string | null;
  offboardReason?: string | null;
  insuranceTypes?: string[];
  employeeNo?: string | null;
  supplier?: { id: string; name: string } | null;
  recommender?: { id: string; displayName: string } | null;
  notes?: string | null;
  files?: PersonFile[];
};

export type PersonFile = { id: string; originalName: string; url?: string; size?: number; createdAt?: string };
export type Application = {
  id: string;
  person?: Person;
  personName?: string;
  phone?: string;
  jobDemand?: JobDemand;
  status?: string;
  createdAt?: string;
  appliedAt?: string;
};
export type Policy = {
  id: string;
  name: string;
  type: "SUPPLIER" | "EMPLOYEE_REFERRAL";
  project?: Project | null;
  jobTitle?: string | null;
  amount: number;
  achievementConditions: string;
  exclusionConditions?: string | null;
  effectiveAt: string;
  expiresAt?: string | null;
  notes?: string | null;
};
export type Referral = {
  id: string;
  personName?: string;
  maskedPhone?: string;
  person?: Person;
  jobDemand?: JobDemand;
  status?: string;
  onboardDate?: string | null;
  rewardAmount?: number;
  rewardStatus?: string;
  reward?: {
    id: string;
    amount: number | string;
    status: string;
    achievedAt?: string | null;
    paidAt?: string | null;
  } | null;
  createdAt?: string;
};
export type Reward = { id: string; referral?: Referral; amount: number | string; status: string; achievedAt?: string | null; paidAt?: string | null };
export type SalarySlip = {
  id: string;
  salaryMonth: string;
  grossPay: number | string;
  netPay: number | string;
  hourlyPay: number | string;
  overtimePay: number | string;
  allowance: number | string;
  referralReward: number | string;
  socialSecurityDeduction: number | string;
  otherDeduction: number | string;
  notes?: string | null;
  status: string;
};

export type BlacklistRecord = {
  id: string;
  personId?: string | null;
  name: string;
  idCard: string;
  phone?: string | null;
  reason: string;
  status: "ACTIVE" | "REVOKED";
  operatorName?: string | null;
  createdAt: string;
};

export type AppealRecord = {
  id: string;
  ownerType: "SUPPLIER" | "EMPLOYEE";
  ownerName: string;
  type: "POLICY" | "EMPLOYEE_STATUS" | "SALARY" | "SETTLEMENT";
  content: string;
  status: "PENDING" | "PROCESSING" | "RESOLVED" | "REJECTED";
  relatedPersonId?: string | null;
  relatedSalarySlipId?: string | null;
  relatedSettlementItemId?: string | null;
  appealAmount?: number | null;
  expectedStatusText?: string | null;
  evidenceNames?: string[];
  companyReply?: string | null;
  createdAt: string;
};

export type AdvanceRequest = {
  id: string;
  personId?: string | null;
  personName: string;
  amount: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID";
  createdAt: string;
};

export type ElectronicContract = {
  id: string;
  personId: string;
  person?: Person | null;
  personName: string;
  templateId: string;
  templateName: string;
  sealId?: string | null;
  sealName?: string | null;
  contractNo: string;
  status: "PENDING_UPLOAD" | "READY_TO_SIGN" | "SIGNED" | "ARCHIVED" | "CANCELLED";
  materialNames: string[];
  signedFileId?: string | null;
  signedFileName?: string | null;
  dueDate?: string | null;
  createdAt: string;
  signedAt?: string | null;
  archivedAt?: string | null;
};

export type RegistrationInput = {
  name: string;
  idCard: string;
  phone: string;
  projectId: string;
  jobDemandId?: string | null;
  jobTitle: string;
  interviewDate?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  source: "OPERATOR" | "SUPPLIER" | "SELF" | "REFERRAL";
  supplierId?: string | null;
  recommenderUserId?: string | null;
  recommenderName?: string | null;
  notes?: string | null;
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
  targetView?: string | null;
  relatedPersonId?: string | null;
  relatedJobDemandId?: string | null;
  relatedSalarySlipId?: string | null;
  relatedContractId?: string | null;
  relatedSettlementItemId?: string | null;
  unread: boolean;
  createdAt: string;
};

export type RegistrationQr = {
  id: string;
  projectId: string;
  projectName: string;
  jobDemandId?: string | null;
  jobTitle?: string | null;
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
  onboardDate?: string | null;
  offboardDate?: string | null;
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
