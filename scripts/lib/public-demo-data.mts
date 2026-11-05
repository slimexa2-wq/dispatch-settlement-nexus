import { readFile } from "node:fs/promises";
import { assertPublicValueSafe } from "./public-data-safety.mjs";
import type { SyntheticDemoData } from "./synthetic-demo-data.mjs";

const requiredCollections = [
  "branches",
  "projects",
  "suppliers",
  "people",
  "applications",
  "jobDemands",
  "internalEmployees"
] as const;

export function parsePublicDemoData(value: unknown): SyntheticDemoData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PUBLIC_DEMO_DATA_INVALID: root must be an object");
  }
  const record = value as Record<string, unknown>;
  const meta = record.meta as Record<string, unknown> | undefined;
  if (
    meta?.synthetic !== true
    || meta.generatedFor !== "public-demo"
    || meta.schemaVersion !== 1
  ) {
    throw new Error("PUBLIC_DEMO_DATA_INVALID: explicit synthetic metadata is required");
  }
  for (const key of requiredCollections) {
    if (!Array.isArray(record[key])) {
      throw new Error(`PUBLIC_DEMO_DATA_INVALID: ${key} must be an array`);
    }
  }
  assertPublicValueSafe(value, "public-demo-data");
  return value as SyntheticDemoData;
}

export async function loadPublicDemoData(path: string): Promise<SyntheticDemoData> {
  const raw = await readFile(path, "utf8");
  return parsePublicDemoData(JSON.parse(raw) as unknown);
}

