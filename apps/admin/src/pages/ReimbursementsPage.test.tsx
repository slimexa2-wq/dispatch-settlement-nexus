import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  afterEach(cleanup);
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    apiGet.mockReset();
    apiPost.mockReset();
    apiUpload.mockReset();
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

  it("创建成功后浏览器拒绝草稿清理仍关闭表单并显示新单", async () => {
    apiPost.mockResolvedValue(detail);
    render(<App><ReimbursementsPage /></App>);
    fireEvent.click(await screen.findByRole("button", { name: /新建报销单/ }));
    const dialog = screen.getByText("新建报销单", { selector: ".ant-modal-title" }).closest("[role=dialog]")!;
    fireEvent.change(screen.getByLabelText("报销标题"), { target: { value: "合成费用" } });
    fireEvent.change(screen.getByLabelText("付款金额（元）"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("发票金额（元）"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("费用说明"), { target: { value: "实际费用" } });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    await act(async () => { fireEvent.submit(dialog.querySelector("form")!); });
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(dialog.closest<HTMLElement>(".ant-modal-wrap")!.style.display).toBe("none"));
    expect(screen.getByText(`${detail.code} · ${detail.title}`)).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledTimes(1);
  }, 15_000);

  it("关闭付款窗口后完成的旧上传不会替换另一单的详情或付款凭证", async () => {
    const first = { ...detail, id: "batch-A", code: "BX-A", title: "合成单A", status: "PENDING_PAYMENT", totalPaymentCents: 10000 };
    const second = { ...detail, id: "batch-B", code: "BX-B", title: "合成单B", status: "PENDING_PAYMENT", totalPaymentCents: 20000 };
    const defaultGet = apiGet.getMockImplementation()!;
    apiGet.mockImplementation((path: string) => {
      if (path === "/reimbursements") return Promise.resolve({ items: [first, second], pagination: { page: 1, pageSize: 20, total: 2 } });
      if (path === "/reimbursements/batch-A") return Promise.resolve(first);
      if (path === "/reimbursements/batch-B") return Promise.resolve(second);
      return defaultGet(path);
    });
    let finishUpload!: (value: unknown) => void;
    apiUpload.mockImplementation(() => new Promise(resolve => { finishUpload = resolve; }));
    render(<App><ReimbursementsPage /></App>);
    const firstRow = (await screen.findByText("合成单A")).closest("tr")!;
    fireEvent.click(within(firstRow).getByRole("button", { name: "查看与处理" }));
    const firstHeader = (await screen.findByText("BX-A · 合成单A")).closest<HTMLElement>(".ant-drawer-header")!;
    fireEvent.click(within(firstHeader).getByRole("button", { name: /登记打款/ }));
    const payment = screen.getByText("登记打款", { selector: ".ant-modal-title" }).closest("[role=dialog]")!;
    fireEvent.change(payment.querySelector("input[type=file]")!, { target: { files: [new File(["synthetic"], "A-final.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(apiUpload).toHaveBeenCalledTimes(1));
    fireEvent.click(payment.querySelector(".ant-modal-close")!);
    await waitFor(() => expect(payment.closest<HTMLElement>(".ant-modal-wrap")!.style.display).toBe("none"));
    fireEvent.click(firstHeader.querySelector(".ant-drawer-close")!);
    const secondRow = screen.getByText("合成单B").closest("tr")!;
    fireEvent.click(within(secondRow).getByRole("button", { name: "查看与处理" }));
    const secondHeader = (await screen.findByText("BX-B · 合成单B")).closest<HTMLElement>(".ant-drawer-header")!;
    fireEvent.click(within(secondHeader).getByRole("button", { name: /登记打款/ }));
    await act(async () => { finishUpload({ id: "proof-A", originalName: "A-final.pdf" }); });
    expect(screen.getByText("BX-B · 合成单B")).toBeInTheDocument();
    expect(screen.queryByText("A-final.pdf")).not.toBeInTheDocument();
    expect(screen.getByLabelText("银行流水号")).toBeEnabled();
  }, 30_000);

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
