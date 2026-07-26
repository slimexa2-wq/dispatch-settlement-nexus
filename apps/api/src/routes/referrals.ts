import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ApplicationSource,
  Permission,
  RewardStatus,
  applicationSchema,
  idSchema,
  rewardUpdateSchema
} from "@xiangneng/shared";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { registerPerson } from "../services/registration.js";
import { writeAudit } from "../audit.js";
import { createKeyNotifications } from "../notifications.js";
import { createReferralShare, resolvePublicReferralShare } from "../services/referral-share.js";

const rewardQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  status: z.nativeEnum(RewardStatus).optional()
});

export async function referralRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/referral-shares/:token", async (request) => {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }).parse(request.params);
    const share = await resolvePublicReferralShare(app.prisma, token);
    return success(request, { jobDemandId: share.jobDemandId, token: share.token });
  });

  app.post("/referrals/share-token", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REFERRAL_CREATE)]
  }, async (request, reply) => {
    const { jobDemandId } = z.object({ jobDemandId: idSchema }).parse(request.body);
    const user = getSession(request);
    const share = await createReferralShare(app.prisma, { jobDemandId, recommenderUserId: user.id });
    return reply.status(201).send(success(request, {
      token: share.token,
      jobDemandId: share.jobDemandId,
      expiresAt: share.expiresAt,
      path: `/pages/jobs/detail/index?id=${share.jobDemandId}&ref=${share.token}`
    }));
  });

  app.post("/referrals", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REFERRAL_CREATE)]
  }, async (request, reply) => {
    const user = getSession(request);
    const input = applicationSchema.parse({
      ...(request.body as Record<string, unknown>),
      source: ApplicationSource.REFERRAL,
      recommenderUserId: user.id
    });
    const result = await registerPerson(app.prisma, app.config, request, input, user);
    return reply.status(result.deduplicated ? 200 : 201).send(success(request, result));
  });

  app.get("/referrals/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const items = await app.prisma.referralRecord.findMany({
      where: { recommenderUserId: user.id },
      include: {
        person: { select: { id: true, name: true, phone: true, status: true, interviewDate: true, onboardDate: true, project: { select: { id: true, name: true } } } },
        jobDemand: { select: { id: true, title: true } },
        reward: true
      },
      orderBy: { createdAt: "desc" }
    });
    return success(request, items);
  });

  app.get("/referral-rewards/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const items = await app.prisma.referralReward.findMany({
      where: { referral: { recommenderUserId: user.id } },
      include: { referral: { include: { person: { select: { id: true, name: true } }, jobDemand: { select: { id: true, title: true } } } }, policy: { select: { id: true, name: true, version: true } } },
      orderBy: { createdAt: "desc" }
    });
    return success(request, items);
  });

  app.get("/referral-rewards", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REWARD_REVIEW)]
  }, async (request) => {
    const query = rewardQuerySchema.parse(request.query);
    const { page, pageSize, skip } = parsePagination(query);
    const where = { status: query.status };
    const [items, total] = await app.prisma.$transaction([
      app.prisma.referralReward.findMany({
        where,
        include: {
          referral: {
            include: {
              person: { select: { id: true, name: true, status: true, onboardDate: true } },
              recommender: { select: { id: true, displayName: true } },
              jobDemand: { select: { id: true, title: true, project: { select: { id: true, name: true } } } }
            }
          },
          policy: true
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      app.prisma.referralReward.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.patch("/referral-rewards/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REWARD_REVIEW)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = rewardUpdateSchema.parse(request.body);
    const existing = await app.prisma.referralReward.findUnique({
      where: { id },
      include: { referral: true }
    });
    if (!existing) notFound("推荐奖励");
    if (existing.status === RewardStatus.PAID && input.status !== RewardStatus.PAID) {
      throw new AppError(409, "PAID_REWARD_IMMUTABLE", "已发放奖励不能回退状态");
    }
    const reward = await app.prisma.referralReward.update({
      where: { id },
      data: {
        status: input.status,
        notes: input.notes,
        achievedAt: input.status === RewardStatus.ACHIEVED ? new Date() : undefined,
        paidAt: input.status === RewardStatus.PAID ? new Date() : undefined
      }
    });
    await writeAudit(app.prisma, request, {
      action: "REFERRAL_REWARD_UPDATE",
      resourceType: "ReferralReward",
      resourceId: id,
      before: { status: existing.status },
      after: { status: reward.status }
    });
    await createKeyNotifications(app.prisma, app.config, {
      personId: existing.referral.personId,
      recommenderUserId: existing.referral.recommenderUserId,
      type: input.status === RewardStatus.PAID ? "REFERRAL_REWARD_PAID" : "REFERRAL_REWARD_CHANGED",
      title: input.status === RewardStatus.PAID ? "推荐奖励已发放" : "推荐奖励状态更新",
      content: `推荐奖励状态已更新为 ${input.status}`,
      targetPath: "/pages/referrals/rewards/index",
      dedupeKey: `REFERRAL_REWARD:${id}:${input.status}`
    });
    return success(request, reward);
  });
}
