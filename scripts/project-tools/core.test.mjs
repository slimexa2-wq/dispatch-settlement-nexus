import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  filesForModule,
  listProjectFiles,
  matchPath,
  validateModuleRegistry
} from "./core.mjs";

test("matchPath supports exact paths, directory globs, and single-segment wildcards", () => {
  assert.equal(matchPath("apps/api/src/routes/reimbursements.ts", "apps/api/src/routes/reimbursements.ts"), true);
  assert.equal(matchPath("apps/miniapp/src/pages/reimbursements/**", "apps/miniapp/src/pages/reimbursements/detail/index.tsx"), true);
  assert.equal(matchPath("apps/api/src/routes/*.ts", "apps/api/src/routes/users.ts"), true);
  assert.equal(matchPath("apps/api/src/routes/*.ts", "apps/api/src/routes/nested/users.ts"), false);
});

test("filesForModule returns deterministic unique module files", () => {
  const files = [
    "apps/api/src/routes/users.ts",
    "apps/api/src/routes/reimbursements.ts",
    "apps/miniapp/src/pages/reimbursements/index/index.tsx",
    "README.md"
  ];
  const module = {
    include: ["apps/miniapp/src/pages/reimbursements/**", "apps/api/src/routes/reimbursements.ts", "apps/api/src/routes/reimbursements.ts"]
  };
  assert.deepEqual(filesForModule(module, files), [
    "apps/api/src/routes/reimbursements.ts",
    "apps/miniapp/src/pages/reimbursements/index/index.tsx"
  ]);
});

test("validateModuleRegistry reports duplicate IDs, unknown dependencies, and unmatched patterns", () => {
  const registry = {
    version: 1,
    modules: [
      {
        id: "auth",
        name: "账号权限",
        description: "身份与授权",
        include: ["missing/**"],
        dependsOn: ["unknown"],
        businessRules: [],
        testCommands: [],
        prismaModels: []
      },
      {
        id: "auth",
        name: "重复模块",
        description: "重复",
        include: ["README.md"],
        dependsOn: [],
        businessRules: [],
        testCommands: [],
        prismaModels: []
      }
    ]
  };
  const result = validateModuleRegistry(registry, "/repo", ["README.md"]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /duplicate module id: auth/i);
  assert.match(result.errors.join("\n"), /unknown dependency: unknown/i);
  assert.match(result.errors.join("\n"), /matched no files: missing\/\*\*/i);
});

test("listProjectFiles ignores generated, dependency, build, and git directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hrms-project-files-"));
  await mkdir(path.join(root, "apps", "api", "src"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "x"), { recursive: true });
  await mkdir(path.join(root, "docs", "generated"), { recursive: true });
  await mkdir(path.join(root, ".git"), { recursive: true });
  await writeFile(path.join(root, "apps", "api", "src", "server.ts"), "export {};\n");
  await writeFile(path.join(root, "node_modules", "x", "index.js"), "ignored\n");
  await writeFile(path.join(root, "docs", "generated", "index.md"), "ignored\n");
  await writeFile(path.join(root, ".git", "config"), "ignored\n");
  await writeFile(path.join(root, "README.md"), "included\n");

  assert.deepEqual(await listProjectFiles(root), ["apps/api/src/server.ts", "README.md"]);
});
