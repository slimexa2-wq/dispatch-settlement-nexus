import assert from "node:assert/strict";
import test from "node:test";
import {
  assertInternalDatabaseUrl,
  internalSourceFiles,
  validateBootstrapCredentials
} from "../lib/internal-startup-contract.mjs";

test("内部系统数据库必须与演示库隔离", () => {
  assert.equal(
    assertInternalDatabaseUrl("postgresql://postgres@127.0.0.1:5432/xiangneng_hrms_internal"),
    "xiangneng_hrms_internal"
  );
  assert.throws(
    () => assertInternalDatabaseUrl("postgresql://postgres@127.0.0.1:5432/xiangneng_hrms_demo"),
    /internal/
  );
});

test("内部启动固定读取三份真实源数据且不读取合成演示数据", () => {
  assert.deepEqual(internalSourceFiles, [
    "祥能人力周度在离职数据统计_20260719.xlsx",
    "所有企业名单汇总2026-07-21.xls",
    "202606集团花名册.xlsx"
  ]);
  assert.equal(internalSourceFiles.some((name) => name.includes("demo")), false);
});

test("内部管理员必须显式配置且密码不少于12位", () => {
  assert.deepEqual(
    validateBootstrapCredentials({ username: "admin", password: "A-secure-pass-2026" }),
    { username: "admin", password: "A-secure-pass-2026" }
  );
  assert.throws(() => validateBootstrapCredentials({ username: "", password: "A-secure-pass-2026" }), /username/i);
  assert.throws(() => validateBootstrapCredentials({ username: "admin", password: "short" }), /12/);
});

test("内部启动同时禁用管理后台和统一入口的合成演示回退", async () => {
  const { readFile } = await import("node:fs/promises");
  const script = await readFile(new URL("../start-internal-system.ps1", import.meta.url), "utf8");
  assert.match(script, /VITE_ENABLE_DEMO_SESSION\s*=\s*"false"/);
  assert.match(script, /VITE_PORTAL_DEMO_FALLBACK\s*=\s*"false"/);
});

test("内部系统提供一键停止脚本而不是要求人工查找进程", async () => {
  const { readFile } = await import("node:fs/promises");
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["internal:stop"], "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-internal-system.ps1");
  const script = await readFile(new URL("../stop-internal-system.ps1", import.meta.url), "utf8");
  assert.match(script, /internal-system-processes\.json/);
  assert.match(script, /apiPid/);
  assert.match(script, /adminPid/);
  assert.match(script, /portalPid/);
});
