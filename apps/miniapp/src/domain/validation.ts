import type { RegistrationInput } from "../api/types";

export function validateRegistration(input: RegistrationInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("请填写姓名");
  if (!/^\d{15}$|^\d{17}[\dXx]$/.test(input.idCard.trim())) errors.push("身份证号格式不正确");
  if (!/^1\d{10}$/.test(input.phone.trim())) errors.push("手机号格式不正确");
  if (!input.projectId) errors.push("请选择项目");
  if (!input.jobTitle.trim()) errors.push("请选择或填写岗位");
  return errors;
}

export function normalizeRegistration(input: RegistrationInput): RegistrationInput {
  return {
    ...input,
    name: input.name.trim(),
    idCard: input.idCard.trim().toUpperCase(),
    phone: input.phone.trim(),
    jobTitle: input.jobTitle.trim(),
    emergencyContactName: input.emergencyContactName?.trim() || null,
    emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
    emergencyContactRelation: input.emergencyContactRelation?.trim() || null,
    notes: input.notes?.trim() || null
  };
}
