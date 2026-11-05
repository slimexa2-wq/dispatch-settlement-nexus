import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { identifyTableFingerprint } from "@xiangneng/data-import";

export const peopleHeaders = [
  "姓名",
  "身份证号",
  "手机号",
  "源项目ID",
  "分子公司",
  "项目名称",
  "岗位",
  "面试日期",
  "供应商名称",
  "推荐人用户名",
  "紧急联系人姓名",
  "紧急联系人电话",
  "与本人关系",
  "报名来源",
  "备注"
] as const;

export function createPeopleTemplate(): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...peopleHeaders],
    ["", "", "", "YB-001", "", "", "", "", "", "", "", "", "", "OPERATOR", "源项目ID优先；也可填写分子公司+项目名称"]
  ]);
  sheet["!cols"] = peopleHeaders.map((header) => ({ wch: Math.max(14, header.length * 2 + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "人员导入模板");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function parsePeopleWorkbook(buffer: Buffer): { sourceHash: string; rows: unknown[] } {
  const sourceHash = createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstName = workbook.SheetNames[0];
  const sheet = firstName ? workbook.Sheets[firstName] : undefined;
  if (!sheet) throw new Error("人员工作簿没有可读取的工作表");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const headers = (matrix[0] ?? []).map((value) => String(value).trim());

  const fingerprint = identifyTableFingerprint(headers, matrix.slice(1) as string[][]);
  const nameIndex = fingerprint.mappings.findIndex((m: any) => m.mappedField === "name");
  const idCardIndex = fingerprint.mappings.findIndex((m: any) => m.mappedField === "idCard");

  const rows = matrix.slice(1).map((row, index) => ({
    sourceRow: index + 2,
    name: nameIndex >= 0 ? String(row[nameIndex] ?? "").trim() : String(row[0] ?? "").trim(),
    idCard: idCardIndex >= 0 ? String(row[idCardIndex] ?? "").trim() : String(row[1] ?? "").trim(),
    phone: headers.includes(peopleHeaders[2]) ? String(row[headers.indexOf(peopleHeaders[2])] ?? "").trim() : String(row[2] ?? "").trim(),
    sourceProjectId: headers.includes(peopleHeaders[3]) ? String(row[headers.indexOf(peopleHeaders[3])] ?? "").trim() || undefined : String(row[3] ?? "").trim() || undefined,
    branchName: String(row[4] ?? "").trim() || undefined,
    projectName: String(row[5] ?? "").trim() || undefined,
    jobTitle: String(row[6] ?? "").trim(),
    interviewDate: String(row[7] ?? "").trim() || undefined,
    supplierName: String(row[8] ?? "").trim() || undefined,
    recommenderUsername: String(row[9] ?? "").trim() || undefined,
    emergencyContactName: String(row[10] ?? "").trim() || undefined,
    emergencyContactPhone: String(row[11] ?? "").trim() || undefined,
    emergencyContactRelation: String(row[12] ?? "").trim() || undefined,
    source: String(row[13] ?? "").trim() || "OPERATOR",
    notes: String(row[14] ?? "").trim() || undefined
  })).filter((row) => Object.entries(row).some(([key, value]) => key !== "sourceRow" && value !== undefined && value !== ""));
  return { sourceHash, rows };
}
