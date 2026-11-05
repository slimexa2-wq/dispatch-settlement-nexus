import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const databaseName = new URL(databaseUrl).pathname.toLowerCase();
if (!databaseName.includes("xiangneng") && !databaseName.includes("demo")) {
  throw new Error(`Refusing demo enrichment for unexpected database: ${databaseName}`);
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const managerNames = ["张伟", "李明", "王芳", "赵强", "陈晨", "刘洋", "周敏", "罗杰"];
const supplierContacts = ["李经理", "王经理", "张经理", "陈经理", "刘经理", "周经理", "赵经理", "罗经理"];

function missing(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  return !text || text === "—" || text === "招聘岗位" || text.includes("待维护") || text.includes("待确认") || text.includes("按项目") || text.includes("来源行") || text.toLowerCase().includes("source row");
}

function profile(text: string) {
  if (/物流|仓储|配送|运输/.test(text)) return {
    type: "物流仓储",
    title: "仓储管理员",
    salary: "4800-6500元/月",
    time: "长白班 08:30-17:30，月休4天",
    requirements: "18-45周岁，初中及以上学历，责任心强，能适应仓储现场作业；有叉车证或仓储经验者优先。",
    duties: "负责物料收发、扫码复核、库存盘点、库位整理和出入库单据核对，执行仓库安全与5S标准。",
    address: "项目所在地现代物流园区",
    description: "为客户提供仓储运营、物料配送、库存管理和现场人员服务，覆盖招聘、培训、排班与在职管理。"
  };
  if (/时代|电池|新能源|锂电|能源/.test(text)) return {
    type: "新能源制造",
    title: "生产操作工",
    salary: "5500-7500元/月",
    time: "两班倒 08:00-20:00，综合排班月休4天",
    requirements: "18-45周岁，身体健康，无色盲色弱，能适应制造业倒班与站立作业，遵守安全生产规范。",
    duties: "负责新能源电池生产线的设备辅助操作、物料投放、外观检查、数据记录和现场5S维护。",
    address: "项目所在地新能源产业园",
    description: "面向新能源制造客户提供生产辅助、质量检测、现场运营与人员全生命周期管理服务。"
  };
  return {
    type: "电子制造",
    title: "电子装配工",
    salary: "5000-6800元/月",
    time: "长白班 08:00-17:30，加班按项目排班执行",
    requirements: "18-45周岁，身体健康，手部灵活，能适应电子装配、检测与包装工作；有制造业经验者优先。",
    duties: "负责电子产品零部件装配、功能测试、外观检验、包装入库和生产记录填写，遵守质量与安全规范。",
    address: "项目所在地电子信息产业园",
    description: "为电子制造客户提供招聘输送、生产辅助、质量检验和现场运营服务，实现人员数据实时联动。"
  };
}

async function main() {
  const [branches, projects, jobs, suppliers] = await Promise.all([
    prisma.branch.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ include: { branch: true }, orderBy: { name: "asc" } }),
    prisma.jobDemand.findMany({ include: { project: true }, orderBy: { createdAt: "asc" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } })
  ]);

  for (const branch of branches) {
    if (missing(branch.name)) {
      await prisma.branch.update({ where: { id: branch.id }, data: { name: `祥能综合业务部${branch.id.slice(0, 4).toUpperCase()}`, remark: "演示环境综合项目归口部门" } });
    } else if (missing(branch.remark)) {
      await prisma.branch.update({ where: { id: branch.id }, data: { remark: `${branch.name}下属项目、人员与招聘业务统一管理` } });
    }
  }

  for (const [index, project] of projects.entries()) {
    const p = profile(`${project.name} ${project.businessType ?? ""}`);
    const suffix = String(8800000 + index).slice(-7);
    await prisma.project.update({ where: { id: project.id }, data: {
      businessType: missing(project.businessType) ? p.type : project.businessType,
      status: project.status && project.status !== "PENDING_CONFIRMATION" ? project.status : "ACTIVE",
      managerName: missing(project.managerName) ? managerNames[index % managerNames.length] : project.managerName,
      managerPhone: missing(project.managerPhone) ? `0831-${suffix}` : project.managerPhone,
      cooperationStart: project.cooperationStart ?? new Date("2025-01-01T00:00:00+08:00"),
      cooperationEnd: project.cooperationEnd ?? new Date("2027-12-31T00:00:00+08:00"),
      responsibility: project.responsibility && project.responsibility !== "PENDING_CONFIRMATION" ? project.responsibility : "OURS",
      description: missing(project.description) ? `${project.name}：${p.description}` : project.description,
      remark: missing(project.remark) ? `${project.branch.name} · ${p.address}；现场设置招聘接待、岗前培训与员工服务窗口。` : project.remark
    } });
  }

  for (const [index, job] of jobs.entries()) {
    const p = profile(`${job.project.name} ${job.title}`);
    await prisma.jobDemand.update({ where: { id: job.id }, data: {
      title: missing(job.title) ? p.title : job.title,
      requirements: missing(job.requirements) || job.requirements.length < 20 ? p.requirements : job.requirements,
      salary: missing(job.salary) ? p.salary : job.salary,
      workTime: missing(job.workTime) ? p.time : job.workTime,
      workLocation: missing(job.workLocation) || job.workLocation.length < 8 || job.workLocation.endsWith("分公司") ? p.address : job.workLocation,
      deadline: job.deadline < new Date("2026-08-01T00:00:00+08:00") ? new Date("2026-12-31T23:59:59+08:00") : job.deadline,
      status: "RECRUITING",
      notes: missing(job.notes) || (job.notes?.length ?? 0) < 20 ? p.duties : job.notes,
      requiredCount: job.requiredCount > 0 ? job.requiredCount : 20 + (index % 4) * 10
    } });
  }

  for (const [index, supplier] of suppliers.entries()) {
    const phone = `138${String(10000000 + index).slice(-8)}`;
    await prisma.supplier.update({ where: { id: supplier.id }, data: {
      contactName: missing(supplier.contactName) ? supplierContacts[index % supplierContacts.length] : supplier.contactName,
      contactPhone: missing(supplier.contactPhone) ? phone : supplier.contactPhone,
      level: missing(supplier.level) ? (["A", "A", "B", "A", "B"][index % 5] ?? "A") : supplier.level,
      isActive: true
    } });
  }

  const placeholderPeople = await prisma.person.findMany({ where: { OR: [{ jobTitle: { contains: "待维护" } }, { jobTitle: "" }, { jobTitle: "招聘岗位" }] }, select: { id: true, project: { select: { name: true, businessType: true } } } });
  for (const person of placeholderPeople) {
    const p = profile(`${person.project.name} ${person.project.businessType ?? ""}`);
    await prisma.person.update({ where: { id: person.id }, data: { jobTitle: p.title } });
  }

  // 演示库中的人员档案需要可完整展示。对历史导入未携带工号的记录生成稳定、唯一的演示工号。
  const employeeNosCompleted = await prisma.$executeRawUnsafe(`
    UPDATE people AS person
    SET employee_no = 'XN' || LPAD(ranked.sequence_no::text, 8, '0')
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS sequence_no
      FROM people
    ) AS ranked
    WHERE person.id = ranked.id
      AND (person.employee_no IS NULL OR BTRIM(person.employee_no) = '' OR person.employee_no LIKE '%待%')
  `);

  console.log(JSON.stringify({ branches: branches.length, projects: projects.length, jobs: jobs.length, suppliers: suppliers.length, peopleCompleted: placeholderPeople.length, employeeNosCompleted }, null, 2));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
