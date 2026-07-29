import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { analyzeArchitecture } from "./project-tools/architecture-check.mjs";
import { listProjectFiles, loadModuleRegistry } from "./project-tools/core.mjs";
import { collectProjectIndex, compareGeneratedOutputs, renderIndexFiles } from "./project-tools/index-generator.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const registry = await loadModuleRegistry(rootDir);
const projectFiles = await listProjectFiles(rootDir);
const existingFiles = new Set(projectFiles);
const index = await collectProjectIndex(rootDir);
const expectedOutputs = renderIndexFiles(index);
const actualOutputs = {};
for (const relativePath of Object.keys(expectedOutputs)) {
  try {
    actualOutputs[relativePath] = await readFile(path.join(rootDir, relativePath), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
const generatedDifferences = compareGeneratedOutputs(expectedOutputs, actualOutputs);
const result = analyzeArchitecture({
  registry,
  projectFiles,
  existingFiles,
  generatedDifferences,
  largeFiles: index.largeFiles
});

if (result.errors.length) {
  console.error(`Architecture check failed with ${result.errors.length} error(s):`);
  for (const error of result.errors) console.error(`- ${error}`);
}
if (result.warnings.length) {
  console.warn(`Architecture check produced ${result.warnings.length} warning(s):`);
  for (const warning of result.warnings) console.warn(`- ${warning}`);
}
if (!result.valid) process.exit(1);
console.log(`Architecture check passed for ${registry.modules.length} modules (${index.sourceFingerprint}).`);
