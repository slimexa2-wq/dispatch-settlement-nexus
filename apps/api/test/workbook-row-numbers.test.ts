import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSalaryWorkbook, salaryHeaders } from "../src/services/salary-workbook.js";

describe("Excel 原始行号", () => {
  it("工资条中间空行不会压缩后续数据的源行号", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [...salaryHeaders],
      ["2026-07", "510101199001011234", "", 5000, 4500],
      [],
      ["2026-07", "510101199001011235", "", 5200, 4700]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "工资条");
    const buffer = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    const parsed = parseSalaryWorkbook(buffer);
    expect(parsed.rows).toMatchObject([{ sourceRow: 2 }, { sourceRow: 4 }]);
  });
});
