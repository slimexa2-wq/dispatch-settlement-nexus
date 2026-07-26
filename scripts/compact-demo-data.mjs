import { copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicDataPath = resolve(root, "apps/admin/public/demo-data.json");
const fullBackupPath = resolve(root, "data/derived/demo-data.full.json");
const tempPath = `${publicDataPath}.tmp`;

function compactObject(value, omittedKeys = []) {
  const omitted = new Set(omittedKeys);
  return Object.fromEntries(
    Object.entries(value).filter(([key, item]) => {
      if (omitted.has(key)) return false;
      if (item === null || item === undefined || item === "") return false;
      return !(Array.isArray(item) && item.length === 0);
    })
  );
}

const originalRaw = await readFile(publicDataPath, "utf8");
const original = JSON.parse(originalRaw);

await mkdir(dirname(fullBackupPath), { recursive: true });
try {
  await stat(fullBackupPath);
} catch {
  await copyFile(publicDataPath, fullBackupPath);
}

const compact = {
  ...original,
  projects: original.projects.map((project) => compactObject(project)),
  suppliers: original.suppliers.map((supplier) => compactObject(supplier, ["projects"])),
  people: original.people.map((person) => compactObject(person, ["branchName", "projectName", "supplierName", "status"])),
  applications: original.applications.map((application) => compactObject(application, ["person", "jobDemand"])),
  jobDemands: original.jobDemands.map((job) => compactObject(job, ["project"]))
};

if (compact.people.length !== original.meta.personMasters) {
  throw new Error(`人员主档数量不一致：${compact.people.length} / ${original.meta.personMasters}`);
}
if (compact.applications.length !== original.meta.applicationRecords) {
  throw new Error(`报名记录数量不一致：${compact.applications.length} / ${original.meta.applicationRecords}`);
}
if (compact.projects.length !== original.meta.totalDemoProjects) {
  throw new Error(`项目数量不一致：${compact.projects.length} / ${original.meta.totalDemoProjects}`);
}

const compactRaw = JSON.stringify(compact);
await writeFile(tempPath, compactRaw, "utf8");
await copyFile(tempPath, publicDataPath);
await unlink(tempPath);

const originalMB = Buffer.byteLength(originalRaw) / 1024 / 1024;
const compactMB = Buffer.byteLength(compactRaw) / 1024 / 1024;
console.log(JSON.stringify({
  sourceHash: original.meta.sourceHash,
  people: compact.people.length,
  applications: compact.applications.length,
  projects: compact.projects.length,
  originalMB: Number(originalMB.toFixed(2)),
  compactMB: Number(compactMB.toFixed(2)),
  reductionPercent: Number(((1 - compactMB / originalMB) * 100).toFixed(1)),
  backup: fullBackupPath,
  output: publicDataPath
}, null, 2));
