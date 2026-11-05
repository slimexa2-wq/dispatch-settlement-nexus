import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(projectDir, "..", "..");
const stageDir = join(projectDir, ".stage");
const distDir = join(projectDir, "dist");
const clientDir = join(distDir, "client");
const packageRunner = "pnpm";

function run(args, extraEnv = {}) {
  const result = spawnSync(packageRunner, args, {
    cwd: workspaceRoot,
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${packageRunner} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function removeSourceMaps(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await removeSourceMaps(path);
    else if (entry.name.endsWith(".map")) await rm(path);
  }
}

async function assetSummary(directory) {
  let files = 0;
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await assetSummary(path);
      files += nested.files;
      bytes += nested.bytes;
    } else {
      files += 1;
      bytes += (await stat(path)).size;
    }
  }
  return { files, bytes };
}

async function artifactText(directory) {
  let output = "";
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      output += await artifactText(path);
    } else if (/\.(?:html|js|json|css)$/.test(entry.name)) {
      output += await readFile(path, "utf8");
    }
  }
  return output;
}

await rm(stageDir, { recursive: true, force: true });
await rm(distDir, { recursive: true, force: true });
await mkdir(stageDir, { recursive: true });

run(
  ["--filter", "@xiangneng/portal", "exec", "vite", "build", "--base=/portal/", "--outDir", "../../apps/sites-demo/.stage/portal"],
  { VITE_ROUTER_BASENAME: "/portal", VITE_DISABLE_PWA: "1" }
);
run(
  ["--filter", "@xiangneng/admin", "exec", "vite", "build", "--outDir", "../../apps/sites-demo/.stage/admin"],
  { VITE_PORTAL_ORIGIN: "/portal" }
);

await mkdir(clientDir, { recursive: true });
await cp(join(stageDir, "admin"), clientDir, { recursive: true });
await mkdir(join(clientDir, "portal"), { recursive: true });
await cp(join(stageDir, "portal"), join(clientDir, "portal"), { recursive: true });
await removeSourceMaps(clientDir);

await mkdir(join(distDir, "server"), { recursive: true });
const workerSource = `const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return response;
    const accept = request.headers.get("accept") || "";
    if (!accept.includes("text/html")) return response;
    const url = new URL(request.url);
    const fallback = url.pathname === "/portal" || url.pathname.startsWith("/portal/")
      ? "/portal/index.html"
      : "/index.html";
    return env.ASSETS.fetch(new Request(new URL(fallback, request.url), request));
  }
};
export default worker;
`;
await writeFile(join(distDir, "server", "index.js"), workerSource, "utf8");

const summary = await assetSummary(clientDir);
await writeFile(join(distDir, "build-summary.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  assets: summary,
  adminIndex: relative(distDir, join(clientDir, "index.html")).replaceAll("\\", "/"),
  portalIndex: relative(distDir, join(clientDir, "portal", "index.html")).replaceAll("\\", "/")
}, null, 2)}\n`, "utf8");

const adminHtml = await readFile(join(clientDir, "index.html"), "utf8");
const portalHtml = await readFile(join(clientDir, "portal", "index.html"), "utf8");
if (!adminHtml.includes("祥能") || !portalHtml.includes("祥能")) {
  throw new Error("Public demo indexes do not contain the expected product identity.");
}
if (
  !workerSource.includes('url.pathname === "/portal"') ||
  !workerSource.includes('url.pathname.startsWith("/portal/")') ||
  !workerSource.includes('"/portal/index.html"')
) {
  throw new Error("Public demo worker does not preserve the /portal SPA fallback.");
}

const bundledText = await artifactText(clientDir);
if (
  !bundledText.includes("xiangneng-portal-offline-demo") ||
  !bundledText.includes("synthetic-person-001") ||
  !bundledText.includes("SYN-E00001")
) {
  throw new Error("Public demo artifact is missing the offline synthetic-data runtime.");
}
for (const forbiddenMarker of ["唯一数据.xls", "唯一数据.xlsx", "demo-data.full.json", "data/derived/"]) {
  if (bundledText.toLowerCase().includes(forbiddenMarker.toLowerCase())) {
    throw new Error(`Public demo artifact contains forbidden source marker: ${forbiddenMarker}`);
  }
}

console.log(JSON.stringify({ status: "ok", ...summary }));
