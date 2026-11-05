import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { buffer as streamToBuffer } from "node:stream/consumers";
import { AppError } from "./errors.js";

export type SavedFile = {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

export interface FileStore {
  save(input: {
    stream: Readable;
    filename: string;
    mimeType: string;
  }): Promise<SavedFile>;
  open(storageKey: string): Promise<Readable>;
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
    const digest = createHash("sha256");
    input.stream.on("data", (chunk: Buffer | string) => {
      sizeBytes += Buffer.byteLength(chunk);
      digest.update(chunk);
      if (sizeBytes > this.maxBytes) {
        input.stream.destroy(new AppError(413, "FILE_TOO_LARGE", `文件不能超过 ${this.maxBytes} 字节`));
      }
    });
    try {
      await pipeline(input.stream, createWriteStream(destination, { flags: "wx" }));
    } catch (error) {
      await this.remove(storageKey);
      throw error;
    }
    return {
      storageKey,
      originalName: basename(input.filename),
      mimeType: input.mimeType || "application/octet-stream",
      sizeBytes,
      sha256: digest.digest("hex")
    };
  }

  async open(storageKey: string): Promise<Readable> {
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

export type CosFileStoreOptions = {
  region: string;
  bucket: string;
  secretId: string;
  secretKey: string;
  endpoint?: string;
  maxBytes: number;
};

function hmacSha1(key: string, value: string): string {
  return createHmac("sha1", key).update(value).digest("hex");
}

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

export class CosFileStore implements FileStore {
  private readonly baseUrl: URL;

  constructor(private readonly options: CosFileStoreOptions) {
    this.baseUrl = new URL(
      options.endpoint ??
        `https://${options.bucket}.cos.${options.region}.myqcloud.com`
    );
    if (this.baseUrl.protocol !== "https:") {
      throw new AppError(500, "INVALID_COS_ENDPOINT", "COS 文件存储必须使用 HTTPS");
    }
  }

  async save(input: {
    stream: Readable;
    filename: string;
    mimeType: string;
  }): Promise<SavedFile> {
    const content = await streamToBuffer(input.stream);
    if (content.length > this.options.maxBytes) {
      throw new AppError(
        413,
        "FILE_TOO_LARGE",
        `文件不能超过 ${this.options.maxBytes} 字节`
      );
    }
    const storageKey = randomUUID();
    const response = await fetch(this.objectUrl(storageKey), {
      method: "PUT",
      headers: {
        authorization: this.authorization("put", storageKey),
        "content-type": input.mimeType || "application/octet-stream"
      },
      body: content
    });
    if (!response.ok) {
      throw new AppError(
        502,
        "COS_UPLOAD_FAILED",
        `COS 上传失败（HTTP ${response.status}）`
      );
    }
    return {
      storageKey,
      originalName: basename(input.filename),
      mimeType: input.mimeType || "application/octet-stream",
      sizeBytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex")
    };
  }

  async open(storageKey: string): Promise<Readable> {
    this.assertStorageKey(storageKey);
    const response = await fetch(this.objectUrl(storageKey), {
      headers: { authorization: this.authorization("get", storageKey) }
    });
    if (!response.ok || !response.body) {
      throw new AppError(
        response.status === 404 ? 404 : 502,
        response.status === 404 ? "FILE_NOT_FOUND" : "COS_DOWNLOAD_FAILED",
        response.status === 404
          ? "文件不存在"
          : `COS 下载失败（HTTP ${response.status}）`
      );
    }
    return Readable.fromWeb(
      response.body as unknown as Parameters<typeof Readable.fromWeb>[0]
    );
  }

  async remove(storageKey: string): Promise<void> {
    this.assertStorageKey(storageKey);
    const response = await fetch(this.objectUrl(storageKey), {
      method: "DELETE",
      headers: { authorization: this.authorization("delete", storageKey) }
    });
    if (!response.ok && response.status !== 404) {
      throw new AppError(
        502,
        "COS_DELETE_FAILED",
        `COS 删除失败（HTTP ${response.status}）`
      );
    }
  }

  private objectUrl(storageKey: string): URL {
    this.assertStorageKey(storageKey);
    return new URL(`/${storageKey}`, this.baseUrl);
  }

  private authorization(method: string, storageKey: string): string {
    this.assertStorageKey(storageKey);
    const now = Math.floor(Date.now() / 1000);
    const keyTime = `${now - 60};${now + 3600}`;
    const host = this.baseUrl.host.toLowerCase();
    const httpString = `${method.toLowerCase()}\n/${storageKey}\n\nhost=${host}\n`;
    const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
    const signKey = hmacSha1(this.options.secretKey, keyTime);
    const signature = hmacSha1(signKey, stringToSign);
    return [
      "q-sign-algorithm=sha1",
      `q-ak=${this.options.secretId}`,
      `q-sign-time=${keyTime}`,
      `q-key-time=${keyTime}`,
      "q-header-list=host",
      "q-url-param-list=",
      `q-signature=${signature}`
    ].join("&");
  }

  private assertStorageKey(storageKey: string): void {
    if (!/^[a-f0-9-]{36}$/i.test(storageKey)) {
      throw new AppError(400, "INVALID_STORAGE_KEY", "文件标识无效");
    }
  }
}
