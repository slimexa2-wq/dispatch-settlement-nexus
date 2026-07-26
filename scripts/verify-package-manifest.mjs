import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";

const packageRoot = resolve(process.argv[2] ?? "output/祥能人员与招聘信息管理系统_演示版");
const manifestPath = resolve(packageRoot, "交付校验清单.txt");
const manifest = await readFile(manifestPath, "utf8");
const failures = [];
let checked = 0;

for (const line of manifest.split(/\r?\n/).filter(Boolean)) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/i);
  if (!match) {
    failures.push(`清单格式错误：${line}`);
    continue;
  }
  const [, expected, relative] = match;
  const filePath = resolve(packageRoot, relative);
  if (!(filePath === packageRoot || filePath.startsWith(`${packageRoot}${sep}`))) {
    failures.push(`路径越界：${relative}`);
    continue;
  }
  try {
    const actual = createHash("sha256").update(await readFile(filePath)).digest("hex");
    if (actual !== expected) failures.push(`哈希不一致：${relative}`);
    checked += 1;
  } catch (error) {
    failures.push(`文件不可读：${relative}（${error.message}）`);
  }
}

const rootEntries = await readdir(packageRoot);
for (const required of ["启动演示系统.cmd", "使用说明.txt", "交付质检报告.md", "验收截图", "web", "runtime", "server.mjs"]) {
  if (!rootEntries.includes(required)) failures.push(`缺少交付项：${required}`);
}

if (failures.length) {
  console.error(JSON.stringify({ result: "failed", packageRoot, checked, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ result: "passed", packageRoot, checked, requiredEntries: 7 }, null, 2));
