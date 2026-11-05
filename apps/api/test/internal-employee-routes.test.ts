import { afterEach, describe, expect, it } from "vitest";
import { UserRole } from "@xiangneng/shared";
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

describe("内部员工接口", () => {
  it("内部人事只能列出登录态分公司范围内的完整员工档案", async () => {
    const branchId = "20000000-0000-4000-8000-000000000001";
    const user = userFixture({
      username: "hr",
      role: UserRole.INTERNAL_HR,
      branchId,
      passwordHash: await passwordHash()
    });
    let listWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      internalEmployee: {
        findMany: async (raw) => {
          listWhere = (raw as { where: unknown }).where;
          return [
            {
              id: "30000000-0000-4000-8000-000000000001",
              employeeNo: "XN-NB-0001",
              name: "张伟",
              phone: "13800001001",
              idCard: "510105199001011234",
              status: "ACTIVE",
              branchId,
              onboardDate: new Date("2025-01-01T00:00:00.000Z"),
              organizationUnit: { id: "org-1", name: "人力资源中心" },
              position: { id: "position-1", name: "人事专员" }
            }
          ];
        },
        count: async () => 1
      },
      auditLog: { create: async () => ({ id: "audit" }) }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "hr");

    const response = await app.inject({
      method: "GET",
      url: "/api/internal-employees",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        items: [
          {
            employeeNo: "XN-NB-0001",
            phone: "13800001001",
            idCard: "510105199001011234"
          }
        ],
        pagination: { total: 1 }
      }
    });
    expect(JSON.stringify(listWhere)).toContain(branchId);
  });

  it("普通档案编辑拒绝绕过调动权限修改账号和组织归属", async () => {
    const branchId = "20000000-0000-4000-8000-000000000001";
    const employeeId = "30000000-0000-4000-8000-000000000001";
    const user = userFixture({
      username: "branch-manager",
      role: UserRole.BRANCH_MANAGER,
      branchId,
      passwordHash: await passwordHash()
    });
    let updateCalled = false;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      internalEmployee: {
        findFirst: async () => ({
          id: employeeId,
          version: 1,
          branchId,
          name: "测试员工",
          phone: "13800000001",
          status: "ACTIVE"
        }),
        update: async () => {
          updateCalled = true;
          return {};
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "branch-manager");

    const response = await app.inject({
      method: "PATCH",
      url: `/api/internal-employees/${employeeId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        expectedVersion: 1,
        branchId: "20000000-0000-4000-8000-000000000099",
        userId: "10000000-0000-4000-8000-000000000099"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(updateCalled).toBe(false);
  });

  it("内部人事不能把员工调入登录态范围外的分公司", async () => {
    const branchId = "20000000-0000-4000-8000-000000000001";
    const employeeId = "30000000-0000-4000-8000-000000000001";
    const user = userFixture({
      username: "hr",
      role: UserRole.INTERNAL_HR,
      branchId,
      passwordHash: await passwordHash()
    });
    const employee = {
      id: employeeId,
      userId: null,
      status: "ACTIVE",
      version: 1,
      branchId,
      organizationUnitId: "21000000-0000-4000-8000-000000000001",
      positionId: "22000000-0000-4000-8000-000000000001"
    };
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      internalEmployee: {
        findFirst: async () => employee,
        findUnique: async () => employee,
        update: async () => ({ ...employee, version: 2 })
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "hr");

    const response = await app.inject({
      method: "POST",
      url: `/api/internal-employees/${employeeId}/transfer`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        expectedVersion: 1,
        effectiveDate: "2026-08-01",
        organizationUnitId: "21000000-0000-4000-8000-000000000099",
        positionId: "22000000-0000-4000-8000-000000000099",
        branchId: "20000000-0000-4000-8000-000000000099",
        reason: "跨分公司调动"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "OUT_OF_SCOPE" } });
  });

  it("分公司负责人读取组织选项时只查询登录态分公司组织", async () => {
    const branchId = "20000000-0000-4000-8000-000000000001";
    const user = userFixture({
      username: "branch-manager",
      role: UserRole.BRANCH_MANAGER,
      branchId,
      passwordHash: await passwordHash()
    });
    let organizationWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      organizationUnit: {
        findMany: async (raw) => {
          organizationWhere = (raw as { where: unknown }).where;
          return [];
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "branch-manager");

    const response = await app.inject({
      method: "GET",
      url: "/api/organization/options",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(organizationWhere)).toContain(branchId);
  });
});
