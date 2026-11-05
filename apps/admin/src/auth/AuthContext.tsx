import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Permission } from "@xiangneng/shared";
import { api, clearToken, getToken, setToken } from "../lib/api";
import { DEMO_CODE, DEMO_TOKEN, demoUserForRole } from "../lib/demo";
import type { SessionUser } from "../types/domain";

export type DemoRoleKey = "leader" | "systemAdmin" | "operator" | "supplier" | "candidate" | "employee";

const DEMO_ROLE_KEY = "xiangneng.demo.current-role";
const DEMO_MODE_KEY = "xiangneng.admin.demo-mode";

export const demoRoleOptions: Array<{ value: DemoRoleKey; label: string }> = [
  { value: "leader", label: "领导端" },
  { value: "systemAdmin", label: "系统管理员" },
  { value: "operator", label: "现场运营" },
  { value: "supplier", label: "供应商" },
  { value: "candidate", label: "求职者" },
  { value: "employee", label: "已入职员工" }
];

function safeStoredDemoRole(): DemoRoleKey {
  try {
    const value = localStorage.getItem(DEMO_ROLE_KEY) as DemoRoleKey | null;
    return value && demoRoleOptions.some((item) => item.value === value) ? value : "systemAdmin";
  } catch {
    return "systemAdmin";
  }
}

function demoPersona(role: DemoRoleKey): "headquarters" | "systemAdmin" | "operator" | "supplier" | "employee" {
  if (role === "leader") return "headquarters";
  if (role === "operator") return "operator";
  if (role === "supplier") return "supplier";
  if (role === "employee" || role === "candidate") return "employee";
  return "systemAdmin";
}

type LoginResult = {
  accessToken?: string;
  token?: string;
  user: SessionUser;
};

type AuthContextValue = {
  user: SessionUser | null;
  initializing: boolean;
  login: (username: string, password: string) => Promise<SessionUser>;
  loginWithCode: (code: string) => Promise<SessionUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  can: (permission: Permission) => boolean;
  demoRole: DemoRoleKey;
  switchDemoRole: (role: DemoRoleKey) => Promise<void>;
  isDemo: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [demoRole, setDemoRole] = useState<DemoRoleKey>(() => safeStoredDemoRole());
  const [isDemo, setIsDemo] = useState(() => localStorage.getItem(DEMO_MODE_KEY) === "true" || getToken() === DEMO_TOKEN);
  const [initializing, setInitializing] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem(DEMO_MODE_KEY);
    setIsDemo(false);
    setUser(null);
  }, []);

  const loginDemoRole = useCallback(async (role: DemoRoleKey) => {
    clearToken();
    let session: SessionUser;
    let token = DEMO_TOKEN;
    try {
      const result = await api.post<LoginResult>("/auth/demo-login", {
        persona: demoPersona(role)
      });
      token = result.accessToken ?? result.token ?? DEMO_TOKEN;
      session = result.user;
    } catch {
      // 比赛断网或本地数据库未启动时，切到同一套合成数据离线演示层。
      session = demoUserForRole(role);
    }
    setToken(token);
    localStorage.setItem(DEMO_MODE_KEY, "true");
    setIsDemo(true);
    setUser(session);
    return session;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    if (getToken() === DEMO_TOKEN) {
      await loginDemoRole(safeStoredDemoRole());
      return;
    }
    try {
      setUser(await api.get<SessionUser>("/auth/me"));
    } catch {
      logout();
    }
  }, [loginDemoRole, logout]);

  useEffect(() => {
    void refreshUser().finally(() => setInitializing(false));
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<LoginResult>("/auth/login", { username, password });
    const token = result.accessToken ?? result.token;
    if (!token) throw new Error("登录响应缺少访问令牌");
    setToken(token);
    localStorage.removeItem(DEMO_MODE_KEY);
    setIsDemo(false);
    setUser(result.user);
    return result.user;
  }, []);

  const loginWithCode = useCallback(async (code: string) => {
    if (code.trim() !== DEMO_CODE) throw new Error("验证码不正确，请输入 8888");
    const nextRole = safeStoredDemoRole();
    setDemoRole(nextRole);
    return await loginDemoRole(nextRole);
  }, [loginDemoRole]);

  const switchDemoRole = useCallback(async (role: DemoRoleKey) => {
    localStorage.setItem(DEMO_ROLE_KEY, role);
    setDemoRole(role);
    await loginDemoRole(role);
  }, [loginDemoRole]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    initializing,
    login,
    loginWithCode,
    logout,
    refreshUser,
    can: (permission) => Boolean(user?.permissions.includes(permission)),
    demoRole,
    switchDemoRole,
    isDemo
  }), [demoRole, initializing, isDemo, login, loginWithCode, logout, refreshUser, switchDemoRole, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return value;
}
