import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { Permission, UserRole, type SessionUser } from "@xiangneng/shared";
import { AppError, registerErrorHandler } from "../src/errors.js";
import { reimbursementRoutes } from "../src/routes/reimbursements.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map(app => app.close())));
const batchId = "30000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";
const lineId = "40000000-0000-4000-8000-000000000001";

// Exercise the real routes, domain guards, multipart parsing and error handler.
// Authentication and persistence are boundary doubles; no live database is used.
async function fixture(status: string, permissions: Permission[], openIssues = 0, applicantUserId = actorId) {
  const app = Fastify();
  apps.push(app);
  const writes: { kind: string; data: Record<string, unknown> }[] = [];
  const batch = {
    id: batchId, applicantUserId, status, version: 1,
    lines: [{ id: lineId }], attachments: [],
    issues: Array.from({ length: openIssues }, () => ({ status: "OPEN" }))
  };
  const persist = (kind: string) => async ({ data }: { data: Record<string, unknown> }) => {
    writes.push({ kind, data });
    return { id: "saved-record", ...data };
  };
  const prisma = {
    reimbursementBatch: {
      findFirst: async () => batch,
      findUnique: async () => ({ ...batch, issues: [] }),
      update: persist("batch")
    },
    reimbursementAttachment: { create: persist("attachment") },
    reimbursementApproval: { create: persist("approval") },
    auditLog: { create: persist("audit") },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
  };
  const user: SessionUser = {
    id: actorId, role: UserRole.CASHIER, roles: [UserRole.CASHIER],
    username: "state-test", displayName: "State test", personId: null, employeeType: null,
    permissions, scopeBindings: [], projectIds: [], branchId: null, supplierId: null
  };
  app.decorate("prisma", prisma);
  app.decorateRequest("sessionUser", null);
  app.decorate("authenticate", async (request: { sessionUser: SessionUser | null }) => {
    request.sessionUser = user;
  });
  app.decorate("requirePermission", (permission: Permission) => async () => {
    if (!permissions.includes(permission)) throw new AppError(403, "FORBIDDEN", "无权限");
  });
  app.decorate("fileStore", {
    async save(input: { stream: AsyncIterable<unknown>; filename: string; mimeType: string }) {
      for await (const _chunk of input.stream) { /* drain the upload */ }
      return { storageKey: "in-memory", originalName: input.filename,
        mimeType: input.mimeType, sizeBytes: 4, sha256: "a".repeat(64) };
    },
    async remove() {}
  });
  await app.register(multipart);
  registerErrorHandler(app);
  await app.register(reimbursementRoutes, { prefix: "/api" });
  return { app, writes };
}

async function upload(app: FastifyInstance, type: string, line?: string) {
  return app.inject({
    method: "POST",
    url: `/api/reimbursements/${batchId}/attachments?type=${type}${line ? `&lineId=${line}` : ""}`,
    headers: { "content-type": "multipart/form-data; boundary=test-boundary" },
    payload: Buffer.from('--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="proof.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF\r\n--test-boundary--\r\n')
  });
}

describe("报销状态入口契约", () => {
  it("通用状态入口不能绕过付款登记直接标记已打款", async () => {
    const { app, writes } = await fixture("PENDING_PAYMENT", [Permission.REIMBURSEMENT_PAY]);
    const response = await app.inject({ method: "POST",
      url: `/api/reimbursements/${batchId}/transition`,
      payload: { expectedVersion: 1, targetStatus: "PAID" } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("PAYMENT_REGISTRATION_REQUIRED");
    expect(writes).toEqual([]);
  });

  it("出纳可以在待付款时上传不关联明细的最终付款凭证", async () => {
    const { app, writes } = await fixture("PENDING_PAYMENT", [Permission.REIMBURSEMENT_PAY]);
    const response = await upload(app, "PAYMENT_VOUCHER");
    expect(response.statusCode).toBe(201);
    expect(writes.find(x => x.kind === "attachment")?.data).toMatchObject({
      batchId, type: "PAYMENT_VOUCHER", uploadedById: actorId
    });
    expect(writes.find(x => x.kind === "attachment")?.data.lineId).toBeUndefined();
  });

  it("申请人可以在有开放问题的审核阶段补交整单说明", async () => {
    const { app } = await fixture("OWNER_REVIEWING", [Permission.REIMBURSEMENT_SELF], 1);
    expect((await upload(app, "SUPPORTING")).statusCode).toBe(201);
  });

  it("本人权限不能给他人的审核单补交材料", async () => {
    const { app, writes } = await fixture("OWNER_REVIEWING", [Permission.REIMBURSEMENT_SELF], 1,
      "10000000-0000-4000-8000-000000000002");
    expect((await upload(app, "SUPPORTING")).statusCode).toBe(409);
    expect(writes).toEqual([]);
  });

  it("没有报销写权限时不能上传最终付款凭证", async () => {
    const { app, writes } = await fixture("PENDING_PAYMENT", [Permission.REIMBURSEMENT_EXPORT]);
    expect((await upload(app, "PAYMENT_VOUCHER")).statusCode).toBe(403);
    expect(writes).toEqual([]);
  });

  it.each([
    ["OWNER_REVIEWING", Permission.REIMBURSEMENT_SELF, 0, "SUPPORTING", undefined],
    ["OWNER_REVIEWING", Permission.REIMBURSEMENT_SELF, 1, "INVOICE", lineId],
    ["APPROVED", Permission.REIMBURSEMENT_PAY, 0, "PAYMENT_VOUCHER", undefined],
    ["PENDING_PAYMENT", Permission.REIMBURSEMENT_PAY, 0, "PAYMENT_VOUCHER", lineId],
    ["PAID", Permission.REIMBURSEMENT_PAY, 0, "PAYMENT_VOUCHER", undefined]
  ] as const)("拒绝在 %s 非法变更材料 (%s)", async (status, permission, issues, type, line) => {
    const { app, writes } = await fixture(status, [permission], issues);
    expect((await upload(app, type, line)).statusCode).toBeGreaterThanOrEqual(400);
    expect(writes).toEqual([]);
  });

  it("保留草稿明细发票的上传行为", async () => {
    const { app } = await fixture("PENDING_SUBMISSION", [Permission.REIMBURSEMENT_SELF]);
    expect((await upload(app, "INVOICE", lineId)).statusCode).toBe(201);
  });

  it("草稿发票依旧必须关联具体明细", async () => {
    const { app, writes } = await fixture("PENDING_SUBMISSION", [Permission.REIMBURSEMENT_SELF]);
    const response = await upload(app, "INVOICE");
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("REIMBURSEMENT_LINE_REQUIRED");
    expect(writes).toEqual([]);
  });
});
