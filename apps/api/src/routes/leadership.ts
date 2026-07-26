import type { FastifyInstance } from "fastify";
import {
  Permission
} from "@xiangneng/shared";
import {
  andWhere,
  internalEmployeeWhere,
  personWhere,
  projectWhere,
  reimbursementWhere
} from "../data-scope.js";
import { success } from "../http.js";
import { getSession } from "../plugins/auth.js";

function monthRange(now = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  };
}

export async function leadershipRoutes(app: FastifyInstance): Promise<void> {
  app.get("/leadership/dashboard", {
    preHandler: [
      app.authenticate,
      app.requirePermission(Permission.LEADERSHIP_DASHBOARD_READ)
    ]
  }, async (request) => {
    const user = getSession(request);
    const { start, end } = monthRange();
    const projectScope = projectWhere(user);
    const peopleScope = personWhere(user);
    const internalScope = internalEmployeeWhere(user);
    const reimbursementScope = reimbursementWhere(user);

    const [
      outsourcedActive,
      internalActive,
      onboardMonth,
      offboardMonth,
      activeProjects,
      activeSuppliers,
      demandAggregate,
      applicationCount,
      reimbursementAggregate,
      reimbursementByStatus,
      openIssues
    ] = await Promise.all([
      app.prisma.person.count({
        where: andWhere(peopleScope, { status: "ACTIVE" })
      }),
      app.prisma.internalEmployee.count({
        where: andWhere(internalScope, { status: "ACTIVE" })
      }),
      app.prisma.person.count({
        where: andWhere(peopleScope, {
          onboardDate: { gte: start, lt: end }
        })
      }),
      app.prisma.person.count({
        where: andWhere(peopleScope, {
          offboardDate: { gte: start, lt: end }
        })
      }),
      app.prisma.project.count({
        where: andWhere(projectScope, { status: "ACTIVE" })
      }),
      app.prisma.supplier.count({
        where: {
          isActive: true,
          projectLinks: { some: { project: projectScope } }
        }
      }),
      app.prisma.jobDemand.aggregate({
        where: {
          status: "RECRUITING",
          project: projectScope
        },
        _count: { _all: true },
        _sum: { requiredCount: true }
      }),
      app.prisma.application.count({
        where: {
          jobDemand: {
            status: "RECRUITING",
            project: projectScope
          }
        }
      }),
      app.prisma.reimbursementBatch.aggregate({
        where: reimbursementScope,
        _count: { _all: true },
        _sum: {
          totalPaymentCents: true,
          totalInvoiceCents: true,
          invoiceExcessCents: true
        }
      }),
      app.prisma.reimbursementBatch.groupBy({
        by: ["status"],
        where: reimbursementScope,
        _count: { _all: true },
        _sum: { totalPaymentCents: true },
        orderBy: { status: "asc" }
      }),
      app.prisma.reimbursementIssue.count({
        where: {
          status: "OPEN",
          batch: reimbursementScope
        }
      })
    ]);

    const requiredCount = demandAggregate._sum.requiredCount ?? 0;
    const recruitmentCompletionRate = requiredCount
      ? Math.min(100, Math.round((applicationCount / requiredCount) * 1000) / 10)
      : 0;
    const paid = reimbursementByStatus.find((item) => item.status === "PAID");
    const paidCount = paid?._count._all ?? 0;
    const totalReimbursementCount =
      reimbursementAggregate._count._all ?? 0;

    return success(request, {
      asOf: new Date().toISOString(),
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        label: `${start.getUTCFullYear()}年${String(start.getUTCMonth() + 1).padStart(2, "0")}月`
      },
      people: {
        outsourcedActive,
        internalActive,
        totalActive: outsourcedActive + internalActive,
        onboardMonth,
        offboardMonth,
        netGrowth: onboardMonth - offboardMonth
      },
      projects: {
        active: activeProjects,
        activeSuppliers
      },
      recruitment: {
        activeDemands: demandAggregate._count._all,
        requiredCount,
        applicationCount,
        remainingCount: Math.max(requiredCount - applicationCount, 0),
        completionRate: recruitmentCompletionRate
      },
      reimbursements: {
        count: totalReimbursementCount,
        totalPaymentCents:
          reimbursementAggregate._sum.totalPaymentCents ?? 0,
        totalInvoiceCents:
          reimbursementAggregate._sum.totalInvoiceCents ?? 0,
        invoiceExcessCents:
          reimbursementAggregate._sum.invoiceExcessCents ?? 0,
        paidCount,
        pendingCount: totalReimbursementCount - paidCount,
        openIssues,
        byStatus: reimbursementByStatus.map((item) => ({
          status: item.status,
          count: item._count._all,
          paymentCents: item._sum.totalPaymentCents ?? 0
        }))
      },
      definitions: [
        "当前在职：截至更新时间，人员状态为在职的外包人员与内部员工合计。",
        "本月入离职：按人员主档入职日期、离职日期落在本自然月统计。",
        "招聘完成率：招聘中岗位的报名人数 ÷ 需求人数，最高显示100%。",
        "报销金额：以报销明细付款金额和发票金额按分汇总；发票金额严格大于付款金额。"
      ]
    });
  });
}
