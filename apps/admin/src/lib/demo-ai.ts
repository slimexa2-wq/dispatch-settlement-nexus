import { EmploymentStatus, JobStatus } from "@xiangneng/shared";
import type { JobDemand, Person, Project, Supplier } from "../types/domain";

type JsonRecord = Record<string, unknown>;

export type DemoAiContext = {
  people: Person[];
  projects: Project[];
  jobs: JobDemand[];
  suppliers: Supplier[];
  onboard: (personId: string, date: string) => Person;
  offboard: (personId: string, date: string, reason: string) => Person;
};

type DemoAction = {
  id: string;
  token: string;
  expiresAt: number;
  kind: "entry" | "resignation";
  personId: string;
  date: string;
  reason?: string;
  executed?: boolean;
  result?: JsonRecord;
};

const actions = new Map<string, DemoAction>();
const idempotentResults = new Map<string, JsonRecord>();

function randomToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[\s，。；、？！,.!?：:（）()【】[\]“”"'_-]/g, "");
}

function extractDate(message: string): string {
  const explicit = message.match(/20\d{2}[-/.年]\d{1,2}(?:[-/.月]\d{1,2})?/);
  if (explicit) {
    const numbers = explicit[0].match(/\d+/g) ?? [];
    const year = numbers[0] ?? "2026";
    const month = (numbers[1] ?? "7").padStart(2, "0");
    const day = (numbers[2] ?? "26").padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function extractMonth(message: string): string {
  const explicit = message.match(/(20\d{2})[-/.年](\d{1,2})/);
  if (explicit) return `${explicit[1]}-${explicit[2]!.padStart(2, "0")}`;
  return "2026-07";
}

function projectForMessage(message: string, projects: Project[]): Project | undefined {
  const exact = projects.find((project) => message.includes(project.name));
  if (exact) return exact;
  const normalized = compact(message);
  return projects
    .map((project) => {
      const name = compact(project.name).replace(/项目|外包|招聘|服务/g, "");
      const score = name && normalized.includes(name) ? name.length : 0;
      return { project, score };
    })
    .sort((a, b) => b.score - a.score)
    .find((item) => item.score >= 2)?.project;
}

function peopleForMessage(message: string, parameters: JsonRecord, people: Person[]): Person[] {
  const employeeId = text(parameters.employee_id ?? parameters.employeeId);
  if (employeeId) return people.filter((person) => person.id === employeeId || person.employeeNo === employeeId);
  const phone = text(parameters.phone ?? parameters.phone_suffix);
  if (phone) return people.filter((person) => person.phone?.includes(phone));
  const explicitName = text(parameters.employee_name ?? parameters.name);
  if (explicitName) return people.filter((person) => person.name === explicitName);
  const exact = people.filter((person) => person.name && message.includes(person.name));
  if (exact.length) {
    const longest = Math.max(...exact.map((person) => person.name.length));
    return exact.filter((person) => person.name.length === longest);
  }
  const digits = message.match(/1\d{10}|\d{4}$/)?.[0];
  return digits ? people.filter((person) => person.phone?.includes(digits) || person.employeeNo?.includes(digits)) : [];
}

function employeePayload(person: Person): JsonRecord {
  return {
    employee_id: person.id,
    employee_no: person.employeeNo,
    name: person.name,
    phone: person.phone,
    id_card: person.idCard,
    status: person.employmentStatus ?? person.status,
    project: { id: person.projectId, name: person.projectName, branch_name: person.branchName },
    position_name: person.jobTitle,
    onboard_date: person.onboardDate,
    offboard_date: person.offboardDate,
    offboard_reason: person.offboardReason,
    supplier: person.supplierId ? { id: person.supplierId, name: person.supplierName } : undefined,
    recommender_name: person.recommenderName,
    insurance_types: person.insuranceTypes,
    lifecycle: person.lifecycle ?? []
  };
}

function ambiguousPeople(matches: Person[]): JsonRecord {
  return {
    type: "query_result",
    skill: "employee_information_query",
    route_type: "demo_retrieval",
    confidence: 1,
    result: {
      match: "ambiguous",
      candidates: matches.slice(0, 12).map((person) => ({
        employee_id: person.id,
        name: person.name,
        phone: person.phone,
        project_name: person.projectName,
        position_name: person.jobTitle,
        status: person.employmentStatus ?? person.status
      }))
    }
  };
}

function personnelStatistics(message: string, context: DemoAiContext): JsonRecord {
  const project = projectForMessage(message, context.projects);
  const month = extractMonth(message);
  const scoped = context.people.filter((person) => !project || person.projectId === project.id);
  const rowsByProject = new Map<string, Person[]>();
  scoped.forEach((person) => rowsByProject.set(person.projectId ?? "unassigned", [...(rowsByProject.get(person.projectId ?? "unassigned") ?? []), person]));
  const rows = [...rowsByProject.entries()].map(([projectId, people]) => {
    const relatedProject = context.projects.find((item) => item.id === projectId);
    const hireCount = people.filter((person) => person.onboardDate?.startsWith(month)).length;
    const resignationCount = people.filter((person) => person.offboardDate?.startsWith(month)).length;
    const currentHeadcount = people.filter((person) =>
      (person.employmentStatus ?? person.status) === EmploymentStatus.ACTIVE && !person.offboardDate
    ).length;
    return {
      period: month,
      project_id: projectId,
      project_name: relatedProject?.name ?? people[0]?.projectName ?? "未分配项目",
      branch_name: relatedProject?.branchName ?? people[0]?.branchName ?? "未分配分公司",
      hire_count: hireCount,
      resignation_count: resignationCount,
      current_headcount: currentHeadcount,
      net_change: hireCount - resignationCount
    };
  }).sort((a, b) => b.current_headcount - a.current_headcount);
  const totals = rows.reduce((sum, row) => ({
    hire_count: sum.hire_count + row.hire_count,
    resignation_count: sum.resignation_count + row.resignation_count,
    current_headcount: sum.current_headcount + row.current_headcount,
    net_change: sum.net_change + row.net_change
  }), { hire_count: 0, resignation_count: 0, current_headcount: 0, net_change: 0 });
  return {
    type: "query_result",
    skill: "project_personnel_statistics",
    route_type: "demo_retrieval",
    confidence: 1,
    result: {
      rows,
      totals,
      methodology: "本月入离职按人员主档日期统计；当前在职按人员状态为在职且无离职日期统计。",
      updated_at: new Date().toISOString()
    }
  };
}

function recruitmentProgress(message: string, context: DemoAiContext): JsonRecord {
  const project = projectForMessage(message, context.projects);
  const position = context.jobs.find((job) => message.includes(job.title))?.title;
  const jobs = context.jobs.filter((job) =>
    (!project || job.projectId === project.id) &&
    (!position || job.title === position) &&
    job.status === JobStatus.RECRUITING
  );
  const rows = jobs.map((job) => {
    const completed = Number(job.applicationCount ?? 0);
    const demand = Number(job.requiredCount ?? 0);
    return {
      job_id: job.id,
      project_name: job.projectName,
      position_name: job.title,
      demand_count: demand,
      completed_count: completed,
      gap: Math.max(0, demand - completed),
      completion_rate: demand ? Math.min(100, Math.round(completed / demand * 1000) / 10) : 0,
      deadline: job.deadline,
      status: job.status
    };
  }).sort((a, b) => b.gap - a.gap);
  const totals = rows.reduce((sum, row) => ({
    demand_count: sum.demand_count + row.demand_count,
    completed_count: sum.completed_count + row.completed_count,
    gap: sum.gap + row.gap
  }), { demand_count: 0, completed_count: 0, gap: 0 });
  return {
    type: "query_result",
    skill: "recruitment_progress_query",
    route_type: "demo_retrieval",
    confidence: 1,
    result: {
      rows,
      totals: {
        ...totals,
        completion_rate: totals.demand_count ? Math.min(100, Math.round(totals.completed_count / totals.demand_count * 1000) / 10) : 0
      },
      methodology: "招聘完成率按招聘中岗位报名人数除以需求人数统计，缺口不小于0。",
      updated_at: new Date().toISOString()
    }
  };
}

function knowledgeResult(message: string, context: DemoAiContext): JsonRecord | null {
  const project = projectForMessage(message, context.projects);
  const matchingSupplier = context.suppliers.find((supplier) => message.includes(supplier.name));
  const matchingJob = context.jobs.find((job) => message.includes(job.title));
  const wantsProject = Boolean(project) || /项目|负责人|地址|介绍/.test(message);
  const wantsJobs = Boolean(matchingJob) || /岗位|工作内容|职责|要求|薪资|工作时间/.test(message);
  const wantsSuppliers = Boolean(matchingSupplier) || /供应商|合作方|联系人/.test(message);
  const wantsOverview = /系统|总览|概况|多少项目|多少人员|多少岗位/.test(message);
  if (!wantsProject && !wantsJobs && !wantsSuppliers && !wantsOverview) return null;
  const records: JsonRecord[] = [];
  if (wantsOverview) {
    records.push({
      type: "system",
      title: "演示权限范围数据总览",
      fields: {
        项目数: context.projects.length,
        人员数: context.people.length,
        招聘岗位数: context.jobs.length,
        供应商数: context.suppliers.length
      }
    });
  }
  if (wantsProject) {
    const visible = project ? [project] : context.projects.slice(0, 12);
    visible.forEach((item) => records.push({
      type: "project",
      title: item.name,
      fields: {
        分公司: item.branchName,
        业务类型: item.businessType ?? "综合用工服务",
        负责人: item.managerName ?? "项目运营负责人",
        联系电话: item.managerPhone ?? "0831-8881234",
        项目地址: item.remark ?? `${item.branchName ?? "四川"}项目现场`,
        项目介绍: item.description ?? item.remark ?? "提供招聘、入职、在职与离职全流程服务"
      }
    }));
  }
  if (wantsJobs) {
    context.jobs
      .filter((job) => (!project || job.projectId === project.id) && (!matchingJob || job.id === matchingJob.id))
      .slice(0, 20)
      .forEach((job) => records.push({
        type: "job",
        title: job.title,
        fields: {
          项目: job.projectName,
          需求人数: job.requiredCount,
          薪资: job.salary,
          工作时间: job.workTime,
          工作地点: job.workLocation,
          岗位职责: job.notes ?? job.requirements,
          岗位要求: job.requirements,
          截止日期: text(job.deadline).slice(0, 10),
          招聘状态: job.status
        }
      }));
  }
  if (wantsSuppliers) {
    (matchingSupplier ? [matchingSupplier] : context.suppliers.slice(0, 20)).forEach((supplier) => records.push({
      type: "supplier",
      title: supplier.name,
      fields: {
        联系人: supplier.contactName ?? "供应商业务经理",
        联系电话: supplier.contactPhone ?? "0831-8881234",
        合作等级: supplier.level ?? "A",
        合作状态: "合作中",
        合作项目数: supplier.projectIds?.length ?? supplier.projects?.length ?? 0
      }
    }));
  }
  if (!records.length) return null;
  const answer = records.slice(0, 4).map((record) => {
    const fields = record.fields as JsonRecord;
    return `${record.title}：${Object.entries(fields).slice(0, 4).map(([key, value]) => `${key}${value}`).join("，")}`;
  }).join("；");
  return {
    type: "knowledge_result",
    answer,
    result: {
      records,
      methodology: "结果来自当前演示业务状态的权限内检索；正式环境由后端权限过滤和确定性业务工具直接生成，模型只识别意图与参数。",
      updated_at: new Date().toISOString()
    },
    route_type: "demo_retrieval",
    confidence: 1
  };
}

function clarification(skill: string, message: string, parameters: JsonRecord = {}): JsonRecord {
  return {
    type: "clarification",
    skill,
    message,
    extracted_parameters: parameters,
    route_type: "demo_form",
    standard_form_available: true
  };
}

function previewAction(kind: DemoAction["kind"], message: string, parameters: JsonRecord, context: DemoAiContext): JsonRecord {
  const matches = peopleForMessage(message, parameters, context.people);
  if (matches.length > 1) return ambiguousPeople(matches);
  const person = matches[0];
  if (!person) return clarification(kind === "entry" ? "employee_entry" : "employee_resignation", "请补充唯一人员姓名、手机号或员工编号。", parameters);
  if (kind === "entry" && (person.employmentStatus ?? person.status) === EmploymentStatus.ACTIVE && !person.offboardDate) {
    return clarification("employee_entry", `${person.name}当前已在职，不能重复办理入职。`, parameters);
  }
  if (kind === "resignation" && ((person.employmentStatus ?? person.status) !== EmploymentStatus.ACTIVE || person.offboardDate)) {
    return clarification("employee_resignation", `${person.name}当前不是在职状态，不能办理离职。`, parameters);
  }
  const date = text(parameters.entry_date ?? parameters.resignation_date) || extractDate(message);
  const reason = text(parameters.resignation_reason) || message.match(/原因(?:是|为|：|:)?\s*([^，。；;]+)/)?.[1] || "个人原因";
  const id = crypto.randomUUID();
  const token = randomToken();
  const action: DemoAction = {
    id,
    token,
    expiresAt: Date.now() + 10 * 60_000,
    kind,
    personId: person.id,
    date,
    reason: kind === "resignation" ? reason : undefined
  };
  actions.set(id, action);
  return {
    type: "action_preview",
    skill: kind === "entry" ? "employee_entry" : "employee_resignation",
    route_type: "demo_rule",
    preview: {
      action_id: id,
      action_token: token,
      expires_at: new Date(action.expiresAt).toISOString(),
      confirmation_required: true,
      person: {
        employee_id: person.id,
        name: person.name,
        phone: person.phone,
        project_name: person.projectName,
        position_name: person.jobTitle
      },
      before: {
        status: person.employmentStatus ?? person.status,
        onboardDate: person.onboardDate,
        offboardDate: person.offboardDate
      },
      after: kind === "entry"
        ? { status: EmploymentStatus.ACTIVE, onboardDate: date, projectId: person.projectId, jobTitle: person.jobTitle }
        : { status: EmploymentStatus.LEFT, offboardDate: date, offboardReason: reason },
      impact_scope: ["人员主档", "人员生命周期", "招聘进度", "统计看板", "操作审计"]
    }
  };
}

export function resetDemoAiActions(): void {
  actions.clear();
  idempotentResults.clear();
}

export function handleDemoAiRequest(
  method: string,
  path: string,
  body: unknown,
  context: DemoAiContext
): JsonRecord | null {
  if (method === "GET" && path === "/ai/health") {
    return {
      status: "degraded",
      database: "demo_snapshot",
      model: "backend_required",
      model_name: "Qwen3.5 4B",
      rules: "ok",
      retrieval: "ok",
      allowed_skills: ["project_personnel_statistics", "employee_information_query", "recruitment_progress_query", "employee_entry", "employee_resignation"],
      form_fallback_available: true,
      checked_at: new Date().toISOString()
    };
  }
  if (method === "POST" && path === "/ai/chat") {
    const input = (body ?? {}) as JsonRecord;
    const message = text(input.message);
    const parameters = (input.parameters && typeof input.parameters === "object" ? input.parameters : {}) as JsonRecord;
    const isWriteEntry = /(?:给|为|让).{1,20}(?:办理|确认|执行)?.{0,6}入职/.test(message) && !/什么时候入职|入职时间|入职日期|入职多少|入职数/.test(message);
    const isWriteResignation = /(?:给|为|让).{1,20}(?:办理|确认|执行)?.{0,6}(?:离职|离岗)/.test(message) && !/什么时候离职|离职时间|离职日期|离职多少|离职数/.test(message);
    if (isWriteEntry) return previewAction("entry", message, parameters, context);
    if (isWriteResignation) return previewAction("resignation", message, parameters, context);

    const personMatches = peopleForMessage(message, parameters, context.people);
    if (personMatches.length > 1) return ambiguousPeople(personMatches);
    if (personMatches.length === 1) {
      return {
        type: "query_result",
        skill: "employee_information_query",
        route_type: "demo_retrieval",
        confidence: 1,
        result: {
          match: "unique",
          employee: employeePayload(personMatches[0]!),
          methodology: "按当前权限范围内的人员主档、岗位归属和生命周期实时查询。",
          updated_at: new Date().toISOString()
        }
      };
    }

    if (/招聘|招人|缺口|完成率|达成|还差|需求人数/.test(message)) return recruitmentProgress(message, context);
    if (/在职|入职数|离职数|入职.*离职|净增|净减|人员数据|人员统计/.test(message)) return personnelStatistics(message, context);
    const knowledge = knowledgeResult(message, context);
    if (knowledge) return knowledge;
    if (/你好|你是谁|能做什么|有什么功能|帮助/.test(message)) {
      return {
        type: "chat_result",
        message: "我是运行在祥能业务系统内的 AI 助手，可自由查询权限范围内的人员、项目、岗位、供应商和招聘数据，也可对单人入职、离职生成预览并在确认后执行。",
        route_type: "demo_fast_path",
        model: "rule+retrieval",
        degraded: true
      };
    }
    return {
      type: "clarification",
      skill: "employee_information_query",
      message: "我没有在当前权限范围找到明确对象。请补充人员姓名/手机号、项目名称、岗位或供应商名称，我会继续检索。",
      extracted_parameters: parameters,
      route_type: "demo_form",
      standard_form_available: true
    };
  }
  if (method === "POST" && path === "/ai/actions/confirm") {
    const input = (body ?? {}) as JsonRecord;
    const idempotencyKey = text(input.idempotencyKey);
    const previous = idempotentResults.get(idempotencyKey);
    if (previous) return previous;
    const action = actions.get(text(input.actionId));
    if (!action || action.token !== text(input.actionToken)) throw new Error("操作预览不存在或令牌无效，请重新生成预览");
    if (action.expiresAt < Date.now()) throw new Error("操作预览已过期，请重新生成");
    if (action.executed && action.result) return action.result;
    const person = action.kind === "entry"
      ? context.onboard(action.personId, action.date)
      : context.offboard(action.personId, action.date, action.reason ?? "个人原因");
    const result: JsonRecord = {
      type: "action_result",
      status: "EXECUTED",
      action_id: action.id,
      person: employeePayload(person),
      executed_at: new Date().toISOString(),
      audited: true,
      idempotent: true
    };
    action.executed = true;
    action.result = result;
    if (idempotencyKey) idempotentResults.set(idempotencyKey, result);
    return result;
  }
  if (method === "POST" && path === "/ai/demo/reset") {
    resetDemoAiActions();
    return { ok: true, restored_people: context.people.length };
  }
  return null;
}
