import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { filesForModule, listProjectFiles, loadModuleRegistry, validateModuleRegistry } from "./core.mjs";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", ".prisma"]);
const TEXT_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, ".json", ".md", ".yaml", ".yml", ".css", ".scss", ".html", ".ps1"]);
const LARGE_FILE_THRESHOLDS = {
  ".tsx": 500,
  ".ts": 500,
  ".mts": 500,
  ".mjs": 500,
  ".js": 500,
  ".jsx": 500,
  ".prisma": 1400
};

function stableSort(values, selector = (value) => value) {
  return [...values].sort((left, right) => selector(left).localeCompare(selector(right), "en"));
}

function markdownTable(headers, rows) {
  const header = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`);
  return [header, separator, ...body].join("\n");
}

export function extractApiRoutes(source, file) {
  const routes = [];
  const expression = /\b(?:app|fastify)\.(get|post|put|patch|delete|options|head)\s*\(\s*(["'`])([^"'`]+)\2/g;
  for (const match of source.matchAll(expression)) {
    routes.push({ file, method: match[1].toUpperCase(), path: match[3] });
  }
  return routes.sort((left, right) => `${left.path}:${left.method}:${left.file}`.localeCompare(`${right.path}:${right.method}:${right.file}`, "en"));
}

export function extractAdminRoutes(source) {
  const routes = [];
  const expression = /<Route\s+path=["']([^"']+)["'][^>]*element=\{<([A-Za-z0-9_]+)/g;
  for (const match of source.matchAll(expression)) {
    routes.push({ path: match[1], component: match[2] });
  }
  return routes.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

export function extractMiniappPages(source) {
  const pagesMatch = source.match(/pages\s*:\s*\[([\s\S]*?)\]/);
  if (!pagesMatch) return [];
  const pages = [];
  const stringExpression = /["']([^"']+)["']/g;
  for (const match of pagesMatch[1].matchAll(stringExpression)) pages.push(match[1]);
  return pages;
}

export function extractPrismaEntities(source) {
  const models = [...source.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gm)].map((match) => match[1]);
  const enums = [...source.matchAll(/^enum\s+([A-Za-z0-9_]+)\s*\{/gm)].map((match) => match[1]);
  return {
    enums: stableSort(enums),
    models: stableSort(models)
  };
}

async function readText(rootDir, relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

async function collectFileStats(rootDir, files) {
  const stats = [];
  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension) && path.basename(file) !== "Dockerfile") continue;
    const source = await readText(rootDir, file);
    stats.push({
      path: file,
      extension,
      lines: source === "" ? 0 : source.split(/\r?\n/).length,
      bytes: Buffer.byteLength(source, "utf8"),
      digest: createHash("sha256").update(source).digest("hex"),
      source: SOURCE_EXTENSIONS.has(extension)
    });
  }
  return stats;
}

function sourceFingerprint(registry, fileStats) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(registry));
  for (const stat of stableSort(fileStats, (item) => item.path)) {
    hash.update(`\n${stat.path}:${stat.bytes}:${stat.lines}:${stat.digest}`);
  }
  return hash.digest("hex").slice(0, 16);
}

export async function collectProjectIndex(rootDir) {
  const registry = await loadModuleRegistry(rootDir);
  const projectFiles = await listProjectFiles(rootDir);
  const validation = validateModuleRegistry(registry, rootDir, projectFiles);
  if (!validation.valid) throw new Error(`Invalid module registry:\n${validation.errors.join("\n")}`);

  const fileStats = await collectFileStats(rootDir, projectFiles);
  const statByPath = new Map(fileStats.map((stat) => [stat.path, stat]));
  const sourceStats = fileStats.filter((stat) => stat.source);

  const modules = registry.modules.map((module) => {
    const files = filesForModule(module, projectFiles);
    return {
      ...module,
      fileCount: files.length,
      sourceLines: files.reduce((total, file) => total + (statByPath.get(file)?.lines ?? 0), 0),
      files
    };
  });

  const apiRoutes = [];
  for (const file of projectFiles.filter((file) => /^apps\/api\/src\/routes\/.*\.ts$/.test(file))) {
    apiRoutes.push(...extractApiRoutes(await readText(rootDir, file), file));
  }

  const adminRoutesPath = "apps/admin/src/routes/AppRoutes.tsx";
  const adminRoutes = projectFiles.includes(adminRoutesPath)
    ? extractAdminRoutes(await readText(rootDir, adminRoutesPath))
    : [];

  const miniappConfigPath = "apps/miniapp/src/app.config.ts";
  const miniappPages = projectFiles.includes(miniappConfigPath)
    ? extractMiniappPages(await readText(rootDir, miniappConfigPath))
    : [];

  const prismaPath = "prisma/schema.prisma";
  const prisma = projectFiles.includes(prismaPath)
    ? extractPrismaEntities(await readText(rootDir, prismaPath))
    : { enums: [], models: [] };

  const largeFiles = sourceStats
    .map((stat) => ({
      path: stat.path,
      lines: stat.lines,
      threshold: LARGE_FILE_THRESHOLDS[stat.extension] ?? 500,
      category: stat.extension === ".tsx" ? "React/TSX" : stat.extension === ".prisma" ? "Prisma" : "TypeScript"
    }))
    .filter((item) => item.lines > item.threshold)
    .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path, "en"));

  return {
    generatedAt: "deterministic",
    sourceFingerprint: sourceFingerprint(registry, fileStats),
    summary: {
      fileCount: projectFiles.length,
      sourceFileCount: sourceStats.length,
      totalSourceLines: sourceStats.reduce((total, stat) => total + stat.lines, 0),
      moduleCount: modules.length,
      apiRouteCount: apiRoutes.length,
      adminRouteCount: adminRoutes.length,
      miniappPageCount: miniappPages.length,
      prismaModelCount: prisma.models.length
    },
    modules,
    apiRoutes: stableSort(apiRoutes, (route) => `${route.path}:${route.method}:${route.file}`),
    adminRoutes,
    miniappPages,
    prisma,
    largeFiles
  };
}

export function renderIndexFiles(index) {
  const generatedHeader = `> 自动生成，请勿手工编辑。源指纹：\`${index.sourceFingerprint ?? "stable"}\`。`;
  const summaryRows = [
    ["项目文件", index.summary.fileCount],
    ["源代码文件", index.summary.sourceFileCount],
    ["源代码总行数", index.summary.totalSourceLines],
    ["业务模块", index.summary.moduleCount ?? index.modules.length],
    ["API 路由", index.summary.apiRouteCount ?? index.apiRoutes.length],
    ["后台页面路由", index.summary.adminRouteCount ?? index.adminRoutes.length],
    ["小程序页面", index.summary.miniappPageCount ?? index.miniappPages.length],
    ["Prisma 模型", index.summary.prismaModelCount ?? index.prisma.models.length]
  ];

  const projectSummary = `# 项目自动索引摘要\n\n${generatedHeader}\n\n${markdownTable(["指标", "数量"], summaryRows)}\n\n## 使用方式\n\n- 修改代码前先阅读根目录 \`AI_PROJECT_MAP.md\`。\n- 运行 \`pnpm project:context -- <模块ID>\` 生成局部 AI 上下文。\n- 运行 \`pnpm project:verify\` 检查模块注册、文档和索引是否同步。\n`;

  const moduleRows = index.modules.map((module) => [
    `\`${module.id}\``,
    module.name,
    module.fileCount,
    module.sourceLines ?? 0,
    module.dependsOn.length ? module.dependsOn.map((id) => `\`${id}\``).join("、") : "无",
    module.description
  ]);
  const moduleDetails = index.modules.map((module) => `## ${module.name}（\`${module.id}\`）\n\n- 文件数：${module.fileCount}\n- 源码行数：${module.sourceLines ?? 0}\n- 依赖：${module.dependsOn.length ? module.dependsOn.map((id) => `\`${id}\``).join("、") : "无"}\n- 数据模型：${module.prismaModels.length ? module.prismaModels.map((name) => `\`${name}\``).join("、") : "无专属模型"}\n- 测试命令：${module.testCommands.length ? module.testCommands.map((command) => `\`${command}\``).join("；") : "使用全量验证"}\n\n<details><summary>文件清单</summary>\n\n${module.files.map((file) => `- \`${file}\``).join("\n")}\n\n</details>`).join("\n\n");
  const moduleIndex = `# 业务模块索引\n\n${generatedHeader}\n\n${markdownTable(["ID", "模块", "文件", "源码行", "依赖", "职责"], moduleRows)}\n\n${moduleDetails}\n`;

  const apiRows = index.apiRoutes.map((route) => [`\`${route.method}\``, `\`${route.path}\``, `\`${route.file}\``]);
  const apiIndex = `# API 路由索引\n\n${generatedHeader}\n\n${apiRows.length ? markdownTable(["方法", "路径", "文件"], apiRows) : "暂无可识别路由。"}\n`;

  const adminRows = index.adminRoutes.map((route) => [`\`${route.path}\``, `\`${route.component}\``]);
  const miniRows = index.miniappPages.map((page) => [`\`${page}\``]);
  const pageIndex = `# 页面路由索引\n\n${generatedHeader}\n\n## PC 管理后台\n\n${adminRows.length ? markdownTable(["路径", "页面组件"], adminRows) : "暂无。"}\n\n## 微信小程序\n\n${miniRows.length ? markdownTable(["页面"], miniRows) : "暂无。"}\n`;

  const prismaIndex = `# Prisma 模型索引\n\n${generatedHeader}\n\n## 枚举（${index.prisma.enums.length}）\n\n${index.prisma.enums.map((name) => `- \`${name}\``).join("\n")}\n\n## 模型（${index.prisma.models.length}）\n\n${index.prisma.models.map((name) => `- \`${name}\``).join("\n")}\n`;

  const largeRows = index.largeFiles.map((file) => [`\`${file.path}\``, file.category, file.lines, file.threshold, file.lines - file.threshold]);
  const largeFiles = `# 超大文件维护报告\n\n${generatedHeader}\n\n这些是后续渐进拆分候选，不在本阶段强制失败。文件大并不自动有罪，但 3000 行文件通常已经开始申请独立户口。\n\n${largeRows.length ? markdownTable(["文件", "类型", "行数", "建议阈值", "超出"], largeRows) : "当前没有超过建议阈值的源文件。"}\n`;

  const baselineRows = index.largeFiles.slice(0, 20).map((file) => [`\`${file.path}\``, file.lines, file.threshold, file.lines - file.threshold]);
  const maintenanceBaseline = `# 工程维护基线\n\n${generatedHeader}\n\n## 当前规模\n\n${markdownTable(["指标", "数量"], summaryRows)}\n\n## 治理原则\n\n- 超大文件本阶段只预警，不阻断构建。\n- 新需求触及超大文件时，优先提取本次职责相关的纯函数、服务或组件。\n- 不为追求目录整齐进行无业务收益的大规模搬迁。\n- 每次新增模块、依赖、入口或模型后更新注册表并重新生成索引。\n\n## 最大拆分候选\n\n${baselineRows.length ? markdownTable(["文件", "行数", "建议阈值", "超出"], baselineRows) : "当前没有超过建议阈值的源文件。"}\n`;

  const jsonIndex = `${JSON.stringify(index, null, 2)}\n`;

  return {
    "docs/generated/project-summary.md": projectSummary,
    "docs/generated/module-index.md": moduleIndex,
    "docs/generated/api-route-index.md": apiIndex,
    "docs/generated/page-route-index.md": pageIndex,
    "docs/generated/prisma-index.md": prismaIndex,
    "docs/generated/large-files-report.md": largeFiles,
    "docs/generated/maintenance-baseline.md": maintenanceBaseline,
    "docs/generated/project-index.json": jsonIndex
  };
}

export function compareGeneratedOutputs(expected, actual) {
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  return {
    missing: expectedKeys.filter((key) => !(key in actual)),
    stale: expectedKeys.filter((key) => key in actual && expected[key] !== actual[key]),
    extra: actualKeys.filter((key) => !(key in expected))
  };
}
