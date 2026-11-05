import os from "node:os";
import type { AppConfig } from "../config.js";
import type { ChatMessage, ToolDefinition } from "./types.js";

type ChatResponse = {
  message?: {
    content?: string | null;
    tool_calls?: Array<{ function?: { name?: string; arguments?: string | Record<string, unknown> } }>;
  };
};

/**
 * OpenAI 兼容响应的 choices[0].message.content。
 */
type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const modelOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["skill"],
  properties: {
    skill: { enum: ["project_personnel_statistics", "employee_information_query", "recruitment_progress_query", "employee_entry", "employee_resignation", "unsupported"] }
  }
} as const;

/**
 * 大模型客户端。默认 provider=ollama 走本地 Ollama 私有协议（/api/chat + format/options/keep_alive），
 * 与现状完全一致；provider=openai 时切换为 OpenAI 兼容的 /v1/chat/completions 协议
 * （Authorization: Bearer、response_format、choices[0].message.content）。
 *
 * 两套 provider 共用同一套熔断（circuitOpen/failures）与超时（AI_MODEL_TIMEOUT_MS）逻辑。
 * XIANGNENG_LLM_PROVIDER 未设置或 ="ollama" 时，行为必须与原来完全一致。
 */
export class OllamaClient {
  private failures = 0;
  private circuitOpenedAt = 0;

  constructor(private readonly config: AppConfig) {}

  private get provider(): "ollama" | "openai" {
    return this.config.XIANGNENG_LLM_PROVIDER === "openai" ? "openai" : "ollama";
  }

  /** Ollama 基址：剥离 BASE_URL 末尾的 /v1（Ollama 实际监听在根路径）。 */
  private rootUrl(): string {
    return this.config.XIANGNENG_LLM_BASE_URL.replace(/\/v1$/, "");
  }

  /** OpenAI 兼容端点：BASE_URL 已含 /v1，直接拼接 /chat/completions（不再 strip /v1）。 */
  private completionsUrl(): string {
    return `${this.config.XIANGNENG_LLM_BASE_URL}/chat/completions`;
  }

  private circuitOpen(): boolean {
    if (this.failures < 3) return false;
    if (Date.now() - this.circuitOpenedAt > 60_000) {
      this.failures = 0;
      this.circuitOpenedAt = 0;
      return false;
    }
    return true;
  }

  // ---------- Ollama 私有协议底层请求（仅 ollama 模式使用） ----------

  private async request(path: string, body: unknown): Promise<ChatResponse> {
    if (this.circuitOpen()) throw new Error("本地模型熔断中，请使用标准表单");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.AI_MODEL_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.rootUrl()}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`本地模型返回 HTTP ${response.status}`);
      const value = await response.json() as ChatResponse;
      this.failures = 0;
      return value;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= 3) this.circuitOpenedAt = Date.now();
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("本地模型响应超时");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 不触碰熔断计数器的裸请求，专供通用通道 fallback 重试使用。 */
  private async rawRequest(path: string, body: unknown, timeoutMs?: number): Promise<ChatResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.config.AI_MODEL_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.rootUrl()}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`本地模型返回 HTTP ${response.status}`);
      return (await response.json()) as ChatResponse;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("本地模型响应超时");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- OpenAI 兼容底层请求（仅 openai 模式使用） ----------

  /**
   * 调用 OpenAI 兼容 /chat/completions，返回 choices[0].message.content。
   * bypassCircuit=true 时绕过共享熔断计数（供 fallback 重试，与 Ollama rawRequest 一致）。
   * 失败会抛出（含超时、非 2xx、空内容），由调用方按主模型/fallback 语义处理。
   */
  private async openaiComplete(
    model: string,
    messages: ChatMessage[],
    opts: { temperature?: number; maxTokens?: number; timeoutMs?: number; responseFormat?: { type: "json_object" }; bypassCircuit?: boolean }
  ): Promise<string> {
    const bypassCircuit = opts.bypassCircuit ?? false;
    if (!bypassCircuit && this.circuitOpen()) throw new Error("本地模型熔断中，请使用标准表单");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.config.AI_MODEL_TIMEOUT_MS);
    try {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 128,
        stream: false
      };
      if (opts.responseFormat) body.response_format = opts.responseFormat;
      const response = await fetch(this.completionsUrl(), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${this.config.XIANGNENG_LLM_API_KEY}`
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`本地模型返回 HTTP ${response.status}`);
      const value = await response.json() as OpenAIChatResponse;
      const content = value.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("本地模型没有返回回答");
      if (!bypassCircuit) this.failures = 0;
      return content;
    } catch (error) {
      if (!bypassCircuit) {
        this.failures += 1;
        if (this.failures >= 3) this.circuitOpenedAt = Date.now();
      }
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("本地模型响应超时");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- 公共能力 ----------

  async completeJson(messages: ChatMessage[], tools: ToolDefinition[]): Promise<Record<string, unknown>> {
    const compactTools = tools.map((tool) =>
      `${tool.function.name}(${Object.keys((tool.function.parameters.properties as Record<string, unknown> | undefined) ?? {}).join(",")})`
    );
    const toolContext: ChatMessage = {
      role: "system",
      content: `可参考工具：${compactTools.join("；")}`
    };
    if (this.provider === "openai") {
      const content = await this.openaiComplete(this.config.XIANGNENG_LLM_MODEL, [toolContext, ...messages], {
        temperature: 0.1,
        maxTokens: 256,
        responseFormat: { type: "json_object" }
      });
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error("本地模型未返回完整 JSON");
      const parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
      const skill = typeof parsed.skill === "string" ? parsed.skill : "unsupported";
      return {
        skill,
        confidence: skill === "unsupported" ? 0 : 0.82,
        mode: skill === "unsupported" ? "unsupported" : skill === "employee_entry" || skill === "employee_resignation" ? "write" : "read",
        parameters: typeof parsed.parameters === "object" && parsed.parameters ? parsed.parameters : {},
        needs_clarification: skill === "unsupported",
        clarification_question: skill === "unsupported" ? "请从固定能力中选择或补充业务对象。" : null,
        reason: "本地模型语义匹配"
      };
    }
    const response = await this.request("/api/chat", {
      model: this.config.XIANGNENG_LLM_MODEL,
      think: false,
      stream: false,
      messages: [toolContext, ...messages],
      format: modelOutputSchema,
      keep_alive: "30m",
      options: { temperature: 0.1, num_predict: 32, num_ctx: 1024 }
    });
    const toolArguments = response.message?.tool_calls?.[0]?.function?.arguments;
    const serializedToolArguments = typeof toolArguments === "string"
      ? toolArguments
      : toolArguments ? JSON.stringify(toolArguments) : undefined;
    const raw = serializedToolArguments || response.message?.content;
    if (!raw) throw new Error("本地模型没有返回可解析内容");
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error(`本地模型未返回完整 JSON（长度 ${raw.length}）`);
    const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    const skill = typeof parsed.skill === "string" ? parsed.skill : "unsupported";
    return {
      skill,
      confidence: skill === "unsupported" ? 0 : 0.82,
      mode: skill === "unsupported" ? "unsupported" : skill === "employee_entry" || skill === "employee_resignation" ? "write" : "read",
      parameters: typeof parsed.parameters === "object" && parsed.parameters ? parsed.parameters : {},
      needs_clarification: skill === "unsupported",
      clarification_question: skill === "unsupported" ? "请从固定能力中选择或补充业务对象。" : null,
      reason: "本地模型语义匹配"
    };
  }

  async answerGrounded(question: string, context: unknown): Promise<string> {
    const value = context as { records?: unknown[] };
    const compactContext = {
      records: Array.isArray(value.records)
        ? value.records.slice(0, 4).map((record) => {
            const item = record as { type?: unknown; title?: unknown; fields?: Record<string, unknown> };
            return { type: item.type, title: item.title, fields: Object.fromEntries(Object.entries(item.fields ?? {}).slice(0, 6)) };
          })
        : context
    };
    if (this.provider === "openai") {
      const content = await this.openaiComplete(this.config.XIANGNENG_LLM_MODEL, [
        {
          role: "system",
          content: "你是祥能AI业务助手。只按数据回答，不得编造；保留完整号码；不暴露数据库字段。用不超过50字中文回答。"
        },
        {
          role: "user",
          content: `问题：${question}\n当前权限数据：${JSON.stringify(compactContext)}`
        }
      ], { temperature: 0.1, maxTokens: 64 });
      return content;
    }
    const response = await this.request("/api/chat", {
      model: this.config.XIANGNENG_LLM_MODEL,
      think: false,
      stream: false,
      messages: [
        {
          role: "system",
          content: "你是祥能AI业务助手。只按数据回答，不得编造；保留完整号码；不暴露数据库字段。用不超过50字中文回答。"
        },
        {
          role: "user",
          content: `问题：${question}\n当前权限数据：${JSON.stringify(compactContext)}`
        }
      ],
      keep_alive: "30m",
      options: { temperature: 0.1, num_predict: 40, num_ctx: 1024 }
    });
    const answer = response.message?.content?.trim();
    if (!answer) throw new Error("本地模型没有返回回答");
    return answer;
  }

  /**
   * 自由文本对话（通用通道）。区别于 completeJson（强制 JSON）/answerGrounded（带业务上下文）。
   * 主模型失败（错误/超时/非2xx/空内容）且提供了不同于主模型的 fallbackModel 时，
   * 用 fallback 再请求一次；fallback 走裸请求、绕过熔断计数，以免误伤业务通道。
   *
   * 通用通道生成长度远大于意图分类，在 CPU-only 机器上可能耗时 10~30 秒，因此使用独立
   * 的较长超时（默认 60 秒），与业务通道的 AI_MODEL_TIMEOUT_MS 解耦。
   */
  async chat(
    messages: ChatMessage[],
    opts?: { model?: string; fallbackModel?: string; temperature?: number; numPredict?: number; numCtx?: number; timeoutMs?: number }
  ): Promise<{ content: string; model: string; degraded: boolean }> {
    const primary = opts?.model ?? this.config.XIANGNENG_LLM_MODEL;
    const fallback = opts?.fallbackModel;
    const temperature = opts?.temperature ?? 0.7;
    const numPredict = opts?.numPredict ?? 128;
    const timeoutMs = opts?.timeoutMs ?? 60_000;
    if (this.provider === "openai") {
      try {
        const content = await this.openaiComplete(primary, messages, { temperature, maxTokens: numPredict, timeoutMs });
        return { content, model: primary, degraded: false };
      } catch (error) {
        if (fallback && fallback !== primary) {
          const content = await this.openaiComplete(fallback, messages, { temperature, maxTokens: numPredict, timeoutMs, bypassCircuit: true });
          return { content, model: fallback, degraded: true };
        }
        throw error;
      }
    }
    const buildBody = (model: string) => ({
      model,
      think: false,
      stream: false,
      messages,
      keep_alive: "30m",
      options: { temperature, num_predict: numPredict, num_ctx: opts?.numCtx ?? 1024, num_thread: os.cpus().length }
    });
    try {
      const response = await this.rawRequest("/api/chat", buildBody(primary), timeoutMs);
      const content = response.message?.content?.trim();
      if (!content) throw new Error("本地模型没有返回回答");
      return { content, model: primary, degraded: false };
    } catch (error) {
      if (fallback && fallback !== primary) {
        const response = await this.rawRequest("/api/chat", buildBody(fallback), timeoutMs);
        const content = response.message?.content?.trim();
        if (!content) throw new Error("本地模型没有返回回答");
        return { content, model: fallback, degraded: true };
      }
      throw error;
    }
  }

  async warmup(): Promise<boolean> {
    if (this.provider === "openai") {
      try {
        await this.openaiComplete(this.config.XIANGNENG_LLM_MODEL, [{ role: "user", content: "只回复 OK" }], {
          temperature: 0.1,
          maxTokens: 4,
          timeoutMs: 10_000
        });
        return true;
      } catch {
        return false;
      }
    }
    try {
      await this.request("/api/chat", {
        model: this.config.XIANGNENG_LLM_MODEL,
        think: false,
        stream: false,
        messages: [{ role: "user", content: "只回复 OK" }],
        keep_alive: "30m",
        options: { temperature: 0.1, num_predict: 4 }
      });
      return true;
    } catch {
      return false;
    }
  }

  async health(): Promise<"ok" | "unavailable" | "circuit_open"> {
    if (this.circuitOpen()) return "circuit_open";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      if (this.provider === "openai") {
        // 最稳、最省的方式：GET /models（标准 OpenAI 兼容端点，验证连通与鉴权即可）。
        const response = await fetch(`${this.config.XIANGNENG_LLM_BASE_URL}/models`, {
          signal: controller.signal,
          headers: { "authorization": `Bearer ${this.config.XIANGNENG_LLM_API_KEY}` }
        });
        return response.ok ? "ok" : "unavailable";
      }
      const response = await fetch(`${this.rootUrl()}/api/tags`, { signal: controller.signal });
      if (!response.ok) return "unavailable";
      const body = await response.json() as { models?: Array<{ name?: string; model?: string }> };
      return body.models?.some((item) => (item.name ?? item.model) === this.config.XIANGNENG_LLM_MODEL) ? "ok" : "unavailable";
    } catch {
      return "unavailable";
    } finally {
      clearTimeout(timer);
    }
  }
}
