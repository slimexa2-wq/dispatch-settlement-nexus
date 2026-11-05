import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { basename, dirname, extname, resolve, sep } from "node:path";

const gzipAsync = promisify(gzip);
const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(root, "output");
const packageRoot = resolve(outputRoot, "祥能人员与招聘信息管理系统_演示版");
const webSource = resolve(root, "apps/admin/dist");
const webTarget = resolve(packageRoot, "web");
const runtimeTarget = resolve(packageRoot, "runtime/node.exe");
const screenshotsSource = resolve(root, "output/playwright/package");
const productScreenshotsSource = resolve(root, "output/playwright/product");

if (!packageRoot.startsWith(`${outputRoot}${sep}`) || basename(packageRoot) !== "祥能人员与招聘信息管理系统_演示版") {
  throw new Error(`拒绝清理非预期目录：${packageRoot}`);
}

await stat(resolve(webSource, "index.html"));
await rm(packageRoot, { recursive: true, force: true });
await mkdir(dirname(runtimeTarget), { recursive: true });
await cp(webSource, webTarget, { recursive: true });
await copyFile(process.execPath, runtimeTarget);
await copyFile(resolve(root, "scripts/portable-demo-server.mjs"), resolve(packageRoot, "server.mjs"));
await copyFile(resolve(root, "docs/交付质检报告.md"), resolve(packageRoot, "交付质检报告.md"));
await cp(screenshotsSource, resolve(packageRoot, "验收截图"), { recursive: true });
await cp(productScreenshotsSource, resolve(packageRoot, "验收截图/产品介绍"), { recursive: true });

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  }));
  return nested.flat();
}

const compressible = new Set([".css", ".html", ".js", ".json", ".svg"]);
const webFiles = await listFiles(webTarget);
for (const filePath of webFiles) {
  if (!compressible.has(extname(filePath).toLowerCase())) continue;
  const source = await readFile(filePath);
  if (source.length < 1024) continue;
  await writeFile(`${filePath}.gz`, await gzipAsync(source, { level: 9 }));
}

const launcher = `@echo off\r
chcp 65001 >nul\r
title 祥能人员与招聘信息管理系统 - 演示服务\r
cd /d "%~dp0"\r
"%~dp0runtime\\node.exe" "%~dp0server.mjs"\r
if errorlevel 1 (\r
  echo.\r
  echo 启动失败，请将本窗口截图发给技术人员。\r
  pause\r
)\r
`;
await writeFile(resolve(packageRoot, "启动演示系统.cmd"), launcher, "utf8");

const guide = `祥能人员与招聘信息管理系统｜便携演示版\r
\r
使用方法\r
1. 双击“启动演示系统.cmd”。\r
2. 浏览器会自动打开登录页。\r
3. 产品介绍页地址：http://127.0.0.1:4173/product（若端口被占用，以启动窗口显示地址为准）。\r
4. 在验证码输入框中填写：8888。\r
5. 电脑管理端内可直接进入“小程序演示”，并切换不同角色。\r
6. 演示修改会保存在当前浏览器中；需要重新演示时点击右上角“恢复初始演示数据”。\r
7. 演示结束后关闭黑色启动窗口即可。\r
\r
注意事项\r
- 本包自带运行环境，不需要安装 Node.js、数据库或开发工具。\r
- 默认只在本机运行，不会把人员数据上传到互联网。\r
- 请保持 web、runtime、server.mjs 和启动脚本位于同一文件夹。\r
`;
await writeFile(resolve(packageRoot, "使用说明.txt"), guide, "utf8");

const manifestFiles = (await listFiles(packageRoot)).filter((filePath) => !filePath.endsWith("交付校验清单.txt"));
const manifestLines = [];
for (const filePath of manifestFiles) {
  const content = await readFile(filePath);
  const relative = filePath.slice(packageRoot.length + 1);
  manifestLines.push(`${createHash("sha256").update(content).digest("hex")}  ${relative}`);
}
await writeFile(resolve(packageRoot, "交付校验清单.txt"), `${manifestLines.sort().join("\r\n")}\r\n`, "utf8");

const packageFiles = await listFiles(packageRoot);
const totalBytes = (await Promise.all(packageFiles.map(async (filePath) => (await stat(filePath)).size))).reduce((sum, size) => sum + size, 0);
console.log(JSON.stringify({ packageRoot, files: packageFiles.length, totalMB: Number((totalBytes / 1024 / 1024).toFixed(2)) }, null, 2));
