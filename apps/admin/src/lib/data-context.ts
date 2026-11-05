/**
 * 数据上下文构建器：把系统数据格式化为 LLM 可理解的文本
 */
import type { Person, JobDemand, DashboardData } from "../types/domain";

export interface DataContext {
  people: Person[];
  jobs: JobDemand[];
  statistics: DashboardData | null;
  lastUpdated: string;
}

/**
 * 构建数据上下文文本（用于 LLM 系统提示）
 */
export function buildDataContextText(context: DataContext): string {
  const { people, jobs, statistics, lastUpdated } = context;

  // 人员统计
  const activeCount = people.filter((p) => p.employmentStatus === "ACTIVE").length;
  const leftCount = people.filter((p) => p.employmentStatus === "LEFT").length;
  const pendingCount = people.filter((p) => p.employmentStatus === "PENDING_ONBOARD").length;

  // 项目统计
  const projectStats = new Map<string, { total: number; active: number; left: number }>();
  for (const person of people) {
    const project = person.projectName ?? "未分配项目";
    if (!projectStats.has(project)) {
      projectStats.set(project, { total: 0, active: 0, left: 0 });
    }
    const stats = projectStats.get(project)!;
    stats.total += 1;
    if (person.employmentStatus === "ACTIVE") stats.active += 1;
    if (person.employmentStatus === "LEFT") stats.left += 1;
  }

  // 月度入职统计（近6个月）
  const monthlyOnboard = new Map<string, number>();
  for (const person of people) {
    if (!person.onboardDate) continue;
    const date = new Date(person.onboardDate);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthlyOnboard.set(monthKey, (monthlyOnboard.get(monthKey) ?? 0) + 1);
  }

  // 岗位统计
  const jobStats = jobs.map((job) => ({
    title: job.title,
    project: job.projectName ?? "未分配项目",
    required: job.requiredCount,
    applied: job.onboardCount ?? 0,
    remaining: job.remainingCount ?? job.requiredCount - (job.onboardCount ?? 0)
  }));

  // 人员详细信息索引（按姓名排序，包含完整信息）
  const peopleDetails = people
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map((p) => {
      const phone = p.phone ?? "暂无电话";
      const onboard = p.onboardDate ? new Date(p.onboardDate).toLocaleDateString("zh-CN") : "尚未入职";
      const status = p.employmentStatus === "ACTIVE" ? "在职" : p.employmentStatus === "LEFT" ? "离职" : p.employmentStatus === "PENDING_ONBOARD" ? "待入职" : p.employmentStatus ?? "报名中";
      return `${p.name}|${phone}|${onboard}|${status}|${p.projectName ?? "综合招聘项目"}|${p.jobTitle ?? "综合岗位"}`;
    });

  return `
【系统数据概览】（最后更新：${lastUpdated}）

【人员统计】
- 总人数：${people.length} 人
- 在职：${activeCount} 人
- 离职：${leftCount} 人
- 待入职：${pendingCount} 人

【项目统计】
${Array.from(projectStats.entries()).map(([name, stats]) =>
  `- ${name}：共 ${stats.total} 人（在职 ${stats.active}，离职 ${stats.left}）`
).join("\n")}

【近6个月入职统计】
${Array.from(monthlyOnboard.entries()).sort().map(([month, count]) =>
  `- ${month}：${count} 人`
).join("\n")}

【岗位需求】
${jobStats.map((job) =>
  `- ${job.title}（${job.project}）：需求 ${job.required} 人，已报名 ${job.applied} 人，缺口 ${job.remaining} 人`
).join("\n")}

【实时统计】
${statistics ? `
- 今日面试：${statistics.todayInterviews ?? 0} 人
- 当前在职：${statistics.activePeople ?? 0} 人
- 今日离职：${statistics.todayOffboard ?? 0} 人
- 今日入职：${statistics.todayOnboard ?? 0} 人
` : "统计数据暂不可用"}

【人员详细信息索引】（格式：姓名|电话|入职日期|状态|项目|岗位）
${peopleDetails.join("\n")}
`.trim();
}

/**
 * 构建查询上下文（用于特定查询场景）
 */
export function buildQueryContext(context: DataContext, query: string): string {
  const { people, jobs, statistics } = context;

  // 根据查询关键词筛选相关数据
  const keywords = query.toLowerCase().split(/\s+/);
  const relevantPeople = people.filter((p) => {
    const text = `${p.name} ${p.projectName} ${p.jobTitle}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  }).slice(0, 20);

  const relevantJobs = jobs.filter((j) => {
    const text = `${j.title} ${j.projectName}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  }).slice(0, 10);

  return `
【查询相关数据】

【相关人员】
${relevantPeople.length ? relevantPeople.map((p) =>
  `- ${p.name}（${p.projectName ?? "综合招聘项目"} · ${p.jobTitle ?? "综合岗位"} · ${p.employmentStatus ?? "报名中"} · 手机 ${p.phone ?? "暂无电话"}）`
).join("\n") : "无相关人员"}

【相关岗位】
${relevantJobs.length ? relevantJobs.map((j) =>
  `- ${j.title}（${j.projectName ?? "未分配"} · 需求 ${j.requiredCount} 人 · 已报名 ${j.onboardCount ?? 0} 人）`
).join("\n") : "无相关岗位"}

【实时统计】
${statistics ? `
- 今日面试：${statistics.todayInterviews ?? 0} 人
- 当前在职：${statistics.activePeople ?? 0} 人
- 今日离职：${statistics.todayOffboard ?? 0} 人
- 今日入职：${statistics.todayOnboard ?? 0} 人
` : "统计数据暂不可用"}
`.trim();
}

/**
 * 检测数据是否有更新（用于自动同步）
 */
export function hasDataChanged(oldContext: DataContext, newContext: DataContext): boolean {
  return (
    oldContext.people.length !== newContext.people.length ||
    oldContext.jobs.length !== newContext.jobs.length ||
    JSON.stringify(oldContext.statistics) !== JSON.stringify(newContext.statistics)
  );
}
