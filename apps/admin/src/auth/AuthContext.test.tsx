import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Permission, UserRole } from "@xiangneng/shared";
import { AuthProvider, useAuth } from "./AuthContext";
import { DEMO_TOKEN } from "../lib/demo";

function RestoredSession() {
  const { user, initializing, logout } = useAuth();
  return <><span>{initializing ? "恢复中" : `恢复完成：${user?.displayName ?? "未登录"}`}</span><button onClick={logout}>退出</button></>;
}

function Consumer() {
  const { user, login, can } = useAuth();
  return (
    <div>
      <button type="button" onClick={() => void login("admin", "password123")}>登录</button>
      <span>{user?.displayName ?? "未登录"}</span>
      <span>{can(Permission.USER_MANAGE) ? "可管理账号" : "不可管理账号"}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  afterEach(cleanup);
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("解包登录响应、保存 token 并应用权限", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        token: "signed-token",
        user: {
          id: "user-1",
          username: "admin",
          displayName: "系统管理员",
          role: UserRole.SYSTEM_ADMIN,
          branchId: null,
          supplierId: null,
          personId: null,
          projectIds: [],
          permissions: [Permission.USER_MANAGE]
        }
      },
      requestId: "request-1"
    }), { status: 200, headers: { "content-type": "application/json" } })));

    render(<AuthProvider><Consumer /></AuthProvider>);
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("系统管理员")).toBeInTheDocument();
    expect(screen.getByText("可管理账号")).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("xiangneng.admin.token")).toBe("signed-token"));
  });

  it("StrictMode 恢复离线演示身份时不清空令牌或等待网络", async () => {
    localStorage.setItem("xiangneng.admin.token", DEMO_TOKEN);
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    render(<StrictMode><AuthProvider><RestoredSession /></AuthProvider></StrictMode>);
    expect(await screen.findByText("恢复完成：系统管理员演示账号")).toBeInTheDocument();
    expect(localStorage.getItem("xiangneng.admin.token")).toBe(DEMO_TOKEN);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("退出后忽略尚未完成的身份恢复响应", async () => {
    localStorage.setItem("xiangneng.admin.token", "signed-token");
    let resolveResponse!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    render(<AuthProvider><RestoredSession /></AuthProvider>);
    fireEvent.click(screen.getByRole("button", { name: "退出" }));
    resolveResponse(new Response(JSON.stringify({ data: { id: "stale-user", displayName: "已失效身份", permissions: [] } }), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await screen.findByText("恢复完成：未登录")).toBeInTheDocument();
    expect(screen.queryByText("恢复完成：已失效身份")).not.toBeInTheDocument();
    expect(localStorage.getItem("xiangneng.admin.token")).toBeNull();
  });
});
