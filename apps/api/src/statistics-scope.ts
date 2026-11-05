import type { Prisma } from "./generated/prisma/client.js";
import { EmploymentStatus, InterviewStatus } from "@xiangneng/shared";
import { chinaDayBounds, chinaMonthBounds } from "./dates.js";

export const personMetricValues = [
  "todayInterview",
  "interviewPassed",
  "active",
  "todayOnboard",
  "todayOffboard",
  "monthOnboard",
  "monthOffboard",
  "interviewAll"
] as const;

export type PersonMetric = (typeof personMetricValues)[number];

export const personAnomalyValues = [
  "active-without-onboard",
  "left-without-offboard",
  "non-left-with-offboard",
  "onboarded-state-mismatch"
] as const;

export type PersonAnomaly = (typeof personAnomalyValues)[number];

export function personAnomalyWhere(anomaly: PersonAnomaly): Prisma.PersonWhereInput {
  switch (anomaly) {
    case "active-without-onboard":
      return { status: EmploymentStatus.ACTIVE, onboardDate: null };
    case "left-without-offboard":
      return { status: EmploymentStatus.LEFT, offboardDate: null };
    case "non-left-with-offboard":
      return { status: { not: EmploymentStatus.LEFT }, offboardDate: { not: null } };
    case "onboarded-state-mismatch":
      return { status: { notIn: [EmploymentStatus.ACTIVE, EmploymentStatus.LEFT] }, onboardDate: { not: null } };
  }
}

export function personMetricWhere(metric: PersonMetric): Prisma.PersonWhereInput {
  const day = chinaDayBounds();
  const month = chinaMonthBounds();
  switch (metric) {
    case "todayInterview": return { interviewDate: { gte: day.start, lt: day.end } };
    case "interviewPassed": return { interviewStatus: InterviewStatus.PASSED };
    case "active": return { status: EmploymentStatus.ACTIVE };
    case "todayOnboard": return { onboardDate: { gte: day.start, lt: day.end } };
    case "todayOffboard": return { offboardDate: { gte: day.start, lt: day.end } };
    case "monthOnboard": return { onboardDate: { gte: month.start, lt: month.end } };
    case "monthOffboard": return { offboardDate: { gte: month.start, lt: month.end } };
    case "interviewAll": return { interviewDate: { not: null } };
  }
}
