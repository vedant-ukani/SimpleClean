import type {
  CreateFileUploadGrantRequest,
  FileMediaType,
} from "@laundrorama/contracts";
import sharp from "sharp";
import decodeHeic from "heic-decode";

export type FilePolicyFailureCode =
  | "size_exceeded"
  | "size_mismatch"
  | "unsupported_content"
  | "media_type_mismatch"
  | "purpose_mismatch"
  | "storage_failed"
  | "dimensions_exceeded"
  | "preview_failed"
  | "checksum_mismatch"
  | "missing_analysis_bytes";

export class FilePolicyError extends Error {
  constructor(readonly code: FilePolicyFailureCode) {
    super("File content did not satisfy policy");
    this.name = "FilePolicyError";
  }
}

export function validateUploadGrantRequest(
  input: CreateFileUploadGrantRequest,
  maxBytes: number,
  videoMaxBytes = maxBytes,
): void {
  if (
    input.declaredByteCount >
    (input.purpose === "production_test_video" ? videoMaxBytes : maxBytes)
  ) {
    throw new FilePolicyError("size_exceeded");
  }
  if (input.purpose === "nameplate" && input.target.type !== "machine") {
    throw new FilePolicyError("purpose_mismatch");
  }
  if (
    (input.purpose === "preliminary_inspection" ||
      input.purpose === "production_test_evidence" ||
      input.purpose === "production_test_video") &&
    input.target.type !== "machine"
  ) {
    throw new FilePolicyError("purpose_mismatch");
  }
  if (input.purpose === "intake_evidence" && input.target.type !== "load") {
    throw new FilePolicyError("purpose_mismatch");
  }
  validatePurposeMediaType(input.purpose, input.declaredMediaType);
}

export function inspectContent(
  input: CreateFileUploadGrantRequest,
  bytes: Buffer,
  maxBytes: number,
  videoMaxBytes = maxBytes,
): { mediaType: FileMediaType; byteCount: number; sha256: string } {
  if (
    bytes.byteLength >
    (input.purpose === "production_test_video" ? videoMaxBytes : maxBytes)
  ) {
    throw new FilePolicyError("size_exceeded");
  }
  if (bytes.byteLength !== input.declaredByteCount) {
    throw new FilePolicyError("size_mismatch");
  }
  const mediaType = detectMediaType(bytes);
  if (!mediaType) throw new FilePolicyError("unsupported_content");
  if (mediaType !== input.declaredMediaType) {
    throw new FilePolicyError("media_type_mismatch");
  }
  validatePurposeMediaType(input.purpose, mediaType);
  return {
    mediaType,
    byteCount: bytes.byteLength,
    sha256: awaitImportCrypto(bytes),
  };
}

function awaitImportCrypto(bytes: Buffer): string {
  // Kept synchronous so inspection completes before any storage call.
  return requireSha256(bytes);
}

import { createHash } from "node:crypto";

function requireSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validatePurposeMediaType(
  purpose: CreateFileUploadGrantRequest["purpose"],
  mediaType: FileMediaType,
): void {
  const photo =
    purpose === "nameplate" ||
    purpose === "arrival_condition" ||
    purpose === "intake_evidence" ||
    purpose === "preliminary_inspection" ||
    purpose === "production_test_evidence";
  const image = mediaType.startsWith("image/");
  if (purpose === "production_test_video") {
    if (!mediaType.startsWith("video/"))
      throw new FilePolicyError("purpose_mismatch");
    return;
  }
  if ((photo && !image) || (!photo && mediaType !== "application/pdf")) {
    throw new FilePolicyError("purpose_mismatch");
  }
}

export const INTAKE_MAX_PIXELS = 40_000_000;
export const INTAKE_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

export async function inspectStoredIntakePreview(bytes: Buffer): Promise<{
  width: number;
  height: number;
}> {
  if (bytes.byteLength <= 0 || bytes.byteLength > INTAKE_PREVIEW_MAX_BYTES)
    throw new FilePolicyError("size_exceeded");
  if (detectMediaType(bytes) !== "image/jpeg")
    throw new FilePolicyError("media_type_mismatch");
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: 4_000_000,
      failOn: "error",
    }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 2_000 ||
      metadata.height > 2_000
    )
      throw new FilePolicyError("dimensions_exceeded");
    return { width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof FilePolicyError) throw error;
    throw new FilePolicyError("preview_failed");
  }
}

export async function createIntakeAnalysisImage(
  bytes: Buffer,
  mediaType: FileMediaType | null,
  limits: {
    maxImageBytes: number;
    maxBatchBytes: number;
    maxPixels: number;
    /** Benchmark-only common derivative mode; production keeps hard rejection. */
    allowDownscaleToPixelLimit?: boolean;
  },
): Promise<{ bytes: Buffer; width: number; height: number }> {
  if (!mediaType || !mediaType.startsWith("image/")) {
    throw new FilePolicyError("unsupported_content");
  }
  try {
    const sourceMaxPixels = limits.allowDownscaleToPixelLimit
      ? Math.max(limits.maxPixels, INTAKE_MAX_PIXELS)
      : limits.maxPixels;
    const image =
      mediaType === "image/heic" || mediaType === "image/heif"
        ? await heicPixels(bytes, sourceMaxPixels)
        : sharp(bytes, { limitInputPixels: sourceMaxPixels, failOn: "error" });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      (!limits.allowDownscaleToPixelLimit &&
        metadata.width * metadata.height > limits.maxPixels)
    ) {
      throw new FilePolicyError("dimensions_exceeded");
    }
    const sourcePixels = (metadata.width ?? 0) * (metadata.height ?? 0);
    const scale =
      limits.allowDownscaleToPixelLimit && sourcePixels > limits.maxPixels
        ? Math.sqrt(limits.maxPixels / sourcePixels)
        : 1;
    const converted = await image
      .rotate()
      .resize({
        width: Math.max(1, Math.min(4_000, Math.floor(metadata.width * scale))),
        height: Math.max(
          1,
          Math.min(4_000, Math.floor(metadata.height * scale)),
        ),
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88, progressive: true, chromaSubsampling: "4:2:0" })
      .toBuffer({ resolveWithObject: true });
    if (converted.data.byteLength > limits.maxImageBytes)
      throw new FilePolicyError("size_exceeded");
    return {
      bytes: converted.data,
      width: converted.info.width,
      height: converted.info.height,
    };
  } catch (error) {
    if (error instanceof FilePolicyError) throw error;
    throw new FilePolicyError("preview_failed");
  }
}

export async function createIntakePreview(
  bytes: Buffer,
  mediaType: FileMediaType,
): Promise<{ bytes: Buffer; byteCount: number; sha256: string }> {
  if (!mediaType.startsWith("image/")) {
    throw new FilePolicyError("purpose_mismatch");
  }
  try {
    const image =
      mediaType === "image/heic" || mediaType === "image/heif"
        ? await heicPixels(bytes, INTAKE_MAX_PIXELS)
        : sharp(bytes, {
            limitInputPixels: INTAKE_MAX_PIXELS,
            failOn: "error",
          });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > INTAKE_MAX_PIXELS
    ) {
      throw new FilePolicyError("dimensions_exceeded");
    }
    const preview = await image
      .rotate()
      .resize({
        width: 2_000,
        height: 2_000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, progressive: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
    if (preview.byteLength > INTAKE_PREVIEW_MAX_BYTES) {
      throw new FilePolicyError("preview_failed");
    }
    return {
      bytes: preview,
      byteCount: preview.byteLength,
      sha256: createHash("sha256").update(preview).digest("hex"),
    };
  } catch (error) {
    if (error instanceof FilePolicyError) throw error;
    throw new FilePolicyError("preview_failed");
  }
}

async function heicPixels(
  bytes: Buffer,
  maxPixels: number,
): Promise<ReturnType<typeof sharp>> {
  const images = await decodeHeic.all({ buffer: bytes });
  try {
    const image = images[0];
    if (!image) throw new FilePolicyError("preview_failed");
    const pixelCount = image.width * image.height;
    if (
      image.width <= 0 ||
      image.height <= 0 ||
      !Number.isSafeInteger(pixelCount) ||
      pixelCount > maxPixels ||
      pixelCount * 4 > maxPixels * 4
    ) {
      throw new FilePolicyError("dimensions_exceeded");
    }
    const decoded = await image.decode();
    if (
      decoded.width !== image.width ||
      decoded.height !== image.height ||
      decoded.data.byteLength > maxPixels * 4
    ) {
      throw new FilePolicyError("dimensions_exceeded");
    }
    return sharp(Buffer.from(decoded.data), {
      raw: { width: image.width, height: image.height, channels: 4 },
      limitInputPixels: maxPixels,
    });
  } finally {
    images.dispose();
  }
}

export function detectMediaType(bytes: Buffer): FileMediaType | undefined {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brands = bytes
      .subarray(8, Math.min(bytes.length, 64))
      .toString("ascii");
    if (/(heic|heif|heix|hevc|hevx|mif1|msf1)/.test(brands)) {
      return /heif/.test(brands) ? "image/heif" : "image/heic";
    }
    const major = bytes.subarray(8, 12).toString("ascii");
    if (major === "qt  ") return "video/quicktime";
    if (
      ["isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "3gp4"].includes(major)
    )
      return "video/mp4";
  }
  if (
    bytes.length >= 16 &&
    bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  ) {
    const header = bytes.subarray(0, Math.min(bytes.length, 4_096));
    if (
      header.includes(Buffer.from([0x42, 0x82])) &&
      header.includes(Buffer.from("webm"))
    )
      return "video/webm";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  return undefined;
}

export function safeDownloadFilename(filename: string): string {
  const safe = [...filename]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || '"\\/'.includes(character)
        ? "_"
        : character;
    })
    .join("")
    .trim();
  return safe || "download";
}
