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

export const realDemoDataUrl = "/demo-data.json";
