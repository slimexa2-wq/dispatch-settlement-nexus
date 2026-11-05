import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ApplicationSource,
  EmploymentStatus,
  InterviewStatus,
  Permission,
  UserRole,
  applicationSchema,
  idSchema,
  interviewUpdateSchema
} from "@xiangneng/shared";
import { andWhere, applicationWhere } from "../data-scope.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { registerPerson } from "../services/registration.js";
import { resolveReferralShare } from "../services/referral-share.js";
import { writeAudit } from "../audit.js";
import { AppError } from "../errors.js";

const publicApplicationSchema = applicationSchema.extend({
  referralToken: z.string().trim().min(16).max(32).optional()
});

const applicationQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  jobDemandId: idSchema.optional(),
  source: z.nativeEnum(ApplicationSource).optional(),
  supplierId: idSchema.optional(),
  recommenderUserId: idSchema.optional()
  ,keyword: z.string().trim().max(100).optional()
  ,interviewStatus: z.nativeEnum(InterviewStatus).optional()
});

export async function applicationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/public/applications", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const parsed = publicApplicationSchema.parse(request.body);
    const { referralToken, ...input } = parsed;
    const share = referralToken ? await resolveReferralShare(app.prisma, referralToken, input.jobDemandId) : null;
    await registerPerson(app.prisma, app.config, request, input, null, share?.recommenderUserId);
    return reply.status(202).send(success(request, {
      received: true,
      message: "报名请求已接收；请登录或绑定本人身份后查看报名进度"
    }));
  });

  app.post("/applications", {
    preHandler: [app.authenticate, app.requirePermission(Permission.APPLICATION_CREATE)]
  }, async (request, reply) => {
    const parsed = publicApplicationSchema.parse(request.body);
    const { referralToken, ...input } = parsed;
    const share = referralToken ? await resolveReferralShare(app.prisma, referralToken, input.jobDemandId) : null;
    const result = await registerPerson(app.prisma, app.config, request, input, getSession(request), share?.recommenderUserId);
    return reply.status(result.deduplicated ? 200 : 201).send(success(request, result));
  });

  app.get("/applications", { preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_READ)] }, async (request) => {
    const query = applicationQuerySchema.parse(request.query);
    const user = getSession(request);
    const { page, pageSize, skip } = parsePagination(query);
    const where = andWhere(applicationWhere(user), {
      jobDemandId: query.jobDemandId,
      source: query.source,
      supplierId: query.supplierId,
      recommenderUserId: query.recommenderUserId,
      interviewStatus: query.interviewStatus
    }, query.keyword ? {
      OR: [
        { person: { name: { contains: query.keyword, mode: "insensitive" as const } } },
        { person: { idCard: { contains: query.keyword, mode: "insensitive" as const } } },
        { person: { phone: { contains: query.keyword } } }
      ]
    } : {});
    const [items, total] = await app.prisma.$transaction([
      app.prisma.application.findMany({
        where,
        include: {
          person: { select: { id: true, name: true, idCard: true, phone: true, status: true, interviewStatus: true, interviewDate: true, onboardDate: true } },
          jobDemand: { include: { project: { select: { id: true, name: true, branchId: true } } } },
          supplier: { select: { id: true, name: true } },
          recommender: { select: { id: true, displayName: true } }
        },
        orderBy: { appliedAt: "desc" },
        skip,
        take: pageSize
      }),
      app.prisma.application.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.get("/applications/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    if (user.role !== UserRole.SUPPLIER && user.role !== UserRole.EMPLOYEE && user.role !== UserRole.JOB_SEEKER) {
      throw new AppError(403, "FORBIDDEN", "该角色没有“我的报名”视图");
    }
    const items = await app.prisma.application.findMany({
      where: applicationWhere(user),
      include: {
        jobDemand: { include: { project: true } },
        person: {
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            interviewStatus: true,
            interviewDate: true,
            onboardDate: true
          }
        }
      },
      orderBy: { appliedAt: "desc" },
      take: 200
    });
    return success(request, items);
  });

  app.patch("/applications/:id/interview", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_WRITE)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = interviewUpdateSchema.extend({ interviewDate: z.coerce.date().optional().nullable() }).parse(request.body);
    const user = getSession(request);
    const application = await app.prisma.application.findFirst({
      where: andWhere(applicationWhere(user), { id }),
      include: { person: true }
    });
    if (!application) throw new AppError(404, "NOT_FOUND", "报名记录不存在或无权访问");
    const nextStatus = input.status === InterviewStatus.PENDING_ARRIVAL || input.status === InterviewStatus.ARRIVED
      ? EmploymentStatus.INTERVIEWING
      : input.status === InterviewStatus.PASSED
        ? EmploymentStatus.PENDING_ONBOARD
        : EmploymentStatus.APPLICANT;
    const updated = await app.prisma.$transaction(async (tx) => {
      const saved = await tx.application.update({
        where: { id },
        data: { interviewStatus: input.status, interviewDate: input.interviewDate, employmentStatus: nextStatus }
      });
      const latest = await tx.application.findFirst({ where: { personId: application.personId }, orderBy: { appliedAt: "desc" }, select: { id: true } });
      if (latest?.id === id) {
        await tx.person.update({
          where: { id: application.personId },
          data: { interviewStatus: input.status, interviewDate: input.interviewDate ?? undefined, status: nextStatus, notes: input.notes ?? undefined }
        });
      }
      await writeAudit(tx, request, {
        action: "APPLICATION_INTERVIEW_UPDATE",
        resourceType: "Application",
        resourceId: id,
        before: { interviewStatus: application.interviewStatus, employmentStatus: application.employmentStatus },
        after: { interviewStatus: input.status, employmentStatus: nextStatus }
      });
      return saved;
    });
    return success(request, updated);
  });
}
