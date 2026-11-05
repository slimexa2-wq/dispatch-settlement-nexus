import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DiskFileStore } from "../src/files.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true })
    )
  );
});

describe("本地文件存储", () => {
  it("保存原始内容并返回可审计的SHA-256", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiangneng-files-"));
    temporaryDirectories.push(root);
    const store = new DiskFileStore(root, 1024);
    const content = Buffer.from("synthetic reimbursement evidence", "utf8");

    const saved = await store.save({
      stream: Readable.from(content),
      filename: "../付款凭证.pdf",
      mimeType: "application/pdf"
    });

    expect(saved.originalName).toBe("付款凭证.pdf");
    expect(saved.sizeBytes).toBe(content.length);
    expect(saved.sha256).toBe(createHash("sha256").update(content).digest("hex"));
    expect(await readFile(join(root, saved.storageKey))).toEqual(content);
  });

  it("超过限制时不保留半成品", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiangneng-files-"));
    temporaryDirectories.push(root);
    const store = new DiskFileStore(root, 4);

    await expect(store.save({
      stream: Readable.from(Buffer.from("12345")),
      filename: "too-large.pdf",
      mimeType: "application/pdf"
    })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });
});
