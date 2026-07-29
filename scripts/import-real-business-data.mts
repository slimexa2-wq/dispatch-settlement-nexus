import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { loadBusinessData } from "./lib/business-data-source.mjs";
import { buildRealImportPlan } from "./lib/real-business-import-plan.mjs";
import { ensureSystemAuthorizationCatalog } from "./lib/system-authorization-catalog.ts";
import { assertInternalDatabaseUrl } from "./lib/internal-startup-contract.mjs";
import { upsertCollection } from "./lib/upsert-collection.mjs";
import { UserRole } from "../packages/shared/src/enums.ts";

type JsonRecord = Record<string, any>;

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { path: inputPath, data: rawData } = await loadBusinessData({
  root: workspaceRoot,
  mode: "internal"
});
const data = buildRealImportPlan(rawData) as JsonRecord;

const databaseUrl = process.env.DATABASE_URL;
assertInternalDatabaseUrl(databaseUrl);

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

function uuid(source: string): string {
  const hex = createHash("sha256").update(`xiangneng-real:${source}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateTime(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) return new Date("2026-07-19T00:00:00.000Z");
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : parsed;
}

async function createManyInBatches<T>(
  rows: T[],
  create: (batch: T[]) => Promise<unknown>,
  size = 500
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += size) {
    await create(rows.slice(offset, offset + size));
  }
}

const orgByName = new Map<string, JsonRecord>();
const legalByName = new Map<string, JsonRecord>();
const positionByKey = new Map<string, JsonRecord>();
const gradeByName = new Map<string, JsonRecord>();

try {
  console.log(`开始导入真实内部数据：${inputPath}`);

  const authorizationCatalog = await ensureSystemAuthorizationCatalog(prisma, uuid);

  await upsertCollection(data.branches as JsonRecord[], {
    toId: (branch: JsonRecord) => uuid(branch.id),
    toCreate: (branch: JsonRecord) => ({
      id: uuid(branch.id),
      sourceCode: branch.sourceCode,
      name: branch.name,
      remark: branch.remark ?? null
    }),
    toUpdate: (branch: JsonRecord) => ({
      sourceCode: branch.sourceCode,
      name: branch.name,
      remark: branch.remark ?? null
    }),
    upsert: (args: JsonRecord) => prisma.branch.upsert(args)
  });

  for (const unit of data.organizationUnits as JsonRecord[]) {
    const id = uuid(unit.id);
    const parentId = unit.parentId ? uuid(unit.parentId) : null;
    const path = unit.path
      .split("/")
      .filter(Boolean)
      .map((part: string) => uuid(part))
      .reduce((current: string, part: string) => `${current}/${part}`, "");
    const stored = await prisma.organizationUnit.upsert({
      where: { code: unit.code },
      create: {
        id,
        code: unit.code,
        name: unit.name,
        type: unit.type,
        parentId,
        path,
        sortOrder: unit.sortOrder ?? 0,
        isActive: unit.isActive !== false
      },
      update: {
        name: unit.name,
        type: unit.type,
        parentId,
        path,
        sortOrder: unit.sortOrder ?? 0,
        isActive: unit.isActive !== false
      }
    });
    orgByName.set(unit.name, stored);
  }

  for (const legal of data.legalEntities as JsonRecord[]) {
    const stored = await prisma.legalEntity.upsert({
      where: { code: legal.code },
      create: {
        id: uuid(legal.id),
        code: legal.code,
        name: legal.name,
        taxNumber: legal.taxNumber ?? null
      },
      update: {
        name: legal.name,
        taxNumber: legal.taxNumber ?? null,
        isActive: true
      }
    });
    legalByName.set(legal.name, stored);
  }

  for (const grade of data.jobGrades as JsonRecord[]) {
    const stored = await prisma.jobGrade.upsert({
      where: { code: grade.code },
      create: {
        id: uuid(grade.id),
        code: grade.code,
        name: grade.name,
        level: grade.level,
        description: "来源于真实集团花名册"
      },
      update: {
        name: grade.name,
        level: grade.level,
        description: "来源于真实集团花名册",
        isActive: true
      }
    });
    gradeByName.set(grade.name, stored);
  }

  for (const position of data.positions as JsonRecord[]) {
    const organizationUnit = orgByName.get(position.organizationUnitName);
    if (!organizationUnit) {
      throw new Error(`岗位 ${position.name} 找不到组织 ${position.organizationUnitName}`);
    }
    const stored = await prisma.position.upsert({
      where: { code: position.code },
      create: {
        id: uuid(position.id),
        code: position.code,
        name: position.name,
        organizationUnitId: organizationUnit.id,
        description: "来源于真实集团花名册"
      },
      update: {
        name: position.name,
        organizationUnitId: organizationUnit.id,
        description: "来源于真实集团花名册",
        isActive: true
      }
    });
    positionByKey.set(`${position.organizationUnitName}|${position.name}`, stored);
  }

  const employeeRoleId = authorizationCatalog.roleIds.get(UserRole.EMPLOYEE);
  if (!employeeRoleId) throw new Error("系统缺少内部员工角色，无法为真实岗位启用小程序自助功能");
  for (const position of positionByKey.values()) {
    await prisma.positionRoleBinding.upsert({
      where: {
        positionId_roleId_scopeType: {
          positionId: position.id,
          roleId: employeeRoleId,
          scopeType: "SELF"
        }
      },
      create: {
        id: uuid(`position-role:${position.id}:${UserRole.EMPLOYEE}:SELF`),
        positionId: position.id,
        roleId: employeeRoleId,
        scopeType: "SELF"
      },
      update: { isActive: true }
    });
  }

  await upsertCollection(data.projects as JsonRecord[], {
    toId: (project: JsonRecord) => uuid(project.id),
    toCreate: (project: JsonRecord) => ({
      id: uuid(project.id),
      sourceProjectId: project.sourceProjectId,
      branchId: uuid(project.branchId),
      name: project.name,
      isExternal: Boolean(project.isExternal),
      businessType: project.businessType ?? null,
      status: project.status,
      managerName: project.managerName ?? null,
      managerPhone: project.managerPhone ?? null,
      cooperationStart: date(project.cooperationStart),
      cooperationEnd: date(project.cooperationEnd),
      responsibility: project.responsibility ?? "PENDING_CONFIRMATION",
      remark: project.remark ?? null
    }),
    toUpdate: (project: JsonRecord) => ({
      sourceProjectId: project.sourceProjectId,
      branchId: uuid(project.branchId),
      name: project.name,
      isExternal: Boolean(project.isExternal),
      businessType: project.businessType ?? null,
      status: project.status,
      managerName: project.managerName ?? null,
      managerPhone: project.managerPhone ?? null,
      cooperationStart: date(project.cooperationStart),
      cooperationEnd: date(project.cooperationEnd),
      responsibility: project.responsibility ?? "PENDING_CONFIRMATION",
      remark: project.remark ?? null
    }),
    upsert: (args: JsonRecord) => prisma.project.upsert(args)
  });

  for (const project of data.projects as JsonRecord[]) {
    if (!project.weeklySnapshot) continue;
    const snapshotDate = new Date("2026-07-19T00:00:00.000Z");
    await prisma.projectWeeklySnapshot.upsert({
      where: {
        projectId_snapshotDate: {
          projectId: uuid(project.id),
          snapshotDate
        }
      },
      create: {
        id: uuid(`weekly-snapshot:${project.id}:2026-07-19`),
        projectId: uuid(project.id),
        snapshotDate,
        selfRecruited: project.weeklySnapshot.selfRecruited ?? 0,
        supplierRecruited: project.weeklySnapshot.supplierRecruited ?? 0,
        activeCount: project.weeklySnapshot.active ?? 0,
        onboardedCount: project.weeklySnapshot.onboarded ?? 0,
        offboardedCount: project.weeklySnapshot.offboarded ?? 0,
        changeCount: project.weeklySnapshot.change ?? 0,
        reason: project.weeklySnapshot.reason ?? null
      },
      update: {
        selfRecruited: project.weeklySnapshot.selfRecruited ?? 0,
        supplierRecruited: project.weeklySnapshot.supplierRecruited ?? 0,
        activeCount: project.weeklySnapshot.active ?? 0,
        onboardedCount: project.weeklySnapshot.onboarded ?? 0,
        offboardedCount: project.weeklySnapshot.offboarded ?? 0,
        changeCount: project.weeklySnapshot.change ?? 0,
        reason: project.weeklySnapshot.reason ?? null
      }
    });
  }

  await upsertCollection(data.jobDemands as JsonRecord[], {
    toId: (job: JsonRecord) => uuid(job.id),
    toCreate: (job: JsonRecord) => ({
      id: uuid(job.id),
      projectId: uuid(job.projectId),
      title: job.title,
      requiredCount: job.requiredCount ?? 0,
      requirements: job.requirements,
      salary: job.salary,
      workTime: job.workTime,
      workLocation: job.workLocation,
      deadline: date(job.deadline) ?? new Date("2026-12-31T00:00:00.000Z"),
      status: job.status,
      notes: job.notes ?? null,
      createdAt: dateTime(job.createdAt)
    }),
    toUpdate: (job: JsonRecord) => ({
      projectId: uuid(job.projectId),
      title: job.title,
      requiredCount: job.requiredCount ?? 0,
      requirements: job.requirements,
      salary: job.salary,
      workTime: job.workTime,
      workLocation: job.workLocation,
      deadline: date(job.deadline) ?? new Date("2026-12-31T00:00:00.000Z"),
      status: job.status,
      notes: job.notes ?? null
    }),
    upsert: (args: JsonRecord) => prisma.jobDemand.upsert(args)
  });

  for (const person of data.people as JsonRecord[]) {
    await prisma.person.upsert({
      where: { idCard: person.idCard },
      create: {
        id: uuid(person.id),
        name: person.name,
        idCard: person.idCard,
        phone: person.phone ?? "",
        gender: person.gender ?? null,
        age: person.age ?? null,
        ethnicity: person.ethnicity ?? null,
        origin: person.origin ?? null,
        projectId: uuid(person.projectId),
        jobTitle: person.jobTitle,
        status: person.status,
        interviewStatus: person.interviewStatus,
        interviewDate: date(person.interviewDate),
        supplierId: person.supplierId ? uuid(person.supplierId) : null,
        recommenderName: person.recommenderName ?? null,
        emergencyContactName: person.emergencyContactName ?? null,
        emergencyContactPhone: person.emergencyContactPhone ?? null,
        emergencyContactRelation: person.emergencyContactRelation ?? null,
        onboardDate: date(person.onboardDate),
        offboardDate: date(person.offboardDate),
        offboardReason: person.offboardReason ?? null,
        employeeNo: person.employeeNo ?? null,
        insuranceTypes: person.insuranceTypes ?? [],
        notes: person.notes ?? null,
        createdAt: dateTime(person.createdAt)
      },
      update: {
        name: person.name,
        phone: person.phone ?? "",
        gender: person.gender ?? null,
        age: person.age ?? null,
        ethnicity: person.ethnicity ?? null,
        projectId: uuid(person.projectId),
        jobTitle: person.jobTitle,
        status: person.status,
        interviewStatus: person.interviewStatus,
        interviewDate: date(person.interviewDate),
        supplierId: person.supplierId ? uuid(person.supplierId) : null,
        recommenderName: person.recommenderName ?? null,
        emergencyContactName: person.emergencyContactName ?? null,
        emergencyContactPhone: person.emergencyContactPhone ?? null,
        onboardDate: date(person.onboardDate),
        offboardDate: date(person.offboardDate),
        offboardReason: person.offboardReason ?? null,
        employeeNo: person.employeeNo ?? null,
        insuranceTypes: person.insuranceTypes ?? [],
        notes: person.notes ?? null
      }
    });
  }

  const statusLogs = (data.people as JsonRecord[]).flatMap((person) =>
    (person.statusLogs ?? []).map((log: JsonRecord) => ({
      id: uuid(log.id),
      personId: uuid(person.id),
      fromStatus: log.fromStatus ?? null,
      toStatus: log.toStatus,
      interviewStatus: person.interviewStatus ?? null,
      action: "REAL_DATA_IMPORT",
      notes: log.notes ?? null,
      createdAt: dateTime(log.createdAt)
    }))
  );
  await createManyInBatches(statusLogs, (batch) =>
    prisma.personStatusLog.createMany({ data: batch, skipDuplicates: true })
  );

  await upsertCollection(data.applications as JsonRecord[], {
    toId: (application: JsonRecord) => uuid(application.id),
    toCreate: (application: JsonRecord) => ({
      id: uuid(application.id),
      personId: uuid(application.personId),
      jobDemandId: uuid(application.jobDemandId),
      source: application.source,
      supplierId: application.supplierId ? uuid(application.supplierId) : null,
      recommenderName: application.recommenderName ?? null,
      interviewStatus: application.interviewStatus,
      interviewDate: date(application.interviewDate),
      employmentStatus: application.employmentStatus,
      onboardDate: date(application.onboardDate),
      offboardDate: date(application.offboardDate),
      offboardReason: application.offboardReason ?? null,
      appliedAt: dateTime(application.appliedAt)
    }),
    toUpdate: (application: JsonRecord) => ({
      personId: uuid(application.personId),
      jobDemandId: uuid(application.jobDemandId),
      source: application.source,
      supplierId: application.supplierId ? uuid(application.supplierId) : null,
      recommenderName: application.recommenderName ?? null,
      interviewStatus: application.interviewStatus,
      interviewDate: date(application.interviewDate),
      employmentStatus: application.employmentStatus,
      onboardDate: date(application.onboardDate),
      offboardDate: date(application.offboardDate),
      offboardReason: application.offboardReason ?? null,
      appliedAt: dateTime(application.appliedAt)
    }),
    upsert: (args: JsonRecord) => prisma.application.upsert(args)
  });

  for (const employee of data.internalEmployees as JsonRecord[]) {
    const organizationUnit = orgByName.get(employee.organizationUnitName);
    const position = positionByKey.get(`${employee.organizationUnitName}|${employee.position}`);
    const grade = gradeByName.get(employee.jobGrade);
    if (!organizationUnit || !position || !grade) {
      throw new Error(`内部员工 ${employee.name} 的组织、岗位或职级映射不完整`);
    }
    const legalEntity = employee.legalEntityName
      ? legalByName.get(employee.legalEntityName)
      : null;
    await prisma.internalEmployee.upsert({
      where: { idCard: employee.idCard },
      create: {
        id: uuid(employee.id),
        employeeNo: employee.employeeNo,
        sourceEmployeeNo: employee.sourceEmployeeNo ?? null,
        name: employee.name,
        phone: employee.phone,
        idCard: employee.idCard,
        bankAccount: employee.bankAccount ?? null,
        legalEntityId: legalEntity?.id ?? null,
        organizationUnitId: organizationUnit.id,
        positionId: position.id,
        jobGradeId: grade.id,
        status: employee.status,
        onboardDate: date(employee.onboardDate) ?? new Date("2020-01-01T00:00:00.000Z"),
        offboardDate: date(employee.offboardDate),
        offboardReason: employee.offboardReason ?? null
      },
      update: {
        employeeNo: employee.employeeNo,
        sourceEmployeeNo: employee.sourceEmployeeNo ?? null,
        name: employee.name,
        phone: employee.phone,
        bankAccount: employee.bankAccount ?? null,
        legalEntityId: legalEntity?.id ?? null,
        organizationUnitId: organizationUnit.id,
        positionId: position.id,
        jobGradeId: grade.id,
        status: employee.status,
        onboardDate: date(employee.onboardDate) ?? new Date("2020-01-01T00:00:00.000Z"),
        offboardDate: date(employee.offboardDate),
        offboardReason: employee.offboardReason ?? null
      }
    });
  }

  for (const employment of data.internalEmployments as JsonRecord[]) {
    const employee = (data.internalEmployees as JsonRecord[]).find((item) => uuid(item.id) === uuid(employment.employeeId));
    const organizationUnit = orgByName.get(employment.organizationUnitName);
    const position = positionByKey.get(`${employment.organizationUnitName}|${employment.position}`);
    const grade = gradeByName.get(employment.jobGrade);
    const legalEntity = employment.legalEntityName
      ? legalByName.get(employment.legalEntityName)
      : null;
    if (!employee || !organizationUnit || !position) {
      throw new Error(`内部任职记录 ${employment.id} 的真实关联不完整`);
    }
    await prisma.internalEmployment.upsert({
      where: { id: uuid(employment.id) },
      create: {
        id: uuid(employment.id),
        employeeId: uuid(employment.employeeId),
        legalEntityId: legalEntity?.id ?? null,
        organizationUnitId: organizationUnit.id,
        positionId: position.id,
        jobGradeId: grade?.id ?? null,
        startedAt: date(employment.startedAt) ?? new Date("2020-01-01T00:00:00.000Z"),
        endedAt: date(employment.endedAt),
        isPrimary: Boolean(employment.isPrimary),
        reason: employment.reason ?? "真实花名册导入"
      },
      update: {
        legalEntityId: legalEntity?.id ?? null,
        organizationUnitId: organizationUnit.id,
        positionId: position.id,
        jobGradeId: grade?.id ?? null,
        startedAt: date(employment.startedAt) ?? new Date("2020-01-01T00:00:00.000Z"),
        endedAt: date(employment.endedAt),
        isPrimary: Boolean(employment.isPrimary),
        reason: employment.reason ?? "真实花名册导入"
      }
    });
  }

  console.log(JSON.stringify({
    status: "ok",
    source: inputPath,
    counts: {
      organizationUnits: data.organizationUnits.length,
      legalEntities: data.legalEntities.length,
      positions: data.positions.length,
      jobGrades: data.jobGrades.length,
      branches: data.branches.length,
      projects: data.projects.length,
      projectWeeklySnapshots: data.projects.filter((item: JsonRecord) => item.weeklySnapshot).length,
      people: data.people.length,
      applications: data.applications.length,
      internalEmployees: data.internalEmployees.length,
      unresolvedSourceRows: data.unresolved.length
    }
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
