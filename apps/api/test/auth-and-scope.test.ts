import { afterEach, describe, expect, it } from "vitest";
import { UserRole } from "@xiangneng/shared";
import type { FastifyInstance } from "fastify";
import { buildTestApp, createPrismaMock, login, passwordHash, userFixture } from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("认证与数据权限", () => {
  it("密码正确可登录，错误密码被拒绝", async () => {
    const user = userFixture({ passwordHash: await passwordHash() });
    const prisma = createPrismaMock({
      user: {
        findUnique: async (raw) => {
          const where = (raw as { where: { username?: string; id?: string } }).where;
          return where.username === user.username || where.id === user.id ? user : null;
        }
      },
      auditLog: { create: async () => ({ id: "audit" }) }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const ok = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "Password123!" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ data: { user: { role: UserRole.SYSTEM_ADMIN, employeeType: null } } });
    const denied = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "bad-password" } });
    expect(denied.statusCode).toBe(401);
    expect(denied.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
  });

  it("资源专员不能借我的报名接口读取全量报名", async () => {
    const user = userFixture({
      username: "resource",
      role: UserRole.RESOURCE_SPECIALIST,
      passwordHash: await passwordHash()
    });
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      auditLog: { create: async () => ({ id: "audit" }) }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "resource");
    const response = await app.inject({ method: "GET", url: "/api/applications/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(403);
  });

  it("供应商政策只按本人供应商与精确级别过滤", async () => {
    const supplierId = "20000000-0000-4000-8000-000000000001";
    const user = userFixture({
      username: "supplier",
      role: UserRole.SUPPLIER,
      supplierId,
      passwordHash: await passwordHash()
    });
    let policyWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      supplier: { findUnique: async () => ({ id: supplierId, level: "A级" }) },
      policy: {
        findMany: async (raw) => {
          policyWhere = (raw as { where: unknown }).where;
          return [];
        },
        count: async () => 0
      },
      auditLog: { create: async () => ({ id: "audit" }) }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "supplier");
    const response = await app.inject({ method: "GET", url: "/api/policies", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    const serialized = JSON.stringify(policyWhere);
    expect(serialized).toContain(`"supplierId":"${supplierId}"`);
    expect(serialized).toContain('"supplierLevel":"A级"');
    expect(serialized).toContain('"project":{"supplierLinks":{"some"');
    expect(serialized).not.toContain('"supplierLevel":{"not":null}');
  });

  it("项目运营查看供应商时只包含本人项目关联与该范围统计", async () => {
    const projectId = "30000000-0000-4000-8000-000000000001";
    const user = userFixture({
      username: "operator",
      role: UserRole.PROJECT_OPERATOR,
      passwordHash: await passwordHash(),
      projectLinks: [{ projectId }]
    });
    let supplierArgs: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      supplier: {
        findMany: async (raw) => {
          supplierArgs = raw;
          return [];
        },
        count: async () => 0
      },
      auditLog: { create: async () => ({ id: "audit" }) }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "operator");
    const response = await app.inject({ method: "GET", url: "/api/suppliers", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    const serialized = JSON.stringify(supplierArgs);
    expect(serialized).toContain(projectId);
    expect(serialized).toContain('"projectLinks":{"some"');
    expect(serialized).toContain('"_count"');
  });

  it("微信未配置时明确返回边界而不伪造登录成功", async () => {
    const prisma = createPrismaMock();
    const app = await buildTestApp(prisma);
    apps.push(app);
    const response = await app.inject({ method: "POST", url: "/api/wechat/auth/login", payload: { code: "wx-code" } });
    expect(response.statusCode).toBe(501);
    expect(response.json()).toMatchObject({ error: { code: "WECHAT_NOT_CONFIGURED" } });
  });
});
