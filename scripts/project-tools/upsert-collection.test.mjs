import assert from "node:assert/strict";
import test from "node:test";

import { upsertCollection } from "../lib/upsert-collection.mjs";

test("refreshable real-data collections update existing deterministic records", async () => {
  const calls = [];
  await upsertCollection(
    [
      { id: "project-1", name: "旧项目名" },
      { id: "project-2", name: "新项目" }
    ],
    {
      toId: (row) => `uuid:${row.id}`,
      toCreate: (row) => ({ id: `uuid:${row.id}`, name: row.name }),
      toUpdate: (row) => ({ name: row.name }),
      upsert: async (args) => calls.push(args)
    }
  );

  assert.deepEqual(calls, [
    {
      where: { id: "uuid:project-1" },
      create: { id: "uuid:project-1", name: "旧项目名" },
      update: { name: "旧项目名" }
    },
    {
      where: { id: "uuid:project-2" },
      create: { id: "uuid:project-2", name: "新项目" },
      update: { name: "新项目" }
    }
  ]);
});
