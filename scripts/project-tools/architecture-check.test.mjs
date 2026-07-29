import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeArchitecture,
  detectDependencyCycles
} from "./architecture-check.mjs";

test("detectDependencyCycles returns a readable cycle path", () => {
  const registry = {
    version: 1,
    modules: [
      { id: "a", dependsOn: ["b"] },
      { id: "b", dependsOn: ["c"] },
      { id: "c", dependsOn: ["a"] }
    ]
  };
  assert.deepEqual(detectDependencyCycles(registry), [["a", "b", "c", "a"]]);
});

test("analyzeArchitecture fails on missing docs and stale generated outputs", () => {
  const registry = {
    version: 1,
    modules: [
      {
        id: "auth",
        name: "账号权限",
        description: "授权",
        include: ["auth.ts"],
        dependsOn: [],
        businessRules: ["docs/business-rules/authorization.md"],
        testCommands: [],
        prismaModels: []
      }
    ]
  };
  const result = analyzeArchitecture({
    registry,
    projectFiles: ["auth.ts"],
    existingFiles: new Set(["auth.ts"]),
    generatedDifferences: { missing: [], stale: ["docs/generated/project-index.json"], extra: [] },
    largeFiles: []
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /missing module document.*auth/i);
  assert.match(result.errors.join("\n"), /missing business rule document.*authorization/i);
  assert.match(result.errors.join("\n"), /stale generated index.*project-index/i);
});

test("analyzeArchitecture reports oversized files as warnings, not failures", () => {
  const registry = {
    version: 1,
    modules: [
      {
        id: "platform",
        name: "平台",
        description: "工程",
        include: ["package.json"],
        dependsOn: [],
        businessRules: [],
        testCommands: [],
        prismaModels: []
      }
    ]
  };
  const result = analyzeArchitecture({
    registry,
    projectFiles: ["package.json", "docs/modules/platform/MODULE.md"],
    existingFiles: new Set(["package.json", "docs/modules/platform/MODULE.md"]),
    generatedDifferences: { missing: [], stale: [], extra: [] },
    largeFiles: [{ path: "apps/admin/src/lib/demo.ts", lines: 4000, threshold: 500 }]
  });
  assert.equal(result.valid, true);
  assert.match(result.warnings.join("\n"), /demo\.ts.*4000/i);
});
