import type { DashboardData, StatPoint } from "../types/domain";
import { labels } from "@xiangneng/shared";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null ? undefined : number(value);
}

function points(value: unknown): StatPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    const status = typeof row.status === "string" ? row.status : undefined;
    const name = typeof row.name === "string"
      ? row.name
      : status
        ? (labels.employmentStatus as Record<string, string>)[status] ?? status
        : undefined;
    if (!name) return [];
    return [{
      name,
      value: number(row.value ?? row.count),
      branchId: typeof row.branchId === "string" ? row.branchId : undefined,
      projectId: typeof row.projectId === "string" ? row.projectId : undefined,
      supplierId: typeof row.supplierId === "string" ? row.supplierId : undefined,
      status
    }];
  });
}

export function statPointPeoplePath(point: StatPoint): string | undefined {
  if (point.branchId) return `/people?branchId=${encodeURIComponent(point.branchId)}`;
  if (point.projectId) return `/people?projectId=${encodeURIComponent(point.projectId)}`;
  if (point.supplierId) return `/people?supplierId=${encodeURIComponent(point.supplierId)}`;
  if (point.status) return `/people?status=${encodeURIComponent(point.status)}`;
  return undefined;
}

export function metricPeoplePath(metric: string, range?: { from?: string; to?: string }): string {
  const params = new URLSearchParams({ metric });
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  return `/people?${params.toString()}`;
}

export function normalizeStatistics(raw: unknown): DashboardData {
  const source = record(raw);
  const cards = record(source.cards);
  const recruitment = record(source.recruitment);
  const trendSource = Array.isArray(source.sevenDayTrend)
    ? source.sevenDayTrend
    : Array.isArray(source.trend)
      ? source.trend
      : [];

  return {
    todayInterviews: number(source.todayInterviews ?? cards.todayInterview),
    interviewPassed: number(source.interviewPassed ?? cards.interviewPassed),
    activePeople: number(source.activePeople ?? cards.active),
    todayOnboard: number(source.todayOnboard ?? cards.todayOnboard),
    todayOffboard: number(source.todayOffboard ?? cards.todayOffboard),
    monthOffboard: number(source.monthOffboard ?? cards.monthOffboard),
    sevenDayTrend: trendSource.map((item) => {
      const row = record(item);
      return {
        date: String(row.date ?? ""),
        onboard: number(row.onboard ?? row.onboarded),
        offboard: number(row.offboard ?? row.offboarded)
      };
    }),
    branchActive: points(source.branchActive),
    statusDistribution: points(source.statusDistribution),
    projectTop: points(source.projectTop ?? source.projectTop5),
    supplierTop: points(source.supplierTop ?? source.supplierTop5),
    anomalies: Array.isArray(source.anomalies)
      ? source.anomalies.map((item) => {
          const row = record(item);
          return {
            id: String(row.id ?? "unknown-anomaly"),
            type: String(row.type ?? "数据异常"),
            scopeName: String(row.scopeName ?? "当前筛选范围"),
            expected: number(row.expected),
            actual: number(row.actual),
            difference: number(row.difference),
            personIds: Array.isArray(row.personIds)
              ? row.personIds.filter((personId): personId is string => typeof personId === "string")
              : undefined
          };
        })
      : undefined,
    recruitment: {
      requiredCount: optionalNumber(recruitment.requiredCount ?? recruitment.required),
      applicationCount: optionalNumber(recruitment.applicationCount ?? recruitment.applications),
      onboardCount: optionalNumber(recruitment.onboardCount ?? recruitment.onboarded),
      remainingCount: optionalNumber(recruitment.remainingCount ?? recruitment.remainingGap)
    },
    pendingItems: Array.isArray(source.pendingItems)
      ? source.pendingItems.map((item) => {
          const row = record(item);
          const metric = typeof row.metric === "string" ? row.metric : undefined;
          return {
            id: String(row.id ?? row.key ?? row.title ?? "pending-item"),
            type: typeof row.type === "string" ? row.type : undefined,
            title: String(row.title ?? "待处理事项"),
            count: optionalNumber(row.count),
            level: (row.level ?? row.severity) as "info" | "warning" | "error" | undefined,
            path: typeof row.path === "string"
              ? row.path
              : metric === "jobDemand"
                ? "/recruitment/demands"
                : metric
                  ? `/people?metric=${encodeURIComponent(metric)}`
                  : undefined
          };
        })
      : undefined
  };
}
