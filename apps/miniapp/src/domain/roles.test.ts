import { describe, expect, it } from "vitest";
import type { SessionUser } from "../api/types";
import { hasRole, jobPortalForUser, menuForUser, portalForRole, portalForUser } from "./roles";

const user = (role: SessionUser["role"], permissions: string[]): SessionUser => ({
  id: "u1",
  username: "tester",
  displayName: "测试用户",
  role,
  roles: [role],
  branchId: null,
  supplierId: null,
  personId: null,
  employeeType: null,
  projectIds: [],
  permissions,
  scopeBindings: [],
  authorizationGrants: []
});

describe("role portal", () => {
  it("routes four user groups to independent portals", () => {
    expect(portalForRole("PROJECT_OPERATOR")).toBe("operator");
    expect(portalForRole("SUPPLIER")).toBe("supplier");
    expect(portalForRole("JOB_SEEKER")).toBe("job-seeker");
    expect(portalForRole("EMPLOYEE")).toBe("employee");
    expect(portalForRole("FINANCE_REVIEWER")).toBe("operator");
  });

  it("多角色账号仍保留内部员工身份判断", () => {
    const financeEmployee = {
      ...user("FINANCE_REVIEWER", ["referral:create", "salary:self-read"]),
      roles: ["FINANCE_REVIEWER", "EMPLOYEE"] as SessionUser["roles"]
    };

    expect(hasRole(financeEmployee, "EMPLOYEE")).toBe(true);
  });

  it("多角色内部员工优先进入岗位对应的管理端口", () => {
    const financeEmployee = {
      ...user("EMPLOYEE", ["reimbursement:self", "reimbursement:finance-review"]),
      roles: ["EMPLOYEE", "FINANCE_REVIEWER"] as SessionUser["roles"]
    };

    expect(portalForUser(financeEmployee)).toBe("operator");
    expect(jobPortalForUser(financeEmployee)).toBe("employee");
    expect(menuForUser(financeEmployee).map((item) => item.title)).toContain("报销待办");
  });

  it("does not expose write actions without permission", () => {
    const items = menuForUser(user("HEADQUARTERS_MANAGER", ["people:read"]));
    expect(items.map((item) => item.title)).toEqual(["人员查询"]);
  });

  it("shows reimbursement entry according to permission", () => {
    expect(menuForUser(user("EMPLOYEE", ["reimbursement:self"]))
      .map((item) => item.title)).toContain("我的报销");
    expect(menuForUser(user("FINANCE_REVIEWER", ["reimbursement:finance-review"]))
      .map((item) => item.title)).toContain("报销待办");
  });

  it("shows supplier-owned modules only", () => {
    const items = menuForUser(user("SUPPLIER", ["job:read", "people:read", "dashboard:read", "policy:read"]));
    expect(items.map((item) => item.title)).toEqual(["招聘需求", "我的人员", "我的数据", "我的政策"]);
  });
});
