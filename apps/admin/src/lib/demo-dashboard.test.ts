import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DashboardData, Person, Project } from "../types/domain";
import type { PaginatedResult } from "./api";
import { handleDemoRequest } from "./demo";

const nativeFetch = globalThis.fetch;

describe("演示看板筛选", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (url.endsWith("/demo-data.json")) {
        const json = await readFile(resolve(process.cwd(), "../../data/synthetic/demo-data.json"), "utf-8");
        return new Response(json, { headers: { "content-type": "application/json" } });
      }
      return nativeFetch(input);
    });
  });

  it("项目筛选会同步收窄统计卡片和排行数据", async () => {
    const all = await handleDemoRequest<DashboardData>("GET", "/statistics/overview", {});
    const projectPage = await handleDemoRequest<PaginatedResult<Project>>("GET", "/projects", { page: 1, pageSize: 200 });
    const project = projectPage.items.find((item) => item.activeCount && item.activeCount > 0);

    expect(project).toBeTruthy();
    const scoped = await handleDemoRequest<DashboardData>("GET", "/statistics/overview", { projectId: project!.id });

    expect(scoped.activePeople ?? 0).toBeLessThanOrEqual(all.activePeople ?? 0);
    expect(scoped.projectTop?.length).toBe(1);
    expect(scoped.projectTop?.[0]?.projectId).toBe(project!.id);
    expect(scoped.statusDistribution?.reduce((sum, item) => sum + item.value, 0)).toBeLessThanOrEqual(
      all.statusDistribution?.reduce((sum, item) => sum + item.value, 0) ?? 0
    );
  }, 20000);
  it("branch ranking is sorted by active people descending", async () => {
    const dashboard = await handleDemoRequest<DashboardData>("GET", "/statistics/overview", {});
    const values = dashboard.branchActive?.map((item) => item.value) ?? [];

    expect(values.length).toBeGreaterThan(0);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  }, 20000);

  it("people list is sorted by interview date and only self-recruit people keep recommenders", async () => {
    const page = await handleDemoRequest<PaginatedResult<Person>>("GET", "/people", { page: 1, pageSize: 200 });
    const dates = page.items.map((person) => person.interviewDate ?? "");
    const supplierPeople = page.items.filter((person) => {
      const supplierName = person.supplier?.name ?? person.supplierName ?? "";
      return supplierName && !supplierName.includes("自招");
    });
    const selfRecruitPeople = page.items.filter((person) => {
      const supplierName = person.supplier?.name ?? person.supplierName ?? "";
      return supplierName.includes("自招");
    });

    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
    expect(supplierPeople.every((person) => !person.recommenderName && !person.recommenderUserId)).toBe(true);
    expect(selfRecruitPeople.some((person) => person.recommenderName)).toBe(true);
  }, 20000);
});
