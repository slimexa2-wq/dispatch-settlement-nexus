import { UserRole, type SessionUser } from "@xiangneng/shared";
import { AppError } from "../errors.js";
import type { AiSkill } from "./types.js";

const readSkills: AiSkill[] = [
  "project_personnel_statistics",
  "employee_information_query",
  "recruitment_progress_query"
];

export function allowedAiSkills(user: SessionUser): AiSkill[] {
  switch (user.role) {
    case UserRole.HEADQUARTERS_MANAGER:
    case UserRole.BRANCH_MANAGER:
      return readSkills;
    case UserRole.PROJECT_OPERATOR:
    case UserRole.SYSTEM_ADMIN:
      return [...readSkills, "employee_entry", "employee_resignation"];
    case UserRole.SUPPLIER:
    case UserRole.EMPLOYEE:
      return ["employee_information_query"];
    default:
      return [];
  }
}

export function assertAiSkillAllowed(user: SessionUser, skill: AiSkill): void {
  if (!allowedAiSkills(user).includes(skill)) {
    throw new AppError(403, "AI_SKILL_FORBIDDEN", "当前角色没有使用该 AI 能力的权限");
  }
}

export function aiScopeSummary(user: SessionUser): Record<string, unknown> {
  return {
    role: user.role,
    branchId: user.branchId,
    supplierId: user.supplierId,
    personId: user.personId,
    projectIds: user.projectIds
  };
}
