import type { FastifyInstance } from "fastify";
import { compare } from "bcryptjs";
import { loginSchema } from "@xiangneng/shared";
import { AppError } from "../errors.js";
import { success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { writeAudit } from "../audit.js";
import { z } from "zod";
import { sessionUserInclude, toSessionUser } from "../session-user.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/demo-login", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (request) => {
    if (!app.config.AI_DEMO_MODE || app.config.NODE_ENV === "production") {
      throw new AppError(404, "NOT_FOUND", "演示登录未启用");
    }
    const { persona } = z.object({ persona: z.enum(["headquarters", "branch", "operator", "project", "supplier", "employee", "systemAdmin"]) }).parse(request.body);
    const username = {
      headquarters: "demo_hq",
      branch: "demo_branch",
      operator: "demo_operator",
      project: "demo_project",
      supplier: "demo_supplier",
      employee: "demo_employee",
      systemAdmin: "demo_admin"
    }[persona];
    const user = await app.prisma.user.findUnique({
      where: { username },
      include: sessionUserInclude
    });
    if (!user || !user.isActive) throw new AppError(503, "DEMO_USER_NOT_READY", "演示账号尚未初始化");
    const sessionUser = toSessionUser(user);
    const token = app.jwt.sign({ sub: user.id, tokenVersion: user.tokenVersion });
    request.sessionUser = sessionUser;
    await writeAudit(app.prisma, request, {
      action: "AUTH_DEMO_LOGIN_SUCCEEDED",
      resourceType: "User",
      resourceId: user.id
    });
    return success(request, { token, user: sessionUser, demo: true });
  });

  app.post("/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request) => {
    const input = loginSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({
      where: { username: input.username },
      include: sessionUserInclude
    });
    if (!user || !user.isActive || !(await compare(input.password, user.passwordHash))) {
      await writeAudit(app.prisma, request, {
        action: "AUTH_LOGIN_FAILED",
        resourceType: "User",
        resourceId: input.username
      });
      throw new AppError(401, "INVALID_CREDENTIALS", "用户名或密码错误");
    }
    const sessionUser = toSessionUser(user);
    const token = app.jwt.sign({ sub: user.id, tokenVersion: user.tokenVersion });
    request.sessionUser = sessionUser;
    await writeAudit(app.prisma, request, {
      action: "AUTH_LOGIN_SUCCEEDED",
      resourceType: "User",
      resourceId: user.id
    });
    return success(request, { token, user: sessionUser });
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    return success(request, getSession(request));
  });
}
