import syntheticSource from '../../../../data/synthetic/demo-data.json';
import type { Job, MessageItem, Person, Session } from './types';

type JsonObject = Record<string, unknown>;
type SyntheticProject = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  businessType?: string;
  managerName?: string;
  managerPhone?: string;
  imageUrl?: string;
};
type SyntheticSupplier = {
  id: string;
  name: string;
  contactName?: string;
  contactPhone?: string;
  level?: string;
  projectIds?: string[];
};
type SyntheticJob = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  requiredCount: number;
  requirements?: string;
  description?: string;
  salary?: string;
  workTime?: string;
  workLocation?: string;
  benefits?: string[];
  deadline?: string;
  status?: string;
  createdAt?: string;
};
type SyntheticPerson = {
  id: string;
  employeeNo?: string;
  name: string;
  idCard: string;
  phone: string;
  gender?: string;
  age?: number;
  origin?: string;
  branchId?: string;
  projectId: string;
  projectName: string;
  jobTitle?: string;
  interviewDate?: string;
  interviewStatus?: string;
  employmentStatus?: string;
  onboardDate?: string;
  offboardDate?: string;
  supplierId?: string;
  supplierName?: string;
  recommenderName?: string;
  insuranceTypes?: string[];
  createdAt?: string;
  statusLogs?: Array<{ id: string; toStatus: string; notes?: string; createdAt: string }>;
};
type SyntheticData = {
  branches: Array<{ id: string; name: string }>;
  projects: SyntheticProject[];
  suppliers: SyntheticSupplier[];
  jobDemands: SyntheticJob[];
  people: SyntheticPerson[];
};

type Referral = {
  id: string;
  name: string;
  phone: string;
  projectName: string;
  jobTitle: string;
  status: string;
  reward: number;
  rewardStatus: string;
  createdAt: string;
  onboardDate?: string;
};
type Advance = {
  id: string;
  name: string;
  phone: string;
  amount: number;
  reason: string;
  status: string;
  reply?: string;
  created_at: string;
};
type Appeal = {
  id: string;
  creatorName: string;
  creatorRole: string;
  type: string;
  description: string;
  requested_amount?: number;
  status: string;
  reply?: string;
  created_at: string;
};
type DemoState = {
  jobs: Job[];
  people: Person[];
  favoriteIds: string[];
  messages: MessageItem[];
  referrals: Referral[];
  advances: Advance[];
  appeals: Appeal[];
};

const source = syntheticSource as unknown as SyntheticData;
const DEMO_STATE_KEY = 'xiangneng.portal.demo-state.v2';
const DEMO_SESSION_KEY = 'xiangneng.portal.demo-session.v2';
const CORE_TOKEN_KEY = 'xiangneng_core_token';
const projectImages = [
  '/project-assets/electronics-workshop.png',
  '/project-assets/logistics-warehouse.png',
  '/project-assets/new-energy-campus.png'
];

function salaryRange(text?: string): [number, number] {
  const values = (text?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if ((values[0] ?? 0) < 1_000) return [5_000, 6_500];
  return [values[0] ?? 5_000, values[1] ?? values[0] ?? 6_500];
}

function portalStatus(person: SyntheticPerson): string {
  if (person.employmentStatus === 'ACTIVE') return 'employed';
  if (person.employmentStatus === 'LEFT') return 'departed';
  if (person.employmentStatus === 'PENDING_ONBOARD') return 'pending_onboard';
  if (person.interviewStatus === 'PASSED') return 'interview_passed';
  if (person.interviewStatus === 'FAILED') return 'interview_failed';
  if (person.interviewStatus === 'ARRIVED') return 'arrived';
  return 'registered';
}

function jobStatus(status?: string): string {
  return status === 'PAUSED' ? 'paused' : status === 'CLOSED' ? 'closed' : 'recruiting';
}

function employmentDays(onboardDate?: string, offboardDate?: string): number {
  if (!onboardDate) return 0;
  const start = new Date(`${onboardDate}T00:00:00`);
  const end = new Date(`${offboardDate || '2026-07-26'}T00:00:00`);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function createInitialPeople(): Person[] {
  return source.people.map((item, index) => {
    const status = portalStatus(item);
    const createdAt = item.createdAt ?? `2026-07-${String(index % 20 + 1).padStart(2, '0')}T09:00:00.000Z`;
    return {
      id: item.id,
      name: item.name,
      phone: item.phone,
      idCard: item.idCard,
      employeeNo: item.employeeNo,
      gender: item.gender ?? (index % 2 ? '女' : '男'),
      age: item.age ?? 20 + index % 20,
      origin: item.origin ?? '四川宜宾',
      projectId: item.projectId,
      projectName: item.projectName,
      companyId: item.branchId,
      jobId: source.jobDemands.find((job) => job.projectId === item.projectId && job.title === item.jobTitle)?.id
        ?? source.jobDemands.find((job) => job.projectId === item.projectId)?.id
        ?? source.jobDemands[0]?.id
        ?? '',
      jobTitle: item.jobTitle ?? '操作工',
      supplierId: item.supplierId,
      supplierName: item.supplierName,
      recommenderName: item.recommenderName,
      status,
      appliedAt: createdAt,
      interviewAt: item.interviewDate ? `${item.interviewDate}T09:30:00.000Z` : null,
      onboardDate: item.onboardDate || null,
      departureDate: item.offboardDate || null,
      insuranceStatus: item.insuranceTypes?.length ? '已办理' : status === 'employed' ? '已办理商业保险' : '待办理',
      employmentDays: employmentDays(item.onboardDate, item.offboardDate),
      lifecycle: [
        {
          id: `${item.id}-current`,
          status,
          occurredAt: item.offboardDate
            ? `${item.offboardDate}T18:00:00.000Z`
            : item.onboardDate
              ? `${item.onboardDate}T09:00:00.000Z`
              : createdAt,
          note: status === 'employed' ? '已完成入职并同步人员档案' : status === 'departed' ? '已办理离职并完成留档' : '招聘流程状态已同步'
        },
        {
          id: `${item.id}-registered`,
          status: 'registered',
          occurredAt: createdAt,
          note: '完成报名，建立一人一档'
        }
      ]
    };
  });
}

function createInitialJobs(people: Person[]): Job[] {
  return source.jobDemands.map((item, index) => {
    const project = source.projects.find((candidate) => candidate.id === item.projectId) ?? source.projects[index % source.projects.length]!;
    const [minimum, maximum] = salaryRange(item.salary);
    const projectPeople = people.filter((person) => person.projectId === item.projectId);
    const exactPeople = projectPeople.filter((person) => person.jobTitle === item.title);
    const relevantPeople = exactPeople.length ? exactPeople : projectPeople;
    const completedCount = relevantPeople.filter((person) => person.status === 'employed').length;
    return {
      id: item.id,
      project_id: item.projectId,
      projectName: item.projectName,
      companyName: project.branchName,
      title: item.title,
      type: item.title,
      salary_min: minimum,
      salary_max: maximum,
      headcount: item.requiredCount,
      work_time: item.workTime ?? '08:00-17:30，长白班',
      requirements: item.requirements ?? '18至45周岁，身体健康，能适应排班。',
      duties: item.description ?? '按岗位标准作业流程完成生产协作、质量检查和现场记录。',
      benefits: item.benefits?.join('、') || '包住、工作餐、商业保险、节日福利',
      deadline: item.deadline ?? '2026-08-31',
      status: jobStatus(item.status),
      supplier_policy: '入职满30天且在职，按岗位政策结算500元/人。',
      referral_policy: '内部推荐人员入职满30天，奖励500元/人。',
      policy_start: '2026-07-01',
      policy_end: '2026-12-31',
      settlement_condition: '每月末核对，次月确认无争议后结算。',
      created_at: item.createdAt ?? '2026-07-01T09:00:00.000Z',
      region: ['四川省宜宾市', '四川省泸州市', '四川省成都市', '四川省绵阳市'][index % 4]!,
      address: item.workLocation ?? `${project.branchName} · ${item.projectName}项目现场`,
      projectDescription: `${item.projectName}是祥能面向${project.businessType ?? '综合用工'}打造的标准化用工项目，覆盖招聘、入职、在职服务、结算和离职全流程。`,
      managerName: project.managerName ?? `项目负责人${index + 1}`,
      managerPhone: project.managerPhone ?? `1860000${String(8800 + index).slice(-4)}`,
      imageKey: ['factory', 'warehouse', 'energy'][index % 3]!,
      imageUrl: projectImages[index % projectImages.length]!,
      appliedCount: relevantPeople.length,
      completedCount
    };
  });
}

function createInitialState(): DemoState {
  const people = createInitialPeople();
  const jobs = createInitialJobs(people);
  return {
    jobs,
    people,
    favoriteIds: [jobs[0]?.id ?? ''],
    messages: [
      { id: 'demo-message-1', type: 'application', title: '报名已进入面试安排', content: '祥能智造示范项目已确认您的报名，面试时间为 7 月 28 日 09:30。', targetPath: '/personal/me/applications', isRead: false, createdAt: '2026-07-26T10:30:00.000Z' },
      { id: 'demo-message-2', type: 'payroll', title: '工资条已发布', content: '2026年07月工资条已发布，可进入个人中心查看完整明细。', targetPath: '/personal/me/payroll', isRead: false, createdAt: '2026-07-25T17:20:00.000Z' },
      { id: 'demo-message-3', type: 'referral', title: '推荐奖励已达成', content: '您推荐的员工已满足奖励条件，奖励进入待发放状态。', targetPath: '/personal/referrals', isRead: true, createdAt: '2026-07-24T14:00:00.000Z' },
      { id: 'demo-message-4', type: 'interview', title: '业务处理提醒', content: '当前有 2 条申诉和 1 条借支申请待审核。', targetPath: '/internal/review', isRead: false, createdAt: '2026-07-23T09:00:00.000Z' }
    ],
    referrals: people.slice(0, 3).map((person, index) => ({
      id: `demo-referral-${index + 1}`,
      name: person.name,
      phone: person.phone,
      projectName: person.projectName,
      jobTitle: person.jobTitle,
      status: index === 0 ? 'employed' : index === 1 ? 'interview_passed' : 'registered',
      reward: index === 0 ? 500 : 0,
      rewardStatus: index === 0 ? 'earned' : 'pending',
      createdAt: `2026-07-${String(12 + index).padStart(2, '0')}T09:00:00.000Z`,
      onboardDate: index === 0 ? '2026-07-20' : undefined
    })),
    advances: [
      { id: 'demo-advance-1', name: '张明', phone: '10000000001', amount: 1_000, reason: '家庭临时支出，需要申请借支。', status: 'pending', created_at: '2026-07-24T10:00:00.000Z' },
      { id: 'demo-advance-2', name: '李雪', phone: '10000000002', amount: 800, reason: '交通住宿费用周转。', status: 'resolved', reply: '已通过，随下次付款发放。', created_at: '2026-07-18T10:00:00.000Z' }
    ],
    appeals: [
      { id: 'demo-appeal-1', creatorName: '张明', creatorRole: '个人端', type: 'salary', description: '7月夜班补贴明细需要复核。', requested_amount: 200, status: 'processing', reply: '财务正在核对考勤记录。', created_at: '2026-07-24T11:00:00.000Z' },
      { id: 'demo-appeal-2', creatorName: '演示供应商', creatorRole: '供应商端', type: 'settlement_amount', description: '两名员工在职天数与现场记录不一致。', requested_amount: 1_000, status: 'pending', created_at: '2026-07-25T11:00:00.000Z' }
    ]
  };
}

function loadState(): DemoState {
  try {
    const stored = localStorage.getItem(DEMO_STATE_KEY);
    if (stored) return JSON.parse(stored) as DemoState;
  } catch {
    // 存储不可用时仍保持当前页面可演示。
  }
  return createInitialState();
}

let state = loadState();

function persist(): void {
  try {
    localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用不阻塞演示。
  }
}

function currentSession(): Session | null {
  try {
    const stored = sessionStorage.getItem(DEMO_SESSION_KEY);
    return stored ? JSON.parse(stored) as Session : null;
  } catch {
    return null;
  }
}

function setCurrentSession(session: Session | null): void {
  if (!session) {
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    sessionStorage.removeItem(CORE_TOKEN_KEY);
    return;
  }
  sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  sessionStorage.setItem(CORE_TOKEN_KEY, 'xiangneng-portal-offline-demo');
}

const personas = [
  { id: 'personal', name: '张明', role: 'personal', subtitle: '在职员工 · 个人中心', personStatus: 'employed', avatarSeed: 'employee' },
  { id: 'headquarters', name: '集团领导', role: 'group_leader', subtitle: '集团总部 · 全部数据', avatarSeed: 'leader' },
  { id: 'branch', name: '分公司负责人', role: 'company_manager', subtitle: '演示一分公司 · 权限范围', avatarSeed: 'branch' },
  { id: 'project', name: '项目负责人', role: 'project_manager', subtitle: '项目管理 · 授权项目', avatarSeed: 'project' },
  { id: 'operator', name: '张伟', role: 'site_operator', subtitle: '现场运营 · 授权项目', avatarSeed: 'operator' },
  { id: 'supplier', name: '供应商经理', role: 'supplier', subtitle: 'A级供应商 · 自有人员', avatarSeed: 'supplier' }
] as const;

function sessionForPersona(personaId: string): Session {
  const activePerson = state.people.find((person) => person.status === 'employed') ?? state.people[0]!;
  const firstBranch = source.branches[0]!;
  const firstProjects = source.projects.slice(0, 3).map((project) => project.id);
  const persona = personas.find((item) => item.id === personaId) ?? personas[0];
  if (persona.id === 'personal') {
    return { personaId: persona.id, name: activePerson.name, role: 'personal', subtitle: '在职员工 · 个人中心', personId: activePerson.id, personStatus: 'employed' };
  }
  if (persona.id === 'supplier') {
    const supplier = source.suppliers[0]!;
    return { personaId: persona.id, name: supplier.contactName ?? persona.name, role: 'supplier', subtitle: `${supplier.level ?? 'A'}级供应商 · 自有人员`, supplierId: supplier.id, projectIds: supplier.projectIds ?? [] };
  }
  const role = persona.role as Session['role'];
  return {
    personaId: persona.id,
    name: persona.name,
    role,
    subtitle: persona.subtitle,
    companyId: role === 'company_manager' ? firstBranch.id : undefined,
    projectIds: role === 'group_leader'
      ? source.projects.map((project) => project.id)
      : role === 'company_manager'
        ? source.projects.filter((project) => project.branchId === firstBranch.id).map((project) => project.id)
        : firstProjects
  };
}

function requestBody(init: RequestInit): JsonObject {
  if (typeof init.body !== 'string') return {};
  try {
    return JSON.parse(init.body) as JsonObject;
  } catch {
    return {};
  }
}

function scopedJobs(session: Session | null): Job[] {
  if (!session || session.role === 'personal' || session.role === 'group_leader') return state.jobs;
  if (session.role === 'supplier') return state.jobs.filter((job) => session.projectIds?.includes(job.project_id));
  return state.jobs.filter((job) => session.projectIds?.includes(job.project_id));
}

function scopedPeople(session: Session | null): Person[] {
  if (!session) return [];
  if (session.role === 'personal') return state.people.filter((person) => person.id === session.personId);
  if (session.role === 'supplier') return state.people.filter((person) => person.supplierId === session.supplierId);
  if (session.role === 'group_leader') return state.people;
  return state.people.filter((person) => session.projectIds?.includes(person.projectId));
}

function queryJobs(url: URL, session: Session | null): Job[] {
  const query = (url.searchParams.get('query') ?? '').toLowerCase();
  const type = url.searchParams.get('jobType') ?? '';
  const region = url.searchParams.get('region') ?? '';
  const projectId = url.searchParams.get('projectId') ?? '';
  const status = url.searchParams.get('status') ?? '';
  const salary = url.searchParams.get('salary') ?? '';
  const [salaryMinimum, salaryMaximumText] = salary.split('-');
  const salaryMaximum = Number(salaryMaximumText || Number.MAX_SAFE_INTEGER);
  return scopedJobs(session).filter((job) =>
    (!query || `${job.title} ${job.projectName} ${job.address}`.toLowerCase().includes(query)) &&
    (!type || job.type.includes(type)) &&
    (!region || job.region === region) &&
    (!projectId || job.project_id === projectId) &&
    (!status || job.status === status) &&
    (!salary || job.salary_max >= Number(salaryMinimum || 0) && job.salary_min <= salaryMaximum)
  );
}

function queryPeople(url: URL, session: Session | null): Person[] {
  const query = (url.searchParams.get('query') ?? '').toLowerCase();
  const status = url.searchParams.get('status') ?? '';
  const projectId = url.searchParams.get('projectId') ?? '';
  const supplierId = url.searchParams.get('supplierId') ?? '';
  const jobId = url.searchParams.get('jobId') ?? '';
  const interviewFrom = url.searchParams.get('interviewFrom') ?? '';
  const interviewTo = url.searchParams.get('interviewTo') ?? '';
  return scopedPeople(session).filter((person) => {
    const interviewDate = person.interviewAt?.slice(0, 10) ?? '';
    return (!query || `${person.name} ${person.phone} ${person.idCard}`.toLowerCase().includes(query)) &&
      (!status || person.status === status) &&
      (!projectId || person.projectId === projectId) &&
      (!supplierId || person.supplierId === supplierId) &&
      (!jobId || person.jobId === jobId) &&
      (!interviewFrom || interviewDate >= interviewFrom) &&
      (!interviewTo || interviewDate <= interviewTo);
  });
}

function createDemoPerson(input: JsonObject, status = 'arrived'): Person {
  const job = state.jobs.find((item) => item.id === input.jobId) ?? state.jobs[0]!;
  const createdAt = new Date().toISOString();
  const person: Person = {
    id: `portal-person-${Date.now()}`,
    name: String(input.name ?? '新报名人员'),
    phone: String(input.phone ?? ''),
    idCard: String(input.idCard ?? ''),
    gender: '未填写',
    age: 0,
    origin: '现场报名',
    projectId: String(input.projectId ?? job.project_id),
    projectName: job.projectName,
    companyId: source.projects.find((project) => project.id === job.project_id)?.branchId,
    jobId: job.id,
    jobTitle: job.title,
    supplierId: input.supplierId ? String(input.supplierId) : null,
    supplierName: source.suppliers.find((supplier) => supplier.id === input.supplierId)?.name ?? null,
    status,
    appliedAt: createdAt,
    interviewAt: createdAt,
    onboardDate: null,
    departureDate: null,
    insuranceStatus: '待办理',
    employmentDays: 0,
    lifecycle: [
      { id: `life-${Date.now()}-arrived`, status, occurredAt: createdAt, note: '现场快捷报名并同步到人员列表' },
      { id: `life-${Date.now()}-registered`, status: 'registered', occurredAt: createdAt, note: '建立人员主档' }
    ]
  };
  state.people = [person, ...state.people];
  persist();
  return person;
}

function dashboard(url: URL, session: Session | null) {
  const companyId = url.searchParams.get('companyId') ?? '';
  const projectId = url.searchParams.get('projectId') ?? '';
  const period = url.searchParams.get('period') ?? '2026-07';
  const people = scopedPeople(session).filter((person) =>
    (!companyId || person.companyId === companyId) && (!projectId || person.projectId === projectId)
  );
  const jobs = scopedJobs(session).filter((job) =>
    (!companyId || source.projects.find((project) => project.id === job.project_id)?.branchId === companyId) &&
    (!projectId || job.project_id === projectId)
  );
  const active = people.filter((person) => person.status === 'employed').length;
  const onboarded = people.filter((person) => person.onboardDate?.startsWith(period)).length;
  const departed = people.filter((person) => person.departureDate?.startsWith(period)).length;
  const grouped = new Map<string, Job[]>();
  jobs.forEach((job) => grouped.set(job.project_id, [...(grouped.get(job.project_id) ?? []), job]));
  const projects = [...grouped.entries()].map(([id, items]) => {
    const demand = items.reduce((sum, item) => sum + item.headcount, 0);
    const completed = items.reduce((sum, item) => sum + Number(item.completedCount), 0);
    return { id, name: items[0]?.projectName ?? '项目', demand, completed, gap: Math.max(0, demand - completed), progress: demand ? Math.min(100, Math.round(completed / demand * 100)) : 0 };
  });
  return {
    metrics: {
      employedCount: active,
      onboardedCount: onboarded,
      departedCount: departed,
      netChange: onboarded - departed,
      vacancy: projects.reduce((sum, project) => sum + project.gap, 0)
    },
    projects
  };
}

function payroll() {
  return [
    { id: 'payroll-2026-07', month: '2026-07', gross: 6_420, net: 5_738, details: { 基本工资: 5_200, 加班工资: 680, 岗位津贴: 300, 餐费补贴: 240, 社保扣款: -502, 其他扣款: -180 }, publishedAt: '2026-07-25T09:00:00.000Z' },
    { id: 'payroll-2026-06', month: '2026-06', gross: 6_180, net: 5_566, details: { 基本工资: 5_200, 加班工资: 520, 岗位津贴: 300, 餐费补贴: 160, 社保扣款: -494, 其他扣款: -120 }, publishedAt: '2026-06-25T09:00:00.000Z' }
  ];
}

function settlement(session: Session | null, month: string) {
  const supplierPeople = scopedPeople(session).filter((person) => person.status === 'employed' || person.status === 'departed');
  const items = supplierPeople.map((person, index) => {
    const days = person.employmentDays ?? 0;
    const dueAmount = days >= 30 ? 500 : Math.round(days / 30 * 500);
    return {
      id: `settlement-${person.id}`,
      name: person.name,
      phone: person.phone,
      projectName: person.projectName,
      jobTitle: person.jobTitle,
      onboardDate: person.onboardDate ?? '—',
      employmentDays: days,
      policy: 'A级供应商：入职满30天且在职奖励500元',
      dueAmount,
      actualAmount: index % 4 === 3 ? 0 : dueAmount,
      status: index % 4 === 3 ? 'disputed' : index % 3 === 0 ? 'confirmed' : 'pending'
    };
  });
  const dueAmount = items.reduce((sum, item) => sum + item.dueAmount, 0);
  const confirmedAmount = items.filter((item) => item.status === 'confirmed').reduce((sum, item) => sum + item.actualAmount, 0);
  const disputedAmount = items.filter((item) => item.status === 'disputed').reduce((sum, item) => sum + item.dueAmount, 0);
  return {
    id: `demo-settlement-${month}`,
    month,
    status: items.some((item) => item.status === 'pending') ? 'pending' : 'confirmed',
    overview: { dueAmount, confirmedAmount, pendingAmount: Math.max(0, dueAmount - confirmedAmount - disputedAmount), disputedAmount },
    items
  };
}

function auditLogs() {
  return [
    { id: 'audit-1', actorName: '张伟', action: '修改人员状态', entityType: '人员档案', detail: '张明：面试通过 → 已入职', created_at: '2026-07-26T15:20:00.000Z' },
    { id: 'audit-2', actorName: '分公司负责人', action: '发布岗位', entityType: '招聘需求', detail: '祥能智造示范项目 · 操作工 8人', created_at: '2026-07-26T14:10:00.000Z' },
    { id: 'audit-3', actorName: '供应商经理', action: '提交申诉', entityType: '结算申诉', detail: '在职天数差异复核', created_at: '2026-07-25T11:00:00.000Z' }
  ];
}

type PortalAiAction = {
  id: string;
  token: string;
  expiresAt: number;
  type: 'entry' | 'resignation';
  personId: string;
  date: string;
  reason?: string;
  result?: JsonObject;
};

const portalAiActions = new Map<string, PortalAiAction>();
const portalAiIdempotency = new Map<string, JsonObject>();

function aiText(value: unknown): string {
  return String(value ?? '').trim();
}

function aiDate(message: string): string {
  const match = message.match(/(20\d{2})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/);
  return match ? `${match[1]}-${match[2]!.padStart(2, '0')}-${(match[3] ?? '26').padStart(2, '0')}` : '2026-07-26';
}

function aiPeople(message: string, parameters: JsonObject, session: Session | null): Person[] {
  const candidates = scopedPeople(session);
  const employeeId = aiText(parameters.employee_id ?? parameters.employeeId);
  if (employeeId) return candidates.filter((person) => person.id === employeeId || person.employeeNo === employeeId);
  const named = aiText(parameters.employee_name ?? parameters.name);
  if (named) return candidates.filter((person) => person.name === named);
  const exact = candidates.filter((person) => message.includes(person.name));
  if (exact.length) return exact;
  const phone = message.match(/1\d{10}|\d{4}$/)?.[0] ?? aiText(parameters.phone ?? parameters.phone_suffix);
  return phone ? candidates.filter((person) => person.phone.includes(phone) || person.employeeNo?.includes(phone)) : [];
}

function aiProject(message: string, session: Session | null): Job | undefined {
  const jobs = scopedJobs(session);
  const exact = jobs.find((job) => message.includes(job.projectName));
  if (exact) return exact;
  const normalized = message.replace(/[\s，。；、？！,.!?：:（）()]/g, '');
  return jobs
    .map((job) => {
      const token = job.projectName.replace(/项目|外包|招聘|服务/g, '');
      return { job, score: token && normalized.includes(token) ? token.length : 0 };
    })
    .sort((a, b) => b.score - a.score)
    .find((item) => item.score >= 2)?.job;
}

function portalEmployee(person: Person): JsonObject {
  return {
    employee_id: person.id,
    employee_no: person.employeeNo,
    name: person.name,
    phone: person.phone,
    id_card: person.idCard,
    status: person.status,
    project: { id: person.projectId, name: person.projectName },
    position_name: person.jobTitle,
    onboard_date: person.onboardDate,
    offboard_date: person.departureDate,
    supplier: person.supplierId ? { id: person.supplierId, name: person.supplierName } : undefined,
    recommender_name: person.recommenderName,
    lifecycle: person.lifecycle ?? []
  };
}

function portalPersonnelStatistics(message: string, session: Session | null): JsonObject {
  const matchedJob = aiProject(message, session);
  const jobs = scopedJobs(session).filter((job) => !matchedJob || job.project_id === matchedJob.project_id);
  const projectIds = [...new Set(jobs.map((job) => job.project_id))];
  const people = scopedPeople(session).filter((person) => projectIds.includes(person.projectId));
  const rows = projectIds.map((projectId) => {
    const related = people.filter((person) => person.projectId === projectId);
    const job = jobs.find((item) => item.project_id === projectId);
    const hireCount = related.filter((person) => person.onboardDate?.startsWith('2026-07')).length;
    const resignationCount = related.filter((person) => person.departureDate?.startsWith('2026-07')).length;
    const currentHeadcount = related.filter((person) => person.status === 'employed' && !person.departureDate).length;
    return {
      period: '2026-07',
      project_id: projectId,
      project_name: job?.projectName ?? related[0]?.projectName ?? '未分配项目',
      branch_name: job?.companyName ?? '祥能分公司',
      hire_count: hireCount,
      resignation_count: resignationCount,
      current_headcount: currentHeadcount,
      net_change: hireCount - resignationCount
    };
  });
  const totals = rows.reduce((sum, row) => ({
    hire_count: sum.hire_count + row.hire_count,
    resignation_count: sum.resignation_count + row.resignation_count,
    current_headcount: sum.current_headcount + row.current_headcount,
    net_change: sum.net_change + row.net_change
  }), { hire_count: 0, resignation_count: 0, current_headcount: 0, net_change: 0 });
  return {
    type: 'query_result',
    skill: 'project_personnel_statistics',
    route_type: 'demo_retrieval',
    confidence: 1,
    result: {
      rows,
      totals,
      methodology: '本月入离职按人员主档日期统计；当前在职按人员状态为在职且无离职日期统计。',
      updated_at: new Date().toISOString()
    }
  };
}

function portalRecruitmentProgress(message: string, session: Session | null): JsonObject {
  const matchedJob = aiProject(message, session);
  const jobs = scopedJobs(session).filter((job) =>
    job.status === 'recruiting' &&
    (!matchedJob || job.project_id === matchedJob.project_id) &&
    (!message.includes('岗位') || !state.jobs.some((item) => message.includes(item.title)) || message.includes(job.title))
  );
  const rows = jobs.map((job) => ({
    job_id: job.id,
    project_name: job.projectName,
    position_name: job.title,
    demand_count: job.headcount,
    completed_count: Number(job.completedCount),
    registered_count: Number(job.appliedCount),
    gap: Math.max(0, job.headcount - Number(job.completedCount)),
    completion_rate: job.headcount ? Math.min(100, Math.round(Number(job.completedCount) / job.headcount * 1000) / 10) : 0,
    deadline: job.deadline,
    status: job.status
  })).sort((a, b) => b.gap - a.gap);
  const totals = rows.reduce((sum, row) => ({
    demand_count: sum.demand_count + row.demand_count,
    completed_count: sum.completed_count + row.completed_count,
    gap: sum.gap + row.gap
  }), { demand_count: 0, completed_count: 0, gap: 0 });
  return {
    type: 'query_result',
    skill: 'recruitment_progress_query',
    route_type: 'demo_retrieval',
    confidence: 1,
    result: {
      rows,
      totals: {
        ...totals,
        completion_rate: totals.demand_count ? Math.min(100, Math.round(totals.completed_count / totals.demand_count * 1000) / 10) : 0
      },
      methodology: '需求、完成和缺口来自当前招聘岗位；完成率按完成人数除以需求人数计算。',
      updated_at: new Date().toISOString()
    }
  };
}

function portalKnowledge(message: string, session: Session | null): JsonObject | null {
  const matchedJob = aiProject(message, session);
  const jobs = scopedJobs(session);
  const wantsOverview = /系统|总览|概况|多少项目|多少人员|多少岗位/.test(message);
  const wantsProject = Boolean(matchedJob) || /项目|负责人|地址|介绍/.test(message);
  const wantsJobs = /岗位|职责|要求|薪资|工作时间|工作内容/.test(message);
  const wantsSupplier = /供应商|合作方|联系人/.test(message);
  if (!wantsOverview && !wantsProject && !wantsJobs && !wantsSupplier) return null;
  const records: JsonObject[] = [];
  if (wantsOverview) records.push({
    type: 'system',
    title: '当前权限数据总览',
    fields: { 项目数: new Set(jobs.map((job) => job.project_id)).size, 人员数: scopedPeople(session).length, 岗位数: jobs.length, 供应商数: session?.role === 'supplier' ? 1 : source.suppliers.length }
  });
  if (wantsProject) {
    const selected = matchedJob ? jobs.filter((job) => job.project_id === matchedJob.project_id).slice(0, 1) : jobs.filter((job, index, all) => all.findIndex((item) => item.project_id === job.project_id) === index).slice(0, 12);
    selected.forEach((job) => records.push({
      type: 'project',
      title: job.projectName,
      fields: { 分公司: job.companyName, 负责人: job.managerName, 联系电话: job.managerPhone, 项目地址: job.address, 项目介绍: job.projectDescription }
    }));
  }
  if (wantsJobs) {
    jobs.filter((job) => !matchedJob || job.project_id === matchedJob.project_id).slice(0, 20).forEach((job) => records.push({
      type: 'job',
      title: job.title,
      fields: { 项目: job.projectName, 需求人数: job.headcount, 薪资: `${job.salary_min}-${job.salary_max}元/月`, 工作时间: job.work_time, 工作地点: job.address, 岗位职责: job.duties, 岗位要求: job.requirements, 福利待遇: job.benefits, 截止日期: job.deadline }
    }));
  }
  if (wantsSupplier) {
    const suppliers = session?.role === 'supplier'
      ? source.suppliers.filter((supplier) => supplier.id === session.supplierId)
      : source.suppliers.filter((supplier) => message.includes(supplier.name) || !source.suppliers.some((item) => message.includes(item.name))).slice(0, 20);
    suppliers.forEach((supplier) => records.push({
      type: 'supplier',
      title: supplier.name,
      fields: { 联系人: supplier.contactName ?? '供应商经理', 联系电话: supplier.contactPhone ?? '0831-8881234', 合作等级: supplier.level ?? 'A', 合作项目数: supplier.projectIds?.length ?? 0 }
    }));
  }
  if (!records.length) return null;
  return {
    type: 'knowledge_result',
    answer: records.slice(0, 4).map((record) => `${record.title}：${Object.entries(record.fields as JsonObject).slice(0, 4).map(([key, value]) => `${key}${value}`).join('，')}`).join('；'),
    result: {
      records,
      methodology: '仅检索当前登录角色可访问的小程序演示业务状态；正式环境由后端权限过滤并交给本地Qwen组织答案。',
      updated_at: new Date().toISOString()
    },
    route_type: 'demo_retrieval',
    confidence: 1
  };
}

function portalActionPreview(type: PortalAiAction['type'], message: string, parameters: JsonObject, session: Session | null): JsonObject {
  const matches = aiPeople(message, parameters, session);
  if (matches.length > 1) return {
    type: 'query_result',
    skill: 'employee_information_query',
    result: {
      match: 'ambiguous',
      candidates: matches.slice(0, 12).map((person) => ({ employee_id: person.id, name: person.name, phone: person.phone, project_name: person.projectName, position_name: person.jobTitle }))
    }
  };
  const person = matches[0];
  if (!person) return { type: 'clarification', skill: type === 'entry' ? 'employee_entry' : 'employee_resignation', message: '请补充唯一人员姓名、手机号或员工编号。', extracted_parameters: parameters };
  if (type === 'entry' && person.status === 'employed' && !person.departureDate) return { type: 'clarification', skill: 'employee_entry', message: `${person.name}当前已在职，不能重复办理入职。` };
  if (type === 'resignation' && (person.status !== 'employed' || person.departureDate)) return { type: 'clarification', skill: 'employee_resignation', message: `${person.name}当前不是在职状态，不能办理离职。` };
  const date = aiText(parameters.entry_date ?? parameters.resignation_date) || aiDate(message);
  const reason = aiText(parameters.resignation_reason) || message.match(/原因(?:是|为|：|:)?\s*([^，。；;]+)/)?.[1] || '个人原因';
  const action: PortalAiAction = {
    id: crypto.randomUUID(),
    token: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', ''),
    expiresAt: Date.now() + 10 * 60_000,
    type,
    personId: person.id,
    date,
    reason
  };
  portalAiActions.set(action.id, action);
  return {
    type: 'action_preview',
    skill: type === 'entry' ? 'employee_entry' : 'employee_resignation',
    route_type: 'demo_rule',
    preview: {
      action_id: action.id,
      action_token: action.token,
      expires_at: new Date(action.expiresAt).toISOString(),
      confirmation_required: true,
      person: { employee_id: person.id, name: person.name, phone: person.phone, project_name: person.projectName, position_name: person.jobTitle },
      before: { status: person.status, onboardDate: person.onboardDate, offboardDate: person.departureDate },
      after: type === 'entry'
        ? { status: 'employed', onboardDate: date, projectId: person.projectId, jobTitle: person.jobTitle }
        : { status: 'departed', offboardDate: date, offboardReason: reason },
      impact_scope: ['人员主档', '生命周期', '招聘进度', '统计看板', '审计日志']
    }
  };
}

function portalAiRequest(method: string, pathname: string, body: JsonObject, session: Session | null): JsonObject | null {
  if (method === 'GET' && pathname === '/api/ai/health') return {
    status: 'degraded',
    database: 'demo_snapshot',
    model: 'backend_required',
    model_name: 'Qwen3.5 4B',
    rules: 'ok',
    retrieval: 'ok',
    allowed_skills: ['project_personnel_statistics', 'employee_information_query', 'recruitment_progress_query', 'employee_entry', 'employee_resignation'],
    form_fallback_available: true,
    checked_at: new Date().toISOString()
  };
  if (method === 'POST' && pathname === '/api/ai/chat') {
    const message = aiText(body.message);
    const parameters = (body.parameters && typeof body.parameters === 'object' ? body.parameters : {}) as JsonObject;
    if (/(?:给|为|让).{1,20}(?:办理|确认|执行)?.{0,6}入职/.test(message) && !/什么时候入职|入职时间|入职日期|入职多少|入职数/.test(message)) return portalActionPreview('entry', message, parameters, session);
    if (/(?:给|为|让).{1,20}(?:办理|确认|执行)?.{0,6}(?:离职|离岗)/.test(message) && !/什么时候离职|离职时间|离职日期|离职多少|离职数/.test(message)) return portalActionPreview('resignation', message, parameters, session);
    const matches = aiPeople(message, parameters, session);
    if (matches.length > 1) return {
      type: 'query_result',
      skill: 'employee_information_query',
      result: { match: 'ambiguous', candidates: matches.slice(0, 12).map((person) => ({ employee_id: person.id, name: person.name, phone: person.phone, project_name: person.projectName, position_name: person.jobTitle })) }
    };
    if (matches.length === 1) return {
      type: 'query_result',
      skill: 'employee_information_query',
      route_type: 'demo_retrieval',
      confidence: 1,
      result: { match: 'unique', employee: portalEmployee(matches[0]!), methodology: '按当前权限范围内的人员主档和生命周期实时查询。', updated_at: new Date().toISOString() }
    };
    if (/招聘|招人|缺口|完成率|达成|还差|需求人数/.test(message)) return portalRecruitmentProgress(message, session);
    if (/在职|入职数|离职数|入职.*离职|净增|净减|人员数据|人员统计/.test(message)) return portalPersonnelStatistics(message, session);
    const knowledge = portalKnowledge(message, session);
    if (knowledge) return knowledge;
    if (/你好|你是谁|能做什么|有什么功能|帮助/.test(message)) return {
      type: 'chat_result',
      message: '我是祥能AI业务助手，可自由查询权限范围内的人员、项目、岗位、供应商和招聘数据，也可对单人入职、离职先生成预览再确认执行。',
      route_type: 'demo_fast_path',
      model: 'rule+retrieval',
      degraded: true
    };
    return { type: 'clarification', skill: 'employee_information_query', message: '请补充人员姓名/手机号、项目名称、岗位或供应商名称，我会继续检索。', extracted_parameters: parameters, standard_form_available: true };
  }
  if (method === 'POST' && pathname === '/api/ai/actions/confirm') {
    const idempotencyKey = aiText(body.idempotencyKey);
    const previous = portalAiIdempotency.get(idempotencyKey);
    if (previous) return previous;
    const action = portalAiActions.get(aiText(body.actionId));
    if (!action || action.token !== aiText(body.actionToken)) throw new Error('操作预览不存在或令牌无效，请重新生成');
    if (action.expiresAt < Date.now()) throw new Error('操作预览已过期，请重新生成');
    if (action.result) return action.result;
    const person = state.people.find((item) => item.id === action.personId);
    if (!person) throw new Error('人员不存在');
    if (action.type === 'entry' && person.status === 'employed' && !person.departureDate) throw new Error('人员状态已变化，请重新生成预览');
    if (action.type === 'resignation' && (person.status !== 'employed' || person.departureDate)) throw new Error('人员状态已变化，请重新生成预览');
    const now = new Date().toISOString();
    const updated: Person = {
      ...person,
      status: action.type === 'entry' ? 'employed' : 'departed',
      onboardDate: action.type === 'entry' ? action.date : person.onboardDate,
      departureDate: action.type === 'resignation' ? action.date : person.departureDate,
      insuranceStatus: action.type === 'entry' ? '已办理' : person.insuranceStatus,
      lifecycle: [{
        id: `life-ai-${Date.now()}`,
        status: action.type === 'entry' ? 'employed' : 'departed',
        occurredAt: now,
        note: action.type === 'entry' ? '祥能AI业务助手确认办理入职' : `祥能AI业务助手确认办理离职：${action.reason}`
      }, ...(person.lifecycle ?? [])]
    };
    state.people = state.people.map((item) => item.id === person.id ? updated : item);
    persist();
    action.result = { type: 'action_result', status: 'EXECUTED', action_id: action.id, person: portalEmployee(updated), executed_at: now, audited: true, idempotent: true };
    if (idempotencyKey) portalAiIdempotency.set(idempotencyKey, action.result);
    return action.result;
  }
  if (method === 'POST' && pathname === '/api/ai/demo/reset') {
    portalAiActions.clear();
    portalAiIdempotency.clear();
    resetPortalDemo();
    return { ok: true, restored_people: state.people.length };
  }
  return null;
}

export function resetPortalDemo(): void {
  state = createInitialState();
  portalAiActions.clear();
  portalAiIdempotency.clear();
  persist();
}

export async function handlePortalDemoRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(path, 'http://xiangneng.demo');
  const pathname = url.pathname;
  const body = requestBody(init);
  const session = currentSession();
  const aiResponse = portalAiRequest(method, pathname, body, session);
  if (aiResponse) return aiResponse as T;

  if (method === 'GET' && pathname === '/api/personas') return personas as T;
  if (method === 'POST' && pathname === '/api/session/select-persona') {
    const next = sessionForPersona(String(body.personaId ?? 'personal'));
    setCurrentSession(next);
    return next as T;
  }
  if (pathname === '/api/session' && method === 'DELETE') {
    setCurrentSession(null);
    return { ok: true } as T;
  }
  if (pathname === '/api/session' && method === 'GET') return session as T;
  if (method === 'GET' && pathname === '/api/catalog') {
    const visibleJobs = scopedJobs(session);
    const visibleProjectIds = new Set(visibleJobs.map((job) => job.project_id));
    const visiblePeople = scopedPeople(session);
    const visibleSupplierIds = new Set(visiblePeople.map((person) => person.supplierId).filter(Boolean));
    const projects = source.projects.filter((project) => visibleProjectIds.has(project.id));
    const companyIds = new Set(projects.map((project) => project.branchId));
    const suppliers = session?.role === 'supplier'
      ? source.suppliers.filter((supplier) => supplier.id === session.supplierId)
      : session?.role === 'group_leader' || session?.role === 'personal'
        ? source.suppliers
        : source.suppliers.filter((supplier) => visibleSupplierIds.has(supplier.id));
    return {
      companies: source.branches.filter((branch) => companyIds.has(branch.id)).map((branch) => ({ id: branch.id, name: branch.name })),
      projects: projects.map((project, index) => ({ id: project.id, name: project.name, companyId: project.branchId, region: state.jobs.find((job) => job.project_id === project.id)?.region ?? ['四川省宜宾市', '四川省泸州市', '四川省成都市'][index % 3] })),
      suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))
    } as T;
  }
  if (method === 'GET' && pathname === '/api/dashboard') return dashboard(url, session) as T;
  if (method === 'GET' && pathname === '/api/jobs') return queryJobs(url, session) as T;
  if (method === 'GET' && /^\/api\/jobs\/[^/]+$/.test(pathname)) {
    const jobId = pathname.split('/').at(-1);
    return state.jobs.find((job) => job.id === jobId) as T;
  }
  if (method === 'POST' && pathname === '/api/jobs') {
    const project = source.projects.find((item) => item.id === body.projectId) ?? source.projects[0]!;
    const job: Job = {
      ...state.jobs[0]!,
      id: `portal-job-${Date.now()}`,
      project_id: project.id,
      projectName: project.name,
      companyName: project.branchName,
      title: String(body.title ?? '新岗位'),
      type: String(body.title ?? '综合岗位'),
      headcount: Number(body.headcount ?? 1),
      salary_min: Number(body.salaryMin ?? 4_500),
      salary_max: Number(body.salaryMax ?? 6_000),
      deadline: String(body.deadline ?? '2026-08-31'),
      status: 'recruiting',
      appliedCount: 0,
      completedCount: 0,
      created_at: new Date().toISOString()
    };
    state.jobs = [job, ...state.jobs];
    persist();
    return job as T;
  }
  if (method === 'PATCH' && /^\/api\/jobs\/[^/]+$/.test(pathname)) {
    const jobId = pathname.split('/').at(-1);
    const previous = state.jobs.find((job) => job.id === jobId);
    if (!previous) throw new Error('岗位不存在');
    const next: Job = {
      ...previous,
      title: String(body.title ?? previous.title),
      headcount: Number(body.headcount ?? previous.headcount),
      salary_min: Number(body.salaryMin ?? previous.salary_min),
      salary_max: Number(body.salaryMax ?? previous.salary_max),
      deadline: String(body.deadline ?? previous.deadline),
      work_time: String(body.workTime ?? previous.work_time),
      requirements: String(body.requirements ?? previous.requirements),
      supplier_policy: String(body.supplierPolicy ?? previous.supplier_policy),
      referral_policy: String(body.referralPolicy ?? previous.referral_policy),
      settlement_condition: String(body.settlementCondition ?? previous.settlement_condition),
      status: String(body.status ?? previous.status)
    };
    state.jobs = state.jobs.map((job) => job.id === jobId ? next : job);
    persist();
    return next as T;
  }
  if (method === 'POST' && /^\/api\/jobs\/[^/]+\/apply$/.test(pathname)) {
    const jobId = pathname.split('/')[3];
    const job = state.jobs.find((item) => item.id === jobId);
    state.messages = [{
      id: `message-${Date.now()}`,
      type: 'application',
      title: '报名提交成功',
      content: `已报名 ${job?.projectName ?? ''} · ${job?.title ?? ''}，请留意面试通知。`,
      targetPath: '/personal/me/applications',
      isRead: false,
      createdAt: new Date().toISOString()
    }, ...state.messages];
    persist();
    return { ok: true } as T;
  }
  if (method === 'GET' && pathname === '/api/people') return queryPeople(url, session) as T;
  if (method === 'GET' && /^\/api\/people\/[^/]+$/.test(pathname)) {
    const personId = pathname.split('/').at(-1);
    return scopedPeople(session).find((person) => person.id === personId) as T;
  }
  if (method === 'POST' && pathname === '/api/people/on-site') return createDemoPerson(body) as T;
  if (method === 'PATCH' && /^\/api\/people\/[^/]+\/status$/.test(pathname)) {
    const personId = pathname.split('/')[3];
    const previous = state.people.find((person) => person.id === personId);
    if (!previous) throw new Error('人员不存在');
    const status = String(body.status ?? previous.status);
    const occurredAt = new Date().toISOString();
    const next: Person = {
      ...previous,
      status,
      interviewAt: status.startsWith('interview_') ? String(body.interviewTime ?? occurredAt) : previous.interviewAt,
      onboardDate: status === 'employed' ? String(body.onboardDate ?? occurredAt.slice(0, 10)) : previous.onboardDate,
      departureDate: status === 'departed' ? String(body.departureDate ?? occurredAt.slice(0, 10)) : previous.departureDate,
      insuranceStatus: status === 'employed' ? String(body.insuranceStatus ?? '已办理') : previous.insuranceStatus,
      lifecycle: [{ id: `life-${Date.now()}`, status, occurredAt, note: String(body.note ?? '现场运营修改状态') }, ...(previous.lifecycle ?? [])]
    };
    state.people = state.people.map((person) => person.id === personId ? next : person);
    persist();
    return next as T;
  }
  if (method === 'GET' && pathname === '/api/favorites') return state.jobs.filter((job) => state.favoriteIds.includes(job.id)) as T;
  if (method === 'PUT' && /^\/api\/favorites\/[^/]+$/.test(pathname)) {
    const jobId = pathname.split('/').at(-1) ?? '';
    const favorite = !state.favoriteIds.includes(jobId);
    state.favoriteIds = favorite ? [...state.favoriteIds, jobId] : state.favoriteIds.filter((id) => id !== jobId);
    persist();
    return { favorite } as T;
  }
  if (method === 'GET' && pathname === '/api/messages') return state.messages as T;
  if (method === 'PATCH' && pathname === '/api/messages/read-all') {
    state.messages = state.messages.map((message) => ({ ...message, isRead: true }));
    persist();
    return { ok: true } as T;
  }
  if (method === 'PATCH' && /^\/api\/messages\/[^/]+\/read$/.test(pathname)) {
    const messageId = pathname.split('/')[3];
    state.messages = state.messages.map((message) => message.id === messageId ? { ...message, isRead: true } : message);
    persist();
    return { ok: true } as T;
  }
  if (method === 'GET' && pathname === '/api/referrals') return state.referrals as T;
  if (method === 'POST' && pathname === '/api/referrals') {
    const job = state.jobs.find((item) => item.id === body.jobId) ?? state.jobs[0]!;
    const referral: Referral = {
      id: `referral-${Date.now()}`,
      name: String(body.name ?? '被推荐人'),
      phone: String(body.phone ?? ''),
      projectName: job.projectName,
      jobTitle: job.title,
      status: 'registered',
      reward: 0,
      rewardStatus: 'pending',
      createdAt: new Date().toISOString()
    };
    state.referrals = [referral, ...state.referrals];
    persist();
    return referral as T;
  }
  if (method === 'GET' && pathname === '/api/payroll') return payroll() as T;
  if (method === 'GET' && pathname === '/api/advances') return state.advances as T;
  if (method === 'POST' && pathname === '/api/advances') {
    const record: Advance = { id: `advance-${Date.now()}`, name: session?.name ?? '申请人', phone: scopedPeople(session)[0]?.phone ?? '', amount: Number(body.amount ?? 0), reason: String(body.reason ?? ''), status: 'pending', created_at: new Date().toISOString() };
    state.advances = [record, ...state.advances];
    persist();
    return record as T;
  }
  if (method === 'PATCH' && /^\/api\/advances\/[^/]+$/.test(pathname)) {
    const recordId = pathname.split('/').at(-1);
    state.advances = state.advances.map((record) => record.id === recordId ? { ...record, status: String(body.decision ?? 'resolved'), reply: String(body.reply ?? '') } : record);
    persist();
    return state.advances.find((record) => record.id === recordId) as T;
  }
  if (method === 'GET' && pathname === '/api/appeals') return state.appeals as T;
  if (method === 'POST' && pathname === '/api/appeals') {
    const record: Appeal = { id: `appeal-${Date.now()}`, creatorName: session?.name ?? '申请人', creatorRole: session?.role ?? 'personal', type: String(body.type ?? 'other'), description: String(body.description ?? ''), requested_amount: body.requestedAmount ? Number(body.requestedAmount) : undefined, status: 'pending', created_at: new Date().toISOString() };
    state.appeals = [record, ...state.appeals];
    persist();
    return record as T;
  }
  if (method === 'PATCH' && /^\/api\/appeals\/[^/]+\/resolve$/.test(pathname)) {
    const recordId = pathname.split('/')[3];
    state.appeals = state.appeals.map((record) => record.id === recordId ? { ...record, status: String(body.decision ?? 'resolved'), reply: String(body.reply ?? '') } : record);
    persist();
    return state.appeals.find((record) => record.id === recordId) as T;
  }
  if (method === 'POST' && pathname === '/api/attachments') return { id: `attachment-${Date.now()}`, originalName: '演示上传凭证.pdf' } as T;
  if (method === 'GET' && pathname === '/api/settlements') return settlement(session, url.searchParams.get('month') ?? '2026-07') as T;
  if (method === 'POST' && /^\/api\/settlements\/[^/]+\/confirm$/.test(pathname)) return { ok: true } as T;
  if (method === 'GET' && pathname === '/api/supplier/profile') {
    const supplier = source.suppliers.find((item) => item.id === session?.supplierId) ?? source.suppliers[0]!;
    return { id: supplier.id, name: supplier.name, contact: supplier.contactName ?? session?.name ?? '供应商经理', phone: supplier.contactPhone ?? '0831-8881234', grade: `${supplier.level ?? 'A'}级供应商`, projectCount: supplier.projectIds?.length ?? 0, monthlyPeople: scopedPeople(session).length } as T;
  }
  if (method === 'POST' && pathname === '/api/qrcodes') {
    const job = state.jobs.find((item) => item.id === body.jobId) ?? state.jobs[0]!;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 86_400_000);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="white"/><rect x="20" y="20" width="280" height="280" rx="20" fill="#eef5ff" stroke="#1769f7" stroke-width="8"/><text x="160" y="130" text-anchor="middle" font-size="24" font-family="Microsoft YaHei">祥能现场报名</text><text x="160" y="175" text-anchor="middle" font-size="18" font-family="Microsoft YaHei">${job.title}</text><text x="160" y="220" text-anchor="middle" font-size="14" font-family="Microsoft YaHei">24小时有效</text></svg>`;
    return { dataUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), signupUrl: `/scan/demo-${job.id}` } as T;
  }
  if (method === 'GET' && /^\/api\/qrcodes\/[^/]+$/.test(pathname)) {
    const job = state.jobs[0]!;
    return { token: pathname.split('/').at(-1), projectId: job.project_id, projectName: job.projectName, jobId: job.id, jobTitle: job.title, interviewDate: '2026-07-28', source: '现场扫码报名', expiresAt: '2026-07-28T23:59:59.000Z' } as T;
  }
  if (method === 'POST' && /^\/api\/qrcodes\/[^/]+\/register$/.test(pathname)) return createDemoPerson({ ...body, jobId: state.jobs[0]?.id, projectId: state.jobs[0]?.project_id }, 'registered') as T;
  if (method === 'GET' && pathname === '/api/audit-logs') return auditLogs() as T;

  throw new Error(`离线演示暂未覆盖 ${method} ${pathname}`);
}
