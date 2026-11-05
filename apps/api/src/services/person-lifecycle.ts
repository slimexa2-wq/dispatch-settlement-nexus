import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import {
  EmploymentStatus,
  InterviewStatus,
  offboardingSchema,
  onboardingSchema,
  type SessionUser
} from "@xiangneng/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import type { AppConfig } from "../config.js";
import { andWhere, personWhere } from "../data-scope.js";
import { AppError, conflict, notFound } from "../errors.js";
import { writeAudit } from "../audit.js";
import { createKeyNotifications } from "../notifications.js";
import { chinaDateLabel } from "../dates.js";

export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type OffboardingInput = z.infer<typeof offboardingSchema>;
type LifecycleDb = PrismaClient | Prisma.TransactionClient;

async function findScopedPerson(db: LifecycleDb, user: SessionUser, id: string) {
  const person = await db.person.findFirst({ where: andWhere(personWhere(user), { id }) });
  if (!person) notFound("人员档案");
  return person;
}

async function matchSupplierPolicy(
  db: LifecycleDb,
  person: { projectId: string; jobTitle: string; supplierId: string | null },
  onboardDate: Date,
  explicitPolicyId?: string | null
) {
  const supplier = person.supplierId
    ? await db.supplier.findUnique({ where: { id: person.supplierId }, select: { id: true, level: true } })
    : null;
  if (!supplier && !explicitPolicyId) return null;
  const policies = await db.policy.findMany({
    where: {
      projectId: person.projectId,
      type: "SUPPLIER",
      isActive: true,
      effectiveAt: { lte: onboardDate },
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gte: onboardDate } }] },
        { OR: [{ jobTitle: null }, { jobTitle: person.jobTitle }] },
        {
          OR: [
            ...(supplier ? [{ supplierId: supplier.id }] : []),
            ...(supplier?.level ? [{ supplierId: null, supplierLevel: supplier.level }] : [])
          ]
        }
      ]
    }
  });
  if (explicitPolicyId) {
    const selected = policies.find((policy) => policy.id === explicitPolicyId);
    if (!selected) {
      throw new AppError(400, "INVALID_SUPPLIER_POLICY", "所选供应商政策对该人员、项目、岗位或入职日期不适用");
    }
    return selected;
  }
  if (!policies.length) return null;
  const score = (policy: (typeof policies)[number]) =>
    (policy.supplierId === supplier?.id ? 2 : 0) + (policy.jobTitle === person.jobTitle ? 1 : 0);
  const bestScore = Math.max(...policies.map(score));
  const best = policies.filter((policy) => score(policy) === bestScore);
  if (best.length > 1) {
    throw new AppError(409, "AMBIGUOUS_SUPPLIER_POLICY", "存在多个同等优先级的供应商政策，请人工选择", {
      policyIds: best.map((policy) => policy.id)
    });
  }
  return best[0] ?? null;
}

function policySnapshot(policy: NonNullable<Awaited<ReturnType<typeof matchSupplierPolicy>>>) {
  return {
    id: policy.id,
    name: policy.name,
    version: policy.version,
    amount: policy.amount.toString(),
    achievementConditions: policy.achievementConditions,
    exclusionConditions: policy.exclusionConditions,
    effectiveAt: policy.effectiveAt.toISOString(),
    expiresAt: policy.expiresAt?.toISOString() ?? null,
    supplierId: policy.supplierId,
    supplierLevel: policy.supplierLevel,
    jobTitle: policy.jobTitle
  };
}

async function validateOnboard(db: LifecycleDb, user: SessionUser, id: string, input: OnboardingInput) {
  const existing = await findScopedPerson(db, user, id);
  if (existing.status === EmploymentStatus.ACTIVE) conflict("该人员已经在职");
  if (existing.status !== EmploymentStatus.PENDING_ONBOARD || existing.interviewStatus !== InterviewStatus.PASSED) {
    throw new AppError(409, "PERSON_NOT_PENDING_ONBOARD", "只有面试通过且处于待入职状态的人员可以办理入职");
  }
  if (existing.interviewDate && input.onboardDate < existing.interviewDate) {
    throw new AppError(400, "INVALID_ONBOARD_DATE", "入职日期不能早于面试日期");
  }
  const matchedPolicy = await matchSupplierPolicy(db, existing, input.onboardDate, input.supplierPolicyId);
  return { existing, matchedPolicy };
}

async function validateOffboard(db: LifecycleDb, user: SessionUser, id: string, input: OffboardingInput) {
  const existing = await findScopedPerson(db, user, id);
  if (existing.status !== EmploymentStatus.ACTIVE) conflict("只有在职人员可以办理离职");
  if (existing.onboardDate && input.offboardDate < existing.onboardDate) {
    throw new AppError(400, "INVALID_OFFBOARD_DATE", "离职日期不能早于入职日期");
  }
  return existing;
}

export async function previewPersonOnboard(db: PrismaClient, user: SessionUser, id: string, input: OnboardingInput) {
  const { existing } = await validateOnboard(db, user, id, input);
  return {
    person: existing,
    before: {
      status: existing.status,
      projectId: existing.projectId,
      jobTitle: existing.jobTitle,
      onboardDate: existing.onboardDate ? chinaDateLabel(existing.onboardDate) : null
    },
    after: {
      status: EmploymentStatus.ACTIVE,
      projectId: existing.projectId,
      jobTitle: existing.jobTitle,
      onboardDate: chinaDateLabel(input.onboardDate),
      insuranceTypes: input.insuranceTypes,
      employeeNo: input.employeeNo ?? null
    },
    impacts: ["人员主档状态", "当前报名就业状态", "人员生命周期", "审计日志", "相关通知"]
  };
}

export async function previewPersonOffboard(db: PrismaClient, user: SessionUser, id: string, input: OffboardingInput) {
  const existing = await validateOffboard(db, user, id, input);
  return {
    person: existing,
    before: {
      status: existing.status,
      onboardDate: existing.onboardDate ? chinaDateLabel(existing.onboardDate) : null,
      offboardDate: existing.offboardDate ? chinaDateLabel(existing.offboardDate) : null
    },
    after: {
      status: EmploymentStatus.LEFT,
      offboardDate: chinaDateLabel(input.offboardDate),
      offboardReason: input.offboardReason,
      insuranceTypes: input.insuranceTypes
    },
    impacts: ["人员主档状态", "当前报名就业状态", "人员生命周期", "审计日志", "相关通知"]
  };
}

export async function onboardPerson(
  tx: Prisma.TransactionClient,
  config: AppConfig,
  request: FastifyRequest,
  user: SessionUser,
  id: string,
  input: OnboardingInput
) {
  const { existing, matchedPolicy } = await validateOnboard(tx, user, id, input);
  const updated = await tx.person.update({
    where: { id },
    data: {
      onboardDate: input.onboardDate,
      offboardDate: null,
      offboardReason: null,
      status: EmploymentStatus.ACTIVE,
      insuranceTypes: input.insuranceTypes,
      employeeNo: input.employeeNo,
      supplierPolicyId: matchedPolicy?.id ?? null,
      supplierPolicySnapshot: matchedPolicy ? policySnapshot(matchedPolicy) : Prisma.JsonNull,
      notes: input.notes ?? undefined
    }
  });
  await tx.personStatusLog.create({
    data: {
      personId: id,
      fromStatus: existing.status,
      toStatus: EmploymentStatus.ACTIVE,
      interviewStatus: existing.interviewStatus,
      action: "ONBOARDED",
      notes: input.notes,
      actorId: user.id
    }
  });
  const currentApplication = await tx.application.findFirst({ where: { personId: id }, orderBy: { appliedAt: "desc" } });
  if (currentApplication) {
    await tx.application.update({
      where: { id: currentApplication.id },
      data: { employmentStatus: EmploymentStatus.ACTIVE, onboardDate: input.onboardDate, offboardDate: null, offboardReason: null }
    });
  }
  await writeAudit(tx, request, {
    action: "PERSON_ONBOARD",
    resourceType: "Person",
    resourceId: id,
    before: { status: existing.status },
    after: { status: EmploymentStatus.ACTIVE, onboardDate: input.onboardDate.toISOString(), insuranceTypes: input.insuranceTypes }
  });
  await createKeyNotifications(tx, config, {
    personId: id,
    supplierId: existing.supplierId,
    recommenderUserId: existing.recommenderUserId,
    type: "PERSON_ONBOARDED",
    title: "人员已入职",
    content: `${existing.name}已办理入职`,
    targetPath: `/pages/operator/person-detail/index?id=${id}`,
    dedupeKey: `PERSON_ONBOARDED:${id}:${input.onboardDate.toISOString()}`
  });
  return updated;
}

export async function offboardPerson(
  tx: Prisma.TransactionClient,
  config: AppConfig,
  request: FastifyRequest,
  user: SessionUser,
  id: string,
  input: OffboardingInput
) {
  const existing = await validateOffboard(tx, user, id, input);
  const updated = await tx.person.update({
    where: { id },
    data: {
      offboardDate: input.offboardDate,
      offboardReason: input.offboardReason,
      status: EmploymentStatus.LEFT,
      insuranceTypes: input.insuranceTypes,
      notes: input.notes ?? undefined
    }
  });
  await tx.personStatusLog.create({
    data: {
      personId: id,
      fromStatus: existing.status,
      toStatus: EmploymentStatus.LEFT,
      interviewStatus: existing.interviewStatus,
      action: "OFFBOARDED",
      notes: input.notes ?? input.offboardReason,
      actorId: user.id
    }
  });
  const currentApplication = await tx.application.findFirst({ where: { personId: id }, orderBy: { appliedAt: "desc" } });
  if (currentApplication) {
    await tx.application.update({
      where: { id: currentApplication.id },
      data: { employmentStatus: EmploymentStatus.LEFT, offboardDate: input.offboardDate, offboardReason: input.offboardReason }
    });
  }
  await writeAudit(tx, request, {
    action: "PERSON_OFFBOARD",
    resourceType: "Person",
    resourceId: id,
    before: { status: existing.status },
    after: { status: EmploymentStatus.LEFT, offboardDate: input.offboardDate.toISOString(), offboardReason: input.offboardReason }
  });
  await createKeyNotifications(tx, config, {
    personId: id,
    supplierId: existing.supplierId,
    recommenderUserId: existing.recommenderUserId,
    type: "PERSON_OFFBOARDED",
    title: "人员已离职",
    content: `${existing.name}已办理离职`,
    targetPath: `/pages/operator/person-detail/index?id=${id}`,
    dedupeKey: `PERSON_OFFBOARDED:${id}:${input.offboardDate.toISOString()}`
  });
  return updated;
}
