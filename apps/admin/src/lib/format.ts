import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import type { ListResult, Nullable } from "../types/domain";

dayjs.extend(utc);

export function formatDate(value: Nullable<string | Date>, fallback = "—"): string {
  if (!value) return fallback;
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY-MM-DD") : fallback;
}

export function formatDateTime(value: Nullable<string | Date>, fallback = "—"): string {
  if (!value) return fallback;
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY-MM-DD HH:mm") : fallback;
}

export function formatMoney(value: Nullable<number | string>): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2
  }).format(amount);
}

export function displayText(value: unknown, fallback = "未设置"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

export function ellipsis(value: Nullable<string>, length = 24): string {
  if (!value) return "—";
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export function projectName(value: { project?: { name?: string } | null; projectName?: string | null }): string {
  return value.project?.name || value.projectName || "未分配项目";
}

export function branchName(value: {
  branch?: { name?: string } | null;
  branchName?: string | null;
  project?: { branch?: { name?: string } | null; branchName?: string | null } | null;
}): string {
  return (
    value.branch?.name ||
    value.branchName ||
    value.project?.branch?.name ||
    value.project?.branchName ||
    "未分配分公司"
  );
}

export function listResult<T>(
  response: T[] | ListResult<T> | { rows?: T[]; total?: number },
  page = 1,
  pageSize = 20
): ListResult<T> {
  if (Array.isArray(response)) {
    return {
      items: response,
      pagination: { page, pageSize, total: response.length }
    };
  }
  if ("items" in response && Array.isArray(response.items)) return response;
  const rowResponse = response as { rows?: T[]; total?: number };
  const rows = rowResponse.rows ?? [];
  return {
    items: rows,
    pagination: { page, pageSize, total: rowResponse.total ?? rows.length }
  };
}

export function toDateValue(value: unknown): string | undefined {
  if (!value) return undefined;
  let parsed: dayjs.Dayjs;
  if (typeof value === "string" && (value.includes("T") || value.includes("+"))) {
    // If it's a timezone-aware ISO string, we parse it as UTC, keeping the original offset structure
    // We then convert it to local time or format it strictly extracting the date part
    // Actually dayjs(value).format('YYYY-MM-DD') converts to local.
    // If we want to prevent timezone shift (e.g. 2026-07-18T00:00:00+08:00 moving to 07-17 in another timezone),
    // we should parse it in UTC, but keep its local date explicitly if it comes from an offset string,
    // or just slice the string up to the 'T' to be extremely robust.
    const datePart = value.split("T")[0];
    parsed = dayjs(datePart);
  } else {
    parsed = dayjs(value as string | Date);
  }
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : undefined;
}
