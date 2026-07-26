import { describe, expect, it } from "vitest";
import { dateTimeReply } from "../src/ai/date-time.js";

describe("祥能 AI 日期/时间规则快速通道", () => {
  it("今天几号 -> 返回包含 年/月/日的日期串", () => {
    const reply = dateTimeReply("今天几号");
    expect(reply).not.toBeNull();
    expect(reply).toContain("年");
    expect(reply).toContain("月");
    expect(reply).toContain("日");
  });

  it("现在几点 -> 返回北京时间", () => {
    const reply = dateTimeReply("现在几点");
    expect(reply).not.toBeNull();
    expect(reply).toContain("北京时间");
    expect(reply).toMatch(/\d{2}:\d{2}/);
  });

  it("明天星期几 -> 返回明天日期与星期", () => {
    const reply = dateTimeReply("明天星期几");
    expect(reply).not.toBeNull();
    expect(reply).toContain("明天是");
    expect(reply).toContain("年");
    expect(reply).toContain("月");
    expect(reply).toMatch(/星期[一二三四五六日]/);
  });

  it("本月有几天 -> 返回当月天数", () => {
    const reply = dateTimeReply("本月有几天");
    expect(reply).not.toBeNull();
    expect(reply).toContain("天");
    expect(reply).toMatch(/一共有 \d+ 天/);
  });

  it("今年是哪年 -> 返回年份", () => {
    const reply = dateTimeReply("今年是哪年");
    expect(reply).not.toBeNull();
    expect(reply).toContain("年");
    expect(reply).toMatch(/今年是 \d{4} 年/);
  });

  it("业务查询（本月入职多少人）被 GUARD 拦截返回 null", () => {
    const reply = dateTimeReply("本月入职多少人");
    expect(reply).toBeNull();
  });
});
