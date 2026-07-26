import { describe, expect, it } from "vitest";
import type { SessionUser } from "../api/types";
import { menuForUser, portalForRole } from "./roles";

const user = (role: SessionUser["role"], permissions: string[]): SessionUser => ({
  id: "u1",
  username: "tester",
  displayName: "测试用户",
  role,
  branchId: null,
  supplierId: null,
  personId: null,
  employeeType: null,
  projectIds: [],
  permissions
});

describe("role portal", () => {
  it("routes four user groups to independent portals", () => {
    expect(portalForRole("PROJECT_OPERATOR")).toBe("operator");
    expect(portalForRole("SUPPLIER")).toBe("supplier");
    expect(portalForRole("JOB_SEEKER")).toBe("job-seeker");
    expect(portalForRole("EMPLOYEE")).toBe("employee");
  });

  it("does not expose write actions without permission", () => {
    const items = menuForUser(user("HEADQUARTERS_MANAGER", ["people:read"]));
    expect(items.map((item) => item.title)).toEqual(["人员查询"]);
  });

  it("shows supplier-owned modules only", () => {
    const items = menuForUser(user("SUPPLIER", ["job:read", "people:read", "dashboard:read", "policy:read"]));
    expect(items.map((item) => item.title)).toEqual(["招聘需求", "我的人员", "我的数据", "我的政策"]);
  });
});
