import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReimbursementsPage } from "./ReimbursementsPage";

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("../lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
    patch: vi.fn(),
    upload: vi.fn(),
    download: vi.fn()
  },
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "操作失败",
  saveBlob: vi.fn()
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    can: () => true,
    user: { id: "user-1", displayName: "演示管理员" }
  })
}));

const detail = {
  id: "batch-1",
  code: "BX-202607-0001",
  title: "宜宾分公司七月差旅报销",
  applicantUserId: "user-1",
  applicant: { id: "user-1", displayName: "张伟" },
  branch: { id: "branch-1", name: "宜宾分公司" },
  organizationUnit: { id: "org-1", name: "运营管理部" },
  status: "DEPARTMENT_PREPARING",
  totalPaymentCents: 2_800_000,
  totalInvoiceCents: 2_820_000,
  invoiceExcessCents: 20_000,
  version: 1,
  createdAt: "2026-07-20T09:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  lines: [{
    id: "line-1",
    sequence: 1,
    expenseDate: "2026-07-18",
    category: "差旅费",
    description: "宜宾至成都项目巡检",
    payeeName: "张伟",
    paymentCents: 2_800_000,
    invoiceCents: 2_820_000,
    attachments: []
  }],
  attachments: [],
  issues: [],
  approvals: [],
  artifacts: [],
  _count: { lines: 1, issues: 0, attachments: 0 }
};

describe("ReimbursementsPage", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockImplementation((path: string) => {
      if (path === "/organization/options") {
        return Promise.resolve({
          branches: [{ id: "branch-1", name: "宜宾分公司" }],
          organizationUnits: [{ id: "org-1", name: "运营管理部", type: "DEPARTMENT" }],
          legalEntities: [],
          positions: [],
          jobGrades: []
        });
      }
      if (path === "/reimbursements/batch-1") return Promise.resolve(detail);
      return Promise.resolve({
        items: [detail],
        pagination: { page: 1, pageSize: 20, total: 1 }
      });
    });
  });

  it("桌面端展示完整金额、七阶段流程并打开明细抽屉", async () => {
    render(<App><ReimbursementsPage /></App>);

    expect(await screen.findByText("报销业务闭环")).toBeInTheDocument();
    expect((await screen.findAllByText("¥28,000.00")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("部门制单中").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "查看与处理" }));

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith("/reimbursements/batch-1")
    );
    expect(await screen.findByText(/付款与发票明细/)).toBeInTheDocument();
    expect(screen.getAllByText("负责人审核中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("财务审核中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已打款").length).toBeGreaterThan(0);
  }, 15_000);
});
