import {
  AccessRequestStatus,
  DataScopeType,
  PermissionProvisionTaskStatus,
  PortalType,
  RoleAssignmentSource,
  type Prisma,
  type PrismaClient
} from "../generated/prisma/client.js";
import { buildAccessProvisionPlan, type AccessRequestInput } from "./access-provisioning.js";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function scopeData(scope: { type: string; entityId: string | null }) {
  const base = {
    type: scope.type as DataScopeType,
    organizationUnitId: null as string | null,
    branchId: null as string | null,
    projectId: null as string | null,
    supplierId: null as string | null
  };
  if (scope.type === DataScopeType.ORG_UNIT || scope.type === DataScopeType.CENTER) base.organizationUnitId = scope.entityId;
  if (scope.type === DataScopeType.BRANCH) base.branchId = scope.entityId;
  if (scope.type === DataScopeType.PROJECT) base.projectId = scope.entityId;
  if (scope.type === DataScopeType.SUPPLIER) base.supplierId = scope.entityId;
  return base;
}

export async function provisionAccessRequest(prisma: PrismaClient, requestId: string, actorId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.accessRequest.findUnique({
      where: { id: requestId },
      include: { provisionTasks: true }
    });
    if (!request) throw new Error("权限申请不存在");
    if ([AccessRequestStatus.COMPLETED, AccessRequestStatus.REVOKED].includes(request.status)) return request;
    if (![AccessRequestStatus.APPROVED, AccessRequestStatus.PROVISIONING].includes(request.status)) {
      throw new Error("权限申请尚未审批通过");
    }

    const input: AccessRequestInput = {
      subjectUserId: request.subjectUserId,
      portals: request.portals as string[],
      roles: request.roles as string[],
      scopes: request.scopes as Array<{ type: string; entityId?: string | null }>,
      validFrom: request.validFrom.toISOString(),
      validTo: request.validTo?.toISOString() ?? null,
      reason: request.reason
    };
    const plan = buildAccessProvisionPlan(input);
    await tx.accessRequest.update({ where: { id: request.id }, data: { status: AccessRequestStatus.PROVISIONING } });

    const existingTasks = new Map(request.provisionTasks.map((task) => [task.action, task]));
    const ensureTask = async (action: string, payload: unknown) => {
      const current = existingTasks.get(action);
      if (current) {
        return tx.permissionProvisionTask.update({
          where: { id: current.id },
          data: { status: PermissionProvisionTaskStatus.RUNNING, payload: json(payload), attemptedAt: new Date(), error: null }
        });
      }
      return tx.permissionProvisionTask.create({
        data: {
          accessRequestId: request.id,
          action,
          status: PermissionProvisionTaskStatus.RUNNING,
          payload: json(payload),
          attemptedAt: new Date()
        }
      });
    };

    const portalTask = await ensureTask("GRANT_PORTALS", plan.portalChanges);
    for (const item of plan.portalChanges) {
      await tx.userPortalAccess.create({
        data: {
          userId: request.subjectUserId,
          portal: item.portal as PortalType,
          enabled: true,
          source: "ACCESS_REQUEST",
          validFrom: new Date(item.validFrom),
          validTo: item.validTo ? new Date(item.validTo) : null,
          grantedById: actorId ?? null,
          accessRequestId: request.id
        }
      });
    }
    await tx.permissionProvisionTask.update({ where: { id: portalTask.id }, data: { status: PermissionProvisionTaskStatus.COMPLETED, completedAt: new Date() } });

    const roleTask = await ensureTask("GRANT_ROLES", plan.roleAssignments);
    const roleRecords = await tx.role.findMany({ where: { code: { in: plan.roleAssignments.map((item) => item.roleCode) }, isActive: true } });
    const rolesByCode = new Map(roleRecords.map((role) => [role.code, role]));
    for (const item of plan.roleAssignments) {
      const role = rolesByCode.get(item.roleCode);
      if (!role) throw new Error(`角色不存在或已停用：${item.roleCode}`);
      await tx.userRoleAssignment.create({
        data: {
          userId: request.subjectUserId,
          roleId: role.id,
          source: item.source as RoleAssignmentSource,
          status: "ACTIVE",
          validFrom: new Date(item.validFrom),
          validTo: item.validTo ? new Date(item.validTo) : null,
          createdById: actorId ?? null,
          accessRequestId: request.id
        }
      });
    }
    await tx.permissionProvisionTask.update({ where: { id: roleTask.id }, data: { status: PermissionProvisionTaskStatus.COMPLETED, completedAt: new Date() } });

    const scopeTask = await ensureTask("GRANT_SCOPES", plan.scopeBindings);
    for (const item of plan.scopeBindings) {
      await tx.dataScopeBinding.create({
        data: {
          userId: request.subjectUserId,
          ...scopeData(item),
          validFrom: new Date(item.validFrom),
          validTo: item.validTo ? new Date(item.validTo) : null,
          createdById: actorId ?? null,
          accessRequestId: request.id
        }
      });
    }
    await tx.permissionProvisionTask.update({ where: { id: scopeTask.id }, data: { status: PermissionProvisionTaskStatus.COMPLETED, completedAt: new Date() } });

    return tx.accessRequest.update({
      where: { id: request.id },
      data: { status: AccessRequestStatus.COMPLETED, provisionedAt: new Date() },
      include: { provisionTasks: true, portalAccesses: true }
    });
  });
}

export async function revokeAccessRequest(prisma: PrismaClient, requestId: string, actorId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.accessRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error("权限申请不存在");
    if (request.status !== AccessRequestStatus.COMPLETED) throw new Error("只有已开通权限可以回收");
    const now = new Date();
    await tx.userPortalAccess.updateMany({ where: { accessRequestId: requestId, enabled: true }, data: { enabled: false, validTo: now } });
    await tx.userRoleAssignment.updateMany({
      where: { accessRequestId: requestId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now, revokedById: actorId }
    });
    await tx.dataScopeBinding.updateMany({
      where: { accessRequestId: requestId, isActive: true },
      data: { isActive: false, revokedAt: now, revokedById: actorId }
    });
    return tx.accessRequest.update({
      where: { id: requestId },
      data: { status: AccessRequestStatus.REVOKED, reviewedById: actorId, reviewedAt: now, reviewComment: reason }
    });
  });
}
