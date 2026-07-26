import type { FastifyRequest } from "fastify";
import type { PaginationMeta } from "@xiangneng/shared";
import { paginationSchema } from "@xiangneng/shared";

export function success<T>(request: FastifyRequest, data: T): { data: T; requestId: string } {
  return { data, requestId: request.id };
}

export function parsePagination(query: unknown): { page: number; pageSize: number; skip: number } {
  const { page, pageSize } = paginationSchema.parse(query);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function paginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
  };
}
