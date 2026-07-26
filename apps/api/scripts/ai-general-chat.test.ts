import assert from "node:assert";
import { ConversationMemory } from "../src/ai/conversation-memory.js";
import { GeneralChat, ChatUnavailableError } from "../src/ai/general-chat.js";
import { OllamaClient } from "../src/ai/ollama-client.js";
import type { ChatMessage } from "../src/ai/types.js";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  PASS  ${name}`);
}

console.log("== T1 ConversationMemory ==");
{
  const mem = new ConversationMemory();
  const uid = "u1";
  const cid = "c1";
  for (let i = 0; i < 20; i++) {
    mem.add(uid, cid, { role: i % 2 === 0 ? "user" : "assistant", content: `turn-${i}`, at: i });
  }
  const turns = mem.get(uid, cid);
  check("get() 返回 ≤ 12 条", () => assert.ok(turns.length <= 12, `got ${turns.length}`));
  check("保留最近 12 条（不含最旧）", () => {
    assert.strictEqual(turns.length, 12);
    assert.strictEqual(turns[0]?.content, "turn-8", "oldest should be turn-8");
    assert.strictEqual(turns[11]?.content, "turn-19", "newest should be turn-19");
  });
  check("get() 仅含 user/assistant 角色且无 system", () => {
    for (const t of turns) assert.ok(t.role === "user" || t.role === "assistant");
    assert.ok(!("at" in turns[0]!));
  });
  mem.clear(uid, cid);
  check("clear() 清空会话", () => assert.strictEqual(mem.get(uid, cid).length, 0));
  check("不同 key 隔离", () => {
    mem.add(uid, "other", { role: "user", content: "x", at: 0 });
    assert.strictEqual(mem.get(uid, cid).length, 0);
    assert.strictEqual(mem.get(uid, "other").length, 1);
  });
}

console.log("== T4 GeneralChat (stubbed OllamaClient) ==");
{
  const captured: { messages: ChatMessage[]; opts: unknown }[] = [];
  const stubModel = {
    chat(messages: ChatMessage[], opts: unknown) {
      captured.push({ messages, opts });
      return Promise.resolve({ content: "我是祥能AI业务助手", model: "primary", degraded: false });
    }
  } as any;
  const cfg = { XIANGNENG_LLM_FALLBACK_MODEL: "fallback" } as any;
  const gc = new GeneralChat(stubModel, cfg);
  const history: ChatMessage[] = [
    { role: "user", content: "你好" },
    { role: "assistant", content: "你好，有什么可以帮你？" }
  ];
  const sys = "SYS-PROMPT";
  const res = await gc.respond({ userId: "u", conversationId: "c", message: "你是谁", history, systemPrompt: sys });
  check("返回模型内容", () => assert.strictEqual(res.message, "我是祥能AI业务助手"));
  check("拼装 [system, ...history, user]", () => {
    const m = captured[0]!.messages;
    assert.strictEqual(m[0]?.role, "system");
    assert.strictEqual(m[0]?.content, sys);
    assert.strictEqual(m[1]?.content, "你好");
    assert.strictEqual(m[2]?.content, "你好，有什么可以帮你？");
    assert.strictEqual(m[3]?.role, "user");
    assert.strictEqual(m[3]?.content, "你是谁");
  });
  check("传递 fallbackModel", () => {
    const opts = captured[0]!.opts as any;
    assert.strictEqual(opts.fallbackModel, "fallback");
  });

  const failingModel = {
    chat() {
      return Promise.reject(new Error("boom"));
    }
  } as any;
  const gc2 = new GeneralChat(failingModel, cfg);
  let threw = false;
  try {
    await gc2.respond({ userId: "u", conversationId: "c", message: "hi", history: [], systemPrompt: sys });
  } catch (e) {
    threw = true;
    check("chat() 抛错时 respond() 抛 ChatUnavailableError", () => assert.ok(e instanceof ChatUnavailableError));
  }
  assert.ok(threw, "应抛出错误");
}

console.log("== T2 OllamaClient.chat fallback (stubbed fetch) ==");
{
  const config = {
    XIANGNENG_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
    XIANGNENG_LLM_MODEL: "primary-model",
    XIANGNENG_LLM_FALLBACK_MODEL: "fallback-model",
    AI_MODEL_TIMEOUT_MS: 2000
  } as any;
  const client = new OllamaClient(config);

  // 主模型返回空内容 -> 触发 fallback
  const calls: string[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body.model);
    if (body.model === "primary-model") {
      return new Response(JSON.stringify({ message: { content: "  " } }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: { content: "fallback answer" } }), { status: 200 });
  };
  const r1 = await client.chat([{ role: "user", content: "hi" }], { fallbackModel: "fallback-model" });
  check("主模型空内容 → 走 fallback", () => {
    assert.deepStrictEqual(calls, ["primary-model", "fallback-model"]);
    assert.strictEqual(r1.content, "fallback answer");
    assert.strictEqual(r1.model, "fallback-model");
    assert.strictEqual(r1.degraded, true);
  });

  // 主模型成功 → 不走 fallback
  const calls2: string[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls2.push(body.model);
    return new Response(JSON.stringify({ message: { content: "primary ok" } }), { status: 200 });
  };
  const r2 = await client.chat([{ role: "user", content: "hi" }], { fallbackModel: "fallback-model" });
  check("主模型成功 → 不降级", () => {
    assert.deepStrictEqual(calls2, ["primary-model"]);
    assert.strictEqual(r2.degraded, false);
    assert.strictEqual(r2.model, "primary-model");
  });

  // 主模型与 fallback 均失败 → 抛错
  (globalThis as any).fetch = async () => new Response("err", { status: 500 });
  let t = false;
  try {
    await client.chat([{ role: "user", content: "hi" }], { fallbackModel: "fallback-model" });
  } catch {
    t = true;
  }
  check("主与 fallback 均失败 → 抛错", () => assert.ok(t));

  // 无 fallbackModel 时主模型失败直接抛错（不重试）
  const calls3: string[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls3.push(body.model);
    return new Response(JSON.stringify({ message: { content: "  " } }), { status: 200 });
  };
  let t2 = false;
  try {
    await client.chat([{ role: "user", content: "hi" }]);
  } catch {
    t2 = true;
  }
  check("无 fallback → 主失败直接抛错不重试", () => {
    assert.ok(t2);
    assert.deepStrictEqual(calls3, ["primary-model"]);
  });
}

console.log(`\nAll ${passed} checks passed.`);
