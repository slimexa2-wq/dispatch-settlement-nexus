import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { collectProjectIndex, compareGeneratedOutputs, renderIndexFiles } from "./project-tools/index-generator.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const checkOnly = process.argv.includes("--check");
const index = await collectProjectIndex(rootDir);
const outputs = renderIndexFiles(index);

if (checkOnly) {
  const actual = {};
  for (const relativePath of Object.keys(outputs)) {
    try {
      actual[relativePath] = await readFile(path.join(rootDir, relativePath), "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const differences = compareGeneratedOutputs(outputs, actual);
  if (differences.missing.length || differences.stale.length || differences.extra.length) {
    console.error("Project index is stale.");
    if (differences.missing.length) console.error(`Missing: ${differences.missing.join(", ")}`);
    if (differences.stale.length) console.error(`Stale: ${differences.stale.join(", ")}`);
    if (differences.extra.length) console.error(`Extra: ${differences.extra.join(", ")}`);
    process.exit(1);
  }
  console.log(`Project index is current (${index.sourceFingerprint}).`);
} else {
  for (const [relativePath, content] of Object.entries(outputs)) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }
  console.log(`Generated ${Object.keys(outputs).length} project index files (${index.sourceFingerprint}).`);
}
