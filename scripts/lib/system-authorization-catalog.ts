import {
  Permission,
  UserRole,
  labels,
  rolePermissions,
  type UserRole as UserRoleValue
} from "../../packages/shared/src/index.ts";

type AuthorizationPrisma = {
  permissionDefinition: {
    upsert(args: Record<string, unknown>): Promise<{ id: string }>;
  };
  role: {
    upsert(args: Record<string, unknown>): Promise<{ id: string }>;
  };
  rolePermission: {
    createMany(args: Record<string, unknown>): Promise<unknown>;
  };
};

export type SystemAuthorizationCatalog = {
  permissionIds: Map<string, string>;
  roleIds: Map<UserRoleValue, string>;
};

export async function ensureSystemAuthorizationCatalog(
  prisma: AuthorizationPrisma,
  deterministicId: (source: string) => string
): Promise<SystemAuthorizationCatalog> {
  const permissionIds = new Map<string, string>();
  for (const code of Object.values(Permission)) {
    const permission = await prisma.permissionDefinition.upsert({
      where: { code },
      create: {
        id: deterministicId(`permission:${code}`),
        code,
        name: code,
        module: code.split(":")[0] ?? "system",
        description: "系统确定性权限定义"
      },
      update: {
        module: code.split(":")[0] ?? "system"
      }
    });
    permissionIds.set(code, permission.id);
  }

  const roleIds = new Map<UserRoleValue, string>();
  for (const code of Object.values(UserRole)) {
    const role = await prisma.role.upsert({
      where: { code },
      create: {
        id: deterministicId(`role:${code}`),
        code,
        name: labels.roles[code],
        description: "祥能系统岗位与职责角色",
        isSystem: true
      },
      update: {
        name: labels.roles[code],
        description: "祥能系统岗位与职责角色",
        isSystem: true,
        isActive: true
      }
    });
    roleIds.set(code, role.id);
    await prisma.rolePermission.createMany({
      data: rolePermissions[code].map((permissionCode) => ({
        roleId: role.id,
        permissionId: permissionIds.get(permissionCode)!
      })),
      skipDuplicates: true
    });
  }

  return { permissionIds, roleIds };
}
