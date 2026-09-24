import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  createIntakePreview,
  detectMediaType,
  inspectContent,
  inspectStoredIntakePreview,
} from "../src/modules/files/content-policy.js";

describe("Intake file policy", () => {
  it("recognizes HEIC and HEIF brands without trusting the filename", () => {
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheic\0\0\0\0heic", "ascii"),
    ]);
    const heif = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheif\0\0\0\0heif", "ascii"),
    ]);
    expect(detectMediaType(heic)).toBe("image/heic");
    expect(detectMediaType(heif)).toBe("image/heif");
  });

  it("bounds previews and returns a private JPEG derivative", async () => {
    const bytes = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: 30, g: 120, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
    const input = {
      target: {
        type: "load" as const,
        id: "00000000-0000-4000-8000-000000000001",
      },
      purpose: "intake_evidence" as const,
      originalFilename: "phone-photo.heic",
      declaredMediaType: "image/jpeg" as const,
      declaredByteCount: bytes.byteLength,
    };
    const inspected = inspectContent(input, bytes, 1_000_000);
    const preview = await createIntakePreview(bytes, inspected.mediaType);
    expect(preview.byteCount).toBeGreaterThan(0);
    expect(preview.bytes.subarray(0, 3)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );
    expect(preview.byteCount).toBeLessThan(2 * 1024 * 1024);
    const dimensions = await inspectStoredIntakePreview(preview.bytes);
    expect(dimensions.width).toBeLessThanOrEqual(2_000);
    expect(dimensions.height).toBeLessThanOrEqual(2_000);
  });

  it("rejects a stored semantic preview that exceeds the 2000px profile", async () => {
    const oversized = await sharp({
      create: { width: 2_001, height: 10, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    await expect(inspectStoredIntakePreview(oversized)).rejects.toMatchObject({
      code: "dimensions_exceeded",
    });
  });

  it("decodes a representative supplied HEIC photo in memory", async () => {
    const bytes = await readFile(
      "../../source-materials/inventory/laundrorama-inventory-photos/IMG_6193.HEIC",
    );
    const preview = await createIntakePreview(bytes, "image/heic");
    expect(preview.bytes.subarray(0, 3)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );
    expect(preview.byteCount).toBeLessThan(2 * 1024 * 1024);
  });
});
