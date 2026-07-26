import { afterEach, describe, expect, it } from "vitest";
import { DataScopeType, UserRole } from "@xiangneng/shared";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  createPrismaMock,
  login,
  passwordHash,
  userFixture
} from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("门户权限与公开写入边界", () => {
  it("项目运营查询申诉时后端查询必须包含登录态项目范围", async () => {
    const projectId = "30000000-0000-4000-8000-000000000001";
    const user = userFixture({
      username: "operator",
      role: UserRole.PROJECT_OPERATOR,
      passwordHash: await passwordHash(),
      projectLinks: [{ projectId }]
    });
    let appealWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      portalAppeal: {
        findMany: async (raw) => {
          appealWhere = (raw as { where: unknown }).where;
          return [];
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "operator");

    const response = await app.inject({
      method: "GET",
      url: "/api/portal/appeals",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(appealWhere)).toContain(projectId);
  });

  it("生成现场报名二维码时拒绝不属于目标项目的岗位", async () => {
    const projectId = "30000000-0000-4000-8000-000000000001";
    const jobId = "31000000-0000-4000-8000-000000000099";
    const user = userFixture({
      username: "operator",
      role: UserRole.PROJECT_OPERATOR,
      passwordHash: await passwordHash(),
      projectLinks: [{ projectId }]
    });
    let createCalled = false;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      project: { findFirst: async () => ({ id: projectId }) },
      jobDemand: { findFirst: async () => null },
      portalQrCode: {
        create: async () => {
          createCalled = true;
          return {};
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "operator");

    const response = await app.inject({
      method: "POST",
      url: "/api/portal/qrcodes",
      headers: { authorization: `Bearer ${token}` },
      payload: { projectId, jobId }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "PROJECT_JOB_MISMATCH" }
    });
    expect(createCalled).toBe(false);
  });

  it("分公司内部人事通过门户读取审计记录时必须附带登录态分公司范围", async () => {
    const branchId = "20000000-0000-4000-8000-000000000001";
    const user = userFixture({
      username: "branch-hr",
      role: UserRole.INTERNAL_HR,
      branchId,
      passwordHash: await passwordHash(),
      roleAssignments: [{
        status: "ACTIVE",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null,
        role: { code: UserRole.INTERNAL_HR },
        scopes: [{
          type: DataScopeType.BRANCH,
          organizationUnitId: null,
          branchId,
          projectId: null,
          supplierId: null,
          isActive: true,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null
        }]
      }]
    });
    let auditWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      auditLog: {
        findMany: async (raw) => {
          auditWhere = (raw as { where: unknown }).where;
          return [];
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "branch-hr");

    const response = await app.inject({
      method: "GET",
      url: "/api/portal/audit-logs",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(auditWhere)).toContain(branchId);
  });
});
