import Taro from "@tarojs/taro";
import type { SessionUser } from "../api/types";

const TOKEN_KEY = "xiangneng.accessToken";
const USER_KEY = "xiangneng.sessionUser";

export function getAccessToken(): string | null {
  try {
    const value = Taro.getStorageSync<string>(TOKEN_KEY);
    return value || null;
  } catch {
    return null;
  }
}

export function getSessionUser(): SessionUser | null {
  try {
    const value = Taro.getStorageSync<SessionUser>(USER_KEY);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: SessionUser): void {
  Taro.setStorageSync(TOKEN_KEY, token);
  Taro.setStorageSync(USER_KEY, user);
}

export function clearSession(): void {
  try {
    Taro.removeStorageSync(TOKEN_KEY);
    Taro.removeStorageSync(USER_KEY);
  } catch {
    // Storage cleanup is best-effort; navigation still returns to login.
  }
}
