export type MigrationFieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  aliases?: readonly string[];
  format?: "TEXT" | "PHONE" | "ID_CARD" | "DATE" | "INTEGER" | "NUMBER" | "BOOLEAN";
  allowedValues?: readonly string[];
};

export type MigrationConflictPolicy = "CREATE_ONLY" | "UPDATE" | "SKIP";
export type MigrationPreviewAction = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

export type MigrationPreviewRow = {
  sourceRow: number;
  action: MigrationPreviewAction;
  data: Record<string, unknown>;
  uniqueKey: string | null;
  errors: string[];
};

export function deriveMigrationBatchStatus(input: {
  committedRows: number;
  failedRows: number;
}): "COMMITTED" | "PARTIAL" | "FAILED" {
  if (input.failedRows === 0) return "COMMITTED";
  return input.committedRows > 0 ? "PARTIAL" : "FAILED";
}

export function normalizeHeader(value: string): string {
  return value.trim().replace(/[\s_\-（）()【】\[\]：:]/g, "").toLowerCase();
}

export function autoMapMigrationHeaders(
  headers: readonly string[],
  template: { fields: readonly MigrationFieldDefinition[] }
): { mapping: Record<string, string>; missingRequired: string[]; unmappedHeaders: string[] } {
  const targetByAlias = new Map<string, string>();
  for (const field of template.fields) {
    const candidates = [field.key, field.label, ...(field.aliases ?? [])];
    for (const candidate of candidates) targetByAlias.set(normalizeHeader(candidate), field.key);
  }

  const mapping: Record<string, string> = {};
  const usedTargets = new Set<string>();
  const unmappedHeaders: string[] = [];
  for (const header of headers) {
    const target = targetByAlias.get(normalizeHeader(header));
    if (!target || usedTargets.has(target)) {
      unmappedHeaders.push(header);
      continue;
    }
    mapping[header] = target;
    usedTargets.add(target);
  }

  const missingRequired = template.fields
    .filter((field) => field.required && !usedTargets.has(field.key))
    .map((field) => field.label);
  return { mapping, missingRequired, unmappedHeaders };
}

export function validateMigrationMapping(
  mapping: Readonly<Record<string, string>>,
  fields: readonly MigrationFieldDefinition[]
): string[] {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const sourceByTarget = new Map<string, string[]>();
  const errors: string[] = [];
  for (const [sourceHeader, targetKey] of Object.entries(mapping)) {
    const field = fieldsByKey.get(targetKey);
    if (!field) {
      errors.push(`Excel列“${sourceHeader}”映射到了不存在的系统字段“${targetKey}”`);
      continue;
    }
    const sources = sourceByTarget.get(targetKey) ?? [];
    sources.push(sourceHeader);
    sourceByTarget.set(targetKey, sources);
  }
  for (const [targetKey, sources] of sourceByTarget) {
    if (sources.length <= 1) continue;
    const field = fieldsByKey.get(targetKey);
    errors.push(`${field?.label ?? targetKey}不能同时映射多个Excel列：${sources.join("、")}`);
  }
  return errors;
}

function normalizeCell(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value ?? null;
}

function uniqueKeyFor(data: Record<string, unknown>, uniqueKeys: readonly string[]): string | null {
  if (!uniqueKeys.length) return null;
  const values = uniqueKeys.map((key) => normalizeCell(data[key]));
  if (values.some((value) => value === null || value === undefined || value === "")) return null;
  return values.map(String).join("::");
}

function validateFieldValue(field: MigrationFieldDefinition, value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  const label = field.label;
  const text = String(value).trim();
  const errors: string[] = [];
  if (field.format === "PHONE" && !/^1\d{10}$/.test(text)) errors.push(`${label}格式不正确，应为11位中国大陆手机号`);
  if (field.format === "ID_CARD" && !/^\d{17}[\dXx]$/.test(text)) errors.push(`${label}格式不正确，应为18位身份证号`);
  if (field.format === "DATE") {
    const parsed = value instanceof Date ? value : new Date(text);
    if (Number.isNaN(parsed.getTime())) errors.push(`${label}格式不正确`);
  }
  if (field.format === "INTEGER" && !Number.isInteger(Number(value))) errors.push(`${label}必须是整数`);
  if (field.format === "NUMBER" && !Number.isFinite(Number(value))) errors.push(`${label}必须是数字`);
  if (field.format === "BOOLEAN" && !["是", "否", "true", "false", "1", "0", "启用", "停用", "有效", "禁用"].includes(text.toLowerCase())) {
    errors.push(`${label}必须填写是/否、启用/停用或true/false`);
  }
  if (field.allowedValues?.length && !field.allowedValues.includes(text)) errors.push(`${label}只能填写：${field.allowedValues.join("、")}`);
  return errors;
}

export function buildMigrationPreview(input: {
  rows: readonly Record<string, unknown>[];
  mapping: Readonly<Record<string, string>>;
  fields: readonly MigrationFieldDefinition[];
  uniqueKeys: readonly string[];
  existingKeys?: ReadonlySet<string>;
  conflictPolicy: MigrationConflictPolicy;
  ignoredSourceRows?: ReadonlySet<number>;
}): {
  rows: MigrationPreviewRow[];
  summary: { total: number; creates: number; updates: number; skips: number; errors: number };
} {
  const existingKeys = input.existingKeys ?? new Set<string>();
  const ignoredSourceRows = input.ignoredSourceRows ?? new Set<number>();
  const fieldsByKey = new Map(input.fields.map((field) => [field.key, field]));
  const rows: MigrationPreviewRow[] = input.rows.map((source, index) => {
    const sourceRowValue = source.__rowNum;
    const sourceRow = typeof sourceRowValue === "number" && Number.isInteger(sourceRowValue)
      ? sourceRowValue
      : index + 2;
    const data: Record<string, unknown> = {};
    for (const [sourceHeader, targetKey] of Object.entries(input.mapping)) {
      if (!fieldsByKey.has(targetKey)) continue;
      data[targetKey] = normalizeCell(source[sourceHeader]);
    }

    const errors = input.fields
      .filter((field) => field.required && (data[field.key] === null || data[field.key] === undefined || data[field.key] === ""))
      .map((field) => `${field.label}不能为空`);
    for (const field of input.fields) errors.push(...validateFieldValue(field, data[field.key]));
    const uniqueKey = uniqueKeyFor(data, input.uniqueKeys);
    if (input.uniqueKeys.length && !uniqueKey) errors.push("唯一识别字段不完整");

    let action: MigrationPreviewAction;
    if (ignoredSourceRows.has(sourceRow)) action = "SKIP";
    else if (errors.length) action = "ERROR";
    else if (uniqueKey && existingKeys.has(uniqueKey)) {
      action = input.conflictPolicy === "UPDATE" ? "UPDATE" : "SKIP";
    } else if (input.conflictPolicy === "CREATE_ONLY" || input.conflictPolicy === "UPDATE" || input.conflictPolicy === "SKIP") {
      action = "CREATE";
    } else action = "ERROR";

    return { sourceRow, action, data, uniqueKey, errors };
  });

  const sourceRowsByUniqueKey = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.uniqueKey || row.action === "SKIP") continue;
    const sourceRows = sourceRowsByUniqueKey.get(row.uniqueKey) ?? [];
    sourceRows.push(row.sourceRow);
    sourceRowsByUniqueKey.set(row.uniqueKey, sourceRows);
  }
  for (const row of rows) {
    if (!row.uniqueKey || row.action === "SKIP") continue;
    const duplicateRows = sourceRowsByUniqueKey.get(row.uniqueKey) ?? [];
    if (duplicateRows.length <= 1) continue;
    row.action = "ERROR";
    row.errors.push(`文件内唯一标识重复，出现在第${duplicateRows.join("、")}行`);
  }

  return {
    rows,
    summary: {
      total: rows.length,
      creates: rows.filter((row) => row.action === "CREATE").length,
      updates: rows.filter((row) => row.action === "UPDATE").length,
      skips: rows.filter((row) => row.action === "SKIP").length,
      errors: rows.filter((row) => row.action === "ERROR").length
    }
  };
}
