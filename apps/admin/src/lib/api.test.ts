import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllPages } from "./api";

describe("getAllPages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("遍历全部分页，不丢失第 201 条以后的项目", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input), "http://localhost").searchParams.get("page"));
      const count = page === 1 ? 200 : 43;
      const items = Array.from({ length: count }, (_, index) => ({ id: `${page}-${index}` }));
      return new Response(JSON.stringify({
        data: { items, pagination: { page, pageSize: 200, total: 243, totalPages: 2 } }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAllPages<{ id: string }>("/projects");

    expect(result.items).toHaveLength(243);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.items.at(-1)?.id).toBe("2-42");
  });
});
