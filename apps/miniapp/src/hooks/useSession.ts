import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { getSessionUser } from "../auth/session";
import type { SessionUser } from "../api/types";

export function useSession(requireLogin = true): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  useDidShow(() => {
    const current = getSessionUser();
    setUser(current);
    if (requireLogin && !current) {
      void Taro.reLaunch({ url: "/pages/login/index" });
    }
  });
  return user;
}
