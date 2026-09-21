import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import type {
  StorageAdapter,
  StorageObject,
  StorageObjectMetadata,
} from "./storage.adapter.js";

const GENERATED_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(
    key: string,
    bytes: Buffer,
    metadata: StorageObjectMetadata,
  ): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
    await writeFile(`${path}.meta.json`, JSON.stringify(metadata), {
      flag: "wx",
      mode: 0o600,
    });
  }

  async head(key: string): Promise<StorageObjectMetadata | undefined> {
    const path = this.path(key);
    try {
      const [details, metadataBytes, bytes] = await Promise.all([
        stat(path),
        readFile(`${path}.meta.json`),
        readFile(path),
      ]);
      const metadata = JSON.parse(
        metadataBytes.toString("utf8"),
      ) as StorageObjectMetadata;
      return {
        byteCount: details.size,
        mediaType: metadata.mediaType,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  async get(key: string): Promise<StorageObject | undefined> {
    const metadata = await this.head(key);
    if (!metadata) return undefined;
    return { ...metadata, bytes: await readFile(this.path(key)) };
  }

  async delete(key: string): Promise<void> {
    const path = this.path(key);
    await Promise.all([
      removeIfPresent(path),
      removeIfPresent(`${path}.meta.json`),
    ]);
  }

  private path(key: string): string {
    if (!GENERATED_KEY.test(key)) {
      throw new Error("Invalid generated storage key");
    }
    const candidate = resolve(this.root, key);
    if (!candidate.startsWith(`${this.root}${sep}`)) {
      throw new Error("Storage key escapes configured root");
    }
    return candidate;
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

export function localMetadata(
  byteCount: number,
  mediaType: string,
  sha256: string,
): StorageObjectMetadata {
  return { byteCount, mediaType, sha256 };
}
