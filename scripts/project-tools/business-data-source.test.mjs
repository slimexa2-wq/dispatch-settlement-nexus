import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveBusinessDataPath } from "../lib/business-data-source.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "xiangneng-data-source-"));
  await mkdir(join(root, "data", "internal"), { recursive: true });
  await mkdir(join(root, "data", "synthetic"), { recursive: true });
  await writeFile(join(root, "data", "internal", "real-business-data.json"), "{}\n");
  await writeFile(join(root, "data", "synthetic", "demo-data.json"), "{}\n");
  return root;
}

test("internal mode always selects the real internal data file", async () => {
  const root = await fixture();
  const path = await resolveBusinessDataPath({ root, mode: "internal" });
  assert.equal(path, join(root, "data", "internal", "real-business-data.json"));
});

test("public demo mode explicitly selects synthetic data", async () => {
  const root = await fixture();
  const path = await resolveBusinessDataPath({ root, mode: "public-demo" });
  assert.equal(path, join(root, "data", "synthetic", "demo-data.json"));
});

test("internal mode fails instead of silently falling back to fake data", async () => {
  const root = await mkdtemp(join(tmpdir(), "xiangneng-data-source-"));
  await mkdir(join(root, "data", "synthetic"), { recursive: true });
  await writeFile(join(root, "data", "synthetic", "demo-data.json"), "{}\n");
  await assert.rejects(
    resolveBusinessDataPath({ root, mode: "internal" }),
    /真实内部数据文件不存在/
  );
});
