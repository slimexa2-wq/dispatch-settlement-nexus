import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, rolePermissions, type Permission, type SessionUser } from "@xiangneng/shared";
import { AppError } from "../errors.js";

function toSessionUser(record: {
  id: string;
  username: string;
  displayName: string;
  role: SessionUser["role"];
  branchId: string | null;
  supplierId: string | null;
  personId: string | null;
  employeeType: string | null;
  projectLinks: Array<{ projectId: string }>;
}): SessionUser {
  return {
    id: record.id,
    username: record.username,
    displayName: record.displayName,
    role: record.role,
    branchId: record.branchId,
    supplierId: record.supplierId,
    personId: record.personId,
    employeeType: record.employeeType,
    projectIds: record.projectLinks.map((link) => link.projectId),
    permissions: [...rolePermissions[record.role]]
  };
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: app.config.JWT_SECRET,
    sign: { expiresIn: app.config.JWT_EXPIRES_IN }
  });
  app.decorateRequest("sessionUser", null);

  app.decorate("authenticate", async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "登录已失效，请重新登录");
    }
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.sub },
      include: { projectLinks: { select: { projectId: true } } }
    });
    if (!user || !user.isActive || user.tokenVersion !== request.user.tokenVersion) {
      throw new AppError(401, "UNAUTHORIZED", "账号不可用或登录已失效");
    }
    request.sessionUser = toSessionUser(user);
  });

  app.decorate("requirePermission", (permission: Permission) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const user = request.sessionUser;
      if (!user) throw new AppError(401, "UNAUTHORIZED", "请先登录");
      if (!hasPermission(user.role, permission)) {
        throw new AppError(403, "FORBIDDEN", "当前账号没有此操作权限");
      }
    };
  });
});

export function getSession(request: FastifyRequest): SessionUser {
  if (!request.sessionUser) throw new AppError(401, "UNAUTHORIZED", "请先登录");
  return request.sessionUser;
}
