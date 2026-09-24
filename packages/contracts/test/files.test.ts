import { describe, expect, it } from "vitest";

import {
  CreateFileUploadGrantRequestSchema,
  FILE_PURPOSES,
  FILE_STATES,
  FileAttachmentSchema,
} from "../src/index.js";

describe("file contracts", () => {
  it("defines the supported purposes and lifecycle states", () => {
    expect(FILE_PURPOSES).toEqual([
      "nameplate",
      "arrival_condition",
      "document",
      "receipt",
      "other",
      "intake_evidence",
      "preliminary_inspection",
    ]);
    expect(FILE_STATES).toEqual([
      "pending_upload",
      "ready",
      "failed",
      "abandoned",
    ]);
  });

  it("validates explicit targets and private attachment metadata", () => {
    const target = {
      type: "machine",
      id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
    } as const;
    expect(
      CreateFileUploadGrantRequestSchema.safeParse({
        target,
        purpose: "nameplate",
        originalFilename: "plate.jpg",
        declaredMediaType: "image/jpeg",
        declaredByteCount: 4,
      }).success,
    ).toBe(true);
    expect(
      FileAttachmentSchema.safeParse({
        id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
        target,
        purpose: "nameplate",
        originalFilename: "plate.jpg",
        declaredMediaType: "image/jpeg",
        detectedMediaType: null,
        declaredByteCount: 4,
        byteCount: null,
        sha256: null,
        uploaderUserId: "user-1",
        state: "pending_upload",
        failureCode: null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
});
