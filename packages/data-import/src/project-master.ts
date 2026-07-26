import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";

export type ProjectMasterRow = {
  sourceRow: number;
  sourceNo: number;
  sourceProjectId: string;
  branchName: string;
  projectName: string;
  isExternal: boolean;
  businessType: string | null;
  projectStatus: string | null;
  managerName: string | null;
  managerPhone: string | null;
  cooperationStart: string | null;
  cooperationEnd: string | null;
  responsibility: string | null;
  remark: string | null;
};

export type ProjectImportWarning = {
  code:
    | "GLOBAL_DUPLICATE_PROJECT_NAME"
    | "MISSING_BUSINESS_TYPE"
    | "MISSING_PROJECT_MAINTENANCE_FIELDS";
  message: string;
  sourceRows?: number[];
  projectIds?: string[];
};

export type ProjectImportSkip = {
  sourceRow: number;
  reason: string;
  values: string[];
};

export type ProjectWorkbookPreview = {
  schemaVersion: 1;
  sourceFile: string;
  sourceSha256: string;
  sheets: Array<{ name: string; rows: number; columns: number }>;
  branches: Array<{
    name: string;
    projectCount: number;
    externalProjectCount: number;
    nonExternalProjectCount: number;
  }>;
  projects: ProjectMasterRow[];
  skipped: ProjectImportSkip[];
  warnings: ProjectImportWarning[];
  reconciliation: {
    branchCount: number;
    projectCount: number;
    externalProjectCount: number;
    nonExternalProjectCount: number;
    summaryMatchesDetail: boolean;
    duplicateProjectIdCount: number;
    duplicateBranchProjectNameCount: number;
    duplicateGlobalProjectNameCount: number;
    missingBusinessTypeCount: number;
    missingMaintenanceFieldProjectCount: number;
  };
};

type SummaryRow = {
  branchName: string;
  projectCount: number;
  externalProjectCount: number;
  nonExternalProjectCount: number;
};

function getCell(
  sheet: XLSX.WorkSheet,
  rowNumber: number,
  columnNumber: number
): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r: rowNumber - 1, c: columnNumber - 1 })];
}

function cellText(
  sheet: XLSX.WorkSheet,
  rowNumber: number,
  columnNumber: number
): string {
  const cell = getCell(sheet, rowNumber, columnNumber);
  if (!cell || cell.v === null || cell.v === undefined) return "";
  return cell.w ?? XLSX.utils.format_cell(cell);
}

function nullableText(
  sheet: XLSX.WorkSheet,
  rowNumber: number,
  columnNumber: number
): string | null {
  const value = cellText(sheet, rowNumber, columnNumber);
  return value === "" ? null : value;
}

function numberValue(
  sheet: XLSX.WorkSheet,
  rowNumber: number,
  columnNumber: number
): number | null {
  const cell = getCell(sheet, rowNumber, columnNumber);
  if (typeof cell?.v === "number" && Number.isFinite(cell.v)) return cell.v;
  const parsed = Number(cellText(sheet, rowNumber, columnNumber));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(
  sheet: XLSX.WorkSheet,
  rowNumber: number,
  columnNumber: number
): string | null {
  const cell = getCell(sheet, rowNumber, columnNumber);
  if (cell?.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  return nullableText(sheet, rowNumber, columnNumber);
}

function rowValues(sheet: XLSX.WorkSheet, rowNumber: number): string[] {
  return Array.from({ length: 13 }, (_, index) =>
    cellText(sheet, rowNumber, index + 1)
  );
}

function sheetSize(sheet: XLSX.WorkSheet): { rows: number; columns: number } {
  if (!sheet["!ref"]) return { rows: 0, columns: 0 };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  return {
    rows: range.e.r - range.s.r + 1,
    columns: range.e.c - range.s.c + 1
  };
}

function isSummaryOrInstructionRow(values: string[]): boolean {
  const joined = values.map((value) => value.trim()).join("|");
  return /(^|\|)(合计|小计|集团合计|说明)(\||$)/.test(joined);
}

function assertHeaders(sheet: XLSX.WorkSheet): void {
  const expected = [
    "源表序号",
    "项目ID",
    "归属分子公司",
    "项目名称",
    "是否外送",
    "业务类型",
    "项目状态",
    "项目负责人",
    "联系方式",
    "合作开始日期",
    "合作结束日期",
    "责任主体",
    "备注"
  ];
  const actual = expected.map((_, index) => cellText(sheet, 2, index + 1));
  if (actual.some((value, index) => value !== expected[index])) {
    throw new Error(`项目主数据表头不匹配：${JSON.stringify(actual)}`);
  }
}

function readSummary(sheet: XLSX.WorkSheet): SummaryRow[] {
  const { rows } = sheetSize(sheet);
  const result: SummaryRow[] = [];
  for (let rowNumber = 3; rowNumber <= rows; rowNumber += 1) {
    const branchName = cellText(sheet, rowNumber, 1);
    if (!branchName || branchName === "合计") continue;
    const projectCount = numberValue(sheet, rowNumber, 2);
    const externalProjectCount = numberValue(sheet, rowNumber, 3);
    const nonExternalProjectCount = numberValue(sheet, rowNumber, 4);
    if (
      projectCount === null ||
      externalProjectCount === null ||
      nonExternalProjectCount === null
    ) {
      throw new Error(`分子公司汇总第 ${rowNumber} 行缺少可核验的公式结果`);
    }
    result.push({
      branchName,
      projectCount,
      externalProjectCount,
      nonExternalProjectCount
    });
  }
  return result;
}

function addCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export async function readProjectWorkbook(
  sourceFile: string
): Promise<ProjectWorkbookPreview> {
  const sourceBuffer = await readFile(sourceFile);
  const sourceSha256 = createHash("sha256").update(sourceBuffer).digest("hex");
  const workbook = XLSX.read(sourceBuffer, {
    type: "buffer",
    cellDates: true,
    cellFormula: true,
    cellStyles: true
  });
  const summarySheet = workbook.Sheets["分子公司汇总"];
  const projectSheet = workbook.Sheets["项目主数据"];
  if (!summarySheet || !projectSheet) {
    throw new Error("工作簿缺少“分子公司汇总”或“项目主数据”工作表");
  }
  assertHeaders(projectSheet);

  const projects: ProjectMasterRow[] = [];
  const skipped: ProjectImportSkip[] = [];
  const { rows: projectRowCount } = sheetSize(projectSheet);
  for (let rowNumber = 3; rowNumber <= projectRowCount; rowNumber += 1) {
    const values = rowValues(projectSheet, rowNumber);
    if (values.every((value) => value === "")) continue;
    if (isSummaryOrInstructionRow(values)) {
      skipped.push({ sourceRow: rowNumber, reason: "汇总或说明行", values });
      continue;
    }
    const sourceNo = numberValue(projectSheet, rowNumber, 1);
    const sourceProjectId = cellText(projectSheet, rowNumber, 2);
    const branchName = cellText(projectSheet, rowNumber, 3);
    const projectName = cellText(projectSheet, rowNumber, 4);
    const externalText = cellText(projectSheet, rowNumber, 5);
    if (
      sourceNo === null ||
      !Number.isInteger(sourceNo) ||
      !sourceProjectId ||
      !branchName ||
      !projectName ||
      !["是", "否"].includes(externalText)
    ) {
      skipped.push({
        sourceRow: rowNumber,
        reason: "必填字段或是否外送值无效",
        values
      });
      continue;
    }
    projects.push({
      sourceRow: rowNumber,
      sourceNo,
      sourceProjectId,
      branchName,
      projectName,
      isExternal: externalText === "是",
      businessType: nullableText(projectSheet, rowNumber, 6),
      projectStatus: nullableText(projectSheet, rowNumber, 7),
      managerName: nullableText(projectSheet, rowNumber, 8),
      managerPhone: nullableText(projectSheet, rowNumber, 9),
      cooperationStart: dateValue(projectSheet, rowNumber, 10),
      cooperationEnd: dateValue(projectSheet, rowNumber, 11),
      responsibility: nullableText(projectSheet, rowNumber, 12),
      remark: nullableText(projectSheet, rowNumber, 13)
    });
  }

  const idCounts = new Map<string, number>();
  const branchNameCounts = new Map<string, number>();
  const globalNameRows = new Map<string, ProjectMasterRow[]>();
  const branchCounts = new Map<string, number>();
  const externalCounts = new Map<string, number>();
  for (const project of projects) {
    addCount(idCounts, project.sourceProjectId);
    addCount(branchNameCounts, `${project.branchName}\u0000${project.projectName}`);
    addCount(branchCounts, project.branchName);
    if (project.isExternal) addCount(externalCounts, project.branchName);
    const existing = globalNameRows.get(project.projectName) ?? [];
    existing.push(project);
    globalNameRows.set(project.projectName, existing);
  }
  const duplicateProjectIds = [...idCounts].filter(([, count]) => count > 1);
  const duplicateBranchNames = [...branchNameCounts].filter(([, count]) => count > 1);
  if (duplicateProjectIds.length > 0) {
    throw new Error(`项目 ID 重复：${duplicateProjectIds.map(([key]) => key).join("、")}`);
  }
  if (duplicateBranchNames.length > 0) {
    throw new Error(
      `同一分子公司项目名称重复：${duplicateBranchNames
        .map(([key]) => key.replace("\u0000", "/"))
        .join("、")}`
    );
  }

  const summary = readSummary(summarySheet);
  const branches = summary.map((item) => ({
    name: item.branchName,
    projectCount: branchCounts.get(item.branchName) ?? 0,
    externalProjectCount: externalCounts.get(item.branchName) ?? 0,
    nonExternalProjectCount:
      (branchCounts.get(item.branchName) ?? 0) -
      (externalCounts.get(item.branchName) ?? 0)
  }));
  const summaryMatchesDetail = summary.every((item) => {
    const detail = branches.find((branch) => branch.name === item.branchName);
    return (
      detail?.projectCount === item.projectCount &&
      detail.externalProjectCount === item.externalProjectCount &&
      detail.nonExternalProjectCount === item.nonExternalProjectCount
    );
  });

  const duplicateGlobalNames = [...globalNameRows.entries()].filter(
    ([, rows]) => rows.length > 1
  );
  const missingBusinessType = projects.filter((project) => !project.businessType);
  const missingMaintenance = projects.filter(
    (project) =>
      !project.projectStatus ||
      !project.managerName ||
      !project.managerPhone ||
      !project.cooperationStart ||
      !project.cooperationEnd ||
      !project.responsibility
  );
  const warnings: ProjectImportWarning[] = duplicateGlobalNames.map(
    ([projectName, rows]) => ({
      code: "GLOBAL_DUPLICATE_PROJECT_NAME",
      message: `项目名称“${projectName}”跨分子公司重复，保留源项目 ID 并按分子公司消歧`,
      sourceRows: rows.map((row) => row.sourceRow),
      projectIds: rows.map((row) => row.sourceProjectId)
    })
  );
  if (missingBusinessType.length > 0) {
    warnings.push({
      code: "MISSING_BUSINESS_TYPE",
      message: `${missingBusinessType.length} 个项目的业务类型为空，保持空值待维护`,
      sourceRows: missingBusinessType.map((row) => row.sourceRow),
      projectIds: missingBusinessType.map((row) => row.sourceProjectId)
    });
  }
  if (missingMaintenance.length > 0) {
    warnings.push({
      code: "MISSING_PROJECT_MAINTENANCE_FIELDS",
      message: `${missingMaintenance.length} 个项目缺少至少一项状态、负责人、联系方式、合作期限或责任主体，保持空值待维护`,
      sourceRows: missingMaintenance.map((row) => row.sourceRow),
      projectIds: missingMaintenance.map((row) => row.sourceProjectId)
    });
  }

  return {
    schemaVersion: 1,
    sourceFile,
    sourceSha256,
    sheets: workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      return { name, ...(sheet ? sheetSize(sheet) : { rows: 0, columns: 0 }) };
    }),
    branches,
    projects,
    skipped,
    warnings,
    reconciliation: {
      branchCount: branches.length,
      projectCount: projects.length,
      externalProjectCount: projects.filter((project) => project.isExternal).length,
      nonExternalProjectCount: projects.filter((project) => !project.isExternal).length,
      summaryMatchesDetail,
      duplicateProjectIdCount: duplicateProjectIds.length,
      duplicateBranchProjectNameCount: duplicateBranchNames.length,
      duplicateGlobalProjectNameCount: duplicateGlobalNames.length,
      missingBusinessTypeCount: missingBusinessType.length,
      missingMaintenanceFieldProjectCount: missingMaintenance.length
    }
  };
}
