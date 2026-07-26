import type { ChatMessage } from "./types.js";

export type StoredTurn = {
  role: "user" | "assistant";
  content: string;
  at: number;
};

/**
 * 进程内多轮会话记忆。key = `${userId}:${conversationId}`，单实例本地 demo 使用，无 Redis/DB。
 * 仅保留最近 maxTurns 条 user/assistant 记录（不含 system），避免历史无限增长。
 */
export class ConversationMemory {
  private readonly store = new Map<string, StoredTurn[]>();

  constructor(private readonly maxTurns = 12) {}

  key(userId: string, conversationId: string): string {
    return `${userId}:${conversationId}`;
  }

  private resolveKey(userId: string, conversationId: string): string {
    return this.key(userId, conversationId);
  }

  get(userId: string, conversationId: string): ChatMessage[] {
    const turns = this.store.get(this.resolveKey(userId, conversationId)) ?? [];
    return turns.map((turn) => ({ role: turn.role, content: turn.content }));
  }

  add(userId: string, conversationId: string, turn: StoredTurn): void {
    const key = this.resolveKey(userId, conversationId);
    const turns = this.store.get(key) ?? [];
    turns.push(turn);
    this.store.set(key, turns);
    this.trim(key);
  }

  trim(key: string): void {
    const turns = this.store.get(key);
    if (turns && turns.length > this.maxTurns) {
      this.store.set(key, turns.slice(turns.length - this.maxTurns));
    }
  }

  clear(userId: string, conversationId: string): void {
    this.store.delete(this.resolveKey(userId, conversationId));
  }
}
