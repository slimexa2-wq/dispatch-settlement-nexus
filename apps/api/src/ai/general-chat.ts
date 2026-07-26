import type { AppConfig } from "../config.js";
import type { OllamaClient } from "./ollama-client.js";
import type { ChatMessage } from "./types.js";

export class ChatUnavailableError extends Error {
  constructor(message = "本地通用对话模型暂不可用") {
    super(message);
    this.name = "ChatUnavailableError";
  }
}

export type GeneralChatRequest = {
  userId: string;
  conversationId: string;
  message: string;
  history: ChatMessage[];
  systemPrompt: string;
  chatModel?: string;
};

export type GeneralChatResponse = {
  message: string;
  model: string;
  degraded: boolean;
};

/**
 * 通用对话通道：拼装 system + 历史 + 用户消息，调用 OllamaClient.chat（含 fallback）。
 * 任一异常（主模型与 fallback 均失败）时抛出 ChatUnavailableError，由路由层捕获返回友好文案（非 500）。
 */
export class GeneralChat {
  constructor(
    private readonly model: OllamaClient,
    private readonly config: AppConfig
  ) {}

  async respond(req: GeneralChatRequest): Promise<GeneralChatResponse> {
    const messages: ChatMessage[] = [
      { role: "system", content: req.systemPrompt },
      ...req.history,
      { role: "user", content: req.message }
    ];
    try {
      const result = await this.model.chat(messages, {
        model: req.chatModel ?? this.config.XIANGNENG_LLM_MODEL,
        fallbackModel: this.config.XIANGNENG_LLM_FALLBACK_MODEL,
        temperature: 0.1,
        numPredict: 96,
        timeoutMs: this.config.AI_MODEL_TIMEOUT_MS
      });
      return { message: result.content, model: result.model, degraded: result.degraded };
    } catch (error) {
      throw new ChatUnavailableError(error instanceof Error ? error.message : "未知错误");
    }
  }
}
