import type { JobDemand, Person, Project, Supplier } from "../types/domain";

export type RealDemoData = {
  meta: {
    sourceFile: string;
    sourceHash: string;
    sheetName: string;
    range: string;
    sourceRows: number;
    personMasters: number;
    applicationRecords: number;
    repeatedApplicationRows: number;
    branches: number;
    projectsFromOrg: number;
    totalDemoProjects: number;
    unmatchedProjects: number;
    supplierCount: number;
  };
  branches: Array<{ id: string; name: string }>;
  projects: Project[];
  suppliers: Supplier[];
  people: Person[];
  applications: Array<Record<string, unknown>>;
  jobDemands: JobDemand[];
};

export async function loadRealDemoData(): Promise<RealDemoData> {
  const module = await import("../../../../data/synthetic/demo-data.json");
  const synthetic = module.default as unknown as Omit<RealDemoData, "meta"> & {
    meta: { seed: number; schemaVersion: number };
  };
  return {
    ...synthetic,
    meta: {
      sourceFile: `synthetic-seed-${synthetic.meta.seed}`,
      sourceHash: `synthetic-v${synthetic.meta.schemaVersion}-${synthetic.meta.seed}`,
      sheetName: "公开合成演示数据",
      range: "synthetic",
      sourceRows: synthetic.people.length,
      personMasters: synthetic.people.length,
      applicationRecords: synthetic.applications.length,
      repeatedApplicationRows: Math.max(
        synthetic.applications.length - synthetic.people.length,
        0
      ),
      branches: synthetic.branches.length,
      projectsFromOrg: synthetic.projects.length,
      totalDemoProjects: synthetic.projects.length,
      unmatchedProjects: 0,
      supplierCount: synthetic.suppliers.length
    }
  };
}
