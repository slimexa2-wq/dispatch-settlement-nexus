export type AccessPortal = "ADMIN" | "INTERNAL_MINIAPP" | "SUPPLIER_MINIAPP" | "EMPLOYEE_MINIAPP";
export type AccessScope = { type: string; entityId?: string | null };
export type AccessRequestInput = {
  subjectUserId: string;
  portals: readonly string[];
  roles: readonly string[];
  scopes: readonly AccessScope[];
  validFrom: string;
  validTo?: string | null;
  reason: string;
};
export type AccessValidationError = { code: string; message: string };

const validPortals = new Set<AccessPortal>(["ADMIN", "INTERNAL_MINIAPP", "SUPPLIER_MINIAPP", "EMPLOYEE_MINIAPP"]);
const targetRequiredScopes = new Set(["ORG_UNIT", "CENTER", "BRANCH", "PROJECT", "SUPPLIER"]);
const highRiskRoles = new Set(["SUPER_ADMIN", "SYSTEM_ADMIN", "GROUP_LEADER"]);

export function validateAccessRequest(input: AccessRequestInput): AccessValidationError[] {
  const errors: AccessValidationError[] = [];
  if (!input.subjectUserId) errors.push({ code: "SUBJECT_REQUIRED", message: "必须选择开通对象" });
  if (!input.portals.length) errors.push({ code: "PORTAL_REQUIRED", message: "至少选择一个使用端口" });
  if (input.portals.some((portal) => !validPortals.has(portal as AccessPortal))) {
    errors.push({ code: "INVALID_PORTAL", message: "存在不支持的使用端口" });
  }
  if (!input.roles.length) errors.push({ code: "ROLE_REQUIRED", message: "至少选择一个角色" });
  if (!input.scopes.length) errors.push({ code: "SCOPE_REQUIRED", message: "至少选择一个数据范围" });
  for (const scope of input.scopes) {
    if (targetRequiredScopes.has(scope.type) && !scope.entityId) {
      errors.push({ code: "SCOPE_TARGET_REQUIRED", message: `${scope.type} 范围必须选择具体对象` });
    }
  }
  const from = new Date(input.validFrom);
  const to = input.validTo ? new Date(input.validTo) : null;
  if (Number.isNaN(from.getTime()) || (to && Number.isNaN(to.getTime()))) {
    errors.push({ code: "INVALID_DATE", message: "生效时间格式不正确" });
  } else if (to && to <= from) {
    errors.push({ code: "INVALID_VALIDITY_RANGE", message: "结束时间必须晚于开始时间" });
  }
  if (!input.reason.trim()) errors.push({ code: "REASON_REQUIRED", message: "必须填写申请原因" });
  return errors;
}

export function buildAccessProvisionPlan(input: AccessRequestInput): {
  portalChanges: Array<{ portal: string; enabled: true; validFrom: string; validTo: string | null }>;
  roleAssignments: Array<{ roleCode: string; source: "TEMPORARY" | "MANUAL"; validFrom: string; validTo: string | null }>;
  scopeBindings: Array<{ type: string; entityId: string | null; validFrom: string; validTo: string | null }>;
  temporary: boolean;
  riskLevel: "NORMAL" | "HIGH";
  requiresApproval: boolean;
} {
  const errors = validateAccessRequest(input);
  if (errors.length) throw new Error(errors.map((item) => item.message).join("；"));
  const temporary = Boolean(input.validTo);
  const riskLevel = input.roles.some((role) => highRiskRoles.has(role)) || input.scopes.some((scope) => scope.type === "GROUP")
    ? "HIGH"
    : "NORMAL";
  const validTo = input.validTo ?? null;
  const uniqueScopes = new Map<string, AccessScope>();
  for (const scope of input.scopes) {
    const normalized = { type: scope.type, entityId: scope.entityId ?? null };
    uniqueScopes.set(`${normalized.type}:${normalized.entityId ?? ""}`, normalized);
  }
  return {
    portalChanges: [...new Set(input.portals)].map((portal) => ({ portal, enabled: true as const, validFrom: input.validFrom, validTo })),
    roleAssignments: [...new Set(input.roles)].map((roleCode) => ({ roleCode, source: temporary ? "TEMPORARY" as const : "MANUAL" as const, validFrom: input.validFrom, validTo })),
    scopeBindings: [...uniqueScopes.values()].map((scope) => ({ type: scope.type, entityId: scope.entityId ?? null, validFrom: input.validFrom, validTo })),
    temporary,
    riskLevel,
    requiresApproval: riskLevel === "HIGH" || input.roles.length > 1 || input.portals.includes("ADMIN")
  };
}
