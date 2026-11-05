import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatPhone, localDateString, localMonthString, statusLabel } from "./format";

describe("display formatting", () => {
  it("keeps missing values explicit", () => {
    expect(formatDate(null)).toBe("暂无");
    expect(formatMoney(undefined)).toBe("暂无");
  });

  it("formats decimal strings returned by Prisma", () => {
    expect(formatMoney("1234.5")).toBe("¥1234.50");
  });

  it("shows full phone numbers and translates statuses", () => {
    expect(formatPhone("13812345678")).toBe("13812345678");
    expect(statusLabel("PENDING_ONBOARD")).toBe("待入职");
  });

  it("builds date-only values from local calendar fields", () => {
    const localDate = new Date(2026, 6, 18, 0, 15, 0);
    expect(localDateString(localDate)).toBe("2026-07-18");
    expect(localMonthString(localDate)).toBe("2026-07");
  });
});
