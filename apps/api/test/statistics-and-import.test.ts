import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { EmploymentStatus, ImportStatus, ProjectStatus, UserRole } from "@xiangneng/shared";
import { buildTestApp, createPrismaMock, login, passwordHash, userFixture } from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("统计下钻与组织导入", () => {
  it("在职卡片数量与 active 下钻总数一致", async () => {
    const admin = userFixture({ passwordHash: await passwordHash() });
    const activePeople = [1, 2].map((index) => ({
      id: `70000000-0000-4000-8000-00000000000${index}`,
      name: `员工${index}`,
      status: EmploymentStatus.ACTIVE,
      projectId: "30000000-0000-4000-8000-000000000001",
      supplierId: null,
      project: { id: "30000000-0000-4000-8000-000000000001", name: "测试项目", branch: { id: "20000000-0000-4000-8000-000000000001", name: "测试分公司" } },
      supplier: null,
      updatedAt: new Date()
    }));
    const prisma = createPrismaMock({
      user: { findUnique: async () => admin },
      auditLog: { create: async () => ({ id: "audit" }) },
      person: {
        count: async (raw) => JSON.stringify((raw as { where: unknown }).where).includes(`"status":"${EmploymentStatus.ACTIVE}"`) ? 2 : 0,
        findMany: async (raw) => {
          const args = raw as { where?: unknown; select?: { status?: boolean } };
          if (args.select?.status) return activePeople.map(() => ({ status: EmploymentStatus.ACTIVE }));
          if (JSON.stringify(args.where).includes(`"status":"${EmploymentStatus.ACTIVE}"`)) return activePeople;
          return [];
        }
      },
      jobDemand: { findMany: async () => [], count: async () => 0 },
      application: { findMany: async () => [] }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app);
    const headers = { authorization: `Bearer ${token}` };
    const overview = await app.inject({ method: "GET", url: "/api/statistics/overview", headers });
    const drilldown = await app.inject({ method: "GET", url: "/api/statistics/drilldown?metric=active", headers });
    expect(overview.statusCode).toBe(200);
    expect(drilldown.statusCode).toBe(200);
    const overviewData = (overview.json() as { data: { activePeople: number } }).data;
    const drilldownData = (drilldown.json() as { data: { pagination: { total: number } } }).data;
    expect(overviewData.activePeople).toBe(2);
    expect(drilldownData.pagination.total).toBe(overviewData.activePeople);
  });

  it("组织项目必须先预览，首次提交写入公开合成项目，重复提交不产生副作用", async () => {
    const admin = userFixture({ passwordHash: await passwordHash() });
    const branches = new Map<string, Record<string, unknown>>();
    const projects = new Map<string, Record<string, unknown>>();
    const jobs = new Map<string, Record<string, unknown>>();
    const importId = "b0000000-0000-4000-8000-000000000001";
    let idCounter = 0;
    const tx: Record<string, unknown> = {
      branch: {
        findUnique: async (raw: unknown) => branches.get((raw as { where: { name: string } }).where.name) ?? null,
        create: async (raw: unknown) => {
          const data = (raw as { data: { name: string } }).data;
          const branch = { id: `b0000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`, ...data };
          branches.set(data.name, branch);
          return branch;
        },
        update: async (raw: unknown) => [...branches.values()].find((item) => item.id === (raw as { where: { id: string } }).where.id)
      },
      project: {
        findFirst: async (raw: unknown) => {
          const conditions = (raw as { where: { OR: Array<Record<string, unknown>> } }).where.OR;
          return [...projects.values()].find((project) => conditions.some((condition) =>
            (condition.sourceProjectId && project.sourceProjectId === condition.sourceProjectId) ||
            (condition.branchId && project.branchId === condition.branchId && project.name === condition.name)
          )) ?? null;
        },
        create: async (raw: unknown) => {
          const data = (raw as { data: Record<string, unknown> }).data;
          const project = { id: `c0000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`, ...data };
          projects.set(String(data.sourceProjectId), project);
          return project;
        },
        update: async (raw: unknown) => {
          const { where, data } = raw as { where: { id: string }; data: Record<string, unknown> };
          const project = [...projects.values()].find((item) => item.id === where.id);
          if (!project) throw new Error("project missing");
          Object.assign(project, data);
          return project;
        }
      },
      importJob: {
        upsert: async (raw: unknown) => {
          const args = raw as { create: Record<string, unknown>; update: Record<string, unknown> };
          const existing = jobs.get("organization");
          if (existing) {
            Object.assign(existing, args.update);
            return existing;
          }
          const record = { id: importId, ...args.create };
          jobs.set("organization", record);
          return record;
        },
        findFirst: async () => jobs.get("organization") ?? null
      },
      auditLog: { create: async () => ({ id: "audit" }) }
    };
    const prisma = {
      ...tx,
      user: { findUnique: async () => admin },
      $transaction: async (input: unknown) => {
        if (Array.isArray(input)) return Promise.all(input);
        return (input as (client: unknown) => unknown)(tx);
      }
    } as unknown as PrismaClient;
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app);
    const headers = { authorization: `Bearer ${token}` };
    const preview = await app.inject({ method: "POST", url: "/api/imports/organization/preview", headers });
    expect(preview.statusCode).toBe(200);
    const previewData = (preview.json() as { data: { importId: string; sourceHash: string } }).data;
    const commit = await app.inject({
      method: "POST",
      url: "/api/imports/organization/commit",
      headers,
      payload: { importId: previewData.importId, sourceHash: previewData.sourceHash }
    });
    expect(commit.statusCode).toBe(200);
    expect(branches.size).toBe(3);
    expect(projects.size).toBe(8);
    expect([...projects.values()].every((project) => project.status === ProjectStatus.ACTIVE || project.status === ProjectStatus.PAUSED)).toBe(true);
    const repeated = await app.inject({
      method: "POST",
      url: "/api/imports/organization/commit",
      headers,
      payload: { importId: previewData.importId, sourceHash: previewData.sourceHash }
    });
    expect(repeated.statusCode).toBe(409);
    expect((repeated.json() as { error: { code: string } }).error.code).toBe("IMPORT_ALREADY_COMMITTED");
    expect(projects.size).toBe(8);
    expect(jobs.get("organization")?.status).toBe(ImportStatus.COMMITTED);
  });
});
