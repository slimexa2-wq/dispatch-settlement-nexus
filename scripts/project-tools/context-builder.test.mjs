import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContextData,
  rankFileForReading,
  renderContextPack
} from "./context-builder.mjs";

const registry = {
  version: 1,
  modules: [
    {
      id: "auth",
      name: "账号权限",
      description: "授权",
      include: ["auth/**"],
      dependsOn: [],
      businessRules: ["docs/business-rules/authorization.md"],
      testCommands: ["pnpm test:auth"],
      prismaModels: ["User"]
    },
    {
      id: "reimbursement",
      name: "员工报销",
      description: "报销闭环",
      include: ["reimbursement/**"],
      dependsOn: ["auth"],
      businessRules: ["docs/business-rules/reimbursement.md"],
      testCommands: ["pnpm test:reimbursement"],
      prismaModels: ["ReimbursementBatch"]
    }
  ]
};

const index = {
  modules: [
    {
      ...registry.modules[0],
      files: ["auth/authorization.ts", "auth/authorization.test.ts"],
      fileCount: 2,
      sourceLines: 100
    },
    {
      ...registry.modules[1],
      files: [
        "reimbursement/page.tsx",
        "reimbursement/service.ts",
        "reimbursement/service.test.ts",
        "reimbursement/receipt.png"
      ],
      fileCount: 4,
      sourceLines: 400
    }
  ],
  largeFiles: [{ path: "reimbursement/page.tsx", lines: 700, threshold: 500, category: "React/TSX" }]
};

test("rankFileForReading prioritizes rules and services before UI and tests", () => {
  assert.ok(rankFileForReading("docs/business-rules/reimbursement.md") < rankFileForReading("reimbursement/service.ts"));
  assert.ok(rankFileForReading("reimbursement/service.ts") < rankFileForReading("reimbursement/page.tsx"));
  assert.ok(rankFileForReading("reimbursement/page.tsx") < rankFileForReading("reimbursement/service.test.ts"));
  assert.ok(rankFileForReading("reimbursement/domain/reimbursements.ts") < rankFileForReading("reimbursement/domain/reimbursements.test.ts"));
});

test("buildContextData includes direct dependencies and excludes binary files", () => {
  const data = buildContextData({ registry, index, moduleId: "reimbursement", documents: {} });
  assert.equal(data.module.id, "reimbursement");
  assert.deepEqual(data.dependencies.map((module) => module.id), ["auth"]);
  assert.deepEqual(data.readingFiles, [
    "reimbursement/service.ts",
    "reimbursement/page.tsx",
    "reimbursement/service.test.ts"
  ]);
  assert.deepEqual(data.excludedBinaryFiles, ["reimbursement/receipt.png"]);
  assert.deepEqual(data.largeFiles, index.largeFiles);
});

test("buildContextData rejects unknown modules", () => {
  assert.throws(
    () => buildContextData({ registry, index, moduleId: "missing", documents: {} }),
    /Unknown module: missing/
  );
});

test("renderContextPack is stable and identifies out-of-scope modules", () => {
  const data = buildContextData({
    registry,
    index,
    moduleId: "reimbursement",
    documents: {
      "docs/business-rules/reimbursement.md": "# 报销规则\n\n一笔费用只录一次。\n"
    }
  });
  const first = renderContextPack(data);
  const second = renderContextPack(data);
  assert.equal(first, second);
  assert.match(first, /员工报销/);
  assert.match(first, /账号权限/);
  assert.match(first, /一笔费用只录一次/);
  assert.match(first, /本次默认不应修改/);
});
