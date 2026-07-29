import assert from "node:assert/strict";
import test from "node:test";

import { demoSessionAllowed } from "../src/lib/data-mode.ts";

test("internal runtime can disable all synthetic demo sessions", () => {
  assert.equal(demoSessionAllowed("false"), false);
  assert.equal(demoSessionAllowed("FALSE"), false);
  assert.equal(demoSessionAllowed("0"), false);
});

test("public demo remains enabled unless explicitly disabled", () => {
  assert.equal(demoSessionAllowed(undefined), true);
  assert.equal(demoSessionAllowed("true"), true);
});
