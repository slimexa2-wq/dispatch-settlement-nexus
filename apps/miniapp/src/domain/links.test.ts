import { describe, expect, it } from "vitest";
import { jobDetailPath, referralTokenFromParams } from "./links";

describe("推荐分享链接", () => {
  it("优先读取显式 ref 并解析微信二维码 scene", () => {
    expect(referralTokenFromParams({ ref: "signed-token", scene: "r=ignored" })).toBe("signed-token");
    expect(referralTokenFromParams({ scene: encodeURIComponent("r=scene-token") })).toBe("scene-token");
  });

  it("生成可直接进入岗位详情并保留推荐签名的页面路径", () => {
    expect(jobDetailPath("job/id", "signed token")).toBe(
      "/pages/jobs/detail/index?id=job%2Fid&ref=signed%20token"
    );
  });
});
