import assert from "node:assert/strict";
import test from "node:test";

import { buildRealImportPlan } from "../lib/real-business-import-plan.mjs";

const data = {
  meta: { internal: true },
  organizationUnits: [
    { id: "org-root", code: "ROOT", name: "四川祥能人力资本服务有限公司", type: "GROUP", parentCode: null, sortOrder: 1 },
    { id: "org-center", code: "CENTER", name: "MOC运营中心", type: "CENTER", parentCode: "ROOT", sortOrder: 1 },
    { id: "org-branch", code: "BRANCH", name: "宜宾分公司", type: "BRANCH", parentCode: "CENTER", sortOrder: 1 }
  ],
  legalEntities: [{ id: "legal-1", code: "LE-1", name: "四川祥能人力资本服务有限公司" }],
  positions: [{ id: "pos-1", code: "POS-1", name: "现场运营", organizationUnitName: "宜宾分公司" }],
  jobGrades: [{ id: "grade-1", code: "G-1", name: "专员级", level: 1 }],
  branches: [{ id: "branch-1", sourceCode: "B-1", name: "宜宾" }],
  projects: [{ id: "project-1", branchId: "branch-1", name: "四川时代外包" }],
  suppliers: [],
  sourceChannels: [{ id: "source-self", name: "祥能自招", type: "INTERNAL_SELF_RECRUITMENT" }],
  people: [], applications: [], jobDemands: [], internalEmployments: [],
  internalEmployees: [{
    id: "employee-1", employeeNo: "XN-1", sourceEmployeeNo: "1020001", name: "甲",
    legalEntityName: "四川祥能人力资本服务有限公司", organizationUnitName: "宜宾分公司",
    position: "现场运营", jobGrade: "专员级"
  }]
};

test("real import plan builds a stable organization path in parent-first order", () => {
  const plan = buildRealImportPlan(data);
  assert.deepEqual(plan.organizationUnits.map((item) => item.name), [
    "四川祥能人力资本服务有限公司", "MOC运营中心", "宜宾分公司"
  ]);
  assert.equal(plan.organizationUnits[2].path, "/org-root/org-center/org-branch");
});

test("internal source channels never become fake suppliers", () => {
  const plan = buildRealImportPlan(data);
  assert.equal(plan.suppliers.length, 0);
  assert.equal(plan.sourceChannels[0].name, "祥能自招");
});

test("missing real references fail loudly instead of being invented", () => {
  assert.throws(
    () => buildRealImportPlan({ ...data, internalEmployees: [{ ...data.internalEmployees[0], organizationUnitName: "虚构部门" }] }),
    /内部员工.*找不到真实组织/
  );
});

test("real normalized parentId and path are preserved without legacy parentCode", () => {
  const normalized = {
    ...data,
    organizationUnits: [
      {
        id: "org-root",
        code: "ROOT",
        name: "四川祥能人力资本服务有限公司",
        type: "GROUP",
        parentId: null,
        path: "/org-root",
        sortOrder: 1
      },
      {
        id: "org-center",
        code: "CENTER",
        name: "MOC运营中心",
        type: "CENTER",
        parentId: "org-root",
        path: "/org-root/org-center",
        sortOrder: 1
      },
      {
        id: "org-branch",
        code: "BRANCH",
        name: "宜宾分公司",
        type: "BRANCH",
        parentId: "org-center",
        path: "/org-root/org-center/org-branch",
        sortOrder: 1
      }
    ]
  };

  const plan = buildRealImportPlan(normalized);
  assert.equal(plan.organizationUnits[1].parentId, "org-root");
  assert.equal(plan.organizationUnits[2].parentId, "org-center");
  assert.equal(plan.organizationUnits[2].path, "/org-root/org-center/org-branch");
});
