import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { AppError } from "./errors.js";

export type SavedFile = {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export interface FileStore {
  save(input: {
    stream: Readable;
    filename: string;
    mimeType: string;
  }): Promise<SavedFile>;
  open(storageKey: string): Readable;
  remove(storageKey: string): Promise<void>;
}

export class DiskFileStore implements FileStore {
  private readonly root: string;

  constructor(root: string, private readonly maxBytes: number) {
    this.root = resolve(root);
  }

  async save(input: { stream: Readable; filename: string; mimeType: string }): Promise<SavedFile> {
    await mkdir(this.root, { recursive: true });
    const storageKey = randomUUID();
    const destination = this.safePath(storageKey);
    let sizeBytes = 0;
    input.stream.on("data", (chunk: Buffer | string) => {
      sizeBytes += Buffer.byteLength(chunk);
      if (sizeBytes > this.maxBytes) {
        input.stream.destroy(new AppError(413, "FILE_TOO_LARGE", `文件不能超过 ${this.maxBytes} 字节`));
      }
    });
    await pipeline(input.stream, createWriteStream(destination, { flags: "wx" }));
    return {
      storageKey,
      originalName: basename(input.filename),
      mimeType: input.mimeType || "application/octet-stream",
      sizeBytes
    };
  }

  open(storageKey: string): Readable {
    return createReadStream(this.safePath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.safePath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private safePath(storageKey: string): string {
    if (!/^[a-f0-9-]{36}$/i.test(storageKey)) {
      throw new AppError(400, "INVALID_STORAGE_KEY", "文件标识无效");
    }
    const path = resolve(this.root, storageKey);
    if (!path.startsWith(`${this.root}${sep}`)) {
      throw new AppError(400, "INVALID_STORAGE_KEY", "文件标识无效");
    }
    return path;
  }
}
