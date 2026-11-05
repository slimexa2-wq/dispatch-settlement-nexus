import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { neutralizeSpreadsheetFormula } from "./spreadsheet-safety.js";

export const salaryHeaders = [
  "工资月份",
  "身份证号",
  "员工编号",
  "应发工资",
  "实发工资",
  "工时工资",
  "加班费",
  "补贴",
  "推荐奖励",
  "社保扣款",
  "其他扣款",
  "备注"
] as const;

export function createSalaryTemplate(): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...salaryHeaders],
    ["2026-07", "", "", 0, 0, 0, 0, 0, 0, 0, 0, "身份证号或员工编号至少填写一项"]
  ]);
  sheet["!cols"] = salaryHeaders.map((header) => ({ wch: Math.max(12, header.length * 2 + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "工资条导入模板");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function parseSalaryWorkbook(buffer: Buffer): { sourceHash: string; rows: unknown[] } {
  const sourceHash = createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstName = workbook.SheetNames[0];
  const sheet = firstName ? workbook.Sheets[firstName] : undefined;
  if (!sheet) throw new Error("工资条工作簿没有可读取的工作表");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const headers = (matrix[0] ?? []).map((value) => String(value).trim());
  if (salaryHeaders.some((expected, index) => headers[index] !== expected)) {
    throw new Error(`工资条表头不匹配，应为：${salaryHeaders.join("、")}`);
  }
  const rows = matrix.slice(1).flatMap((row, index) => {
    if (!row.some((value) => String(value).trim() !== "")) return [];
    return [{
      sourceRow: index + 2,
      salaryMonth: String(row[0] ?? "").trim(),
      idCard: String(row[1] ?? "").trim() || undefined,
      employeeNo: String(row[2] ?? "").trim() || undefined,
      grossPay: row[3],
      netPay: row[4],
      hourlyPay: row[5] === "" ? 0 : row[5],
      overtimePay: row[6] === "" ? 0 : row[6],
      allowance: row[7] === "" ? 0 : row[7],
      referralReward: row[8] === "" ? 0 : row[8],
      socialSecurityDeduction: row[9] === "" ? 0 : row[9],
      otherDeduction: row[10] === "" ? 0 : row[10],
      notes: String(row[11] ?? "").trim() || undefined
    }];
  });
  return { sourceHash, rows };
}

export function exportSalaryWorkbook(rows: Array<Record<string, unknown>>): Buffer {
  const matrix = [
    ["姓名", ...salaryHeaders],
    ...rows.map((row) => [
      neutralizeSpreadsheetFormula(row.personName),
      neutralizeSpreadsheetFormula(row.salaryMonth),
      neutralizeSpreadsheetFormula(row.idCard),
      neutralizeSpreadsheetFormula(row.employeeNo),
      row.grossPay,
      row.netPay,
      row.hourlyPay,
      row.overtimePay,
      row.allowance,
      row.referralReward,
      row.socialSecurityDeduction,
      row.otherDeduction,
      neutralizeSpreadsheetFormula(row.notes)
    ])
  ];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "工资条");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
