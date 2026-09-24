import type { IntakeOcrResult } from "@simply-clean/contracts";

import type {
  IntakeAnalysisImage,
  IntakeOcrVerifier,
} from "../../recognition.ports.js";
import {
  RecognitionProviderError,
  safeProviderError,
} from "./provider.errors.js";
import {
  imageParts,
  parseJson,
  postJson,
  validateImages,
  validateProviderLimits,
  withProviderTimeout,
  type BoundedProviderOptions,
} from "./provider.http.js";
import { validateOcrResult } from "./provider.validation.js";

export interface PaddleOcrRequestInput {
  images: ReturnType<typeof imageParts>;
  signal: AbortSignal;
}

export interface PaddleOcrVerifierOptions extends BoundedProviderOptions {
  endpoint?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  model?: string;
  /** Optional SDK seam. It receives bounded, metadata-free image parts only. */
  request?: (input: PaddleOcrRequestInput) => Promise<unknown>;
}

const DEFAULT_PADDLE_MODEL = "paddleocr-vl";

function normalizeBox(
  value: unknown,
  image: IntakeAnalysisImage,
): { x: number; y: number; width: number; height: number } | null {
  if (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    const [x1, y1, x2, y2] = value as [number, number, number, number];
    const x = x1 / image.width;
    const y = y1 / image.height;
    const width = (x2 - x1) / image.width;
    const height = (y2 - y1) / image.height;
    if (
      x >= 0 &&
      y >= 0 &&
      width > 0 &&
      height > 0 &&
      x + width <= 1 &&
      y + height <= 1
    ) {
      return { x, y, width, height };
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const box = value as Record<string, unknown>;
    if (
      ["x", "y", "width", "height"].every((key) => typeof box[key] === "number")
    ) {
      return {
        x: box.x as number,
        y: box.y as number,
        width: box.width as number,
        height: box.height as number,
      };
    }
  }
  return null;
}

function normalizePayload(
  value: unknown,
  images: readonly IntakeAnalysisImage[],
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RecognitionProviderError(
      "invalid_response",
      "OCR verifier returned an invalid result",
    );
  }
  const root = value as Record<string, unknown>;
  if (root.lines !== undefined) return root;
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    const data = root.data as Record<string, unknown>;
    if (data.lines !== undefined) return data;
  }
  const results = root.results;
  if (!Array.isArray(results)) {
    throw new RecognitionProviderError(
      "invalid_response",
      "OCR verifier returned no lines",
    );
  }
  const lines: Array<Record<string, unknown>> = [];
  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    const item = result as Record<string, unknown>;
    const photoId =
      typeof item.photoId === "string"
        ? item.photoId
        : typeof item.image_id === "string"
          ? item.image_id
          : null;
    const image =
      images.find((candidate) => candidate.photoId === photoId) ??
      (images.length === 1 ? images[0] : undefined);
    if (!image) continue;
    const entries = item.lines ?? item.ocr_result ?? item.ocrResult ?? [];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const line = entry as Record<string, unknown>;
      const text =
        typeof line.text === "string"
          ? line.text
          : typeof line.rec_text === "string"
            ? line.rec_text
            : null;
      const confidence =
        typeof line.confidence === "number"
          ? line.confidence
          : typeof line.rec_score === "number"
            ? line.rec_score
            : null;
      const box = normalizeBox(line.box ?? line.bbox ?? line.points, image);
      if (text !== null && confidence !== null && box) {
        lines.push({ photoId: image.photoId, text, confidence, box });
      }
    }
  }
  return {
    lines: lines.map((line, index) => ({
      ...line,
      lineId: `${String(line.photoId)}:line-${index + 1}`,
    })),
  };
}

export class PaddleOcrVerifier implements IntakeOcrVerifier {
  private readonly options: PaddleOcrVerifierOptions;
  private readonly limits: ReturnType<typeof validateProviderLimits>;
  private readonly model: string;

  constructor(options: PaddleOcrVerifierOptions) {
    if (!options.request && !options.endpoint) {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "PaddleOCR endpoint is not configured",
      );
    }
    if (
      options.apiKey !== undefined &&
      (options.apiKey.length === 0 || options.apiKey.length > 500)
    ) {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "PaddleOCR credentials are invalid",
      );
    }
    this.options = options;
    this.limits = validateProviderLimits(options);
    this.model = options.model ?? DEFAULT_PADDLE_MODEL;
    if (!/^[\w.:-]{1,120}$/.test(this.model)) {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "Invalid PaddleOCR model",
      );
    }
  }

  async verify(
    images: readonly IntakeAnalysisImage[],
  ): Promise<IntakeOcrResult> {
    validateImages(images, this.limits);
    const parts = imageParts(images);
    try {
      let payload: unknown;
      if (this.options.request) {
        const controller = new AbortController();
        try {
          payload = await withProviderTimeout(
            this.options.request({ images: parts, signal: controller.signal }),
            this.limits.timeoutMs,
            () => controller.abort(),
          );
          const size = Buffer.byteLength(JSON.stringify(payload), "utf8");
          if (size > this.limits.maxResponseBytes) {
            throw new RecognitionProviderError(
              "response_too_large",
              "OCR verifier response too large",
            );
          }
        } catch (error) {
          throw error instanceof RecognitionProviderError
            ? error
            : safeProviderError(error);
        }
      } else {
        const headers: Record<string, string> = {};
        if (this.options.apiKey) {
          const name = this.options.apiKeyHeader ?? "authorization";
          if (!/^[A-Za-z0-9-]+$/.test(name)) {
            throw new RecognitionProviderError(
              "invalid_configuration",
              "Invalid PaddleOCR credential header",
            );
          }
          headers[name] =
            name.toLowerCase() === "authorization"
              ? `Bearer ${this.options.apiKey}`
              : this.options.apiKey;
        }
        const result = await postJson(
          this.options.endpoint as string,
          { model: this.model, images: parts },
          headers,
          this.options,
        );
        payload = parseJson(result.text);
      }
      const normalized = normalizePayload(payload, images);
      return validateOcrResult(normalized, {
        provider: "paddleocr",
        model: this.model,
      });
    } catch (error) {
      if (error instanceof RecognitionProviderError) throw error;
      throw safeProviderError(error);
    }
  }
}

export const PaddleOcrVerifierAdapter = PaddleOcrVerifier;
