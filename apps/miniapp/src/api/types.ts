export type UserRole =
  | "SUPER_ADMIN"
  | "SYSTEM_ADMIN"
  | "GROUP_LEADER"
  | "HEADQUARTERS_MANAGER"
  | "BRANCH_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "INTERNAL_HR"
  | "RECRUITER"
  | "PROJECT_OPERATOR"
  | "RESOURCE_SPECIALIST"
  | "FINANCE_REVIEWER"
  | "CASHIER"
  | "DEPARTMENT_REIMBURSEMENT_CLERK"
  | "SUPPLIER_ADMIN"
  | "SUPPLIER"
  | "OUTSOURCED_EMPLOYEE"
  | "EMPLOYEE"
  | "JOB_SEEKER";

export type DataScopeType = "SELF" | "ORG_UNIT" | "CENTER" | "BRANCH" | "PROJECT" | "SUPPLIER" | "GROUP";

export type SessionScopeBinding = {
  type: DataScopeType;
  branchId?: string | null;
  projectId?: string | null;
  supplierId?: string | null;
  organizationUnitId?: string | null;
};

export type SessionAuthorizationGrant = {
  role: UserRole;
  permissions: string[];
  scopeBindings: SessionScopeBinding[];
};

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  roles: UserRole[];
  branchId: string | null;
  supplierId: string | null;
  personId: string | null;
  employeeType: string | null;
  projectIds: string[];
  permissions: string[];
  scopeBindings: SessionScopeBinding[];
  authorizationGrants?: SessionAuthorizationGrant[];
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
  lineId?: string | null;
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
  payeeName?: string | null;
  payeeAccount?: string | null;
  payeeBank?: string | null;
  paymentCents: number;
  invoiceCents: number;
  attachments: ReimbursementAttachment[];
};

export type ReimbursementIssue = {
  id: string;
  lineId?: string | null;
  type: string;
  description: string;
  status: "OPEN" | "RESOLVED";
  resolution?: string | null;
  raisedBy?: { id: string; displayName: string } | null;
  resolvedBy?: { id: string; displayName: string } | null;
  createdAt: string;
  resolvedAt?: string | null;
};

export type ReimbursementArtifact = {
  id: string;
  type: "REIMBURSEMENT_FORM" | "PAYMENT_PACKAGE" | "INVOICE_PACKAGE";
  status: "PENDING" | "GENERATED" | "FAILED";
  originalName?: string | null;
  error?: string | null;
  generatedAt?: string | null;
};

export type Reimbursement = {
  id: string;
  code: string;
  title: string;
  applicantUserId: string;
  applicant: { id: string; displayName: string };
  branchId?: string | null;
  branch?: { id: string; name: string } | null;
  organizationUnitId?: string | null;
  organizationUnit?: { id: string; name: string } | null;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  supplierId?: string | null;
  supplier?: { id: string; name: string } | null;
  status: ReimbursementStatus;
  totalPaymentCents: number;
  approvedAmountCents?: number | null;
  totalInvoiceCents: number;
  invoiceExcessCents: number;
  version: number;
  submittedAt?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
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
    comment?: string | null;
    actor?: { id: string; displayName: string } | null;
    createdAt: string;
  }>;
  payment?: {
    id: string;
    amountCents: number;
    reference: string;
    paidAt: string;
  } | null;
  artifacts: ReimbursementArtifact[];
  _count?: { lines: number; issues: number; attachments: number };
};


export type DepartmentReimbursementSummary = {
  key: string;
  period: string;
  organizationUnitId: string;
  organizationUnitName: string;
  batchCount: number;
  applicantCount: number;
  totalPaymentCents: number;
  totalApprovedAmountCents: number;
  totalInvoiceCents: number;
  openIssueCount: number;
  readyForFinance: boolean;
  statusCounts: Record<string, number>;
  batchIds: string[];
  categorySummaries: Array<{
    category: string;
    lineCount: number;
    totalPaymentCents: number;
    totalInvoiceCents: number;
  }>;
  applicantSummaries: Array<{
    applicantUserId: string;
    applicantName: string;
    batchCount: number;
    totalPaymentCents: number;
    totalApprovedAmountCents: number;
    totalInvoiceCents: number;
  }>;
  detailRows: Array<{
    batchId: string;
    code: string;
    lineId: string;
    sequence: number;
    expenseDate: string | null;
    applicantUserId: string;
    applicantName: string;
    category: string;
    description: string;
    paymentCents: number;
    invoiceCents: number;
  }>;
};

export type ReimbursementPaymentRosterRow = {
  batchId: string;
  code: string;
  organizationUnitId: string | null;
  organizationUnitName: string;
  applicantUserId: string;
  applicantName: string;
  payeeAccount: string | null;
  payeeBank: string | null;
  approvedAmountCents: number;
  paymentStatus: "PENDING" | "PAID";
  paidAmountCents: number | null;
  paidAt: string | null;
  paymentReference: string | null;
};

export type ReimbursementLineInput = {
  sequence: number;
  expenseDate: string;
  category: string;
  description: string;
  payeeName?: string | null;
  payeeAccount?: string | null;
  payeeBank?: string | null;
  paymentCents: number;
  invoiceCents: number;
};
