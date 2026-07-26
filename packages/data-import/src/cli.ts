import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readProjectWorkbook, type ProjectWorkbookPreview } from "./project-master.js";
import { validateSyntheticDemoData } from "./synthetic-demo.js";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(packageDirectory, "../../..");
const sourceFile = path.join(
  rootDirectory,
  "docs/source/2-祥能公司架构与项目分布初始化清单.xlsx"
);
const outputDirectory = path.join(rootDirectory, "data/derived");
const mainOutput = path.join(outputDirectory, "organization-projects.json");
const reconciliationOutput = path.join(
  outputDirectory,
  "organization-projects-reconciliation.json"
);
const exceptionOutput = path.join(
  outputDirectory,
  "organization-projects-exceptions.json"
);
const syntheticDemoFile = path.join(rootDirectory, "data/synthetic/demo-data.json");

function compact(preview: ProjectWorkbookPreview): object {
  return {
    sourceFile: path.relative(rootDirectory, preview.sourceFile),
    sourceSha256: preview.sourceSha256,
    sheets: preview.sheets,
    branches: preview.branches,
    reconciliation: preview.reconciliation,
    skippedCount: preview.skipped.length,
    warningCount: preview.warnings.length,
    warnings: preview.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      projectIds: warning.projectIds
    }))
  };
}

async function extract(): Promise<void> {
  const preview = await readProjectWorkbook(sourceFile);
  await mkdir(outputDirectory, { recursive: true });
  const normalized = {
    ...preview,
    sourceFile: path.relative(rootDirectory, preview.sourceFile).replaceAll("\\", "/")
  };
  await writeFile(mainOutput, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await writeFile(
    reconciliationOutput,
    `${JSON.stringify(compact(preview), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    exceptionOutput,
    `${JSON.stringify(
      { sourceSha256: preview.sourceSha256, skipped: preview.skipped, warnings: preview.warnings },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log(JSON.stringify(compact(preview), null, 2));
}

async function verify(): Promise<void> {
  try {
    await access(sourceFile);
    await access(mainOutput);
    const fresh = await readProjectWorkbook(sourceFile);
    const saved = JSON.parse(await readFile(mainOutput, "utf8")) as ProjectWorkbookPreview;
    const checks = {
      mode: "source-workbook-reconciliation",
      sourceSha256: saved.sourceSha256 === fresh.sourceSha256,
      branchCount: saved.reconciliation.branchCount === fresh.reconciliation.branchCount,
      projectCount: saved.projects.length === fresh.projects.length,
      projects:
        JSON.stringify(saved.projects) === JSON.stringify(fresh.projects),
      reconciliation:
        JSON.stringify(saved.reconciliation) === JSON.stringify(fresh.reconciliation)
    };
    console.log(JSON.stringify(checks, null, 2));
    if (Object.values(checks).some((result) => result === false)) process.exitCode = 1;
    return;
  } catch {
    const validation = validateSyntheticDemoData(
      JSON.parse(await readFile(syntheticDemoFile, "utf8"))
    );
    console.log(JSON.stringify({
      mode: "self-contained-synthetic-demo",
      sourceWorkbookAvailable: false,
      ...validation
    }, null, 2));
    if (!validation.valid) process.exitCode = 1;
  }
}

const command = process.argv[2] ?? "preview";
if (command === "extract") {
  await extract();
} else if (command === "verify") {
  await verify();
} else if (command === "preview") {
  console.log(JSON.stringify(compact(await readProjectWorkbook(sourceFile)), null, 2));
} else {
  throw new Error(`未知命令：${command}`);
}
