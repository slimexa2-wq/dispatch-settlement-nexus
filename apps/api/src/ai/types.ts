export const aiSkills = [
  "project_personnel_statistics",
  "employee_information_query",
  "recruitment_progress_query",
  "employee_entry",
  "employee_resignation"
] as const;

export type AiSkill = (typeof aiSkills)[number];
export type AiRouteType = "rule" | "model" | "form" | "general";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type IntentDecision = {
  skill: AiSkill | "unsupported";
  confidence: number;
  mode: "read" | "write" | "unsupported";
  parameters: Record<string, unknown>;
  needs_clarification: boolean;
  clarification_question: string | null;
  reason?: string;
  routeType: AiRouteType;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AiHealthSnapshot = {
  status: "ok" | "degraded";
  database: "ok" | "unavailable";
  model: "ok" | "unavailable" | "circuit_open";
  modelName: string;
  rules: "ok" | "unavailable";
  checkedAt: string;
};

/** 通用对话通道的 /ai/chat 响应。 */
export type ChatResult = {
  type: "chat_result";
  message: string;
  conversation_id: string;
  route_type: "general";
  model: string;
  degraded: boolean;
};
