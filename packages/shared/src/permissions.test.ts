import { describe, expect, it } from "vitest";
import { InsuranceType, UserRole } from "./enums.js";
import {
  DataScopeType,
  Permission,
  hasAnyRolePermission,
  hasPermission,
  isWithinDataScope,
  permissionsForRoles
} from "./permissions.js";
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

  it("项目运营不能读取包含其他项目完整前后数据的集团审计日志", () => {
    expect(hasPermission(UserRole.PROJECT_OPERATOR, Permission.AUDIT_READ)).toBe(false);
  });

  it("资源人员不获得人员敏感明细或全局统计下钻权限", () => {
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.PEOPLE_READ)).toBe(false);
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.PEOPLE_EXPORT)).toBe(false);
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.DASHBOARD_READ)).toBe(false);
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.SUPPLIER_WRITE)).toBe(true);
    expect(hasPermission(UserRole.RESOURCE_SPECIALIST, Permission.POLICY_WRITE)).toBe(true);
  });

  it("多角色权限取并集，但不会绕过数据范围", () => {
    const roles = [UserRole.INTERNAL_HR, UserRole.FINANCE_REVIEWER];

    expect(hasAnyRolePermission(roles, Permission.INTERNAL_EMPLOYEE_WRITE)).toBe(true);
    expect(hasAnyRolePermission(roles, Permission.REIMBURSEMENT_FINANCE_REVIEW)).toBe(
      true
    );
    expect(permissionsForRoles(roles)).toContain(Permission.INTERNAL_EMPLOYEE_READ);

    const context = {
      userId: "user-1",
      roles,
      bindings: [{ type: DataScopeType.BRANCH, entityId: "branch-a" }]
    };

    expect(isWithinDataScope(context, { branchId: "branch-a" })).toBe(true);
    expect(isWithinDataScope(context, { branchId: "branch-b" })).toBe(false);
  });

  it("本人、项目、供应商和集团范围逐级生效", () => {
    expect(
      isWithinDataScope(
        {
          userId: "employee-1",
          roles: [UserRole.EMPLOYEE],
          bindings: [{ type: DataScopeType.SELF }]
        },
        { ownerUserId: "employee-1" }
      )
    ).toBe(true);
    expect(
      isWithinDataScope(
        {
          userId: "employee-1",
          roles: [UserRole.EMPLOYEE],
          bindings: [{ type: DataScopeType.SELF }]
        },
        { ownerUserId: "employee-2" }
      )
    ).toBe(false);
    expect(
      isWithinDataScope(
        {
          userId: "operator-1",
          roles: [UserRole.PROJECT_OPERATOR],
          bindings: [{ type: DataScopeType.PROJECT, entityId: "project-a" }]
        },
        { projectId: "project-a", branchId: "branch-a" }
      )
    ).toBe(true);
    expect(
      isWithinDataScope(
        {
          userId: "supplier-1",
          roles: [UserRole.SUPPLIER_ADMIN],
          bindings: [{ type: DataScopeType.SUPPLIER, entityId: "supplier-a" }]
        },
        { supplierId: "supplier-b" }
      )
    ).toBe(false);
    expect(
      isWithinDataScope(
        {
          userId: "leader-1",
          roles: [UserRole.GROUP_LEADER],
          bindings: [{ type: DataScopeType.GROUP }]
        },
        { branchId: "any-branch" }
      )
    ).toBe(true);
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
