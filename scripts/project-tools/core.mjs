import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".worktrees",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".next",
  ".taro",
  ".swc"
]);

function normalizeProjectPath(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function matchPath(pattern, filePath) {
  const normalizedPattern = normalizeProjectPath(pattern);
  const normalizedFile = normalizeProjectPath(filePath);
  let expression = "";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const char = normalizedPattern[index];
    const next = normalizedPattern[index + 1];
    if (char === "*" && next === "*") {
      expression += ".*";
      index += 1;
    } else if (char === "*") {
      expression += "[^/]*";
    } else {
      expression += escapeRegExp(char);
    }
  }
  return new RegExp(`^${expression}$`).test(normalizedFile);
}

export async function listProjectFiles(rootDir) {
  const files = [];

  async function visit(relativeDir) {
    const absoluteDir = path.join(rootDir, relativeDir);
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath = normalizeProjectPath(path.join(relativeDir, entry.name));
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        if (relativePath === "docs/generated") continue;
        await visit(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  await visit("");
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

export function filesForModule(module, files) {
  return [...new Set(
    files.filter((file) => module.include.some((pattern) => matchPath(pattern, file)))
  )].sort((left, right) => left.localeCompare(right, "en"));
}

export async function loadModuleRegistry(rootDir) {
  const registryPath = path.join(rootDir, "config", "project-modules.json");
  const raw = await readFile(registryPath, "utf8");
  return JSON.parse(raw);
}

export function validateModuleRegistry(registry, rootDir, projectFiles) {
  const errors = [];
  const warnings = [];
  if (!registry || typeof registry !== "object") {
    return { valid: false, errors: ["registry must be an object"], warnings };
  }
  if (registry.version !== 1) errors.push(`unsupported registry version: ${registry.version}`);
  if (!Array.isArray(registry.modules) || registry.modules.length === 0) {
    errors.push("registry.modules must be a non-empty array");
    return { valid: false, errors, warnings };
  }

  const ids = new Set();
  for (const module of registry.modules) {
    if (!module.id || typeof module.id !== "string") errors.push("module id must be a non-empty string");
    if (ids.has(module.id)) errors.push(`duplicate module id: ${module.id}`);
    ids.add(module.id);
  }

  for (const module of registry.modules) {
    for (const field of ["name", "description"]) {
      if (!module[field] || typeof module[field] !== "string") errors.push(`${module.id}.${field} must be a non-empty string`);
    }
    for (const field of ["include", "dependsOn", "businessRules", "testCommands", "prismaModels"]) {
      if (!Array.isArray(module[field])) errors.push(`${module.id}.${field} must be an array`);
    }
    if (!Array.isArray(module.include) || module.include.length === 0) {
      errors.push(`${module.id}.include must not be empty`);
      continue;
    }
    for (const dependency of module.dependsOn ?? []) {
      if (!ids.has(dependency)) errors.push(`${module.id} unknown dependency: ${dependency}`);
      if (dependency === module.id) errors.push(`${module.id} cannot depend on itself`);
    }
    for (const pattern of module.include) {
      if (!projectFiles.some((file) => matchPath(pattern, file))) {
        errors.push(`${module.id} matched no files: ${pattern}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, rootDir };
}
