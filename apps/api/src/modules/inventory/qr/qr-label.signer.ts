import { Injectable } from "@nestjs/common";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const TOKEN_VERSION = "v1";
const SIGNATURE_BYTES = 32;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_PATTERN =
  /^v1\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
const FALLBACK_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const FALLBACK_PATTERN = /^[0-9A-HJKMNP-TV-Z]{16}$/;

export interface VerifiedQrToken {
  version: 1;
  labelId: string;
}

@Injectable()
export class QrLabelSigner {
  constructor(private readonly secret: string) {}

  createLabelId(): string {
    return randomUUID();
  }

  createFallbackCode(): string {
    const entropy = randomBytes(10);
    let bits = 0;
    let bitCount = 0;
    let raw = "";
    for (const byte of entropy) {
      bits = (bits << 8) | byte;
      bitCount += 8;
      while (bitCount >= 5) {
        bitCount -= 5;
        raw += FALLBACK_ALPHABET[(bits >>> bitCount) & 31];
        bits &= (1 << bitCount) - 1;
      }
    }
    return raw;
  }

  sign(labelId: string): string {
    if (!UUID_PATTERN.test(labelId)) throw new Error("Invalid QR Label ID");
    return `${TOKEN_VERSION}.${labelId}.${this.signature(labelId).toString("base64url")}`;
  }

  verify(token: string): VerifiedQrToken | null {
    const match = TOKEN_PATTERN.exec(token);
    if (!match) return null;
    const labelId = match[1]!;
    let provided: Buffer;
    try {
      provided = Buffer.from(match[2]!, "base64url");
    } catch {
      return null;
    }
    if (provided.length !== SIGNATURE_BYTES) return null;
    if (provided.toString("base64url") !== match[2]) return null;
    const expected = this.signature(labelId);
    if (!timingSafeEqual(provided, expected)) return null;
    return { version: 1, labelId };
  }

  normalizeFallbackCode(input: string): string | null {
    const normalized = input.trim().toUpperCase().replaceAll("-", "");
    return FALLBACK_PATTERN.test(normalized) ? normalized : null;
  }

  private signature(labelId: string): Buffer {
    return createHmac("sha256", this.secret)
      .update(`${TOKEN_VERSION}:${labelId}`, "utf8")
      .digest();
  }
}

export const QR_TOKEN_VERSION = TOKEN_VERSION;
