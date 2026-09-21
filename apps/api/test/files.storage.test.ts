import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { parseServerEnvironment } from "@simply-clean/config";
import { createTestEnvironment } from "@simply-clean/test-support";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FilePolicyError,
  inspectContent,
  safeDownloadFilename,
  validateUploadGrantRequest,
} from "../src/modules/files/content-policy.js";
import { LocalStorageAdapter } from "../src/modules/files/local-storage.adapter.js";
import {
  S3StorageAdapter,
  type S3CommandClient,
} from "../src/modules/files/s3-storage.adapter.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("file storage and content policy", () => {
  it("stores private local objects with verified metadata and confines keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "simply-clean-files-"));
    roots.push(root);
    const storage = new LocalStorageAdapter(root);
    const key =
      "3498c172-93d8-4eca-b0f6-0e70fe03516c/a6ebd4ca-f41a-4e94-a247-b0b359a65d66";
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const metadata = inspectContent(
      {
        target: {
          type: "machine",
          id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
        },
        purpose: "nameplate",
        originalFilename: "plate.jpg",
        declaredMediaType: "image/jpeg",
        declaredByteCount: bytes.length,
      },
      bytes,
      100,
    );
    await storage.put(key, bytes, metadata);
    await expect(storage.head(key)).resolves.toEqual(metadata);
    await expect(storage.get(key)).resolves.toEqual({ ...metadata, bytes });
    await expect(storage.head("../../outside")).rejects.toThrow(
      "Invalid generated storage key",
    );
    await storage.delete(key);
    await expect(storage.head(key)).resolves.toBeUndefined();
  });

  it("rejects disguised, mismatched, oversized, and unsafe-purpose content", () => {
    const request = {
      target: {
        type: "machine",
        id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
      },
      purpose: "nameplate",
      originalFilename: "plate.jpg",
      declaredMediaType: "image/jpeg",
      declaredByteCount: 4,
    } as const;
    expect(() => inspectContent(request, Buffer.from("text"), 100)).toThrow(
      FilePolicyError,
    );
    expect(() =>
      inspectContent(
        { ...request, declaredMediaType: "image/png" },
        Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        100,
      ),
    ).toThrow("File content did not satisfy policy");
    expect(() => validateUploadGrantRequest(request, 3)).toThrow();
    expect(() =>
      validateUploadGrantRequest(
        {
          ...request,
          purpose: "document",
          declaredMediaType: "image/jpeg",
        },
        100,
      ),
    ).toThrow();
    expect(safeDownloadFilename('receipt\r\n".pdf')).toBe("receipt___.pdf");
  });

  it("maps S3 v3 commands without leaking provider details", async () => {
    const send = vi
      .fn<S3CommandClient["send"]>()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        ContentLength: 4,
        ContentType: "image/jpeg",
        Metadata: { sha256: "a".repeat(64) },
      })
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () => Uint8Array.from([1, 2, 3, 4]),
        },
      })
      .mockResolvedValueOnce({
        ContentLength: 4,
        ContentType: "image/jpeg",
        Metadata: { sha256: "a".repeat(64) },
      })
      .mockResolvedValueOnce({});
    const client: S3CommandClient = { send };
    const config = parseServerEnvironment(
      createTestEnvironment({
        FILE_STORAGE_DRIVER: "s3",
        FILE_S3_BUCKET: "private-files",
        FILE_S3_REGION: "us-east-1",
        FILE_S3_ENDPOINT: "http://localhost:9000",
        FILE_S3_FORCE_PATH_STYLE: "true",
      }),
    );
    expect(config).toMatchObject({
      fileS3Endpoint: "http://localhost:9000",
      fileS3ForcePathStyle: true,
    });
    const adapter = new S3StorageAdapter(config, client);
    const metadata = {
      byteCount: 4,
      mediaType: "image/jpeg" as const,
      sha256: "a".repeat(64),
    };
    await adapter.put("key", Buffer.from([1, 2, 3, 4]), metadata);
    await expect(adapter.head("key")).resolves.toEqual(metadata);
    await expect(adapter.get("key")).resolves.toMatchObject(metadata);
    await adapter.delete("key");
    expect(send.mock.calls[0]![0]).toBeInstanceOf(PutObjectCommand);
    expect((send.mock.calls[0]![0] as PutObjectCommand).input).toMatchObject({
      Bucket: "private-files",
      Key: "key",
      ACL: "private",
    });
    expect(send.mock.calls[1]![0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[2]![0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[4]![0]).toBeInstanceOf(DeleteObjectCommand);
  });
});
