import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { EmploymentStatus, InsuranceType, InterviewStatus } from "@xiangneng/shared";
import type { Application, Person, RegistrationQr, SupplierSettlementSummary } from "../types/domain";
import { handleDemoRequest } from "./demo";

type MiniappSnapshot = {
  rolePeople: {
    supplier: Person[];
    operator: Person[];
    employee: Person[];
    candidate: Person[];
  };
  roleApplications: { employee: Application[]; candidate: Application[] };
  jobs: Array<{ id: string; projectId: string; title: string }>;
  messages: Array<{ ownerType: string; targetView?: string | null }>;
  registrationQrs: RegistrationQr[];
  supplierSettlement: SupplierSettlementSummary;
  meta: { peopleTotal: number };
};

const nativeFetch = globalThis.fetch;

describe("小程序三端演示快照", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (url.endsWith("/demo-data.json")) {
        const json = await readFile(resolve(process.cwd(), "../../data/synthetic/demo-data.json"), "utf-8");
        return new Response(json, { headers: { "content-type": "application/json" } });
      }
      return nativeFetch(input);
    });
  });

  it("返回个人端、内部端、供应商端共用的消息和结算数据", async () => {
    const snapshot = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});

    expect(snapshot.rolePeople.operator.length).toBeGreaterThan(0);
    expect(snapshot.rolePeople.supplier.length).toBeGreaterThan(0);
    expect(snapshot.rolePeople.employee.length + snapshot.rolePeople.candidate.length).toBeGreaterThan(0);
    expect(snapshot.messages.some((message) => message.ownerType === "PERSONAL")).toBe(true);
    expect(snapshot.messages.some((message) => message.ownerType === "INTERNAL")).toBe(true);
    expect(snapshot.messages.some((message) => message.ownerType === "SUPPLIER")).toBe(true);
    expect(snapshot.supplierSettlement.items.length).toBeGreaterThan(0);
    expect(snapshot.supplierSettlement.payableAmount).toBe(
      snapshot.supplierSettlement.items.reduce((sum, item) => sum + item.expectedAmount, 0)
    );
  }, 20000);

  it("现场报名二维码生成后会进入统一快照并保留项目岗位信息", async () => {
    const before = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});
    const job = before.jobs[0]!;

    const qr = await handleDemoRequest<RegistrationQr>("POST", "/registration-qrs", {}, {
      projectId: job.projectId,
      jobDemandId: job.id,
      operatorName: "测试运营"
    });
    const after = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});

    expect(qr.projectId).toBe(job.projectId);
    expect(qr.jobDemandId).toBe(job.id);
    expect(qr.status).toBe("ACTIVE");
    expect(after.registrationQrs.some((item) => item.id === qr.id && item.jobTitle === job.title)).toBe(true);
  }, 20000);

  it("供应商人员状态更新后会同步到供应商端人员和结算明细", async () => {
    const snapshot = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});
    const person = snapshot.rolePeople.supplier[0]!;

    await handleDemoRequest<Person>("PATCH", `/people/${person.id}/interview`, {}, { status: InterviewStatus.PASSED, notes: "测试状态同步" });
    await handleDemoRequest<Person>("PATCH", `/people/${person.id}/onboard`, {}, {
      onboardDate: "2026-07-05",
      employeeNo: `TEST${person.id.slice(-4)}`,
      insuranceTypes: [InsuranceType.COMMERCIAL, InsuranceType.SOCIAL]
    });
    const after = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});
    const synced = after.rolePeople.supplier.find((item) => item.id === person.id);

    expect(synced?.interviewStatus).toBe(InterviewStatus.PASSED);
    expect(synced?.employmentStatus).toBe(EmploymentStatus.ACTIVE);
    expect(synced?.lifecycle?.some((item) => item.type === "ONBOARD")).toBe(true);
    expect(after.supplierSettlement.items.some((item) => item.personId === person.id && item.activeDays > 0)).toBe(true);
  }, 20000);

  it("同一身份证报名其他项目只新增报名记录，不重复创建人员主档", async () => {
    await handleDemoRequest("POST", "/demo/reset", {}, {});
    const before = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});
    const person = before.rolePeople.candidate[0]!;
    const job = before.jobs.find((item) => item.projectId !== person.projectId) ?? before.jobs[0]!;
    const payload = {
      name: person.name,
      idCard: person.idCard,
      phone: person.phone,
      projectId: job.projectId,
      jobDemandId: job.id,
      jobTitle: job.title,
      source: "SELF"
    };

    const first = await handleDemoRequest<{ person: Person; application: Application; created: boolean; merged: boolean }>("POST", "/people", {}, payload);
    const repeated = await handleDemoRequest<{ duplicateApplication?: boolean }>("POST", "/people", {}, payload);
    const after = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});
    const detail = await handleDemoRequest<Person>("GET", `/people/${person.id}`, {});

    expect(first.person.id).toBe(person.id);
    expect(first.created).toBe(false);
    expect(first.merged).toBe(true);
    expect(first.application.jobDemandId).toBe(job.id);
    expect(first.application.interviewDate).toBeUndefined();
    expect(first.application.onboardDate).toBeUndefined();
    expect(first.application.employmentStatus).toBe(EmploymentStatus.APPLICANT);
    expect(repeated.duplicateApplication).toBe(true);
    expect(after.meta.peopleTotal).toBe(before.meta.peopleTotal);
    expect(detail.applications?.some((application) => application.jobDemandId === job.id)).toBe(true);
  }, 20000);

  it("求职者角色只保留未入职且未离职的本人数据，不被运营端最近修改人员污染", async () => {
    await handleDemoRequest("POST", "/demo/reset", {}, {});
    const before = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});
    const operator = before.rolePeople.operator.find((person) => Boolean(person.onboardDate)) ?? before.rolePeople.operator[0]!;

    await handleDemoRequest<Person>("PATCH", `/people/${operator.id}`, {}, { notes: "角色隔离回归验证" });
    const after = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});

    expect(after.rolePeople.candidate.every((person) => !person.onboardDate && !person.offboardDate)).toBe(true);
    expect(after.rolePeople.candidate.some((person) => person.id === operator.id)).toBe(false);

    const candidate = after.rolePeople.candidate[0]!;
    await handleDemoRequest<Person>("PATCH", `/people/${candidate.id}/interview`, {}, { status: InterviewStatus.PASSED });
    const progressed = await handleDemoRequest<MiniappSnapshot>("GET", "/demo/miniapp-snapshot", {});
    expect(progressed.rolePeople.candidate[0]?.id).toBe(candidate.id);
    expect(progressed.rolePeople.candidate[0]?.interviewStatus).toBe(InterviewStatus.PASSED);
  }, 20000);
});
