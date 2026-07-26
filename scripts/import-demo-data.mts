import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { hash } from "../apps/api/node_modules/bcryptjs/index.js";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import {
  Permission,
  UserRole as SharedUserRole,
  rolePermissions
} from "../packages/shared/src/index.js";
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
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
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
    throw new Error(`Project ${project.id} references missing branch ${project.branchId}`);
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
  { key: "demo-operator", username: "demo_operator", displayName: "演示-现场运营", role: "PROJECT_OPERATOR", branchId: null, projectIds: data.projects.map((item) => uuid(item.id)) },
  { key: "demo-hr", username: "demo_hr", displayName: "演示-内部人事", role: "INTERNAL_HR", branchId: uuid(data.branches[0]!.id), projectIds: [] },
  { key: "demo-recruiter", username: "demo_recruiter", displayName: "演示-招聘专员", role: "RECRUITER", branchId: uuid(data.branches[1]!.id), projectIds: [] },
  { key: "demo-finance", username: "demo_finance", displayName: "演示-财务审核", role: "FINANCE_REVIEWER", branchId: uuid(data.branches[0]!.id), projectIds: [] },
  { key: "demo-cashier", username: "demo_cashier", displayName: "演示-出纳", role: "CASHIER", branchId: uuid(data.branches[1]!.id), projectIds: [] },
  { key: "demo-reimbursement", username: "demo_reimbursement", displayName: "演示-部门制单人", role: "DEPARTMENT_REIMBURSEMENT_CLERK", branchId: uuid(data.branches[2]!.id), projectIds: [] }
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
    id: uuid(job.id), projectId: uuid(job.projectId), title: job.title || "通用招聘岗位",
    requiredCount: Math.max(0, Number(job.requiredCount) || 0), requirements: job.requirements || "身体健康，遵守现场安全与考勤规范。",
    salary: job.salary || "5000-6500元/月", workTime: job.workTime || "综合工时制", workLocation: job.workLocation || job.projectName || "项目园区",
    deadline: date(job.deadline) ?? new Date("2026-12-31T00:00:00.000Z"), status: job.status || "RECRUITING",
    createdAt: dateTime(job.createdAt), updatedAt: dateTime(job.createdAt)
  })), (batch) => prisma.jobDemand.createMany({ data: batch, skipDuplicates: true }));

  await batches(data.people.filter((person) => projectSources.has(person.projectId)).map((person) => ({
    id: uuid(person.id), name: person.name, idCard: idCard(person), phone: person.phone,
    employeeNo: person.employeeNo,
    gender: person.gender ?? null, age: Number.isFinite(Number(person.age)) ? Number(person.age) : null,
    ethnicity: person.ethnicity ?? null, origin: person.origin ?? null,
    projectId: uuid(person.projectId), jobTitle: person.jobTitle || "项目运营岗位",
    status: person.status, interviewStatus: person.interviewStatus,
    interviewDate: date(person.interviewDate), supplierId: person.supplierId && supplierSources.has(person.supplierId) ? uuid(person.supplierId) : null,
    recommenderName: person.recommenderName ?? null,
    emergencyContactName: person.emergencyContactName ?? null,
    emergencyContactPhone: person.emergencyContactPhone ?? null,
    emergencyContactRelation: person.emergencyContactRelation ?? null,
    onboardDate: date(person.onboardDate), offboardDate: date(person.offboardDate), offboardReason: person.offboardReason ?? null,
    insuranceTypes: person.insuranceTypes ?? [],
    notes: person.idCard ? (person.notes ?? null) : [person.notes, "合成演示身份编号由系统确定性生成"].filter(Boolean).join("；"),
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

  const roleNames: Record<string, string> = {
    [SharedUserRole.SUPER_ADMIN]: "超级管理员",
    [SharedUserRole.SYSTEM_ADMIN]: "系统管理员",
    [SharedUserRole.GROUP_LEADER]: "集团领导",
    [SharedUserRole.HEADQUARTERS_MANAGER]: "总部管理者",
    [SharedUserRole.BRANCH_MANAGER]: "分公司负责人",
    [SharedUserRole.DEPARTMENT_MANAGER]: "部门负责人",
    [SharedUserRole.INTERNAL_HR]: "内部人事",
    [SharedUserRole.RECRUITER]: "招聘专员",
    [SharedUserRole.PROJECT_OPERATOR]: "项目运营",
    [SharedUserRole.RESOURCE_SPECIALIST]: "资源专员",
    [SharedUserRole.FINANCE_REVIEWER]: "财务审核",
    [SharedUserRole.CASHIER]: "出纳",
    [SharedUserRole.DEPARTMENT_REIMBURSEMENT_CLERK]: "部门报销制单人",
    [SharedUserRole.SUPPLIER_ADMIN]: "供应商管理员",
    [SharedUserRole.SUPPLIER]: "供应商",
    [SharedUserRole.OUTSOURCED_EMPLOYEE]: "外包员工",
    [SharedUserRole.EMPLOYEE]: "内部员工",
    [SharedUserRole.JOB_SEEKER]: "求职者"
  };
  const permissionIds = new Map<string, string>();
  for (const code of Object.values(Permission)) {
    const permission = await prisma.permissionDefinition.upsert({
      where: { code },
      create: {
        id: uuid(`permission:${code}`),
        code,
        name: code,
        module: code.split(":")[0] ?? "system"
      },
      update: {
        module: code.split(":")[0] ?? "system"
      }
    });
    permissionIds.set(code, permission.id);
  }
  const roleIds = new Map<string, string>();
  for (const code of Object.values(SharedUserRole)) {
    const role = await prisma.role.upsert({
      where: { code },
      create: {
        id: uuid(`role:${code}`),
        code,
        name: roleNames[code] ?? code,
        description: "公开演示预置系统角色",
        isSystem: true
      },
      update: {
        name: roleNames[code] ?? code,
        isActive: true
      }
    });
    roleIds.set(code, role.id);
    await prisma.rolePermission.createMany({
      data: rolePermissions[code].map((permissionCode) => ({
        roleId: role.id,
        permissionId: permissionIds.get(permissionCode)!
      })),
      skipDuplicates: true
    });
  }

  const rootOrganizationId = uuid("organization:group");
  await prisma.organizationUnit.upsert({
    where: { code: "XN-DEMO-GROUP" },
    create: {
      id: rootOrganizationId,
      code: "XN-DEMO-GROUP",
      name: "祥能演示集团",
      type: "GROUP",
      path: `/${rootOrganizationId}`,
      sortOrder: 1
    },
    update: { name: "祥能演示集团", isActive: true }
  });
  const departmentIds = new Map<string, string>();
  for (const [branchIndex, branch] of data.branches.entries()) {
    const branchId = uuid(branch.id);
    const legalEntityId = uuid(`legal-entity:${branch.id}`);
    const branchUnitId = uuid(`organization:branch:${branch.id}`);
    await prisma.legalEntity.upsert({
      where: { code: `LE-${branch.sourceCode}` },
      create: {
        id: legalEntityId,
        code: `LE-${branch.sourceCode}`,
        name: `${branch.name}有限公司`,
        taxNumber: `SYNTHETIC-TAX-${String(branchIndex + 1).padStart(4, "0")}`
      },
      update: { name: `${branch.name}有限公司`, isActive: true }
    });
    await prisma.organizationUnit.upsert({
      where: { code: `OU-${branch.sourceCode}` },
      create: {
        id: branchUnitId,
        code: `OU-${branch.sourceCode}`,
        name: branch.name,
        type: "BRANCH",
        parentId: rootOrganizationId,
        legalEntityId,
        branchId,
        path: `/${rootOrganizationId}/${branchUnitId}`,
        sortOrder: branchIndex + 1
      },
      update: {
        name: branch.name,
        legalEntityId,
        branchId,
        isActive: true
      }
    });
    const departmentNames = [
      ...new Set(
        data.internalEmployees
          .filter((employee) => employee.branchId === branch.id)
          .map((employee) => employee.departmentName)
      )
    ];
    for (const [departmentIndex, departmentName] of departmentNames.entries()) {
      const departmentId = uuid(`organization:department:${branch.id}:${departmentName}`);
      departmentIds.set(`${branch.id}:${departmentName}`, departmentId);
      await prisma.organizationUnit.upsert({
        where: { code: `OU-${branch.sourceCode}-D${departmentIndex + 1}` },
        create: {
          id: departmentId,
          code: `OU-${branch.sourceCode}-D${departmentIndex + 1}`,
          name: departmentName,
          type: "DEPARTMENT",
          parentId: branchUnitId,
          legalEntityId,
          branchId,
          path: `/${rootOrganizationId}/${branchUnitId}/${departmentId}`,
          sortOrder: departmentIndex + 1
        },
        update: {
          name: departmentName,
          parentId: branchUnitId,
          legalEntityId,
          branchId,
          isActive: true
        }
      });
    }
  }

  const jobGrade = await prisma.jobGrade.upsert({
    where: { code: "G5" },
    create: {
      id: uuid("job-grade:G5"),
      code: "G5",
      name: "专业岗位",
      level: 5,
      description: "公开演示统一专业职级"
    },
    update: { name: "专业岗位", level: 5, isActive: true }
  });
  const positionIds = new Map<string, string>();
  for (const positionName of new Set(data.internalEmployees.map((employee) => employee.position))) {
    const code = `POS-${String(positionIds.size + 1).padStart(2, "0")}`;
    const position = await prisma.position.upsert({
      where: { code },
      create: {
        id: uuid(`position:${positionName}`),
        code,
        name: positionName,
        description: `${positionName}岗位职责完整演示数据`
      },
      update: { name: positionName, isActive: true }
    });
    positionIds.set(positionName, position.id);
  }

  const internalUsernames = [
    "demo_hr",
    "demo_recruiter",
    "demo_operator",
    "demo_finance",
    "demo_cashier",
    "demo_reimbursement"
  ];
  for (const [index, employee] of data.internalEmployees.entries()) {
    const branch = data.branches.find((item) => item.id === employee.branchId)!;
    const user = await prisma.user.findUnique({
      where: { username: internalUsernames[index]! },
      select: { id: true }
    });
    const employeeId = uuid(employee.id);
    const legalEntityId = uuid(`legal-entity:${branch.id}`);
    const organizationUnitId = departmentIds.get(
      `${branch.id}:${employee.departmentName}`
    )!;
    const positionId = positionIds.get(employee.position)!;
    await prisma.internalEmployee.upsert({
      where: { employeeNo: employee.employeeNo },
      create: {
        id: employeeId,
        employeeNo: employee.employeeNo,
        userId: user?.id,
        name: employee.name,
        phone: employee.phone,
        idCard: employee.idCard,
        legalEntityId,
        branchId: uuid(branch.id),
        organizationUnitId,
        positionId,
        jobGradeId: jobGrade.id,
        status: employee.status,
        onboardDate: dateTime(employee.onboardDate)
      },
      update: {
        userId: user?.id,
        name: employee.name,
        phone: employee.phone,
        idCard: employee.idCard,
        legalEntityId,
        branchId: uuid(branch.id),
        organizationUnitId,
        positionId,
        jobGradeId: jobGrade.id,
        status: employee.status
      }
    });
    await prisma.internalEmployment.upsert({
      where: { id: uuid(`employment:${employee.id}:initial`) },
      create: {
        id: uuid(`employment:${employee.id}:initial`),
        employeeId,
        legalEntityId,
        branchId: uuid(branch.id),
        organizationUnitId,
        positionId,
        jobGradeId: jobGrade.id,
        startedAt: dateTime(employee.onboardDate),
        reason: "演示初始化",
        isPrimary: true
      },
      update: {
        legalEntityId,
        branchId: uuid(branch.id),
        organizationUnitId,
        positionId,
        jobGradeId: jobGrade.id,
        endedAt: null,
        isPrimary: true
      }
    });
    await prisma.internalEmployeeChange.upsert({
      where: { id: uuid(`employee-change:${employee.id}:onboard`) },
      create: {
        id: uuid(`employee-change:${employee.id}:onboard`),
        employeeId,
        type: "ONBOARD",
        effectiveAt: dateTime(employee.onboardDate),
        reason: "演示初始化",
        after: {
          status: employee.status,
          organizationUnitId,
          positionId,
          branchId: uuid(branch.id)
        }
      },
      update: {}
    });
  }

  const assignmentDefinitions = [
    { username: "demo_admin", role: SharedUserRole.SUPER_ADMIN, scopes: [{ type: "GROUP" as const }] },
    { username: "demo_hq", role: SharedUserRole.GROUP_LEADER, scopes: [{ type: "GROUP" as const }] },
    { username: "demo_branch", role: SharedUserRole.BRANCH_MANAGER, scopes: [{ type: "BRANCH" as const, branchId: uuid(data.branches[0]!.id) }] },
    { username: "demo_project", role: SharedUserRole.PROJECT_OPERATOR, scopes: demoProjectIds.map((projectId) => ({ type: "PROJECT" as const, projectId })) },
    { username: "demo_operator", role: SharedUserRole.PROJECT_OPERATOR, scopes: data.projects.map((project) => ({ type: "PROJECT" as const, projectId: uuid(project.id) })) },
    { username: "demo_hr", role: SharedUserRole.INTERNAL_HR, scopes: [{ type: "BRANCH" as const, branchId: uuid(data.branches[0]!.id) }] },
    { username: "demo_recruiter", role: SharedUserRole.RECRUITER, scopes: [{ type: "BRANCH" as const, branchId: uuid(data.branches[1]!.id) }] },
    { username: "demo_finance", role: SharedUserRole.FINANCE_REVIEWER, scopes: [{ type: "GROUP" as const }] },
    { username: "demo_cashier", role: SharedUserRole.CASHIER, scopes: [{ type: "GROUP" as const }] },
    { username: "demo_reimbursement", role: SharedUserRole.DEPARTMENT_REIMBURSEMENT_CLERK, scopes: [{ type: "BRANCH" as const, branchId: uuid(data.branches[2]!.id) }] },
    { username: "demo_supplier", role: SharedUserRole.SUPPLIER_ADMIN, scopes: [{ type: "SUPPLIER" as const, supplierId: uuid(demoSupplierSourceId) }] },
    { username: "demo_employee", role: SharedUserRole.EMPLOYEE, scopes: [{ type: "SELF" as const }] }
  ];
  for (const definition of assignmentDefinitions) {
    const account = await prisma.user.findUnique({
      where: { username: definition.username },
      select: { id: true }
    });
    if (!account) continue;
    const roleId = roleIds.get(definition.role)!;
    const assignmentId = uuid(`role-assignment:${definition.username}:${definition.role}`);
    await prisma.userRoleAssignment.upsert({
      where: { id: assignmentId },
      create: {
        id: assignmentId,
        userId: account.id,
        roleId,
        status: "ACTIVE"
      },
      update: {
        roleId,
        status: "ACTIVE",
        validTo: null,
        revokedAt: null
      }
    });
    await prisma.dataScopeBinding.deleteMany({
      where: { roleAssignmentId: assignmentId }
    });
    await prisma.dataScopeBinding.createMany({
      data: definition.scopes.map((scope, scopeIndex) => ({
        id: uuid(`scope:${assignmentId}:${scopeIndex}`),
        userId: account.id,
        roleAssignmentId: assignmentId,
        type: scope.type,
        branchId: "branchId" in scope ? scope.branchId : null,
        projectId: "projectId" in scope ? scope.projectId : null,
        supplierId: "supplierId" in scope ? scope.supplierId : null
      }))
    });
  }

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
