import { DEMO_TOKEN, demoDownload, handleDemoRequest } from "./demo";

const TOKEN_KEY = "xiangneng.admin.token";

type QueryValue = string | number | boolean | null | undefined | Array<string | number>;
export type Query = Record<string, QueryValue>;

type ApiEnvelope<T> = { data: T; requestId?: string };
type ApiErrorEnvelope = {
  error?: { code?: string; message?: string; details?: unknown };
  message?: string;
  requestId?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      details?: unknown;
      requestId?: string;
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "REQUEST_FAILED";
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE = (configuredBase || "/api").replace(/\/$/, "");

export type PaginatedResult<T> = {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages?: number };
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isDemoSession(): boolean {
  return getToken() === DEMO_TOKEN;
}

function parseDemoBody(body: BodyInit | null | undefined): unknown {
  if (!body || body instanceof FormData) return undefined;
  try {
    return JSON.parse(String(body));
  } catch {
    return undefined;
  }
}

function buildUrl(path: string, query?: Query): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE}${normalizedPath}`;
  if (!query) return url;

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, rawValue]) => {
    if (rawValue === undefined || rawValue === null || rawValue === "") return;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    values.forEach((value) => params.append(key, String(value)));
  });
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

function isEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return Boolean(value && typeof value === "object" && "data" in value);
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorEnvelope | undefined;
  try {
    body = (await response.json()) as ApiErrorEnvelope;
  } catch {
    body = undefined;
  }
  const message =
    body?.error?.message || body?.message || `请求失败（HTTP ${response.status}）`;
  return new ApiError(message, {
    status: response.status,
    code: body?.error?.code,
    details: body?.error?.details,
    requestId: body?.requestId
  });
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Query } = {}
): Promise<T> {
  const method = init.method ?? "GET";
  if (isDemoSession()) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const [demoPath, search = ""] = normalized.split("?", 2);
    const demoQuery: Query = { ...(init.query ?? {}) };
    new URLSearchParams(search).forEach((value, key) => {
      demoQuery[key] = value;
    });
    return await handleDemoRequest<T>(
      method,
      demoPath ?? normalized,
      demoQuery,
      parseDemoBody(init.body)
    );
  }

  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const isFormData = init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  let response: Response;
  try {
    response = await fetch(buildUrl(path, init.query), { ...init, headers });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? `无法连接服务器：${error.message}` : "无法连接服务器",
      { code: "NETWORK_ERROR" }
    );
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return (await response.text()) as T;
  }
  const body = (await response.json()) as unknown;
  return isEnvelope<T>(body) ? body.data : (body as T);
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export const api = {
  get<T>(path: string, query?: Query, signal?: AbortSignal) {
    return request<T>(path, { method: "GET", query, signal });
  },
  post<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : jsonBody(body),
      signal
    });
  },
  put<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, {
      method: "PUT",
      body: body === undefined ? undefined : jsonBody(body),
      signal
    });
  },
  patch<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : jsonBody(body),
      signal
    });
  },
  delete<T>(path: string, signal?: AbortSignal) {
    return request<T>(path, { method: "DELETE", signal });
  },
  upload<T>(path: string, formData: FormData, signal?: AbortSignal) {
    return request<T>(path, { method: "POST", body: formData, signal });
  },
  async download(path: string, query?: Query): Promise<{ blob: Blob; fileName: string }> {
    if (isDemoSession()) {
      const normalized = path.replace(/^\//, "").replace(/[^\w-]+/g, "-") || "download";
      return demoDownload(`${normalized}.txt`);
    }
    const token = getToken();
    const response = await fetch(buildUrl(path, query), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) throw await parseError(response);
    const disposition = response.headers.get("content-disposition") ?? "";
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    const encodedName = utf8Match?.[1] ?? plainMatch?.[1] ?? "download.xlsx";
    let fileName = encodedName;
    try {
      fileName = decodeURIComponent(encodedName);
    } catch {
      fileName = encodedName;
    }
    return { blob: await response.blob(), fileName };
  }
};

export async function getAllPages<T>(path: string, query: Query = {}): Promise<PaginatedResult<T>> {
  const pageSize = isDemoSession() ? 50_000 : 200;
  const first = await api.get<PaginatedResult<T> | T[]>(path, { ...query, page: 1, pageSize });
  if (Array.isArray(first)) {
    return { items: first, pagination: { page: 1, pageSize: first.length || pageSize, total: first.length, totalPages: 1 } };
  }
  const totalPages = first.pagination.totalPages ?? Math.ceil(first.pagination.total / Math.max(first.pagination.pageSize, 1));
  if (totalPages <= 1) return first;
  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      api.get<PaginatedResult<T> | T[]>(path, { ...query, page: index + 2, pageSize })
    )
  );
  const items = first.items.concat(...remaining.map((page) => Array.isArray(page) ? page : page.items));
  return { items, pagination: { page: 1, pageSize: items.length || pageSize, total: first.pagination.total, totalPages: 1 } };
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
