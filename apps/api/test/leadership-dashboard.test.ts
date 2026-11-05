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

describe("领导驾驶舱", () => {
  it("只从正式业务聚合返回人员招聘项目和报销口径", async () => {
    const user = userFixture({
      username: "leader",
      role: UserRole.GROUP_LEADER,
      passwordHash: await passwordHash()
    });
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      internalEmployee: { count: async () => 86 },
      person: {
        count: async (raw) => {
          const where = JSON.stringify((raw as { where: unknown }).where);
          if (where.includes("onboardDate")) return 36;
          if (where.includes("offboardDate")) return 14;
          return 368;
        }
      },
      project: { count: async () => 12 },
      supplier: { count: async () => 8 },
      jobDemand: {
        aggregate: async () => ({
          _count: { _all: 6 },
          _sum: { requiredCount: 112 }
        })
      },
      application: { count: async () => 74 },
      reimbursementBatch: {
        aggregate: async () => ({
          _count: { _all: 9 },
          _sum: {
            totalPaymentCents: 326_000_00,
            totalInvoiceCents: 329_800_00
          }
        }),
        groupBy: async () => [
          { status: "PAID", _count: { _all: 4 }, _sum: { totalPaymentCents: 146_000_00 } },
          { status: "FINANCE_REVIEWING", _count: { _all: 2 }, _sum: { totalPaymentCents: 80_000_00 } }
        ]
      },
      reimbursementIssue: { count: async () => 2 }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "leader");

    const response = await app.inject({
      method: "GET",
      url: "/api/leadership/dashboard",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        people: {
          outsourcedActive: 368,
          internalActive: 86,
          onboardMonth: 36,
          offboardMonth: 14
        },
        projects: { active: 12, activeSuppliers: 8 },
        recruitment: {
          activeDemands: 6,
          requiredCount: 112,
          applicationCount: 74
        },
        reimbursements: {
          count: 9,
          totalPaymentCents: 326_000_00,
          totalInvoiceCents: 329_800_00,
          openIssues: 2
        }
      }
    });
  });
});
