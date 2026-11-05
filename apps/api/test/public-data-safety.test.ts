import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateSyntheticDemoData
} from "../../../scripts/lib/synthetic-demo-data.mjs";
import {
  assertPublicValueSafe,
  assertPublicDataSafe,
  PublicDataSafetyError
} from "../../../scripts/lib/public-data-safety.mjs";

describe("public demo data safety", () => {
  it("rejects a dataset that still points to a real roster source", () => {
    expect(() => assertPublicValueSafe({
      meta: { sourceFile: "唯一数据.xls", synthetic: false },
      people: [{ name: "测试人员", idCard: "510000199001011234" }]
    }, "fixture.json")).toThrow(PublicDataSafetyError);
  });

  it("produces deterministic and explicitly synthetic demo identities", () => {
    const first = generateSyntheticDemoData(20260726);
    const second = generateSyntheticDemoData(20260726);

    expect(first).toEqual(second);
    expect(first.meta).toMatchObject({
      synthetic: true,
      seed: 20260726
    });
    expect(first.people).toHaveLength(48);
    expect(first.people.every((person) => (
      person.synthetic === true
      && person.phone.length === 11
      && person.idCard.length === 18
      && person.employeeNo.length > 0
    ))).toBe(true);
  });

  it("rejects legacy runtime screenshots from the public source tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiangneng-public-safety-"));
    try {
      const screenshots = join(root, "apps", "admin", "screenshots");
      await mkdir(screenshots, { recursive: true });
      await writeFile(join(screenshots, "debug-person.png"), "not-a-real-image");
      await expect(assertPublicDataSafe(root)).rejects.toThrow("apps\\admin\\screenshots");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
