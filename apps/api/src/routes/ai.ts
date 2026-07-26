import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema } from "@xiangneng/shared";
import { getSession } from "../plugins/auth.js";
import { success } from "../http.js";
import { AppError, notFound } from "../errors.js";
import { AiSchemaRegistry } from "../ai/schema-registry.js";
import { OllamaClient } from "../ai/ollama-client.js";
import { IntentRouter } from "../ai/intent-router.js";
import { aiSkills, type AiSkill } from "../ai/types.js";
import { aiScopeSummary, allowedAiSkills, assertAiSkillAllowed } from "../ai/permissions.js";
import { queryBusinessKnowledge } from "../ai/business-knowledge.js";
import { fastPathReply } from "../ai/chat-fastpath.js";
import { dateTimeReply } from "../ai/date-time.js";
import {
  getProjectPersonnelStatistics,
  getRecruitmentProgress,
  searchEmployee,
  type EmployeeQueryInput,
  type ProjectStatisticsInput,
  type RecruitmentInput
} from "../ai/data-tools.js";
import {
  confirmWriteAction,
  createWritePreview,
  resetAiDemoData,
  serializeAction,
  writeAiAudit
} from "../ai/action-service.js";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().optional(),
  parameters: z.record(z.unknown()).default({})
});

const confirmSchema = z.object({
  actionId: idSchema,
  actionToken: z.string().min(32).max(256),
  idempotencyKey: z.string().trim().min(16).max(128)
});

const toolBySkill: Record<AiSkill, string> = {
  project_personnel_statistics: "get_project_personnel_statistics",
  employee_information_query: "search_employee",
  recruitment_progress_query: "get_recruitment_progress",
  employee_entry: "preview_employee_entry",
  employee_resignation: "preview_employee_resignation"
};

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const schemas = new AiSchemaRegistry(app.config);
  const model = new OllamaClient(app.config);
  const router = new IntentRouter(app.config, schemas, model);
  await schemas.load();
  await router.load();

  if (app.config.NODE_ENV !== "test") {
    setTimeout(() => void model.warmup(), 250).unref();
  }

  app.post("/ai/chat", { preHandler: [app.authenticate] }, async (request) => {
    const input = chatSchema.parse(request.body);
    const user = getSession(request);
    const conversationId = input.conversationId ?? "default";
    const allowed = allowedAiSkills(user);
    if (!allowed.length) throw new AppError(403, "AI_NOT_AVAILABLE_FOR_ROLE", "当前角色没有可用的 AI 业务能力");
    const directKnowledgeQuestion = /负责人|联系电话|联系方式|项目介绍|岗位职责|工作内容|岗位要求|有哪些.{0,4}岗位|供应商.{0,8}联系人|系统.{0,8}(概况|总览|多少)/.test(input.message);
    if (directKnowledgeQuestion) {
      const knowledge = await queryBusinessKnowledge(app.prisma, user, input.message);
      if (knowledge) {
        await writeAiAudit(app.prisma, user, {
          rawInstruction: input.message,
          skill: "business_knowledge_query",
          parameters: {},
          tool: "query_scoped_business_knowledge",
          confirmed: false,
          result: knowledge,
          routeType: "rule"
        });
        return success(request, {
          type: "knowledge_result",
          answer: knowledge.answer,
          result: knowledge,
          route_type: "retrieval",
          confidence: 1
        });
      }
    }
    const fastReply = fastPathReply(input.message);
    if (fastReply) {
      return success(request, {
        type: "chat_result",
        message: fastReply,
        conversation_id: conversationId,
        route_type: "fast_path",
        model: "rule",
        degraded: false
      });
    }
    const dateReply = dateTimeReply(input.message);
    if (dateReply) {
      return success(request, {
        type: "chat_result",
        message: dateReply,
        conversation_id: conversationId,
        route_type: "date",
        model: "rule",
        degraded: false
      });
    }
    const decision = await router.route(input.message, allowed, input.parameters);
    if (decision.skill === "unsupported") {
      const knowledge = await queryBusinessKnowledge(app.prisma, user, input.message);
      if (knowledge) {
        await writeAiAudit(app.prisma, user, {
          rawInstruction: input.message,
          skill: "business_knowledge_query",
          parameters: {},
          tool: "query_scoped_business_knowledge",
          confirmed: false,
          result: knowledge,
          routeType: "rule"
        });
        return success(request, {
          type: "knowledge_result",
          answer: knowledge.answer,
          result: knowledge,
          route_type: "retrieval",
          confidence: 1
        });
      }
      return success(request, {
        type: "clarification",
        skill: "unsupported",
        message: "当前助手仅支持项目人员数据、人员信息、招聘进度、单人入职和单人离职；也可查询权限范围内的项目、岗位和供应商档案。",
        extracted_parameters: {},
        route_type: "form",
        standard_form_available: true
      });
    }
    assertAiSkillAllowed(user, decision.skill);
    if (decision.needs_clarification && Object.keys(input.parameters).length === 0) {
      return success(request, {
        type: "clarification",
        skill: decision.skill,
        message: decision.clarification_question,
        extracted_parameters: decision.parameters,
        route_type: decision.routeType,
        standard_form_available: true
      });
    }

    if (decision.skill === "employee_entry" || decision.skill === "employee_resignation") {
      const preview = await createWritePreview(app.prisma, app.config, schemas, request, user, {
        skill: decision.skill,
        rawInstruction: input.message,
        parameters: decision.parameters,
        routeType: decision.routeType
      });
      return success(request, { type: "action_preview", skill: decision.skill, route_type: decision.routeType, preview });
    }

    const tool = toolBySkill[decision.skill];
    schemas.validateToolInput(decision.skill, tool, decision.parameters);
    let result: unknown;
    if (decision.skill === "project_personnel_statistics") {
      result = await getProjectPersonnelStatistics(app.prisma, user, decision.parameters as ProjectStatisticsInput);
    } else if (decision.skill === "employee_information_query") {
      result = await searchEmployee(app.prisma, user, decision.parameters as EmployeeQueryInput);
    } else {
      result = await getRecruitmentProgress(app.prisma, user, decision.parameters as RecruitmentInput);
    }
    await writeAiAudit(app.prisma, user, {
      rawInstruction: input.message,
      skill: decision.skill,
      parameters: decision.parameters,
      tool,
      confirmed: false,
      result,
      model: decision.routeType === "model" ? app.config.XIANGNENG_LLM_MODEL : undefined,
      routeType: decision.routeType
    });
    return success(request, {
      type: "query_result",
      skill: decision.skill,
      route_type: decision.routeType,
      confidence: decision.confidence,
      result
    });
  });

  app.post("/ai/actions/confirm", { preHandler: [app.authenticate] }, async (request) => {
    const input = confirmSchema.parse(request.body);
    const user = getSession(request);
    const action = await app.prisma.aiAction.findUnique({ where: { id: input.actionId }, select: { skill: true } });
    if (!action || !aiSkills.includes(action.skill as AiSkill)) notFound("AI 操作");
    assertAiSkillAllowed(user, action.skill as AiSkill);
    const result = await confirmWriteAction(app.prisma, app.config, request, user, input);
    return success(request, result);
  });

  app.get("/ai/actions/:actionId", { preHandler: [app.authenticate] }, async (request) => {
    const { actionId } = z.object({ actionId: idSchema }).parse(request.params);
    const user = getSession(request);
    const action = await app.prisma.aiAction.findFirst({ where: { id: actionId, userId: user.id } });
    if (!action) notFound("AI 操作");
    return success(request, serializeAction(action));
  });

  app.get("/ai/health", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = getSession(request);
    let database: "ok" | "unavailable" = "ok";
    try {
      await app.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "unavailable";
    }
    const modelStatus = await model.health();
    // 只要数据库可用且规则已加载，即视为服务健康（HTTP 200），即使模型不可用也仅标记 degraded，
    // 避免 Render 因模型降级而误杀整个服务（门户与业务查询在无模型时仍可正常工作）。
    const healthy = database === "ok" && router.isLoaded();
    const snapshot = {
      status: healthy ? (modelStatus === "ok" ? "ok" : "degraded") : "degraded",
      database,
      model: modelStatus,
      model_name: app.config.XIANGNENG_LLM_MODEL,
      rules: router.isLoaded() ? "ok" : "unavailable",
      allowed_skills: allowedAiSkills(user),
      data_scope: aiScopeSummary(user),
      form_fallback_available: true,
      checked_at: new Date().toISOString()
    };
    return reply.status(healthy ? 200 : 503).send(success(request, snapshot));
  });

  app.post("/ai/demo/reset", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    if (!allowedAiSkills(user).includes("employee_entry") || !allowedAiSkills(user).includes("employee_resignation")) {
      throw new AppError(403, "AI_DEMO_RESET_FORBIDDEN", "当前角色不能重置 AI 演示写操作");
    }
    return success(request, await resetAiDemoData(app.prisma, app.config, request, user));
  });
}
