import { describe, expect, it } from "vitest";
import { InsuranceType, UserRole } from "./enums.js";
import { Permission, hasPermission } from "./permissions.js";
import { onboardingSchema, personRegistrationSchema } from "./schemas.js";

describe("共享业务规则", () => {
  it("工资条权限只授予本人查看或后台管理角色", () => {
    expect(hasPermission(UserRole.EMPLOYEE, Permission.SALARY_SELF_READ)).toBe(true);
    expect(hasPermission(UserRole.EMPLOYEE, Permission.SALARY_MANAGE)).toBe(false);
    expect(hasPermission(UserRole.JOB_SEEKER, Permission.SALARY_SELF_READ)).toBe(false);
    expect(hasPermission(UserRole.SYSTEM_ADMIN, Permission.SALARY_MANAGE)).toBe(true);
  });

  it("人员运营角色可读取供应商与政策主数据但不能修改", () => {
    for (const role of [UserRole.BRANCH_MANAGER, UserRole.PROJECT_OPERATOR]) {
      expect(hasPermission(role, Permission.SUPPLIER_READ)).toBe(true);
      expect(hasPermission(role, Permission.POLICY_READ)).toBe(true);
      expect(hasPermission(role, Permission.SUPPLIER_WRITE)).toBe(false);
      expect(hasPermission(role, Permission.POLICY_WRITE)).toBe(false);
    }
  });

  it("资源人员不获得人员敏感明细或全局统计下钻权限", () => {
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.PEOPLE_READ)).toBe(false);
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.PEOPLE_EXPORT)).toBe(false);
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.DASHBOARD_READ)).toBe(false);
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.SUPPLIER_WRITE)).toBe(true);
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.POLICY_WRITE)).toBe(true);
  });

  it("报名身份证统一转大写并拒绝无效格式", () => {
    const valid = personRegistrationSchema.parse({
      name: "测试人员",
      idCard: "51010119900101123x",
      phone: "13800000000",
      projectId: "00000000-0000-4000-8000-000000000001",
      jobTitle: "操作员"
    });
    expect(valid.idCard).toBe("51010119900101123X");
    expect(() =>
      personRegistrationSchema.parse({
        name: "测试人员",
        idCard: "123",
        phone: "13800000000",
        projectId: "00000000-0000-4000-8000-000000000001",
        jobTitle: "操作员"
      })
    ).toThrow();
  });

  it("保险允许三类多选但不接受字典外值", () => {
    const parsed = onboardingSchema.parse({
      onboardDate: "2026-07-18",
      insuranceTypes: [InsuranceType.COMMERCIAL, InsuranceType.RISK_FUND]
    });
    expect(parsed.insuranceTypes).toEqual([
      InsuranceType.COMMERCIAL,
      InsuranceType.RISK_FUND
    ]);
    expect(() =>
      onboardingSchema.parse({
        onboardDate: "2026-07-18",
        insuranceTypes: ["OTHER"]
      })
    ).toThrow();
  });
});
