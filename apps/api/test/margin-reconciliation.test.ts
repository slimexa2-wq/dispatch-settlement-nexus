import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateGrossMargin } from "../src/services/margin-reconciliation.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

describe("calculateGrossMargin", () => {
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      salarySlip: {
        aggregate: vi.fn(),
      },
      portalSettlementItem: {
        aggregate: vi.fn(),
      },
    };
  });

  it("should return correct margin when all values are zero", async () => {
    prismaMock.salarySlip.aggregate.mockResolvedValue({ _sum: { netPay: null, referralReward: null } });
    prismaMock.portalSettlementItem.aggregate.mockResolvedValue({ _sum: { dueAmount: null } });

    const result = await calculateGrossMargin(prismaMock as PrismaClient, "project-1", "2024-01", 0);

    expect(result).toEqual({
      projectId: "project-1",
      month: "2024-01",
      customerBilledAmount: 0,
      workerNetPay: 0,
      supplierCommission: 0,
      internalSelfRecruitedCommission: 0,
      netMargin: 0,
    });
  });

  it("should calculate correct margin with provided values", async () => {
    prismaMock.salarySlip.aggregate.mockResolvedValue({
      _sum: {
        netPay: { toNumber: () => 5000 },
        referralReward: { toNumber: () => 200 },
      },
    });
    prismaMock.portalSettlementItem.aggregate.mockResolvedValue({
      _sum: {
        dueAmount: { toNumber: () => 1500 },
      },
    });

    // 10000 - 5000 - 1500 - 200 = 3300
    const result = await calculateGrossMargin(prismaMock as PrismaClient, "project-2", "2024-02", 10000);

    expect(result).toEqual({
      projectId: "project-2",
      month: "2024-02",
      customerBilledAmount: 10000,
      workerNetPay: 5000,
      supplierCommission: 1500,
      internalSelfRecruitedCommission: 200,
      netMargin: 3300,
    });
  });
});
