import type { PrismaClient } from "../generated/prisma/client.js";
import { Prisma } from "../generated/prisma/client.js";

export interface GrossMarginResult {
  projectId: string;
  month: string;
  customerBilledAmount: number;
  workerNetPay: number;
  supplierCommission: number;
  internalSelfRecruitedCommission: number;
  netMargin: number;
}

export async function calculateGrossMargin(
  prisma: PrismaClient,
  projectId: string,
  month: string,
  customerBilledAmount: number
): Promise<GrossMarginResult> {
  const [salaryResult, settlementResult] = await Promise.all([
    prisma.salarySlip.aggregate({
      where: {
        salaryMonth: month,
        person: {
          projectId: projectId,
        },
      },
      _sum: {
        netPay: true,
        referralReward: true,
      },
    }),
    prisma.portalSettlementItem.aggregate({
      where: {
        settlement: {
          month: month,
        },
        person: {
          projectId: projectId,
        },
      },
      _sum: {
        dueAmount: true,
      },
    }),
  ]);

  const workerNetPay = salaryResult._sum.netPay?.toNumber() ?? 0;
  const internalSelfRecruitedCommission = salaryResult._sum.referralReward?.toNumber() ?? 0;
  const supplierCommission = settlementResult._sum.dueAmount?.toNumber() ?? 0;

  const netMargin =
    customerBilledAmount - workerNetPay - supplierCommission - internalSelfRecruitedCommission;

  return {
    projectId,
    month,
    customerBilledAmount,
    workerNetPay,
    supplierCommission,
    internalSelfRecruitedCommission,
    netMargin,
  };
}
