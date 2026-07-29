import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import type { MigrationFieldDefinition } from "./migration-center.js";

export type MigrationTemplateSeed = {
  code: string;
  name: string;
  targetEntity: string;
  description: string;
  uniqueKeys: string[];
  fields: MigrationFieldDefinition[];
};

export const defaultMigrationTemplates: MigrationTemplateSeed[] = [
  {
    code: "LEGAL_ENTITY",
    name: "合同主体",
    targetEntity: "LEGAL_ENTITY",
    description: "迁移公司及合同主体基础资料",
    uniqueKeys: ["code"],
    fields: [
      { key: "code", label: "主体编码", required: true, aliases: ["公司编码"] },
      { key: "name", label: "主体名称", required: true, aliases: ["公司名称", "合同主体"] },
      { key: "taxNumber", label: "统一社会信用代码", aliases: ["税号"] },
      { key: "isActive", label: "是否启用", aliases: ["状态"], format: "BOOLEAN" }
    ]
  },
  {
    code: "ORGANIZATION_UNIT",
    name: "组织架构",
    targetEntity: "ORGANIZATION_UNIT",
    description: "按父级在前的顺序迁移集团、中心、业务部门和分公司节点",
    uniqueKeys: ["code"],
    fields: [
      { key: "code", label: "组织编码", required: true, aliases: ["部门编码"] },
      { key: "name", label: "组织名称", required: true, aliases: ["部门名称"] },
      { key: "type", label: "组织类型", required: true, aliases: ["节点类型"] },
      { key: "parentCode", label: "上级组织编码", aliases: ["父级编码"] },
      { key: "sortOrder", label: "排序", format: "INTEGER" },
      { key: "isActive", label: "是否启用", aliases: ["状态"], format: "BOOLEAN" }
    ]
  },
  {
    code: "PROJECT",
    name: "项目主档",
    targetEntity: "PROJECT",
    description: "迁移经营区域及项目主档",
    uniqueKeys: ["sourceProjectId"],
    fields: [
      { key: "sourceProjectId", label: "项目编码", required: true, aliases: ["源项目ID", "项目ID"] },
      { key: "branchName", label: "经营分公司", required: true, aliases: ["分公司", "经营区域"] },
      { key: "name", label: "项目名称", required: true, aliases: ["面试企业"] },
      { key: "businessType", label: "业务类型" },
      { key: "managerName", label: "项目负责人" },
      { key: "managerPhone", label: "负责人电话", format: "PHONE" },
      { key: "status", label: "项目状态", allowedValues: ["ACTIVE", "PAUSED", "HISTORICAL", "PENDING_CONFIRMATION"] },
      { key: "isExternal", label: "是否外送", format: "BOOLEAN" }
    ]
  },
  {
    code: "SUPPLIER",
    name: "供应商",
    targetEntity: "SUPPLIER",
    description: "迁移供应商基础资料",
    uniqueKeys: ["name"],
    fields: [
      { key: "name", label: "供应商名称", required: true, aliases: ["供应商"] },
      { key: "contactName", label: "联系人" },
      { key: "contactPhone", label: "联系电话", aliases: ["联系人电话"], format: "PHONE" },
      { key: "level", label: "供应商等级" },
      { key: "isActive", label: "是否启用", aliases: ["状态"], format: "BOOLEAN" }
    ]
  },
  {
    code: "BRANCH",
    name: "经营分公司与区域",
    targetEntity: "BRANCH",
    description: "迁移项目经营分公司及经营区域主档，建议在项目主档之前导入",
    uniqueKeys: ["name"],
    fields: [
      { key: "name", label: "经营分公司名称", required: true, aliases: ["分公司", "经营区域"] },
      { key: "sourceCode", label: "经营分公司编码", aliases: ["分公司编码", "区域编码"] },
      { key: "remark", label: "备注" }
    ]
  },
  {
    code: "POSITION",
    name: "岗位主档",
    targetEntity: "POSITION",
    description: "迁移内部岗位及所属组织，建议在内部员工之前导入",
    uniqueKeys: ["code"],
    fields: [
      { key: "code", label: "岗位编码", required: true },
      { key: "name", label: "岗位名称", required: true, aliases: ["职位名称"] },
      { key: "organizationUnitCode", label: "组织编码", aliases: ["部门编码"] },
      { key: "description", label: "岗位说明" },
      { key: "isActive", label: "是否启用", aliases: ["状态"], format: "BOOLEAN" }
    ]
  },
  {
    code: "JOB_GRADE",
    name: "职级主档",
    targetEntity: "JOB_GRADE",
    description: "迁移职级编码、名称和层级，建议在内部员工之前导入",
    uniqueKeys: ["code"],
    fields: [
      { key: "code", label: "职级编码", required: true },
      { key: "name", label: "职级名称", required: true },
      { key: "level", label: "职级层级", required: true, aliases: ["层级"], format: "INTEGER" },
      { key: "description", label: "职级说明" },
      { key: "isActive", label: "是否启用", aliases: ["状态"], format: "BOOLEAN" }
    ]
  },
  {
    code: "INTERNAL_EMPLOYEE",
    name: "内部员工",
    targetEntity: "INTERNAL_EMPLOYEE",
    description: "迁移内部正式员工、岗位、职级和组织归属",
    uniqueKeys: ["employeeNo"],
    fields: [
      { key: "employeeNo", label: "员工编号", required: true, aliases: ["工号"] },
      { key: "name", label: "姓名", required: true, aliases: ["员工姓名"] },
      { key: "phone", label: "手机号", required: true, aliases: ["联系电话"], format: "PHONE" },
      { key: "idCard", label: "身份证号", required: true, aliases: ["身份证"], format: "ID_CARD" },
      { key: "onboardDate", label: "入职日期", required: true, format: "DATE" },
      { key: "legalEntityCode", label: "合同主体编码", aliases: ["主体编码"] },
      { key: "organizationUnitCode", label: "组织编码", aliases: ["部门编码"] },
      { key: "positionCode", label: "岗位编码" },
      { key: "jobGradeCode", label: "职级编码" },
      { key: "email", label: "邮箱" },
      { key: "bankAccount", label: "银行卡号" },
      { key: "status", label: "在职状态", allowedValues: ["ACTIVE", "DISABLED", "LEFT", "ARCHIVED"] }
    ]
  },
  {
    code: "POLICY",
    name: "招聘与推荐政策",
    targetEntity: "POLICY",
    description: "迁移供应商政策和内部员工推荐奖励政策，项目必须已存在",
    uniqueKeys: ["type", "branchName", "projectName", "name", "version"],
    fields: [
      { key: "type", label: "政策类型", required: true, aliases: ["类型"], allowedValues: ["SUPPLIER", "EMPLOYEE_REFERRAL"] },
      { key: "projectName", label: "项目名称", required: true, aliases: ["项目"] },
      { key: "branchName", label: "经营分公司", required: true, aliases: ["分公司", "经营区域"] },
      { key: "name", label: "政策名称", required: true },
      { key: "version", label: "政策版本", required: true, aliases: ["版本"], format: "INTEGER" },
      { key: "jobTitle", label: "适用岗位", aliases: ["岗位"] },
      { key: "supplierName", label: "指定供应商", aliases: ["供应商"] },
      { key: "supplierLevel", label: "供应商等级" },
      { key: "employeeType", label: "员工类型" },
      { key: "amount", label: "奖励金额", required: true, aliases: ["金额"], format: "NUMBER" },
      { key: "achievementConditions", label: "达成条件", required: true, aliases: ["政策条件"] },
      { key: "exclusionConditions", label: "排除条件" },
      { key: "effectiveAt", label: "生效日期", required: true, format: "DATE" },
      { key: "expiresAt", label: "失效日期", format: "DATE" },
      { key: "isActive", label: "是否启用", aliases: ["状态"], format: "BOOLEAN" },
      { key: "notes", label: "备注" }
    ]
  },
  {
    code: "JOB_DEMAND",
    name: "招聘需求",
    targetEntity: "JOB_DEMAND",
    description: "迁移项目招聘岗位和历史招聘需求",
    uniqueKeys: ["branchName", "projectName", "title", "deadline"],
    fields: [
      { key: "projectName", label: "项目名称", required: true, aliases: ["项目"] },
      { key: "branchName", label: "经营分公司", required: true, aliases: ["分公司", "经营区域"] },
      { key: "title", label: "招聘岗位", required: true, aliases: ["岗位名称", "岗位"] },
      { key: "requiredCount", label: "需求人数", required: true, format: "INTEGER" },
      { key: "requirements", label: "任职要求", required: true },
      { key: "salary", label: "薪资待遇", required: true, aliases: ["薪资"] },
      { key: "workTime", label: "工作时间", required: true },
      { key: "workLocation", label: "工作地点", required: true },
      { key: "deadline", label: "截止日期", required: true, format: "DATE" },
      { key: "status", label: "招聘状态", allowedValues: ["RECRUITING", "PAUSED", "FILLED", "ENDED"] },
      { key: "supplierPolicyName", label: "供应商政策名称" },
      { key: "referralPolicyName", label: "内部推荐政策名称" },
      { key: "notes", label: "备注" }
    ]
  },
  {
    code: "SALARY_SLIP",
    name: "工资条历史数据",
    targetEntity: "SALARY_SLIP",
    description: "按身份证号和工资月份迁移派遣外包员工工资条",
    uniqueKeys: ["idCard", "salaryMonth"],
    fields: [
      { key: "idCard", label: "身份证号", required: true, aliases: ["身份证"], format: "ID_CARD" },
      { key: "salaryMonth", label: "工资月份", required: true, aliases: ["月份"] },
      { key: "grossPay", label: "应发工资", required: true, format: "NUMBER" },
      { key: "netPay", label: "实发工资", required: true, format: "NUMBER" },
      { key: "hourlyPay", label: "计时工资", format: "NUMBER" },
      { key: "overtimePay", label: "加班工资", format: "NUMBER" },
      { key: "allowance", label: "津贴补助", format: "NUMBER" },
      { key: "referralReward", label: "推荐奖励", format: "NUMBER" },
      { key: "socialSecurityDeduction", label: "社保扣款", format: "NUMBER" },
      { key: "otherDeduction", label: "其他扣款", format: "NUMBER" },
      { key: "status", label: "工资条状态", allowedValues: ["DRAFT", "PUBLISHED", "WITHDRAWN"] },
      { key: "notes", label: "备注" }
    ]
  },
  {
    code: "PERSON",
    name: "派遣外包与候选人",
    targetEntity: "PERSON",
    description: "迁移候选人、面试、入职及离职人员主档",
    uniqueKeys: ["idCard"],
    fields: [
      { key: "name", label: "姓名", required: true, aliases: ["人员姓名"] },
      { key: "idCard", label: "身份证号", required: true, aliases: ["身份证"], format: "ID_CARD" },
      { key: "phone", label: "手机号", required: true, aliases: ["联系电话"], format: "PHONE" },
      { key: "branchName", label: "经营分公司", aliases: ["分公司"] },
      { key: "projectName", label: "项目名称", required: true, aliases: ["面试企业", "项目"] },
      { key: "jobTitle", label: "岗位名称", required: true, aliases: ["岗位"] },
      { key: "supplierName", label: "供应商名称", aliases: ["供应商"] },
      { key: "status", label: "人员状态" },
      { key: "interviewStatus", label: "面试状态" },
      { key: "interviewDate", label: "面试日期", format: "DATE" },
      { key: "onboardDate", label: "入职日期", format: "DATE" },
      { key: "offboardDate", label: "离职日期", format: "DATE" },
      { key: "offboardReason", label: "离职原因" },
      { key: "employeeNo", label: "员工编号", aliases: ["工号"] }
    ]
  }
];

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function bool(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  const normalized = text(value)?.toLowerCase();
  if (["否", "false", "0", "停用", "禁用"].includes(normalized ?? "")) return false;
  if (["是", "true", "1", "启用", "有效"].includes(normalized ?? "")) return true;
  return fallback;
}

function date(value: unknown): Date | null {
  if (!value) return null;
  const result = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(result.getTime()) ? null : result;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function amount(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) throw new Error(`金额格式不正确：${String(value ?? "")}`);
  return parsed;
}

function migrationSalaryBatchHash(salaryMonth: string): string {
  return createHash("sha256").update(`migration-center:salary:${salaryMonth}`).digest("hex");
}

export async function loadExistingMigrationKeys(
  tx: Prisma.TransactionClient,
  targetEntity: string
): Promise<Set<string>> {
  switch (targetEntity) {
    case "BRANCH": return new Set((await tx.branch.findMany({ select: { name: true } })).map((row) => row.name));
    case "POSITION": return new Set((await tx.position.findMany({ select: { code: true } })).map((row) => row.code));
    case "JOB_GRADE": return new Set((await tx.jobGrade.findMany({ select: { code: true } })).map((row) => row.code));
    case "LEGAL_ENTITY": return new Set((await tx.legalEntity.findMany({ select: { code: true } })).map((row) => row.code));
    case "ORGANIZATION_UNIT": return new Set((await tx.organizationUnit.findMany({ select: { code: true } })).map((row) => row.code));
    case "PROJECT": return new Set((await tx.project.findMany({ where: { sourceProjectId: { not: null } }, select: { sourceProjectId: true } })).flatMap((row) => row.sourceProjectId ? [row.sourceProjectId] : []));
    case "SUPPLIER": return new Set((await tx.supplier.findMany({ select: { name: true } })).map((row) => row.name));
    case "POLICY": return new Set((await tx.policy.findMany({ select: { type: true, name: true, version: true, project: { select: { name: true, branch: { select: { name: true } } } } } })).map((row) => `${row.type}::${row.project.branch.name}::${row.project.name}::${row.name}::${row.version}`));
    case "JOB_DEMAND": return new Set((await tx.jobDemand.findMany({ select: { title: true, deadline: true, project: { select: { name: true, branch: { select: { name: true } } } } } })).map((row) => `${row.project.branch.name}::${row.project.name}::${row.title}::${dateKey(row.deadline)}`));
    case "SALARY_SLIP": return new Set((await tx.salarySlip.findMany({ select: { salaryMonth: true, person: { select: { idCard: true } } } })).map((row) => `${row.person.idCard}::${row.salaryMonth}`));
    case "INTERNAL_EMPLOYEE": return new Set((await tx.internalEmployee.findMany({ select: { employeeNo: true } })).map((row) => row.employeeNo));
    case "PERSON": return new Set((await tx.person.findMany({ select: { idCard: true } })).map((row) => row.idCard));
    default: return new Set();
  }
}

export async function applyMigrationRow(
  tx: Prisma.TransactionClient,
  targetEntity: string,
  action: "CREATE" | "UPDATE",
  data: Record<string, unknown>
): Promise<{ entityId: string; before: unknown; after: unknown }> {
  switch (targetEntity) {
    case "BRANCH": {
      const name = text(data.name)!;
      const existing = await tx.branch.findUnique({ where: { name } });
      const payload = { name, sourceCode: text(data.sourceCode), remark: text(data.remark) };
      const record = existing
        ? await tx.branch.update({ where: { id: existing.id }, data: payload })
        : await tx.branch.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "POSITION": {
      const code = text(data.code)!;
      const organizationUnitCode = text(data.organizationUnitCode);
      const organizationUnit = organizationUnitCode ? await tx.organizationUnit.findUnique({ where: { code: organizationUnitCode } }) : null;
      if (organizationUnitCode && !organizationUnit) throw new Error(`组织编码不存在：${organizationUnitCode}`);
      const existing = await tx.position.findUnique({ where: { code } });
      const payload = {
        code,
        name: text(data.name)!,
        organizationUnitId: organizationUnit?.id ?? null,
        description: text(data.description),
        isActive: bool(data.isActive)
      };
      const record = existing
        ? await tx.position.update({ where: { id: existing.id }, data: payload })
        : await tx.position.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "JOB_GRADE": {
      const code = text(data.code)!;
      const existing = await tx.jobGrade.findUnique({ where: { code } });
      const level = Number(data.level);
      if (!Number.isInteger(level)) throw new Error("职级层级必须是整数");
      const payload = { code, name: text(data.name)!, level, description: text(data.description), isActive: bool(data.isActive) };
      const record = existing
        ? await tx.jobGrade.update({ where: { id: existing.id }, data: payload })
        : await tx.jobGrade.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "LEGAL_ENTITY": {
      const code = text(data.code)!;
      const existing = await tx.legalEntity.findUnique({ where: { code } });
      const payload = { code, name: text(data.name)!, taxNumber: text(data.taxNumber), isActive: bool(data.isActive) };
      const record = existing
        ? await tx.legalEntity.update({ where: { id: existing.id }, data: payload })
        : await tx.legalEntity.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "ORGANIZATION_UNIT": {
      const code = text(data.code)!;
      const parentCode = text(data.parentCode);
      const parent = parentCode ? await tx.organizationUnit.findUnique({ where: { code: parentCode } }) : null;
      if (parentCode && !parent) throw new Error(`上级组织编码不存在：${parentCode}`);
      const existing = await tx.organizationUnit.findUnique({ where: { code } });
      const path = parent ? `${parent.path}/${code}` : `/${code}`;
      const payload = {
        code,
        name: text(data.name)!,
        type: (text(data.type) ?? "OTHER") as never,
        parentId: parent?.id ?? null,
        path,
        sortOrder: Number(data.sortOrder ?? 0) || 0,
        isActive: bool(data.isActive)
      };
      const record = existing
        ? await tx.organizationUnit.update({ where: { id: existing.id }, data: payload })
        : await tx.organizationUnit.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "PROJECT": {
      const sourceProjectId = text(data.sourceProjectId)!;
      const branchName = text(data.branchName)!;
      const branch = await tx.branch.findUnique({ where: { name: branchName } });
      if (!branch) throw new Error(`经营分公司不存在：${branchName}`);
      const existing = await tx.project.findUnique({ where: { sourceProjectId } });
      const payload = {
        sourceProjectId,
        branchId: branch.id,
        name: text(data.name)!,
        businessType: text(data.businessType),
        managerName: text(data.managerName),
        managerPhone: text(data.managerPhone),
        status: (text(data.status) || null) as never,
        isExternal: bool(data.isExternal, false)
      };
      const record = existing
        ? await tx.project.update({ where: { id: existing.id }, data: payload })
        : await tx.project.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "SUPPLIER": {
      const name = text(data.name)!;
      const existing = await tx.supplier.findUnique({ where: { name } });
      const payload = {
        name,
        contactName: text(data.contactName),
        contactPhone: text(data.contactPhone),
        level: text(data.level),
        isActive: bool(data.isActive)
      };
      const record = existing
        ? await tx.supplier.update({ where: { id: existing.id }, data: payload })
        : await tx.supplier.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "POLICY": {
      const type = text(data.type)!;
      const branchName = text(data.branchName)!;
      const projectName = text(data.projectName)!;
      const project = await tx.project.findFirst({ where: { name: projectName, branch: { name: branchName } } });
      if (!project) throw new Error(`项目不存在：${branchName}/${projectName}`);
      const supplierName = text(data.supplierName);
      const supplier = supplierName ? await tx.supplier.findUnique({ where: { name: supplierName } }) : null;
      if (supplierName && !supplier) throw new Error(`供应商不存在：${supplierName}`);
      const version = Number(data.version);
      const effectiveAt = date(data.effectiveAt);
      if (!Number.isInteger(version) || version <= 0) throw new Error("政策版本必须是正整数");
      if (!effectiveAt) throw new Error("生效日期格式不正确");
      const name = text(data.name)!;
      const existing = await tx.policy.findFirst({ where: { projectId: project.id, type: type as never, name, version } });
      const payload = {
        name, type: type as never, projectId: project.id, jobTitle: text(data.jobTitle), supplierId: supplier?.id ?? null,
        supplierLevel: text(data.supplierLevel), employeeType: text(data.employeeType), amount: amount(data.amount),
        achievementConditions: text(data.achievementConditions)!, exclusionConditions: text(data.exclusionConditions),
        effectiveAt, expiresAt: date(data.expiresAt), notes: text(data.notes), version, isActive: bool(data.isActive)
      };
      const record = existing
        ? await tx.policy.update({ where: { id: existing.id }, data: payload })
        : await tx.policy.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "JOB_DEMAND": {
      const branchName = text(data.branchName)!;
      const projectName = text(data.projectName)!;
      const project = await tx.project.findFirst({ where: { name: projectName, branch: { name: branchName } } });
      if (!project) throw new Error(`项目不存在：${branchName}/${projectName}`);
      const deadline = date(data.deadline);
      if (!deadline) throw new Error("截止日期格式不正确");
      const title = text(data.title)!;
      const supplierPolicyName = text(data.supplierPolicyName);
      const referralPolicyName = text(data.referralPolicyName);
      const supplierPolicy = supplierPolicyName ? await tx.policy.findFirst({ where: { projectId: project.id, type: "SUPPLIER", name: supplierPolicyName, isActive: true }, orderBy: { version: "desc" } }) : null;
      const referralPolicy = referralPolicyName ? await tx.policy.findFirst({ where: { projectId: project.id, type: "EMPLOYEE_REFERRAL", name: referralPolicyName, isActive: true }, orderBy: { version: "desc" } }) : null;
      if (supplierPolicyName && !supplierPolicy) throw new Error(`供应商政策不存在：${supplierPolicyName}`);
      if (referralPolicyName && !referralPolicy) throw new Error(`内部推荐政策不存在：${referralPolicyName}`);
      const existing = await tx.jobDemand.findFirst({ where: { projectId: project.id, title, deadline } });
      const requiredCount = Number(data.requiredCount);
      if (!Number.isInteger(requiredCount) || requiredCount < 0) throw new Error("需求人数必须是非负整数");
      const payload = {
        projectId: project.id, title, requiredCount, requirements: text(data.requirements)!, salary: text(data.salary)!,
        workTime: text(data.workTime)!, workLocation: text(data.workLocation)!, deadline,
        status: (text(data.status) ?? "RECRUITING") as never, supplierPolicyId: supplierPolicy?.id ?? null,
        referralPolicyId: referralPolicy?.id ?? null, notes: text(data.notes)
      };
      const record = existing
        ? await tx.jobDemand.update({ where: { id: existing.id }, data: payload })
        : await tx.jobDemand.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "SALARY_SLIP": {
      const idCard = text(data.idCard)!.toUpperCase();
      const salaryMonth = text(data.salaryMonth)!;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(salaryMonth)) throw new Error("工资月份必须使用YYYY-MM格式");
      const person = await tx.person.findUnique({ where: { idCard } });
      if (!person) throw new Error(`人员不存在：${idCard}`);
      let batch = await tx.salaryImportBatch.findUnique({ where: { sourceHash_salaryMonth: { sourceHash: migrationSalaryBatchHash(salaryMonth), salaryMonth } } });
      if (!batch) {
        batch = await tx.salaryImportBatch.create({ data: {
          sourceFile: `数据迁移中心-${salaryMonth}`, sourceHash: migrationSalaryBatchHash(salaryMonth), salaryMonth,
          status: "COMMITTED", totalRows: 0, acceptedRows: 0, skippedRows: 0, previewRows: [], errors: []
        } });
      }
      const existing = await tx.salarySlip.findUnique({ where: { personId_salaryMonth: { personId: person.id, salaryMonth } } });
      const status = (text(data.status) ?? "DRAFT") as "DRAFT" | "PUBLISHED" | "WITHDRAWN";
      const payload = {
        personId: person.id, batchId: batch.id, salaryMonth, grossPay: amount(data.grossPay), netPay: amount(data.netPay),
        hourlyPay: amount(data.hourlyPay), overtimePay: amount(data.overtimePay), allowance: amount(data.allowance),
        referralReward: amount(data.referralReward), socialSecurityDeduction: amount(data.socialSecurityDeduction),
        otherDeduction: amount(data.otherDeduction), notes: text(data.notes), status: status as never,
        publishedAt: status === "PUBLISHED" ? existing?.publishedAt ?? new Date() : null,
        withdrawnAt: status === "WITHDRAWN" ? existing?.withdrawnAt ?? new Date() : null
      };
      const record = existing
        ? await tx.salarySlip.update({ where: { id: existing.id }, data: payload })
        : await tx.salarySlip.create({ data: payload });
      const count = await tx.salarySlip.count({ where: { batchId: batch.id } });
      await tx.salaryImportBatch.update({ where: { id: batch.id }, data: { status: "COMMITTED", totalRows: count, acceptedRows: count } });
      return { entityId: record.id, before: existing, after: record };
    }
    case "INTERNAL_EMPLOYEE": {
      const employeeNo = text(data.employeeNo)!;
      const existing = await tx.internalEmployee.findUnique({ where: { employeeNo } });
      const legalEntityCode = text(data.legalEntityCode);
      const organizationUnitCode = text(data.organizationUnitCode);
      const positionCode = text(data.positionCode);
      const jobGradeCode = text(data.jobGradeCode);
      const legalEntity = legalEntityCode ? await tx.legalEntity.findUnique({ where: { code: legalEntityCode } }) : null;
      const organizationUnit = organizationUnitCode ? await tx.organizationUnit.findUnique({ where: { code: organizationUnitCode } }) : null;
      const position = positionCode ? await tx.position.findUnique({ where: { code: positionCode } }) : null;
      const jobGrade = jobGradeCode ? await tx.jobGrade.findUnique({ where: { code: jobGradeCode } }) : null;
      if (legalEntityCode && !legalEntity) throw new Error(`合同主体编码不存在：${legalEntityCode}`);
      if (organizationUnitCode && !organizationUnit) throw new Error(`组织编码不存在：${organizationUnitCode}`);
      if (positionCode && !position) throw new Error(`岗位编码不存在：${positionCode}`);
      if (jobGradeCode && !jobGrade) throw new Error(`职级编码不存在：${jobGradeCode}`);
      const onboardDate = date(data.onboardDate);
      if (!onboardDate) throw new Error("入职日期格式不正确");
      const payload = {
        employeeNo,
        sourceEmployeeNo: employeeNo,
        name: text(data.name)!,
        phone: text(data.phone)!,
        idCard: text(data.idCard)!.toUpperCase(),
        email: text(data.email),
        bankAccount: text(data.bankAccount),
        legalEntityId: legalEntity?.id ?? null,
        organizationUnitId: organizationUnit?.id ?? null,
        positionId: position?.id ?? null,
        jobGradeId: jobGrade?.id ?? null,
        status: (text(data.status) ?? "ACTIVE") as never,
        onboardDate
      };
      const record = existing
        ? await tx.internalEmployee.update({ where: { id: existing.id }, data: payload })
        : await tx.internalEmployee.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    case "PERSON": {
      const idCard = text(data.idCard)!.toUpperCase();
      const branchName = text(data.branchName);
      const projectName = text(data.projectName)!;
      const projectCandidates = await tx.project.findMany({
        where: { name: projectName, branch: branchName ? { name: branchName } : undefined },
        include: { branch: true },
        take: 2
      });
      if (!projectCandidates.length) throw new Error(`项目不存在：${branchName ? `${branchName}/` : ""}${projectName}`);
      if (!branchName && projectCandidates.length > 1) throw new Error(`存在多个同名项目“${projectName}”，请填写经营分公司`);
      const project = projectCandidates[0]!;
      const supplierName = text(data.supplierName);
      const supplier = supplierName ? await tx.supplier.findUnique({ where: { name: supplierName } }) : null;
      if (supplierName && !supplier) throw new Error(`供应商不存在：${supplierName}`);
      const existing = await tx.person.findUnique({ where: { idCard } });
      const payload = {
        name: text(data.name)!, idCard, phone: text(data.phone)!, projectId: project.id,
        jobTitle: text(data.jobTitle)!, supplierId: supplier?.id ?? null,
        status: (text(data.status) ?? "APPLICANT") as never,
        interviewStatus: (text(data.interviewStatus) ?? "PENDING_ARRIVAL") as never,
        interviewDate: date(data.interviewDate), onboardDate: date(data.onboardDate),
        offboardDate: date(data.offboardDate), offboardReason: text(data.offboardReason),
        employeeNo: text(data.employeeNo)
      };
      const record = existing
        ? await tx.person.update({ where: { id: existing.id }, data: payload })
        : await tx.person.create({ data: payload });
      return { entityId: record.id, before: existing, after: record };
    }
    default:
      throw new Error(`暂不支持的迁移目标：${targetEntity}`);
  }
}

export async function rollbackMigrationRow(
  tx: Prisma.TransactionClient,
  targetEntity: string,
  entityId: string,
  before: unknown
): Promise<void> {
  if (!before) {
    switch (targetEntity) {
      case "BRANCH": await tx.branch.delete({ where: { id: entityId } }); return;
      case "POSITION": await tx.position.delete({ where: { id: entityId } }); return;
      case "JOB_GRADE": await tx.jobGrade.delete({ where: { id: entityId } }); return;
      case "LEGAL_ENTITY": await tx.legalEntity.delete({ where: { id: entityId } }); return;
      case "ORGANIZATION_UNIT": await tx.organizationUnit.delete({ where: { id: entityId } }); return;
      case "PROJECT": await tx.project.delete({ where: { id: entityId } }); return;
      case "SUPPLIER": await tx.supplier.delete({ where: { id: entityId } }); return;
      case "POLICY": await tx.policy.delete({ where: { id: entityId } }); return;
      case "JOB_DEMAND": await tx.jobDemand.delete({ where: { id: entityId } }); return;
      case "SALARY_SLIP": {
        const record = await tx.salarySlip.findUnique({ where: { id: entityId }, select: { batchId: true } });
        await tx.salarySlip.delete({ where: { id: entityId } });
        if (record) {
          const count = await tx.salarySlip.count({ where: { batchId: record.batchId } });
          await tx.salaryImportBatch.update({ where: { id: record.batchId }, data: { totalRows: count, acceptedRows: count } });
        }
        return;
      }
      case "INTERNAL_EMPLOYEE": await tx.internalEmployee.delete({ where: { id: entityId } }); return;
      case "PERSON": await tx.person.delete({ where: { id: entityId } }); return;
      default: throw new Error(`暂不支持撤销的迁移目标：${targetEntity}`);
    }
  }

  const data = before as Record<string, unknown>;
  switch (targetEntity) {
    case "BRANCH":
      await tx.branch.update({ where: { id: entityId }, data: { sourceCode: text(data.sourceCode), name: text(data.name)!, remark: text(data.remark) } });
      return;
    case "POSITION":
      await tx.position.update({ where: { id: entityId }, data: {
        code: text(data.code)!, name: text(data.name)!, organizationUnitId: text(data.organizationUnitId),
        description: text(data.description), isActive: bool(data.isActive)
      } });
      return;
    case "JOB_GRADE":
      await tx.jobGrade.update({ where: { id: entityId }, data: {
        code: text(data.code)!, name: text(data.name)!, level: Number(data.level),
        description: text(data.description), isActive: bool(data.isActive)
      } });
      return;
    case "LEGAL_ENTITY":
      await tx.legalEntity.update({ where: { id: entityId }, data: { code: text(data.code)!, name: text(data.name)!, taxNumber: text(data.taxNumber), isActive: bool(data.isActive) } });
      return;
    case "ORGANIZATION_UNIT":
      await tx.organizationUnit.update({ where: { id: entityId }, data: {
        code: text(data.code)!, name: text(data.name)!, type: data.type as never,
        parentId: text(data.parentId), path: text(data.path)!, sortOrder: Number(data.sortOrder ?? 0), isActive: bool(data.isActive)
      } });
      return;
    case "PROJECT":
      await tx.project.update({ where: { id: entityId }, data: {
        sourceProjectId: text(data.sourceProjectId), branchId: text(data.branchId)!, name: text(data.name)!,
        isExternal: bool(data.isExternal, false), businessType: text(data.businessType), status: data.status as never,
        managerName: text(data.managerName), managerPhone: text(data.managerPhone), cooperationStart: date(data.cooperationStart),
        cooperationEnd: date(data.cooperationEnd), responsibility: data.responsibility as never,
        description: text(data.description), remark: text(data.remark)
      } });
      return;
    case "SUPPLIER":
      await tx.supplier.update({ where: { id: entityId }, data: {
        name: text(data.name)!, contactName: text(data.contactName), contactPhone: text(data.contactPhone),
        level: text(data.level), isActive: bool(data.isActive)
      } });
      return;
    case "POLICY":
      await tx.policy.update({ where: { id: entityId }, data: {
        name: text(data.name)!, type: data.type as never, projectId: text(data.projectId)!, jobTitle: text(data.jobTitle),
        supplierId: text(data.supplierId), supplierLevel: text(data.supplierLevel), employeeType: text(data.employeeType),
        amount: amount(data.amount), achievementConditions: text(data.achievementConditions)!, exclusionConditions: text(data.exclusionConditions),
        effectiveAt: date(data.effectiveAt)!, expiresAt: date(data.expiresAt), notes: text(data.notes),
        version: Number(data.version ?? 1), isActive: bool(data.isActive)
      } });
      return;
    case "JOB_DEMAND":
      await tx.jobDemand.update({ where: { id: entityId }, data: {
        projectId: text(data.projectId)!, title: text(data.title)!, requiredCount: Number(data.requiredCount),
        requirements: text(data.requirements)!, salary: text(data.salary)!, workTime: text(data.workTime)!,
        workLocation: text(data.workLocation)!, deadline: date(data.deadline)!, status: data.status as never,
        supplierPolicyId: text(data.supplierPolicyId), referralPolicyId: text(data.referralPolicyId),
        notes: text(data.notes), createdById: text(data.createdById)
      } });
      return;
    case "SALARY_SLIP":
      await tx.salarySlip.update({ where: { id: entityId }, data: {
        personId: text(data.personId)!, batchId: text(data.batchId)!, salaryMonth: text(data.salaryMonth)!,
        grossPay: amount(data.grossPay), netPay: amount(data.netPay), hourlyPay: amount(data.hourlyPay),
        overtimePay: amount(data.overtimePay), allowance: amount(data.allowance), referralReward: amount(data.referralReward),
        socialSecurityDeduction: amount(data.socialSecurityDeduction), otherDeduction: amount(data.otherDeduction),
        notes: text(data.notes), status: data.status as never, publishedAt: date(data.publishedAt), withdrawnAt: date(data.withdrawnAt)
      } });
      return;
    case "INTERNAL_EMPLOYEE":
      await tx.internalEmployee.update({ where: { id: entityId }, data: {
        employeeNo: text(data.employeeNo)!, sourceEmployeeNo: text(data.sourceEmployeeNo), name: text(data.name)!,
        phone: text(data.phone)!, idCard: text(data.idCard)!, email: text(data.email), bankAccount: text(data.bankAccount),
        legalEntityId: text(data.legalEntityId), organizationUnitId: text(data.organizationUnitId), positionId: text(data.positionId),
        jobGradeId: text(data.jobGradeId), status: data.status as never, onboardDate: date(data.onboardDate)!,
        offboardDate: date(data.offboardDate), offboardReason: text(data.offboardReason), version: Number(data.version ?? 1)
      } });
      return;
    case "PERSON":
      await tx.person.update({ where: { id: entityId }, data: {
        name: text(data.name)!, idCard: text(data.idCard)!, phone: text(data.phone)!, gender: text(data.gender),
        age: data.age === null || data.age === undefined ? null : Number(data.age), ethnicity: text(data.ethnicity), origin: text(data.origin),
        projectId: text(data.projectId)!, jobTitle: text(data.jobTitle)!, status: data.status as never,
        interviewStatus: data.interviewStatus as never, interviewDate: date(data.interviewDate), supplierId: text(data.supplierId),
        recommenderUserId: text(data.recommenderUserId), recommenderName: text(data.recommenderName),
        emergencyContactName: text(data.emergencyContactName), emergencyContactPhone: text(data.emergencyContactPhone),
        emergencyContactRelation: text(data.emergencyContactRelation), onboardDate: date(data.onboardDate), offboardDate: date(data.offboardDate),
        offboardReason: text(data.offboardReason), employeeNo: text(data.employeeNo), insuranceTypes: (data.insuranceTypes ?? []) as never,
        supplierPolicyId: text(data.supplierPolicyId), supplierPolicySnapshot: data.supplierPolicySnapshot as never,
        notes: text(data.notes)
      } });
      return;
    default:
      throw new Error(`暂不支持撤销的迁移目标：${targetEntity}`);
  }
}
