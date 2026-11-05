import { z } from "zod";
import {
  ApplicationSource,
  EmploymentStatus,
  InsuranceType,
  InterviewStatus,
  JobStatus,
  PolicyType,
  ProjectStatus,
  ResponsibilityType,
  RewardStatus,
  SalarySlipStatus,
  UserRole
} from "./enums.js";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

export const idSchema = z.string().uuid();
export const idCardSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^\d{15}$|^\d{17}[\dX]$/.test(value), "身份证号格式不正确");
export const phoneSchema = z
  .string()
  .trim()
  .refine((value) => /^1\d{10}$|^0\d{2,3}-?\d{7,8}$/.test(value), "联系方式格式不正确");
export const dateInputSchema = z.coerce.date();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20)
});

export const loginSchema = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(6).max(128)
});

export const userCreateSchema = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(64),
  role: z.nativeEnum(UserRole),
  branchId: idSchema.optional().nullable(),
  supplierId: idSchema.optional().nullable(),
  personId: idSchema.optional().nullable(),
  projectIds: z.array(idSchema).default([])
});

export const personRegistrationSchema = z.object({
  name: z.string().trim().min(1).max(64),
  idCard: idCardSchema,
  phone: phoneSchema,
  projectId: idSchema,
  jobDemandId: idSchema.optional().nullable(),
  jobTitle: z.string().trim().min(1).max(120),
  interviewDate: dateInputSchema.optional().nullable(),
  supplierId: idSchema.optional().nullable(),
  recommenderUserId: idSchema.optional().nullable(),
  emergencyContactName: optionalText(64),
  emergencyContactPhone: optionalText(32),
  emergencyContactRelation: optionalText(32),
  source: z.nativeEnum(ApplicationSource).default(ApplicationSource.OPERATOR),
  notes: optionalText(2000)
});

export const interviewUpdateSchema = z.object({
  status: z.nativeEnum(InterviewStatus),
  notes: optionalText(2000)
});

export const onboardingSchema = z.object({
  onboardDate: dateInputSchema,
  insuranceTypes: z.array(z.nativeEnum(InsuranceType)).max(3).default([]),
  employeeNo: optionalText(64),
  supplierPolicyId: idSchema.optional().nullable(),
  notes: optionalText(2000)
});

export const offboardingSchema = z.object({
  offboardDate: dateInputSchema,
  offboardReason: z.string().trim().min(1).max(500),
  insuranceTypes: z.array(z.nativeEnum(InsuranceType)).max(3).default([]),
  notes: optionalText(2000)
});

export const projectSchema = z.object({
  sourceProjectId: z.string().trim().min(1).max(64).optional(),
  branchId: idSchema,
  name: z.string().trim().min(1).max(200),
  isExternal: z.boolean().default(false),
  businessType: optionalText(64),
  status: z.nativeEnum(ProjectStatus).optional().nullable(),
  managerName: optionalText(64),
  managerPhone: optionalText(32),
  cooperationStart: dateInputSchema.optional().nullable(),
  cooperationEnd: dateInputSchema.optional().nullable(),
  responsibility: z.nativeEnum(ResponsibilityType).optional().nullable(),
  description: optionalText(3000),
  remark: optionalText(2000)
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: optionalText(64),
  contactPhone: optionalText(32),
  level: optionalText(32),
  projectIds: z.array(idSchema).default([])
});

export const policySchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.nativeEnum(PolicyType),
  projectId: idSchema,
  jobTitle: optionalText(120),
  supplierId: idSchema.optional().nullable(),
  supplierLevel: optionalText(32),
  employeeType: optionalText(64),
  amount: z.coerce.number().nonnegative(),
  achievementConditions: z.string().trim().min(1).max(2000),
  exclusionConditions: optionalText(2000),
  effectiveAt: dateInputSchema,
  expiresAt: dateInputSchema.optional().nullable(),
  notes: optionalText(2000)
});

export const jobDemandSchema = z.object({
  projectId: idSchema,
  title: z.string().trim().min(1).max(120),
  requiredCount: z.coerce.number().int().min(1).max(100000),
  requirements: z.string().trim().min(1).max(5000),
  salary: z.string().trim().min(1).max(500),
  workTime: z.string().trim().min(1).max(500),
  workLocation: z.string().trim().min(1).max(500),
  deadline: dateInputSchema,
  status: z.nativeEnum(JobStatus).default(JobStatus.RECRUITING),
  supplierPolicyId: idSchema.optional().nullable(),
  referralPolicyId: idSchema.optional().nullable(),
  notes: optionalText(2000)
});

export const applicationSchema = personRegistrationSchema.extend({
  jobDemandId: idSchema
});

export const rewardUpdateSchema = z.object({
  status: z.nativeEnum(RewardStatus),
  notes: optionalText(1000)
});

export const salarySlipRowSchema = z.object({
  salaryMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  idCard: idCardSchema.optional(),
  employeeNo: z.string().trim().max(64).optional(),
  grossPay: z.coerce.number(),
  netPay: z.coerce.number(),
  hourlyPay: z.coerce.number().default(0),
  overtimePay: z.coerce.number().default(0),
  allowance: z.coerce.number().default(0),
  referralReward: z.coerce.number().default(0),
  socialSecurityDeduction: z.coerce.number().default(0),
  otherDeduction: z.coerce.number().default(0),
  notes: optionalText(1000),
  status: z.nativeEnum(SalarySlipStatus).default(SalarySlipStatus.DRAFT)
}).refine((row) => row.idCard || row.employeeNo, {
  message: "身份证号和员工编号至少填写一项"
});

export type LoginInput = z.infer<typeof loginSchema>;
export type PersonRegistrationInput = z.infer<typeof personRegistrationSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type PolicyInput = z.infer<typeof policySchema>;
export type JobDemandInput = z.infer<typeof jobDemandSchema>;
export type SalarySlipRowInput = z.infer<typeof salarySlipRowSchema>;

export function normalizeIdCard(value: string): string {
  return value.trim().toUpperCase();
}

export function maskIdCard(value: string): string {
  if (value.length < 8) return "****";
  return `${value.slice(0, 4)}**********${value.slice(-4)}`;
}

export function maskPhone(value: string): string {
  if (value.length !== 11) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

export function monthBounds(month: string): { start: Date; end: Date } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1))
  };
}
