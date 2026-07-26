import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { InsuranceType, type SessionUser } from "@xiangneng/shared";
import { Prisma, type AiAction, type PrismaClient } from "../generated/prisma/client.js";
import { AppError, notFound } from "../errors.js";
import { personWhere } from "../data-scope.js";
import { writeAudit } from "../audit.js";
import {
  offboardPerson,
  onboardPerson,
  previewPersonOffboard,
  previewPersonOnboard
} from "../services/person-lifecycle.js";
import type { AppConfig } from "../config.js";
import { parseDateOnly } from "../dates.js";
import type { AiRouteType, AiSkill } from "./types.js";
import { aiScopeSummary } from "./permissions.js";
import { resolveUniqueEmployee, type EmployeeQueryInput } from "./data-tools.js";
import type { AiSchemaRegistry } from "./schema-registry.js";

type WriteSkill = Extract<AiSkill, "employee_entry" | "employee_resignation">;

export type ActionPreview = {
  action_id: string;
  action_token: string;
  expires_at: string;
  person: Record<string, unknown>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  impact_scope: string[];
  confirmation_required: true;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(raw: string, expectedHash: string): boolean {
  const actual = Buffer.from(tokenHash(raw), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizedReason(value: string): string {
  const reason = value.trim();
  const aliases: Array<[RegExp, string]> = [
    [/自离|自行离开|未办手续/, "自离"],
    [/辞职|个人原因|主动离职/, "个人原因辞职"],
    [/清退|辞退|违纪/, "公司清退"],
    [/项目结束|项目完结|撤场/, "项目结束"],
    [/调岗|转项目/, "内部调动"]
  ];
  return aliases.find(([pattern]) => pattern.test(reason))?.[1] ?? reason;
}

function insuranceValues(value: unknown, fallback: unknown): Array<(typeof InsuranceType)[keyof typeof InsuranceType]> {
  const allowed = new Set(Object.values(InsuranceType));
  const values = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  return values.filter((item): item is (typeof InsuranceType)[keyof typeof InsuranceType] => typeof item === "string" && allowed.has(item as never));
}

async function employeeContext(db: PrismaClient, user: SessionUser, parameters: Record<string, unknown>) {
  const employee = await resolveUniqueEmployee(db, user, {
    employee_id: typeof parameters.employee_id === "string" ? parameters.employee_id : null,
    name: typeof parameters.employee_name === "string" ? parameters.employee_name : null,
    phone: typeof parameters.phone === "string" ? parameters.phone : null,
    phone_suffix: typeof parameters.phone_suffix === "string" ? parameters.phone_suffix : null
  } satisfies EmployeeQueryInput);
  const current = await db.person.findUnique({
    where: { id: employee.employee_id },
    select: {
      id: true, name: true, projectId: true, jobTitle: true, insuranceTypes: true, employeeNo: true,
      project: { select: { name: true } },
      applications: { orderBy: { appliedAt: "desc" }, take: 1, select: { jobDemandId: true } }
    }
  });
  if (!current) notFound("人员");
  return { employee, current };
}

export async function writeAiAudit(
  db: PrismaClient | Prisma.TransactionClient,
  user: SessionUser,
  input: {
    rawInstruction: string;
    skill: AiSkill | "business_knowledge_query";
    parameters: Record<string, unknown>;
    tool: string;
    before?: unknown;
    after?: unknown;
    confirmed: boolean;
    actionId?: string;
    idempotencyKey?: string;
    result?: unknown;
    error?: string;
    model?: string;
    routeType: AiRouteType;
  }
): Promise<void> {
  await db.aiAuditLog.create({
    data: {
      actorId: user.id,
      role: user.role,
      rawInstruction: input.rawInstruction,
      skill: input.skill,
      parameters: asJson(input.parameters),
      tool: input.tool,
      before: input.before === undefined ? undefined : asJson(input.before),
      after: input.after === undefined ? undefined : asJson(input.after),
      confirmed: input.confirmed,
      actionId: input.actionId,
      idempotencyKey: input.idempotencyKey,
      result: input.result === undefined ? undefined : asJson(input.result),
      error: input.error,
      scope: asJson(aiScopeSummary(user)),
      model: input.model,
      routeType: input.routeType
    }
  });
}

export async function createWritePreview(
  db: PrismaClient,
  config: AppConfig,
  schemas: AiSchemaRegistry,
  request: FastifyRequest,
  user: SessionUser,
  input: { skill: WriteSkill; rawInstruction: string; parameters: Record<string, unknown>; routeType: AiRouteType }
): Promise<ActionPreview> {
  const { employee, current } = await employeeContext(db, user, input.parameters);
  let tool: string;
  let toolInput: Record<string, unknown>;
  let preview: Awaited<ReturnType<typeof previewPersonOnboard>> | Awaited<ReturnType<typeof previewPersonOffboard>>;
  if (input.skill === "employee_entry") {
    tool = "preview_employee_entry";
    toolInput = {
      employee_id: current.id,
      entry_date: typeof input.parameters.entry_date === "string" ? input.parameters.entry_date : null,
      project_id: typeof input.parameters.project_id === "string" ? input.parameters.project_id : current.projectId,
      position_id: typeof input.parameters.position_id === "string" ? input.parameters.position_id : current.applications[0]?.jobDemandId,
      supplier_id: typeof input.parameters.supplier_id === "string" ? input.parameters.supplier_id : null,
      insurance_status: typeof input.parameters.insurance_status === "string" ? input.parameters.insurance_status : null,
      remark: typeof input.parameters.remark === "string" ? input.parameters.remark : null
    };
    if (!toolInput.entry_date || !toolInput.position_id) {
      throw new AppError(400, "AI_PARAMETERS_REQUIRED", "办理入职还需要入职日期和岗位信息", { missing: [!toolInput.entry_date && "entry_date", !toolInput.position_id && "position_id"].filter(Boolean) });
    }
    schemas.validateToolInput(input.skill, tool, toolInput);
    preview = await previewPersonOnboard(db, user, current.id, {
      onboardDate: parseDateOnly(String(toolInput.entry_date)),
      insuranceTypes: insuranceValues(input.parameters.insurance_types, current.insuranceTypes),
      employeeNo: current.employeeNo,
      notes: toolInput.remark as string | null
    });
  } else {
    tool = "preview_employee_resignation";
    const reason = typeof input.parameters.resignation_reason === "string" ? normalizedReason(input.parameters.resignation_reason) : null;
    toolInput = {
      employee_id: current.id,
      resignation_date: typeof input.parameters.resignation_date === "string" ? input.parameters.resignation_date : null,
      resignation_reason: reason,
      remark: typeof input.parameters.remark === "string" ? input.parameters.remark : null
    };
    if (!toolInput.resignation_date || !toolInput.resignation_reason) {
      throw new AppError(400, "AI_PARAMETERS_REQUIRED", "办理离职还需要离职日期和原因", { missing: [!toolInput.resignation_date && "resignation_date", !toolInput.resignation_reason && "resignation_reason"].filter(Boolean) });
    }
    schemas.validateToolInput(input.skill, tool, toolInput);
    preview = await previewPersonOffboard(db, user, current.id, {
      offboardDate: parseDateOnly(String(toolInput.resignation_date)),
      offboardReason: reason!,
      insuranceTypes: insuranceValues(input.parameters.insurance_types, current.insuranceTypes),
      notes: toolInput.remark as string | null
    });
  }
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.AI_ACTION_TTL_SECONDS * 1000);
  const action = await db.aiAction.create({
    data: {
      userId: user.id,
      skill: input.skill,
      rawInstruction: input.rawInstruction,
      parameters: asJson({ ...toolInput, route_type: input.routeType }),
      before: asJson(preview.before),
      after: asJson(preview.after),
      impact: asJson(preview.impacts),
      tokenHash: tokenHash(rawToken),
      expiresAt
    }
  });
  await writeAiAudit(db, user, {
    rawInstruction: input.rawInstruction, skill: input.skill, parameters: toolInput, tool,
    before: preview.before, after: preview.after, confirmed: false, actionId: action.id,
    model: input.routeType === "model" ? config.XIANGNENG_LLM_MODEL : undefined, routeType: input.routeType
  });
  return {
    action_id: action.id,
    action_token: rawToken,
    expires_at: expiresAt.toISOString(),
    person: { employee_id: current.id, name: employee.name, project_name: current.project.name, position_name: current.jobTitle },
    before: preview.before,
    after: preview.after,
    impact_scope: preview.impacts,
    confirmation_required: true
  };
}

async function saveDemoSnapshot(tx: Prisma.TransactionClient, action: AiAction): Promise<void> {
  const parameters = action.parameters as Record<string, unknown>;
  const personId = parameters.employee_id;
  if (typeof personId !== "string") throw new AppError(500, "AI_ACTION_CORRUPT", "操作预览缺少人员标识");
  const person = await tx.person.findUnique({ where: { id: personId } });
  if (!person) notFound("人员");
  const application = await tx.application.findFirst({ where: { personId }, orderBy: { appliedAt: "desc" } });
  await tx.aiDemoSnapshot.upsert({
    where: { personId },
    create: { personId, personState: asJson(person), applicationState: application ? asJson(application) : Prisma.JsonNull },
    update: {}
  });
}

export async function confirmWriteAction(
  db: PrismaClient,
  config: AppConfig,
  request: FastifyRequest,
  user: SessionUser,
  input: { actionId: string; actionToken: string; idempotencyKey: string }
) {
  const existing = await db.aiAction.findUnique({ where: { id: input.actionId } });
  if (!existing || existing.userId !== user.id) notFound("AI 操作");
  if (!tokenMatches(input.actionToken, existing.tokenHash)) throw new AppError(403, "AI_ACTION_TOKEN_INVALID", "操作确认令牌无效");
  if (existing.status === "EXECUTED") {
    if (existing.idempotencyKey !== input.idempotencyKey) throw new AppError(409, "AI_ACTION_ALREADY_EXECUTED", "该操作已使用其他幂等键执行");
    return { action_id: existing.id, status: existing.status, result: existing.result, idempotent_replay: true };
  }
  if (existing.status !== "PREVIEWED") throw new AppError(409, "AI_ACTION_NOT_CONFIRMABLE", `当前操作状态为 ${existing.status}`);
  if (existing.expiresAt <= new Date()) {
    await db.aiAction.update({ where: { id: existing.id }, data: { status: "EXPIRED" } });
    throw new AppError(410, "AI_ACTION_EXPIRED", "操作预览已过期，请重新生成");
  }
  const routeType = ((existing.parameters as Record<string, unknown>).route_type ?? "rule") as AiRouteType;
  try {
    return await db.$transaction(async (tx) => {
      const action = await tx.aiAction.findUnique({ where: { id: existing.id } });
      if (!action || action.userId !== user.id) notFound("AI 操作");
      if (action.status === "EXECUTED" && action.idempotencyKey === input.idempotencyKey) {
        return { action_id: action.id, status: action.status, result: action.result, idempotent_replay: true };
      }
      if (action.status !== "PREVIEWED" || action.expiresAt <= new Date()) throw new AppError(409, "AI_ACTION_STATE_CHANGED", "操作状态已变化，请重新预览");
      if (config.AI_DEMO_MODE) await saveDemoSnapshot(tx, action);
      const parameters = action.parameters as Record<string, unknown>;
      const personId = String(parameters.employee_id);
      const current = await tx.person.findUnique({ where: { id: personId }, select: { insuranceTypes: true, employeeNo: true } });
      if (!current) notFound("人员");
      let result: unknown;
      if (action.skill === "employee_entry") {
        result = await onboardPerson(tx, config, request, user, personId, {
          onboardDate: parseDateOnly(String(parameters.entry_date)),
          insuranceTypes: insuranceValues(undefined, current.insuranceTypes),
          employeeNo: current.employeeNo,
          notes: typeof parameters.remark === "string" ? parameters.remark : null
        });
      } else if (action.skill === "employee_resignation") {
        result = await offboardPerson(tx, config, request, user, personId, {
          offboardDate: parseDateOnly(String(parameters.resignation_date)),
          offboardReason: String(parameters.resignation_reason),
          insuranceTypes: insuranceValues(undefined, current.insuranceTypes),
          notes: typeof parameters.remark === "string" ? parameters.remark : null
        });
      } else {
        throw new AppError(400, "AI_ACTION_SKILL_INVALID", "该 Skill 不是允许的写操作");
      }
      const updated = await tx.aiAction.update({
        where: { id: action.id },
        data: { status: "EXECUTED", idempotencyKey: input.idempotencyKey, confirmedAt: new Date(), executedAt: new Date(), result: asJson(result) }
      });
      await writeAiAudit(tx, user, {
        rawInstruction: action.rawInstruction, skill: action.skill as AiSkill,
        parameters, tool: action.skill === "employee_entry" ? "confirm_employee_entry" : "confirm_employee_resignation",
        before: action.before, after: action.after, confirmed: true, actionId: action.id,
        idempotencyKey: input.idempotencyKey, result, model: routeType === "model" ? config.XIANGNENG_LLM_MODEL : undefined, routeType
      });
      return { action_id: updated.id, status: updated.status, result, idempotent_replay: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await writeAiAudit(db, user, {
      rawInstruction: existing.rawInstruction, skill: existing.skill as AiSkill,
      parameters: existing.parameters as Record<string, unknown>, tool: "confirm_failed", confirmed: true,
      actionId: existing.id, idempotencyKey: input.idempotencyKey,
      error: error instanceof Error ? error.message : "未知错误", routeType
    });
    throw error;
  }
}

export function serializeAction(action: AiAction) {
  return {
    action_id: action.id,
    skill: action.skill,
    status: action.status,
    expires_at: action.expiresAt.toISOString(),
    confirmation_required: action.status === "PREVIEWED",
    before: action.before,
    after: action.after,
    impact_scope: action.impact,
    result: action.result,
    error: action.error,
    created_at: action.createdAt.toISOString(),
    executed_at: action.executedAt?.toISOString() ?? null
  };
}

export async function resetAiDemoData(
  db: PrismaClient,
  config: AppConfig,
  request: FastifyRequest,
  user: SessionUser
) {
  if (!config.AI_DEMO_MODE || config.NODE_ENV === "production") {
    throw new AppError(404, "NOT_FOUND", "演示重置未启用");
  }
  const restored = await db.$transaction(async (tx) => {
    const snapshots = await tx.aiDemoSnapshot.findMany({ where: { person: personWhere(user) } });
    for (const snapshot of snapshots) {
      const state = snapshot.personState as Record<string, any>;
      await tx.person.update({
        where: { id: snapshot.personId },
        data: {
          projectId: state.projectId,
          jobTitle: state.jobTitle,
          status: state.status,
          interviewStatus: state.interviewStatus,
          interviewDate: state.interviewDate ? new Date(state.interviewDate) : null,
          supplierId: state.supplierId ?? null,
          recommenderUserId: state.recommenderUserId ?? null,
          recommenderName: state.recommenderName ?? null,
          emergencyContactName: state.emergencyContactName ?? null,
          emergencyContactPhone: state.emergencyContactPhone ?? null,
          emergencyContactRelation: state.emergencyContactRelation ?? null,
          onboardDate: state.onboardDate ? new Date(state.onboardDate) : null,
          offboardDate: state.offboardDate ? new Date(state.offboardDate) : null,
          offboardReason: state.offboardReason ?? null,
          employeeNo: state.employeeNo ?? null,
          insuranceTypes: asJson(state.insuranceTypes ?? []),
          supplierPolicyId: state.supplierPolicyId ?? null,
          supplierPolicySnapshot: state.supplierPolicySnapshot == null ? Prisma.JsonNull : asJson(state.supplierPolicySnapshot),
          notes: state.notes ?? null
        }
      });
      if (snapshot.applicationState) {
        const application = snapshot.applicationState as Record<string, any>;
        await tx.application.update({
          where: { id: application.id },
          data: {
            interviewStatus: application.interviewStatus,
            interviewDate: application.interviewDate ? new Date(application.interviewDate) : null,
            employmentStatus: application.employmentStatus,
            onboardDate: application.onboardDate ? new Date(application.onboardDate) : null,
            offboardDate: application.offboardDate ? new Date(application.offboardDate) : null,
            offboardReason: application.offboardReason ?? null
          }
        });
      }
      await tx.personStatusLog.deleteMany({
        where: { personId: snapshot.personId, createdAt: { gte: snapshot.createdAt }, action: { in: ["ONBOARDED", "OFFBOARDED"] } }
      });
      await tx.auditLog.deleteMany({
        where: { resourceType: "Person", resourceId: snapshot.personId, createdAt: { gte: snapshot.createdAt }, action: { in: ["PERSON_ONBOARD", "PERSON_OFFBOARD"] } }
      });
      await tx.notification.deleteMany({
        where: {
          createdAt: { gte: snapshot.createdAt },
          OR: [
            { dedupeKey: { startsWith: `PERSON_ONBOARDED:${snapshot.personId}:` } },
            { dedupeKey: { startsWith: `PERSON_OFFBOARDED:${snapshot.personId}:` } }
          ]
        }
      });
    }
    await tx.aiDemoSnapshot.deleteMany({ where: { id: { in: snapshots.map((snapshot) => snapshot.id) } } });
    return snapshots.length;
  });
  await writeAudit(db, request, {
    action: "AI_DEMO_RESET",
    resourceType: "AiDemoSnapshot",
    after: { restored }
  });
  return { restored_people: restored, reset_at: new Date().toISOString() };
}
