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

const branchId = "20000000-0000-4000-8000-000000000001";
const organizationUnitId = "21000000-0000-4000-8000-000000000001";
const batchId = "30000000-0000-4000-8000-000000000001";

describe("报销接口", () => {
  it("部门制单员只能查看登录态数据范围内的报销单", async () => {
    const user = userFixture({
      username: "clerk",
      role: UserRole.DEPARTMENT_REIMBURSEMENT_CLERK,
      branchId,
      passwordHash: await passwordHash()
    });
    let listWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      reimbursementBatch: {
        findMany: async (raw) => {
          listWhere = (raw as { where: unknown }).where;
          return [{
            id: batchId,
            code: "BX-202607-0001",
            title: "宜宾分公司七月差旅报销",
            status: "DEPARTMENT_PREPARING",
            totalPaymentCents: 28_000_00,
            totalInvoiceCents: 28_200_00,
            invoiceExcessCents: 200_00,
            branchId,
            applicant: { id: user.id, displayName: user.displayName },
            branch: { id: branchId, name: "宜宾分公司" },
            organizationUnit: { id: organizationUnitId, name: "运营管理部" },
            _count: { lines: 2, issues: 0, attachments: 4 }
          }];
        },
        count: async () => 1
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "clerk");

    const response = await app.inject({
      method: "GET",
      url: "/api/reimbursements",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        items: [{ code: "BX-202607-0001", invoiceExcessCents: 200_00 }],
        pagination: { total: 1 }
      }
    });
    expect(JSON.stringify(listWhere)).toContain(branchId);
  });

  it("创建报销单时在服务端拒绝发票金额不高于付款金额", async () => {
    const user = userFixture({
      username: "clerk",
      role: UserRole.DEPARTMENT_REIMBURSEMENT_CLERK,
      branchId,
      passwordHash: await passwordHash()
    });
    let createCalled = false;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      reimbursementBatch: {
        create: async () => {
          createCalled = true;
          return {};
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "clerk");

    const response = await app.inject({
      method: "POST",
      url: "/api/reimbursements",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "七月差旅报销",
        branchId,
        organizationUnitId,
        lines: [{
          sequence: 1,
          expenseDate: "2026-07-20",
          category: "差旅费",
          description: "宜宾至成都项目巡检",
          paymentCents: 100_00,
          invoiceCents: 100_00
        }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "INVOICE_MUST_EXCEED_PAYMENT" }
    });
    expect(createCalled).toBe(false);
  });

  it("员工自助报销不能省略分公司后注入其他组织项目或供应商", async () => {
    const user = userFixture({
      username: "employee",
      role: UserRole.EMPLOYEE,
      branchId,
      passwordHash: await passwordHash()
    });
    let createCalled = false;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      reimbursementBatch: {
        create: async () => {
          createCalled = true;
          return {};
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "employee");

    const response = await app.inject({
      method: "POST",
      url: "/api/reimbursements",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "员工差旅报销",
        organizationUnitId: "21000000-0000-4000-8000-000000000099",
        projectId: "22000000-0000-4000-8000-000000000099",
        supplierId: "23000000-0000-4000-8000-000000000099",
        lines: [{
          sequence: 1,
          expenseDate: "2026-07-20",
          category: "差旅费",
          description: "现场交通",
          paymentCents: 100_00,
          invoiceCents: 101_00
        }]
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "OUT_OF_SCOPE" } });
    expect(createCalled).toBe(false);
  });

  it("合法报销单在事务内创建并记录完整审计", async () => {
    const user = userFixture({
      username: "clerk",
      role: UserRole.DEPARTMENT_REIMBURSEMENT_CLERK,
      branchId,
      passwordHash: await passwordHash()
    });
    let createdData: unknown;
    let auditData: unknown;
    const created = {
      id: batchId,
      code: "BX-20260726-000001",
      title: "七月差旅报销",
      applicantUserId: user.id,
      branchId,
      organizationUnitId,
      status: "PENDING_SUBMISSION",
      totalPaymentCents: 280_00,
      totalInvoiceCents: 282_00,
      invoiceExcessCents: 2_00,
      version: 1,
      lines: []
    };
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      reimbursementBatch: {
        create: async (raw) => {
          createdData = (raw as { data: unknown }).data;
          return created;
        }
      },
      auditLog: {
        create: async (raw) => {
          auditData = (raw as { data: unknown }).data;
          return { id: "audit" };
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "clerk");

    const response = await app.inject({
      method: "POST",
      url: "/api/reimbursements",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "七月差旅报销",
        branchId,
        organizationUnitId,
        lines: [{
          sequence: 1,
          expenseDate: "2026-07-20",
          category: "差旅费",
          description: "宜宾至成都项目巡检",
          paymentCents: 280_00,
          invoiceCents: 282_00
        }]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(createdData).toMatchObject({
      applicantUserId: user.id,
      branchId,
      totalPaymentCents: 280_00,
      totalInvoiceCents: 282_00,
      invoiceExcessCents: 2_00
    });
    expect(auditData).toMatchObject({
      actorId: user.id,
      action: "reimbursement.create",
      resourceType: "ReimbursementBatch",
      resourceId: batchId
    });
  });
});
