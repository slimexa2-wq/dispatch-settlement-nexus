import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";

export const BUSINESS_DATA_MODES = Object.freeze({
  INTERNAL: "internal",
  PUBLIC_DEMO: "public-demo"
});

async function requireReadable(path, message) {
  try {
    await access(path, constants.R_OK);
    return path;
  } catch {
    throw new Error(`${message}：${path}`);
  }
}

export async function resolveBusinessDataPath({
  root,
  mode = process.env.XIANGNENG_DATA_MODE || BUSINESS_DATA_MODES.INTERNAL,
  explicitPath = process.env.XIANGNENG_DATA_FILE
} = {}) {
  const workspaceRoot = resolve(root || process.cwd());
  if (explicitPath) {
    return requireReadable(resolve(workspaceRoot, explicitPath), "指定的数据文件不存在或不可读取");
  }
  if (mode === BUSINESS_DATA_MODES.PUBLIC_DEMO) {
    return requireReadable(
      join(workspaceRoot, "data", "synthetic", "demo-data.json"),
      "公开演示数据文件不存在"
    );
  }
  if (mode !== BUSINESS_DATA_MODES.INTERNAL) {
    throw new Error(`不支持的数据模式：${mode}`);
  }
  return requireReadable(
    join(workspaceRoot, "data", "internal", "real-business-data.json"),
    "真实内部数据文件不存在，系统拒绝自动回退到虚构数据"
  );
}

export async function loadBusinessData(options = {}) {
  const path = await resolveBusinessDataPath(options);
  const data = JSON.parse(await readFile(path, "utf8"));
  const mode = options.mode || process.env.XIANGNENG_DATA_MODE || BUSINESS_DATA_MODES.INTERNAL;
  if (mode === BUSINESS_DATA_MODES.INTERNAL && data?.meta?.internal !== true) {
    throw new Error(`内部模式拒绝加载非真实内部数据：${path}`);
  }
  if (mode === BUSINESS_DATA_MODES.PUBLIC_DEMO && data?.meta?.internal === true) {
    throw new Error(`公开演示模式拒绝加载内部真实数据：${path}`);
  }
  return { path, data };
}
