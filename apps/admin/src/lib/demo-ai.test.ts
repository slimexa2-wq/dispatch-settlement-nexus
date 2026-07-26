import { beforeEach, describe, expect, it } from "vitest";
import { EmploymentStatus } from "@xiangneng/shared";
import type { JobDemand, Person, Project } from "../types/domain";
import { handleDemoRequest } from "./demo";

type Page<T> = { items: T[] };
type AiPayload = Record<string, unknown> & {
  type: string;
  skill: string;
  status: string;
  idempotent: boolean;
  result: {
    rows: Array<Record<string, unknown>>;
    totals: Record<string, unknown>;
    employee: Record<string, unknown>;
  };
  preview: {
    action_id: string;
    action_token: string;
    confirmation_required: boolean;
  };
};

describe("管理后台演示 AI 业务助手", () => {
  beforeEach(async () => {
    await handleDemoRequest("POST", "/demo/reset", {}, {});
  });

  it("按项目实时统计人员和招聘缺口，不使用固定回复", async () => {
    const projects = await handleDemoRequest<Page<Project>>("GET", "/projects", { page: 1, pageSize: 100 });
    const project = projects.items[0]!;

    const peopleResult = await handleDemoRequest<AiPayload>("POST", "/ai/chat", {}, {
      message: `查询${project.name}本月入职、离职、当前在职和净增减`
    });
    expect(peopleResult.type).toBe("query_result");
    expect(peopleResult.skill).toBe("project_personnel_statistics");
    expect(peopleResult.result.rows[0]!.project_name).toBe(project.name);
    expect(peopleResult.result.totals.current_headcount).toBeTypeOf("number");

    const recruitmentResult = await handleDemoRequest<AiPayload>("POST", "/ai/chat", {}, {
      message: `${project.name}招聘还差多少人，完成率是多少`
    });
    expect(recruitmentResult.type).toBe("query_result");
    expect(recruitmentResult.skill).toBe("recruitment_progress_query");
    expect(recruitmentResult.result.rows.every((row) => row.project_name === project.name)).toBe(true);
  });

  it("可按真实姓名查询完整人员档案", async () => {
    const people = await handleDemoRequest<Page<Person>>("GET", "/people", { page: 1, pageSize: 500 });
    const person = people.items[0]!;
    const result = await handleDemoRequest<AiPayload>("POST", "/ai/chat", {}, {
      message: `查询手机号${person.phone}对应人员的身份证、项目和入职信息`
    });

    expect(result.type).toBe("query_result");
    expect(result.skill).toBe("employee_information_query");
    expect(result.result.employee).toMatchObject({
      name: person.name,
      phone: person.phone,
      id_card: person.idCard
    });
  });

  it("单人入职必须先预览再确认，并同步修改演示业务状态", async () => {
    const projects = await handleDemoRequest<Page<Project>>("GET", "/projects", { page: 1, pageSize: 100 });
    const jobs = await handleDemoRequest<Page<JobDemand>>("GET", "/job-demands", { page: 1, pageSize: 100 });
    const project = projects.items[0]!;
    const job = jobs.items.find((item) => item.projectId === project.id) ?? jobs.items[0]!;
    const created = await handleDemoRequest<{ person: Person }>("POST", "/people", {}, {
      name: "AI入职测试人员",
      phone: "13900009991",
      idCard: "510105199901019991",
      projectId: project.id,
      jobDemandId: job.id,
      jobTitle: job.title,
      source: "OPERATOR",
      interviewDate: "2026-07-26T10:00:00.000Z"
    });
    const candidate = created.person;

    const previewResult = await handleDemoRequest<AiPayload>("POST", "/ai/chat", {}, {
      message: `给${candidate.name}办理2026-07-26入职`
    });
    expect(previewResult.type).toBe("action_preview");
    expect(previewResult.preview.confirmation_required).toBe(true);

    const before = await handleDemoRequest<Person>("GET", `/people/${candidate.id}`, {});
    expect(before.onboardDate).toBeFalsy();

    const confirmPayload = {
      actionId: previewResult.preview.action_id,
      actionToken: previewResult.preview.action_token,
      idempotencyKey: "demo-ai-confirm-0000000001"
    };
    const confirmed = await handleDemoRequest<AiPayload>("POST", "/ai/actions/confirm", {}, confirmPayload);
    expect(confirmed.status).toBe("EXECUTED");
    const replayed = await handleDemoRequest<AiPayload>("POST", "/ai/actions/confirm", {}, confirmPayload);
    expect(replayed).toEqual(confirmed);
    expect(replayed.idempotent).toBe(true);

    const after = await handleDemoRequest<Person>("GET", `/people/${candidate.id}`, {});
    expect(after.onboardDate).toBe("2026-07-26");
    expect(after.employmentStatus).toBe(EmploymentStatus.ACTIVE);
  });
});
