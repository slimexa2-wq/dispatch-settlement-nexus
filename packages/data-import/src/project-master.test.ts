import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readProjectWorkbook } from "./project-master.js";

let fixtureDirectory = "";
let sourceFile = "";

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(path.join(tmpdir(), "xiangneng-project-master-"));
  sourceFile = path.join(fixtureDirectory, "synthetic-project-master.xlsx");

  const summaryRows = [
    ["分子公司汇总"],
    ["分子公司", "项目数量", "外送项目", "非外送项目"],
    ["祥能演示一分公司", 2, 1, 1],
    ["祥能演示二分公司", 2, 0, 2],
    ["合计", 4, 1, 3]
  ];
  const projectRows = [
    ["项目主数据"],
    [
      "源表序号", "项目ID", "归属分子公司", "项目名称", "是否外送",
      "业务类型", "项目状态", "项目负责人", "联系方式", "合作开始日期",
      "合作结束日期", "责任主体", "备注"
    ],
    [1, "SYN-001", "祥能演示一分公司", "祥能智造示范项目", "否", "智能制造", "ACTIVE", "演示负责人甲", "19100000001", "2026-01-01", "2028-12-31", "OURS", "纯合成演示数据"],
    [2, "SYN-002", "祥能演示一分公司", "协同服务项目", "是", "服务外包", "ACTIVE", "演示负责人乙", "19100000002", "2026-02-01", "2028-12-31", "JOINT", "纯合成演示数据"],
    [3, "SYN-003", "祥能演示二分公司", "祥能数智中心项目", "否", "数字服务", "ACTIVE", "演示负责人丙", "19100000003", "2026-03-01", "2028-12-31", "OURS", "纯合成演示数据"],
    [4, "SYN-004", "祥能演示二分公司", "协同服务项目", "否", "服务外包", "ACTIVE", "演示负责人丁", "19100000004", "2026-04-01", "2028-12-31", "CLIENT", "纯合成演示数据"]
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), "分子公司汇总");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(projectRows), "项目主数据");
  await writeFile(sourceFile, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
});

afterAll(async () => {
  if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true });
});

describe("项目主数据 Excel", () => {
  it("只读取有效项目并与汇总对账", async () => {
    const result = await readProjectWorkbook(sourceFile);
    expect(result.reconciliation).toMatchObject({
      branchCount: 2,
      projectCount: 4,
      externalProjectCount: 1,
      nonExternalProjectCount: 3,
      summaryMatchesDetail: true,
      duplicateProjectIdCount: 0,
      duplicateBranchProjectNameCount: 0,
      duplicateGlobalProjectNameCount: 1,
      missingBusinessTypeCount: 0,
      missingMaintenanceFieldProjectCount: 0
    });
    expect(result.skipped).toHaveLength(0);
    expect(result.projects.at(0)?.sourceProjectId).toBe("SYN-001");
    expect(result.projects.at(-1)?.sourceProjectId).toBe("SYN-004");
  });

  it("保留跨分子公司的同名项目并输出警告", async () => {
    const result = await readProjectWorkbook(sourceFile);
    const duplicateWarnings = result.warnings.filter(
      (warning) => warning.code === "GLOBAL_DUPLICATE_PROJECT_NAME"
    );
    expect(duplicateWarnings).toHaveLength(1);
    expect(duplicateWarnings.flatMap((warning) => warning.projectIds ?? [])).toEqual(
      expect.arrayContaining(["SYN-002", "SYN-004"])
    );
  });
});
