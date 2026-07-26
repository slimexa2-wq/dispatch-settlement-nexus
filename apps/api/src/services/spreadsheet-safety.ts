export function neutralizeSpreadsheetFormula(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: unknown): string {
  return `"${String(neutralizeSpreadsheetFormula(value) ?? "").replaceAll('"', '""')}"`;
}
