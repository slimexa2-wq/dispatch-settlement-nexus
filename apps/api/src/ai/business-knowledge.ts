import { UserRole, type SessionUser } from "@xiangneng/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { personWhere, projectWhere } from "../data-scope.js";

export type KnowledgeRecord = {
  type: "system" | "project" | "job" | "supplier";
  title: string;
  fields: Record<string, string | number | boolean | null>;
};

export type BusinessKnowledgeResult = {
  answer: string;
  records: KnowledgeRecord[];
  methodology: string;
  updated_at: string;
};

const asks = (message: string, words: string[]) => words.some((word) => message.includes(word));

function projectStatusLabel(status: string | null): string {
  return ({ ACTIVE: "进行中", PAUSED: "已暂停", CLOSED: "已结束" } as Record<string, string>)[status ?? ""] ?? "进行中";
}

function jobStatusLabel(status: string): string {
  return ({ RECRUITING: "招聘中", PAUSED: "已暂停", CLOSED: "已截止" } as Record<string, string>)[status] ?? status;
}

function matchingProjectIds(message: string, projects: Array<{ id: string; name: string }>): string[] {
  const exact = projects.filter((project) => message.includes(project.name));
  if (exact.length) return exact.map((project) => project.id);
  const tokens = message.split(/[\s，。；、？！,.!?：:（）()]+/).filter((token) => token.length >= 3);
  return projects
    .map((project) => ({ project, score: tokens.reduce((score, token) => score + (project.name.includes(token) || token.includes(project.name) ? token.length : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.project.id);
}

function deterministicAnswer(records: KnowledgeRecord[]): string {
  const projects = records.filter((item) => item.type === "project");
  const jobs = records.filter((item) => item.type === "job");
  const suppliers = records.filter((item) => item.type === "supplier");
  const overview = records.find((item) => item.type === "system");
  const parts: string[] = [];
  if (overview) parts.push(`当前权限范围：${Object.entries(overview.fields).map(([key, value]) => `${key}${value}`).join("，")}。`);
  if (projects.length) parts.push(`项目：${projects.map((item) => `${item.title}（负责人${item.fields["负责人"] ?? "未设置"}，电话${item.fields["联系电话"] ?? "未设置"}）`).join("；")}。`);
  if (jobs.length) parts.push(`岗位：${jobs.map((item) => `${item.fields["项目"]}的${item.title}，薪资${item.fields["薪资"]}，需求${item.fields["需求人数"]}人，状态${item.fields["招聘状态"]}`).join("；")}。`);
  if (suppliers.length) parts.push(`供应商：${suppliers.map((item) => `${item.title}（联系人${item.fields["联系人"]}，电话${item.fields["联系电话"]}，等级${item.fields["合作等级"]}）`).join("；")}。`);
  return parts.join("\n") || "当前权限范围内没有找到与问题匹配的业务记录。";
}

export async function queryBusinessKnowledge(db: PrismaClient, user: SessionUser, message: string): Promise<BusinessKnowledgeResult | null> {
  const normalized = message.trim();
  const wantsOverview = asks(normalized, ["系统", "总览", "多少项目", "多少人员", "多少岗位", "数据概况"]);
  const wantsProject = asks(normalized, ["项目", "负责人", "地址", "在哪里", "介绍"]);
  const wantsJobs = asks(normalized, ["岗位", "招聘", "工作内容", "职责", "要求", "薪资", "工作时间", "缺口"]);
  const wantsSuppliers = asks(normalized, ["供应商", "合作方", "联系人", "联系电话"]);
  if (!wantsOverview && !wantsProject && !wantsJobs && !wantsSuppliers) return null;

  const projects = await db.project.findMany({
    where: projectWhere(user),
    select: {
      id: true, name: true, businessType: true, status: true, managerName: true, managerPhone: true,
      description: true, remark: true, branch: { select: { name: true } }
    },
    orderBy: { name: "asc" },
    take: 500
  });
  const matchedIds = matchingProjectIds(normalized, projects);
  const selectedProjects = matchedIds.length ? projects.filter((project) => matchedIds.includes(project.id)) : wantsProject && projects.length <= 20 ? projects : [];
  const records: KnowledgeRecord[] = [];

  if (wantsOverview) {
    const [people, jobs, suppliers] = await Promise.all([
      db.person.count({ where: personWhere(user) }),
      db.jobDemand.count({ where: { project: projectWhere(user) } }),
      user.role === UserRole.SUPPLIER
        ? db.supplier.count({ where: { id: user.supplierId ?? "00000000-0000-0000-0000-000000000000" } })
        : db.supplier.count({ where: { projectLinks: { some: { project: projectWhere(user) } } } })
    ]);
    records.push({ type: "system", title: "权限范围数据总览", fields: { "项目数": projects.length, "人员数": people, "岗位数": jobs, "供应商数": suppliers } });
  }

  if (wantsProject || matchedIds.length) {
    for (const project of (selectedProjects.length ? selectedProjects : projects.slice(0, wantsProject ? 12 : 0))) {
      records.push({
        type: "project",
        title: project.name,
        fields: {
          "分公司": project.branch.name,
          "业务类型": project.businessType ?? "综合用工服务",
          "项目状态": projectStatusLabel(project.status),
          "负责人": project.managerName ?? "项目运营负责人",
          "联系电话": project.managerPhone ?? "0831-8881234",
          "项目介绍": project.description ?? project.remark ?? "提供人员招聘、入职、在职与离职全流程服务"
        }
      });
    }
  }

  if (wantsJobs) {
    const jobConditions: Prisma.JobDemandWhereInput[] = [
      { project: projectWhere(user) },
      matchedIds.length ? { projectId: { in: matchedIds } } : {}
    ];
    const jobs = await db.jobDemand.findMany({
      where: { AND: jobConditions },
      select: {
        title: true, requiredCount: true, requirements: true, salary: true, workTime: true, workLocation: true,
        deadline: true, status: true, notes: true,
        project: { select: { name: true, managerName: true, managerPhone: true } }
      },
      orderBy: [{ status: "asc" }, { deadline: "asc" }],
      take: matchedIds.length ? 20 : 12
    });
    for (const job of jobs) {
      records.push({
        type: "job",
        title: job.title,
        fields: {
          "项目": job.project.name,
          "需求人数": job.requiredCount,
          "薪资": job.salary,
          "工作时间": job.workTime,
          "工作地点": job.workLocation,
          "岗位职责": job.notes ?? job.requirements,
          "岗位要求": job.requirements,
          "截止日期": job.deadline.toISOString().slice(0, 10),
          "招聘状态": jobStatusLabel(job.status),
          "负责人": job.project.managerName ?? "项目运营负责人",
          "联系电话": job.project.managerPhone ?? "0831-8881234"
        }
      });
    }
  }

  if (wantsSuppliers) {
    const suppliers = await db.supplier.findMany({
      where: user.role === UserRole.SUPPLIER
        ? { id: user.supplierId ?? "00000000-0000-0000-0000-000000000000" }
        : { projectLinks: { some: { project: matchedIds.length ? { id: { in: matchedIds } } : projectWhere(user) } } },
      select: { name: true, contactName: true, contactPhone: true, level: true, isActive: true, _count: { select: { people: true, projectLinks: true } } },
      orderBy: { name: "asc" },
      take: 20
    });
    for (const supplier of suppliers) {
      records.push({ type: "supplier", title: supplier.name, fields: {
        "联系人": supplier.contactName ?? "供应商业务经理",
        "联系电话": supplier.contactPhone ?? "0831-8881234",
        "合作等级": supplier.level ?? "A",
        "合作状态": supplier.isActive ? "合作中" : "已停用",
        "合作项目数": supplier._count.projectLinks,
        "输送人员数": supplier._count.people
      } });
    }
  }

  if (!records.length) return null;
  return {
    answer: deterministicAnswer(records),
    records,
    methodology: "仅检索当前登录用户后端权限范围内的项目、岗位、供应商和人员统计；模型不连接数据库，也不生成查询条件。",
    updated_at: new Date().toISOString()
  };
}
