export type DeletionFacts = {
  hasUser: boolean;
  changeCount: number;
  businessRecordCount: number;
};

export function canPhysicallyDeleteInternalEmployee(facts: DeletionFacts): boolean {
  return !facts.hasUser && facts.changeCount === 0 && facts.businessRecordCount === 0;
}

export type TransferAssignment = {
  id: string;
  departmentId: string | null;
  scope: "SELF" | "DEPARTMENT" | "BRANCH" | "GROUP";
  isActive: boolean;
};

export function createImmediateTransferPlan(input: {
  oldDepartmentId: string | null;
  nextDepartmentId: string | null;
  assignments: readonly TransferAssignment[];
}) {
  return {
    nextDepartmentId: input.nextDepartmentId,
    assignmentIdsToDeactivate: input.assignments
      .filter((assignment) =>
        assignment.isActive &&
        assignment.scope === "DEPARTMENT" &&
        Boolean(input.oldDepartmentId) &&
        assignment.departmentId === input.oldDepartmentId
      )
      .map((assignment) => assignment.id)
  };
}

export function normalizeRosterStatus(value: unknown): "ACTIVE" | "LEFT" | "SUSPENDED" {
  const text = String(value ?? "").trim();
  if (text.includes("离职")) return "LEFT";
  if (text.includes("停") || text.includes("休")) return "SUSPENDED";
  return "ACTIVE";
}
