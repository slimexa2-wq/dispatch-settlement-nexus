import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSyntheticDemoData } from "./lib/synthetic-demo-data.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "data", "synthetic", "demo-data.json");
const data = generateSyntheticDemoData(20260726);
const serialized = `${JSON.stringify(data, null, 2)}\n`;
const sourceSha256 = createHash("sha256").update(serialized).digest("hex");
const branchCounts = new Map<string, { total: number; external: number }>();
for (const project of data.projects) {
  const branchName = String(project.branchName);
  const count = branchCounts.get(branchName) ?? { total: 0, external: 0 };
  count.total += 1;
  if (project.isExternal) count.external += 1;
  branchCounts.set(branchName, count);
}
const organizationArtifact = {
  schemaVersion: 1,
  sourceFile: "data/synthetic/demo-data.json",
  sourceSha256,
  branches: [...branchCounts].map(([name, count]) => ({
    name,
    projectCount: count.total,
    externalProjectCount: count.external,
    nonExternalProjectCount: count.total - count.external
  })),
  projects: data.projects.map((project, index) => ({
    sourceRow: index + 3,
    sourceNo: index + 1,
    sourceProjectId: project.sourceProjectId,
    branchName: project.branchName,
    projectName: project.name,
    isExternal: project.isExternal,
    businessType: project.businessType,
    projectStatus: project.status,
    managerName: project.managerName,
    managerPhone: project.managerPhone,
    cooperationStart: project.cooperationStart,
    cooperationEnd: project.cooperationEnd ?? "2028-12-31",
    responsibility: project.responsibility,
    remark: project.remark
  })),
  skipped: [],
  warnings: [],
  reconciliation: {
    branchCount: branchCounts.size,
    projectCount: data.projects.length,
    externalProjectCount: data.projects.filter((project) => project.isExternal).length,
    nonExternalProjectCount: data.projects.filter((project) => !project.isExternal).length,
    summaryMatchesDetail: true,
    duplicateProjectIdCount: 0,
    duplicateBranchProjectNameCount: 0,
    duplicateGlobalProjectNameCount: 0,
    missingBusinessTypeCount: 0,
    missingMaintenanceFieldProjectCount: 0
  }
};
const organizationOutput = resolve(root, "data", "synthetic", "organization-projects.json");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, serialized, "utf8");
await writeFile(organizationOutput, `${JSON.stringify(organizationArtifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output,
  organizationOutput,
  synthetic: data.meta.synthetic,
  people: data.people.length,
  projects: data.projects.length,
  suppliers: data.suppliers.length
}));
