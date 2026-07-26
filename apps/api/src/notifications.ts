import type { Prisma, PrismaClient } from "./generated/prisma/client.js";
import { NotificationStatus } from "@xiangneng/shared";
import type { AppConfig } from "./config.js";

type NotificationClient = Pick<PrismaClient, "notification" | "user"> | Pick<Prisma.TransactionClient, "notification" | "user">;

export async function createKeyNotifications(
  db: NotificationClient,
  config: AppConfig,
  input: {
    personId: string;
    supplierId?: string | null;
    recommenderUserId?: string | null;
    type: string;
    title: string;
    content: string;
    targetPath: string;
    dedupeKey?: string;
  }
): Promise<void> {
  const recipients = await db.user.findMany({
    where: {
      isActive: true,
      OR: [
        { personId: input.personId },
        ...(input.supplierId ? [{ supplierId: input.supplierId }] : []),
        ...(input.recommenderUserId ? [{ id: input.recommenderUserId }] : [])
      ]
    },
    select: { id: true, role: true, personId: true }
  });
  if (recipients.length === 0) return;
  const configured = Boolean(config.WECHAT_OFFICIAL_APP_ID && config.WECHAT_OFFICIAL_APP_SECRET);
  await db.notification.createMany({
    data: recipients.map((recipient) => ({
      recipientUserId: recipient.id,
      type: input.type,
      title: input.title,
      content: input.content,
      targetPath: recipient.role === "SUPPLIER"
        ? "/pages/supplier/people/index"
        : recipient.role === "JOB_SEEKER"
          ? "/pages/application/mine/index"
          : recipient.role === "EMPLOYEE"
            ? input.type.startsWith("REFERRAL_REWARD")
              ? "/pages/referrals/rewards/index"
              : recipient.id === input.recommenderUserId
                ? "/pages/referrals/mine/index"
                : "/pages/application/mine/index"
            : input.targetPath,
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${recipient.id}` : undefined,
      status: configured ? NotificationStatus.PENDING : NotificationStatus.SKIPPED_NOT_CONFIGURED,
      lastError: configured ? null : "微信模板消息未配置，业务状态已保存但未外发"
    })),
    skipDuplicates: true
  });
}
