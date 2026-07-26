import type { PropsWithChildren, ReactNode } from "react";
import type { Permission } from "@xiangneng/shared";
import { Result } from "antd";
import { useAuth } from "../auth/AuthContext";

type Props = PropsWithChildren<{
  permission: Permission;
  fallback?: ReactNode;
}>;

export function PermissionGuard({ permission, fallback, children }: Props) {
  const { can } = useAuth();
  if (can(permission)) return children;
  return fallback ?? (
    <Result status="403" title="无权访问" subTitle="当前账号没有此项功能权限。" />
  );
}
