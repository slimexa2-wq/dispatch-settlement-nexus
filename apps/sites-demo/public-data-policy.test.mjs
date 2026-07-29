import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicArtifactSafe, forbiddenPublicDataMarkers } from "./public-data-policy.mjs";

test("公开演示禁止包含三份真实源表和内部规范化数据路径", () => {
  for (const marker of [
    "祥能人力周度在离职数据统计_20260719.xlsx",
    "所有企业名单汇总2026-07-21.xls",
    "202606集团花名册.xlsx",
    "data/internal/",
    "data/internal-source/"
  ]) {
    assert.equal(forbiddenPublicDataMarkers.includes(marker), true);
    assert.throws(() => assertPublicArtifactSafe(`bundle:${marker}`), /forbidden/i);
  }
});

test("公开演示仍允许合成离线数据标记", () => {
  assert.doesNotThrow(() => assertPublicArtifactSafe("synthetic-person-001 SYN-E00001"));
});
