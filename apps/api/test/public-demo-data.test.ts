import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadPublicDemoData,
  parsePublicDemoData
} from "../../../scripts/lib/public-demo-data.mjs";

describe("public demo data source", () => {
  it("loads the committed deterministic synthetic dataset", async () => {
    const data = await loadPublicDemoData(resolve(
      import.meta.dirname,
      "../../../data/synthetic/demo-data.json"
    ));

    expect(data.meta.synthetic).toBe(true);
    expect(data.people).toHaveLength(48);
    expect(data.projects).toHaveLength(8);
  });

  it("rejects a dataset without an explicit synthetic marker", () => {
    expect(() => parsePublicDemoData({
      meta: { synthetic: false },
      people: []
    })).toThrow("PUBLIC_DEMO_DATA_INVALID");
  });
});
