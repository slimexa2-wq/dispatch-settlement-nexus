import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { EmploymentStatus, InterviewStatus, SalarySlipStatus, UserRole } from "@xiangneng/shared";
import { buildTestApp, createPrismaMock, login, passwordHash, userFixture } from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("人员状态机与工资条本人隔离", () => {
  it("面试通过、入职、离职同步人员与当前报名，并自动匹配唯一最优供应商政策", async () => {
    const projectId = "30000000-0000-4000-8000-000000000001";
    const supplierId = "50000000-0000-4000-8000-000000000001";
    const personId = "70000000-0000-4000-8000-000000000001";
    const applicationId = "90000000-0000-4000-8000-000000000001";
    const operator = userFixture({
      username: "operator",
      role: UserRole.PROJECT_OPERATOR,
      projectLinks: [{ projectId }],
      passwordHash: await passwordHash()
    });
    const person: Record<string, unknown> = {
      id: personId,
      name: "张三",
      idCard: "510101199001011234",
      phone: "13800138000",
      projectId,
      jobTitle: "生产操作员",
      supplierId,
      recommenderUserId: null,
      status: EmploymentStatus.APPLICANT,
      interviewStatus: InterviewStatus.PENDING_ARRIVAL,
      interviewDate: new Date("2026-07-20"),
      onboardDate: null,
      offboardDate: null,
      insuranceTypes: [],
      notes: null
    };
    const application: Record<string, unknown> = {
      id: applicationId,
      personId,
      interviewStatus: InterviewStatus.PENDING_ARRIVAL,
      employmentStatus: EmploymentStatus.APPLICANT,
      appliedAt: new Date()
    };
    const exactPolicy = {
      id: "a0000000-0000-4000-8000-000000000001",
      name: "A级供应商-操作员政策",
      type: "SUPPLIER",
      projectId,
      jobTitle: "生产操作员",
      supplierId,
      supplierLevel: null,
      employeeType: null,
      amount: new Prisma.Decimal(1200),
      achievementConditions: "在职满30天",
      exclusionConditions: null,
      effectiveAt: new Date("2026-01-01"),
      expiresAt: null,
      isActive: true,
      version: 3
    };
    const levelPolicy = { ...exactPolicy, id: "a0000000-0000-4000-8000-000000000002", name: "A级通用政策", supplierId: null, supplierLevel: "A级", jobTitle: null };
    const tx: Record<string, unknown> = {
      person: {
        findFirst: async () => person,
        update: async (raw: unknown) => {
          const data = (raw as { data: Record<string, unknown> }).data;
          for (const [key, value] of Object.entries(data)) if (value !== undefined) person[key] = value;
          return person;
        }
      },
      application: {
        findFirst: async () => application,
        update: async (raw: unknown) => {
          Object.assign(application, (raw as { data: Record<string, unknown> }).data);
          return application;
        }
      },
      personStatusLog: { create: async () => ({ id: "log" }) },
      auditLog: { create: async () => ({ id: "audit" }) },
      user: {
        findUnique: async () => operator,
        findMany: async () => []
      },
      notification: { createMany: async () => ({ count: 0 }) },
      supplier: { findUnique: async () => ({ id: supplierId, level: "A级" }) },
      policy: { findMany: async () => [levelPolicy, exactPolicy] }
    };
    const prisma = {
      ...tx,
      $transaction: async (input: unknown) => {
        if (Array.isArray(input)) return Promise.all(input);
        return (input as (client: unknown) => unknown)(tx);
      }
    } as unknown as PrismaClient;
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "operator");
    const headers = { authorization: `Bearer ${token}` };

    const interview = await app.inject({
      method: "PATCH",
      url: `/api/people/${personId}/interview`,
      headers,
      payload: { status: InterviewStatus.PASSED }
    });
    expect(interview.statusCode).toBe(200);
    expect(person.status).toBe(EmploymentStatus.PENDING_ONBOARD);
    expect(application.employmentStatus).toBe(EmploymentStatus.PENDING_ONBOARD);

    const onboard = await app.inject({
      method: "PATCH",
      url: `/api/people/${personId}/onboard`,
      headers,
      payload: { onboardDate: "2026-07-21", insuranceTypes: ["COMMERCIAL", "RISK_FUND"] }
    });
    expect(onboard.statusCode).toBe(200);
    expect(person.status).toBe(EmploymentStatus.ACTIVE);
    expect(person.supplierPolicyId).toBe(exactPolicy.id);
    expect(person.supplierPolicySnapshot).toMatchObject({ id: exactPolicy.id, version: 3, amount: "1200" });
    expect(application.onboardDate).toEqual(new Date("2026-07-21"));

    const offboard = await app.inject({
      method: "PATCH",
      url: `/api/people/${personId}/offboard`,
      headers,
      payload: { offboardDate: "2026-07-31", offboardReason: "个人原因", insuranceTypes: [] }
    });
    expect(offboard.statusCode).toBe(200);
    expect(person.status).toBe(EmploymentStatus.LEFT);
    expect(application.employmentStatus).toBe(EmploymentStatus.LEFT);
    expect(application.offboardReason).toBe("个人原因");
  });

  it("员工只能按绑定 personId 查询已发布工资条", async () => {
    const personId = "70000000-0000-4000-8000-000000000010";
    const employee = userFixture({
      username: "employee",
      role: UserRole.EMPLOYEE,
      personId,
      employeeType: "普通员工",
      passwordHash: await passwordHash()
    });
    let observedWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => employee },
      auditLog: { create: async () => ({ id: "audit" }) },
      salarySlip: {
        findMany: async (raw) => {
          observedWhere = (raw as { where: unknown }).where;
          return [{ id: "slip", personId, salaryMonth: "2026-07", status: SalarySlipStatus.PUBLISHED, netPay: "5000" }];
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "employee");
    const response = await app.inject({ method: "GET", url: "/api/salary-slips/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(observedWhere).toEqual(expect.objectContaining({ personId, status: SalarySlipStatus.PUBLISHED }));
  });
});
