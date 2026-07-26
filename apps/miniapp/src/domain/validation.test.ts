import { describe, expect, it } from "vitest";
import { normalizeRegistration, validateRegistration } from "./validation";

describe("registration rules", () => {
  it("normalizes identity without inventing missing fields", () => {
    const normalized = normalizeRegistration({
      name: " 张三 ",
      idCard: "51000000000000000x",
      phone: "13800000000",
      projectId: "p1",
      jobTitle: " 操作工 ",
      source: "SELF",
      notes: ""
    });
    expect(normalized.idCard).toBe("51000000000000000X");
    expect(normalized.name).toBe("张三");
    expect(normalized.notes).toBeNull();
  });

  it("reports all blocking form errors", () => {
    const errors = validateRegistration({ name: "", idCard: "1", phone: "2", projectId: "", jobTitle: "", source: "OPERATOR" });
    expect(errors).toHaveLength(5);
  });
});
