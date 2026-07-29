import assert from "node:assert/strict";
import test from "node:test";

import { resolveOrganizationScopeIds } from "../src/services/organization-structure.ts";

for (const type of ["DEPARTMENT", "BUSINESS_DEPARTMENT", "BRANCH", "SUBSIDIARY"]) {
  test(`真实业务单元 ${type} 可解析到所属中心`, () => {
    assert.deepEqual(resolveOrganizationScopeIds({
      id: "business-unit-1",
      type,
      parent: { id: "center-1", type: "CENTER" }
    }, true), {
      organizationUnitId: "business-unit-1",
      centerId: "center-1"
    });
  });
}

test("中心节点本身可作为中心范围", () => {
  assert.deepEqual(resolveOrganizationScopeIds({
    id: "center-1",
    type: "CENTER",
    parent: null
  }, true), {
    organizationUnitId: "center-1",
    centerId: "center-1"
  });
});
