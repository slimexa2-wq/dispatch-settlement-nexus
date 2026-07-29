import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadModuleRegistry } from "./project-tools/core.mjs";
import { buildContextData, renderContextPack } from "./project-tools/context-builder.mjs";
import { collectProjectIndex } from "./project-tools/index-generator.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const args = process.argv.slice(2);
const moduleId = args.find((arg) => !arg.startsWith("--"));
if (!moduleId) {
  console.error("Usage: node scripts/build-ai-context.mjs <module-id> [--output <path>]");
  process.exit(1);
}

const outputIndex = args.indexOf("--output");
const outputPath = outputIndex >= 0
  ? args[outputIndex + 1]
  : `docs/generated/context/${moduleId}-context.md`;
if (!outputPath) {
  console.error("--output requires a path");
  process.exit(1);
}

const registry = await loadModuleRegistry(rootDir);
const index = await collectProjectIndex(rootDir);
const relevantDocumentPaths = new Set([
  "AI_PROJECT_MAP.md",
  ...registry.modules.flatMap((module) => [
    `docs/modules/${module.id}/MODULE.md`,
    ...(module.businessRules ?? [])
  ])
]);
const documents = {};
for (const relativePath of relevantDocumentPaths) {
  try {
    documents[relativePath] = await readFile(path.join(rootDir, relativePath), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const data = buildContextData({ registry, index, moduleId, documents });
const output = renderContextPack(data);
const absoluteOutput = path.resolve(rootDir, outputPath);
await mkdir(path.dirname(absoluteOutput), { recursive: true });
await writeFile(absoluteOutput, output, "utf8");
console.log(`Generated AI context for ${moduleId}: ${path.relative(rootDir, absoluteOutput)}`);
