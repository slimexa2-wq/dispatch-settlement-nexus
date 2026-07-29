import { afterEach, describe, expect, it } from "vitest";
import { DataScopeType, Permission, UserRole } from "@xiangneng/shared";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  createPrismaMock,
  login,
  passwordHash,
  userFixture
} from "./helpers.js";

const apps: FastifyInstance[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

const now = new Date("2026-07-27T00:00:00.000Z");

function organizationScope(organizationUnitId: string, type = DataScopeType.ORG_UNIT) {
  return {
    type,
    organizationUnitId,
    branchId: null,
    projectId: null,
    supplierId: null,
    isActive: true,
    validFrom: now,
    validTo: null
  };
}

async function scopedUser(input: {
  username: string;
  role?: UserRole;
  organizationUnitId: string;
  permissions?: Permission[];
}) {
  const role = input.role ?? UserRole.INTERNAL_HR;
  return userFixture({
    username: input.username,
    role,
    branchId: null,
    passwordHash: await passwordHash(),
    roleAssignments: [{
      status: "ACTIVE",
      validFrom: now,
      validTo: null,
      role: {
        code: role,
        ...(input.permissions
          ? { permissions: input.permissions.map((code) => ({ permission: { code } })) }
          : {})
      },
      scopes: [organizationScope(input.organizationUnitId)]
    }],
    dataScopeBindings: []
  });
}

describe("内部员工接口", () => {
  it("内部人事只能列出授权业务部门范围内的完整员工档案", async () => {
    const organizationUnitId = "21000000-0000-4000-8000-000000000001";
    const user = await scopedUser({ username: "hr", organizationUnitId });
    let listWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      internalEmployee: {
        findMany: async (raw) => {
          listWhere = (raw as { where: unknown }).where;
          return [{
            id: "30000000-0000-4000-8000-000000000001",
            employeeNo: "XN-NB-0001",
            name: "张伟",
            phone: "13800001001",
            idCard: "510105199001011234",
            status: "ACTIVE",
            onboardDate: new Date("2025-01-01T00:00:00.000Z"),
            organizationUnit: { id: organizationUnitId, name: "人力资源部" },
            position: { id: "position-1", name: "人事专员" }
          }];
        },
        count: async () => 1
      },
      auditLog: { create: async () => ({ id: "audit" }) }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "hr");

    const response = await app.inject({
      method: "GET",
      url: "/api/internal-employees",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        items: [{
          employeeNo: "XN-NB-0001",
          phone: "13800001001",
          idCard: "510105199001011234"
        }],
        pagination: { total: 1 }
      }
    });
    expect(JSON.stringify(listWhere)).toContain(organizationUnitId);
  });

  it("普通档案编辑拒绝绕过调动和账号绑定接口修改组织归属", async () => {
    const organizationUnitId = "21000000-0000-4000-8000-000000000001";
    const employeeId = "30000000-0000-4000-8000-000000000001";
    const user = await scopedUser({ username: "hr-patch", organizationUnitId });
    let updateCalled = false;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      internalEmployee: {
        findFirst: async () => ({
          id: employeeId,
          version: 1,
          organizationUnitId,
          name: "测试员工",
          phone: "13800000001",
          status: "ACTIVE"
        }),
        update: async () => {
          updateCalled = true;
          return {};
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "hr-patch");

    const response = await app.inject({
      method: "PATCH",
      url: `/api/internal-employees/${employeeId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        expectedVersion: 1,
        organizationUnitId: "21000000-0000-4000-8000-000000000099",
        userId: "10000000-0000-4000-8000-000000000099"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(updateCalled).toBe(false);
  });

  it("没有账号管理权限的部门负责人不能在新增员工时绑定系统账号", async () => {
    const organizationUnitId = "21000000-0000-4000-8000-000000000001";
    const user = await scopedUser({
      username: "department-manager-account-bind",
      role: UserRole.DEPARTMENT_MANAGER,
      organizationUnitId,
      permissions: [Permission.INTERNAL_EMPLOYEE_WRITE]
    });
    let createCalled = false;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      internalEmployee: {
        create: async () => {
          createCalled = true;
          return {};
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "department-manager-account-bind");

    const response = await app.inject({
      method: "POST",
      url: "/api/internal-employees",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        employeeNo: "XN-TEST-001",
        name: "测试员工",
        phone: "13800002001",
        idCard: "510105199001011999",
        userId: "10000000-0000-4000-8000-000000000099",
        organizationUnitId,
        positionId: "22000000-0000-4000-8000-000000000001",
        onboardDate: "2026-08-01"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "USER_MANAGE_REQUIRED" } });
    expect(createCalled).toBe(false);
  });

  it("内部人事不能把员工调入授权范围外的业务部门", async () => {
    const organizationUnitId = "21000000-0000-4000-8000-000000000001";
    const targetOrganizationUnitId = "21000000-0000-4000-8000-000000000099";
    const employeeId = "30000000-0000-4000-8000-000000000001";
    const user = await scopedUser({ username: "hr-transfer", organizationUnitId });
    let targetWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      internalEmployee: { findFirst: async () => ({ id: employeeId }) },
      organizationUnit: {
        findFirst: async (raw) => {
          targetWhere = (raw as { where: unknown }).where;
          return null;
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "hr-transfer");

    const response = await app.inject({
      method: "POST",
      url: `/api/internal-employees/${employeeId}/transfer`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        expectedVersion: 1,
        effectiveDate: "2026-08-01",
        organizationUnitId: targetOrganizationUnitId,
        positionId: "22000000-0000-4000-8000-000000000099",
        reason: "跨业务部门调动"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_TRANSFER_TARGET" } });
    expect(JSON.stringify(targetWhere)).toContain(organizationUnitId);
    expect(JSON.stringify(targetWhere)).toContain(targetOrganizationUnitId);
  });

  it("部门负责人读取组织选项时只查询授权业务部门及其下级组织", async () => {
    const organizationUnitId = "21000000-0000-4000-8000-000000000001";
    const user = await scopedUser({
      username: "department-manager",
      role: UserRole.DEPARTMENT_MANAGER,
      organizationUnitId
    });
    let organizationWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      organizationUnit: {
        findMany: async (raw) => {
          organizationWhere = (raw as { where: unknown }).where;
          return [];
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "department-manager");

    const response = await app.inject({
      method: "GET",
      url: "/api/organization/options",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(organizationWhere)).toContain(organizationUnitId);
  });

  it("岗位权限配置只使用账号管理权限对应的部门范围", async () => {
    const manageOrganizationUnitId = "21000000-0000-4000-8000-000000000001";
    const unrelatedOrganizationUnitId = "21000000-0000-4000-8000-000000000002";
    const positionId = "22000000-0000-4000-8000-000000000001";
    const user = userFixture({
      username: "scoped-user-manager",
      role: UserRole.INTERNAL_HR,
      branchId: null,
      passwordHash: await passwordHash(),
      roleAssignments: [
        {
          status: "ACTIVE",
          validFrom: now,
          validTo: null,
          role: {
            code: UserRole.INTERNAL_HR,
            permissions: [{ permission: { code: Permission.USER_MANAGE } }]
          },
          scopes: [organizationScope(manageOrganizationUnitId)]
        },
        {
          status: "ACTIVE",
          validFrom: now,
          validTo: null,
          role: {
            code: UserRole.DEPARTMENT_MANAGER,
            permissions: [{ permission: { code: Permission.ORG_READ } }]
          },
          scopes: [organizationScope(unrelatedOrganizationUnitId)]
        }
      ],
      dataScopeBindings: []
    });
    let positionWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      position: {
        findFirst: async (raw) => {
          positionWhere = (raw as { where: unknown }).where;
          return null;
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "scoped-user-manager");

    const response = await app.inject({
      method: "PUT",
      url: `/api/organization/positions/${positionId}/role-bindings`,
      headers: { authorization: `Bearer ${token}` },
      payload: { bindings: [] }
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.stringify(positionWhere)).toContain(manageOrganizationUnitId);
    expect(JSON.stringify(positionWhere)).not.toContain(unrelatedOrganizationUnitId);
  });

  it("账号绑定只使用内部员工维护权限对应的部门范围", async () => {
    const writeOrganizationUnitId = "21000000-0000-4000-8000-000000000011";
    const manageOrganizationUnitId = "21000000-0000-4000-8000-000000000012";
    const employeeId = "30000000-0000-4000-8000-000000000011";
    const user = userFixture({
      username: "scoped-account-binder",
      role: UserRole.INTERNAL_HR,
      branchId: null,
      passwordHash: await passwordHash(),
      roleAssignments: [
        {
          status: "ACTIVE",
          validFrom: now,
          validTo: null,
          role: {
            code: UserRole.INTERNAL_HR,
            permissions: [{ permission: { code: Permission.INTERNAL_EMPLOYEE_WRITE } }]
          },
          scopes: [organizationScope(writeOrganizationUnitId)]
        },
        {
          status: "ACTIVE",
          validFrom: now,
          validTo: null,
          role: {
            code: UserRole.DEPARTMENT_MANAGER,
            permissions: [{ permission: { code: Permission.USER_MANAGE } }]
          },
          scopes: [organizationScope(manageOrganizationUnitId)]
        }
      ],
      dataScopeBindings: []
    });
    let employeeWhere: unknown;
    const prisma = createPrismaMock({
      user: { findUnique: async () => user },
      internalEmployee: {
        findFirst: async (raw) => {
          employeeWhere = (raw as { where: unknown }).where;
          return null;
        }
      }
    });
    const app = await buildTestApp(prisma);
    apps.push(app);
    const token = await login(app, "scoped-account-binder");

    const response = await app.inject({
      method: "PUT",
      url: `/api/internal-employees/${employeeId}/account`,
      headers: { authorization: `Bearer ${token}` },
      payload: { expectedVersion: 1, userId: null }
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.stringify(employeeWhere)).toContain(writeOrganizationUnitId);
    expect(JSON.stringify(employeeWhere)).not.toContain(manageOrganizationUnitId);
  });
});
