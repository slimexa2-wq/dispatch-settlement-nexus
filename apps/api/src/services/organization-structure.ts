export type OrganizationUnitScopeRecord = {
  id: string;
  type: string;
  parent?: { id: string; type: string } | null;
};

const centerChildTypes = new Set([
  "DEPARTMENT",
  "BUSINESS_DEPARTMENT",
  "BRANCH",
  "SUBSIDIARY",
  "OTHER"
]);

export function resolveOrganizationScopeIds(
  unit: OrganizationUnitScopeRecord,
  needsCenter: boolean
): { organizationUnitId: string; centerId: string | null } | null {
  if (!needsCenter) {
    return { organizationUnitId: unit.id, centerId: null };
  }
  if (unit.type === "CENTER") {
    return { organizationUnitId: unit.id, centerId: unit.id };
  }
  if (centerChildTypes.has(unit.type) && unit.parent?.type === "CENTER") {
    return { organizationUnitId: unit.id, centerId: unit.parent.id };
  }
  return null;
}
