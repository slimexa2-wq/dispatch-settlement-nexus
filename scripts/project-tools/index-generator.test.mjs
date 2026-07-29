import assert from "node:assert/strict";
import test from "node:test";

import {
  compareGeneratedOutputs,
  extractApiRoutes,
  extractMiniappPages,
  extractPrismaEntities,
  renderIndexFiles
} from "./index-generator.mjs";

test("extractApiRoutes finds Fastify HTTP method and path pairs", () => {
  const source = `
    app.get("/reimbursements", async () => []);
    app.post('/reimbursements/:id/payments', async () => ({}));
    fastify.patch(\`/users/:id\`, handler);
  `;
  assert.deepEqual(extractApiRoutes(source, "apps/api/src/routes/reimbursements.ts"), [
    { file: "apps/api/src/routes/reimbursements.ts", method: "GET", path: "/reimbursements" },
    { file: "apps/api/src/routes/reimbursements.ts", method: "POST", path: "/reimbursements/:id/payments" },
    { file: "apps/api/src/routes/reimbursements.ts", method: "PATCH", path: "/users/:id" }
  ]);
});

test("extractMiniappPages reads Taro page declarations in source order", () => {
  const source = `export default defineAppConfig({ pages: ["pages/index/index", 'pages/reimbursements/index/index'] });`;
  assert.deepEqual(extractMiniappPages(source), [
    "pages/index/index",
    "pages/reimbursements/index/index"
  ]);
});

test("extractPrismaEntities reads model and enum names", () => {
  const source = `enum UserRole { ADMIN }\nmodel User { id String @id }\nmodel Project { id String @id }\n`;
  assert.deepEqual(extractPrismaEntities(source), {
    enums: ["UserRole"],
    models: ["Project", "User"]
  });
});

test("renderIndexFiles is deterministic and includes modules, routes, pages, schema, and large files", () => {
  const index = {
    generatedAt: "stable",
    summary: { fileCount: 5, sourceFileCount: 4, totalSourceLines: 1200 },
    modules: [
      {
        id: "reimbursement",
        name: "员工报销",
        description: "报销闭环",
        dependsOn: ["auth"],
        fileCount: 3,
        files: ["a.ts", "b.ts", "c.ts"],
        testCommands: ["pnpm test:module:reimbursement"],
        prismaModels: ["ReimbursementBatch"]
      }
    ],
    apiRoutes: [{ file: "a.ts", method: "GET", path: "/reimbursements" }],
    adminRoutes: [{ path: "/reimbursements", component: "ReimbursementsPage" }],
    miniappPages: ["pages/reimbursements/index/index"],
    prisma: { enums: ["UserRole"], models: ["ReimbursementBatch"] },
    largeFiles: [{ path: "a.ts", lines: 900, threshold: 500, category: "TypeScript" }]
  };
  const first = renderIndexFiles(index);
  const second = renderIndexFiles(index);
  assert.deepEqual(first, second);
  assert.match(first["docs/generated/module-index.md"], /员工报销/);
  assert.match(first["docs/generated/api-route-index.md"], /GET/);
  assert.match(first["docs/generated/page-route-index.md"], /pages\/reimbursements/);
  assert.match(first["docs/generated/prisma-index.md"], /ReimbursementBatch/);
  assert.match(first["docs/generated/large-files-report.md"], /900/);
  assert.match(first["docs/generated/maintenance-baseline.md"], /工程维护基线/);
});

test("compareGeneratedOutputs reports missing and stale files", () => {
  const expected = {
    "docs/generated/a.md": "new\n",
    "docs/generated/b.md": "same\n"
  };
  const actual = {
    "docs/generated/a.md": "old\n",
    "docs/generated/b.md": "same\n"
  };
  assert.deepEqual(compareGeneratedOutputs(expected, actual), {
    missing: [],
    stale: ["docs/generated/a.md"],
    extra: []
  });
});
