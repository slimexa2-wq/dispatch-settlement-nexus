import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReimbursementsPage } from "./ReimbursementsPage";

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiUpload = vi.fn();

vi.mock("../lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
    patch: vi.fn(),
    upload: (...args: unknown[]) => apiUpload(...args),
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
  organizationUnit: { id: "org-1", name: "宜宾分公司" },
  status: "DEPARTMENT_PREPARING",
  totalPaymentCents: 2_800_000,
  approvedAmountCents: null,
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

const departmentSummary = {
  key: "org-1:2026-07",
  period: "2026-07",
  organizationUnitId: "org-1",
  organizationUnitName: "宜宾分公司",
  batchCount: 1,
  applicantCount: 1,
  totalPaymentCents: 2_800_000,
  totalApprovedAmountCents: 0,
  totalInvoiceCents: 2_820_000,
  openIssueCount: 0,
  readyForFinance: false,
  statusCounts: { DEPARTMENT_PREPARING: 1 },
  batchIds: ["batch-1"],
  categorySummaries: [{ category: "差旅费", lineCount: 1, totalPaymentCents: 2_800_000, totalInvoiceCents: 2_820_000 }],
  applicantSummaries: [{ applicantUserId: "user-1", applicantName: "张伟", batchCount: 1, totalPaymentCents: 2_800_000, totalApprovedAmountCents: 0, totalInvoiceCents: 2_820_000 }],
  detailRows: [{ batchId: "batch-1", code: "BX-202607-0001", lineId: "line-1", sequence: 1, expenseDate: "2026-07-18", applicantUserId: "user-1", applicantName: "张伟", category: "差旅费", description: "宜宾至成都项目巡检", paymentCents: 2_800_000, invoiceCents: 2_820_000 }]
};

const paymentRosterRow = {
  batchId: "batch-1",
  code: "BX-202607-0001",
  organizationUnitId: "org-1",
  organizationUnitName: "宜宾分公司",
  applicantUserId: "user-1",
  applicantName: "张伟",
  payeeAccount: "6222021234567890",
  payeeBank: "中国工商银行",
  approvedAmountCents: 2_700_000,
  paymentStatus: "PENDING",
  paidAmountCents: null,
  paidAt: null,
  paymentReference: null
};

describe("ReimbursementsPage", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiUpload.mockReset();
    apiGet.mockImplementation((path: string) => {
      if (path === "/organization/options") {
        return Promise.resolve({
          organizationUnits: [{ id: "org-1", name: "宜宾分公司", type: "DEPARTMENT" }],
          legalEntities: [],
          positions: [],
          jobGrades: []
        });
      }
      if (path === "/reimbursements/department-summaries") return Promise.resolve([departmentSummary]);
      if (path === "/reimbursements/payment-roster") return Promise.resolve([paymentRosterRow]);
      if (path === "/reimbursements/batch-1") return Promise.resolve(detail);
      return Promise.resolve({
        items: [detail],
        pagination: { page: 1, pageSize: 20, total: 1 }
      });
    });
  });

  it("管理岗位默认进入部门汇总审核并展示真实部门聚合", async () => {
    render(<App><ReimbursementsPage /></App>);

    expect(await screen.findByText("部门报销汇总审核")).toBeInTheDocument();
    expect(await screen.findByText("宜宾分公司")).toBeInTheDocument();
    expect(screen.getByText("1 人")).toBeInTheDocument();
    expect(screen.getByText("确认部门汇总并提交负责人")).toBeInTheDocument();
  });

  it("付款工作区直接展示报销人、真实账户和审核金额", async () => {
    render(<App><ReimbursementsPage /></App>);

    fireEvent.click(await screen.findByRole("tab", { name: "报销人付款名单" }));
    expect(await screen.findByText("报销人与审核金额付款名单")).toBeInTheDocument();
    expect(screen.getByText("6222021234567890")).toBeInTheDocument();
    expect(screen.getByText("¥27,000.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /导出付款名单/ })).toBeInTheDocument();
  });

  it("桌面端展示完整金额、七阶段流程并打开明细抽屉", async () => {
    render(<App><ReimbursementsPage /></App>);

    expect(await screen.findByText("报销业务闭环")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "报销明细" }));
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

  it("待付款报销必须先上传并选择整单最终付款凭证", async () => {
    const pendingPayment = { ...detail, status: "PENDING_PAYMENT", attachments: [] };
    apiGet.mockImplementation((path: string) => {
      if (path === "/organization/options") {
        return Promise.resolve({
          organizationUnits: [{ id: "org-1", name: "宜宾分公司", type: "DEPARTMENT" }],
          legalEntities: [],
          positions: [],
          jobGrades: []
        });
      }
      if (path === "/reimbursements/department-summaries") return Promise.resolve([departmentSummary]);
      if (path === "/reimbursements/payment-roster") return Promise.resolve([paymentRosterRow]);
      if (path === "/reimbursements/batch-1") return Promise.resolve(pendingPayment);
      return Promise.resolve({
        items: [pendingPayment],
        pagination: { page: 1, pageSize: 20, total: 1 }
      });
    });

    render(<App><ReimbursementsPage /></App>);
    fireEvent.click(await screen.findByRole("tab", { name: "报销明细" }));
    fireEvent.click(await screen.findByRole("button", { name: "查看与处理" }));
    fireEvent.click(await screen.findByRole("button", { name: "登记打款" }));

    expect(await screen.findByRole("button", { name: "上传最终付款凭证" })).toBeInTheDocument();
    expect(screen.getByText("最终付款凭证必须是整单级附件，不能使用某条费用明细中的原始付款截图。")).toBeInTheDocument();
  }, 15_000);

});
