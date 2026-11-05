import Taro from "@tarojs/taro";
import { runtimeConfig } from "../config/runtime";
import { clearSession, getAccessToken } from "../auth/session";
import type { ApiFailure, ApiSuccess } from "./types";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type RequestOptions = { method?: HttpMethod; data?: unknown; authenticated?: boolean };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isApiFailure(value: unknown): value is ApiFailure {
  return Boolean(
    value &&
      typeof value === "object" &&
      "error" in value &&
      typeof (value as ApiFailure).error?.message === "string"
  );
}

export function queryString(params: Record<string, unknown>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map((item) => `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
    });
  return parts.length ? `?${parts.join("&")}` : "";
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getAccessToken();
  const authenticated = options.authenticated !== false;
  if (authenticated && !token) {
    throw new ApiError("登录已失效，请重新登录", "AUTH_REQUIRED", 401);
  }

  try {
    const response = await Taro.request<ApiSuccess<T> | ApiFailure>({
      url: `${runtimeConfig.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`,
      method: options.method ?? "GET",
      data: options.data,
      timeout: 15000,
      header: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    if (response.statusCode === 401) {
      clearSession();
    }
    if (response.statusCode < 200 || response.statusCode >= 300 || isApiFailure(response.data)) {
      const failure = isApiFailure(response.data) ? response.data : undefined;
      throw new ApiError(
        failure?.error.message ?? `请求失败（${response.statusCode}）`,
        failure?.error.code ?? "HTTP_ERROR",
        response.statusCode,
        failure?.requestId,
        failure?.error.details
      );
    }

    return (response.data as ApiSuccess<T>).data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error ? error.message : "网络不可用，请检查 API 地址和网络设置",
      "NETWORK_ERROR",
      0
    );
  }
}

export async function uploadFile<T>(path: string, filePath: string, name: string): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new ApiError("登录已失效，请重新登录", "AUTH_REQUIRED", 401);
  const response = await Taro.uploadFile({
    url: `${runtimeConfig.apiBaseUrl}${path}`,
    filePath,
    name: "file",
    formData: { originalName: name },
    header: { Authorization: `Bearer ${token}` }
  });
  let body: ApiSuccess<T> | ApiFailure;
  try {
    body = JSON.parse(response.data) as ApiSuccess<T> | ApiFailure;
  } catch {
    throw new ApiError("附件服务返回了无法识别的数据", "INVALID_RESPONSE", response.statusCode);
  }
  if (response.statusCode < 200 || response.statusCode >= 300 || isApiFailure(body)) {
    const failure = isApiFailure(body) ? body : undefined;
    throw new ApiError(
      failure?.error.message ?? "附件上传失败",
      failure?.error.code ?? "UPLOAD_FAILED",
      response.statusCode,
      failure?.requestId,
      failure?.error.details
    );
  }
  return body.data;
}
