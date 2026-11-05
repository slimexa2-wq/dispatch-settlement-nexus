import { EmploymentStatus, type SessionUser } from "@xiangneng/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import { andWhere, personWhere, projectWhere } from "../data-scope.js";
import { AppError, notFound } from "../errors.js";
import { attachRecruitmentProgress } from "../services/recruitment-progress.js";

export type ProjectStatisticsInput = {
  branch_name?: string | null;
  project_name?: string | null;
  metrics: Array<"hire_count" | "resignation_count" | "current_headcount" | "net_change">;
  start_date?: string | null;
  end_date?: string | null;
  group_by?: "none" | "day" | "week" | "month";
};

export type EmployeeQueryInput = {
  name?: string | null;
  phone?: string | null;
  phone_suffix?: string | null;
  employee_id?: string | null;
};

export type RecruitmentInput = {
  branch_name?: string | null;
  project_name?: string | null;
  position_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  gap_greater_than?: number | null;
  sort_by?: "gap_desc" | "completion_rate_desc" | "project_name";
};

function dayStart(value: string): Date {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new AppError(400, "INVALID_DATE", `日期格式无效：${value}`);
  return date;
}

function dayEndExclusive(value: string): Date {
  const date = dayStart(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function isoDay(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(value);
}

function currentMonthRange() {
  const day = isoDay(new Date());
  const startLabel = `${day.slice(0, 7)}-01`;
  return { start: dayStart(startLabel), end: dayEndExclusive(day), startLabel, endLabel: day };
}

function queryRange(start?: string | null, end?: string | null) {
  const fallback = currentMonthRange();
  const startLabel = start || fallback.startLabel;
  const endLabel = end || fallback.endLabel;
  const range = { start: dayStart(startLabel), end: dayEndExclusive(endLabel), startLabel, endLabel };
  if (range.start >= range.end) throw new AppError(400, "INVALID_DATE_RANGE", "开始日期不能晚于结束日期");
  return range;
}

async function resolveScopedProjects(db: PrismaClient, user: SessionUser, input: { branch_name?: string | null; project_name?: string | null }) {
  const projects = await db.project.findMany({
    where: andWhere(projectWhere(user), {
      name: input.project_name ? { contains: input.project_name, mode: "insensitive" } : undefined,
      branch: input.branch_name ? { name: { contains: input.branch_name, mode: "insensitive" } } : undefined
    }),
    select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
    orderBy: [{ branch: { name: "asc" } }, { name: "asc" }]
  });
  if (!projects.length) notFound("权限范围内的项目");
  if (input.project_name) {
    const exact = projects.filter((project) => project.name === input.project_name);
    if (exact.length === 1) return exact;
    if (projects.length > 1) {
      throw new AppError(409, "AMBIGUOUS_PROJECT", "匹配到多个项目，请选择具体项目", {
        candidates: projects.slice(0, 20).map((project) => ({ id: project.id, name: project.name, branchName: project.branch.name }))
      });
    }
  }
  return projects;
}

function monthKeys(startLabel: string, endLabel: string): string[] {
  const keys: string[] = [];
  let year = Number(startLabel.slice(0, 4));
  let month = Number(startLabel.slice(5, 7));
  const endYear = Number(endLabel.slice(0, 4));
  const endMonth = Number(endLabel.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) { year += 1; month = 1; }
  }
  return keys;
}

function metricRow(people: Array<{ onboardDate: Date | null; offboardDate: Date | null; status: string }>, start: Date, endExclusive: Date, currentSnapshot: boolean) {
  const hireCount = people.filter((person) => person.onboardDate && person.onboardDate >= start && person.onboardDate < endExclusive).length;
  const resignationCount = people.filter((person) => person.offboardDate && person.offboardDate >= start && person.offboardDate < endExclusive).length;
  const asOf = new Date(endExclusive.getTime() - 1);
  const currentHeadcount = currentSnapshot
    ? people.filter((person) => person.status === EmploymentStatus.ACTIVE).length
    : people.filter((person) => person.onboardDate && person.onboardDate <= asOf && (!person.offboardDate || person.offboardDate > asOf)).length;
  return { hire_count: hireCount, resignation_count: resignationCount, current_headcount: currentHeadcount, net_change: hireCount - resignationCount };
}

export async function getProjectPersonnelStatistics(db: PrismaClient, user: SessionUser, input: ProjectStatisticsInput) {
  const projects = await resolveScopedProjects(db, user, input);
  const range = queryRange(input.start_date, input.end_date);
  const people = await db.person.findMany({
    where: andWhere(personWhere(user), { projectId: { in: projects.map((project) => project.id) } }),
    select: { projectId: true, onboardDate: true, offboardDate: true, status: true }
  });
  const isCurrentRange = range.end > new Date();
  let rows: Array<Record<string, unknown>>;
  if (input.group_by === "month") {
    rows = monthKeys(range.startLabel, range.endLabel).map((month) => {
      const start = dayStart(`${month}-01`);
      const [year, monthNumber] = month.split("-").map(Number);
      const nextYear = monthNumber === 12 ? year! + 1 : year!;
      const nextMonth = monthNumber === 12 ? 1 : monthNumber! + 1;
      const end = dayStart(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`);
      const boundedEnd = end > range.end ? range.end : end;
      return { period: month, ...metricRow(people, start, boundedEnd, isCurrentRange && boundedEnd === range.end) };
    });
  } else {
    rows = projects.map((project) => ({
      branch_name: project.branch.name,
      project_id: project.id,
      project_name: project.name,
      ...metricRow(people.filter((person) => person.projectId === project.id), range.start, range.end, isCurrentRange)
    }));
  }
  const totals = metricRow(people, range.start, range.end, isCurrentRange);
  const identityColumns = new Set(["period", "branch_name", "project_id", "project_name"]);
  return {
    rows: rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => identityColumns.has(key) || input.metrics.includes(key as ProjectStatisticsInput["metrics"][number])))),
    totals: Object.fromEntries(Object.entries(totals).filter(([key]) => input.metrics.includes(key as ProjectStatisticsInput["metrics"][number]))),
    filters: { start_date: range.startLabel, end_date: range.endLabel, project_count: projects.length },
    methodology: "入职/离职按业务日期统计；当前在职按人员主档 ACTIVE 状态统计，历史月末在职按入离职日期回溯；净增减=入职-离职。",
    updated_at: new Date().toISOString()
  };
}

export async function searchEmployee(db: PrismaClient, user: SessionUser, input: EmployeeQueryInput) {
  const identity = input.employee_id?.trim();
  const people = await db.person.findMany({
    where: andWhere(personWhere(user), {
      name: input.name ? { contains: input.name, mode: "insensitive" } : undefined,
      phone: input.phone ? input.phone : input.phone_suffix ? { endsWith: input.phone_suffix } : undefined,
      OR: identity ? [{ id: identity }, { employeeNo: identity }] : undefined
    }),
    select: {
      id: true, name: true, phone: true, idCard: true, employeeNo: true, status: true,
      interviewStatus: true, interviewDate: true, onboardDate: true, offboardDate: true, offboardReason: true,
      jobTitle: true, recommenderName: true, project: { select: { id: true, name: true, branch: { select: { name: true } } } },
      supplier: { select: { id: true, name: true } },
      statusLogs: { orderBy: { createdAt: "desc" }, take: 20, select: { fromStatus: true, toStatus: true, interviewStatus: true, action: true, notes: true, createdAt: true } }
    },
    orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
    take: 21
  });
  if (!people.length) notFound("权限范围内的人员");
  const candidates = people.map((person) => ({
    employee_id: person.id, employee_no: person.employeeNo, name: person.name, phone: person.phone,
    project_name: person.project.name, position_name: person.jobTitle, status: person.status
  }));
  if (people.length !== 1) {
    return { match: "ambiguous" as const, candidates: candidates.slice(0, 20), total_at_least: people.length, clarification_required: true };
  }
  const person = people[0]!;
  return {
    match: "unique" as const,
    employee: {
      employee_id: person.id, employee_no: person.employeeNo, name: person.name, phone: person.phone,
      id_card: person.idCard, status: person.status, interview_status: person.interviewStatus,
      interview_date: person.interviewDate ? isoDay(person.interviewDate) : null,
      project: { id: person.project.id, name: person.project.name, branch_name: person.project.branch.name },
      position_name: person.jobTitle, supplier: person.supplier, recommender_name: person.recommenderName,
      onboard_date: person.onboardDate ? isoDay(person.onboardDate) : null,
      offboard_date: person.offboardDate ? isoDay(person.offboardDate) : null,
      offboard_reason: person.offboardReason,
      lifecycle: person.statusLogs.map((log) => ({ ...log, createdAt: log.createdAt.toISOString() }))
    },
    updated_at: new Date().toISOString()
  };
}

export async function resolveUniqueEmployee(db: PrismaClient, user: SessionUser, input: EmployeeQueryInput) {
  const result = await searchEmployee(db, user, input);
  if (result.match !== "unique") {
    throw new AppError(409, "AMBIGUOUS_EMPLOYEE", "匹配到多个同名人员，请选择具体人员", { candidates: result.candidates });
  }
  return result.employee;
}

export async function getRecruitmentProgress(db: PrismaClient, user: SessionUser, input: RecruitmentInput) {
  const projects = await resolveScopedProjects(db, user, input);
  const range = input.start_date || input.end_date ? queryRange(input.start_date, input.end_date) : undefined;
  const jobs = await db.jobDemand.findMany({
    where: { projectId: { in: projects.map((project) => project.id) }, title: input.position_name ? { contains: input.position_name, mode: "insensitive" } : undefined },
    select: { id: true, title: true, requiredCount: true, status: true, deadline: true, updatedAt: true, project: { select: { id: true, name: true, branch: { select: { name: true } } } } },
    orderBy: { updatedAt: "desc" }
  });
  const withProgress = await attachRecruitmentProgress(db, jobs, range ? { start: range.start, end: range.end } : undefined);
  let rows = withProgress.map((job) => ({
    job_id: job.id, branch_name: job.project.branch.name, project_id: job.project.id, project_name: job.project.name,
    position_name: job.title, status: job.status, demand_count: job.requiredCount, completed_count: job.progress.onboarded,
    gap: job.progress.remainingGap, completion_rate: job.progress.completionRate, registered_count: job.progress.registered,
    arrived_count: job.progress.arrived, passed_count: job.progress.passed, deadline: isoDay(job.deadline)
  })).filter((row) => input.gap_greater_than == null || row.gap > input.gap_greater_than);
  if (input.sort_by === "completion_rate_desc") rows.sort((a, b) => b.completion_rate - a.completion_rate);
  else if (input.sort_by === "project_name") rows.sort((a, b) => a.project_name.localeCompare(b.project_name, "zh-CN"));
  else rows.sort((a, b) => b.gap - a.gap);
  const demand = rows.reduce((sum, row) => sum + row.demand_count, 0);
  const completed = rows.reduce((sum, row) => sum + row.completed_count, 0);
  return {
    rows,
    totals: { demand_count: demand, completed_count: completed, gap: rows.reduce((sum, row) => sum + row.gap, 0), completion_rate: demand ? Number(Math.min(100, (completed / demand) * 100).toFixed(2)) : 100 },
    methodology: "完成数按每人每岗位最新一次报名且已入职去重统计；缺口=max(需求-完成,0)；完成率=完成/需求。",
    updated_at: new Date().toISOString()
  };
}
