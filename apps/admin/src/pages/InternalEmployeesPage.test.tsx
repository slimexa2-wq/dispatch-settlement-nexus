import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InternalEmployeesPage } from "./InternalEmployeesPage";

const apiGet = vi.fn();

vi.mock("../lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  },
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "操作失败"
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ can: () => true })
}));

describe("InternalEmployeesPage", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockImplementation((path: string) => {
      if (path === "/organization/options") {
        return Promise.resolve({
          legalEntities: [{ id: "legal-1", code: "LE-01", name: "祥能一分公司有限公司" }],
          branches: [{ id: "branch-1", name: "祥能一分公司" }],
          organizationUnits: [{ id: "org-1", code: "OU-01-D1", name: "人力资源中心", type: "DEPARTMENT", path: "/group/branch/org" }],
          positions: [{ id: "position-1", code: "POS-01", name: "内部人事" }],
          jobGrades: [{ id: "grade-1", code: "G5", name: "专业岗位", level: 5 }]
        });
      }
      if (path === "/internal-employees/employee-1") {
        return Promise.resolve({
          id: "employee-1",
          employeeNo: "XN-NB-0001",
          name: "张伟",
          phone: "13800001001",
          idCard: "510105199001011234",
          status: "ACTIVE",
          onboardDate: "2025-01-01",
          version: 1,
          branch: { id: "branch-1", name: "祥能一分公司" },
          organizationUnit: { id: "org-1", code: "OU-01-D1", name: "人力资源中心", type: "DEPARTMENT", path: "/group/branch/org" },
          position: { id: "position-1", code: "POS-01", name: "内部人事" },
          employments: [],
          changes: []
        });
      }
      return Promise.resolve({
        items: [{
          id: "employee-1",
          employeeNo: "XN-NB-0001",
          name: "张伟",
          phone: "13800001001",
          idCard: "510105199001011234",
          status: "ACTIVE",
          onboardDate: "2025-01-01",
          version: 1,
          branch: { id: "branch-1", name: "祥能一分公司" },
          organizationUnit: { id: "org-1", code: "OU-01-D1", name: "人力资源中心", type: "DEPARTMENT", path: "/group/branch/org" },
          position: { id: "position-1", code: "POS-01", name: "内部人事" }
        }],
        pagination: { page: 1, pageSize: 20, total: 1 }
      });
    });
  });

  it("展示完整手机号身份证并可打开桌面详情抽屉", async () => {
    render(<App><InternalEmployeesPage /></App>);

    expect(await screen.findByText("内部员工管理")).toBeInTheDocument();
    expect(await screen.findByText("13800001001")).toBeInTheDocument();
    expect(screen.getByText("510105199001011234")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith("/internal-employees/employee-1")
    );
    expect(await screen.findByText("任职与变更记录")).toBeInTheDocument();
  });
});
