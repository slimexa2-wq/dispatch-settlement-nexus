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
});
