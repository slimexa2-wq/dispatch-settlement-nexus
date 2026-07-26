import type { UserRole as UserRoleValue } from "./enums.js";
import type { Permission } from "./permissions.js";

export type ApiSuccess<T> = { data: T; requestId: string };
export type ApiFailure = {
  error: { code: string; message: string; details?: unknown };
  requestId: string;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = { items: T[]; pagination: PaginationMeta };

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRoleValue;
  branchId: string | null;
  supplierId: string | null;
  personId: string | null;
  employeeType: string | null;
  projectIds: string[];
  permissions: Permission[];
};

export type ImportPreview<T> = {
  sourceFile: string;
  sourceHash: string;
  totalRows: number;
  accepted: T[];
  skipped: Array<{ row: number; reason: string }>;
  warnings: Array<{ row?: number; code: string; message: string }>;
  reconciliation: Record<string, number>;
};
