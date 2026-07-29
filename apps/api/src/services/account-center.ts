export type AccountPortal = "ADMIN" | "INTERNAL_MINIAPP" | "SUPPLIER_MINIAPP" | "EMPLOYEE_MINIAPP";
export type PortalAccessInput = { portal: string; enabled: boolean; validFrom?: string | Date | null; validTo?: string | Date | null };

export type AccountCategory = "INTERNAL_EMPLOYEE" | "SUPPLIER" | "OUTSOURCED_EMPLOYEE" | "JOB_SEEKER" | "SYSTEM";

const portalOrder: AccountPortal[] = ["ADMIN", "INTERNAL_MINIAPP", "SUPPLIER_MINIAPP", "EMPLOYEE_MINIAPP"];

export function normalizePortalAccess(items: readonly PortalAccessInput[], now = new Date()): Array<{
  portal: AccountPortal;
  enabled: boolean;
  validFrom: string | null;
  validTo: string | null;
}> {
  const byPortal = new Map<AccountPortal, { portal: AccountPortal; enabled: boolean; validFrom: string | null; validTo: string | null }>();
  const currentTime = now.getTime();
  for (const item of items) {
    if (!portalOrder.includes(item.portal as AccountPortal)) continue;
    const portal = item.portal as AccountPortal;
    const startsAt = toTime(item.validFrom);
    const endsAt = toTime(item.validTo);
    const current = item.enabled && (startsAt === null || startsAt <= currentTime) && (endsAt === null || endsAt >= currentTime);
    const value = {
      portal,
      enabled: current,
      validFrom: item.validFrom ? new Date(item.validFrom).toISOString() : null,
      validTo: item.validTo ? new Date(item.validTo).toISOString() : null
    };
    const previous = byPortal.get(portal);
    if (!previous || current) byPortal.set(portal, current && previous ? { ...value, enabled: true } : value);
  }
  return portalOrder.flatMap((portal) => {
    const value = byPortal.get(portal);
    return value ? [value] : [];
  });
}

export function accountCategory(input: {
  internalEmployeeId?: string | null;
  supplierId?: string | null;
  personId?: string | null;
  employmentStatus?: string | null;
}): AccountCategory {
  if (input.internalEmployeeId) return "INTERNAL_EMPLOYEE";
  if (input.supplierId) return "SUPPLIER";
  if (input.personId && input.employmentStatus === "ACTIVE") return "OUTSOURCED_EMPLOYEE";
  if (input.personId) return "JOB_SEEKER";
  return "SYSTEM";
}

export function mergeAccountCandidates(candidates: readonly Array<{
  id: string;
  isActive: boolean;
  portals: readonly PortalAccessInput[];
  wechatMiniappOpenId?: string | null;
}>): {
  primaryAccountId: string;
  portals: ReturnType<typeof normalizePortalAccess>;
  wechatMiniappOpenId: string | null;
  deactivateAccountIds: string[];
} {
  if (!candidates.length) throw new Error("至少需要一个待合并账户");
  const primary = candidates.find((candidate) => candidate.isActive) ?? candidates[0]!;
  return {
    primaryAccountId: primary.id,
    portals: normalizePortalAccess(candidates.flatMap((candidate) => candidate.portals)),
    wechatMiniappOpenId: candidates.map((candidate) => candidate.wechatMiniappOpenId).find(Boolean) ?? null,
    deactivateAccountIds: candidates.filter((candidate) => candidate.id !== primary.id).map((candidate) => candidate.id)
  };
}


export function validateSelfAccountMutation(input: {
  actorId: string;
  targetUserId: string;
  action?: "ACTIVATE" | "DISABLE" | "RESET_PASSWORD" | "FORCE_LOGOUT" | "UNBIND_WECHAT";
  portals?: readonly Array<{ portal: string; enabled: boolean }>;
}): string | null {
  if (input.actorId !== input.targetUserId) return null;
  if (input.action === "DISABLE") return "不能停用当前登录账户";
  if (input.portals?.some((portal) => portal.portal === "ADMIN" && !portal.enabled)) {
    return "不能移除当前登录账户的电脑后台入口";
  }
  return null;
}


export function parseOptionalBooleanQuery(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  throw new Error("布尔查询参数必须是 true、false、1 或 0");
}

export function accountCategoryWhere(category?: AccountCategory): Record<string, unknown> {
  if (category === "INTERNAL_EMPLOYEE") return { internalEmployee: { isNot: null } };
  if (category === "SUPPLIER") return { supplierId: { not: null } };
  if (category === "OUTSOURCED_EMPLOYEE") return { person: { is: { status: "ACTIVE" } } };
  if (category === "JOB_SEEKER") return { person: { is: { status: { not: "ACTIVE" } } } };
  if (category === "SYSTEM") return { internalEmployee: { is: null }, supplierId: null, personId: null };
  return {};
}


function toTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function hasCurrentPortalAccess(
  items: readonly PortalAccessInput[],
  portal: AccountPortal | "MINIAPP",
  now = new Date()
): boolean {
  if (!items.length) return true;
  const candidates = portal === "MINIAPP"
    ? new Set<AccountPortal>(["INTERNAL_MINIAPP", "SUPPLIER_MINIAPP", "EMPLOYEE_MINIAPP"])
    : new Set<AccountPortal>([portal]);
  const currentTime = now.getTime();
  return items.some((item) => {
    if (!candidates.has(item.portal as AccountPortal) || !item.enabled) return false;
    const startsAt = toTime(item.validFrom);
    const endsAt = toTime(item.validTo);
    return (startsAt === null || startsAt <= currentTime) && (endsAt === null || endsAt >= currentTime);
  });
}
