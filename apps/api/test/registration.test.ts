import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import {
  ApplicationSource,
  EmploymentStatus,
  InterviewStatus,
  JobStatus,
  UserRole,
  type PersonRegistrationInput,
  type SessionUser
} from "@xiangneng/shared";
import { registerPerson } from "../src/services/registration.js";
import { testConfig } from "./helpers.js";
import { AppError } from "../src/errors.js";

const projectId = "30000000-0000-4000-8000-000000000001";
const jobDemandId = "40000000-0000-4000-8000-000000000001";
const supplierId = "50000000-0000-4000-8000-000000000001";

function session(input: Partial<SessionUser>): SessionUser {
  return {
    id: "60000000-0000-4000-8000-000000000001",
    username: "operator",
    displayName: "运营",
    role: UserRole.PROJECT_OPERATOR,
    branchId: null,
    supplierId: null,
    personId: null,
    employeeType: "现场运营人员",
    projectIds: [projectId],
    permissions: [],
    ...input
  };
}

function request(user: SessionUser): FastifyRequest {
  return {
    id: "test-request",
    ip: "127.0.0.1",
    headers: {},
    sessionUser: user
  } as unknown as FastifyRequest;
}

function registrationStore() {
  const people: Array<Record<string, unknown>> = [];
  const applications: Array<Record<string, unknown>> = [];
  const referrals: Array<Record<string, unknown>> = [];
  let sequence = 0;
  const id = (prefix: string) => `${prefix}0000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`.slice(0, 36);
  const job = {
    id: jobDemandId,
    projectId,
    title: "生产操作员",
    status: JobStatus.RECRUITING,
    deadline: new Date(Date.now() + 86_400_000),
    referralPolicy: null
  };
  const tx: Record<string, unknown> = {
    jobDemand: { findUnique: async () => job },
    project: { findFirst: async () => ({ id: projectId }) },
    supplier: { findUnique: async () => ({ id: supplierId, isActive: true }) },
    supplierProject: { findUnique: async () => ({ supplierId, projectId }) },
    user: {
      findUnique: async () => ({ id: "60000000-0000-4000-8000-000000000003", isActive: true, employeeType: "普通员工" }),
      findMany: async () => []
    },
    person: {
      findUnique: async (raw: unknown) => people.find((person) => person.idCard === (raw as { where: { idCard: string } }).where.idCard) ?? null,
      create: async (raw: unknown) => {
        const data = (raw as { data: Record<string, unknown> }).data;
        const person = {
          id: id("7"),
          status: EmploymentStatus.APPLICANT,
          interviewStatus: InterviewStatus.PENDING_ARRIVAL,
          insuranceTypes: [],
          onboardDate: null,
          offboardDate: null,
          offboardReason: null,
          employeeNo: null,
          supplierPolicyId: null,
          supplierPolicySnapshot: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        people.push(person);
        return person;
      },
      update: async (raw: unknown) => {
        const { where, data } = raw as { where: { id: string }; data: Record<string, unknown> };
        const person = people.find((item) => item.id === where.id);
        if (!person) throw new Error("person missing");
        for (const [key, value] of Object.entries(data)) if (value !== undefined) person[key] = value;
        return person;
      }
    },
    personStatusLog: { create: async () => ({ id: id("8") }) },
    application: {
      findFirst: async (raw: unknown) => {
        const where = (raw as { where: Record<string, unknown> }).where;
        return [...applications].reverse().find((item) =>
          item.personId === where.personId &&
          item.jobDemandId === where.jobDemandId &&
          item.source === where.source &&
          item.supplierId === where.supplierId &&
          item.recommenderUserId === where.recommenderUserId
        ) ?? null;
      },
      create: async (raw: unknown) => {
        const record = { id: id("9"), appliedAt: new Date(), updatedAt: new Date(), ...((raw as { data: Record<string, unknown> }).data) };
        applications.push(record);
        return record;
      },
      update: async (raw: unknown) => {
        const { where, data } = raw as { where: { id: string }; data: Record<string, unknown> };
        const record = applications.find((item) => item.id === where.id);
        if (!record) throw new Error("application missing");
        Object.assign(record, data);
        return record;
      }
    },
    referralRecord: {
      upsert: async (raw: unknown) => {
        const input = raw as { where: { applicationId: string }; create: Record<string, unknown> };
        const existing = referrals.find((item) => item.applicationId === input.where.applicationId);
        if (existing) return existing;
        const record = { id: id("a"), createdAt: new Date(), ...input.create };
        referrals.push(record);
        return record;
      }
    },
    referralReward: { upsert: async () => ({ id: id("b") }) },
    auditLog: { create: async () => ({ id: id("c") }) },
    notification: { createMany: async () => ({ count: 0 }) }
  };
  const prisma = {
    ...tx,
    $transaction: async (callback: (client: unknown) => unknown) => callback(tx)
  } as unknown as PrismaClient;
  return { prisma, people, applications, referrals, tx };
}

const baseInput: PersonRegistrationInput = {
  name: "张三",
  idCard: "510101199001011234",
  phone: "13800138000",
  projectId,
  jobDemandId,
  jobTitle: "生产操作员",
  source: ApplicationSource.OPERATOR
};

describe("统一人员档案与报名来源", () => {
  it("运营、供应商、员工推荐三入口只建立一份人员主档并保留三条来源报名", async () => {
    const store = registrationStore();
    const operator = session({});
    await registerPerson(store.prisma, testConfig, request(operator), baseInput, operator);
    const supplier = session({
      id: "60000000-0000-4000-8000-000000000002",
      username: "supplier",
      role: UserRole.SUPPLIER,
      supplierId,
      employeeType: null
    });
    await registerPerson(store.prisma, testConfig, request(supplier), { ...baseInput, source: ApplicationSource.SUPPLIER }, supplier);
    const employee = session({
      id: "60000000-0000-4000-8000-000000000003",
      username: "employee",
      role: UserRole.EMPLOYEE,
      personId: "60000000-0000-4000-8000-000000000099",
      employeeType: "普通员工"
    });
    await registerPerson(store.prisma, testConfig, request(employee), { ...baseInput, source: ApplicationSource.REFERRAL }, employee);

    expect(store.people).toHaveLength(1);
    expect(store.applications).toHaveLength(3);
    expect(store.applications.map((item) => item.source)).toEqual([
      ApplicationSource.OPERATOR,
      ApplicationSource.SUPPLIER,
      ApplicationSource.REFERRAL
    ]);
    expect(new Set(store.applications.map((item) => item.personId)).size).toBe(1);
    expect(store.referrals).toHaveLength(1);
  });

  it("分子公司负责人不能把人员写入其他分公司项目", async () => {
    const store = registrationStore();
    (store.tx.project as { findFirst: () => Promise<null> }).findFirst = async () => null;
    const branchManager = session({ role: UserRole.BRANCH_MANAGER, branchId: "30000000-0000-4000-8000-000000000099", projectIds: [] });
    await expect(registerPerson(store.prisma, testConfig, request(branchManager), baseInput, branchManager))
      .rejects.toMatchObject<AppError>({ code: "OUT_OF_SCOPE", statusCode: 403 });
  });

  it("匿名老候选人重复报名同一岗位时只新增一条 SELF 报名且不覆盖人员主档", async () => {
    const store = registrationStore();
    const operator = session({});
    await registerPerson(store.prisma, testConfig, request(operator), baseInput, operator);
    const original = { name: store.people[0]?.name, phone: store.people[0]?.phone, projectId: store.people[0]?.projectId };
    const publicInput = { ...baseInput, name: "伪造姓名", phone: "13900139000", source: ApplicationSource.SELF };

    await registerPerson(store.prisma, testConfig, request(operator), publicInput, null);
    await registerPerson(store.prisma, testConfig, request(operator), publicInput, null);

    expect(store.people).toHaveLength(1);
    expect({ name: store.people[0]?.name, phone: store.people[0]?.phone, projectId: store.people[0]?.projectId }).toEqual(original);
    expect(store.applications).toHaveLength(2);
    expect(store.applications.filter((item) => item.source === ApplicationSource.SELF)).toHaveLength(1);
  });
});
