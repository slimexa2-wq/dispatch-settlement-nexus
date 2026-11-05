import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

  it("手机号夹在办理与入职/离职之间时仍优先识别写操作", async () => {
    const model = { completeJson: async () => { throw new Error("should not run"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();

    const entry = await router.route("给手机号10000000048办理2026-07-26入职", [
      "employee_information_query", "employee_entry"
    ]);
    expect(entry).toMatchObject({
      skill: "employee_entry",
      mode: "write",
      routeType: "rule",
      parameters: { phone: "10000000048", entry_date: "2026-07-26" }
    });

    const resignation = await router.route("给手机号10000000009办理2026-07-26离职，原因是项目结束", [
      "employee_information_query", "employee_resignation"
    ]);
    expect(resignation).toMatchObject({
      skill: "employee_resignation",
      mode: "write",
      routeType: "rule",
      parameters: {
        phone: "10000000009",
        resignation_date: "2026-07-26",
        resignation_reason: "项目结束"
      }
    });
  });

  it("完整手机号人员查询不会被其他数字或姓名规则污染", async () => {
    const model = { completeJson: async () => { throw new Error("should not run"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    const decision = await router.route("查询手机号10000000004的完整人员信息", [
      "project_personnel_statistics", "employee_information_query", "recruitment_progress_query"
    ]);
    expect(decision).toMatchObject({
      skill: "employee_information_query",
      routeType: "rule",
      parameters: { name: null, phone: "10000000004", phone_suffix: null }
    });
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
    const decision = await router.route("请综合判断祥能智造示范项目的人才补充态势", ["recruitment_progress_query"]);
    expect(decision).toMatchObject({ skill: "unsupported", routeType: "form", needs_clarification: true });
  });

  it("复杂表达由本地模型语义兜底，参数仍由程序提取", async () => {
    let modelCalled = false;
    const model = {
      completeJson: async () => {
        modelCalled = true;
        return {
          skill: "recruitment_progress_query",
          confidence: 0.88,
          mode: "read",
          parameters: {},
          needs_clarification: false,
          clarification_question: null,
          reason: "semantic"
        };
      }
    } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    const decision = await router.route("请综合判断祥能智造示范项目的人才补充态势", ["recruitment_progress_query"]);
    expect(modelCalled).toBe(true);
    expect(decision).toMatchObject({
      skill: "recruitment_progress_query",
      routeType: "model",
      mode: "read"
    });
    expect(decision.parameters).toMatchObject({ project_name: "祥能智造示范" });
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

  it("通过 Skill 包的意图回归样例，模型离线时仍不误触发写操作", async () => {
    const raw = await readFile(join(testConfig.AI_SKILL_ROOT, "tests", "intent-regression.jsonl"), "utf8");
    const cases = raw.trim().split(/\r?\n/).map((line) => JSON.parse(line) as {
      id: string;
      input: string;
      expected_skill: string;
      expected_mode: string;
      must_not_write?: boolean;
    });
    const model = { completeJson: async () => { throw new Error("model offline"); } } as unknown as OllamaClient;
    const router = new IntentRouter(testConfig, schemas, model);
    await router.load();
    for (const item of cases) {
      const decision = await router.route(item.input, allowed);
      expect(decision.skill, item.id).toBe(item.expected_skill);
      expect(decision.mode, item.id).toBe(item.expected_mode);
      if (item.must_not_write) expect(decision.mode, item.id).not.toBe("write");
    }
  });
});
