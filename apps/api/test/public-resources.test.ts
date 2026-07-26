import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { JobStatus } from "@xiangneng/shared";
import type { FileStore } from "../src/files.js";
import { buildTestApp, createPrismaMock, login, passwordHash, userFixture } from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

const token = "abcdefghijklmnopqrstuvwx";
const jobDemandId = "40000000-0000-4000-8000-000000000001";

describe("公开推荐与项目图片边界", () => {
  it("公开推荐 token 只解析岗位，不暴露推荐人", async () => {
    const prisma = createPrismaMock({
      referralShare: {
        findUnique: async () => ({
          id: "70000000-0000-4000-8000-000000000001",
          token,
          jobDemandId,
          recommenderUserId: "60000000-0000-4000-8000-000000000009",
          expiresAt: new Date(Date.now() + 86_400_000),
          jobDemand: { status: JobStatus.RECRUITING, deadline: new Date(Date.now() + 86_400_000) }
        })
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: `/api/public/referral-shares/${token}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { token, jobDemandId } });
    expect(response.body).not.toContain("recommenderUserId");
  });

  it("推荐分享返回小程序详情页标准路径", async () => {
    const user = userFixture({ passwordHash: await passwordHash() });
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      jobDemand: {
        findUnique: async () => ({ id: jobDemandId, status: JobStatus.RECRUITING, deadline: new Date(Date.now() + 86_400_000) })
      },
      referralShare: {
        create: async (raw) => ({
          id: "70000000-0000-4000-8000-000000000001",
          ...((raw as { data: Record<string, unknown> }).data),
          expiresAt: new Date(Date.now() + 86_400_000)
        })
      },
      auditLog: { create: async () => ({ id: "audit" }) }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const authToken = await login(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/referrals/share-token",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { jobDemandId }
    });
    expect(response.statusCode).toBe(201);
    expect((response.json() as { data: { path: string } }).data.path).toMatch(
      new RegExp(`^/pages/jobs/detail/index\\?id=${jobDemandId}&ref=[A-Za-z0-9_-]+$`)
    );
  });

  it("仅公开仍有未截止招聘需求的项目图片内容", async () => {
    const imageId = "80000000-0000-4000-8000-000000000001";
    let capturedWhere: unknown;
    const prisma = createPrismaMock({
      projectImage: {
        findFirst: async (raw) => {
          capturedWhere = (raw as { where: unknown }).where;
          return { id: imageId, storageKey: "image-key", originalName: "现场.jpg", mimeType: "image/jpeg" };
        }
      }
    });
    const fileStore: FileStore = {
      async save() { throw new Error("not used"); },
      open: () => Readable.from([Buffer.from("image-bytes")]),
      async remove() {}
    };
    const app = await buildTestApp(prisma, undefined, fileStore);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: `/api/public/project-images/${imageId}/content` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(JSON.stringify(capturedWhere)).toContain(JobStatus.RECRUITING);
    expect(JSON.stringify(capturedWhere)).toContain("deadline");
  });
});
