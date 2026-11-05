import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

export class PublicDataSafetyError extends Error {
  readonly findings: string[];

  constructor(findings: string[]) {
    super(`PUBLIC_DATA_SAFETY: ${findings.join("; ")}`);
    this.name = "PublicDataSafetyError";
    this.findings = findings;
  }
}

const forbiddenSourceMarkers = [
  "唯一数据.xls",
  "唯一数据.xlsx",
  "demo-data.full.json",
  "data/derived/"
];

function inspectValue(value: unknown, path: string, findings: string[]): void {
  if (typeof value === "string") {
    for (const marker of forbiddenSourceMarkers) {
      if (value.toLowerCase().includes(marker.toLowerCase())) {
        findings.push(`${path} references forbidden source marker ${marker}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectValue(item, `${path}[${index}]`, findings));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    inspectValue(child, `${path}.${key}`, findings);
  }
}

export function assertPublicValueSafe(value: unknown, source = "value"): void {
  const findings: string[] = [];
  inspectValue(value, source, findings);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.people)) {
      const meta = record.meta as Record<string, unknown> | undefined;
      if (meta?.synthetic !== true) {
        findings.push(`${source} contains people without meta.synthetic=true`);
      }
      record.people.forEach((person, index) => {
        if (!person || typeof person !== "object" || (person as Record<string, unknown>).synthetic !== true) {
          findings.push(`${source}.people[${index}] is not explicitly synthetic`);
        }
      });
    }
  }
  if (findings.length) throw new PublicDataSafetyError(findings);
}

async function collectJsonFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "coverage", "output"].includes(entry.name)) continue;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
        result.push(fullPath);
      }
    }
  };
  await visit(root);
  return result;
}

export async function assertPublicDataSafe(root: string): Promise<void> {
  const findings: string[] = [];
  const forbiddenPaths = [
    join(root, "data", "derived", "demo-data.full.json"),
    join(root, "apps", "admin", "public", "demo-data.json")
  ];
  for (const path of forbiddenPaths) {
    try {
      if ((await stat(path)).isFile()) findings.push(`${relative(root, path)} must not exist`);
    } catch {
      // Missing is the desired state.
    }
  }
  const legacyScreenshotDirectory = join(root, "apps", "admin", "screenshots");
  try {
    if ((await stat(legacyScreenshotDirectory)).isDirectory()) {
      const entries = await readdir(legacyScreenshotDirectory);
      if (entries.length) {
        findings.push(`${relative(root, legacyScreenshotDirectory)} must not contain runtime screenshots`);
      }
    }
  } catch {
    // Missing is the desired state.
  }

  for (const path of await collectJsonFiles(root)) {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(path, "utf8"));
    } catch {
      continue;
    }
    try {
      assertPublicValueSafe(value, relative(root, path));
    } catch (error) {
      if (error instanceof PublicDataSafetyError) findings.push(...error.findings);
      else throw error;
    }
  }
  if (findings.length) throw new PublicDataSafetyError(findings);
}
