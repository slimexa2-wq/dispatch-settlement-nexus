export const internalSourceFiles = Object.freeze([
  "祥能人力周度在离职数据统计_20260719.xlsx",
  "所有企业名单汇总2026-07-21.xls",
  "202606集团花名册.xlsx"
]);

export function assertInternalDatabaseUrl(databaseUrl) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the internal system");
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName.toLowerCase().includes("internal")) {
    throw new Error("Internal startup requires an isolated database whose name contains 'internal'");
  }
  if (databaseName.toLowerCase().includes("demo")) {
    throw new Error("Internal startup must not use a demo database");
  }
  return databaseName;
}

export function validateBootstrapCredentials({ username, password }) {
  const normalizedUsername = String(username ?? "").trim();
  const normalizedPassword = String(password ?? "");
  if (!normalizedUsername) {
    throw new Error("XIANGNENG_BOOTSTRAP_ADMIN_USERNAME is required");
  }
  if (normalizedPassword.length < 12) {
    throw new Error("XIANGNENG_BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters");
  }
  return { username: normalizedUsername, password: normalizedPassword };
}
