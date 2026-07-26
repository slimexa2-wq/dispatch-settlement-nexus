import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { hash } from "../apps/api/node_modules/bcryptjs/index.js";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { loadPublicDemoData } from "./lib/public-demo-data.mjs";

type JsonRecord = Record<string, any>;

const inputPath = fileURLToPath(new URL("../data/synthetic/demo-data.json", import.meta.url));
const data = await loadPublicDemoData(inputPath);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const databaseName = new URL(databaseUrl).pathname.toLowerCase();
if (!databaseName.includes("xiangneng") && !databaseName.includes("demo")) {
  throw new Error(`Refusing demo import into unexpected database: ${databaseName}`);
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

function uuid(source: string): string {
  const hex = createHash("sha256").update(`xiangneng-demo:${source}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function idCard(person: JsonRecord): string {
  if (typeof person.idCard === "string" && person.idCard.trim()) return person.idCard.trim();
  return `MISSING-${createHash("sha256").update(person.id).digest("hex").slice(0, 10)}`;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateTime(value: unknown): Date {
  return date(value) ?? new Date();
}

async function batches<T>(rows: T[], create: (batch: T[]) => Promise<unknown>, size = 500): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += size) {
    await create(rows.slice(offset, offset + size));
  }
}

const branchBySource = new Map<string, JsonRecord>();
for (const branch of data.branches) branchBySource.set(branch.id, branch);
for (const project of data.projects) {
  if (!branchBySource.has(project.branchId)) {
    branchBySource.set(project.branchId, { id: project.branchId, name: project.branchName || "待维护分公司", remark: "源数据项目未匹配组织清单，待业务确认" });
  }
}
const projectSources = new Set(data.projects.map((item) => item.id));
const supplierSources = new Set(data.suppliers.map((item) => item.id));

const topJobBySuffix = new Map(data.jobDemands.map((job) => [job.id.replace(/^job-demand-/, ""), job]));
const canonicalJobSource = (sourceId: string): string => {
  const suffix = sourceId.replace(/^job-row-/, "").replace(/^job-demand-/, "");
  return topJobBySuffix.get(suffix)?.id ?? sourceId;
};
const nestedJobs = new Map<string, JsonRecord>();
for (const job of data.jobDemands) nestedJobs.set(job.id, job);
for (const application of data.applications) {
  if (application.jobDemand?.id) {
    const canonicalId = canonicalJobSource(application.jobDemand.id);
    if (!nestedJobs.has(canonicalId)) nestedJobs.set(canonicalId, { ...application.jobDemand, id: canonicalId });
  }
}

const demoEmployeeSource = data.people.find((person) => person.status === "ACTIVE" && projectSources.has(person.projectId)) ?? data.people[0]!;
const supplierUseCounts = new Map<string, number>();
for (const person of data.people) {
  if (person.supplierId && supplierSources.has(person.supplierId)) {
    supplierUseCounts.set(person.supplierId, (supplierUseCounts.get(person.supplierId) ?? 0) + 1);
  }
}
const demoSupplierSourceId = [...supplierUseCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? data.suppliers[0]!.id;
const demoSupplier = data.suppliers.find((supplier) => supplier.id === demoSupplierSourceId) ?? data.suppliers[0]!;
const demoSupplierProjectIds = [...new Set([
  ...(demoSupplier.projectIds ?? []),
  ...data.people.filter((person) => person.supplierId === demoSupplierSourceId).map((person) => person.projectId)
])].filter((projectId) => projectSources.has(projectId)).map(uuid);
const demoProjectIds = data.projects.slice(0, Math.min(8, data.projects.length)).map((item) => uuid(item.id));

const users = [
  { key: "demo-admin", username: "demo_admin", displayName: "演示-系统管理员", role: "SYSTEM_ADMIN", branchId: null, projectIds: [] },
  { key: "demo-project", username: "demo_project", displayName: "演示-项目负责人", role: "PROJECT_OPERATOR", branchId: null, projectIds: demoProjectIds },
  { key: "demo-hq", username: "demo_hq", displayName: "演示-集团领导", role: "HEADQUARTERS_MANAGER", branchId: null, projectIds: [] },
  { key: "demo-branch", username: "demo_branch", displayName: "演示-分公司负责人", role: "BRANCH_MANAGER", branchId: uuid(data.branches[0]!.id), projectIds: [] },
  { key: "demo-operator", username: "demo_operator", displayName: "演示-现场运营", role: "PROJECT_OPERATOR", branchId: null, projectIds: data.projects.map((item) => uuid(item.id)) }
] as const;

try {
  console.log(`Importing ${data.people.length} people and ${data.applications.length} applications from ${inputPath}`);
  await batches([...branchBySource.values()].map((branch) => ({
    id: uuid(branch.id), sourceCode: branch.id, name: branch.name, remark: branch.remark ?? null
  })), (batch) => prisma.branch.createMany({ data: batch, skipDuplicates: true }));

  await batches(data.projects.map((project) => ({
    id: uuid(project.id),
    sourceProjectId: project.sourceProjectId || project.id,
    branchId: uuid(project.branchId),
    name: project.name,
    isExternal: Boolean(project.isExternal),
    businessType: project.businessType ?? null,
    status: project.status ?? null,
    managerName: project.managerName ?? null,
    managerPhone: project.managerPhone ?? null,
    cooperationStart: date(project.cooperationStart),
    cooperationEnd: date(project.cooperationEnd),
    responsibility: project.responsibility ?? null,
    remark: project.remark ?? null
  })), (batch) => prisma.project.createMany({ data: batch, skipDuplicates: true }));

  await batches(data.suppliers.map((supplier) => ({
    id: uuid(supplier.id), name: supplier.name, contactName: supplier.contactName ?? null,
    contactPhone: supplier.contactPhone ?? null, level: supplier.level ?? null, isActive: true
  })), (batch) => prisma.supplier.createMany({ data: batch, skipDuplicates: true }));

  const supplierLinks = data.suppliers.flatMap((supplier) => (supplier.projectIds ?? [])
    .filter((projectId: string) => projectSources.has(projectId))
    .map((projectId: string) => ({ supplierId: uuid(supplier.id), projectId: uuid(projectId) })));
  await batches(supplierLinks, (batch) => prisma.supplierProject.createMany({ data: batch, skipDuplicates: true }));

  const unusablePasswordHash = await hash(randomBytes(32).toString("base64url"), 10);
  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      create: {
        id: uuid(user.key), username: user.username, passwordHash: unusablePasswordHash,
        displayName: user.displayName, role: user.role, branchId: user.branchId,
        projectLinks: { create: user.projectIds.map((projectId) => ({ projectId })) }
      },
      update: { displayName: user.displayName, role: user.role, branchId: user.branchId, isActive: true }
    });
  }

  await prisma.user.upsert({
    where: { username: "demo_supplier" },
    create: {
      id: uuid("demo-supplier"), username: "demo_supplier", passwordHash: unusablePasswordHash,
      displayName: "演示-供应商经理", role: "SUPPLIER", supplierId: uuid(demoSupplierSourceId),
      projectLinks: { create: demoSupplierProjectIds.map((projectId) => ({ projectId })) }
    },
    update: { displayName: "演示-供应商经理", role: "SUPPLIER", supplierId: uuid(demoSupplierSourceId), isActive: true }
  });

  await batches([...nestedJobs.values()].filter((job) => projectSources.has(job.projectId)).map((job) => ({
    id: uuid(job.id), projectId: uuid(job.projectId), title: job.title || "待维护岗位",
    requiredCount: Math.max(0, Number(job.requiredCount) || 0), requirements: job.requirements || "待维护",
    salary: job.salary || "待维护", workTime: job.workTime || "待维护", workLocation: job.workLocation || job.projectName || "待维护",
    deadline: date(job.deadline) ?? new Date("2026-12-31T00:00:00+08:00"), status: job.status || "RECRUITING",
    createdAt: dateTime(job.createdAt), updatedAt: dateTime(job.createdAt)
  })), (batch) => prisma.jobDemand.createMany({ data: batch, skipDuplicates: true }));

  await batches(data.people.filter((person) => projectSources.has(person.projectId)).map((person) => ({
    id: uuid(person.id), name: person.name, idCard: idCard(person), phone: person.phone,
    employeeNo: person.employeeNo,
    gender: person.gender ?? null, age: Number.isFinite(Number(person.age)) ? Number(person.age) : null,
    ethnicity: person.ethnicity ?? null, origin: person.origin ?? null,
    projectId: uuid(person.projectId), jobTitle: person.jobTitle || "待维护岗位",
    status: person.status, interviewStatus: person.interviewStatus,
    interviewDate: date(person.interviewDate), supplierId: person.supplierId && supplierSources.has(person.supplierId) ? uuid(person.supplierId) : null,
    recommenderName: person.recommenderName ?? null,
    emergencyContactName: person.emergencyContactName ?? null,
    emergencyContactPhone: person.emergencyContactPhone ?? null,
    emergencyContactRelation: person.emergencyContactRelation ?? null,
    onboardDate: date(person.onboardDate), offboardDate: date(person.offboardDate), offboardReason: person.offboardReason ?? null,
    insuranceTypes: person.insuranceTypes ?? [],
    notes: person.idCard ? (person.notes ?? null) : [person.notes, "源数据身份证号为空，使用 MISSING- 技术占位符；待人工补录"].filter(Boolean).join("；"),
    createdAt: dateTime(person.createdAt), updatedAt: dateTime(person.updatedAt)
  })), (batch) => prisma.person.createMany({ data: batch, skipDuplicates: true }));

  await prisma.user.upsert({
    where: { username: "demo_employee" },
    create: {
      id: uuid("demo-employee"), username: "demo_employee", passwordHash: unusablePasswordHash,
      displayName: demoEmployeeSource.name || "演示-在职员工", role: "EMPLOYEE", personId: uuid(demoEmployeeSource.id),
      employeeType: "普通员工"
    },
    update: {
      displayName: demoEmployeeSource.name || "演示-在职员工", role: "EMPLOYEE", personId: uuid(demoEmployeeSource.id),
      employeeType: "普通员工", isActive: true
    }
  });

  const applications = data.applications.filter((application) => nestedJobs.has(canonicalJobSource(application.jobDemandId))).map((application) => ({
    id: uuid(application.id), personId: uuid(application.personId), jobDemandId: uuid(canonicalJobSource(application.jobDemandId)),
    source: application.source, supplierId: application.supplier?.id && supplierSources.has(application.supplier.id) ? uuid(application.supplier.id) : null,
    recommenderName: application.recommender?.displayName ?? null,
    interviewStatus: application.interviewStatus, interviewDate: date(application.interviewDate),
    employmentStatus: application.employmentStatus, onboardDate: date(application.onboardDate),
    offboardDate: date(application.offboardDate), offboardReason: application.offboardReason ?? null,
    appliedAt: dateTime(application.appliedAt), updatedAt: dateTime(application.appliedAt)
  }));
  await batches(applications, (batch) => prisma.application.createMany({ data: batch, skipDuplicates: true }));

  const statusLogs = data.people.flatMap((person) => (person.statusLogs ?? []).map((log: JsonRecord) => ({
    id: uuid(log.id), personId: uuid(person.id), fromStatus: log.fromStatus ?? null,
    toStatus: log.toStatus || person.status, interviewStatus: person.interviewStatus,
    action: "IMPORTED_SOURCE_STATUS", notes: log.notes ?? null, createdAt: dateTime(log.createdAt)
  })));
  await batches(statusLogs, (batch) => prisma.personStatusLog.createMany({ data: batch, skipDuplicates: true }));

  const demoSupplierPeople = data.people
    .filter((person) => person.supplierId === demoSupplierSourceId && person.status === "ACTIVE")
    .slice(0, 24);
  const settlementId = uuid("portal-settlement-demo-2026-07");
  const settlementDue = demoSupplierPeople.length * 500;
  await prisma.portalSettlement.upsert({
    where: { supplierId_month: { supplierId: uuid(demoSupplierSourceId), month: "2026-07" } },
    create: {
      id: settlementId, supplierId: uuid(demoSupplierSourceId), month: "2026-07",
      dueAmount: settlementDue, confirmedAmount: Math.round(settlementDue * 0.6),
      pendingAmount: Math.round(settlementDue * 0.36), disputedAmount: settlementDue - Math.round(settlementDue * 0.96),
      status: "pending_confirmation"
    },
    update: {}
  });
  await prisma.portalSettlementItem.createMany({
    data: demoSupplierPeople.map((person, index) => ({
      id: uuid(`portal-settlement-item-${person.id}`), settlementId, personId: uuid(person.id),
      policy: "入职满30天且当前在职，次月结算500元", employmentDays: 30 + index,
      dueAmount: 500, actualAmount: index % 4 === 0 ? 0 : 500, status: index % 4 === 0 ? "pending" : "confirmed"
    })),
    skipDuplicates: true
  });

  const salaryBatchId = uuid("portal-salary-batch-2026-07");
  await prisma.salaryImportBatch.upsert({
    where: { sourceHash_salaryMonth: { sourceHash: createHash("sha256").update("portal-demo-salary-2026-07").digest("hex"), salaryMonth: "2026-07" } },
    create: {
      id: salaryBatchId, sourceFile: "portal-demo-salary.xlsx", sourceHash: createHash("sha256").update("portal-demo-salary-2026-07").digest("hex"),
      salaryMonth: "2026-07", status: "COMMITTED", totalRows: 1, acceptedRows: 1, skippedRows: 0,
      previewRows: [], errors: [], publishedAt: new Date("2026-07-15T10:30:00+08:00")
    },
    update: {}
  });
  await prisma.salarySlip.upsert({
    where: { personId_salaryMonth: { personId: uuid(demoEmployeeSource.id), salaryMonth: "2026-07" } },
    create: {
      id: uuid("portal-salary-slip-2026-07"), personId: uuid(demoEmployeeSource.id), batchId: salaryBatchId,
      salaryMonth: "2026-07", grossPay: 6800, netPay: 6128, hourlyPay: 5200, overtimePay: 800,
      allowance: 800, socialSecurityDeduction: 672, status: "PUBLISHED", publishedAt: new Date("2026-07-15T10:30:00+08:00")
    },
    update: {}
  });

  await prisma.portalAdvance.upsert({
    where: { id: uuid("portal-advance-demo") },
    create: { id: uuid("portal-advance-demo"), personId: uuid(demoEmployeeSource.id), creatorUserId: uuid("demo-employee"), amount: 800, reason: "个人临时周转", status: "submitted" },
    update: {}
  });
  await prisma.portalAppeal.upsert({
    where: { id: uuid("portal-appeal-demo") },
    create: { id: uuid("portal-appeal-demo"), creatorUserId: uuid("demo-employee"), type: "person_status", subjectId: uuid(demoEmployeeSource.id), description: "演示：请核对人员状态记录", status: "submitted", attachmentIds: [] },
    update: {}
  });

  const firstCanonicalJob = [...nestedJobs.values()].find((job) => projectSources.has(job.projectId));
  if (firstCanonicalJob) {
    await prisma.portalFavorite.upsert({
      where: { userId_jobDemandId: { userId: uuid("demo-employee"), jobDemandId: uuid(firstCanonicalJob.id) } },
      create: { userId: uuid("demo-employee"), jobDemandId: uuid(firstCanonicalJob.id) },
      update: {}
    });
  }
  await prisma.notification.createMany({
    data: [
      { id: uuid("portal-notification-employee"), recipientUserId: uuid("demo-employee"), type: "SALARY_UPDATED", title: "工资条已更新", content: "2026年07月工资条已发布，请及时查看。", targetPath: "/personal/me/payroll", dedupeKey: "portal-demo:salary:2026-07", status: "SKIPPED_NOT_CONFIGURED", lastError: "本地演示消息未外发" },
      { id: uuid("portal-notification-operator"), recipientUserId: uuid("demo-operator"), type: "SYSTEM_NOTICE", title: "本地AI助手已就绪", content: "Qwen3.5 4B、数据库和业务工具检查通过。", targetPath: "/internal/dashboard", dedupeKey: "portal-demo:ai-ready", status: "SKIPPED_NOT_CONFIGURED", lastError: "本地演示消息未外发" },
      { id: uuid("portal-notification-supplier"), recipientUserId: uuid("demo-supplier"), type: "SETTLEMENT_READY", title: "7月结算待确认", content: "本月结算明细已经生成，请核对确认。", targetPath: "/supplier/settlements", dedupeKey: "portal-demo:settlement:2026-07", status: "SKIPPED_NOT_CONFIGURED", lastError: "本地演示消息未外发" }
    ],
    skipDuplicates: true
  });

  const counts = {
    branches: await prisma.branch.count(), projects: await prisma.project.count(), suppliers: await prisma.supplier.count(),
    jobs: await prisma.jobDemand.count(), people: await prisma.person.count(), applications: await prisma.application.count(),
    active: await prisma.person.count({ where: { status: "ACTIVE" } }),
    pendingOnboard: await prisma.person.count({ where: { status: "PENDING_ONBOARD" } }),
    left: await prisma.person.count({ where: { status: "LEFT" } })
  };
  console.log(JSON.stringify({ status: "ok", counts }, null, 2));
} finally {
  await prisma.$disconnect();
}
