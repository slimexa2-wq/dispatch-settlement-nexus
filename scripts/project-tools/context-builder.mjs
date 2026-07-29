import path from "node:path";

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", ".json", ".md", ".prisma", ".yaml", ".yml", ".css", ".scss", ".html", ".ps1"
]);

function isTextFile(file) {
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()) || path.basename(file) === "Dockerfile";
}

export function rankFileForReading(file) {
  const lower = file.toLowerCase();
  if (lower === "ai_project_map.md") return 0;
  if (lower.includes("/business-rules/") || lower.endsWith("/module.md")) return 10;
  if (lower.includes(".test.") || lower.includes("/test/") || lower.includes("/tests/")) return 90;
  if (lower.includes("permissions") || lower.includes("authorization") || lower.includes("session-user")) return 20;
  if (lower.includes("/services/") || /service\.(ts|tsx|mts|mjs)$/.test(lower)) return 30;
  if (lower.includes("/routes/") || lower.includes("/api/")) return 40;
  if (lower.includes("/domain/") || lower.includes("/model/")) return 50;
  if (lower.endsWith("schema.prisma")) return 60;
  if (lower.includes("/pages/") || lower.endsWith("page.tsx") || lower.includes("/components/")) return 70;
  if (lower.includes("/migrations/")) return 100;
  return 80;
}

function orderFiles(files) {
  return [...files].sort((left, right) => {
    const rankDifference = rankFileForReading(left) - rankFileForReading(right);
    return rankDifference || left.localeCompare(right, "en");
  });
}

export function buildContextData({ registry, index, moduleId, documents }) {
  const module = index.modules.find((item) => item.id === moduleId)
    ?? registry.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error(`Unknown module: ${moduleId}`);

  const indexModules = new Map(index.modules.map((item) => [item.id, item]));
  const registryModules = new Map(registry.modules.map((item) => [item.id, item]));
  const dependencies = (module.dependsOn ?? [])
    .map((id) => indexModules.get(id) ?? registryModules.get(id))
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id, "en"));

  const moduleFiles = module.files ?? [];
  const readingFiles = orderFiles(moduleFiles.filter(isTextFile));
  const excludedBinaryFiles = [...moduleFiles.filter((file) => !isTextFile(file))]
    .sort((left, right) => left.localeCompare(right, "en"));
  const largeFiles = (index.largeFiles ?? [])
    .filter((item) => moduleFiles.includes(item.path))
    .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path, "en"));
  const outOfScopeModules = registry.modules
    .filter((item) => item.id !== module.id && !(module.dependsOn ?? []).includes(item.id))
    .sort((left, right) => left.id.localeCompare(right.id, "en"));

  const documentPaths = [
    "AI_PROJECT_MAP.md",
    `docs/modules/${module.id}/MODULE.md`,
    ...(module.businessRules ?? []),
    ...dependencies.flatMap((dependency) => [
      `docs/modules/${dependency.id}/MODULE.md`,
      ...(dependency.businessRules ?? [])
    ])
  ];

  const documentEntries = [...new Set(documentPaths)].map((file) => ({
    file,
    content: documents[file] ?? null
  }));

  return {
    module,
    dependencies,
    readingFiles,
    excludedBinaryFiles,
    largeFiles,
    outOfScopeModules,
    documentEntries
  };
}

function bulletList(values, empty = "无") {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : `- ${empty}`;
}

export function renderContextPack(data) {
  const dependencyText = data.dependencies.length
    ? data.dependencies.map((module) => `- \`${module.id}\` ${module.name}：${module.description}`).join("\n")
    : "- 无直接依赖";
  const modelText = data.module.prismaModels?.length
    ? data.module.prismaModels.map((name) => `- \`${name}\``).join("\n")
    : "- 无专属 Prisma 模型";
  const tests = data.module.testCommands?.length
    ? data.module.testCommands.map((command) => `- \`${command}\``).join("\n")
    : "- 使用项目全量验证命令";
  const oversized = data.largeFiles.length
    ? data.largeFiles.map((file) => `- \`${file.path}\`：${file.lines} 行，建议阈值 ${file.threshold} 行`).join("\n")
    : "- 当前模块没有超过建议阈值的源文件";
  const documents = data.documentEntries.map((entry) => {
    if (!entry.content) return `## 文档：\`${entry.file}\`\n\n> 当前文件尚未创建或未载入。执行任务前应补齐或读取该文件。`;
    return `## 文档：\`${entry.file}\`\n\n${entry.content.trim()}`;
  }).join("\n\n");

  return `# ${data.module.name} AI 局部上下文\n\n> 本文件由 \`scripts/build-ai-context.mjs\` 生成。它用于缩小阅读范围，不替代源码、测试和真实业务规则。\n\n## 本次目标模块\n\n- ID：\`${data.module.id}\`\n- 职责：${data.module.description}\n- 文件数：${data.module.fileCount ?? data.readingFiles.length}\n- 源码行数：${data.module.sourceLines ?? "未统计"}\n\n## 直接依赖\n\n${dependencyText}\n\n## 关键数据模型\n\n${modelText}\n\n## 推荐阅读顺序\n\n${bulletList(data.readingFiles.map((file, index) => `${index + 1}. \`${file}\``), "无文本源码文件")}\n\n## 模块验证命令\n\n${tests}\n\n## 超大文件提醒\n\n${oversized}\n\n## 未纳入文本上下文的二进制文件\n\n${bulletList(data.excludedBinaryFiles.map((file) => `\`${file}\``), "无")}\n\n## 本次默认不应修改\n\n除非需求明确跨模块，否则不要修改以下模块：\n\n${bulletList(data.outOfScopeModules.map((module) => `\`${module.id}\` ${module.name}`), "无")}\n\n## 规则与模块文档\n\n${documents}\n`;
}
