import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import {
  ApplicationSource,
  DataScopeType,
  EmploymentStatus,
  InsuranceType,
  InterviewStatus,
  JobStatus,
  NotificationStatus,
  Permission,
  PolicyType,
  UserRole,
  onboardingSchema,
  offboardingSchema,
  personRegistrationSchema,
  type SessionUser
} from "@xiangneng/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { writeAudit } from "../audit.js";
import { andWhere, personWhere, projectWhere } from "../data-scope.js";
import { AppError, notFound } from "../errors.js";
import { getSession } from "../plugins/auth.js";
import { auditScopeWhere } from "./audit.js";
import { registerPerson } from "../services/registration.js";
import { attachRecruitmentProgress } from "../services/recruitment-progress.js";
import { offboardPerson, onboardPerson } from "../services/person-lifecycle.js";
import {
  dateOnly,
  dateTime,
  mapPortalJob,
  mapPortalPerson,
  policyAmount,
  portalPersonStatus,
  portalSession
} from "../portal/mappers.js";
import { sessionUserInclude, toSessionUser } from "../session-user.js";

const uuidSchema = z.string().uuid();
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const personaSchema = z.enum(["personal", "headquarters", "branch", "project", "operator", "supplier"]);

const userInclude = sessionUserInclude;
const personInclude = {
  project: { include: { branch: { select: { id: true, name: true } } } },
  supplier: { select: { id: true, name: true } },
  recommender: { select: { id: true, displayName: true } },
  applications: {
    include: { jobDemand: { select: { id: true, title: true } } },
    orderBy: { appliedAt: "desc" as const },
    take: 1
  },
  statusLogs: { orderBy: { createdAt: "desc" as const }, take: 100 }
};
const jobInclude = {
  project: {
    include: {
      branch: { select: { id: true, name: true } },
      images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], take: 1 }
    }
  },
  supplierPolicy: true,
  referralPolicy: true
};

function requirePermission(user: SessionUser, permission: Permission): void {
  if (!user.permissions.includes(permission)) {
    throw new AppError(403, "FORBIDDEN", "当前身份没有此操作权限");
  }
}

function isSupplierPortalRole(user: SessionUser): boolean {
  return user.role === UserRole.SUPPLIER || user.role === UserRole.SUPPLIER_ADMIN;
}

function portalAppealWhere(user: SessionUser): Prisma.PortalAppealWhereInput {
  if (
    user.role === UserRole.EMPLOYEE ||
    user.role === UserRole.JOB_SEEKER ||
    isSupplierPortalRole(user)
  ) {
    return { creatorUserId: user.id };
  }
  if (
    user.roles.some((role) =>
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.SYSTEM_ADMIN ||
      role === UserRole.GROUP_LEADER ||
      role === UserRole.HEADQUARTERS_MANAGER
    ) ||
    user.scopeBindings.some((binding) => binding.type === DataScopeType.GROUP)
  ) {
    return {};
  }
  const branchIds = user.scopeBindings
    .filter((binding) => binding.type === DataScopeType.BRANCH)
    .map((binding) => binding.branchId)
    .filter((value): value is string => Boolean(value));
  const projectIds = user.scopeBindings
    .filter((binding) => binding.type === DataScopeType.PROJECT)
    .map((binding) => binding.projectId)
    .filter((value): value is string => Boolean(value));
  const supplierIds = user.scopeBindings
    .filter((binding) => binding.type === DataScopeType.SUPPLIER)
    .map((binding) => binding.supplierId)
    .filter((value): value is string => Boolean(value));
  const organizationUnitIds = user.scopeBindings
    .filter((binding) => binding.type === DataScopeType.ORG_UNIT || binding.type === DataScopeType.CENTER)
    .map((binding) => binding.organizationUnitId)
    .filter((value): value is string => Boolean(value));
  const creatorConditions: Prisma.UserWhereInput[] = [];
  if (branchIds.length) {
    creatorConditions.push(
      { branchId: { in: branchIds } },
      { person: { is: { project: { branchId: { in: branchIds } } } } },
      { internalEmployee: { is: { branchId: { in: branchIds } } } }
    );
  }
  if (projectIds.length) {
    creatorConditions.push({
      person: { is: { projectId: { in: projectIds } } }
    });
  }
  if (supplierIds.length) {
    creatorConditions.push({ supplierId: { in: supplierIds } });
  }
  if (organizationUnitIds.length) {
    creatorConditions.push({
      internalEmployee: {
        is: { organizationUnitId: { in: organizationUnitIds } }
      }
    });
  }
  return creatorConditions.length
    ? { creator: { OR: creatorConditions } }
    : { creatorUserId: user.id };
}

function portalJobWhere(user: SessionUser): Prisma.JobDemandWhereInput {
  if (user.role === UserRole.EMPLOYEE || user.role === UserRole.JOB_SEEKER) {
    return { status: JobStatus.RECRUITING, deadline: { gte: new Date() } };
  }
  return { project: projectWhere(user) };
}

function statusFilter(value?: string): Prisma.PersonWhereInput {
  switch (value) {
    case "employed": return { status: EmploymentStatus.ACTIVE };
    case "departed": return { status: EmploymentStatus.LEFT };
    case "pending_onboard": return { status: EmploymentStatus.PENDING_ONBOARD };
    case "arrived": return { interviewStatus: InterviewStatus.ARRIVED };
    case "interview_passed": return { interviewStatus: InterviewStatus.PASSED };
    case "interview_failed": return { interviewStatus: InterviewStatus.FAILED };
    case "withdrawn": return { interviewStatus: InterviewStatus.ABANDONED };
    case "registered": return { status: EmploymentStatus.APPLICANT, interviewStatus: InterviewStatus.PENDING_ARRIVAL };
    default: return {};
  }
}

function jobStatus(value?: string): JobStatus | undefined {
  if (value === "recruiting") return JobStatus.RECRUITING;
  if (value === "paused") return JobStatus.PAUSED;
  if (value === "closed") return JobStatus.ENDED;
  return undefined;
}

function portalStatusTarget(value: string): { status: EmploymentStatus; interviewStatus: InterviewStatus } {
  switch (value) {
    case "arrived": return { status: EmploymentStatus.INTERVIEWING, interviewStatus: InterviewStatus.ARRIVED };
    case "interview_passed": return { status: EmploymentStatus.PENDING_ONBOARD, interviewStatus: InterviewStatus.PASSED };
    case "interview_failed": return { status: EmploymentStatus.APPLICANT, interviewStatus: InterviewStatus.FAILED };
    case "withdrawn": return { status: EmploymentStatus.APPLICANT, interviewStatus: InterviewStatus.ABANDONED };
    case "pending_onboard": return { status: EmploymentStatus.PENDING_ONBOARD, interviewStatus: InterviewStatus.PASSED };
    default: return { status: EmploymentStatus.APPLICANT, interviewStatus: InterviewStatus.PENDING_ARRIVAL };
  }
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [year = 2026, part = 1] = month.split("-").map(Number);
  return {
    start: new Date(`${year}-${String(part).padStart(2, "0")}-01T00:00:00+08:00`),
    end: new Date(`${part === 12 ? year + 1 : year}-${String(part === 12 ? 1 : part + 1).padStart(2, "0")}-01T00:00:00+08:00`)
  };
}

function amount(value: unknown): number {
  if (value && typeof value === "object" && "toNumber" in value) return (value as { toNumber(): number }).toNumber();
  return Number(value ?? 0);
}

async function addNotification(app: FastifyInstance, userId: string, title: string, content: string, targetPath: string): Promise<void> {
  await app.prisma.notification.create({
    data: {
      recipientUserId: userId,
      type: "PORTAL_BUSINESS_UPDATE",
      title,
      content,
      targetPath,
      status: NotificationStatus.SKIPPED_NOT_CONFIGURED,
      lastError: "本地演示模式：消息仅保存在系统内，未外发"
    }
  });
}

export async function portalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/portal/personas", async () => ([
    { id: "personal", name: "张三", role: "personal", subtitle: "在职员工 · 个人中心", personStatus: "employed", avatarSeed: "employee" },
    { id: "headquarters", name: "集团领导", role: "group_leader", subtitle: "集团总部 · 全部数据", avatarSeed: "leader" },
    { id: "branch", name: "分公司负责人", role: "company_manager", subtitle: "分公司 · 权限范围", avatarSeed: "branch" },
    { id: "project", name: "项目负责人", role: "project_manager", subtitle: "项目管理 · 授权项目", avatarSeed: "project" },
    { id: "operator", name: "张伟", role: "site_operator", subtitle: "现场运营 · 授权项目", avatarSeed: "operator" },
    { id: "supplier", name: "供应商经理", role: "supplier", subtitle: "A级供应商 · 自有人员", avatarSeed: "supplier" }
  ]));

  app.post("/portal/session/select-persona", async (request) => {
    if (!app.config.AI_DEMO_MODE || app.config.NODE_ENV === "production") {
      throw new AppError(404, "NOT_FOUND", "演示身份入口未启用");
    }
    const { personaId } = z.object({ personaId: personaSchema }).parse(request.body);
    const username = {
      personal: "demo_employee",
      headquarters: "demo_hq",
      branch: "demo_branch",
      project: "demo_project",
      operator: "demo_operator",
      supplier: "demo_supplier"
    }[personaId];
    const record = await app.prisma.user.findUnique({ where: { username }, include: userInclude });
    if (!record?.isActive) throw new AppError(503, "DEMO_USER_NOT_READY", "演示账号尚未完成数据初始化");
    const user = toSessionUser(record);
    const token = app.jwt.sign({ sub: user.id, tokenVersion: record.tokenVersion });
    return { token, session: portalSession(user) };
  });

  app.get("/portal/session", { preHandler: [app.authenticate] }, async (request) => portalSession(getSession(request)));

  app.get("/portal/catalog", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const projects = await app.prisma.project.findMany({
      where: projectWhere(user),
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { name: "asc" }
    });
    const branchIds = [...new Set(projects.map((item) => item.branchId))];
    const companies = await app.prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const suppliers = await app.prisma.supplier.findMany({
      where: isSupplierPortalRole(user) ? { id: user.supplierId ?? "00000000-0000-0000-0000-000000000000" } : { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 1000
    });
    return {
      companies,
      projects: projects.map((item) => ({ id: item.id, name: item.name, companyId: item.branchId, region: item.branch.name })),
      suppliers
    };
  });

  app.get("/portal/dashboard", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.DASHBOARD_READ);
    const query = z.object({ period: monthSchema.default("2026-07"), companyId: uuidSchema.optional(), projectId: uuidSchema.optional() }).parse(request.query);
    const allowedProject = projectWhere(user);
    const projectFilter: Prisma.ProjectWhereInput = andWhere(
      allowedProject,
      query.companyId ? { branchId: query.companyId } : {},
      query.projectId ? { id: query.projectId } : {}
    );
    const range = monthBounds(query.period);
    const personScope: Prisma.PersonWhereInput = { project: projectFilter };
    const [employedCount, onboardedCount, departedCount, jobs] = await app.prisma.$transaction([
      app.prisma.person.count({ where: { AND: [personScope, { status: EmploymentStatus.ACTIVE }] } }),
      app.prisma.person.count({ where: { AND: [personScope, { onboardDate: { gte: range.start, lt: range.end } }] } }),
      app.prisma.person.count({ where: { AND: [personScope, { offboardDate: { gte: range.start, lt: range.end } }] } }),
      app.prisma.jobDemand.findMany({ where: { project: projectFilter }, include: jobInclude, orderBy: { updatedAt: "desc" }, take: 200 })
    ]);
    const progress = await attachRecruitmentProgress(app.prisma, jobs);
    const byProject = new Map<string, { id: string; name: string; demand: number; completed: number }>();
    for (const job of progress) {
      const row = byProject.get(job.projectId) ?? { id: job.projectId, name: job.project.name, demand: 0, completed: 0 };
      row.demand += job.requiredCount;
      row.completed += job.progress.onboarded;
      byProject.set(job.projectId, row);
    }
    const projects = [...byProject.values()].map((item) => ({
      ...item,
      gap: Math.max(0, item.demand - item.completed),
      progress: item.demand ? Math.min(100, Math.round(item.completed / item.demand * 100)) : 100
    }));
    return {
      metrics: {
        employedCount,
        onboardedCount,
        departedCount,
        netChange: onboardedCount - departedCount,
        vacancy: projects.reduce((sum, item) => sum + item.gap, 0)
      },
      projects
    };
  });

  app.get("/portal/jobs", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.JOB_READ);
    const query = z.object({
      query: z.string().trim().max(120).optional(),
      region: z.string().trim().max(120).optional(),
      projectId: uuidSchema.optional(),
      jobType: z.string().trim().max(120).optional(),
      salary: z.string().regex(/^\d*-(?:\d*)$/).optional(),
      status: z.string().optional()
    }).parse(request.query);
    const regionLabel = query.region?.replace("四川省", "").replace("市", "");
    const jobs = await app.prisma.jobDemand.findMany({
      where: andWhere(portalJobWhere(user), {
        projectId: query.projectId,
        status: jobStatus(query.status),
        OR: query.query ? [
          { title: { contains: query.query, mode: "insensitive" } },
          { project: { name: { contains: query.query, mode: "insensitive" } } },
          { workLocation: { contains: query.query, mode: "insensitive" } }
        ] : undefined
      }, regionLabel ? { OR: [
        { project: { branch: { name: { contains: regionLabel, mode: "insensitive" } } } },
        { workLocation: { contains: regionLabel, mode: "insensitive" } }
      ] } : {}, query.jobType ? { OR: [
        { title: { contains: query.jobType, mode: "insensitive" } },
        { project: { businessType: { contains: query.jobType, mode: "insensitive" } } }
      ] } : {}),
      include: jobInclude,
      orderBy: [{ status: "asc" }, { deadline: "asc" }],
      take: 500
    });
    const mapped = (await attachRecruitmentProgress(app.prisma, jobs)).map(mapPortalJob);
    if (!query.salary) return mapped;
    const [minimum, maximum] = query.salary.split("-").map((value) => value ? Number(value) : undefined);
    return mapped.filter((job) => (minimum === undefined || job.salary_max >= minimum) && (maximum === undefined || job.salary_min <= maximum));
  });

  app.get("/portal/jobs/:id", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.JOB_READ);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const job = await app.prisma.jobDemand.findFirst({ where: andWhere(portalJobWhere(user), { id }), include: jobInclude });
    if (!job) notFound("岗位需求");
    const [withProgress] = await attachRecruitmentProgress(app.prisma, [job]);
    return mapPortalJob(withProgress);
  });

  app.post("/portal/jobs", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = getSession(request);
    requirePermission(user, Permission.JOB_WRITE);
    const input = z.object({
      projectId: uuidSchema,
      title: z.string().trim().min(1).max(120),
      salaryMin: z.coerce.number().nonnegative(),
      salaryMax: z.coerce.number().positive(),
      headcount: z.coerce.number().int().positive(),
      workTime: z.string().trim().min(1).max(500),
      requirements: z.string().trim().min(1).max(5000),
      duties: z.string().trim().max(5000).optional(),
      benefits: z.string().trim().max(2000).optional(),
      deadline: z.coerce.date(),
      status: z.string().default("recruiting"),
      supplierPolicy: z.string().trim().min(1).max(2000),
      referralPolicy: z.string().trim().min(1).max(2000),
      policyStart: z.coerce.date(),
      policyEnd: z.coerce.date(),
      settlementCondition: z.string().trim().min(1).max(2000)
    }).parse(request.body);
    const allowed = await app.prisma.project.findFirst({ where: andWhere(projectWhere(user), { id: input.projectId }) });
    if (!allowed) throw new AppError(403, "OUT_OF_SCOPE", "不能在未授权项目发布岗位");
    const job = await app.prisma.$transaction(async (tx) => {
      const supplierPolicy = await tx.policy.create({ data: {
        name: `${input.title}-供应商政策`, type: PolicyType.SUPPLIER, projectId: input.projectId,
        supplierLevel: "A", amount: policyAmount(input.supplierPolicy), achievementConditions: input.supplierPolicy,
        effectiveAt: input.policyStart, expiresAt: input.policyEnd, notes: input.settlementCondition
      } });
      const referralPolicy = await tx.policy.create({ data: {
        name: `${input.title}-内部推荐政策`, type: PolicyType.EMPLOYEE_REFERRAL, projectId: input.projectId,
        employeeType: "普通员工", amount: policyAmount(input.referralPolicy), achievementConditions: input.referralPolicy,
        effectiveAt: input.policyStart, expiresAt: input.policyEnd, notes: input.settlementCondition
      } });
      const created = await tx.jobDemand.create({ data: {
        projectId: input.projectId,
        title: input.title,
        requiredCount: input.headcount,
        requirements: input.requirements,
        salary: `${input.salaryMin}-${input.salaryMax}元/月${input.benefits ? `；${input.benefits}` : ""}`,
        workTime: input.workTime,
        workLocation: allowed.remark ?? allowed.name,
        deadline: input.deadline,
        status: jobStatus(input.status) ?? JobStatus.RECRUITING,
        supplierPolicyId: supplierPolicy.id,
        referralPolicyId: referralPolicy.id,
        notes: input.duties,
        createdById: user.id
      }, include: jobInclude });
      await writeAudit(tx, request, { action: "PORTAL_JOB_CREATE", resourceType: "JobDemand", resourceId: created.id, after: { projectId: input.projectId, title: input.title, requiredCount: input.headcount } });
      return created;
    });
    const [withProgress] = await attachRecruitmentProgress(app.prisma, [job]);
    return reply.status(201).send(mapPortalJob(withProgress));
  });

  app.patch("/portal/jobs/:id", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.JOB_WRITE);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const patch = z.object({
      title: z.string().trim().min(1).max(120).optional(),
      headcount: z.coerce.number().int().positive().optional(),
      salaryMin: z.coerce.number().nonnegative().optional(),
      salaryMax: z.coerce.number().positive().optional(),
      deadline: z.coerce.date().optional(),
      workTime: z.string().trim().min(1).max(500).optional(),
      requirements: z.string().trim().min(1).max(5000).optional(),
      supplierPolicy: z.string().trim().min(1).max(2000).optional(),
      referralPolicy: z.string().trim().min(1).max(2000).optional(),
      settlementCondition: z.string().trim().min(1).max(2000).optional(),
      status: z.string().optional()
    }).parse(request.body);
    const existing = await app.prisma.jobDemand.findFirst({ where: andWhere(portalJobWhere(user), { id }), include: jobInclude });
    if (!existing) notFound("岗位需求");
    const salary = patch.salaryMin !== undefined || patch.salaryMax !== undefined
      ? `${patch.salaryMin ?? mapPortalJob(existing).salary_min}-${patch.salaryMax ?? mapPortalJob(existing).salary_max}元/月`
      : undefined;
    const updated = await app.prisma.$transaction(async (tx) => {
      if (patch.supplierPolicy && existing.supplierPolicyId) await tx.policy.update({ where: { id: existing.supplierPolicyId }, data: { achievementConditions: patch.supplierPolicy, notes: patch.settlementCondition } });
      if (patch.referralPolicy && existing.referralPolicyId) await tx.policy.update({ where: { id: existing.referralPolicyId }, data: { achievementConditions: patch.referralPolicy, notes: patch.settlementCondition } });
      const job = await tx.jobDemand.update({ where: { id }, data: {
        title: patch.title,
        requiredCount: patch.headcount,
        salary,
        deadline: patch.deadline,
        workTime: patch.workTime,
        requirements: patch.requirements,
        status: jobStatus(patch.status)
      }, include: jobInclude });
      await writeAudit(tx, request, { action: "PORTAL_JOB_UPDATE", resourceType: "JobDemand", resourceId: id, before: { title: existing.title, status: existing.status, requiredCount: existing.requiredCount }, after: { title: job.title, status: job.status, requiredCount: job.requiredCount } });
      return job;
    });
    const [withProgress] = await attachRecruitmentProgress(app.prisma, [updated]);
    return mapPortalJob(withProgress);
  });

  app.get("/portal/people", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.PEOPLE_READ);
    const query = z.object({
      query: z.string().trim().max(120).optional(),
      status: z.string().optional(),
      projectId: uuidSchema.optional(),
      supplierId: uuidSchema.optional(),
      interviewFrom: z.coerce.date().optional(),
      interviewTo: z.coerce.date().optional(),
      onboardFrom: z.coerce.date().optional(),
      onboardTo: z.coerce.date().optional()
    }).parse(request.query);
    const endOf = (value?: Date) => value ? new Date(value.getTime() + 86_400_000) : undefined;
    const items = await app.prisma.person.findMany({
      where: andWhere(personWhere(user), statusFilter(query.status), {
        projectId: query.projectId,
        supplierId: query.supplierId,
        OR: query.query ? [
          { name: { contains: query.query, mode: "insensitive" } },
          { phone: { contains: query.query } }
        ] : undefined,
        interviewDate: query.interviewFrom || query.interviewTo ? { gte: query.interviewFrom, lt: endOf(query.interviewTo) } : undefined,
        onboardDate: query.onboardFrom || query.onboardTo ? { gte: query.onboardFrom, lt: endOf(query.onboardTo) } : undefined
      }),
      include: personInclude,
      orderBy: { updatedAt: "desc" },
      take: 500
    });
    return items.map(mapPortalPerson);
  });

  app.get("/portal/people/:id", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.PEOPLE_READ);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const person = await app.prisma.person.findFirst({ where: andWhere(personWhere(user), { id }), include: personInclude });
    if (!person) notFound("人员档案");
    return mapPortalPerson(person);
  });

  app.patch("/portal/people/:id/status", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.PEOPLE_WRITE);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const input = z.object({
      status: z.string().min(1),
      note: z.string().trim().max(500).optional(),
      onboardDate: z.coerce.date().optional(),
      insuranceStatus: z.string().optional(),
      departureDate: z.coerce.date().optional(),
      departureReason: z.string().trim().max(500).optional()
    }).parse(request.body);
    if (input.status === "employed") {
      const payload = onboardingSchema.parse({
        onboardDate: input.onboardDate,
        insuranceTypes: input.insuranceStatus === "active" ? [InsuranceType.SOCIAL] : [],
        notes: input.note
      });
      await app.prisma.$transaction((tx) => onboardPerson(tx, app.config, request, user, id, payload));
    } else if (input.status === "departed") {
      const payload = offboardingSchema.parse({ offboardDate: input.departureDate, offboardReason: input.departureReason, insuranceTypes: [], notes: input.note });
      await app.prisma.$transaction((tx) => offboardPerson(tx, app.config, request, user, id, payload));
    } else {
      const target = portalStatusTarget(input.status);
      await app.prisma.$transaction(async (tx) => {
        const before = await tx.person.findFirst({ where: andWhere(personWhere(user), { id }) });
        if (!before) notFound("人员档案");
        const updated = await tx.person.update({ where: { id }, data: { status: target.status, interviewStatus: target.interviewStatus, notes: input.note ?? undefined } });
        const application = await tx.application.findFirst({ where: { personId: id }, orderBy: { appliedAt: "desc" } });
        if (application) await tx.application.update({ where: { id: application.id }, data: { employmentStatus: target.status, interviewStatus: target.interviewStatus } });
        await tx.personStatusLog.create({ data: { personId: id, fromStatus: before.status, toStatus: target.status, interviewStatus: target.interviewStatus, action: "PORTAL_STATUS_UPDATE", notes: input.note, actorId: user.id } });
        await writeAudit(tx, request, { action: "PORTAL_PERSON_STATUS_UPDATE", resourceType: "Person", resourceId: id, before: { status: before.status, interviewStatus: before.interviewStatus }, after: { status: updated.status, interviewStatus: updated.interviewStatus } });
      });
    }
    const person = await app.prisma.person.findUnique({ where: { id }, include: personInclude });
    return mapPortalPerson(person);
  });

  app.post("/portal/people/on-site", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = getSession(request);
    requirePermission(user, Permission.APPLICATION_CREATE);
    const input = z.object({ name: z.string(), phone: z.string(), idCard: z.string(), projectId: uuidSchema, jobId: uuidSchema, supplierId: uuidSchema.optional().or(z.literal("")) }).parse(request.body);
    const result = await registerPerson(app.prisma, app.config, request, personRegistrationSchema.parse({
      name: input.name, phone: input.phone, idCard: input.idCard, projectId: input.projectId,
      jobDemandId: input.jobId, jobTitle: "现场报名", interviewDate: new Date(),
      supplierId: input.supplierId || null, source: input.supplierId ? ApplicationSource.SUPPLIER : ApplicationSource.OPERATOR,
      notes: "现场快捷报名"
    }), user);
    await app.prisma.$transaction(async (tx) => {
      await tx.person.update({ where: { id: result.person.id }, data: { status: EmploymentStatus.INTERVIEWING, interviewStatus: InterviewStatus.ARRIVED } });
      if (result.application) await tx.application.update({ where: { id: result.application.id }, data: { employmentStatus: EmploymentStatus.INTERVIEWING, interviewStatus: InterviewStatus.ARRIVED } });
      await tx.personStatusLog.create({ data: { personId: result.person.id, fromStatus: result.person.status, toStatus: EmploymentStatus.INTERVIEWING, interviewStatus: InterviewStatus.ARRIVED, action: "PORTAL_ON_SITE_REGISTRATION", notes: "现场扫码/快捷报名", actorId: user.id } });
    });
    const person = await app.prisma.person.findUnique({ where: { id: result.person.id }, include: personInclude });
    return reply.status(201).send(mapPortalPerson(person));
  });

  app.post("/portal/jobs/:id/apply", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = getSession(request);
    requirePermission(user, Permission.APPLICATION_CREATE);
    if (!user.personId) throw new AppError(409, "PERSON_PROFILE_REQUIRED", "当前演示身份尚未绑定人员档案");
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const job = await app.prisma.jobDemand.findFirst({ where: andWhere(portalJobWhere(user), { id, status: JobStatus.RECRUITING }) });
    if (!job) notFound("招聘岗位");
    const latest = await app.prisma.application.findFirst({ where: { personId: user.personId, jobDemandId: id }, orderBy: { appliedAt: "desc" } });
    if (!latest || latest.employmentStatus === EmploymentStatus.LEFT) {
      await app.prisma.application.create({ data: { personId: user.personId, jobDemandId: id, source: ApplicationSource.SELF } });
    }
    return reply.status(201).send({ ok: true });
  });

  app.get("/portal/favorites", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const rows = await app.prisma.portalFavorite.findMany({ where: { userId: user.id }, include: { jobDemand: { include: jobInclude } }, orderBy: { createdAt: "desc" } });
    const jobs = await attachRecruitmentProgress(app.prisma, rows.map((row) => row.jobDemand));
    return jobs.map(mapPortalJob);
  });

  app.put("/portal/favorites/:id", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const existing = await app.prisma.portalFavorite.findUnique({ where: { userId_jobDemandId: { userId: user.id, jobDemandId: id } } });
    if (existing) {
      await app.prisma.portalFavorite.delete({ where: { userId_jobDemandId: { userId: user.id, jobDemandId: id } } });
      return { favorite: false };
    }
    await app.prisma.portalFavorite.create({ data: { userId: user.id, jobDemandId: id } });
    return { favorite: true };
  });

  app.get("/portal/messages", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const items = await app.prisma.notification.findMany({ where: { recipientUserId: user.id }, include: { portalReads: { where: { userId: user.id }, select: { readAt: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return items.map((item) => ({ id: item.id, type: item.type, title: item.title, content: item.content, targetPath: item.targetPath ?? "/", isRead: item.portalReads.length > 0, createdAt: dateTime(item.createdAt) }));
  });

  app.patch("/portal/messages/:id/read", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const notification = await app.prisma.notification.findFirst({ where: { id, recipientUserId: user.id }, select: { id: true } });
    if (!notification) notFound("消息");
    await app.prisma.portalNotificationRead.upsert({ where: { userId_notificationId: { userId: user.id, notificationId: id } }, create: { userId: user.id, notificationId: id }, update: { readAt: new Date() } });
    return { ok: true };
  });

  app.patch("/portal/messages/read-all", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const notifications = await app.prisma.notification.findMany({ where: { recipientUserId: user.id }, select: { id: true } });
    const result = await app.prisma.portalNotificationRead.createMany({ data: notifications.map((item) => ({ userId: user.id, notificationId: item.id })), skipDuplicates: true });
    return { ok: true, updated: result.count };
  });

  app.get("/portal/referrals", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const records = await app.prisma.referralRecord.findMany({ where: { recommenderUserId: user.id }, include: { person: true, jobDemand: { include: { project: true } }, reward: true }, orderBy: { createdAt: "desc" } });
    return records.map((item) => ({
      id: item.id,
      status: portalPersonStatus(item.person.status, item.person.interviewStatus),
      reward: amount(item.reward?.amount),
      rewardStatus: item.reward?.status?.toLowerCase() ?? "pending",
      createdAt: dateTime(item.createdAt),
      name: item.person.name,
      phone: item.person.phone,
      jobTitle: item.jobDemand.title,
      projectName: item.jobDemand.project.name,
      onboardDate: dateOnly(item.person.onboardDate)
    }));
  });

  app.post("/portal/referrals", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = getSession(request);
    requirePermission(user, Permission.REFERRAL_CREATE);
    const body = z.object({ name: z.string(), phone: z.string(), idCard: z.string(), jobId: uuidSchema }).parse(request.body);
    const job = await app.prisma.jobDemand.findUnique({ where: { id: body.jobId } });
    if (!job) notFound("招聘岗位");
    const result = await registerPerson(app.prisma, app.config, request, personRegistrationSchema.parse({
      name: body.name, phone: body.phone, idCard: body.idCard, projectId: job.projectId,
      jobDemandId: job.id, jobTitle: job.title, source: ApplicationSource.REFERRAL, notes: `由${user.displayName}推荐`
    }), user);
    return reply.status(201).send({ ok: true, personId: result.person.id });
  });

  app.get("/portal/payroll", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    if (!user.personId) return [];
    const slips = await app.prisma.salarySlip.findMany({ where: { personId: user.personId, status: "PUBLISHED" }, orderBy: { salaryMonth: "desc" } });
    return slips.map((item) => ({
      id: item.id,
      month: item.salaryMonth,
      gross: amount(item.grossPay),
      net: amount(item.netPay),
      details: {
        hourlyPay: amount(item.hourlyPay), overtimePay: amount(item.overtimePay), allowance: amount(item.allowance),
        referralReward: amount(item.referralReward), socialSecurityDeduction: amount(item.socialSecurityDeduction), otherDeduction: amount(item.otherDeduction)
      },
      publishedAt: dateTime(item.publishedAt)
    }));
  });

  app.get("/portal/advances", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const own = user.role === UserRole.EMPLOYEE || user.role === UserRole.JOB_SEEKER;
    const rows = await app.prisma.portalAdvance.findMany({ where: own ? { creatorUserId: user.id } : { status: { in: ["submitted", "processing"] }, person: personWhere(user) }, include: { person: true }, orderBy: { createdAt: "desc" } });
    return rows.map((item) => ({ id: item.id, name: item.person.name, phone: item.person.phone, amount: amount(item.amount), reason: item.reason, status: item.status, reply: item.reply, created_at: dateTime(item.createdAt) }));
  });

  app.post("/portal/advances", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = getSession(request);
    if (user.role !== UserRole.EMPLOYEE || !user.personId) throw new AppError(403, "FORBIDDEN", "仅在职员工可以提交借支申请");
    const body = z.object({ amount: z.coerce.number().positive().max(100000), reason: z.string().trim().min(1).max(1000) }).parse(request.body);
    const row = await app.prisma.portalAdvance.create({ data: { personId: user.personId, creatorUserId: user.id, amount: body.amount, reason: body.reason } });
    return reply.status(201).send({ id: row.id, status: row.status });
  });

  app.patch("/portal/advances/:id", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.PEOPLE_WRITE);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({ decision: z.enum(["processing", "resolved", "rejected"]), reply: z.string().trim().min(1).max(1000) }).parse(request.body);
    const row = await app.prisma.portalAdvance.findFirst({ where: { id, person: personWhere(user) } });
    if (!row) notFound("借支申请");
    await app.prisma.portalAdvance.update({ where: { id }, data: { status: body.decision, reply: body.reply } });
    await addNotification(app, row.creatorUserId, "借支申请状态已更新", body.reply, "/personal/me/advances");
    return { ok: true };
  });

  app.get("/portal/appeals", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const rows = await app.prisma.portalAppeal.findMany({ where: portalAppealWhere(user), include: { creator: { select: { displayName: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map((item) => ({ id: item.id, creatorName: item.creator.displayName, creatorRole: item.creator.role, type: item.type, description: item.description, requested_amount: item.requestedAmount ? amount(item.requestedAmount) : undefined, expected_status: item.expectedStatus, status: item.status, reply: item.reply, created_at: dateTime(item.createdAt) }));
  });

  app.post("/portal/appeals", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = getSession(request);
    const body = z.object({ type: z.string().trim().min(1).max(64), subjectId: z.string().max(128).optional(), description: z.string().trim().min(1).max(3000), requestedAmount: z.coerce.number().nonnegative().optional(), expectedStatus: z.string().max(64).optional(), attachmentIds: z.array(z.string()).max(10).default([]) }).parse(request.body);
    const row = await app.prisma.portalAppeal.create({ data: { creatorUserId: user.id, ...body } });
    return reply.status(201).send({ id: row.id, status: row.status });
  });

  app.patch("/portal/appeals/:id/resolve", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.PEOPLE_WRITE);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({ decision: z.enum(["processing", "resolved", "rejected"]), reply: z.string().trim().min(1).max(1000) }).parse(request.body);
    const row = await app.prisma.portalAppeal.findFirst({
      where: andWhere(portalAppealWhere(user), { id })
    });
    if (!row) notFound("申诉");
    await app.prisma.$transaction(async (tx) => {
      await tx.portalAppeal.update({ where: { id }, data: { status: body.decision, reply: body.reply, handlerUserId: user.id } });
      await writeAudit(tx, request, {
        action: "portal.appeal.resolve",
        resourceType: "PortalAppeal",
        resourceId: id,
        before: { status: row.status },
        after: { status: body.decision, handlerUserId: user.id }
      });
    });
    await addNotification(app, row.creatorUserId, "申诉处理结果已更新", body.reply, "/personal/me/appeals");
    return { ok: true };
  });

  app.post("/portal/attachments", { preHandler: [app.authenticate] }, async (request, reply) => {
    getSession(request);
    const file = await request.file();
    if (!file) throw new AppError(400, "FILE_REQUIRED", "请选择附件");
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (!allowed.has(file.mimetype)) throw new AppError(415, "UNSUPPORTED_FILE", "仅支持 JPG、PNG、WebP 或 PDF");
    const saved = await app.fileStore.save({ stream: file.file, filename: file.filename, mimeType: file.mimetype });
    return reply.status(201).send({ id: saved.storageKey, originalName: saved.originalName, mimeType: saved.mimeType, size: saved.sizeBytes, createdAt: new Date().toISOString() });
  });

  app.get("/portal/settlements", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    if (!isSupplierPortalRole(user) || !user.supplierId) throw new AppError(403, "FORBIDDEN", "仅供应商可以查看结算");
    const { month } = z.object({ month: monthSchema.default("2026-07") }).parse(request.query);
    const row = await app.prisma.portalSettlement.findUnique({ where: { supplierId_month: { supplierId: user.supplierId, month } }, include: { items: { include: { person: { include: { project: true } } }, orderBy: { person: { name: "asc" } } } } });
    if (!row) return { month, overview: { dueAmount: 0, confirmedAmount: 0, pendingAmount: 0, disputedAmount: 0 }, items: [] };
    return {
      id: row.id, month: row.month, status: row.status,
      overview: { dueAmount: amount(row.dueAmount), confirmedAmount: amount(row.confirmedAmount), pendingAmount: amount(row.pendingAmount), disputedAmount: amount(row.disputedAmount) },
      items: row.items.map((item) => ({ id: item.id, personId: item.personId, name: item.person.name, phone: item.person.phone, onboardDate: dateOnly(item.person.onboardDate), projectName: item.person.project.name, jobTitle: item.person.jobTitle, policy: item.policy, employmentDays: item.employmentDays, dueAmount: amount(item.dueAmount), actualAmount: amount(item.actualAmount), status: item.status }))
    };
  });

  app.post("/portal/settlements/:id/confirm", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    if (!isSupplierPortalRole(user) || !user.supplierId) throw new AppError(403, "FORBIDDEN", "仅供应商可以确认结算");
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const row = await app.prisma.portalSettlement.findFirst({ where: { id, supplierId: user.supplierId } });
    if (!row) notFound("结算单");
    await app.prisma.portalSettlement.update({ where: { id }, data: { confirmedAmount: amount(row.dueAmount) - amount(row.disputedAmount), pendingAmount: 0, status: amount(row.disputedAmount) > 0 ? "partially_disputed" : "confirmed" } });
    return { ok: true };
  });

  app.get("/portal/supplier/profile", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    if (!isSupplierPortalRole(user) || !user.supplierId) throw new AppError(403, "FORBIDDEN", "仅供应商可以查看");
    const supplier = await app.prisma.supplier.findUnique({ where: { id: user.supplierId }, include: { projectLinks: true, _count: { select: { people: true } } } });
    if (!supplier) notFound("供应商");
    return { id: supplier.id, name: supplier.name, contact: supplier.contactName ?? user.displayName, phone: supplier.contactPhone ?? "", grade: supplier.level ?? "A", projectCount: supplier.projectLinks.length, monthlyPeople: await app.prisma.person.count({ where: { supplierId: supplier.id, createdAt: { gte: monthBounds("2026-07").start, lt: monthBounds("2026-07").end } } }) };
  });

  app.post("/portal/qrcodes", {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const user = getSession(request);
    requirePermission(user, Permission.APPLICATION_CREATE);
    const body = z.object({ projectId: uuidSchema, jobId: uuidSchema.optional() }).parse(request.body);
    const project = await app.prisma.project.findFirst({ where: andWhere(projectWhere(user), { id: body.projectId }) });
    if (!project) throw new AppError(403, "OUT_OF_SCOPE", "只能为授权项目生成报名二维码");
    if (body.jobId) {
      const job = await app.prisma.jobDemand.findFirst({
        where: {
          id: body.jobId,
          projectId: body.projectId,
          status: JobStatus.RECRUITING
        },
        select: { id: true }
      });
      if (!job) {
        throw new AppError(400, "PROJECT_JOB_MISMATCH", "岗位不属于目标项目或当前不可报名");
      }
    }
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const token = randomBytes(24).toString("hex");
    const row = await app.prisma.portalQrCode.create({ data: { token, projectId: body.projectId, jobDemandId: body.jobId, createdByUserId: user.id, expiresAt } });
    const signupUrl = `/scan/${token}`;
    const dataUrl = await QRCode.toDataURL(signupUrl, { width: 420, margin: 2, color: { dark: "#0a1730", light: "#ffffff" } });
    return reply.status(201).send({ id: row.id, token, createdAt: dateTime(createdAt), expiresAt: dateTime(expiresAt), signupUrl, dataUrl });
  });

  app.get("/portal/qrcodes/:token", async (request) => {
    const { token } = z.object({ token: z.string().min(32).max(64) }).parse(request.params);
    const row = await app.prisma.portalQrCode.findUnique({ where: { token }, include: { project: true, jobDemand: true } });
    if (!row) notFound("报名二维码");
    if (row.expiresAt <= new Date()) throw new AppError(410, "QR_EXPIRED", "报名二维码已失效，请联系现场重新生成");
    return { token, projectId: row.projectId, projectName: row.project.name, jobId: row.jobDemandId ?? undefined, jobTitle: row.jobDemand?.title, interviewDate: dateOnly(new Date()), source: "现场扫码报名", expiresAt: dateTime(row.expiresAt) };
  });

  app.post("/portal/qrcodes/:token/register", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const { token } = z.object({ token: z.string().min(32).max(64) }).parse(request.params);
    const row = await app.prisma.portalQrCode.findUnique({ where: { token }, include: { jobDemand: true } });
    if (!row) notFound("报名二维码");
    if (row.expiresAt <= new Date()) throw new AppError(410, "QR_EXPIRED", "报名二维码已失效，请联系现场重新生成");
    const body = z.object({ name: z.string(), phone: z.string(), idCard: z.string() }).parse(request.body);
    const job = row.jobDemand ?? await app.prisma.jobDemand.findFirst({ where: { projectId: row.projectId, status: JobStatus.RECRUITING }, orderBy: { deadline: "asc" } });
    if (!job) throw new AppError(409, "JOB_UNAVAILABLE", "该项目暂无可报名岗位");
    const result = await registerPerson(app.prisma, app.config, request, personRegistrationSchema.parse({ name: body.name, phone: body.phone, idCard: body.idCard, projectId: row.projectId, jobDemandId: job.id, jobTitle: job.title, interviewDate: new Date(), source: ApplicationSource.SELF, notes: "现场扫码报名" }), null);
    return reply.status(201).send({ ok: true, personId: result.person.id });
  });

  app.get("/portal/audit-logs", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    requirePermission(user, Permission.AUDIT_READ);
    const rows = await app.prisma.auditLog.findMany({ where: auditScopeWhere(user), include: { actor: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((item) => ({ id: item.id, actorName: item.actor?.displayName ?? "系统", action: item.action, entityType: item.resourceType, detail: item.resourceId ?? "", created_at: dateTime(item.createdAt) }));
  });
}
