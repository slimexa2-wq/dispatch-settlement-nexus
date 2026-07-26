import { render, screen } from "@testing-library/react";
import { App } from "antd";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadershipDashboardPage } from "./LeadershipDashboardPage";

const apiGet = vi.fn();

vi.mock("../lib/api", () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "操作失败"
}));

describe("LeadershipDashboardPage", () => {
  beforeEach(() => {
    apiGet.mockResolvedValue({
      asOf: "2026-07-26T12:00:00.000Z",
      period: { start: "2026-07-01", end: "2026-08-01", label: "2026年07月" },
      people: {
        outsourcedActive: 368,
        internalActive: 86,
        totalActive: 454,
        onboardMonth: 36,
        offboardMonth: 14,
        netGrowth: 22
      },
      projects: { active: 12, activeSuppliers: 8 },
      recruitment: {
        activeDemands: 6,
        requiredCount: 112,
        applicationCount: 74,
        remainingCount: 38,
        completionRate: 66.1
      },
      reimbursements: {
        count: 9,
        totalPaymentCents: 32_600_000,
        totalInvoiceCents: 32_980_000,
        invoiceExcessCents: 380_000,
        paidCount: 4,
        pendingCount: 5,
        openIssues: 2,
        byStatus: [
          { status: "PAID", count: 4, paymentCents: 14_600_000 },
          { status: "FINANCE_REVIEWING", count: 2, paymentCents: 8_000_000 }
        ]
      },
      definitions: ["当前在职：按人员状态统计。"]
    });
  });

  it("展示领导所需的跨模块统一口径和下钻入口", async () => {
    render(<MemoryRouter><App><LeadershipDashboardPage /></App></MemoryRouter>);

    expect(await screen.findByText("领导驾驶舱")).toBeInTheDocument();
    expect(await screen.findByText("454")).toBeInTheDocument();
    expect(screen.getByText("净增 +22 人")).toBeInTheDocument();
    expect(screen.getByText("招聘缺口 38 人")).toBeInTheDocument();
    expect(screen.getByText("报销待处理 5 单")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看报销闭环" })).toHaveAttribute("href", "/reimbursements");
  });
});
