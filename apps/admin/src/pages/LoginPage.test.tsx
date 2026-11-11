import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Permission } from "@xiangneng/shared";
import { LoginPage } from "./LoginPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { permissions: [Permission.DASHBOARD_READ] } })
}));

afterEach(cleanup);

describe("登录后的目标恢复", () => {
  it("身份恢复后保留受保护页面及查询参数", async () => {
    render(<MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/reimbursements?status=PENDING_PAYMENT" } }]}><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reimbursements" element={<p>原报销页面</p>} />
      <Route path="/dashboard" element={<p>默认首页</p>} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText("原报销页面")).toBeInTheDocument();
  });

  it("拒绝外部目标，返回允许的首页", async () => {
    render(<MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "//outside.invalid" } }]}><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<p>默认首页</p>} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText("默认首页")).toBeInTheDocument();
  });
});
