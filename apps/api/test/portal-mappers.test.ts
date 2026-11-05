import { describe, expect, it } from "vitest";
import { UserRole } from "@xiangneng/shared";
import { portalRole } from "../src/portal/mappers.js";

describe("门户身份映射", () => {
  it("供应商管理员进入供应商端而不是个人端", () => {
    expect(portalRole(UserRole.SUPPLIER)).toBe("supplier");
    expect(portalRole(UserRole.SUPPLIER_ADMIN)).toBe("supplier");
  });
});
