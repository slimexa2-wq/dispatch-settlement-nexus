export type SyntheticDemoData = {
  meta: {
    synthetic: true;
    seed: number;
    generatedFor: "public-demo";
    schemaVersion: 1;
  };
  branches: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  suppliers: Array<Record<string, unknown>>;
  people: Array<Record<string, unknown> & {
    synthetic: true;
    phone: string;
    idCard: string;
    employeeNo: string;
  }>;
  applications: Array<Record<string, unknown>>;
  jobDemands: Array<Record<string, unknown>>;
  internalEmployees: Array<Record<string, unknown>>;
};

const branchNames = ["祥能演示一分公司", "祥能演示二分公司", "祥能演示三分公司"];
const projectNames = [
  "祥能智造示范项目",
  "数智服务中心项目",
  "新能源组件项目",
  "智慧物流协同项目",
  "电子装配示范项目",
  "城市运营服务项目",
  "客服交付中心项目",
  "质量检测示范项目"
];
const jobTitles = ["操作工", "质检员", "仓库管理员", "装配技工", "客服专员", "现场班组长"];
const familyNames = ["张", "李", "王", "赵", "陈", "周", "孙", "何", "刘", "杨", "黄", "吴"];
const givenNames = ["明", "芳", "强", "静", "伟", "娜", "磊", "敏", "超", "婷", "晨", "欣"];

function padded(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

function isoDate(dayOffset: number): string {
  const date = new Date(Date.UTC(2026, 0, 1 + dayOffset));
  return date.toISOString().slice(0, 10);
}

function fullDate(dayOffset: number): string {
  return `${isoDate(dayOffset)}T09:00:00.000Z`;
}

function syntheticName(index: number): string {
  return `${familyNames[index % familyNames.length]}${givenNames[(index * 5) % givenNames.length]}`;
}

function syntheticPhone(index: number): string {
  return `100${padded(index + 1, 8)}`;
}

function syntheticIdCard(index: number): string {
  const year = 1988 + (index % 18);
  const month = (index % 12) + 1;
  const day = (index % 27) + 1;
  return `900000${year}${padded(month, 2)}${padded(day, 2)}${padded(index + 1, 4)}`;
}

export function generateSyntheticDemoData(seed = 20260726): SyntheticDemoData {
  const branches = branchNames.map((name, index) => ({
    id: `synthetic-branch-${padded(index + 1, 2)}`,
    sourceCode: `SYN-BR-${padded(index + 1, 2)}`,
    name,
    remark: "公开演示专用合成组织"
  }));

  const projects = projectNames.map((name, index) => {
    const branch = branches[index % branches.length]!;
    return {
      id: `synthetic-project-${padded(index + 1, 2)}`,
      sourceProjectId: `SYN-PJ-${padded(index + 1, 3)}`,
      branchId: branch.id,
      branchName: branch.name,
      name,
      isExternal: index % 4 === 0,
      businessType: ["智能制造", "数字服务", "新能源", "物流服务"][index % 4],
      status: index === 7 ? "PAUSED" : "ACTIVE",
      managerName: `演示负责人${index + 1}`,
      managerPhone: syntheticPhone(300 + index),
      cooperationStart: isoDate(index * 12),
      cooperationEnd: null,
      responsibility: index % 3 === 0 ? "JOINT" : "OURS",
      remark: "公开演示专用合成项目",
      imageUrl: `/demo-assets/projects/project-${padded(index + 1, 2)}.svg`
    };
  });

  const suppliers = Array.from({ length: 6 }, (_, index) => ({
    id: `synthetic-supplier-${padded(index + 1, 2)}`,
    name: index === 0 ? "祥能自招（公开演示）" : `祥能演示供应商${index + 1}号`,
    contactName: `演示对接人${index + 1}`,
    contactPhone: syntheticPhone(400 + index),
    level: ["A", "A", "B", "B", "C", "C"][index],
    projectIds: projects
      .filter((_, projectIndex) => projectIndex % 6 === index || projectIndex % 3 === index % 3)
      .map((project) => project.id)
  }));

  const jobDemands = Array.from({ length: 12 }, (_, index) => {
    const project = projects[index % projects.length]!;
    return {
      id: `synthetic-job-${padded(index + 1, 2)}`,
      projectId: project.id,
      projectName: project.name,
      title: jobTitles[index % jobTitles.length],
      requiredCount: 8 + (index % 5) * 4,
      requirements: "18至45周岁，身体健康，能适应排班；有同岗位经验者优先。",
      description: "负责生产协作、质量检查、现场记录与班组交接，按标准作业流程完成岗位任务。",
      salary: `${4500 + (index % 4) * 500}-${6000 + (index % 4) * 700}元/月`,
      workTime: index % 2 === 0 ? "长白班 08:00-17:30" : "两班制 08:00-20:00",
      workLocation: `${project.name}演示园区`,
      benefits: ["包住", "工作餐", "商业保险", "节日福利"],
      deadline: isoDate(220 + index),
      status: index === 11 ? "PAUSED" : "RECRUITING",
      createdAt: fullDate(index)
    };
  });

  const people = Array.from({ length: 48 }, (_, index) => {
    const project = projects[index % projects.length]!;
    const supplier = suppliers[index % suppliers.length]!;
    const job = jobDemands[index % jobDemands.length]!;
    const stateIndex = index % 5;
    const status = ["APPLICANT", "INTERVIEWING", "PENDING_ONBOARD", "ACTIVE", "LEFT"][stateIndex]!;
    const interviewStatus = stateIndex === 0
      ? "PENDING_ARRIVAL"
      : stateIndex === 1
        ? "ARRIVED"
        : "PASSED";
    const onboardDate = stateIndex >= 3 ? isoDate(20 + index) : null;
    const offboardDate = stateIndex === 4 ? isoDate(150 + index) : null;
    return {
      id: `synthetic-person-${padded(index + 1, 3)}`,
      sourceRow: index + 2,
      synthetic: true as const,
      employeeNo: `SYN-E${padded(index + 1, 5)}`,
      name: syntheticName(index),
      idCard: syntheticIdCard(index),
      phone: syntheticPhone(index),
      gender: index % 2 === 0 ? "男" : "女",
      age: 21 + (index % 22),
      ethnicity: "汉族",
      origin: "公开合成演示",
      branchId: project.branchId,
      branchName: project.branchName,
      projectId: project.id,
      projectName: project.name,
      jobTitle: job.title,
      interviewDate: isoDate(10 + index),
      interviewStatus,
      employmentStatus: status,
      status,
      onboardDate,
      offboardDate,
      offboardReason: status === "LEFT" ? "个人发展（演示）" : null,
      insuranceTypes: status === "ACTIVE" ? ["COMMERCIAL"] : [],
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierPolicyText: "入职满30天奖励500元（演示政策）",
      employeePolicyText: "内部推荐入职满30天奖励500元（演示政策）",
      settlementPolicyText: "次月核算并在确认后结算（演示政策）",
      recommenderName: index % 3 === 0 ? "演示推荐人" : null,
      emergencyContactName: `演示紧急联系人${index + 1}`,
      emergencyContactPhone: syntheticPhone(100 + index),
      emergencyContactRelation: index % 2 === 0 ? "家属" : "朋友",
      source: index % 3 === 0 ? "SUPPLIER" : "OPERATOR",
      notes: "本记录为公开演示合成数据，与真实个人无关。",
      files: [],
      statusLogs: [{
        id: `synthetic-status-log-${padded(index + 1, 3)}`,
        fromStatus: null,
        toStatus: status,
        notes: "合成演示初始状态",
        createdAt: fullDate(index)
      }],
      createdAt: fullDate(index),
      updatedAt: fullDate(index + 30)
    };
  });

  const applications = people.map((person, index) => {
    const job = jobDemands[index % jobDemands.length]!;
    const supplier = suppliers[index % suppliers.length]!;
    return {
      id: `synthetic-application-${padded(index + 1, 3)}`,
      personId: person.id,
      jobDemandId: job.id,
      jobDemand: job,
      source: person.source,
      supplier: person.source === "SUPPLIER" ? { id: supplier.id, name: supplier.name } : null,
      recommender: person.recommenderName ? { displayName: person.recommenderName } : null,
      interviewStatus: person.interviewStatus,
      interviewDate: person.interviewDate,
      employmentStatus: person.status,
      onboardDate: person.onboardDate,
      offboardDate: person.offboardDate,
      offboardReason: person.offboardReason,
      appliedAt: person.createdAt
    };
  });

  const internalEmployees = Array.from({ length: 6 }, (_, index) => ({
    id: `synthetic-internal-${padded(index + 1, 2)}`,
    synthetic: true,
    employeeNo: `SYN-I${padded(index + 1, 4)}`,
    name: `内部演示员工${index + 1}`,
    phone: syntheticPhone(200 + index),
    idCard: syntheticIdCard(200 + index),
    bankAccount: `SYNTHETIC-${padded(index + 1, 12)}`,
    position: ["内部人事", "招聘专员", "现场运营", "财务审核", "出纳", "部门制单人"][index],
    branchId: branches[index % branches.length]!.id,
    departmentName: index < 3 ? "人力资源中心" : "财务管理中心",
    status: "ACTIVE",
    onboardDate: isoDate(index * 5)
  }));

  return {
    meta: {
      synthetic: true,
      seed,
      generatedFor: "public-demo",
      schemaVersion: 1
    },
    branches,
    projects,
    suppliers,
    people,
    applications,
    jobDemands,
    internalEmployees
  };
}
