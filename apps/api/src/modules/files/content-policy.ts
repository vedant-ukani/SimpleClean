import type {
  CreateFileUploadGrantRequest,
  FileMediaType,
} from "@simply-clean/contracts";

export type FilePolicyFailureCode =
  | "size_exceeded"
  | "size_mismatch"
  | "unsupported_content"
  | "media_type_mismatch"
  | "purpose_mismatch"
  | "storage_failed";

export class FilePolicyError extends Error {
  constructor(readonly code: FilePolicyFailureCode) {
    super("File content did not satisfy policy");
    this.name = "FilePolicyError";
  }
}

export function validateUploadGrantRequest(
  input: CreateFileUploadGrantRequest,
  maxBytes: number,
): void {
  if (input.declaredByteCount > maxBytes) {
    throw new FilePolicyError("size_exceeded");
  }
  if (input.purpose === "nameplate" && input.target.type !== "machine") {
    throw new FilePolicyError("purpose_mismatch");
  }
  validatePurposeMediaType(input.purpose, input.declaredMediaType);
}

export function inspectContent(
  input: CreateFileUploadGrantRequest,
  bytes: Buffer,
  maxBytes: number,
): { mediaType: FileMediaType; byteCount: number; sha256: string } {
  if (bytes.byteLength > maxBytes) {
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
  const photo = purpose === "nameplate" || purpose === "arrival_condition";
  const image = mediaType.startsWith("image/");
  if ((photo && !image) || (!photo && mediaType !== "application/pdf")) {
    throw new FilePolicyError("purpose_mismatch");
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
