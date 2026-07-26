import { beforeAll, describe, expect, it } from "vitest";
import { AiSchemaRegistry } from "../src/ai/schema-registry.js";
import { IntentRouter } from "../src/ai/intent-router.js";
import type { OllamaClient } from "../src/ai/ollama-client.js";
import { testConfig } from "./helpers.js";

describe("祥能 AI 规则优先路由与 Schema 安全门", () => {
  const schemas = new AiSchemaRegistry(testConfig);

  beforeAll(async () => schemas.load());

  it("强规则唯一命中时不调用模型，并提取项目人员统计参数", async () => {
    let modelCalled = false;
    const model = { completeJson: async () => { modelCalled = true; throw new Error("should not run"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    const decision = await router.route("查询宜宾时代项目每月入职和当前在职人数", [
      "project_personnel_statistics", "employee_information_query", "recruitment_progress_query", "employee_entry", "employee_resignation"
    ]);
    expect(modelCalled).toBe(false);
    expect(decision).toMatchObject({ skill: "project_personnel_statistics", routeType: "rule", mode: "read" });
    expect(decision.parameters).toMatchObject({ project_name: "宜宾时代", group_by: "month" });
  });

  it("办理单人入职不会被统计意图截获", async () => {
    const model = { completeJson: async () => { throw new Error("should not run"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    const decision = await router.route("给张三办理入职", ["project_personnel_statistics", "employee_entry"]);
    expect(decision).toMatchObject({ skill: "employee_entry", routeType: "rule", mode: "write" });
    expect(decision.parameters).toMatchObject({ employee_name: "张三" });
  });

  it("含弱关键词时确定性路由到最高分技能，不调用模型", async () => {
    let modelCalled = false;
    const model = { completeJson: async () => { modelCalled = true; throw new Error("should not run"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    const decision = await router.route("看看招聘完成情况", ["project_personnel_statistics", "recruitment_progress_query"]);
    expect(modelCalled).toBe(false);
    expect(decision).toMatchObject({ skill: "recruitment_progress_query", routeType: "rule", needs_clarification: false });
  });

  it("无关键词命中时返回 unsupported 表单降级，不执行写操作", async () => {
    const model = { completeJson: async () => { throw new Error("model offline"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    const decision = await router.route("请综合判断宜宾时代的人才补充态势", ["recruitment_progress_query"]);
    expect(decision).toMatchObject({ skill: "unsupported", routeType: "form", needs_clarification: true });
  });

  it("批量人员参数无法通过单人入职工具 Schema", () => {
    expect(() => schemas.validateToolInput("employee_entry", "preview_employee_entry", {
      employee_ids: ["a", "b"], entry_date: "2026-07-22", project_id: "p", position_id: "j"
    })).toThrow(/Schema/);
  });

  const allowed = [
    "project_personnel_statistics", "employee_information_query", "recruitment_progress_query", "employee_entry", "employee_resignation"
  ];

  it("自然口语路由到人员信息查询并正确抽取姓名", async () => {
    const model = { completeJson: async () => { throw new Error("should not run"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    const decision = await router.route("邱玉彬是谁", allowed);
    expect(decision).toMatchObject({ skill: "employee_information_query", routeType: "rule", mode: "read" });
    expect((decision.parameters as { name?: string }).name).toBe("邱玉彬");
  });

  it("项目人员统计的自然口语正确路由（极米光电还有几个人）", async () => {
    const model = { completeJson: async () => { throw new Error("should not run"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    const decision = await router.route("极米光电还有几个人", allowed);
    expect(decision).toMatchObject({ skill: "project_personnel_statistics", routeType: "rule", mode: "read" });
  });

  it("回归保护：查入职时间走信息查询而非入职/离职", async () => {
    const model = { completeJson: async () => { throw new Error("should not run"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    const decision = await router.route("查一下邱玉彬什么时候入职", allowed);
    expect(decision).toMatchObject({ skill: "employee_information_query", routeType: "rule", mode: "read" });
    expect(decision.skill === "employee_entry" || decision.skill === "employee_resignation").toBe(false);
  });
});
