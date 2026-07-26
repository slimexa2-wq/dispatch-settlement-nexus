import { describe, expect, it } from "vitest";
import { chinaDateLabel, parseDateOnly } from "../src/dates.js";

describe("中国业务日期", () => {
  it("午夜业务日期不会因 UTC 序列化提前一天", () => {
    expect(chinaDateLabel(new Date("2026-07-25T16:00:00.000Z"))).toBe("2026-07-26");
  });

  it("将 PostgreSQL date 值规范化为同一天的 UTC 午夜", () => {
    expect(parseDateOnly("2026-07-26").toISOString()).toBe("2026-07-26T00:00:00.000Z");
    expect(() => parseDateOnly("2026-02-30")).toThrow(RangeError);
  });
});
