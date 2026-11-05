import { describe, expect, it } from "vitest";
import { validateSyntheticDemoData } from "./synthetic-demo.js";

const validDemo = {
  meta: { synthetic: true, schemaVersion: 1 },
  branches: [{ id: "branch-1", name: "演示分公司" }],
  projects: [{
    id: "project-1",
    branchId: "branch-1",
    name: "演示项目",
    managerName: "项目负责人",
    managerPhone: "10000000001",
    imageUrl: "/images/project.jpg"
  }],
  suppliers: [{
    id: "supplier-1",
    name: "演示供应商",
    contactName: "供应商联系人",
    contactPhone: "10000000002",
    projectIds: ["project-1"]
  }],
  jobDemands: [{
    id: "job-1",
    projectId: "project-1",
    title: "操作工",
    requiredCount: 10,
    description: "负责设备操作与点检。",
    requirements: "身体健康，遵守安全规范。",
    salary: "5000-6500元/月",
    workTime: "两班倒",
    workLocation: "演示园区"
  }],
  people: [{
    id: "person-1",
    employeeNo: "XN-0001",
    name: "演示人员",
    phone: "10000000003",
    idCard: "900000199001010001",
    branchId: "branch-1",
    projectId: "project-1",
    supplierId: "supplier-1",
    employmentStatus: "ACTIVE"
  }],
  applications: [{
    id: "application-1",
    personId: "person-1",
    jobDemandId: "job-1"
  }],
  internalEmployees: [{
    id: "internal-1",
    employeeNo: "XN-IN-001",
    name: "内部员工",
    phone: "10000000004",
    idCard: "900000199001010002",
    branchId: "branch-1"
  }]
};

describe("合成演示数据完整性校验", () => {
  it("接受实体完整且引用一致的数据", () => {
    expect(validateSyntheticDemoData(validDemo)).toMatchObject({
      valid: true,
      counts: {
        branches: 1,
        projects: 1,
        suppliers: 1,
        jobDemands: 1,
        people: 1,
        applications: 1,
        internalEmployees: 1
      },
      errors: []
    });
  });

  it("拒绝缺少展示信息和存在悬空引用的数据", () => {
    const invalid = structuredClone(validDemo);
    invalid.projects[0].imageUrl = "";
    invalid.people[0].projectId = "missing-project";

    const result = validateSyntheticDemoData(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "projects[0].imageUrl 不能为空",
      "people[0].projectId 引用了不存在的项目 missing-project"
    ]));
  });
});
