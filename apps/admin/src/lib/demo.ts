import {
  ApplicationSource,
  EmploymentStatus,
  ImportStatus,
  InsuranceType,
  InterviewStatus,
  JobStatus,
  PolicyType,
  ProjectStatus,
  RewardStatus,
  ResponsibilityType,
  SalarySlipStatus,
  UserRole,
  rolePermissions
} from "@xiangneng/shared";
import type {
  AppealRecord,
  Application,
  AdvanceRequest,
  AuditLog,
  BlacklistRecord,
  ContractTemplate,
  DashboardData,
  DemoMessage,
  ElectronicContract,
  ElectronicSeal,
  ImportPreview,
  InternalEmployee,
  JobDemand,
  LeadershipDashboard,
  OrganizationOptionSet,
  Person,
  PersonLifecycleRecord,
  Policy,
  Project,
  RegistrationQr,
  Reimbursement,
  ReimbursementArtifact,
  ReimbursementIssue,
  ReimbursementStatus,
  ReferralReward,
  SalarySlip,
  SessionUser,
  SupplierSettlementSummary,
  Supplier,
  UserAccount
} from "../types/domain";
import { loadRealDemoData, type RealDemoData } from "./demo-data.generated";
import { handleDemoAiRequest, resetDemoAiActions } from "./demo-ai";

export const DEMO_CODE = "8888";
export const DEMO_TOKEN = "xiangneng-demo-token";
const DEMO_STATE_KEY = "xiangneng.demo.shared-state.v2";

const now = new Date().toISOString();

const demoOrganizationOptions: OrganizationOptionSet = {
  legalEntities: [
    { id: "demo-legal-1", code: "XN-DEMO-01", name: "祥能演示一分公司有限公司" },
    { id: "demo-legal-2", code: "XN-DEMO-02", name: "祥能演示二分公司有限公司" }
  ],
  branches: [
    { id: "synthetic-branch-01", name: "祥能演示一分公司" },
    { id: "synthetic-branch-02", name: "祥能演示二分公司" },
    { id: "synthetic-branch-03", name: "祥能演示三分公司" }
  ],
  organizationUnits: [
    { id: "demo-org-hr", code: "OU-DEMO-HR", name: "人力资源中心", type: "CENTER", branchId: "synthetic-branch-01", path: "/group/branch-01/hr" },
    { id: "demo-org-ops", code: "OU-DEMO-OPS", name: "运营管理部", type: "DEPARTMENT", branchId: "synthetic-branch-01", path: "/group/branch-01/ops" },
    { id: "demo-org-finance", code: "OU-DEMO-FIN", name: "财务管理部", type: "DEPARTMENT", branchId: "synthetic-branch-01", path: "/group/branch-01/finance" }
  ],
  positions: [
    { id: "demo-position-hr", code: "POS-DEMO-HR", name: "人事专员", organizationUnitId: "demo-org-hr" },
    { id: "demo-position-ops", code: "POS-DEMO-OPS", name: "运营主管", organizationUnitId: "demo-org-ops" },
    { id: "demo-position-finance", code: "POS-DEMO-FIN", name: "财务审核", organizationUnitId: "demo-org-finance" }
  ],
  jobGrades: [
    { id: "demo-grade-5", code: "G5", name: "专业岗位", level: 5 },
    { id: "demo-grade-7", code: "G7", name: "管理岗位", level: 7 }
  ]
};

function createDemoInternalEmployees(): InternalEmployee[] {
  const names = ["张伟", "李娜", "王强", "刘敏", "陈磊", "赵静"];
  return names.map((name, index) => {
    const organizationUnit = demoOrganizationOptions.organizationUnits[index % 3]!;
    const position = demoOrganizationOptions.positions[index % 3]!;
    const branch = demoOrganizationOptions.branches[index % 2]!;
    const onboardDate = `202${index % 3 + 3}-0${index % 8 + 1}-0${index + 1}`;
    return {
      id: `demo-internal-${index + 1}`,
      employeeNo: `XN-DEMO-${String(index + 1).padStart(4, "0")}`,
      userId: `demo-internal-user-${index + 1}`,
      name,
      phone: `13800001${String(index + 1).padStart(3, "0")}`,
      idCard: `510105199${index}0101${String(1200 + index).padStart(4, "0")}`,
      email: `demo${index + 1}@xiangneng.example`,
      legalEntityId: "demo-legal-1",
      branchId: branch.id,
      organizationUnitId: organizationUnit.id,
      positionId: position.id,
      jobGradeId: index < 2 ? "demo-grade-7" : "demo-grade-5",
      status: index === 5 ? "LEFT" : "ACTIVE",
      onboardDate,
      offboardDate: index === 5 ? "2026-06-30" : undefined,
      offboardReason: index === 5 ? "个人发展" : undefined,
      version: 1,
      legalEntity: demoOrganizationOptions.legalEntities[0],
      branch,
      organizationUnit,
      position,
      jobGrade: demoOrganizationOptions.jobGrades[index < 2 ? 1 : 0],
      employments: [{
        id: `demo-employment-${index + 1}`,
        startedAt: onboardDate,
        endedAt: index === 5 ? "2026-06-30" : undefined,
        isPrimary: true,
        reason: "入职",
        legalEntity: demoOrganizationOptions.legalEntities[0],
        branch,
        organizationUnit: { id: organizationUnit.id, name: organizationUnit.name },
        position: { id: position.id, name: position.name },
        jobGrade: { id: index < 2 ? "demo-grade-7" : "demo-grade-5", name: index < 2 ? "管理岗位" : "专业岗位" }
      }],
      changes: [{
        id: `demo-change-${index + 1}`,
        type: "ONBOARD",
        effectiveAt: onboardDate,
        reason: "入职",
        createdAt: `${onboardDate}T09:00:00.000Z`
      }]
    };
  });
}

const reimbursementStatusOrder: ReimbursementStatus[] = [
  "PENDING_SUBMISSION",
  "DEPARTMENT_PREPARING",
  "OWNER_REVIEWING",
  "FINANCE_REVIEWING",
  "APPROVED",
  "PENDING_PAYMENT",
  "PAID"
];

function createDemoReimbursements(): Reimbursement[] {
  return reimbursementStatusOrder.map((status, index) => {
    const paymentCents = (12_000 + index * 3_500) * 100;
    const invoiceCents = paymentCents + (120 + index * 30) * 100;
    const createdAt = `2026-07-${String(10 + index).padStart(2, "0")}T09:00:00.000Z`;
    const lineId = `demo-reimbursement-line-${index + 1}`;
    const attachments = index === 0 ? [] : [
      {
        id: `demo-payment-attachment-${index + 1}`,
        batchId: `demo-reimbursement-${index + 1}`,
        lineId,
        type: "PAYMENT_VOUCHER" as const,
        originalName: `${String(index + 1).padStart(3, "0")}-付款凭证.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 128_000 + index * 1_024,
        sha256: `${index + 1}`.repeat(64).slice(0, 64),
        createdAt
      },
      {
        id: `demo-invoice-attachment-${index + 1}`,
        batchId: `demo-reimbursement-${index + 1}`,
        lineId,
        type: "INVOICE" as const,
        originalName: `${String(index + 1).padStart(3, "0")}-增值税发票.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 156_000 + index * 1_024,
        sha256: `${index + 2}`.repeat(64).slice(0, 64),
        createdAt
      }
    ];
    const approvals = reimbursementStatusOrder
      .slice(1, index + 1)
      .map((toStatus, approvalIndex) => ({
        id: `demo-approval-${index + 1}-${approvalIndex + 1}`,
        fromStatus: reimbursementStatusOrder[approvalIndex]!,
        toStatus,
        decision: "APPROVED" as const,
        comment: `演示流程：${approvalIndex + 1}级处理通过`,
        actor: { id: `demo-actor-${approvalIndex + 1}`, displayName: ["张伟", "王主管", "财务审核", "出纳"][approvalIndex % 4]! },
        createdAt: `2026-07-${String(11 + index).padStart(2, "0")}T${String(9 + approvalIndex).padStart(2, "0")}:00:00.000Z`
      }));
    return {
      id: `demo-reimbursement-${index + 1}`,
      code: `BX-202607-${String(index + 1).padStart(4, "0")}`,
      title: ["项目差旅报销", "办公用品报销", "项目材料报销", "客户拜访差旅报销", "招聘会场地报销", "培训费用报销", "运营活动费用报销"][index]!,
      applicantUserId: "demo-systemAdmin",
      applicant: { id: "demo-systemAdmin", displayName: ["张伟", "李娜", "王强", "刘敏", "陈磊", "赵静", "周敏"][index]! },
      branchId: demoOrganizationOptions.branches[index % 3]!.id,
      branch: demoOrganizationOptions.branches[index % 3]!,
      organizationUnitId: demoOrganizationOptions.organizationUnits[index % 3]!.id,
      organizationUnit: demoOrganizationOptions.organizationUnits[index % 3]!,
      status,
      totalPaymentCents: paymentCents,
      totalInvoiceCents: invoiceCents,
      invoiceExcessCents: invoiceCents - paymentCents,
      version: index + 1,
      submittedAt: index > 0 ? createdAt : undefined,
      approvedAt: index >= 4 ? createdAt : undefined,
      paidAt: status === "PAID" ? "2026-07-24T15:30:00.000Z" : undefined,
      createdAt,
      updatedAt: `2026-07-${String(18 + index).padStart(2, "0")}T14:30:00.000Z`,
      lines: [{
        id: lineId,
        sequence: 1,
        expenseDate: `2026-07-${String(8 + index).padStart(2, "0")}`,
        category: ["差旅费", "办公费", "项目材料费"][index % 3]!,
        description: `演示完整业务明细 ${index + 1}：已维护用途、收款人、付款金额和发票金额`,
        payeeName: ["张伟", "李娜", "王强"][index % 3]!,
        payeeAccount: `62220210000000${String(index + 1).padStart(4, "0")}`,
        payeeBank: "中国工商银行演示支行",
        paymentCents,
        invoiceCents,
        attachments
      }],
      attachments,
      issues: index === 3 ? [{
        id: "demo-reimbursement-issue-1",
        lineId,
        type: "附件缺失",
        description: "补充出差审批单",
        status: "OPEN",
        raisedBy: { id: "demo-finance", displayName: "财务审核" },
        createdAt: "2026-07-20T10:00:00.000Z"
      }] : [],
      approvals,
      payment: status === "PAID" ? {
        id: "demo-payment-1",
        amountCents: paymentCents,
        reference: "XN202607240001",
        paidAt: "2026-07-24T15:30:00.000Z"
      } : undefined,
      artifacts: index >= 4 ? ([
        "REIMBURSEMENT_FORM",
        "PAYMENT_PACKAGE",
        "INVOICE_PACKAGE"
      ] as const).map((type) => ({
        id: `demo-artifact-${index + 1}-${type}`,
        type,
        status: "GENERATED" as const,
        originalName: `${type}-${index + 1}`,
        generatedAt: createdAt
      })) : [],
      _count: { lines: 1, issues: index === 3 ? 1 : 0, attachments: attachments.length }
    };
  });
}

let internalEmployees = createDemoInternalEmployees();
let reimbursements = createDemoReimbursements();

export const demoUser: SessionUser = {
  id: "demo-admin",
  username: "demo",
  displayName: "演示管理员",
  role: UserRole.SYSTEM_ADMIN,
  branchId: null,
  supplierId: null,
  personId: null,
  projectIds: [],
  permissions: [...rolePermissions[UserRole.SYSTEM_ADMIN]]
};

export function demoUserForRole(role: string): SessionUser {
  const resolvedRole = {
    leader: UserRole.GROUP_LEADER,
    systemAdmin: UserRole.SYSTEM_ADMIN,
    operator: UserRole.PROJECT_OPERATOR,
    supplier: UserRole.SUPPLIER_ADMIN,
    employee: UserRole.EMPLOYEE,
    candidate: UserRole.JOB_SEEKER
  }[role] ?? UserRole.SYSTEM_ADMIN;
  const displayName = {
    [UserRole.GROUP_LEADER]: "集团领导演示账号",
    [UserRole.SYSTEM_ADMIN]: "系统管理员演示账号",
    [UserRole.PROJECT_OPERATOR]: "现场运营演示账号",
    [UserRole.SUPPLIER_ADMIN]: "供应商管理员演示账号",
    [UserRole.EMPLOYEE]: "内部员工演示账号",
    [UserRole.JOB_SEEKER]: "求职者演示账号"
  }[resolvedRole] ?? "演示账号";
  return {
    ...demoUser,
    id: `demo-${role}`,
    username: `demo_${role}`,
    displayName,
    role: resolvedRole,
    permissions: [...rolePermissions[resolvedRole]]
  };
}

type QueryRecord = Record<string, unknown>;
type DemoApplication = Record<string, unknown> & {
  id: string;
  personId: string;
  jobDemandId?: string;
  source?: string;
  person?: Person;
};

let realData: RealDemoData | null = null;
let realDemoMeta: RealDemoData["meta"] = {
  sourceFile: "",
  sourceHash: "",
  sheetName: "",
  range: "",
  sourceRows: 0,
  personMasters: 0,
  applicationRecords: 0,
  repeatedApplicationRows: 0,
  branches: 0,
  projectsFromOrg: 0,
  totalDemoProjects: 0,
  unmatchedProjects: 0,
  supplierCount: 0
};
let projects: Project[] = [];
let suppliers: Supplier[] = [];
let people: Person[] = [];
let applications: DemoApplication[] = [];
let jobDemands: JobDemand[] = [];
let salarySlips: SalarySlip[] = [];
let rewards: ReferralReward[] = [];
let blacklistRecords: BlacklistRecord[] = [];
let appealRecords: AppealRecord[] = [];
let advanceRequests: AdvanceRequest[] = [];
let contractTemplates: ContractTemplate[] = [];
let electronicSeals: ElectronicSeal[] = [];
let electronicContracts: ElectronicContract[] = [];
let registrationQrs: RegistrationQr[] = [];
let changedPersonIds = new Set<string>();
let candidateDemoPersonId: string | undefined;
let branchById = new Map<string, RealDemoData["branches"][number]>();
let projectById = new Map<string, Project>();
let supplierById = new Map<string, Supplier>();
let personById = new Map<string, Person>();
let jobDemandById = new Map<string, JobDemand>();
const peopleFilterCache = new Map<string, Person[]>();
const dashboardCache = new Map<string, DashboardData>();

type PersistedDemoState = {
  internalEmployees?: InternalEmployee[];
  reimbursements?: Reimbursement[];
  projects: Project[];
  suppliers: Supplier[];
  people: Person[];
  applications: DemoApplication[];
  jobDemands: JobDemand[];
  salarySlips: SalarySlip[];
  rewards: ReferralReward[];
  blacklistRecords: BlacklistRecord[];
  appealRecords: AppealRecord[];
  advanceRequests: AdvanceRequest[];
  contractTemplates: ContractTemplate[];
  electronicSeals: ElectronicSeal[];
  electronicContracts: ElectronicContract[];
  registrationQrs?: RegistrationQr[];
  candidateDemoPersonId?: string;
};

// 真实感供应商 / 员工政策（演示数据）
// 注意：policies[1] 被复用作"员工推荐政策"，请勿调整其顺序。
const policies: Policy[] = [
  {
    id: "policy-supplier-a",
    name: "A级供应商管理费政策",
    type: PolicyType.SUPPLIER,
    projectId: "",
    supplierLevel: "A级",
    amount: 800,
    achievementConditions: "供应商推荐人员入职满30天且在职，按实际在岗人数每人结算800元管理费；月度对账、次月支付。",
    exclusionConditions: "试用期未通过、未满30天离职人员不计入结算。",
    effectiveAt: "2026-07-01",
    isActive: true
  },
  {
    id: "policy-real-referral",
    name: "员工内部推荐奖励政策",
    type: PolicyType.EMPLOYEE_REFERRAL,
    projectId: "",
    employeeType: "普通员工",
    amount: 300,
    achievementConditions: "在职员工推荐社会人员入职，被推荐人入职满15天且通过试用期，发放推荐奖励300元/人。",
    exclusionConditions: "被推荐人与推荐人为直系亲属或同项目同岗位的不予发放。",
    effectiveAt: "2026-07-01",
    isActive: true
  },
  {
    id: "policy-supplier-b",
    name: "B级供应商管理费政策",
    type: PolicyType.SUPPLIER,
    projectId: "",
    supplierLevel: "B级",
    amount: 600,
    achievementConditions: "供应商推荐人员入职满30天且在职，按实际在岗人数每人结算600元管理费。",
    exclusionConditions: "未满30天离职人员不计入结算。",
    effectiveAt: "2026-07-01",
    isActive: true
  },
  {
    id: "policy-supplier-c",
    name: "C级供应商管理费政策",
    type: PolicyType.SUPPLIER,
    projectId: "",
    supplierLevel: "C级",
    amount: 400,
    achievementConditions: "供应商推荐人员入职满30天且在职，按实际在岗人数每人结算400元管理费。",
    effectiveAt: "2026-07-01",
    isActive: true
  },
  {
    id: "policy-project-bonus",
    name: "重点岗位到岗激励",
    type: PolicyType.SUPPLIER,
    projectId: "",
    supplierLevel: "A级",
    amount: 200,
    achievementConditions: "针对紧缺岗位，供应商推荐人员入职满60天且在职，额外发放到岗激励200元/人。",
    effectiveAt: "2026-07-15",
    isActive: true
  }
];

const demoManagers = ["张伟", "李娜", "王强", "刘敏", "陈磊", "赵静", "周主管", "蒋经理"];
const demoRecommenders = ["张川", "李工", "王主管", "赵主管", "陈工", "刘工", "周主管", "蒋俊"];
const demoJobTitles = ["普工", "操作工", "包装工", "质检员", "库管员", "装配工", "保安员", "后勤人员"];
const demoBusinessTypes = ["制造外包", "劳务派遣", "后勤服务", "安保服务", "临时用工"];
const demoSupplierLevels = ["A级", "B级", "C级"];
const demoWorkContents = [
  "按项目班组安排完成现场生产、装配、包装、质检及物料流转等工作，遵守现场安全与考勤要求。",
  "负责项目现场日常操作、设备辅助、成品整理、异常上报及交接记录，配合班组长完成排班任务。",
  "根据岗位 SOP 完成标准化作业，保持工位整洁，配合质量检查、仓储收发和现场协同。"
];

// ===== 模拟数据丰富化：项目封面 / 简介 / 岗位需求 =====

const coverThemeByBusiness: Record<string, [string, string]> = {
  "制造外包": ["#2563eb", "#1e3a8a"],
  "劳务派遣": ["#0891b2", "#0e7490"],
  "后勤服务": ["#16a34a", "#15803d"],
  "安保服务": ["#b45309", "#92400e"],
  "临时用工": ["#7c3aed", "#6d28d9"]
};

function coverTheme(businessType?: string | null): [string, string] {
  const key = (businessType ?? "").trim();
  const direct = coverThemeByBusiness[key];
  if (direct) return direct;
  if (key.includes("制造") || key.includes("生产")) return coverThemeByBusiness["制造外包"]!;
  if (key.includes("派遣")) return coverThemeByBusiness["劳务派遣"]!;
  if (key.includes("后勤") || key.includes("物业")) return coverThemeByBusiness["后勤服务"]!;
  if (key.includes("安保") || key.includes("保安")) return coverThemeByBusiness["安保服务"]!;
  if (key.includes("临时") || key.includes("短期")) return coverThemeByBusiness["临时用工"]!;
  return ["#475569", "#334155"];
}

function splitCoverName(name: string): string[] {
  const text = (name ?? "祥能项目").trim();
  if (text.length <= 13) return [text];
  const mid = Math.ceil(text.length / 2);
  return [text.slice(0, mid), text.slice(mid)];
}

function escapeXml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function projectCoverDataUri(project: Project): string {
  const [c1, c2] = coverTheme(project.businessType);
  const lines = splitCoverName(project.name);
  const nameSpans = lines
    .map((line, index) => `<text x="48" y="${170 + index * 70}" fill="#ffffff" font-family="-apple-system,Segoe UI,Microsoft YaHei,sans-serif" font-size="50" font-weight="800">${escapeXml(line)}</text>`)
    .join("");
  const businessLabel = escapeXml(project.businessType ?? "综合用工");
  const branchLabel = escapeXml(project.branchName ?? "祥能");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><g fill="#ffffff" opacity="0.10"><circle cx="660" cy="70" r="130"/><circle cx="730" cy="400" r="95"/><circle cx="70" cy="410" r="75"/></g><text x="48" y="76" fill="#ffffff" opacity="0.85" font-family="-apple-system,Segoe UI,Microsoft YaHei,sans-serif" font-size="24" font-weight="600">${businessLabel} · ${branchLabel}</text>${nameSpans}<text x="48" y="412" fill="#ffffff" opacity="0.7" font-family="-apple-system,Segoe UI,Microsoft YaHei,sans-serif" font-size="20">祥能人力资本 · 演示数据</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const industryHintByBusiness: Record<string, string> = {
  "制造外包": "制造型企业产线及辅助岗位",
  "劳务派遣": "用工单位一线生产与服务岗位",
  "后勤服务": "园区后勤、物业与配套服务",
  "安保服务": "厂区与园区安全秩序维护",
  "临时用工": "旺季产能与短期项目用工"
};

function industryHint(businessType?: string | null): string {
  const key = (businessType ?? "").trim();
  const direct = industryHintByBusiness[key];
  if (direct) return direct;
  if (key.includes("制造") || key.includes("生产")) return industryHintByBusiness["制造外包"]!;
  if (key.includes("派遣")) return industryHintByBusiness["劳务派遣"]!;
  if (key.includes("后勤") || key.includes("物业")) return industryHintByBusiness["后勤服务"]!;
  if (key.includes("安保") || key.includes("保安")) return industryHintByBusiness["安保服务"]!;
  if (key.includes("临时") || key.includes("短期")) return industryHintByBusiness["临时用工"]!;
  return "各类标准化用工岗位";
}

function enrichProjectDescription(project: Project): string {
  const manager = project.managerName ?? "项目负责人";
  const branch = project.branchName ?? "属地";
  const business = project.businessType ?? "综合用工";
  const industry = industryHint(project.businessType);
  return `${project.name}为祥能人力资本在${branch}落地的${business}项目，由${manager}担任现场负责人。项目面向${industry}提供标准化用工与现场管理服务，配套考勤排班、保险代缴、薪酬代发等闭环能力，保障用工合规与人员稳定，是企业弹性用工的可靠选择。`;
}

const jobTitleByBusiness: Record<string, string[]> = {
  "制造外包": ["普工/操作工", "装配工", "质检员", "包装工", "设备辅助工"],
  "劳务派遣": ["线体操作工", "仓管员", "物料员", "产线质检"],
  "后勤服务": ["保洁员", "食堂帮工", "后勤辅助", "宿管员"],
  "安保服务": ["保安员", "秩序维护员", "消防协管"],
  "临时用工": ["短期操作工", "旺季支援工", "活动协助"]
};

function jobTitlesFor(businessType?: string | null): string[] {
  const key = (businessType ?? "").trim();
  const direct = jobTitleByBusiness[key];
  if (direct) return direct;
  if (key.includes("制造") || key.includes("生产")) return jobTitleByBusiness["制造外包"]!;
  if (key.includes("派遣")) return jobTitleByBusiness["劳务派遣"]!;
  if (key.includes("后勤") || key.includes("物业")) return jobTitleByBusiness["后勤服务"]!;
  if (key.includes("安保") || key.includes("保安")) return jobTitleByBusiness["安保服务"]!;
  if (key.includes("临时") || key.includes("短期")) return jobTitleByBusiness["临时用工"]!;
  return ["普工/操作工", "辅助工", "质检员"];
}

const salaryPool = [
  "5000-6500元/月",
  "5500-7000元/月（含餐补）",
  "18-22元/小时",
  "6000元/月 + 绩效",
  "5200-6200元/月",
  "20元/小时（夜班补贴另计）"
];
const requirementsPool = [
  "初中及以上学历，身体健康，无不良记录，能适应站立作业与倒班，服从现场管理。",
  "年龄18-48周岁，吃苦耐劳，有工厂经验优先，需持有效身份证件。",
  "身体健康，责任心强，能配合加班与旺季排班，入职即缴工伤保险。",
  "学历不限，适应流水线作业，遵守安全规范，团队意识强。"
];
const workTimePool = [
  "早8:00-晚20:00，两班倒，月休4天",
  "8:00-17:00 长白班，周末轮休",
  "8:00-20:00 排班制，月休6天",
  "根据产线排班，早中晚三班轮换"
];

function demoPick<T>(list: T[], seed: unknown): T {
  return list[stableIndex(seed, list.length)]!;
}

function buildGeneratedJobDemands(base: JobDemand[], allProjects: Project[]): JobDemand[] {
  const existingProjectIds = new Set(base.map((job) => job.projectId));
  const target = 36;
  const result: JobDemand[] = [...base];
  const candidates = [...allProjects]
    .sort((left, right) => (right.activeCount ?? 0) - (left.activeCount ?? 0))
    .filter((project) => !existingProjectIds.has(project.id));
  for (const project of candidates) {
    if (result.length >= target) break;
    const titles = jobTitlesFor(project.businessType);
    const title = demoPick(titles, `${project.id}-title`);
    const requiredCount = 15 + stableIndex(`${project.id}-count`, 60);
    const applicationCount = requiredCount + stableIndex(`${project.id}-app`, 80);
    const passedCount = Math.floor(applicationCount * (0.4 + stableIndex(`${project.id}-p`, 30) / 100));
    const onboardCount = Math.floor(passedCount * (0.6 + stableIndex(`${project.id}-o`, 30) / 100));
    const arrivedCount = Math.floor(applicationCount * (0.7 + stableIndex(`${project.id}-a`, 20) / 100));
    const remaining = Math.max(0, requiredCount - onboardCount);
    result.push({
      id: `gen-job-${project.id}`,
      projectId: project.id,
      project,
      projectName: project.name,
      branchName: project.branchName,
      title,
      requiredCount,
      requirements: demoPick(requirementsPool, `${project.id}-req`),
      workContent: demoPick(demoWorkContents, `${project.id}-wc`),
      salary: demoPick(salaryPool, `${project.id}-sal`),
      workTime: demoPick(workTimePool, `${project.id}-wt`),
      workLocation: `${project.branchName ?? "属地"} · ${project.name}`,
      deadline: "2026-08-15",
      status: JobStatus.RECRUITING,
      applicationCount,
      arrivedCount,
      passedCount,
      onboardCount,
      remainingCount: remaining,
      createdAt: "2026-07-01"
    });
  }
  return result;
}

function stableIndex(seed: unknown, modulo: number): number {
  const text = String(seed ?? "");
  const value = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return modulo ? value % modulo : 0;
}

function isMissing(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return !text || text === "—" || text.includes("待维护");
}

function demoPhone(seed: unknown): string {
  const suffix = String(10000000 + stableIndex(seed, 89999999)).padStart(8, "0").slice(0, 8);
  return `138${suffix}`;
}

function demoJobTitle(person: Person): string {
  if (!isMissing(person.jobTitle)) return person.jobTitle;
  const projectName = person.projectName ?? person.project?.name ?? "";
  if (projectName.includes("保安") || projectName.includes("安保")) return "保安员";
  if (projectName.includes("食堂") || projectName.includes("后勤")) return "后勤人员";
  if (projectName.includes("物流") || projectName.includes("仓")) return "库管员";
  if (projectName.includes("电子") || projectName.includes("光电")) return "操作工";
  return demoJobTitles[stableIndex(person.id, demoJobTitles.length)]!;
}

function isSelfRecruitPerson(person: Person, supplier?: Supplier): boolean {
  const supplierName = supplier?.name ?? person.supplierName ?? "";
  return supplierName.includes("祥能自招") || supplierName.includes("自招");
}

function canPersistDemoState(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readPersistedDemoState(): PersistedDemoState | null {
  if (!canPersistDemoState()) return null;
  const raw = localStorage.getItem(DEMO_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedDemoState;
  } catch {
    localStorage.removeItem(DEMO_STATE_KEY);
    return null;
  }
}

function personForStorage(person: Person): Person {
  const { branch: _branch, project: _project, supplier: _supplier, recommender: _recommender, supplierPolicy: _supplierPolicy, statusLogs: _statusLogs, ...rest } = person;
  return rest;
}

function applicationForStorage(application: DemoApplication): DemoApplication {
  const { person: _person, ...rest } = application;
  return rest;
}

function rewardForStorage(reward: ReferralReward): ReferralReward {
  const { person: _person, policy: _policy, referral: _referral, ...rest } = reward;
  return rest;
}

function projectForStorage(project: Project): Project {
  const { branch: _branch, ...rest } = project;
  return rest;
}

function supplierForStorage(supplier: Supplier): Supplier {
  const { projects: _projects, projectLinks: _projectLinks, ...rest } = supplier;
  return rest;
}

function jobDemandForStorage(job: JobDemand): JobDemand {
  const { project: _project, supplierPolicy: _supplierPolicy, referralPolicy: _referralPolicy, ...rest } = job;
  return rest;
}

function persistDemoState(): void {
  if (!canPersistDemoState()) return;
  const state: PersistedDemoState = {
    internalEmployees,
    reimbursements,
    projects: projects.map(projectForStorage),
    suppliers: suppliers.map(supplierForStorage),
    people: people.filter((person) => changedPersonIds.has(person.id) || person.id.startsWith("person-demo-")).map(personForStorage),
    applications: applications.filter((application) => application.id.startsWith("application-demo-")).map(applicationForStorage),
    jobDemands: jobDemands.map(jobDemandForStorage),
    salarySlips: [],
    rewards: rewards.filter((reward) => reward.id.startsWith("reward-demo-")).map(rewardForStorage),
    blacklistRecords,
    appealRecords,
    advanceRequests,
    contractTemplates,
    electronicSeals,
    electronicContracts,
    registrationQrs,
    candidateDemoPersonId
  };
  localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
}

function clearPersistedDemoState(): void {
  if (canPersistDemoState()) localStorage.removeItem(DEMO_STATE_KEY);
}

function lifecycleInfo(person: Person): string {
  const relatedProjectName = person.projectName ?? person.project?.name;
  const relatedSupplierName = person.supplierName ?? person.supplier?.name;
  return [
    relatedProjectName ? `项目：${relatedProjectName}` : "",
    person.jobTitle ? `岗位：${person.jobTitle}` : "",
    relatedSupplierName ? `供应商：${relatedSupplierName}` : "",
    person.recommenderName ? `推荐人：${person.recommenderName}` : ""
  ].filter(Boolean).join("；");
}

function lifecycleRecord(person: Person, type: PersonLifecycleRecord["type"], result: string, businessInfo: string, operatedAt?: string): PersonLifecycleRecord {
  return {
    id: `life-${person.id}-${type.toLowerCase()}-${Date.now()}-${stableIndex(`${person.id}-${type}-${businessInfo}`, 10000)}`,
    personId: person.id,
    operatedAt: operatedAt ?? new Date().toISOString(),
    type,
    result,
    businessInfo,
    operatorName: "演示系统"
  };
}

function initialLifecycle(person: Person): PersonLifecycleRecord[] {
  const items: PersonLifecycleRecord[] = [];
  const registeredAt = person.createdAt ?? person.interviewDate ?? person.onboardDate ?? now;
  items.push(lifecycleRecord(person, "REGISTRATION", "已报名", lifecycleInfo(person) || "报名登记", registeredAt));
  if (person.interviewStatus || person.interviewDate) {
    items.push(lifecycleRecord(person, "INTERVIEW", person.interviewStatus ? `面试状态：${person.interviewStatus}` : "已安排面试", [
      person.interviewDate ? `面试日期：${person.interviewDate}` : "",
      lifecycleInfo(person)
    ].filter(Boolean).join("；"), person.interviewDate ?? registeredAt));
  }
  if (person.onboardDate || person.employmentStatus === EmploymentStatus.ACTIVE) {
    items.push(lifecycleRecord(person, "ONBOARD", "已入职", [
      person.onboardDate ? `入职日期：${person.onboardDate}` : "",
      person.employeeNo ? `工号：${person.employeeNo}` : "",
      lifecycleInfo(person)
    ].filter(Boolean).join("；"), person.onboardDate ?? registeredAt));
  }
  if (person.insuranceTypes?.length) {
    items.push(lifecycleRecord(person, "INSURANCE", "保险已更新", `保险：${person.insuranceTypes.join("、")}`, person.updatedAt ?? person.onboardDate ?? registeredAt));
  }
  if (person.offboardDate || person.employmentStatus === EmploymentStatus.LEFT) {
    items.push(lifecycleRecord(person, "OFFBOARD", "已离职", [
      person.offboardDate ? `离职日期：${person.offboardDate}` : "",
      person.offboardReason ? `原因：${person.offboardReason}` : ""
    ].filter(Boolean).join("；") || "办理离职", person.offboardDate ?? person.updatedAt ?? registeredAt));
  }
  return items.sort((a, b) => a.operatedAt.localeCompare(b.operatedAt));
}

function withLifecycle(person: Person): Person {
  return { ...person, lifecycle: person.lifecycle?.length ? person.lifecycle : initialLifecycle(person) };
}

function rebuildReferenceIndexes(): void {
  projectById = new Map(projects.map((project) => [project.id, project]));
  supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  personById = new Map(people.map((person) => [person.id, person]));
  jobDemandById = new Map(jobDemands.map((job) => [job.id, job]));
}

function syncDerivedData(): void {
  rebuildReferenceIndexes();
  peopleFilterCache.clear();
  dashboardCache.clear();

  const projectStats = new Map<string, { active: number; onboarded: number; offboarded: number; interviewed: number }>();
  const supplierStats = new Map<string, { active: number; applications: number; arrived: number; passed: number; onboarded: number; offboarded: number }>();
  for (const person of people) {
    const projectStat = projectStats.get(person.projectId ?? "") ?? { active: 0, onboarded: 0, offboarded: 0, interviewed: 0 };
    if (person.employmentStatus === EmploymentStatus.ACTIVE) projectStat.active += 1;
    if (person.onboardDate) projectStat.onboarded += 1;
    if (person.offboardDate) projectStat.offboarded += 1;
    if (person.interviewDate) projectStat.interviewed += 1;
    projectStats.set(person.projectId ?? "", projectStat);

    if (person.supplierId) {
      const supplierStat = supplierStats.get(person.supplierId) ?? { active: 0, applications: 0, arrived: 0, passed: 0, onboarded: 0, offboarded: 0 };
      supplierStat.applications += 1;
      if (person.employmentStatus === EmploymentStatus.ACTIVE) supplierStat.active += 1;
      if (person.interviewStatus === InterviewStatus.ARRIVED) supplierStat.arrived += 1;
      if (person.interviewStatus === InterviewStatus.PASSED) supplierStat.passed += 1;
      if (person.onboardDate) supplierStat.onboarded += 1;
      if (person.offboardDate) supplierStat.offboarded += 1;
      supplierStats.set(person.supplierId, supplierStat);
    }
  }

  projects = projects.map((project) => {
    const scoped = projectStats.get(project.id) ?? { active: 0, onboarded: 0, offboarded: 0, interviewed: 0 };
    return { ...project, activeCount: scoped.active, onboardCount: scoped.onboarded, offboardCount: scoped.offboarded, interviewCount: scoped.interviewed };
  });
  projectById = new Map(projects.map((project) => [project.id, project]));

  suppliers = suppliers.map((supplier) => {
    const scoped = supplierStats.get(supplier.id) ?? { active: 0, applications: 0, arrived: 0, passed: 0, onboarded: 0, offboarded: 0 };
    return {
      ...supplier,
      projects: (supplier.projectIds ?? []).map((projectId) => projectById.get(projectId)).filter((project): project is Project => Boolean(project)),
      activeCount: scoped.active,
      applicationCount: scoped.applications,
      arrivedCount: scoped.arrived,
      passedCount: scoped.passed,
      onboardCount: scoped.onboarded,
      offboardCount: scoped.offboarded
    };
  });
  supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

  const jobStats = new Map<string, { applications: number; arrived: number; passed: number; onboarded: number }>();
  for (const application of applications) {
    if (!application.jobDemandId) continue;
    const person = personById.get(application.personId);
    const scoped = jobStats.get(application.jobDemandId) ?? { applications: 0, arrived: 0, passed: 0, onboarded: 0 };
    const applicationInterviewStatus = application.interviewStatus ?? person?.interviewStatus;
    const applicationEmploymentStatus = application.employmentStatus ?? person?.employmentStatus;
    const applicationOnboardDate = application.onboardDate ?? person?.onboardDate;
    scoped.applications += 1;
    if (applicationInterviewStatus === InterviewStatus.ARRIVED || applicationInterviewStatus === InterviewStatus.PASSED) scoped.arrived += 1;
    if (applicationInterviewStatus === InterviewStatus.PASSED) scoped.passed += 1;
    if (applicationOnboardDate || applicationEmploymentStatus === EmploymentStatus.ACTIVE) scoped.onboarded += 1;
    jobStats.set(application.jobDemandId, scoped);
  }

  jobDemands = jobDemands.map((job) => {
    const scoped = jobStats.get(job.id) ?? { applications: 0, arrived: 0, passed: 0, onboarded: 0 };
    const hasLive = scoped.applications > 0;
    const baseApplications = hasLive ? scoped.applications : (job.applicationCount ?? 0);
    const baseArrived = hasLive ? scoped.arrived : (job.arrivedCount ?? 0);
    const basePassed = hasLive ? scoped.passed : (job.passedCount ?? 0);
    const baseOnboarded = hasLive ? scoped.onboarded : (job.onboardCount ?? 0);
    const remainingGap = Math.max(0, job.requiredCount - baseOnboarded);
    return {
      ...job,
      project: projectById.get(job.projectId) ?? job.project,
      applicationCount: baseApplications,
      appliedCount: baseApplications,
      arrivedCount: baseArrived,
      passedCount: basePassed,
      onboardCount: baseOnboarded,
      remainingCount: remainingGap,
      progress: { registered: baseApplications, arrived: baseArrived, passed: basePassed, onboarded: baseOnboarded, remainingGap }
    };
  });
  jobDemandById = new Map(jobDemands.map((job) => [job.id, job]));

  applications = applications.map((application) => {
    const person = personById.get(application.personId) ?? application.person as Person | undefined;
    const jobDemand = (application.jobDemandId ? jobDemandById.get(application.jobDemandId) ?? application.jobDemand : application.jobDemand) as JobDemand | undefined;
    const applicationProjectId = jobDemand?.projectId;
    const sameAssignment = Boolean(person) && (!applicationProjectId || applicationProjectId === person?.projectId);
    return {
      ...application,
      person,
      jobDemand,
      interviewStatus: application.interviewStatus ?? (sameAssignment ? person?.interviewStatus : undefined),
      interviewDate: application.interviewDate ?? (sameAssignment ? person?.interviewDate : undefined),
      employmentStatus: application.employmentStatus ?? (sameAssignment ? person?.employmentStatus : undefined),
      onboardDate: application.onboardDate ?? (sameAssignment ? person?.onboardDate : undefined),
      offboardDate: application.offboardDate ?? (sameAssignment ? person?.offboardDate : undefined),
      offboardReason: application.offboardReason ?? (sameAssignment ? person?.offboardReason : undefined)
    };
  });
  salarySlips = salarySlips.map((slip) => ({ ...slip, person: (slip.personId ? personById.get(slip.personId) : undefined) ?? slip.person }));
  rewards = rewards.map((reward) => ({ ...reward, person: (reward.personId ? personById.get(reward.personId) : undefined) ?? reward.person }));
  electronicContracts = electronicContracts.map((contract) => ({
    ...contract,
    person: personById.get(contract.personId) ?? contract.person,
    personName: personById.get(contract.personId)?.name ?? contract.personName
  }));
}

function commitDemoState(): void {
  syncDerivedData();
  persistDemoState();
}

async function ensureRealDemoData(): Promise<void> {
  if (realData) return;
  realData = await loadRealDemoData();
  realDemoMeta = realData.meta;
  branchById = new Map(realData.branches.map((branch) => [branch.id, branch]));
  projects = realData.projects.map((project, index) => {
    const businessType = isMissing(project.businessType) ? demoBusinessTypes[index % demoBusinessTypes.length] : project.businessType;
    const managerName = isMissing(project.managerName) ? demoManagers[index % demoManagers.length] : project.managerName;
    const managerPhone = isMissing(project.managerPhone) ? demoPhone(project.id) : project.managerPhone;
    const cooperationStart = project.cooperationStart ?? `2026-${String((index % 6) + 1).padStart(2, "0")}-01`;
    const cooperationEnd = project.cooperationEnd ?? `2027-${String((index % 6) + 1).padStart(2, "0")}-28`;
    const responsibility = project.responsibility && project.responsibility !== ResponsibilityType.PENDING_CONFIRMATION ? project.responsibility : ResponsibilityType.OURS;
    const branchName = project.branchName ?? branchById.get(project.branchId)?.name;
    const enrichedProject = {
      ...project,
      branch: branchById.get(project.branchId),
      status: project.status && project.status !== ProjectStatus.PENDING_CONFIRMATION ? project.status : ProjectStatus.ACTIVE,
      businessType,
      managerName,
      managerPhone,
      cooperationStart,
      cooperationEnd,
      responsibility,
      description: isMissing(project.description) ? enrichProjectDescription({ ...project, businessType, managerName, branchName } as Project) : project.description,
      remark: isMissing(project.remark) ? undefined : project.remark,
      images: project.images && project.images.length ? project.images : [{
        id: `img-${project.id}`,
        projectId: project.id,
        url: projectCoverDataUri({ ...project, businessType, branchName } as Project),
        fileName: "cover.svg",
        originalName: project.name,
        sortOrder: 0
      }]
    } as Project;
    return enrichedProject;
  });
  projectById = new Map(projects.map((project) => [project.id, project]));
  suppliers = realData.suppliers.map((supplier, index) => ({
    ...supplier,
    contactName: isMissing(supplier.contactName) ? demoManagers[index % demoManagers.length] : supplier.contactName,
    contactPhone: isMissing(supplier.contactPhone) ? demoPhone(supplier.id) : supplier.contactPhone,
    level: isMissing(supplier.level) ? demoSupplierLevels[index % demoSupplierLevels.length] : supplier.level,
    projects: (supplier.projectIds ?? []).map((projectId) => projectById.get(projectId)).filter((project): project is Project => Boolean(project))
  }));
  supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  people = realData.people.map(hydratePerson);
  personById = new Map(people.map((person) => [person.id, person]));
  const baseJobDemands: JobDemand[] = realData.jobDemands.map((job) => {
    const project = projectById.get(job.projectId) ?? null;
    const titles = jobTitlesFor(project?.businessType);
    const enrichedTitle = isMissing(job.title) || job.title === "招聘岗位"
      ? demoPick(titles, `${job.id}-title`)
      : job.title;
    const enrichedSalary = isMissing(job.salary) || job.salary.includes("按项目政策维护")
      ? demoPick(salaryPool, `${job.id}-sal`)
      : job.salary;
    const enrichedRequirements = isMissing(job.requirements) || job.requirements.includes("按项目真实招聘要求维护")
      ? demoPick(requirementsPool, `${job.id}-req`)
      : job.requirements;
    const enrichedWorkTime = isMissing(job.workTime) || job.workTime.includes("按项目现场排班")
      ? demoPick(workTimePool, `${job.id}-wt`)
      : job.workTime;
    const enrichedWorkLocation = isMissing(job.workLocation)
      ? `${project?.branchName ?? "属地"} · ${project?.name ?? ""}`
      : job.workLocation;
    return {
      ...job,
      title: enrichedTitle,
      salary: enrichedSalary,
      requirements: enrichedRequirements,
      workTime: enrichedWorkTime,
      workLocation: enrichedWorkLocation,
      workContent: job.workContent ?? demoPick(demoWorkContents, job.id),
      project
    } as JobDemand;
  });
  jobDemands = buildGeneratedJobDemands(baseJobDemands, projects);
  jobDemandById = new Map(jobDemands.map((job) => [job.id, job]));
  applications = realData.applications.map((application) => ({
    ...application,
    id: String(application.id),
    personId: String(application.personId),
    jobDemandId: application.jobDemandId ? String(application.jobDemandId) : undefined,
    source: application.source ? String(application.source) : undefined,
    person: personById.get(String(application.personId)) ?? application.person as Person | undefined,
    jobDemand: application.jobDemandId ? jobDemandById.get(String(application.jobDemandId)) ?? application.jobDemand : application.jobDemand
  }));
  salarySlips = createSalarySlips();
  rewards = createRewards();
  blacklistRecords = createBlacklistRecords();
  appealRecords = createAppealRecords();
  advanceRequests = createAdvanceRequests();
  contractTemplates = createContractTemplates();
  electronicSeals = createElectronicSeals();
  electronicContracts = createElectronicContracts();
  policies[0] = { ...policies[0]!, projectId: projects[0]?.id ?? "", project: projects[0] };
  policies[1] = { ...policies[1]!, projectId: projects[0]?.id ?? "", project: projects[0] };
  const persisted = readPersistedDemoState();
  if (persisted) {
    internalEmployees = persisted.internalEmployees ?? internalEmployees;
    reimbursements = persisted.reimbursements ?? reimbursements;
    if (persisted.projects?.length) projects = persisted.projects;
    if (persisted.suppliers?.length) suppliers = persisted.suppliers;
    if (persisted.jobDemands?.length) jobDemands = persisted.jobDemands;
    const persistedPeopleById = new Map((persisted.people ?? []).map((person) => [person.id, person]));
    people = [
      ...(persisted.people ?? []).filter((person) => !people.some((basePerson) => basePerson.id === person.id)),
      ...people.map((person) => persistedPeopleById.get(person.id) ?? person)
    ];
    applications = [
      ...(persisted.applications ?? []),
      ...applications.filter((application) => !(persisted.applications ?? []).some((persistedApplication) => persistedApplication.id === application.id))
    ];
    rewards = [
      ...(persisted.rewards ?? []),
      ...rewards.filter((reward) => !(persisted.rewards ?? []).some((persistedReward) => persistedReward.id === reward.id))
    ];
    blacklistRecords = persisted.blacklistRecords ?? blacklistRecords;
    appealRecords = persisted.appealRecords ?? appealRecords;
    advanceRequests = persisted.advanceRequests ?? advanceRequests;
    contractTemplates = persisted.contractTemplates ?? contractTemplates;
    electronicSeals = persisted.electronicSeals ?? electronicSeals;
    electronicContracts = persisted.electronicContracts ?? electronicContracts;
    registrationQrs = persisted.registrationQrs ?? registrationQrs;
    candidateDemoPersonId = persisted.candidateDemoPersonId;
    changedPersonIds = new Set((persisted.people ?? []).map((person) => person.id));
  }
  electronicContracts.forEach(archiveSignedContract);
  syncDerivedData();
}

function hydratePerson(person: Person): Person {
  const normalized = normalizePersonWorkflow(person);
  const project = projectById.get(person.projectId);
  const supplier = person.supplierId ? supplierById.get(person.supplierId) : undefined;
  const selfRecruit = isSelfRecruitPerson(normalized, supplier);
  const recommenderName = selfRecruit
    ? (isMissing(normalized.recommenderName) ? demoRecommenders[stableIndex(normalized.id, demoRecommenders.length)] : normalized.recommenderName)
    : undefined;
  return {
    ...normalized,
    project,
    branch: project?.branch ?? branchById.get(person.branchId ?? ""),
    supplier,
    projectName: isMissing(normalized.projectName) ? project?.name ?? normalized.projectName : normalized.projectName,
    branchName: isMissing(normalized.branchName) ? project?.branchName ?? project?.branch?.name ?? normalized.branchName : normalized.branchName,
    supplierName: isMissing(normalized.supplierName) ? supplier?.name ?? normalized.supplierName : normalized.supplierName,
    jobTitle: demoJobTitle(normalized),
    status: normalized.status ?? normalized.employmentStatus ?? EmploymentStatus.APPLICANT,
    insuranceTypes: normalized.insuranceTypes ?? [],
    files: normalized.files ?? [],
    statusLogs: normalized.statusLogs ?? [],
    recommenderName,
    recommenderUserId: selfRecruit ? person.recommenderUserId ?? recommenderName : undefined,
    recommender: selfRecruit ? { displayName: recommenderName ?? undefined } : undefined,
    lifecycle: normalized.lifecycle?.length ? normalized.lifecycle : undefined
  };
}

function createSalarySlips(): SalarySlip[] {
  return people
    .filter((person) => person.employeeNo || person.onboardDate)
    .slice(0, 120)
    .map((person, index) => ({
      id: `salary-real-${index + 1}`,
      personId: person.id,
      person,
      salaryMonth: "2026-07",
      grossPay: 5200 + (index % 20) * 80,
      netPay: 4800 + (index % 20) * 70,
      hourlyPay: 23,
      overtimePay: (index % 8) * 45,
      allowance: (index % 5) * 30,
      referralReward: person.recommenderName ? 200 : 0,
      socialSecurityDeduction: 0,
      otherDeduction: 0,
      status: SalarySlipStatus.PUBLISHED,
      createdAt: now
    }));
}

function createRewards(): ReferralReward[] {
  return people
    .filter((person) => person.recommenderName)
    .slice(0, 120)
    .map((person, index) => ({
      id: `reward-real-${index + 1}`,
      personId: person.id,
      person,
      recommender: { displayName: person.recommenderName ?? undefined },
      policy: policies[1],
      amount: 0,
      status: RewardStatus.PENDING,
      notes: "推荐关系来自合成演示数据，奖励金额按演示员工政策维护",
      createdAt: now
    }));
}

function createBlacklistRecords(): BlacklistRecord[] {
  const source = people.find((person) => person.name.includes("刘")) ?? people[2] ?? people[0];
  if (!source) return [];
  return [{
    id: "blacklist-real-1",
    personId: source.id,
    name: source.name,
    idCard: source.idCard,
    phone: source.phone,
    reason: "上个项目旷工离场且未完成工具交接，限制再次报名；如有异议可发起申诉。",
    status: "ACTIVE",
    operatorName: "系统管理员",
    createdAt: "2026-07-19T09:30:00.000Z"
  }];
}

function createAppealRecords(): AppealRecord[] {
  const salarySlip = salarySlips[0];
  const person = salarySlip?.person ?? people[1] ?? people[0];
  const supplierName = [...suppliers].sort((a, b) => (b.applicationCount ?? 0) - (a.applicationCount ?? 0))[0]?.name ?? "供应商演示账号";
  return [
    {
      id: "appeal-real-1",
      ownerType: "SUPPLIER",
      ownerName: supplierName,
      type: "EMPLOYEE_STATUS",
      content: `${person?.name ?? "员工"} 已到场但状态未同步，请运营复核。`,
      status: "PROCESSING",
      relatedPersonId: person?.id,
      createdAt: "2026-07-19T10:10:00.000Z"
    },
    {
      id: "appeal-real-2",
      ownerType: "EMPLOYEE",
      ownerName: person?.name ?? "员工本人",
      type: "SALARY",
      content: "本月工资条中的扣款金额需要复核。",
      status: "PENDING",
      relatedPersonId: person?.id,
      relatedSalarySlipId: salarySlip?.id,
      createdAt: "2026-07-19T10:25:00.000Z"
    }
  ];
}

function createAdvanceRequests(): AdvanceRequest[] {
  const person = salarySlips.find((slip) => slip.status === SalarySlipStatus.PUBLISHED)?.person
    ?? people.find((item) => item.employmentStatus === EmploymentStatus.ACTIVE)
    ?? people[0];
  if (!person) return [];
  return [{
    id: "advance-real-1",
    personId: person.id,
    personName: person.name,
    amount: 1000,
    reason: "家庭临时周转，申请从下月工资扣回。",
    status: "PENDING",
    createdAt: "2026-07-19T10:35:00.000Z"
  }];
}

function createContractTemplates(): ContractTemplate[] {
  return [
    {
      id: "contract-template-labor-1",
      name: "劳动合同模板",
      contractType: "劳动合同",
      originalName: "祥能劳动合同模板.docx",
      version: "V1.0",
      isActive: true,
      uploadedByName: "系统管理员",
      createdAt: "2026-07-19T09:00:00.000Z"
    },
    {
      id: "contract-template-confidential-1",
      name: "员工保密承诺书",
      contractType: "保密协议",
      originalName: "员工保密承诺书.pdf",
      version: "V1.0",
      isActive: true,
      uploadedByName: "系统管理员",
      createdAt: "2026-07-19T09:05:00.000Z"
    }
  ];
}

function createElectronicSeals(): ElectronicSeal[] {
  return [{
    id: "seal-xiangneng-1",
    name: "祥能人力电子公章",
    originalName: "祥能人力电子公章.png",
    status: "ACTIVE",
    uploadedByName: "系统管理员",
    createdAt: "2026-07-19T09:10:00.000Z"
  }];
}

function createElectronicContracts(): ElectronicContract[] {
  const candidates = people.filter((person) => person.employmentStatus === EmploymentStatus.ACTIVE || person.onboardDate).slice(0, 3);
  const template = contractTemplates[0];
  const seal = electronicSeals[0];
  if (!template || !seal) return [];
  return candidates.map((person, index) => ({
    id: `contract-real-${index + 1}`,
    personId: person.id,
    person,
    personName: person.name,
    templateId: template.id,
    templateName: template.name,
    sealId: seal.id,
    sealName: seal.name,
    contractNo: `XNHT-20260719-${String(index + 1).padStart(3, "0")}`,
    status: index === 0 ? "SIGNED" : index === 1 ? "READY_TO_SIGN" : "PENDING_UPLOAD",
    materialNames: index === 2 ? [] : ["身份证正反面", "签名确认页"],
    signedFileId: index === 0 ? `contract-file-${person.id}` : undefined,
    signedFileName: index === 0 ? `已签署-${person.name}-劳动合同.pdf` : undefined,
    dueDate: "2026-07-31",
    createdAt: "2026-07-19T09:20:00.000Z",
    signedAt: index === 0 ? "2026-07-19T10:00:00.000Z" : undefined,
    archivedAt: index === 0 ? "2026-07-19T10:00:00.000Z" : undefined
  }));
}

function archiveSignedContract(contract: ElectronicContract): void {
  if (contract.status !== "SIGNED" && contract.status !== "ARCHIVED") return;
  const person = people.find((item) => item.id === contract.personId);
  if (!person) return;
  const fileId = contract.signedFileId ?? `contract-file-${contract.id}`;
  const fileName = contract.signedFileName ?? `已签署-${person.name}-${contract.templateName}.pdf`;
  const exists = person.files?.some((file) => file.id === fileId);
  if (exists) return;
  const nextFiles = [
    {
      id: fileId,
      fileName,
      originalName: fileName,
      createdAt: contract.archivedAt ?? contract.signedAt ?? new Date().toISOString()
    },
    ...(person.files ?? [])
  ];
  people = people.map((item) => item.id === person.id ? { ...item, files: nextFiles } : item);
  changedPersonIds.add(person.id);
}

function users(): UserAccount[] {
  return [
    { ...demoUser, isActive: true, createdAt: now },
    {
      id: "user-operator",
      username: "operator-demo",
      displayName: "项目运营演示",
      role: UserRole.PROJECT_OPERATOR,
      branchId: null,
      supplierId: null,
      personId: null,
      projectIds: projects.slice(0, 5).map((project) => project.id),
      permissions: [...rolePermissions[UserRole.PROJECT_OPERATOR]],
      isActive: true,
      createdAt: now
    }
  ];
}

function auditLogs(): AuditLog[] {
  return [
    { id: "audit-1", action: "DEMO_LOGIN", resourceType: "Auth", resourceId: "demo", actor: { displayName: "演示管理员" }, summary: "验证码演示登录", createdAt: now },
    { id: "audit-2", action: "REAL_DEMO_IMPORT", resourceType: "Workbook", resourceId: "unique-data", actor: { displayName: "系统" }, summary: `唯一数据导入演示：${realDemoMeta.personMasters} 个主档 / ${realDemoMeta.applicationRecords} 条记录`, createdAt: now }
  ];
}

function page<T>(items: T[], pageNumber = 1, pageSize = 20) {
  const start = (pageNumber - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: { page: pageNumber, pageSize, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) }
  };
}

function queryNumber(query: QueryRecord, key: string, fallback: number): number {
  const value = Number(query[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function queryText(query: QueryRecord, key: string): string | undefined {
  const value = query[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function includesText(value: unknown, keyword: string): boolean {
  return String(value ?? "").toLowerCase().includes(keyword.toLowerCase());
}

const dashboardToday = "2026-07-19";

function datePart(value?: string | null): string | undefined {
  return value ? String(value).slice(0, 10) : undefined;
}

function rangeStart(query: QueryRecord): string {
  return queryText(query, "from") ?? queryText(query, "to") ?? dashboardToday;
}

function rangeEnd(query: QueryRecord): string {
  return queryText(query, "to") ?? queryText(query, "from") ?? dashboardToday;
}

function dateInRange(value: string | null | undefined, from: string, to: string): boolean {
  const date = datePart(value);
  return Boolean(date && date >= from && date <= to);
}

function isActiveAsOf(person: Person, cutoff: string): boolean {
  const onboardDate = datePart(person.onboardDate);
  if (!onboardDate || onboardDate > cutoff) return false;
  const offboardDate = datePart(person.offboardDate);
  return !offboardDate || offboardDate > cutoff;
}

function unifiedPersonStatus(person: Person): string {
  if (person.offboardDate || person.employmentStatus === EmploymentStatus.LEFT) return "LEFT";
  if (person.employmentStatus === EmploymentStatus.ACTIVE && String(person.notes ?? "").includes("转正")) return "REGULARIZED";
  if (person.onboardDate || person.employmentStatus === EmploymentStatus.ACTIVE) return "ONBOARDED";
  if (person.interviewStatus === InterviewStatus.FAILED) return "FAILED";
  if (person.interviewStatus === InterviewStatus.ABANDONED) return "NOT_ONBOARDED";
  if (person.interviewStatus === InterviewStatus.PASSED || person.employmentStatus === EmploymentStatus.PENDING_ONBOARD) return "PASSED";
  if (person.interviewStatus === InterviewStatus.ARRIVED || person.employmentStatus === EmploymentStatus.INTERVIEWING) return "ARRIVED";
  return "APPLICANT";
}

function normalizePersonWorkflow(person: Person): Person {
  if (person.offboardDate || person.employmentStatus === EmploymentStatus.LEFT) {
    return { ...person, interviewStatus: InterviewStatus.PASSED, employmentStatus: EmploymentStatus.LEFT, status: EmploymentStatus.LEFT };
  }
  if (person.onboardDate || person.employmentStatus === EmploymentStatus.ACTIVE) {
    return { ...person, interviewStatus: InterviewStatus.PASSED, employmentStatus: EmploymentStatus.ACTIVE, status: EmploymentStatus.ACTIVE };
  }
  if (person.interviewStatus === InterviewStatus.PASSED || person.employmentStatus === EmploymentStatus.PENDING_ONBOARD) {
    return { ...person, interviewStatus: InterviewStatus.PASSED, employmentStatus: EmploymentStatus.PENDING_ONBOARD, status: EmploymentStatus.PENDING_ONBOARD };
  }
  if (person.interviewStatus === InterviewStatus.ARRIVED || person.employmentStatus === EmploymentStatus.INTERVIEWING) {
    return { ...person, interviewStatus: InterviewStatus.ARRIVED, employmentStatus: EmploymentStatus.INTERVIEWING, status: EmploymentStatus.INTERVIEWING };
  }
  if (person.interviewStatus === InterviewStatus.FAILED || person.interviewStatus === InterviewStatus.ABANDONED) {
    return { ...person, employmentStatus: EmploymentStatus.APPLICANT, status: EmploymentStatus.APPLICANT };
  }
  return { ...person, employmentStatus: person.employmentStatus ?? EmploymentStatus.APPLICANT, status: person.status ?? person.employmentStatus ?? EmploymentStatus.APPLICANT };
}

function byId<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find((row) => row.id === id);
  if (!item) throw new Error("演示数据不存在");
  return item;
}

function filterProjects(query: QueryRecord): Project[] {
  const keyword = queryText(query, "keyword");
  const branchId = queryText(query, "branchId");
  const status = queryText(query, "status");
  return projects.filter((project) =>
    (!keyword || includesText(project.name, keyword) || includesText(project.sourceProjectId, keyword) || includesText(project.remark, keyword)) &&
    (!branchId || project.branchId === branchId) &&
    (!status || project.status === status)
  );
}

function filterSuppliers(query: QueryRecord): Supplier[] {
  const keyword = queryText(query, "keyword");
  const level = queryText(query, "level");
  return suppliers.filter((supplier) =>
    (!keyword || includesText(supplier.name, keyword) || includesText(supplier.contactName, keyword) || includesText(supplier.contactPhone, keyword)) &&
    (!level || supplier.level === level)
  );
}

function filterPolicies(query: QueryRecord): Policy[] {
  const type = queryText(query, "type");
  const keyword = queryText(query, "keyword");
  const projectId = queryText(query, "projectId");
  return policies.filter((policy) =>
    (!type || policy.type === type) &&
    (!projectId || policy.projectId === projectId) &&
    (!keyword || includesText(policy.name, keyword) || includesText(policy.achievementConditions, keyword))
  );
}

function matchesMetric(person: Person, metric: string | undefined, query: QueryRecord): boolean {
  if (!metric) return true;
  const from = rangeStart(query);
  const to = rangeEnd(query);
  if (metric === "active") return isActiveAsOf(person, to);
  if (metric === "interviewPassed") return unifiedPersonStatus(person) === "PASSED";
  if (metric === "todayInterview") return dateInRange(person.interviewDate, from, to);
  if (metric === "todayOnboard") return dateInRange(person.onboardDate, from, to);
  if (metric === "todayOffboard") return dateInRange(person.offboardDate, from, to);
  if (metric === "monthOffboard") return dateInRange(person.offboardDate, from, to);
  return true;
}

function filterPeople(query: QueryRecord): Person[] {
  const keyword = queryText(query, "keyword");
  const branchId = queryText(query, "branchId");
  const projectId = queryText(query, "projectId");
  const supplierId = queryText(query, "supplierId");
  const recommenderUserId = queryText(query, "recommenderUserId");
  const status = queryText(query, "status");
  const interviewStatus = queryText(query, "interviewStatus");
  const insurance = queryText(query, "insurance");
  const metric = queryText(query, "metric");
  const from = queryText(query, "from");
  const to = queryText(query, "to");
  const cacheKey = JSON.stringify({ keyword, branchId, projectId, supplierId, recommenderUserId, status, interviewStatus, insurance, metric, from, to });
  const cached = peopleFilterCache.get(cacheKey);
  if (cached) return cached;
  const result = people.filter((person) => {
    const date = datePart(person.interviewDate);
    const unifiedStatus = unifiedPersonStatus(person);
    return (
      (!keyword || [person.name, person.idCard, person.phone, person.employeeNo, person.projectName, person.jobTitle, person.supplierName, person.recommenderName].some((value) => includesText(value, keyword))) &&
      (!branchId || person.branchId === branchId) &&
      (!projectId || person.projectId === projectId) &&
      (!supplierId || person.supplierId === supplierId) &&
      (!recommenderUserId || includesText(person.recommenderName, recommenderUserId) || includesText(person.recommenderUserId, recommenderUserId)) &&
      (!status || unifiedStatus === status || person.employmentStatus === status || person.status === status) &&
      (!interviewStatus || person.interviewStatus === interviewStatus) &&
      (!insurance || person.insuranceTypes?.includes(insurance as InsuranceType)) &&
      (metric || ((!from || Boolean(date && date >= from)) && (!to || Boolean(date && date <= to)))) &&
      matchesMetric(person, metric, query)
    );
  }).sort((a, b) => {
    const dateCompare = (b.interviewDate ?? "").localeCompare(a.interviewDate ?? "");
    if (dateCompare) return dateCompare;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
  if (peopleFilterCache.size >= 16) peopleFilterCache.clear();
  peopleFilterCache.set(cacheKey, result);
  return result;
}

function filterApplications(query: QueryRecord): DemoApplication[] {
  const jobDemandId = queryText(query, "jobDemandId");
  const source = queryText(query, "source");
  return applications.filter((application) =>
    (!jobDemandId || application.jobDemandId === jobDemandId) &&
    (!source || application.source === source)
  );
}

function filterJobDemands(query: QueryRecord): JobDemand[] {
  const keyword = queryText(query, "keyword");
  const projectId = queryText(query, "projectId");
  const status = queryText(query, "status");
  return jobDemands.filter((job) =>
    (!keyword || includesText(job.title, keyword) || includesText(job.projectName, keyword)) &&
    (!projectId || job.projectId === projectId) &&
    (!status || job.status === status)
  );
}

function filterElectronicContracts(query: QueryRecord): ElectronicContract[] {
  const keyword = queryText(query, "keyword");
  const status = queryText(query, "status");
  const personId = queryText(query, "personId");
  return electronicContracts.filter((contract) =>
    (!keyword || includesText(contract.personName, keyword) || includesText(contract.contractNo, keyword) || includesText(contract.templateName, keyword)) &&
    (!status || contract.status === status) &&
    (!personId || contract.personId === personId)
  ).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

function applicationDetail(application: DemoApplication): Application {
  const jobDemand = application.jobDemandId ? jobDemandById.get(application.jobDemandId) : undefined;
  const person = personById.get(application.personId) ?? application.person;
  return {
    ...application,
    jobDemandId: application.jobDemandId ?? "",
    source: (application.source as ApplicationSource | undefined) ?? ApplicationSource.SELF,
    person,
    jobDemand,
    createdAt: String(application.createdAt ?? application.appliedAt ?? now),
    appliedAt: String(application.appliedAt ?? application.createdAt ?? now)
  } as Application;
}

function personDetail(id: string): Person {
  const person = byId(people, id);
  const history = applications
    .filter((application) => application.personId === id)
    .map(applicationDetail)
    .sort((a, b) => String(b.appliedAt ?? b.createdAt ?? "").localeCompare(String(a.appliedAt ?? a.createdAt ?? "")));
  return {
    ...withLifecycle(person),
    applications: history as NonNullable<Person["applications"]>
  };
}

function representativePeople(source: Person[], limit: number): Person[] {
  const sourceIds = new Set(source.map((person) => person.id));
  const blacklistIds = new Set(blacklistRecords.map((record) => record.personId).filter(Boolean));
  const preferred = [
    ...[...changedPersonIds].filter((id) => sourceIds.has(id)).map((id) => personById.get(id)),
    source.find((person) => blacklistIds.has(person.id)),
    source.find((person) => person.interviewStatus === InterviewStatus.PENDING_ARRIVAL),
    source.find((person) => person.interviewStatus === InterviewStatus.ARRIVED),
    source.find((person) => person.interviewStatus === InterviewStatus.PASSED && !person.onboardDate),
    source.find((person) => person.interviewStatus === InterviewStatus.FAILED),
    source.find((person) => person.employmentStatus === EmploymentStatus.ACTIVE),
    source.find((person) => person.employmentStatus === EmploymentStatus.LEFT),
    ...source.slice(0, limit)
  ].filter((person): person is Person => Boolean(person));
  return [...new Map(preferred.map((person) => [person.id, person])).values()].slice(0, limit);
}

function monthStart(month: string): string {
  return `${month}-01`;
}

function monthEnd(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  return new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
}

function daysInclusive(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 86_400_000) + 1;
}

function supplierSettlementSummary(supplier: Supplier | undefined, month = "2026-07"): SupplierSettlementSummary {
  if (!supplier) return { month, payableAmount: 0, confirmedAmount: 0, pendingAmount: 0, disputedAmount: 0, items: [] };
  const start = monthStart(month);
  const end = monthEnd(month);
  const source = people
    .filter((person) => person.supplierId === supplier.id && person.onboardDate && person.onboardDate.slice(0, 10) <= end && (!person.offboardDate || person.offboardDate.slice(0, 10) >= start))
    .slice(0, 30);
  const items = source.map((person, index) => {
    const effectiveStart = [person.onboardDate?.slice(0, 10) ?? start, start].sort().at(-1) ?? start;
    const effectiveEnd = [person.offboardDate?.slice(0, 10) ?? end, end].sort().at(0) ?? end;
    const activeDays = daysInclusive(effectiveStart, effectiveEnd);
    const baseAmount = activeDays >= 30 ? 2500 + stableIndex(person.id, 5) * 300 : Math.max(0, activeDays * 60);
    const status: SupplierSettlementSummary["items"][number]["status"] =
      index % 9 === 0 ? "DISPUTED" :
      index % 5 === 0 ? "PENDING_CONFIRM" :
      index % 4 === 0 ? "PENDING_CALC" :
      index % 3 === 0 ? "PAID" :
      "CONFIRMED";
    const actualAmount = status === "PENDING_CALC" ? 0 : status === "DISPUTED" ? Math.max(0, baseAmount - 300) : baseAmount;
    return {
      id: `settlement-${supplier.id}-${person.id}-${month}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      personId: person.id,
      personName: person.name,
      projectId: person.projectId,
      projectName: person.projectName ?? person.project?.name ?? "综合招聘项目",
      jobTitle: person.jobTitle,
      onboardDate: person.onboardDate,
      offboardDate: person.offboardDate,
      activeDays,
      policyName: `${supplier.level ?? "合作"}供应商政策-${person.jobTitle}`,
      expectedAmount: baseAmount,
      actualAmount,
      status,
      month
    };
  });
  return {
    month,
    payableAmount: items.reduce((sum, item) => sum + item.expectedAmount, 0),
    confirmedAmount: items.filter((item) => item.status === "CONFIRMED" || item.status === "PAID").reduce((sum, item) => sum + item.actualAmount, 0),
    pendingAmount: items.filter((item) => item.status === "PENDING_CALC" || item.status === "PENDING_CONFIRM").reduce((sum, item) => sum + item.expectedAmount, 0),
    disputedAmount: items.filter((item) => item.status === "DISPUTED").reduce((sum, item) => sum + Math.abs(item.expectedAmount - item.actualAmount || item.expectedAmount), 0),
    items
  };
}

function demoMessages(input: {
  personalPerson?: Person;
  employeePerson?: Person;
  supplier?: Supplier;
  settlement?: SupplierSettlementSummary;
}): DemoMessage[] {
  const personalPerson = input.personalPerson ?? input.employeePerson ?? people[0];
  const salarySlip = personalPerson ? salarySlips.find((slip) => slip.personId === personalPerson.id) ?? salarySlips[0] : salarySlips[0];
  const contract = personalPerson ? electronicContracts.find((item) => item.personId === personalPerson.id && item.status !== "SIGNED" && item.status !== "ARCHIVED") : undefined;
  const latestApplication = personalPerson ? applications.find((item) => item.personId === personalPerson.id) : undefined;
  const personalAppeal = appealRecords.find((item) => item.ownerType === "EMPLOYEE" && (!personalPerson || item.relatedPersonId === personalPerson.id || item.ownerName === personalPerson.name));
  const supplierAppeal = appealRecords.find((item) => item.ownerType === "SUPPLIER" && (!input.supplier || item.ownerName === input.supplier.name));
  const firstReward = personalPerson ? rewards.find((item) => item.personId === personalPerson.id || item.recommender?.displayName === personalPerson.name) ?? rewards[0] : rewards[0];
  const records: DemoMessage[] = [];
  const add = (message: Omit<DemoMessage, "id" | "unread">, unread = true) => {
    records.push({ ...message, id: `msg-${records.length + 1}-${message.type}`, unread });
  };
  add({
    ownerType: "PERSONAL",
    ownerName: personalPerson?.name ?? "个人用户",
    type: "COMPANY_ANNOUNCEMENT",
    title: "祥能招聘岗位已更新",
    content: "本期开放岗位已同步到首页，可按岗位、项目、工作地点搜索报名或转发推荐。",
    targetView: "home",
    createdAt: "2026-07-21T09:00:00.000Z"
  });
  if (latestApplication) add({
    ownerType: "PERSONAL",
    ownerName: personalPerson?.name ?? "个人用户",
    type: "APPLICATION_SUCCESS",
    title: "报名成功",
    content: `${personalPerson?.name ?? "你"} 已报名 ${personalPerson?.projectName ?? "项目"} · ${personalPerson?.jobTitle ?? "岗位"}，可在报名进度查看后续安排。`,
    targetView: "detail",
    relatedPersonId: personalPerson?.id,
    relatedJobDemandId: latestApplication.jobDemandId,
    createdAt: String(latestApplication.appliedAt ?? latestApplication.createdAt ?? now)
  });
  if (personalPerson?.interviewDate) add({
    ownerType: "PERSONAL",
    ownerName: personalPerson.name,
    type: "INTERVIEW_NOTICE",
    title: "面试安排已生成",
    content: `面试时间：${personalPerson.interviewDate.slice(0, 10)}，岗位：${personalPerson.jobTitle}。`,
    targetView: "detail",
    relatedPersonId: personalPerson.id,
    createdAt: `${personalPerson.interviewDate.slice(0, 10)}T09:30:00.000Z`
  });
  if (personalPerson?.interviewStatus === InterviewStatus.PASSED || personalPerson?.interviewStatus === InterviewStatus.FAILED) add({
    ownerType: "PERSONAL",
    ownerName: personalPerson.name,
    type: "INTERVIEW_RESULT",
    title: "面试结果已更新",
    content: `当前结果：${personalPerson.interviewStatus === InterviewStatus.PASSED ? "面试通过" : "面试未通过"}。`,
    targetView: "detail",
    relatedPersonId: personalPerson.id,
    createdAt: personalPerson.updatedAt ?? now
  });
  if (personalPerson?.onboardDate) add({
    ownerType: "PERSONAL",
    ownerName: personalPerson.name,
    type: "ONBOARD_NOTICE",
    title: "入职状态已更新",
    content: `入职日期：${personalPerson.onboardDate.slice(0, 10)}，所属项目：${personalPerson.projectName ?? "综合招聘项目"}。`,
    targetView: "detail",
    relatedPersonId: personalPerson.id,
    createdAt: `${personalPerson.onboardDate.slice(0, 10)}T10:00:00.000Z`
  }, false);
  if (salarySlip) add({
    ownerType: "PERSONAL",
    ownerName: salarySlip.person?.name ?? personalPerson?.name ?? "员工本人",
    type: "SALARY_UPDATED",
    title: "工资条已更新",
    content: `${salarySlip.salaryMonth} 工资条已发布，实发工资 ${salarySlip.netPay} 元。`,
    targetView: "salary",
    relatedPersonId: salarySlip.personId,
    relatedSalarySlipId: salarySlip.id,
    createdAt: salarySlip.createdAt ?? now
  });
  const advance = personalPerson ? advanceRequests.find((item) => item.personId === personalPerson.id || item.personName === personalPerson.name) : advanceRequests[0];
  if (advance) add({
    ownerType: "PERSONAL",
    ownerName: advance.personName,
    type: "ADVANCE_RESULT",
    title: "借支申请进度更新",
    content: `借支金额 ${advance.amount} 元，当前状态：${advance.status === "PENDING" ? "待审核" : advance.status}。`,
    targetView: "advance",
    relatedPersonId: advance.personId,
    createdAt: advance.createdAt
  }, false);
  if (personalAppeal) add({
    ownerType: "PERSONAL",
    ownerName: personalAppeal.ownerName,
    type: "SALARY_APPEAL_RESULT",
    title: "申诉处理进度更新",
    content: personalAppeal.content,
    targetView: "appeals",
    relatedPersonId: personalAppeal.relatedPersonId,
    createdAt: personalAppeal.handledAt ?? personalAppeal.createdAt
  }, personalAppeal.status === "PENDING" || personalAppeal.status === "PROCESSING");
  if (contract) add({
    ownerType: "PERSONAL",
    ownerName: contract.personName,
    type: "CONTRACT_TODO",
    title: "电子合同待签署",
    content: `${contract.templateName} 需要上传签约资料并完成确认。`,
    targetView: "contracts",
    relatedPersonId: contract.personId,
    relatedContractId: contract.id,
    createdAt: contract.createdAt
  });
  if (firstReward) add({
    ownerType: "PERSONAL",
    ownerName: firstReward.recommender?.displayName ?? personalPerson?.name ?? "推荐人",
    type: firstReward.paidAt ? "REFERRAL_REWARD_PAID" : "REFERRAL_REWARD_ACHIEVED",
    title: firstReward.paidAt ? "推荐奖励已发放" : "推荐奖励进度更新",
    content: `${firstReward.person?.name ?? "被推荐人"} 当前状态已同步，奖励状态：${firstReward.status}。`,
    targetView: "jobs",
    relatedPersonId: firstReward.personId,
    createdAt: firstReward.paidAt ?? firstReward.achievedAt ?? firstReward.createdAt
  }, false);
  if (input.supplier && input.settlement) add({
    ownerType: "SUPPLIER",
    ownerName: input.supplier.name,
    type: "SETTLEMENT_UPDATED",
    title: "月度结算已更新",
    content: `${input.settlement.month} 应结 ${input.settlement.payableAmount.toLocaleString("zh-CN")} 元，待确认 ${input.settlement.pendingAmount.toLocaleString("zh-CN")} 元。`,
    targetView: "settlement",
    createdAt: now
  });
  if (supplierAppeal) add({
    ownerType: "SUPPLIER",
    ownerName: supplierAppeal.ownerName,
    type: "APPEAL_UPDATED",
    title: "供应商申诉处理进度",
    content: supplierAppeal.content,
    targetView: "appeals",
    relatedPersonId: supplierAppeal.relatedPersonId,
    relatedSettlementItemId: supplierAppeal.relatedSettlementItemId,
    createdAt: supplierAppeal.handledAt ?? supplierAppeal.createdAt
  });
  add({
    ownerType: "INTERNAL",
    ownerName: "内部管理端",
    type: "APPEAL_UPDATED",
    title: "待处理业务提醒",
    content: `当前待处理申诉 ${appealRecords.filter((item) => item.status === "PENDING" || item.status === "PROCESSING").length} 条，待签合同 ${electronicContracts.filter((item) => item.status === "PENDING_UPLOAD" || item.status === "READY_TO_SIGN").length} 份。`,
    targetView: "tasks",
    createdAt: now
  });
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function createRegistrationQr(input: { projectId?: string; jobDemandId?: string; operatorName?: string }): RegistrationQr {
  const job = input.jobDemandId ? jobDemandById.get(input.jobDemandId) : undefined;
  const project = projectById.get(input.projectId ?? job?.projectId ?? "") ?? projects[0];
  if (!project) throw new Error("缺少项目，无法生成报名二维码");
  const generatedAt = new Date().toISOString();
  const expiresAtDate = new Date(generatedAt);
  expiresAtDate.setHours(expiresAtDate.getHours() + 24);
  const record: RegistrationQr = {
    id: `qr-demo-${registrationQrs.length + 1}`,
    projectId: project.id,
    projectName: project.name,
    jobDemandId: job?.id,
    jobTitle: job?.title,
    interviewDate: generatedAt.slice(0, 10),
    source: "现场扫码报名",
    generatedAt,
    expiresAt: expiresAtDate.toISOString(),
    operatorName: input.operatorName ?? "现场运营",
    status: "ACTIVE"
  };
  registrationQrs = [record, ...registrationQrs.map((item) => item.projectId === record.projectId && item.jobDemandId === record.jobDemandId ? { ...item, status: "EXPIRED" as const } : item)];
  commitDemoState();
  return record;
}

function miniappSnapshot() {
  const showcaseSupplier = [...suppliers].sort((a, b) => (b.applicationCount ?? 0) - (a.applicationCount ?? 0))[0];
  const supplierPeople = showcaseSupplier ? people.filter((person) => person.supplierId === showcaseSupplier.id) : [];
  const recommenderNames = new Set(people.map((person) => person.recommenderName).filter((name): name is string => Boolean(name)));
  const employeePerson = salarySlips.find((slip) => slip.status === SalarySlipStatus.PUBLISHED && recommenderNames.has(slip.person?.name ?? ""))?.person
    ?? salarySlips.find((slip) => slip.status === SalarySlipStatus.PUBLISHED)?.person
    ?? people.find((person) => person.employmentStatus === EmploymentStatus.ACTIVE);
  const eligibleCandidate = people.find((person) =>
    person.employmentStatus === EmploymentStatus.APPLICANT &&
    !person.onboardDate &&
    !person.offboardDate &&
    !blacklistRecords.some((record) => record.status === "ACTIVE" && (record.personId === person.id || record.idCard === person.idCard))
  ) ?? people.find((person) =>
    !person.onboardDate &&
    !person.offboardDate &&
    person.employmentStatus !== EmploymentStatus.ACTIVE &&
    person.employmentStatus !== EmploymentStatus.LEFT &&
    !blacklistRecords.some((record) => record.status === "ACTIVE" && (record.personId === person.id || record.idCard === person.idCard))
  ) ?? people.find((person) =>
    !person.onboardDate &&
    !person.offboardDate &&
    !blacklistRecords.some((record) => record.status === "ACTIVE" && (record.personId === person.id || record.idCard === person.idCard))
  ) ?? people[0];
  if (!candidateDemoPersonId || !people.some((person) => person.id === candidateDemoPersonId)) {
    candidateDemoPersonId = eligibleCandidate?.id;
  }
  const candidatePerson = people.find((person) => person.id === candidateDemoPersonId) ?? eligibleCandidate;
  const responsibleProjects = [...projects].sort((a, b) => (b.activeCount ?? 0) - (a.activeCount ?? 0)).slice(0, 12);
  const projectRepresentatives = responsibleProjects
    .map((project) => people.find((person) => person.projectId === project.id))
    .filter((person): person is Person => Boolean(person));
  const operatorPeople = representativePeople([...projectRepresentatives, ...people], 60);
  const rolePeople = {
    leader: representativePeople(operatorPeople, 24),
    operator: operatorPeople,
    supplier: representativePeople(supplierPeople, 36),
    employee: representativePeople(employeePerson ? [employeePerson] : operatorPeople, 8),
    candidate: representativePeople(candidatePerson ? [candidatePerson] : operatorPeople, 8)
  };
  const personalPerson = employeePerson ?? candidatePerson ?? people[0];
  const settlement = supplierSettlementSummary(showcaseSupplier, "2026-07");
  const messages = [
    ...demoMessages({ personalPerson, employeePerson, supplier: showcaseSupplier, settlement }),
    ...(candidatePerson && candidatePerson.id !== personalPerson?.id
      ? demoMessages({ personalPerson: candidatePerson }).filter((message) => message.ownerType === "PERSONAL")
      : [])
  ].map((message, index) => ({ ...message, id: `${message.id}-${index + 1}` }));
  const roleApplications = {
    employee: employeePerson ? applications.filter((application) => application.personId === employeePerson.id).map(applicationDetail) : [],
    candidate: candidatePerson ? applications.filter((application) => application.personId === candidatePerson.id).map(applicationDetail) : []
  };
  return {
    overview: filteredDashboard({}),
    rolePeople,
    roleApplications,
    jobs: jobDemands.slice(0, 20),
    salarySlips: salarySlips.slice(0, 12),
    rewards: rewards.slice(0, 24),
    policies,
    blacklist: blacklistRecords,
    appeals: appealRecords,
    advances: advanceRequests,
    contracts: electronicContracts.slice(0, 12),
    contractTemplates: contractTemplates.filter((template) => template.isActive),
    electronicSeals: electronicSeals.filter((seal) => seal.status === "ACTIVE"),
    messages,
    registrationQrs,
    supplierSettlement: settlement,
    suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, level: supplier.level })),
    scope: {
      branches: [...(realData?.branches ?? [])],
      projects: projects.map((project) => ({ id: project.id, name: project.name, branchId: project.branchId, branchName: project.branchName }))
    },
    meta: {
      peopleTotal: realDemoMeta.personMasters,
      applicationTotal: realDemoMeta.applicationRecords,
      jobTotal: jobDemands.length,
      supplier: showcaseSupplier ? {
        id: showcaseSupplier.id,
        name: showcaseSupplier.name,
        applicationCount: showcaseSupplier.applicationCount ?? 0,
        passedCount: showcaseSupplier.passedCount ?? 0,
        onboardCount: showcaseSupplier.onboardCount ?? 0,
        activeCount: showcaseSupplier.activeCount ?? 0
      } : null,
      candidateApplicationCount: candidatePerson ? applications.filter((application) => application.personId === candidatePerson.id).length : 0
    }
  };
}

function dateRangeDays(from?: string, to?: string): string[] {
  const fallbackEnd = "2026-07-19";
  const endText = to || fallbackEnd;
  const startText = from || (() => {
    const end = new Date(`${endText}T00:00:00`);
    end.setDate(end.getDate() - 6);
    return end.toISOString().slice(0, 10);
  })();
  const start = new Date(`${startText}T00:00:00`);
  const end = new Date(`${endText}T00:00:00`);
  const days: string[] = [];
  for (let current = new Date(start); current <= end && days.length < 31; current.setDate(current.getDate() + 1)) {
    days.push(current.toISOString().slice(0, 10));
  }
  return days.slice(-14);
}

function filteredDashboard(query: QueryRecord = {}): DashboardData {
  const branchId = queryText(query, "branchId");
  const projectId = queryText(query, "projectId");
  const from = rangeStart(query);
  const to = rangeEnd(query);
  const cacheKey = JSON.stringify({ branchId: branchId ?? "", projectId: projectId ?? "", from, to });
  const cached = dashboardCache.get(cacheKey);
  if (cached) return cached;

  const personInScope = (person: Person) => (!branchId || person.branchId === branchId) && (!projectId || person.projectId === projectId);
  const projectInScope = (project?: Project | null) => (!branchId || project?.branchId === branchId) && (!projectId || project?.id === projectId);
  const scopedProjects = projects.filter(projectInScope);
  const statusLabel: Record<string, string> = {
    APPLICANT: "已报名",
    ARRIVED: "已到达",
    PASSED: "面试通过",
    FAILED: "面试未通过",
    ONBOARDED: "已入职",
    NOT_ONBOARDED: "未入职",
    LEFT: "已离职",
    REGULARIZED: "已转正"
  };
  const branchActiveCounts = new Map<string, number>();
  const projectActiveCounts = new Map<string, number>();
  const supplierActiveCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const onboardByDate = new Map<string, number>();
  const offboardByDate = new Map<string, number>();
  let activePeopleCount = 0;
  let interviewCount = 0;
  let interviewPassedCount = 0;
  let onboardCount = 0;
  let offboardCount = 0;
  let pendingOnboardCount = 0;

  for (const person of people) {
    if (!personInScope(person)) continue;
    const status = unifiedPersonStatus(person);
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (dateInRange(person.interviewDate, from, to)) {
      interviewCount += 1;
      if (person.interviewStatus === InterviewStatus.PASSED) interviewPassedCount += 1;
    }
    const onboardDate = datePart(person.onboardDate);
    if (onboardDate) {
      onboardByDate.set(onboardDate, (onboardByDate.get(onboardDate) ?? 0) + 1);
      if (dateInRange(onboardDate, from, to)) onboardCount += 1;
    }
    const offboardDate = datePart(person.offboardDate);
    if (offboardDate) {
      offboardByDate.set(offboardDate, (offboardByDate.get(offboardDate) ?? 0) + 1);
      if (dateInRange(offboardDate, from, to)) offboardCount += 1;
    }
    if (person.interviewStatus === InterviewStatus.PASSED && !person.onboardDate) pendingOnboardCount += 1;
    if (!isActiveAsOf(person, to)) continue;
    activePeopleCount += 1;
    if (person.branchId) branchActiveCounts.set(person.branchId, (branchActiveCounts.get(person.branchId) ?? 0) + 1);
    if (person.projectId) projectActiveCounts.set(person.projectId, (projectActiveCounts.get(person.projectId) ?? 0) + 1);
    if (person.supplierId) supplierActiveCounts.set(person.supplierId, (supplierActiveCounts.get(person.supplierId) ?? 0) + 1);
  }

  let requiredCount = 0;
  for (const job of jobDemands) {
    const jobProject = projectById.get(job.projectId) ?? job.project;
    if (projectInScope(jobProject)) requiredCount += job.requiredCount;
  }

  let applicationCount = 0;
  for (const application of applications) {
    const person = personById.get(application.personId) ?? application.person;
    const job = application.jobDemandId ? jobDemandById.get(application.jobDemandId) : undefined;
    const jobProject = job ? projectById.get(job.projectId) ?? job.project : undefined;
    const belongsToScope = (!projectId || jobProject?.id === projectId || person?.projectId === projectId) &&
      (!branchId || jobProject?.branchId === branchId || person?.branchId === branchId);
    if (!belongsToScope) continue;
    const businessDate = String(application.appliedAt ?? application.interviewDate ?? person?.interviewDate ?? application.createdAt ?? "").slice(0, 10);
    if (dateInRange(businessDate, from, to)) applicationCount += 1;
  }

  const result: DashboardData = {
    todayInterviews: interviewCount,
    interviewPassed: interviewPassedCount,
    activePeople: activePeopleCount,
    todayOnboard: onboardCount,
    todayOffboard: offboardCount,
    monthOffboard: offboardCount,
    sevenDayTrend: dateRangeDays(from, to).map((date) => ({ date, onboard: onboardByDate.get(date) ?? 0, offboard: offboardByDate.get(date) ?? 0 })),
    branchActive: (realData?.branches ?? [])
      .filter((branch) => !branchId || branch.id === branchId)
      .map((branch) => ({ name: branch.name, value: branchActiveCounts.get(branch.id) ?? 0, branchId: branch.id }))
      .sort((a, b) => b.value - a.value),
    statusDistribution: Object.keys(statusLabel).map((status) => ({ name: statusLabel[status] ?? status, value: statusCounts.get(status) ?? 0, status })),
    projectTop: scopedProjects
      .map((project) => ({ name: project.name, value: projectActiveCounts.get(project.id) ?? 0, projectId: project.id }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    supplierTop: suppliers
      .map((supplier) => ({ name: supplier.name, value: supplierActiveCounts.get(supplier.id) ?? 0, supplierId: supplier.id }))
      .filter((item) => item.value > 0 || !branchId)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    recruitment: { requiredCount, applicationCount, onboardCount, remainingCount: Math.max(0, requiredCount - activePeopleCount) },
    pendingItems: [
      { id: "pending-onboard", title: "面试通过待入职", count: pendingOnboardCount, level: "warning" as const, path: "/people?metric=interviewPassed" },
      { id: "unmatched-projects", title: "唯一数据中存在未匹配项目", count: realDemoMeta.unmatchedProjects, level: "info" as const, path: "/projects" }
    ].filter((item) => item.count > 0),
    anomalies: [{ id: "repeated-application-rows", type: "同一人员多次报名/跨项目记录", scopeName: "人员主档与报名记录分离", expected: realDemoMeta.personMasters, actual: realDemoMeta.applicationRecords, difference: realDemoMeta.repeatedApplicationRows }]
  };
  dashboardCache.set(cacheKey, result);
  return result;
}

function previewImport(): ImportPreview {
  return {
    importId: "real-demo-import",
    sourceFile: "祥能HRMS_合成演示数据.xlsx",
    sourceHash: realDemoMeta.sourceHash,
    totalRows: realDemoMeta.sourceRows,
    accepted: people.slice(0, 200),
    skipped: [],
    warnings: [
      { code: "PERSON_MASTER_WITH_HISTORY", message: `人员主档 ${realDemoMeta.personMasters} 个，保留报名/面试/项目记录 ${realDemoMeta.applicationRecords} 条` },
      ...(realDemoMeta.unmatchedProjects > 0
        ? [{ code: "UNMATCHED_PROJECT", message: `组织项目清单未匹配项目 ${realDemoMeta.unmatchedProjects} 个，已按演示数据规则补全项目归属` }]
        : [])
    ],
    reconciliation: { sourceRows: realDemoMeta.sourceRows, personMasters: realDemoMeta.personMasters, applicationRecords: realDemoMeta.applicationRecords, repeatedApplicationRows: realDemoMeta.repeatedApplicationRows, projectsFromOrg: realDemoMeta.projectsFromOrg, totalDemoProjects: realDemoMeta.totalDemoProjects, suppliers: realDemoMeta.supplierCount }
  };
}

function sameInsurance(a?: InsuranceType[], b?: InsuranceType[]): boolean {
  const left = [...(a ?? [])].sort().join(",");
  const right = [...(b ?? [])].sort().join(",");
  return left === right;
}

function changed<T>(before: T | null | undefined, after: T | null | undefined): boolean {
  return String(before ?? "") !== String(after ?? "");
}

function patchPerson(id: string, patch: Partial<Person>, actionPath?: string): Person {
  const index = people.findIndex((person) => person.id === id);
  if (index < 0) throw new Error("演示人员不存在");
  const previous = people[index]!;
  const lifecycle = [...(previous.lifecycle ?? initialLifecycle(previous))];
  const next = withLifecycle(hydratePerson({ ...previous, ...patch, updatedAt: new Date().toISOString(), lifecycle }));
  const info = lifecycleInfo(next);
  if (actionPath?.endsWith("/interview") || changed(previous.interviewStatus, next.interviewStatus)) {
    next.lifecycle = [
      ...(next.lifecycle ?? []),
      lifecycleRecord(next, "INTERVIEW", `面试状态：${next.interviewStatus ?? "待安排"}`, [
        next.interviewDate ? `面试日期：${next.interviewDate}` : "",
        patch.notes ? `备注：${patch.notes}` : "",
        info
      ].filter(Boolean).join("；"))
    ];
  }
  if (actionPath?.endsWith("/onboard") || changed(previous.onboardDate, next.onboardDate) || (previous.employmentStatus !== EmploymentStatus.ACTIVE && next.employmentStatus === EmploymentStatus.ACTIVE)) {
    next.lifecycle = [
      ...(next.lifecycle ?? []),
      lifecycleRecord(next, "ONBOARD", "已入职", [
        next.onboardDate ? `入职日期：${next.onboardDate}` : "",
        next.employeeNo ? `工号：${next.employeeNo}` : "",
        info
      ].filter(Boolean).join("；"))
    ];
  }
  if (!sameInsurance(previous.insuranceTypes, next.insuranceTypes)) {
    next.lifecycle = [
      ...(next.lifecycle ?? []),
      lifecycleRecord(next, "INSURANCE", "保险已更新", next.insuranceTypes?.length ? `保险：${next.insuranceTypes.join("、")}` : "保险已清空")
    ];
  }
  if (actionPath?.endsWith("/offboard") || changed(previous.offboardDate, next.offboardDate) || (previous.employmentStatus !== EmploymentStatus.LEFT && next.employmentStatus === EmploymentStatus.LEFT)) {
    next.lifecycle = [
      ...(next.lifecycle ?? []),
      lifecycleRecord(next, "OFFBOARD", "已离职", [
        next.offboardDate ? `离职日期：${next.offboardDate}` : "",
        next.offboardReason ? `原因：${next.offboardReason}` : ""
      ].filter(Boolean).join("；") || "办理离职")
    ];
  }
  people = people.map((person) => (person.id === id ? next : person));
  changedPersonIds.add(id);
  commitDemoState();
  return next;
}

function blacklistHit(input: { name?: string; idCard?: string; phone?: string }): BlacklistRecord | undefined {
  const name = input.name?.trim();
  const idCard = input.idCard?.trim();
  const phone = input.phone?.trim();
  return blacklistRecords.find((record) =>
    record.status === "ACTIVE" &&
    ((name && record.name === name) || (idCard && record.idCard === idCard) || (phone && record.phone === phone))
  );
}

function personPatchForAction(path: string, body: unknown): Partial<Person> {
  const input = (body ?? {}) as Partial<Person> & { status?: InterviewStatus; onboardDate?: string; offboardDate?: string; offboardReason?: string };
  if (path.endsWith("/interview")) {
    const status = input.status ?? input.interviewStatus;
    return {
      interviewStatus: status,
      employmentStatus: status === InterviewStatus.PASSED ? EmploymentStatus.PENDING_ONBOARD : status === InterviewStatus.ARRIVED ? EmploymentStatus.INTERVIEWING : EmploymentStatus.APPLICANT,
      status: status === InterviewStatus.PASSED ? EmploymentStatus.PENDING_ONBOARD : status === InterviewStatus.ARRIVED ? EmploymentStatus.INTERVIEWING : EmploymentStatus.APPLICANT
    };
  }
  if (path.endsWith("/onboard")) return { onboardDate: input.onboardDate, interviewStatus: InterviewStatus.PASSED, insuranceTypes: input.insuranceTypes ?? [], employeeNo: input.employeeNo, supplierPolicyId: input.supplierPolicyId, notes: input.notes, employmentStatus: EmploymentStatus.ACTIVE, status: EmploymentStatus.ACTIVE };
  if (path.endsWith("/offboard")) return { offboardDate: input.offboardDate, offboardReason: input.offboardReason, insuranceTypes: input.insuranceTypes ?? [], notes: input.notes, employmentStatus: EmploymentStatus.LEFT, status: EmploymentStatus.LEFT };
  if (path.endsWith("/notes")) return { notes: input.notes };
  return input;
}

function patchLatestApplicationForAction(personId: string, path: string, body: unknown): void {
  const input = (body ?? {}) as Partial<Person> & { status?: InterviewStatus; onboardDate?: string; offboardDate?: string; offboardReason?: string };
  const latest = applications
    .filter((application) => application.personId === personId)
    .sort((left, right) => String(right.appliedAt ?? right.createdAt ?? "").localeCompare(String(left.appliedAt ?? left.createdAt ?? "")))[0];
  if (!latest) return;
  let next: DemoApplication = { ...latest };
  if (path.endsWith("/interview")) {
    const status = input.status ?? input.interviewStatus;
    next = {
      ...next,
      interviewStatus: status,
      interviewDate: input.interviewDate ?? next.interviewDate ?? new Date().toISOString(),
      employmentStatus: status === InterviewStatus.PASSED
        ? EmploymentStatus.PENDING_ONBOARD
        : status === InterviewStatus.ARRIVED
          ? EmploymentStatus.INTERVIEWING
          : EmploymentStatus.APPLICANT
    };
  } else if (path.endsWith("/onboard")) {
    next = { ...next, interviewStatus: InterviewStatus.PASSED, onboardDate: input.onboardDate, employmentStatus: EmploymentStatus.ACTIVE };
  } else if (path.endsWith("/offboard")) {
    next = { ...next, offboardDate: input.offboardDate, offboardReason: input.offboardReason, employmentStatus: EmploymentStatus.LEFT };
  }
  applications = applications.map((application) => application.id === latest.id ? next : application);
}

function createProjectRecord(input: Partial<Project>): Project {
  const branch = input.branchId ? branchById.get(input.branchId) : undefined;
  const record: Project = {
    id: `project-demo-${projects.length + 1}`,
    name: input.name?.trim() || "新建项目",
    branchId: input.branchId ?? branch?.id ?? realData?.branches[0]?.id ?? "",
    branchName: branch?.name ?? input.branchName ?? "祥能项目运营中心",
    isExternal: Boolean(input.isExternal),
    businessType: input.businessType,
    status: input.status ?? ProjectStatus.ACTIVE,
    managerName: input.managerName,
    managerPhone: input.managerPhone,
    cooperationStart: input.cooperationStart,
    cooperationEnd: input.cooperationEnd,
    responsibility: input.responsibility ?? ResponsibilityType.OURS,
    description: input.description,
    remark: input.remark,
    images: [],
    activeCount: 0,
    onboardCount: 0,
    offboardCount: 0,
    interviewCount: 0
  };
  projects = [record, ...projects];
  commitDemoState();
  return byId(projects, record.id);
}

function patchProjectRecord(id: string, input: Partial<Project>): Project {
  const previous = byId(projects, id);
  const branchId = input.branchId ?? previous.branchId;
  const branch = branchById.get(branchId);
  const next: Project = {
    ...previous,
    ...input,
    id: previous.id,
    branchId,
    branchName: branch?.name ?? input.branchName ?? previous.branchName,
    branch
  };
  projects = projects.map((project) => project.id === id ? next : project);
  people = people.map((person) => person.projectId === id ? {
    ...person,
    projectName: next.name,
    branchId: next.branchId,
    branchName: next.branchName
  } : person);
  jobDemands = jobDemands.map((job) => job.projectId === id ? {
    ...job,
    projectName: next.name,
    branchName: next.branchName,
    project: next
  } : job);
  commitDemoState();
  return byId(projects, id);
}

function createSupplierRecord(input: Partial<Supplier>): Supplier {
  const record: Supplier = {
    id: `supplier-demo-${suppliers.length + 1}`,
    name: input.name?.trim() || "新建供应商",
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    level: input.level,
    projectIds: [],
    activeCount: 0,
    applicationCount: 0,
    arrivedCount: 0,
    passedCount: 0,
    onboardCount: 0,
    offboardCount: 0
  };
  suppliers = [record, ...suppliers];
  commitDemoState();
  return byId(suppliers, record.id);
}

function patchSupplierRecord(id: string, input: Partial<Supplier>): Supplier {
  const previous = byId(suppliers, id);
  const next: Supplier = { ...previous, ...input, id: previous.id };
  suppliers = suppliers.map((supplier) => supplier.id === id ? next : supplier);
  people = people.map((person) => person.supplierId === id ? { ...person, supplierName: next.name } : person);
  commitDemoState();
  return byId(suppliers, id);
}

function createJobDemandRecord(input: Partial<JobDemand>): JobDemand {
  const project = projectById.get(input.projectId ?? "") ?? projects[0];
  if (!project) throw new Error("缺少归属项目，无法发布招聘需求");
  const createdAt = new Date().toISOString();
  const record: JobDemand = {
    id: `job-demand-demo-${jobDemands.length + 1}`,
    projectId: project.id,
    project,
    projectName: project.name,
    branchName: project.branchName,
    title: input.title?.trim() || "招聘岗位",
    requiredCount: Math.max(1, Number(input.requiredCount ?? 1)),
    requirements: input.requirements?.trim() || "按项目实际岗位要求维护",
    workContent: input.workContent?.trim() || "按项目班组安排完成现场工作",
    salary: input.salary?.trim() || "面议",
    workTime: input.workTime?.trim() || "按项目排班",
    workLocation: input.workLocation?.trim() || project.branchName || "项目现场",
    deadline: input.deadline ?? `${createdAt.slice(0, 10)}T23:59:59.000Z`,
    status: input.status ?? JobStatus.RECRUITING,
    supplierPolicyId: input.supplierPolicyId,
    referralPolicyId: input.referralPolicyId,
    notes: input.notes,
    applicationCount: 0,
    arrivedCount: 0,
    passedCount: 0,
    onboardCount: 0,
    remainingCount: Math.max(1, Number(input.requiredCount ?? 1)),
    createdAt
  };
  jobDemands = [record, ...jobDemands];
  commitDemoState();
  return byId(jobDemands, record.id);
}

function patchJobDemandRecord(id: string, input: Partial<JobDemand>): JobDemand {
  const previous = byId(jobDemands, id);
  const project = projectById.get(input.projectId ?? previous.projectId) ?? previous.project;
  const next: JobDemand = {
    ...previous,
    ...input,
    id: previous.id,
    projectId: project?.id ?? previous.projectId,
    project,
    projectName: project?.name ?? previous.projectName,
    branchName: project?.branchName ?? previous.branchName,
    requiredCount: Math.max(1, Number(input.requiredCount ?? previous.requiredCount))
  };
  jobDemands = jobDemands.map((job) => job.id === id ? next : job);
  commitDemoState();
  return byId(jobDemands, id);
}

function demoLeadershipDashboard(): LeadershipDashboard {
  const activeOutsourced = people.filter((person) =>
    (person.employmentStatus ?? person.status) === EmploymentStatus.ACTIVE
  ).length;
  const activeInternal = internalEmployees.filter((employee) => employee.status === "ACTIVE").length;
  const onboardMonth = people.filter((person) => person.onboardDate?.startsWith("2026-07")).length;
  const offboardMonth = people.filter((person) => person.offboardDate?.startsWith("2026-07")).length;
  const recruiting = jobDemands.filter((job) => job.status === JobStatus.RECRUITING);
  const requiredCount = recruiting.reduce((sum, job) => sum + Number(job.requiredCount ?? 0), 0);
  const applicationCount = recruiting.reduce((sum, job) => sum + Number(job.applicationCount ?? 0), 0);
  const totalPaymentCents = reimbursements.reduce((sum, item) => sum + item.totalPaymentCents, 0);
  const totalInvoiceCents = reimbursements.reduce((sum, item) => sum + item.totalInvoiceCents, 0);
  return {
    asOf: new Date().toISOString(),
    period: {
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
      label: "2026年07月"
    },
    people: {
      outsourcedActive: activeOutsourced,
      internalActive: activeInternal,
      totalActive: activeOutsourced + activeInternal,
      onboardMonth,
      offboardMonth,
      netGrowth: onboardMonth - offboardMonth
    },
    projects: {
      active: projects.filter((project) => project.status === ProjectStatus.ACTIVE).length,
      activeSuppliers: suppliers.filter((supplier) => supplier.projects?.length).length
    },
    recruitment: {
      activeDemands: recruiting.length,
      requiredCount,
      applicationCount,
      remainingCount: Math.max(requiredCount - applicationCount, 0),
      completionRate: requiredCount
        ? Math.min(100, Math.round(applicationCount / requiredCount * 1000) / 10)
        : 0
    },
    reimbursements: {
      count: reimbursements.length,
      totalPaymentCents,
      totalInvoiceCents,
      invoiceExcessCents: totalInvoiceCents - totalPaymentCents,
      paidCount: reimbursements.filter((item) => item.status === "PAID").length,
      pendingCount: reimbursements.filter((item) => item.status !== "PAID").length,
      openIssues: reimbursements.flatMap((item) => item.issues).filter((issue) => issue.status === "OPEN").length,
      byStatus: reimbursementStatusOrder.map((status) => {
        const rows = reimbursements.filter((item) => item.status === status);
        return {
          status,
          count: rows.length,
          paymentCents: rows.reduce((sum, item) => sum + item.totalPaymentCents, 0)
        };
      }).filter((item) => item.count > 0)
    },
    definitions: [
      "当前在职：截至更新时间，人员状态为在职的外包人员与内部员工合计。",
      "本月入离职：按人员主档入职日期、离职日期落在本自然月统计。",
      "招聘完成率：招聘中岗位的报名人数 ÷ 需求人数，最高显示100%。",
      "报销金额：按明细付款与发票金额汇总，发票金额严格大于付款金额。"
    ]
  };
}

function filterDemoReimbursements(query: QueryRecord): Reimbursement[] {
  const keyword = String(query.keyword ?? "").trim().toLowerCase();
  const status = String(query.status ?? "").trim();
  const branchId = String(query.branchId ?? "").trim();
  const organizationUnitId = String(query.organizationUnitId ?? "").trim();
  return reimbursements.filter((item) =>
    (!keyword || `${item.code} ${item.title} ${item.applicant.displayName}`.toLowerCase().includes(keyword)) &&
    (!status || item.status === status) &&
    (!branchId || item.branchId === branchId) &&
    (!organizationUnitId || item.organizationUnitId === organizationUnitId)
  );
}

function createDemoReimbursement(input: Omit<Partial<Reimbursement>, "lines"> & {
  lines?: Array<{
    sequence: number;
    expenseDate: string;
    category: string;
    description: string;
    payeeName?: string;
    payeeAccount?: string;
    payeeBank?: string;
    paymentCents: number;
    invoiceCents: number;
  }>;
}): Reimbursement {
  const lines = input.lines ?? [];
  if (!lines.length) throw new Error("报销单至少需要一条明细");
  if (lines.some((line) => line.invoiceCents <= line.paymentCents)) {
    throw new Error("发票金额必须严格大于付款金额");
  }
  const batchId = `demo-reimbursement-${Date.now()}`;
  const branch = demoOrganizationOptions.branches.find((item) => item.id === input.branchId);
  const organizationUnit = demoOrganizationOptions.organizationUnits.find((item) => item.id === input.organizationUnitId);
  const createdAt = new Date().toISOString();
  const record: Reimbursement = {
    id: batchId,
    code: `BX-202607-${String(reimbursements.length + 1).padStart(4, "0")}`,
    title: input.title?.trim() || "新建报销单",
    applicantUserId: demoUser.id,
    applicant: { id: demoUser.id, displayName: demoUser.displayName },
    branchId: branch?.id,
    branch,
    organizationUnitId: organizationUnit?.id,
    organizationUnit,
    status: "PENDING_SUBMISSION",
    totalPaymentCents: lines.reduce((sum, line) => sum + line.paymentCents, 0),
    totalInvoiceCents: lines.reduce((sum, line) => sum + line.invoiceCents, 0),
    invoiceExcessCents: lines.reduce((sum, line) => sum + line.invoiceCents - line.paymentCents, 0),
    version: 1,
    createdAt,
    updatedAt: createdAt,
    lines: lines.map((line) => ({
      id: `${batchId}-line-${line.sequence}`,
      ...line,
      attachments: []
    })),
    attachments: [],
    issues: [],
    approvals: [],
    artifacts: [],
    _count: { lines: lines.length, issues: 0, attachments: 0 }
  };
  reimbursements = [record, ...reimbursements];
  commitDemoState();
  return record;
}

type DemoInternalEmployeeCreateInput = {
  employeeNo: string;
  name: string;
  phone: string;
  idCard: string;
  email?: string;
  legalEntityId?: string;
  branchId?: string;
  organizationUnitId: string;
  positionId: string;
  jobGradeId?: string;
  onboardDate: string;
  reason?: string;
};

function assertUniqueInternalEmployee(input: DemoInternalEmployeeCreateInput): void {
  const normalizedEmployeeNo = input.employeeNo.trim().toUpperCase();
  const normalizedPhone = input.phone.trim();
  const normalizedIdCard = input.idCard.trim().toUpperCase();
  if (internalEmployees.some((employee) => employee.employeeNo.toUpperCase() === normalizedEmployeeNo)) {
    throw new Error("员工编号已存在");
  }
  if (internalEmployees.some((employee) => employee.phone === normalizedPhone)) {
    throw new Error("手机号已存在");
  }
  if (internalEmployees.some((employee) => employee.idCard.toUpperCase() === normalizedIdCard)) {
    throw new Error("身份证号已存在");
  }
}

function createDemoInternalEmployee(input: DemoInternalEmployeeCreateInput): InternalEmployee {
  assertUniqueInternalEmployee(input);
  const legalEntity = demoOrganizationOptions.legalEntities.find((item) => item.id === input.legalEntityId)
    ?? demoOrganizationOptions.legalEntities[0];
  const branch = demoOrganizationOptions.branches.find((item) => item.id === input.branchId)
    ?? demoOrganizationOptions.branches[0];
  const organizationUnit = demoOrganizationOptions.organizationUnits.find((item) => item.id === input.organizationUnitId);
  const position = demoOrganizationOptions.positions.find((item) => item.id === input.positionId);
  const jobGrade = demoOrganizationOptions.jobGrades.find((item) => item.id === input.jobGradeId);
  if (!organizationUnit || !position) throw new Error("部门和岗位必须来自当前组织架构");
  const createdAt = new Date().toISOString();
  const recordId = `demo-internal-${Date.now()}`;
  const reason = input.reason?.trim() || "新员工入职";
  const record: InternalEmployee = {
    id: recordId,
    employeeNo: input.employeeNo.trim().toUpperCase(),
    userId: `demo-internal-user-${Date.now()}`,
    name: input.name.trim(),
    phone: input.phone.trim(),
    idCard: input.idCard.trim().toUpperCase(),
    email: input.email?.trim() || undefined,
    legalEntityId: legalEntity?.id,
    branchId: branch?.id,
    organizationUnitId: organizationUnit.id,
    positionId: position.id,
    jobGradeId: jobGrade?.id,
    status: "ACTIVE",
    onboardDate: input.onboardDate,
    version: 1,
    legalEntity,
    branch,
    organizationUnit,
    position,
    jobGrade,
    employments: [{
      id: `${recordId}-employment-1`,
      startedAt: input.onboardDate,
      isPrimary: true,
      reason,
      legalEntity,
      branch,
      organizationUnit: { id: organizationUnit.id, name: organizationUnit.name },
      position: { id: position.id, name: position.name },
      jobGrade: jobGrade ? { id: jobGrade.id, name: jobGrade.name } : undefined
    }],
    changes: [{
      id: `${recordId}-change-1`,
      type: "ONBOARD",
      effectiveAt: input.onboardDate,
      reason,
      after: {
        legalEntityId: legalEntity?.id,
        branchId: branch?.id,
        organizationUnitId: organizationUnit.id,
        positionId: position.id,
        jobGradeId: jobGrade?.id
      },
      createdAt
    }]
  };
  internalEmployees = [record, ...internalEmployees];
  commitDemoState();
  return record;
}

function transferDemoInternalEmployee(
  employeeId: string,
  input: {
    expectedVersion: number;
    effectiveDate: string;
    organizationUnitId: string;
    positionId: string;
    branchId?: string;
    reason: string;
  }
): InternalEmployee {
  const previous = byId(internalEmployees, employeeId);
  if (previous.status !== "ACTIVE") throw new Error("仅在职内部员工可以办理调动");
  if (previous.version !== input.expectedVersion) throw new Error("员工档案已更新，请刷新后重试");
  const organizationUnit = demoOrganizationOptions.organizationUnits.find((item) => item.id === input.organizationUnitId);
  const position = demoOrganizationOptions.positions.find((item) => item.id === input.positionId);
  const branch = demoOrganizationOptions.branches.find((item) => item.id === input.branchId)
    ?? previous.branch;
  if (!organizationUnit || !position) throw new Error("部门和岗位必须来自当前组织架构");
  const before = {
    branchId: previous.branchId,
    organizationUnitId: previous.organizationUnitId,
    positionId: previous.positionId
  };
  const endedEmployments = (previous.employments ?? []).map((employment) =>
    employment.isPrimary && !employment.endedAt
      ? { ...employment, endedAt: input.effectiveDate, isPrimary: false }
      : employment
  );
  const currentEmployment = {
    id: `${employeeId}-employment-${previous.version + 1}`,
    startedAt: input.effectiveDate,
    isPrimary: true,
    reason: input.reason.trim(),
    legalEntity: previous.legalEntity,
    branch,
    organizationUnit: { id: organizationUnit.id, name: organizationUnit.name },
    position: { id: position.id, name: position.name },
    jobGrade: previous.jobGrade ? { id: previous.jobGrade.id, name: previous.jobGrade.name } : undefined
  };
  const next: InternalEmployee = {
    ...previous,
    branchId: branch?.id,
    organizationUnitId: organizationUnit.id,
    positionId: position.id,
    branch,
    organizationUnit,
    position,
    version: previous.version + 1,
    employments: [...endedEmployments, currentEmployment],
    changes: [...(previous.changes ?? []), {
      id: `${employeeId}-change-${previous.version + 1}`,
      type: "TRANSFER",
      effectiveAt: input.effectiveDate,
      reason: input.reason.trim(),
      before,
      after: {
        branchId: branch?.id,
        organizationUnitId: organizationUnit.id,
        positionId: position.id
      },
      createdAt: new Date().toISOString()
    }]
  };
  internalEmployees = internalEmployees.map((employee) => employee.id === employeeId ? next : employee);
  commitDemoState();
  return next;
}

function offboardDemoInternalEmployee(
  employeeId: string,
  input: { expectedVersion: number; offboardDate: string; reason: string }
): InternalEmployee {
  const previous = byId(internalEmployees, employeeId);
  if (previous.status !== "ACTIVE") throw new Error("仅在职内部员工可以办理离职");
  if (previous.version !== input.expectedVersion) throw new Error("员工档案已更新，请刷新后重试");
  const next: InternalEmployee = {
    ...previous,
    status: "LEFT",
    offboardDate: input.offboardDate,
    offboardReason: input.reason.trim(),
    version: previous.version + 1,
    employments: (previous.employments ?? []).map((employment) =>
      employment.isPrimary && !employment.endedAt
        ? { ...employment, endedAt: input.offboardDate, isPrimary: false }
        : employment
    ),
    changes: [...(previous.changes ?? []), {
      id: `${employeeId}-change-${previous.version + 1}`,
      type: "OFFBOARD",
      effectiveAt: input.offboardDate,
      reason: input.reason.trim(),
      before: { status: previous.status },
      after: { status: "LEFT", offboardDate: input.offboardDate },
      createdAt: new Date().toISOString()
    }]
  };
  internalEmployees = internalEmployees.map((employee) => employee.id === employeeId ? next : employee);
  commitDemoState();
  return next;
}

export async function handleDemoRequest<T>(method: string, path: string, query: QueryRecord = {}, body?: unknown): Promise<T> {
  await ensureRealDemoData();
  const pageNumber = queryNumber(query, "page", 1);
  const pageSize = queryNumber(query, "pageSize", 20);
  const id = path.split("/").filter(Boolean).at(-1) ?? "";
  const aiResult = handleDemoAiRequest(method, path, body, {
    people,
    projects,
    jobs: jobDemands,
    suppliers,
    onboard: (personId, date) => {
      const person = patchPerson(personId, personPatchForAction(`/people/${personId}/onboard`, {
        onboardDate: date,
        insuranceTypes: [],
        notes: "祥能AI业务助手确认执行"
      }), `/people/${personId}/onboard`);
      patchLatestApplicationForAction(personId, `/people/${personId}/onboard`, { onboardDate: date });
      syncDerivedData();
      commitDemoState();
      return personDetail(person.id);
    },
    offboard: (personId, date, reason) => {
      const person = patchPerson(personId, personPatchForAction(`/people/${personId}/offboard`, {
        offboardDate: date,
        offboardReason: reason,
        insuranceTypes: [],
        notes: "祥能AI业务助手确认执行"
      }), `/people/${personId}/offboard`);
      patchLatestApplicationForAction(personId, `/people/${personId}/offboard`, { offboardDate: date, offboardReason: reason });
      syncDerivedData();
      commitDemoState();
      return personDetail(person.id);
    }
  });
  if (aiResult) return aiResult as T;

  if (method === "GET" && path === "/auth/me") return demoUser as T;
  if (method === "GET" && path === "/organization/options") return demoOrganizationOptions as T;
  if (method === "GET" && path === "/organization/tree") return demoOrganizationOptions.organizationUnits as T;
  if (method === "GET" && path === "/internal-employees") {
    const keyword = String(query.keyword ?? "").trim().toLowerCase();
    const status = String(query.status ?? "");
    const branchId = String(query.branchId ?? "");
    const organizationUnitId = String(query.organizationUnitId ?? "");
    const filtered = internalEmployees.filter((employee) =>
      (!keyword || `${employee.name} ${employee.employeeNo} ${employee.phone} ${employee.idCard}`.toLowerCase().includes(keyword)) &&
      (!status || employee.status === status) &&
      (!branchId || employee.branchId === branchId) &&
      (!organizationUnitId || employee.organizationUnitId === organizationUnitId)
    );
    return page(filtered, pageNumber, pageSize) as T;
  }
  if (method === "GET" && /^\/internal-employees\/[^/]+$/.test(path)) {
    return byId(internalEmployees, id) as T;
  }
  if (method === "POST" && path === "/internal-employees") {
    return createDemoInternalEmployee(body as DemoInternalEmployeeCreateInput) as T;
  }
  if (method === "POST" && /^\/internal-employees\/[^/]+\/transfer$/.test(path)) {
    const employeeId = path.split("/")[2] ?? "";
    return transferDemoInternalEmployee(
      employeeId,
      body as Parameters<typeof transferDemoInternalEmployee>[1]
    ) as T;
  }
  if (method === "POST" && /^\/internal-employees\/[^/]+\/offboard$/.test(path)) {
    const employeeId = path.split("/")[2] ?? "";
    return offboardDemoInternalEmployee(
      employeeId,
      body as Parameters<typeof offboardDemoInternalEmployee>[1]
    ) as T;
  }
  if (method === "GET" && path === "/leadership/dashboard") {
    return demoLeadershipDashboard() as T;
  }
  if (method === "GET" && path === "/reimbursements") {
    return page(filterDemoReimbursements(query), pageNumber, pageSize) as T;
  }
  if (method === "GET" && /^\/reimbursements\/[^/]+$/.test(path)) {
    return byId(reimbursements, id) as T;
  }
  if (method === "GET" && path === "/statistics/overview") return filteredDashboard(query) as T;
  if (method === "GET" && path === "/demo/miniapp-snapshot") return miniappSnapshot() as T;
  if (method === "GET" && path === "/statistics/drilldown") return page(filterPeople(query), pageNumber, pageSize) as T;
  if (method === "GET" && path === "/branches") return page(realData?.branches ?? [], pageNumber, pageSize) as T;
  if (method === "GET" && path === "/projects") return page(filterProjects(query), pageNumber, pageSize) as T;
  if (method === "GET" && path.startsWith("/projects/")) return byId(projects, id) as T;
  if (method === "GET" && path === "/suppliers") return page(filterSuppliers(query), pageNumber, pageSize) as T;
  if (method === "GET" && path.startsWith("/suppliers/")) return byId(suppliers, id) as T;
  if (method === "GET" && path === "/policies") return page(filterPolicies(query), pageNumber, pageSize) as T;
  if (method === "GET" && path === "/job-demands") return page(filterJobDemands(query), pageNumber, pageSize) as T;
  if (method === "GET" && path.startsWith("/job-demands/")) return byId(jobDemands, id) as T;
  if (method === "GET" && path === "/people") return page(filterPeople(query), pageNumber, pageSize) as T;
  if (method === "GET" && path.startsWith("/people/")) return personDetail(id) as T;
  if (method === "GET" && path === "/applications") return page(filterApplications(query), pageNumber, pageSize) as T;
  if (method === "GET" && path === "/referral-rewards") return page(rewards, pageNumber, pageSize) as T;
  if (method === "GET" && path === "/salary-slips") return page(salarySlips, pageNumber, pageSize) as T;
  if (method === "GET" && path === "/blacklist-records") return page(blacklistRecords, pageNumber, pageSize) as T;
  if (method === "GET" && path === "/appeals") return page(appealRecords, pageNumber, pageSize) as T;
  if (method === "GET" && path === "/advance-requests") return page(advanceRequests, pageNumber, pageSize) as T;
  if (method === "GET" && path === "/contract-templates") return page(contractTemplates, pageNumber, pageSize) as T;
  if (method === "GET" && path === "/electronic-seals") return page(electronicSeals, pageNumber, pageSize) as T;
  if (method === "GET" && path === "/electronic-contracts") return page(filterElectronicContracts(query), pageNumber, pageSize) as T;
  if (method === "GET" && path.startsWith("/electronic-contracts/")) return byId(electronicContracts, id) as T;
  if (method === "GET" && path === "/registration-qrs") return page(registrationQrs, pageNumber, pageSize) as T;
  if (method === "GET" && path === "/imports") return page([{ id: "import-1", type: "PEOPLE", sourceFile: "祥能HRMS_合成演示数据.xlsx", status: ImportStatus.PREVIEW, totalRows: realDemoMeta.sourceRows, successCount: realDemoMeta.applicationRecords, failedCount: 0, createdAt: now }], pageNumber, pageSize) as T;
  if (method === "GET" && path === "/users") return page(users(), pageNumber, pageSize) as T;
  if (method === "GET" && path === "/audit-logs") return page(auditLogs(), pageNumber, pageSize) as T;

  if (method === "POST" && path === "/reimbursements") {
    return createDemoReimbursement(body as Parameters<typeof createDemoReimbursement>[0]) as T;
  }
  if (method === "PATCH" && /^\/reimbursements\/[^/]+$/.test(path)) {
    const previous = byId(reimbursements, id);
    const input = body as Partial<Reimbursement> & { expectedVersion?: number };
    if (input.expectedVersion && input.expectedVersion !== previous.version) {
      throw new Error("报销单已更新，请刷新后重试");
    }
    const next = {
      ...previous,
      title: input.title ?? previous.title,
      version: previous.version + 1,
      updatedAt: new Date().toISOString()
    };
    reimbursements = reimbursements.map((item) => item.id === id ? next : item);
    commitDemoState();
    return next as T;
  }
  if (method === "POST" && /^\/reimbursements\/[^/]+\/transition$/.test(path)) {
    const batchId = path.split("/")[2] ?? "";
    const previous = byId(reimbursements, batchId);
    const input = body as {
      expectedVersion: number;
      targetStatus: ReimbursementStatus;
      comment?: string;
    };
    if (previous.version !== input.expectedVersion) throw new Error("报销单已更新，请刷新后重试");
    if (previous.issues.some((issue) => issue.status === "OPEN")) throw new Error("仍有未解决问题，不能继续流转");
    const next: Reimbursement = {
      ...previous,
      status: input.targetStatus,
      version: previous.version + 1,
      submittedAt: input.targetStatus === "DEPARTMENT_PREPARING" ? new Date().toISOString() : previous.submittedAt,
      approvedAt: input.targetStatus === "APPROVED" ? new Date().toISOString() : previous.approvedAt,
      updatedAt: new Date().toISOString(),
      approvals: [...previous.approvals, {
        id: `demo-approval-${Date.now()}`,
        fromStatus: previous.status,
        toStatus: input.targetStatus,
        decision: "APPROVED",
        comment: input.comment,
        actor: { id: demoUser.id, displayName: demoUser.displayName },
        createdAt: new Date().toISOString()
      }]
    };
    reimbursements = reimbursements.map((item) => item.id === batchId ? next : item);
    commitDemoState();
    return next as T;
  }
  if (method === "POST" && /^\/reimbursements\/[^/]+\/attachments$/.test(path)) {
    const batchId = path.split("/")[2] ?? "";
    const previous = byId(reimbursements, batchId);
    const lineId = String(query.lineId ?? "");
    const type = String(query.type ?? "SUPPORTING") as "PAYMENT_VOUCHER" | "INVOICE" | "SUPPORTING";
    const attachment = {
      id: `demo-attachment-${Date.now()}`,
      batchId,
      lineId: lineId || undefined,
      type,
      originalName: type === "INVOICE" ? "新上传增值税发票.pdf" : "新上传付款凭证.pdf",
      mimeType: "application/pdf",
      sizeBytes: 186_000,
      sha256: "d".repeat(64),
      createdAt: new Date().toISOString()
    };
    const next: Reimbursement = {
      ...previous,
      attachments: [...previous.attachments, attachment],
      lines: previous.lines.map((line) => line.id === lineId ? {
        ...line,
        attachments: [...line.attachments, attachment]
      } : line),
      updatedAt: new Date().toISOString(),
      _count: {
        lines: previous.lines.length,
        issues: previous.issues.length,
        attachments: previous.attachments.length + 1
      }
    };
    reimbursements = reimbursements.map((item) => item.id === batchId ? next : item);
    commitDemoState();
    return attachment as T;
  }
  if (method === "POST" && /^\/reimbursements\/[^/]+\/issues$/.test(path)) {
    const batchId = path.split("/")[2] ?? "";
    const previous = byId(reimbursements, batchId);
    const input = body as { lineId?: string; type: string; description: string };
    const issue: ReimbursementIssue = {
      id: `demo-issue-${Date.now()}`,
      lineId: input.lineId,
      type: input.type,
      description: input.description,
      status: "OPEN",
      raisedBy: { id: demoUser.id, displayName: demoUser.displayName },
      createdAt: new Date().toISOString()
    };
    const next: Reimbursement = {
      ...previous,
      issues: [issue, ...previous.issues],
      updatedAt: new Date().toISOString()
    };
    reimbursements = reimbursements.map((item) => item.id === batchId ? next : item);
    commitDemoState();
    return issue as T;
  }
  if (method === "POST" && /^\/reimbursements\/[^/]+\/issues\/[^/]+\/resolve$/.test(path)) {
    const parts = path.split("/");
    const batchId = parts[2] ?? "";
    const issueId = parts[4] ?? "";
    const previous = byId(reimbursements, batchId);
    const input = body as { resolution: string };
    let resolved: ReimbursementIssue | undefined;
    const next: Reimbursement = {
      ...previous,
      issues: previous.issues.map((issue) => {
        if (issue.id !== issueId) return issue;
        resolved = {
          ...issue,
          status: "RESOLVED",
          resolution: input.resolution,
          resolvedBy: { id: demoUser.id, displayName: demoUser.displayName },
          resolvedAt: new Date().toISOString()
        };
        return resolved;
      }),
      updatedAt: new Date().toISOString()
    };
    reimbursements = reimbursements.map((item) => item.id === batchId ? next : item);
    if (!resolved) throw new Error("报销问题不存在");
    commitDemoState();
    return resolved as T;
  }
  if (method === "POST" && /^\/reimbursements\/[^/]+\/payments$/.test(path)) {
    const batchId = path.split("/")[2] ?? "";
    const previous = byId(reimbursements, batchId);
    const input = body as { amountCents: number; reference: string; paidAt: string };
    if (input.amountCents !== previous.totalPaymentCents) throw new Error("打款金额必须与报销付款合计一致");
    const next: Reimbursement = {
      ...previous,
      status: "PAID",
      version: previous.version + 1,
      paidAt: input.paidAt,
      updatedAt: new Date().toISOString(),
      payment: {
        id: `demo-payment-${Date.now()}`,
        amountCents: input.amountCents,
        reference: input.reference,
        paidAt: input.paidAt
      },
      approvals: [...previous.approvals, {
        id: `demo-payment-approval-${Date.now()}`,
        fromStatus: previous.status,
        toStatus: "PAID",
        decision: "APPROVED",
        comment: `付款流水号：${input.reference}`,
        actor: { id: demoUser.id, displayName: demoUser.displayName },
        createdAt: new Date().toISOString()
      }]
    };
    reimbursements = reimbursements.map((item) => item.id === batchId ? next : item);
    commitDemoState();
    return next.payment as T;
  }
  if (method === "POST" && /^\/reimbursements\/[^/]+\/artifacts\/generate$/.test(path)) {
    const batchId = path.split("/")[2] ?? "";
    const previous = byId(reimbursements, batchId);
    const input = body as { type: ReimbursementArtifact["type"] };
    const artifact: ReimbursementArtifact = {
      id: `demo-artifact-${Date.now()}`,
      type: input.type,
      status: "GENERATED",
      originalName: `${previous.code}-${input.type === "REIMBURSEMENT_FORM" ? "报销单.xlsx" : input.type === "PAYMENT_PACKAGE" ? "付款凭证材料包.zip" : "发票材料包.zip"}`,
      generatedAt: new Date().toISOString()
    };
    const next: Reimbursement = {
      ...previous,
      artifacts: [
        ...previous.artifacts.filter((item) => item.type !== input.type),
        artifact
      ],
      updatedAt: new Date().toISOString()
    };
    reimbursements = reimbursements.map((item) => item.id === batchId ? next : item);
    commitDemoState();
    return artifact as T;
  }
  if (method === "POST" && path === "/projects") return createProjectRecord(body as Partial<Project>) as T;
  if (method === "PATCH" && path.startsWith("/projects/")) return patchProjectRecord(id, body as Partial<Project>) as T;
  if (method === "POST" && path === "/suppliers") return createSupplierRecord(body as Partial<Supplier>) as T;
  if (method === "PATCH" && path.startsWith("/suppliers/")) return patchSupplierRecord(id, body as Partial<Supplier>) as T;
  if (method === "POST" && path === "/job-demands") return createJobDemandRecord(body as Partial<JobDemand>) as T;
  if (method === "PATCH" && path.startsWith("/job-demands/")) return patchJobDemandRecord(id, body as Partial<JobDemand>) as T;
  if (method === "POST" && path === "/registration-qrs") return createRegistrationQr(body as { projectId?: string; jobDemandId?: string; operatorName?: string }) as T;
  if (method === "PATCH" && path.startsWith("/appeals/")) {
    const appealId = path.split("/").filter(Boolean)[1] ?? "";
    const previous = byId(appealRecords, appealId);
    const input = body as Partial<AppealRecord>;
    const next: AppealRecord = {
      ...previous,
      ...input,
      id: previous.id,
      handledAt: input.status && input.status !== "PENDING" ? new Date().toISOString() : previous.handledAt
    };
    appealRecords = appealRecords.map((appeal) => appeal.id === appealId ? next : appeal);
    commitDemoState();
    return next as T;
  }

  if (method === "POST" && path === "/people") {
    const input = body as Partial<Person>;
    const blocked = blacklistHit(input);
    if (blocked) throw new Error(`报名被黑名单拦截：${blocked.name}，原因：${blocked.reason}`);
    const project = projects.find((item) => item.id === input.projectId) ?? projects[0]!;
    const supplier = suppliers.find((item) => item.id === input.supplierId);
    const createdAt = new Date().toISOString();
    const normalizedIdCard = input.idCard?.trim();
    const normalizedPhone = input.phone?.trim();
    const existingPerson = people.find((item) =>
      Boolean(normalizedIdCard && item.idCard?.trim() === normalizedIdCard) ||
      Boolean(!normalizedIdCard && normalizedPhone && item.phone?.trim() === normalizedPhone && item.name === input.name?.trim())
    );
    const duplicateApplication = existingPerson && applications.find((application) =>
      application.personId === existingPerson.id &&
      application.jobDemandId === input.jobDemandId &&
      application.interviewStatus !== InterviewStatus.FAILED &&
      application.interviewStatus !== InterviewStatus.ABANDONED &&
      application.employmentStatus !== EmploymentStatus.LEFT
    );
    if (duplicateApplication) {
      return {
        person: personDetail(existingPerson.id),
        application: applicationDetail(duplicateApplication),
        created: false,
        merged: true,
        duplicateApplication: true,
        warnings: ["该人员已报名当前岗位，已返回原人员主档和原报名记录"]
      } as T;
    }

    let person: Person;
    if (existingPerson) {
      person = {
        ...existingPerson,
        phone: normalizedPhone || existingPerson.phone,
        updatedAt: createdAt,
        lifecycle: [
          ...(existingPerson.lifecycle ?? initialLifecycle(existingPerson)),
          lifecycleRecord(existingPerson, "REGISTRATION", "新增报名", `报名项目：${project.name}；岗位：${input.jobTitle ?? "综合岗位"}；来源：${input.source ?? ApplicationSource.OPERATOR}`)
        ]
      };
      people = people.map((item) => item.id === person.id ? person : item);
    } else {
      person = withLifecycle(hydratePerson({ id: `person-demo-${people.length + 1}`, name: input.name ?? "新报名人员", idCard: input.idCard ?? "", phone: input.phone ?? "", branchId: project.branchId, branchName: project.branchName, projectId: project.id, projectName: project.name, jobTitle: input.jobTitle ?? "综合岗位", interviewDate: input.interviewDate, interviewStatus: InterviewStatus.PENDING_ARRIVAL, employmentStatus: EmploymentStatus.APPLICANT, status: EmploymentStatus.APPLICANT, insuranceTypes: [], supplierId: supplier?.id, supplierName: supplier?.name, recommenderUserId: input.recommenderUserId, recommenderName: input.recommenderName, emergencyContactName: input.emergencyContactName, emergencyContactPhone: input.emergencyContactPhone, emergencyContactRelation: input.emergencyContactRelation, notes: input.notes, source: input.source ?? ApplicationSource.OPERATOR, createdAt, updatedAt: createdAt }));
      people = [person, ...people];
    }

    const application: DemoApplication = {
      id: `application-demo-${applications.length + 1}`,
      personId: person.id,
      jobDemandId: input.jobDemandId ?? undefined,
      source: String(input.source ?? ApplicationSource.OPERATOR),
      createdAt,
      appliedAt: createdAt,
      interviewDate: input.interviewDate,
      interviewStatus: InterviewStatus.PENDING_ARRIVAL,
      employmentStatus: EmploymentStatus.APPLICANT,
      supplierId: supplier?.id,
      supplierName: supplier?.name,
      supplier,
      recommenderUserId: input.recommenderUserId,
      recommenderName: input.recommenderName,
      person
    };
    applications = [application, ...applications];
    changedPersonIds.add(person.id);
    if (input.recommenderName || input.recommenderUserId || input.source === ApplicationSource.REFERRAL) {
      rewards = [{
        id: `reward-demo-${rewards.length + 1}`,
        personId: person.id,
        person,
        recommender: { displayName: input.recommenderName ?? input.recommenderUserId ?? "员工推荐" },
        policy: policies[1],
        amount: 0,
        status: RewardStatus.PENDING,
        notes: "演示报名触发的员工推荐进度",
        createdAt
      }, ...rewards];
    }
    syncDerivedData();
    commitDemoState();
    return {
      person: personDetail(person.id),
      application: applicationDetail(application),
      created: !existingPerson,
      merged: Boolean(existingPerson),
      warnings: [existingPerson ? "已命中原人员主档，仅新增本次岗位报名记录" : "已创建人员主档和首条岗位报名记录"]
    } as T;
  }
  if (method === "POST" && path === "/blacklist-records") {
    const input = body as Partial<BlacklistRecord>;
    const person = people.find((item) => item.id === input.personId || item.idCard === input.idCard || item.name === input.name);
    const record: BlacklistRecord = {
      id: `blacklist-demo-${blacklistRecords.length + 1}`,
      personId: person?.id ?? input.personId,
      name: input.name ?? person?.name ?? "系统用户",
      idCard: input.idCard ?? person?.idCard ?? "",
      phone: input.phone ?? person?.phone,
      reason: input.reason ?? "业务申请",
      status: "ACTIVE",
      operatorName: input.operatorName ?? "演示管理员",
      createdAt: now
    };
    blacklistRecords = [record, ...blacklistRecords];
    commitDemoState();
    return record as T;
  }
  if (method === "POST" && path === "/appeals") {
    const input = body as Partial<AppealRecord>;
    const record: AppealRecord = {
      id: `appeal-demo-${appealRecords.length + 1}`,
      ownerType: input.ownerType ?? "EMPLOYEE",
      ownerName: input.ownerName ?? "演示用户",
      type: input.type ?? "POLICY",
      content: input.content ?? "业务反馈",
      status: "PENDING",
      relatedPersonId: input.relatedPersonId,
      relatedSalarySlipId: input.relatedSalarySlipId,
      relatedSettlementItemId: input.relatedSettlementItemId,
      appealAmount: input.appealAmount,
      expectedStatusText: input.expectedStatusText,
      evidenceNames: input.evidenceNames ?? [],
      companyReply: input.companyReply,
      createdAt: now
    };
    appealRecords = [record, ...appealRecords];
    commitDemoState();
    return record as T;
  }
  if (method === "POST" && path === "/advance-requests") {
    const input = body as Partial<AdvanceRequest>;
    const person = people.find((item) => item.id === input.personId) ?? people.find((item) => item.name === input.personName);
    const record: AdvanceRequest = {
      id: `advance-demo-${advanceRequests.length + 1}`,
      personId: person?.id ?? input.personId,
      personName: input.personName ?? person?.name ?? "员工本人",
      amount: Number(input.amount ?? 0),
      reason: input.reason ?? "业务调整",
      status: "PENDING",
      createdAt: now
    };
    advanceRequests = [record, ...advanceRequests];
    commitDemoState();
    return record as T;
  }
  if (method === "POST" && path === "/contract-templates") {
    const input = body as Partial<ContractTemplate>;
    const record: ContractTemplate = {
      id: `contract-template-demo-${contractTemplates.length + 1}`,
      name: input.name ?? "新合同模板",
      contractType: input.contractType ?? "劳动合同",
      originalName: input.originalName ?? `${input.name ?? "合同模板"}.docx`,
      version: input.version ?? "V1.0",
      isActive: input.isActive ?? true,
      uploadedByName: input.uploadedByName ?? "演示管理员",
      createdAt: new Date().toISOString()
    };
    contractTemplates = [record, ...contractTemplates];
    commitDemoState();
    return record as T;
  }
  if (method === "POST" && path === "/electronic-seals") {
    const input = body as Partial<ElectronicSeal>;
    const record: ElectronicSeal = {
      id: `seal-demo-${electronicSeals.length + 1}`,
      name: input.name ?? "电子公章",
      originalName: input.originalName ?? `${input.name ?? "电子公章"}.png`,
      status: input.status ?? "ACTIVE",
      uploadedByName: input.uploadedByName ?? "演示管理员",
      createdAt: new Date().toISOString()
    };
    electronicSeals = [record, ...electronicSeals];
    commitDemoState();
    return record as T;
  }
  if (method === "POST" && path === "/electronic-contracts") {
    const input = body as Partial<ElectronicContract>;
    const person = people.find((item) => item.id === input.personId) ?? people.find((item) => item.name === input.personName) ?? people[0];
    const template = contractTemplates.find((item) => item.id === input.templateId) ?? contractTemplates[0];
    const seal = electronicSeals.find((item) => item.id === input.sealId) ?? electronicSeals.find((item) => item.status === "ACTIVE");
    if (!person || !template) throw new Error("缺少人员或合同模板，无法创建合同");
    const createdAt = new Date().toISOString();
    const record: ElectronicContract = {
      id: `contract-demo-${electronicContracts.length + 1}`,
      personId: person.id,
      person,
      personName: person.name,
      templateId: template.id,
      templateName: template.name,
      sealId: seal?.id,
      sealName: seal?.name,
      contractNo: input.contractNo ?? `XNHT-${createdAt.slice(0, 10).replaceAll("-", "")}-${String(electronicContracts.length + 1).padStart(3, "0")}`,
      status: "PENDING_UPLOAD",
      materialNames: [],
      dueDate: input.dueDate,
      createdAt
    };
    electronicContracts = [record, ...electronicContracts];
    commitDemoState();
    return record as T;
  }
  if (method === "POST" && path.includes("/materials") && path.startsWith("/electronic-contracts/")) {
    const parts = path.split("/").filter(Boolean);
    const contractId = parts[1] ?? "";
    const input = body as { materialName?: string; materialNames?: string[] };
    const contract = byId(electronicContracts, contractId);
    const materialNames = [...new Set([...(contract.materialNames ?? []), ...(input.materialNames ?? []), input.materialName ?? "员工签约资料"].filter(Boolean))];
    const next: ElectronicContract = { ...contract, materialNames, status: "READY_TO_SIGN" };
    electronicContracts = electronicContracts.map((item) => item.id === contractId ? next : item);
    commitDemoState();
    return next as T;
  }
  if (method === "POST" && path.includes("/sign") && path.startsWith("/electronic-contracts/")) {
    const parts = path.split("/").filter(Boolean);
    const contractId = parts[1] ?? "";
    const contract = byId(electronicContracts, contractId);
    const person = people.find((item) => item.id === contract.personId);
    if (!person) throw new Error("合同对应人员不存在");
    const signedAt = new Date().toISOString();
    const signedFileId = contract.signedFileId ?? `contract-file-${contract.id}`;
    const signedFileName = contract.signedFileName ?? `已签署-${person.name}-${contract.templateName}.pdf`;
    const next: ElectronicContract = {
      ...contract,
      person,
      personName: person.name,
      status: "SIGNED",
      signedAt,
      archivedAt: signedAt,
      signedFileId,
      signedFileName
    };
    electronicContracts = electronicContracts.map((item) => item.id === contractId ? next : item);
    archiveSignedContract(next);
    commitDemoState();
    return next as T;
  }
  if (method === "PATCH" && path.startsWith("/people/")) {
    const parts = path.split("/").filter(Boolean);
    const personId = parts[1] ?? "";
    const person = patchPerson(personId, personPatchForAction(path, body), path);
    patchLatestApplicationForAction(personId, path, body);
    syncDerivedData();
    commitDemoState();
    return personDetail(person.id) as T;
  }

  if (method === "POST" && path === "/demo/reset") {
    clearPersistedDemoState();
    resetDemoAiActions();
    realData = null;
    changedPersonIds = new Set<string>();
    candidateDemoPersonId = undefined;
    internalEmployees = createDemoInternalEmployees();
    reimbursements = createDemoReimbursements();
    await ensureRealDemoData();
    return { ok: true } as T;
  }

  if (method === "POST" && path === "/imports/organization/preview") return previewImport() as T;
  if (method === "POST" && path === "/imports/people/preview") return previewImport() as T;
  if (method === "POST" && path.includes("commit")) return { ok: true, status: "DEMO_ONLY", message: "演示模式未写入数据库" } as T;
  if (method === "POST" || method === "PATCH") return { ok: true, status: "DEMO_ONLY", message: "演示模式操作成功，未写入数据库" } as T;

  throw new Error(`演示模式暂未覆盖 ${method} ${path}`);
}

export function demoDownload(fileName: string): { blob: Blob; fileName: string } {
  const blob = new Blob(["演示模式下载文件，真实导出需启动后端服务。"], { type: "text/plain;charset=utf-8" });
  return { blob, fileName };
}
