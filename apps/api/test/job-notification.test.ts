import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { JobStatus, NotificationStatus } from "@xiangneng/shared";
import { buildTestApp, createPrismaMock, login, passwordHash, userFixture } from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("招聘需求通知", () => {
  it("发布招聘需求时为关联供应商建立幂等通知，微信未配置则不伪报已发送", async () => {
    const admin = userFixture({ passwordHash: await passwordHash() });
    const projectId = "30000000-0000-4000-8000-000000000001";
    const jobId = "40000000-0000-4000-8000-000000000001";
    const supplierUserId = "60000000-0000-4000-8000-000000000009";
    let notificationRows: Array<Record<string, unknown>> = [];
    const prisma = createPrismaMock({
      user: {
        findUnique: async () => admin,
        findMany: async () => [{ id: supplierUserId }]
      },
      project: { findFirst: async () => ({ id: projectId }) },
      jobDemand: {
        create: async (raw) => ({
          id: jobId,
          ...((raw as { data: Record<string, unknown> }).data),
          project: { id: projectId, branch: { id: "20000000-0000-4000-8000-000000000001", name: "测试分公司" }, images: [] },
          supplierPolicy: null,
          referralPolicy: null
        })
      },
      notification: {
        createMany: async (raw) => {
          notificationRows = (raw as { data: Array<Record<string, unknown>> }).data;
          return { count: notificationRows.length };
        }
      },
      auditLog: { create: async () => ({ id: "audit" }) }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/job-demands",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        projectId,
        title: "生产操作员",
        requiredCount: 20,
        requirements: "身体健康，服从安排",
        salary: "5000-7000元/月",
        workTime: "综合工时",
        workLocation: "测试项目",
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
        status: JobStatus.RECRUITING
      }
    });

    expect(response.statusCode).toBe(201);
    expect(notificationRows).toHaveLength(1);
    expect(notificationRows[0]).toMatchObject({
      recipientUserId: supplierUserId,
      type: "JOB_DEMAND_PUBLISHED",
      status: NotificationStatus.SKIPPED_NOT_CONFIGURED,
      targetPath: `/pages/jobs/detail/index?id=${jobId}`,
      dedupeKey: `JOB_DEMAND_PUBLISHED:${jobId}:${supplierUserId}`
    });
  });
});
