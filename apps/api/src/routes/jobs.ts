import type { FastifyInstance } from "fastify";
import type { Prisma } from "../generated/prisma/client.js";
import { z } from "zod";
import {
  EmploymentStatus,
  JobStatus,
  NotificationStatus,
  Permission,
  PolicyType,
  UserRole,
  idSchema,
  jobDemandSchema
} from "@xiangneng/shared";
import { andWhere, projectWhere } from "../data-scope.js";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { writeAudit } from "../audit.js";
import { attachRecruitmentProgress as attachProgress } from "../services/recruitment-progress.js";

const jobQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  projectId: idSchema.optional(),
  branchId: idSchema.optional(),
  status: z.nativeEnum(JobStatus).optional(),
  keyword: z.string().trim().max(120).optional()
});

function jobScope(user: ReturnType<typeof getSession>): Prisma.JobDemandWhereInput {
  if (user.role === UserRole.EMPLOYEE || user.role === UserRole.JOB_SEEKER) {
    return { status: JobStatus.RECRUITING, deadline: { gte: new Date() } };
  }
  return { project: projectWhere(user) };
}

async function validatePolicies(app: FastifyInstance, input: {
  projectId: string;
  supplierPolicyId?: string | null;
  referralPolicyId?: string | null;
}): Promise<void> {
  if (input.supplierPolicyId) {
    const policy = await app.prisma.policy.findFirst({
      where: { id: input.supplierPolicyId, projectId: input.projectId, type: PolicyType.SUPPLIER, isActive: true }
    });
    if (!policy) throw new AppError(400, "INVALID_SUPPLIER_POLICY", "供应商政策不存在、已停用或不属于该项目");
    if ((!policy.supplierId && !policy.supplierLevel) || (policy.expiresAt && policy.expiresAt < new Date())) {
      throw new AppError(400, "INVALID_SUPPLIER_POLICY", "供应商政策缺少适用对象或已经失效");
    }
  }
  if (input.referralPolicyId) {
    const policy = await app.prisma.policy.findFirst({
      where: { id: input.referralPolicyId, projectId: input.projectId, type: PolicyType.EMPLOYEE_REFERRAL, isActive: true }
    });
    if (!policy) throw new AppError(400, "INVALID_REFERRAL_POLICY", "内部推荐政策不存在、已停用或不属于该项目");
    if (!policy.employeeType || (policy.expiresAt && policy.expiresAt < new Date())) {
      throw new AppError(400, "INVALID_REFERRAL_POLICY", "内部推荐政策缺少员工类型或已经失效");
    }
  }
}

async function createJobDemandNotifications(
  app: FastifyInstance,
  tx: Prisma.TransactionClient,
  job: { id: string; projectId: string; title: string }
): Promise<number> {
  const recipients = await tx.user.findMany({
    where: {
      isActive: true,
      role: UserRole.SUPPLIER,
      supplier: { projectLinks: { some: { projectId: job.projectId } } }
    },
    select: { id: true }
  });
  if (!recipients.length) return 0;
  const configured = Boolean(
    app.config.WECHAT_OFFICIAL_APP_ID
    && app.config.WECHAT_OFFICIAL_APP_SECRET
    && app.config.WECHAT_TEMPLATE_JOB_DEMAND
  );
  const result = await tx.notification.createMany({
    data: recipients.map((recipient) => ({
      recipientUserId: recipient.id,
      type: "JOB_DEMAND_PUBLISHED",
      title: "新招聘需求",
      content: `${job.title}招聘需求已发布`,
      targetPath: `/pages/jobs/detail/index?id=${job.id}`,
      dedupeKey: `JOB_DEMAND_PUBLISHED:${job.id}:${recipient.id}`,
      status: configured ? NotificationStatus.PENDING : NotificationStatus.SKIPPED_NOT_CONFIGURED,
      lastError: configured ? null : "招聘需求模板消息未配置，需求已同步到系统但未外发提醒"
    })),
    skipDuplicates: true
  });
  return result.count;
}

const jobInclude = {
  project: {
    include: {
      branch: { select: { id: true, name: true } },
      images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] }
    }
  },
  supplierPolicy: true,
  referralPolicy: true
};

type BoundPolicy = {
  supplierId: string | null;
  supplierLevel: string | null;
  employeeType: string | null;
  effectiveAt: Date;
  expiresAt: Date | null;
};

function policyEffective(policy: BoundPolicy | null, now = new Date()): boolean {
  return Boolean(policy && policy.effectiveAt <= now && (!policy.expiresAt || policy.expiresAt >= now));
}

function hidePolicies<T extends { supplierPolicy: BoundPolicy | null; referralPolicy: BoundPolicy | null; project: { managerPhone: string | null } }>(
  job: T,
  user: ReturnType<typeof getSession>,
  audience: { supplierLevel: string | null; employeeType: string | null },
  _revealContact = false
) {
  const role = user.role;
  const project = { ...job.project, managerPhone: job.project.managerPhone };
  if (role === UserRole.JOB_SEEKER) return { ...job, project, supplierPolicy: undefined, referralPolicy: undefined };
  if (role === UserRole.EMPLOYEE) {
    const applicable = policyEffective(job.referralPolicy) && job.referralPolicy?.employeeType === audience.employeeType;
    return { ...job, project, supplierPolicy: undefined, referralPolicy: applicable ? job.referralPolicy : undefined };
  }
  if (role === UserRole.SUPPLIER) {
    const applicable = policyEffective(job.supplierPolicy) && (
      job.supplierPolicy?.supplierId === user.supplierId ||
      (!job.supplierPolicy?.supplierId && job.supplierPolicy?.supplierLevel === audience.supplierLevel)
    );
    return { ...job, project, referralPolicy: undefined, supplierPolicy: applicable ? job.supplierPolicy : undefined };
  }
  return { ...job, project };
}

function publicJob<T extends {
  supplierPolicy: unknown;
  referralPolicy: unknown;
  project: {
    managerPhone: string | null;
    images: Array<{
      id: string;
      storageKey: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      sortOrder: number;
      note: string | null;
      createdAt: Date;
    }>;
  };
}>(job: T, _revealContact: boolean) {
  return {
    ...job,
    supplierPolicy: undefined,
    referralPolicy: undefined,
    project: {
      ...job.project,
      images: job.project.images.map(({ storageKey: _storageKey, ...image }) => ({
        ...image,
        contentPath: `/api/public/project-images/${image.id}/content`
      })),
      managerPhone: job.project.managerPhone
    }
  };
}

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/job-demands", async (request) => {
    const query = jobQuerySchema.parse(request.query);
    const { page, pageSize, skip } = parsePagination(query);
    const where = {
      projectId: query.projectId,
      project: query.branchId ? { branchId: query.branchId } : undefined,
      status: JobStatus.RECRUITING,
      deadline: { gte: new Date() },
      title: query.keyword ? { contains: query.keyword, mode: "insensitive" as const } : undefined
    };
    const [jobs, total] = await app.prisma.$transaction([
      app.prisma.jobDemand.findMany({ where, include: jobInclude, orderBy: { deadline: "asc" }, skip, take: pageSize }),
      app.prisma.jobDemand.count({ where })
    ]);
    const items = (await attachProgress(app.prisma, jobs)).map((job) => publicJob(job, false));
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.get("/public/job-demands/:id", async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const job = await app.prisma.jobDemand.findFirst({
      where: { id, status: JobStatus.RECRUITING, deadline: { gte: new Date() } },
      include: jobInclude
    });
    if (!job) notFound("招聘需求");
    const [withProgress] = await attachProgress(app.prisma, [job]);
    if (!withProgress) notFound("招聘需求");
    return success(request, publicJob(withProgress, true));
  });

  app.get("/job-demands", {
    preHandler: [app.authenticate, app.requirePermission(Permission.JOB_READ)]
  }, async (request) => {
    const query = jobQuerySchema.parse(request.query);
    const user = getSession(request);
    const account = await app.prisma.user.findUnique({ where: { id: user.id }, select: { employeeType: true, supplier: { select: { level: true } } } });
    const audience = { supplierLevel: account?.supplier?.level ?? null, employeeType: account?.employeeType ?? "普通员工" };
    const { page, pageSize, skip } = parsePagination(query);
    const where = andWhere(jobScope(user), {
      projectId: query.projectId,
      project: query.branchId ? { branchId: query.branchId } : undefined,
      status: query.status,
      title: query.keyword ? { contains: query.keyword, mode: "insensitive" as const } : undefined
    });
    const [jobs, total] = await app.prisma.$transaction([
      app.prisma.jobDemand.findMany({ where, include: jobInclude, orderBy: [{ status: "asc" }, { deadline: "asc" }], skip, take: pageSize }),
      app.prisma.jobDemand.count({ where })
    ]);
    const items = (await attachProgress(app.prisma, jobs)).map((job) => hidePolicies(job, user, audience));
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.get("/job-demands/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.JOB_READ)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    const account = await app.prisma.user.findUnique({ where: { id: user.id }, select: { employeeType: true, supplier: { select: { level: true } } } });
    const audience = { supplierLevel: account?.supplier?.level ?? null, employeeType: account?.employeeType ?? "普通员工" };
    const job = await app.prisma.jobDemand.findFirst({ where: andWhere(jobScope(user), { id }), include: jobInclude });
    if (!job) notFound("招聘需求");
    const [withProgress] = await attachProgress(app.prisma, [job]);
    if (!withProgress) notFound("招聘需求");
    return success(request, hidePolicies(withProgress, user, audience, true));
  });

  app.post("/job-demands", {
    preHandler: [app.authenticate, app.requirePermission(Permission.JOB_WRITE)]
  }, async (request, reply) => {
    const input = jobDemandSchema.parse(request.body);
    const user = getSession(request);
    const project = await app.prisma.project.findFirst({ where: andWhere(projectWhere(user), { id: input.projectId }), select: { id: true } });
    if (!project) notFound("项目");
    await validatePolicies(app, input);
    const job = await app.prisma.$transaction(async (tx) => {
      const created = await tx.jobDemand.create({ data: { ...input, createdById: user.id }, include: jobInclude });
      if (created.status === JobStatus.RECRUITING) await createJobDemandNotifications(app, tx, created);
      await writeAudit(tx, request, {
        action: "JOB_DEMAND_CREATE",
        resourceType: "JobDemand",
        resourceId: created.id,
        after: { projectId: created.projectId, title: created.title, requiredCount: created.requiredCount, status: created.status }
      });
      return created;
    });
    return reply.status(201).send(success(request, job));
  });

  app.patch("/job-demands/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.JOB_WRITE)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const patch = jobDemandSchema.partial().parse(request.body);
    const user = getSession(request);
    const existing = await app.prisma.jobDemand.findFirst({ where: andWhere(jobScope(user), { id }) });
    if (!existing) notFound("招聘需求");
    const projectId = patch.projectId ?? existing.projectId;
    const project = await app.prisma.project.findFirst({ where: andWhere(projectWhere(user), { id: projectId }), select: { id: true } });
    if (!project) notFound("项目");
    await validatePolicies(app, {
      projectId,
      supplierPolicyId: patch.supplierPolicyId === undefined ? existing.supplierPolicyId : patch.supplierPolicyId,
      referralPolicyId: patch.referralPolicyId === undefined ? existing.referralPolicyId : patch.referralPolicyId
    });
    const job = await app.prisma.$transaction(async (tx) => {
      const updated = await tx.jobDemand.update({ where: { id }, data: patch, include: jobInclude });
      if (existing.status !== JobStatus.RECRUITING && updated.status === JobStatus.RECRUITING) {
        await createJobDemandNotifications(app, tx, updated);
      }
      await writeAudit(tx, request, {
        action: "JOB_DEMAND_UPDATE",
        resourceType: "JobDemand",
        resourceId: id,
        before: { projectId: existing.projectId, requiredCount: existing.requiredCount, status: existing.status },
        after: { projectId: updated.projectId, requiredCount: updated.requiredCount, status: updated.status }
      });
      return updated;
    });
    return success(request, job);
  });
}
