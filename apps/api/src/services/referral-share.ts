import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import { JobStatus } from "@xiangneng/shared";
import { AppError, notFound } from "../errors.js";

export async function createReferralShare(
  prisma: PrismaClient,
  input: { jobDemandId: string; recommenderUserId: string }
) {
  const job = await prisma.jobDemand.findUnique({ where: { id: input.jobDemandId }, select: { id: true, status: true, deadline: true } });
  if (!job) notFound("招聘需求");
  if (job.status !== JobStatus.RECRUITING || job.deadline < new Date()) {
    throw new AppError(409, "JOB_NOT_OPEN", "该招聘需求当前不可分享推荐");
  }
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Math.min(job.deadline.getTime(), Date.now() + 30 * 24 * 60 * 60 * 1000));
  return prisma.referralShare.create({
    data: { token, jobDemandId: job.id, recommenderUserId: input.recommenderUserId, expiresAt }
  });
}

export async function resolveReferralShare(prisma: PrismaClient, token: string, jobDemandId: string) {
  const share = await resolvePublicReferralShare(prisma, token);
  if (share.jobDemandId !== jobDemandId) {
    throw new AppError(400, "INVALID_REFERRAL_TOKEN", "推荐链接无效、已过期或与岗位不匹配");
  }
  return share;
}

export async function resolvePublicReferralShare(prisma: PrismaClient, token: string) {
  const share = await prisma.referralShare.findUnique({
    where: { token },
    include: { jobDemand: { select: { status: true, deadline: true } } }
  });
  const now = new Date();
  if (
    !share
    || share.expiresAt < now
    || share.jobDemand.status !== JobStatus.RECRUITING
    || share.jobDemand.deadline < now
  ) {
    throw new AppError(400, "INVALID_REFERRAL_TOKEN", "推荐链接无效、已过期或与岗位不匹配");
  }
  return share;
}
