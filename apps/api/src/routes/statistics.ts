import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EmploymentStatus, InterviewStatus, Permission, UserRole } from "@xiangneng/shared";
import { andWhere, personWhere, projectWhere } from "../data-scope.js";
import { chinaDayBounds, chinaMonthBounds, lastChinaDays } from "../dates.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { personAnomalyValues, personAnomalyWhere, personMetricValues, personMetricWhere } from "../statistics-scope.js";
import type { Prisma } from "../generated/prisma/client.js";
import { csvCell } from "../services/spreadsheet-safety.js";

const drilldownSchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  metric: z.enum(personMetricValues),
  projectId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional()
  ,from: z.coerce.date().optional()
  ,to: z.coerce.date().optional()
});

const overviewQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

function filteredMetricWhere(metric: (typeof personMetricValues)[number], from?: Date, to?: Date): Prisma.PersonWhereInput {
  if (!from && !to) return personMetricWhere(metric);
  const range = { gte: from, lt: to };
  switch (metric) {
    case "todayInterview":
    case "interviewAll":
      return { interviewDate: range };
    case "interviewPassed":
      return { interviewStatus: InterviewStatus.PASSED, interviewDate: range };
    case "todayOnboard":
    case "monthOnboard":
      return { onboardDate: range };
    case "todayOffboard":
    case "monthOffboard":
      return { offboardDate: range };
    case "active":
      return { status: EmploymentStatus.ACTIVE };
  }
}

export async function statisticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/statistics/overview", {
    preHandler: [app.authenticate, app.requirePermission(Permission.DASHBOARD_READ)]
  }, async (request) => {
    const user = getSession(request);
    const query = overviewQuerySchema.parse(request.query);
    const rawFrom = query.dateFrom ?? query.from;
    const rawTo = query.dateTo ?? query.to;
    const from = rawFrom ? chinaDayBounds(rawFrom).start : undefined;
    const to = rawTo ? chinaDayBounds(rawTo).end : undefined;
    const baseScope: Prisma.PersonWhereInput = andWhere<Prisma.PersonWhereInput>(personWhere(user), {
      projectId: query.projectId,
      project: query.branchId ? { branchId: query.branchId } : undefined
    });
    const projectScope: Prisma.ProjectWhereInput = andWhere<Prisma.ProjectWhereInput>(projectWhere(user), {
      id: query.projectId,
      branchId: query.branchId
    });
    const day = chinaDayBounds();
    const month = chinaMonthBounds();
    const days = lastChinaDays(7);
    const [todayInterview, interviewPassed, active, todayOnboard, todayOffboard, monthOffboard, jobs, statusRows, pendingArrival, pendingOnboard, overdueJobs] = await Promise.all([
      app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { interviewDate: from || to ? { gte: from, lt: to } : { gte: day.start, lt: day.end } }) }),
      app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { interviewStatus: InterviewStatus.PASSED, interviewDate: from || to ? { gte: from, lt: to } : undefined }) }),
      app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { status: EmploymentStatus.ACTIVE }) }),
      app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { onboardDate: from || to ? { gte: from, lt: to } : { gte: day.start, lt: day.end } }) }),
      app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { offboardDate: from || to ? { gte: from, lt: to } : { gte: day.start, lt: day.end } }) }),
      app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { offboardDate: from || to ? { gte: from, lt: to } : { gte: month.start, lt: month.end } }) }),
      app.prisma.jobDemand.findMany({
        where: { project: projectScope, status: "RECRUITING" },
        select: { id: true, requiredCount: true }
      }),
      app.prisma.person.findMany({ where: baseScope, select: { status: true } }),
      app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { interviewDate: { gte: day.start, lt: day.end }, interviewStatus: InterviewStatus.PENDING_ARRIVAL }) }),
      app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { status: EmploymentStatus.PENDING_ONBOARD }) }),
      app.prisma.jobDemand.count({ where: { project: projectScope, status: "RECRUITING", deadline: { lt: new Date() } } })
    ]);
    const trend = await Promise.all(days.map(async (range) => ({
      date: range.label,
      onboarded: await app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { onboardDate: { gte: range.start, lt: range.end } }) }),
      offboarded: await app.prisma.person.count({ where: andWhere<Prisma.PersonWhereInput>(baseScope, { offboardDate: { gte: range.start, lt: range.end } }) })
    })));
    const activePeople = await app.prisma.person.findMany({
      where: andWhere<Prisma.PersonWhereInput>(baseScope, { status: EmploymentStatus.ACTIVE }),
      select: { projectId: true, supplierId: true, project: { select: { name: true, branch: { select: { id: true, name: true } } } }, supplier: { select: { name: true } } }
    });
    const branchMap = new Map<string, { branchId: string; name: string; count: number }>();
    const projectMap = new Map<string, { projectId: string; name: string; count: number }>();
    const supplierMap = new Map<string, { supplierId: string; name: string; count: number }>();
    for (const person of activePeople) {
      const branch = person.project.branch;
      const branchItem = branchMap.get(branch.id) ?? { branchId: branch.id, name: branch.name, count: 0 };
      branchItem.count += 1;
      branchMap.set(branch.id, branchItem);
      const projectItem = projectMap.get(person.projectId) ?? { projectId: person.projectId, name: person.project.name, count: 0 };
      projectItem.count += 1;
      projectMap.set(person.projectId, projectItem);
      if (person.supplierId && person.supplier) {
        const supplierItem = supplierMap.get(person.supplierId) ?? { supplierId: person.supplierId, name: person.supplier.name, count: 0 };
        supplierItem.count += 1;
        supplierMap.set(person.supplierId, supplierItem);
      }
    }
    const recruitment = await Promise.all(jobs.map(async (job) => ({
      required: job.requiredCount,
      rows: await app.prisma.application.findMany({
        where: { jobDemandId: job.id, appliedAt: from || to ? { gte: from, lt: to } : undefined },
        select: { personId: true, onboardDate: true },
        orderBy: { appliedAt: "desc" }
      })
    })));
    const required = recruitment.reduce((sum, item) => sum + item.required, 0);
    const applicationCount = recruitment.reduce((sum, item) => sum + new Set(item.rows.map((row) => row.personId)).size, 0);
    const recruited = recruitment.reduce((sum, item) => {
      const latest = new Map<string, Date | null>();
      for (const row of item.rows) if (!latest.has(row.personId)) latest.set(row.personId, row.onboardDate);
      return sum + [...latest.values()].filter((date) => date !== null).length;
    }, 0);
    const statusCounts = new Map<string, number>();
    for (const row of statusRows) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
    const statusDistribution = [...statusCounts].map(([status, count]) => ({ status, name: status, count, value: count }));
    const anomalyLabels: Record<(typeof personAnomalyValues)[number], string> = {
      "active-without-onboard": "在职人员缺少入职日期",
      "left-without-offboard": "离职人员缺少离职日期",
      "non-left-with-offboard": "非离职状态存在离职日期",
      "onboarded-state-mismatch": "已有入职日期但状态未转在职"
    };
    const anomalies = (await Promise.all(personAnomalyValues.map(async (id) => {
      const rows = await app.prisma.person.findMany({
        where: andWhere<Prisma.PersonWhereInput>(baseScope, personAnomalyWhere(id)),
        select: { id: true },
        take: 10000
      });
      return rows.length ? {
        id,
        type: anomalyLabels[id],
        scopeName: query.projectId ? "当前项目" : query.branchId ? "当前分子公司" : "当前筛选范围",
        expected: 0,
        actual: rows.length,
        difference: rows.length,
        personIds: rows.map((row) => row.id)
      } : null;
    }))).filter((item): item is NonNullable<typeof item> => item !== null);
    const pendingItems = [
      { id: "pending-arrival", key: "pending-arrival", title: "今日待到场面试", count: pendingArrival, level: "warning", severity: "warning", metric: "todayInterview", path: "/people?metric=todayInterview" },
      { id: "pending-onboard", key: "pending-onboard", title: "待办理入职", count: pendingOnboard, level: "info", severity: "info", metric: "interviewPassed", path: "/people?metric=interviewPassed" },
      { id: "overdue-jobs", key: "overdue-jobs", title: "已逾期仍招聘中的需求", count: overdueJobs, level: "error", severity: "error", metric: "jobDemand", path: "/recruitment" }
    ].filter((item) => item.count > 0);
    const branchActive = [...branchMap.values()].sort((a, b) => b.count - a.count).map((item) => ({ ...item, value: item.count }));
    const projectTop = [...projectMap.values()].sort((a, b) => b.count - a.count).slice(0, 5).map((item) => ({ ...item, value: item.count }));
    const supplierTop = [...supplierMap.values()].sort((a, b) => b.count - a.count).slice(0, 5).map((item) => ({ ...item, value: item.count }));
    const sevenDayTrend = trend.map((item) => ({ date: item.date, onboard: item.onboarded, offboard: item.offboarded }));
    return success(request, {
      todayInterviews: todayInterview,
      interviewPassed,
      activePeople: active,
      todayOnboard,
      todayOffboard,
      monthOffboard,
      sevenDayTrend,
      branchActive,
      projectTop,
      supplierTop,
      statusDistribution,
      pendingItems,
      anomalies,
      recruitment: {
        requiredCount: required,
        applicationCount,
        onboardCount: recruited,
        remainingCount: Math.max(0, required - recruited),
        required,
        applications: applicationCount,
        onboarded: recruited,
        remainingGap: Math.max(0, required - recruited)
      },
      cards: { todayInterview, interviewPassed, active, todayOnboard, todayOffboard, monthOffboard },
      trend,
      projectTop5: projectTop,
      supplierTop5: supplierTop
    });
  });

  app.get("/statistics/drilldown", {
    preHandler: [app.authenticate, app.requirePermission(Permission.DASHBOARD_READ)]
  }, async (request) => {
    const query = drilldownSchema.parse(request.query);
    const user = getSession(request);
    const { page, pageSize, skip } = parsePagination(query);
    const from = query.from ? chinaDayBounds(query.from).start : undefined;
    const to = query.to ? chinaDayBounds(query.to).end : undefined;
    const where = andWhere(personWhere(user), filteredMetricWhere(query.metric, from, to), {
      projectId: query.projectId,
      project: query.branchId ? { branchId: query.branchId } : undefined,
      supplierId: query.supplierId
    });
    const [items, total] = await app.prisma.$transaction([
      app.prisma.person.findMany({
        where,
        include: { project: { include: { branch: true } }, supplier: { select: { id: true, name: true } } },
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize
      }),
      app.prisma.person.count({ where })
    ]);
    const visibleItems = user.role === UserRole.SUPPLIER
      ? items.map(({ idCard: _idCard, emergencyContactName: _ecn, emergencyContactPhone: _ecp, emergencyContactRelation: _ecr, insuranceTypes: _insurance, notes: _notes, ...safe }) => safe)
      : items;
    return success(request, { metric: query.metric, items: visibleItems, pagination: paginationMeta(page, pageSize, total) });
  });

  app.get("/statistics/export", {
    preHandler: [app.authenticate, app.requirePermission(Permission.DASHBOARD_READ)]
  }, async (request, reply) => {
    const query = drilldownSchema.parse({ metric: "active", ...(request.query as Record<string, unknown>) });
    const user = getSession(request);
    const from = query.from ? chinaDayBounds(query.from).start : undefined;
    const to = query.to ? chinaDayBounds(query.to).end : undefined;
    const where = andWhere(personWhere(user), filteredMetricWhere(query.metric, from, to), {
      projectId: query.projectId,
      project: query.branchId ? { branchId: query.branchId } : undefined,
      supplierId: query.supplierId
    });
    const items = await app.prisma.person.findMany({
      where,
      include: { project: { include: { branch: true } }, supplier: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10000
    });
    const rows = [
      ["姓名", "分子公司", "项目", "岗位", "状态", "面试状态", "面试日期", "入职日期", "离职日期", "供应商"],
      ...items.map((person) => [
        person.name,
        person.project.branch.name,
        person.project.name,
        person.jobTitle,
        person.status,
        person.interviewStatus,
        person.interviewDate?.toISOString().slice(0, 10),
        person.onboardDate?.toISOString().slice(0, 10),
        person.offboardDate?.toISOString().slice(0, 10),
        person.supplier?.name
      ])
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    return reply.type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent("统计下钻.csv")}`).send(csv);
  });
}
