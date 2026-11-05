import type { SessionUser } from "@xiangneng/shared";

type DateLike = Date | string | null | undefined;

export function dateOnly(value: DateLike): string | null {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

export function dateTime(value: DateLike): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function portalRole(role: SessionUser["role"]): "personal" | "group_leader" | "company_manager" | "project_manager" | "site_operator" | "supplier" {
  switch (role) {
    case "HEADQUARTERS_MANAGER":
    case "SYSTEM_ADMIN":
      return "group_leader";
    case "BRANCH_MANAGER":
      return "company_manager";
    case "RESOURCE_SPECIALIST":
      return "project_manager";
    case "PROJECT_OPERATOR":
      return "site_operator";
    case "SUPPLIER":
    case "SUPPLIER_ADMIN":
      return "supplier";
    default:
      return "personal";
  }
}

export function portalSession(user: SessionUser) {
  const role = user.username === "demo_project" ? "project_manager" : portalRole(user.role);
  return {
    personaId: user.username,
    name: user.displayName,
    role,
    subtitle: role === "group_leader"
      ? "集团领导 · 全部数据"
      : role === "company_manager"
        ? "分公司负责人 · 权限范围"
        : role === "site_operator"
          ? "现场运营 · 授权项目"
          : role === "project_manager"
            ? "项目负责人 · 授权项目"
            : role === "supplier"
              ? "供应商 · 自有人员"
              : user.role === "EMPLOYEE"
                ? "在职员工 · 个人中心"
                : "求职者 · 招聘服务",
    companyId: user.branchId ?? undefined,
    projectIds: user.projectIds,
    supplierId: user.supplierId ?? undefined,
    personId: user.personId ?? undefined,
    personStatus: user.role === "EMPLOYEE" ? "employed" : user.role === "JOB_SEEKER" ? "registered" : undefined
  };
}

export function portalPersonStatus(status: string, interviewStatus: string): string {
  if (status === "ACTIVE") return "employed";
  if (status === "LEFT") return "departed";
  if (status === "PENDING_ONBOARD") return "pending_onboard";
  if (interviewStatus === "ARRIVED") return "arrived";
  if (interviewStatus === "PASSED") return "interview_passed";
  if (interviewStatus === "FAILED") return "interview_failed";
  if (interviewStatus === "ABANDONED") return "withdrawn";
  return "registered";
}

export function portalJobStatus(status: string): string {
  if (status === "PAUSED") return "paused";
  if (status === "FILLED" || status === "ENDED") return "closed";
  return "recruiting";
}

export function parseSalary(value: string): { min: number; max: number } {
  const matches = value.replaceAll(",", "").match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];
  if (!matches.length) return { min: 0, max: 0 };
  if (matches.length === 1) return { min: matches[0]!, max: matches[0]! };
  return { min: Math.min(matches[0]!, matches[1]!), max: Math.max(matches[0]!, matches[1]!) };
}

export function policyAmount(value: unknown): number {
  const match = String(value ?? "").replaceAll(",", "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function mapPortalPerson(person: any) {
  const application = person.applications?.[0];
  const lifecycle = (person.statusLogs ?? []).map((log: any) => ({
    id: log.id,
    status: portalPersonStatus(log.toStatus, log.interviewStatus ?? person.interviewStatus),
    occurredAt: dateTime(log.createdAt),
    note: log.notes ?? log.action
  }));
  return {
    id: person.id,
    name: person.name,
    phone: person.phone,
    idCard: person.idCard,
    employeeNo: person.employeeNo,
    gender: person.gender ?? "未知",
    age: person.age ?? undefined,
    origin: person.origin ?? undefined,
    projectId: person.projectId,
    projectName: person.project?.name ?? "",
    companyId: person.project?.branchId ?? person.project?.branch?.id,
    jobId: application?.jobDemandId ?? "",
    jobTitle: person.jobTitle,
    supplierId: person.supplierId,
    supplierName: person.supplier?.name ?? null,
    recommenderName: person.recommender?.displayName ?? person.recommenderName ?? application?.recommenderName ?? null,
    status: portalPersonStatus(person.status, person.interviewStatus),
    appliedAt: dateTime(application?.appliedAt ?? person.createdAt),
    interviewAt: dateTime(application?.interviewDate ?? person.interviewDate),
    onboardDate: dateOnly(person.onboardDate),
    departureDate: dateOnly(person.offboardDate),
    insuranceStatus: Array.isArray(person.insuranceTypes) && person.insuranceTypes.length ? "active" : "pending",
    employmentDays: person.onboardDate
      ? Math.max(0, Math.floor(((person.offboardDate ? new Date(person.offboardDate) : new Date()).getTime() - new Date(person.onboardDate).getTime()) / 86_400_000))
      : 0,
    lifecycle
  };
}

export function mapPortalJob(job: any) {
  const salary = parseSalary(job.salary ?? "");
  const progress = job.progress ?? { registered: 0, onboarded: 0 };
  const supplierPolicy = job.supplierPolicy?.achievementConditions ?? "按项目有效供应商政策执行";
  const referralPolicy = job.referralPolicy?.achievementConditions ?? "按项目有效内部推荐政策执行";
  const projectText = `${job.project?.name ?? ""} ${job.project?.businessType ?? ""}`;
  const imageUrl = /物流|仓储|配送|运输/.test(projectText)
    ? "/project-assets/logistics-warehouse.png"
    : /时代|电池|新能源|锂电|能源/.test(projectText)
      ? "/project-assets/new-energy-campus.png"
      : "/project-assets/electronics-workshop.png";
  return {
    id: job.id,
    project_id: job.projectId,
    projectName: job.project?.name ?? "",
    companyName: job.project?.branch?.name ?? "",
    title: job.title,
    type: job.project?.businessType ?? "普工",
    salary_min: salary.min,
    salary_max: salary.max,
    headcount: job.requiredCount,
    work_time: job.workTime,
    requirements: job.requirements,
    duties: job.notes ?? job.requirements,
    benefits: job.salary,
    deadline: dateOnly(job.deadline),
    status: portalJobStatus(job.status),
    supplier_policy: supplierPolicy,
    referral_policy: referralPolicy,
    policy_start: dateOnly(job.supplierPolicy?.effectiveAt ?? job.referralPolicy?.effectiveAt ?? job.createdAt),
    policy_end: dateOnly(job.supplierPolicy?.expiresAt ?? job.referralPolicy?.expiresAt ?? job.deadline),
    settlement_condition: job.supplierPolicy?.notes ?? "满足政策条件后次月结算",
    created_at: dateTime(job.createdAt),
    region: job.project?.branch?.name ?? "",
    address: job.workLocation,
    projectDescription: job.project?.description ?? job.project?.remark ?? "",
    managerName: job.project?.managerName ?? "项目负责人",
    managerPhone: job.project?.managerPhone ?? "",
    imageKey: job.project?.images?.[0]?.id ?? "factory-blue",
    imageUrl,
    appliedCount: progress.registered,
    completedCount: progress.onboarded
  };
}
