import { describe, expect, it } from "vitest";
import { csvCell, neutralizeSpreadsheetFormula } from "../src/services/spreadsheet-safety.js";

describe("表格导出安全", () => {
  it("对 Excel 公式危险前缀中和且保持普通文本与数字不变", () => {
    expect(neutralizeSpreadsheetFormula("=HYPERLINK(\"https://example.invalid\")")).toBe("'=HYPERLINK(\"https://example.invalid\")");
    expect(neutralizeSpreadsheetFormula("  +1+1")).toBe("'  +1+1");
    expect(neutralizeSpreadsheetFormula("正常姓名")).toBe("正常姓名");
    expect(neutralizeSpreadsheetFormula(123)).toBe(123);
    expect(csvCell("@SUM(1,2)")).toBe("\"'@SUM(1,2)\"");
  });
});
