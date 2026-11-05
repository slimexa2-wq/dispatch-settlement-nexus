import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  Permission,
  NotificationStatus,
  idSchema
} from "@xiangneng/shared";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { writeAudit } from "../audit.js";
import { createReferralShare } from "../services/referral-share.js";
import { sessionUserInclude, toSessionUser } from "../session-user.js";

const wxCodeSchema = z.object({ code: z.string().trim().min(1).max(256) });

type WechatSessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

async function exchangeWechatCode(app: FastifyInstance, code: string): Promise<{ openId: string; unionId?: string }> {
  if (!app.config.WECHAT_MINIAPP_APP_ID || !app.config.WECHAT_MINIAPP_APP_SECRET) {
    throw new AppError(501, "WECHAT_NOT_CONFIGURED", "微信小程序登录未配置，业务 API 仍可正常使用");
  }
  const query = new URLSearchParams({
    appid: app.config.WECHAT_MINIAPP_APP_ID,
    secret: app.config.WECHAT_MINIAPP_APP_SECRET,
    js_code: code,
    grant_type: "authorization_code"
  });
  let response: Response;
  try {
    response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`);
  } catch {
    throw new AppError(502, "WECHAT_UPSTREAM_UNAVAILABLE", "微信登录服务暂时不可用");
  }
  const payload = await response.json() as WechatSessionResponse;
  if (!response.ok || payload.errcode || !payload.openid) {
    throw new AppError(502, "WECHAT_AUTH_FAILED", "微信登录凭证校验失败", {
      errcode: payload.errcode,
      errmsg: payload.errmsg
    });
  }
  // session_key 仅在微信服务端响应内存在：不返回前端、不入库、不写日志。
  return { openId: payload.openid, unionId: payload.unionid };
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const loginWithWechat = async (request: FastifyRequest) => {
    const input = wxCodeSchema.parse(request.body);
    const identity = await exchangeWechatCode(app, input.code);
    const user = await app.prisma.user.findUnique({
      where: { wechatMiniappOpenId: identity.openId },
      include: sessionUserInclude
    });
    if (!user || !user.isActive) {
      throw new AppError(409, "WECHAT_NOT_BOUND", "该微信身份尚未绑定系统账号，请先使用账号密码登录后绑定");
    }
    const sessionUser = toSessionUser(user);
    const token = app.jwt.sign({ sub: user.id, tokenVersion: user.tokenVersion });
    return success(request, { token, user: sessionUser });
  };
  app.post("/wechat/auth/login", loginWithWechat);
  app.post("/wechat/auth", loginWithWechat);

  app.post("/wechat/bind", { preHandler: [app.authenticate] }, async (request) => {
    const input = wxCodeSchema.parse(request.body);
    const identity = await exchangeWechatCode(app, input.code);
    const user = getSession(request);
    await app.prisma.user.update({
      where: { id: user.id },
      data: { wechatMiniappOpenId: identity.openId, wechatUnionId: identity.unionId }
    });
    await writeAudit(app.prisma, request, {
      action: "WECHAT_MINIAPP_BIND",
      resourceType: "User",
      resourceId: user.id,
      after: { bound: true, unionIdPresent: Boolean(identity.unionId) }
    });
    return success(request, { bound: true });
  });

  app.post("/wechat/referral-qrcode", {
    preHandler: [app.authenticate, app.requirePermission(Permission.REFERRAL_CREATE)]
  }, async (request, reply) => {
    const { jobDemandId } = z.object({ jobDemandId: idSchema }).parse(request.body);
    if (!app.config.WECHAT_MINIAPP_APP_ID || !app.config.WECHAT_MINIAPP_APP_SECRET) {
      throw new AppError(501, "WECHAT_NOT_CONFIGURED", "微信小程序二维码能力未配置");
    }
    const user = getSession(request);
    const share = await createReferralShare(app.prisma, { jobDemandId, recommenderUserId: user.id });
    const tokenQuery = new URLSearchParams({
      grant_type: "client_credential",
      appid: app.config.WECHAT_MINIAPP_APP_ID,
      secret: app.config.WECHAT_MINIAPP_APP_SECRET
    });
    const tokenResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/token?${tokenQuery.toString()}`);
    const tokenPayload = await tokenResponse.json() as { access_token?: string; errcode?: number; errmsg?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new AppError(502, "WECHAT_ACCESS_TOKEN_FAILED", "微信 access_token 获取失败", { errcode: tokenPayload.errcode, errmsg: tokenPayload.errmsg });
    }
    const codeResponse = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(tokenPayload.access_token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scene: `r=${share.token}`,
        page: app.config.WECHAT_MINIAPP_PATH.replace(/^\//, ""),
        check_path: true,
        env_version: "release",
        width: 430
      })
    });
    const contentType = codeResponse.headers.get("content-type") ?? "";
    if (!codeResponse.ok || contentType.includes("application/json")) {
      const failure = await codeResponse.json().catch(() => ({})) as { errcode?: number; errmsg?: string };
      throw new AppError(502, "WECHAT_QRCODE_FAILED", "微信推荐二维码生成失败", failure);
    }
    const image = Buffer.from(await codeResponse.arrayBuffer());
    return reply.type("image/png").header("x-referral-token", share.token).send(image);
  });

  app.get("/notifications/config-status", { preHandler: [app.authenticate] }, async (request) => {
    return success(request, {
      miniappLoginConfigured: Boolean(app.config.WECHAT_MINIAPP_APP_ID && app.config.WECHAT_MINIAPP_APP_SECRET),
      officialAccountConfigured: Boolean(app.config.WECHAT_OFFICIAL_APP_ID && app.config.WECHAT_OFFICIAL_APP_SECRET),
      salaryTemplateConfigured: Boolean(app.config.WECHAT_TEMPLATE_SALARY_PUBLISHED),
      jobDemandTemplateConfigured: Boolean(app.config.WECHAT_TEMPLATE_JOB_DEMAND),
      deliveryMode: "QUEUE_ONLY_UNTIL_REAL_TEMPLATE_MAPPING_CONFIRMED"
    });
  });

  app.get("/notifications", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const query = z.object({
      page: z.coerce.number().optional(),
      pageSize: z.coerce.number().optional(),
      status: z.nativeEnum(NotificationStatus).optional(),
      all: z.enum(["true", "false"]).optional()
    }).parse(request.query);
    const canReadAll = user.permissions.includes(Permission.AUDIT_READ) && query.all === "true";
    const where = { recipientUserId: canReadAll ? undefined : user.id, status: query.status };
    const { page, pageSize, skip } = parsePagination(query);
    const [items, total] = await app.prisma.$transaction([
      app.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      app.prisma.notification.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.post("/notifications/:id/retry", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    if (!user.permissions.includes(Permission.AUDIT_READ)) {
      throw new AppError(403, "FORBIDDEN", "只有审计管理角色可以重试通知");
    }
    const notification = await app.prisma.notification.findUnique({ where: { id } });
    if (!notification) notFound("通知");
    const configured = Boolean(app.config.WECHAT_OFFICIAL_APP_ID && app.config.WECHAT_OFFICIAL_APP_SECRET);
    if (!configured) {
      const updated = await app.prisma.notification.update({
        where: { id },
        data: {
          status: NotificationStatus.SKIPPED_NOT_CONFIGURED,
          lastError: "微信公众号配置未完成，未尝试外发",
          attempts: { increment: 1 }
        }
      });
      return success(request, { notification: updated, sent: false, reason: "WECHAT_NOT_CONFIGURED" });
    }
    const updated = await app.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.PENDING,
        lastError: "真实模板字段映射与服务号用户 OpenID 尚未确认，保留队列而不伪报发送成功",
        attempts: { increment: 1 }
      }
    });
    return success(request, { notification: updated, sent: false, reason: "TEMPLATE_MAPPING_REQUIRED" });
  });
}
