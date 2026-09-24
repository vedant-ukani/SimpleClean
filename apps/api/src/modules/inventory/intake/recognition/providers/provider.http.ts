import type { IntakeAnalysisImage } from "../../recognition.ports.js";

import {
  RecognitionProviderError,
  safeProviderError,
} from "./provider.errors.js";
import {
  boundedJsonPost,
  ProviderHttpError,
} from "../../../../../platform/provider-http.js";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
export const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
export const DEFAULT_MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGES = 100;

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface ProviderInputLimits {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxImageBytes?: number;
  maxTotalImageBytes?: number;
  maxImagePixels?: number;
}

export interface BoundedProviderOptions extends ProviderInputLimits {
  fetch?: FetchLike;
}

export function validateProviderLimits(
  options: ProviderInputLimits,
): Required<ProviderInputLimits> {
  const limits = {
    timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    maxImageBytes: options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
    maxTotalImageBytes:
      options.maxTotalImageBytes ?? DEFAULT_MAX_TOTAL_IMAGE_BYTES,
    maxImagePixels: options.maxImagePixels ?? DEFAULT_MAX_IMAGE_PIXELS,
  };
  if (
    !Number.isSafeInteger(limits.timeoutMs) ||
    limits.timeoutMs < 1 ||
    limits.timeoutMs > 120_000 ||
    !Number.isSafeInteger(limits.maxResponseBytes) ||
    limits.maxResponseBytes < 1 ||
    !Number.isSafeInteger(limits.maxImageBytes) ||
    limits.maxImageBytes < 1 ||
    !Number.isSafeInteger(limits.maxTotalImageBytes) ||
    limits.maxTotalImageBytes < 1 ||
    !Number.isSafeInteger(limits.maxImagePixels) ||
    limits.maxImagePixels < 1
  ) {
    throw new RecognitionProviderError(
      "invalid_configuration",
      "Invalid recognition provider limits",
    );
  }
  return limits;
}

export function validateImages(
  images: readonly IntakeAnalysisImage[],
  limits: Required<ProviderInputLimits>,
): void {
  if (images.length === 0) {
    throw new RecognitionProviderError(
      "input_too_large",
      "No intake images supplied",
    );
  }
  if (images.length > MAX_IMAGES) {
    throw new RecognitionProviderError(
      "input_too_large",
      "Too many intake images",
    );
  }
  let total = 0;
  const ids = new Set<string>();
  for (const image of images) {
    if (ids.has(image.photoId)) {
      throw new RecognitionProviderError(
        "input_too_large",
        "Duplicate intake image",
      );
    }
    ids.add(image.photoId);
    if (
      !Buffer.isBuffer(image.bytes) ||
      image.bytes.byteLength < 1 ||
      image.bytes.byteLength > limits.maxImageBytes ||
      image.mediaType !== "image/jpeg" ||
      !Number.isSafeInteger(image.width) ||
      image.width < 1 ||
      !Number.isSafeInteger(image.height) ||
      image.height < 1 ||
      image.width * image.height > limits.maxImagePixels ||
      typeof image.sourceChecksum !== "string" ||
      image.sourceChecksum.length < 1 ||
      image.sourceChecksum.length > 200
    ) {
      throw new RecognitionProviderError(
        "input_too_large",
        "Intake image exceeds provider limits",
      );
    }
    total += image.bytes.byteLength;
    if (total > limits.maxTotalImageBytes) {
      throw new RecognitionProviderError(
        "input_too_large",
        "Intake image set exceeds provider limits",
      );
    }
  }
}

export async function withProviderTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(
            new RecognitionProviderError(
              "timeout",
              "Recognition provider timed out",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new RecognitionProviderError(
        "response_too_large",
        "Recognition provider response too large",
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RecognitionProviderError(
          "response_too_large",
          "Recognition provider response too large",
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

export async function postJson(
  endpoint: string,
  body: unknown,
  headers: Record<string, string>,
  options: BoundedProviderOptions,
): Promise<{ response: Response; text: string }> {
  const limits = validateProviderLimits(options);
  try {
    return await boundedJsonPost(endpoint, body, headers, {
      timeoutMs: limits.timeoutMs,
      maxResponseBytes: limits.maxResponseBytes,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  } catch (error) {
    if (error instanceof ProviderHttpError)
      throw new RecognitionProviderError(
        error.code,
        error.code === "invalid_configuration"
          ? "Invalid recognition provider endpoint"
          : error.code === "timeout"
            ? "Recognition provider timed out"
            : error.code === "rate_limited"
              ? "Recognition provider rate limited"
              : error.code === "response_too_large"
                ? "Recognition provider response too large"
                : "Recognition provider returned an error",
        error.status,
      );
    throw safeProviderError(error);
  }
}

export function imageParts(images: readonly IntakeAnalysisImage[]): Array<{
  photoId: string;
  imageBase64: string;
  mediaType: "image/jpeg";
}> {
  return images.map((image) => ({
    photoId: image.photoId,
    imageBase64: image.bytes.toString("base64"),
    mediaType: image.mediaType,
  }));
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RecognitionProviderError(
      "invalid_response",
      "Recognition provider returned invalid JSON",
    );
  }
}

export function extractJsonValue(
  value: unknown,
  keys: readonly string[],
): unknown {
  if (typeof value === "string") return parseJson(value);
  if (!value || typeof value !== "object") {
    throw new RecognitionProviderError(
      "invalid_response",
      "Recognition provider returned an invalid result",
    );
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const nested = record[key];
    if (nested !== undefined && nested !== null) {
      if (typeof nested === "string") return parseJson(nested);
      return nested;
    }
  }
  return value;
}
