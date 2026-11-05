import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Permission, UserRole } from "@xiangneng/shared";
import { AuthProvider, useAuth } from "./AuthContext";

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
});
