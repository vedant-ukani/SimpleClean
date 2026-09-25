import { createTestEnvironment } from "@laundrorama/test-support";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFileDownloadUrl,
  createFileUploadGrant,
  getFiles,
  uploadFileContent,
} from "../src/lib/files-client";

const timestamp = new Date().toISOString();
const file = {
  id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
  target: {
    type: "machine" as const,
    id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
  },
  purpose: "nameplate" as const,
  originalFilename: "plate.jpg",
  declaredMediaType: "image/jpeg" as const,
  detectedMediaType: null,
  declaredByteCount: 4,
  byteCount: null,
  sha256: null,
  uploaderUserId: "user-1",
  state: "pending_upload" as const,
  failureCode: null,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const grant = {
  fileId: file.id,
  token: "a".repeat(43),
  expiresAt: timestamp,
};

afterEach(() => vi.unstubAllGlobals());

describe("files client", () => {
  it("validates private metadata and forwards the server session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ files: [file] }), { status: 200 }),
      );
    await expect(
      getFiles(file.target, fetcher, createTestEnvironment(), "session=cookie"),
    ).resolves.toEqual([file]);
    expect(fetcher).toHaveBeenCalledWith(
      `http://localhost:3001/files?machineId=${file.target.id}`,
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "session=cookie" }),
      }),
    );
  });

  it("uses a one-time header grant for multipart upload and query grant for download", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ file, grant }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            file: {
              ...file,
              state: "ready",
              detectedMediaType: "image/jpeg",
              byteCount: 4,
              sha256: "b".repeat(64),
              version: 2,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ grant }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const granted = await createFileUploadGrant({
      target: file.target,
      purpose: "nameplate",
      originalFilename: "plate.jpg",
      declaredMediaType: "image/jpeg",
      declaredByteCount: 4,
    });
    await uploadFileContent(
      file.id,
      granted.grant.token,
      new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], "plate.jpg", {
        type: "image/jpeg",
      }),
    );
    await expect(createFileDownloadUrl(file.id)).resolves.toContain(
      `grant=${grant.token}`,
    );
    expect(fetcher.mock.calls[1]![1]).toEqual(
      expect.objectContaining({
        body: expect.any(FormData),
        headers: expect.objectContaining({ "x-file-grant": grant.token }),
      }),
    );
  });
});
