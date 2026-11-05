import { describe, it, expect } from "vitest";
import { identifyTableFingerprint } from "./smart-importer.js";

describe("identifyTableFingerprint", () => {
  it("should map headers correctly", () => {
    const headers = ["员工姓名", "身份证号码", "项目名称", "总工时", "出勤天数", "备注"];
    const result = identifyTableFingerprint(headers);

    expect(result.mappings[0].mappedField).toBe("name");
    expect(result.mappings[1].mappedField).toBe("idCard");
    expect(result.mappings[2].mappedField).toBe("projectName");
    expect(result.mappings[3].mappedField).toBe("hours");
    expect(result.mappings[4].mappedField).toBe("days");
    expect(result.mappings[5].mappedField).toBeNull();
  });

  it("should detect divisor 10", () => {
    const headers = ["姓名", "工时", "天数"];
    const rows = [
      ["张三", "250", "25"]
    ];
    const result = identifyTableFingerprint(headers, rows);
    expect(result.divisor).toBe(10);
  });

  it("should detect divisor 11", () => {
    const headers = ["姓名", "工时", "天数"];
    const rows = [
      ["李四", "286", "26"]
    ];
    const result = identifyTableFingerprint(headers, rows);
    expect(result.divisor).toBe(11);
  });

  it("should detect divisor 12", () => {
    const headers = ["姓名", "工时", "天数"];
    const rows = [
      ["王五", "300", "25"]
    ];
    const result = identifyTableFingerprint(headers, rows);
    expect(result.divisor).toBe(12);
  });

  it("should return null divisor if unable to determine", () => {
    const headers = ["姓名", "工时", "天数"];
    const rows = [
      ["赵六", "100", "0"],
      ["孙七", "invalid", "10"]
    ];
    const result = identifyTableFingerprint(headers, rows);
    expect(result.divisor).toBeNull();
  });
});
