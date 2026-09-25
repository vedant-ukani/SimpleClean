import type { IntakeOcrResult } from "@laundrorama/contracts";

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

const DEFAULT_GOOGLE_VISION_ENDPOINT =
  "https://vision.googleapis.com/v1/images:annotate";
const DEFAULT_GOOGLE_VISION_MODEL = "document-text-detection";

export interface GoogleVisionRequestInput {
  requests: Array<{
    image: { content: string };
    features: Array<{ type: "DOCUMENT_TEXT_DETECTION" }>;
  }>;
  signal: AbortSignal;
}

export interface GoogleVisionVerifierOptions extends BoundedProviderOptions {
  endpoint?: string;
  apiKey?: string;
  /** Google accepts x-goog-api-key as a request header. */
  apiKeyHeader?: string;
  model?: string;
  /** Optional SDK seam. It receives only bounded, metadata-free JPEGs. */
  request?: (input: GoogleVisionRequestInput) => Promise<unknown>;
}

type Box = { x: number; y: number; width: number; height: number };
type Point = { x?: unknown; y?: unknown };

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boxFromPolygon(
  value: unknown,
  image: IntakeAnalysisImage,
  sourceWidth = image.width,
  sourceHeight = image.height,
): Box | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const vertices = (value as Record<string, unknown>).vertices;
  if (!Array.isArray(vertices) || vertices.length < 2) return null;
  const points = vertices
    .map((point) => {
      if (!point || typeof point !== "object" || Array.isArray(point))
        return null;
      const item = point as Point;
      const x = number(item.x) ?? 0;
      const y = number(item.y) ?? 0;
      return { x, y };
    })
    .filter((point): point is { x: number; y: number } => point !== null);
  if (points.length < 2 || sourceWidth <= 0 || sourceHeight <= 0) return null;
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  const x = left / sourceWidth;
  const y = top / sourceHeight;
  const width = (right - left) / sourceWidth;
  const height = (bottom - top) / sourceHeight;
  if (
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 ||
    y + height > 1
  ) {
    return null;
  }
  return { x, y, width, height };
}

function wholeImage(): Box {
  return { x: 0, y: 0, width: 1, height: 1 };
}

function unionBoxes(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function symbolText(symbols: unknown): string {
  if (!Array.isArray(symbols)) return "";
  return symbols
    .map((symbol) =>
      symbol &&
      typeof symbol === "object" &&
      typeof (symbol as Record<string, unknown>).text === "string"
        ? (symbol as Record<string, unknown>).text
        : "",
    )
    .join("");
}

function symbolConfidence(symbols: unknown, fallback: unknown): number {
  if (!Array.isArray(symbols)) return number(fallback) ?? 0;
  const confidences = symbols
    .map((symbol) =>
      symbol && typeof symbol === "object"
        ? number((symbol as Record<string, unknown>).confidence)
        : null,
    )
    .filter((value): value is number => value !== null);
  return confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : (number(fallback) ?? 0);
}

function normalizeGoogleResponse(
  value: unknown,
  images: readonly IntakeAnalysisImage[],
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RecognitionProviderError(
      "invalid_response",
      "Google Vision returned an invalid result",
    );
  }
  const root = value as Record<string, unknown>;
  if (
    !Array.isArray(root.responses) ||
    root.responses.length !== images.length
  ) {
    throw new RecognitionProviderError(
      "invalid_response",
      "Google Vision returned an invalid response count",
    );
  }
  const lines: Array<Record<string, unknown>> = [];
  root.responses.forEach((response, index) => {
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      throw new RecognitionProviderError(
        "invalid_response",
        "Google Vision returned an invalid image result",
      );
    }
    const item = response as Record<string, unknown>;
    if (item.error !== undefined) {
      throw new RecognitionProviderError(
        "unavailable",
        "Google Vision returned an image error",
      );
    }
    const image = images[index];
    if (!image) return;
    const full =
      item.fullTextAnnotation &&
      typeof item.fullTextAnnotation === "object" &&
      !Array.isArray(item.fullTextAnnotation)
        ? (item.fullTextAnnotation as Record<string, unknown>)
        : undefined;
    const wordBoxes: Box[] = [];
    const wordConfidences: number[] = [];
    const pages = full?.pages;
    if (Array.isArray(pages)) {
      for (const page of pages) {
        if (!page || typeof page !== "object" || Array.isArray(page)) continue;
        const pageRecord = page as Record<string, unknown>;
        const width = number(pageRecord.width) ?? image.width;
        const height = number(pageRecord.height) ?? image.height;
        const blocks = pageRecord.blocks;
        if (!Array.isArray(blocks)) continue;
        for (const block of blocks) {
          if (!block || typeof block !== "object" || Array.isArray(block))
            continue;
          const paragraphs = (block as Record<string, unknown>).paragraphs;
          if (!Array.isArray(paragraphs)) continue;
          for (const paragraph of paragraphs) {
            if (
              !paragraph ||
              typeof paragraph !== "object" ||
              Array.isArray(paragraph)
            )
              continue;
            const words = (paragraph as Record<string, unknown>).words;
            if (!Array.isArray(words)) continue;
            for (const word of words) {
              if (!word || typeof word !== "object" || Array.isArray(word))
                continue;
              const wordRecord = word as Record<string, unknown>;
              const text = symbolText(wordRecord.symbols);
              const box = boxFromPolygon(
                wordRecord.boundingBox,
                image,
                width,
                height,
              );
              if (!text || !box) continue;
              const confidence = symbolConfidence(
                wordRecord.symbols,
                wordRecord.confidence,
              );
              lines.push({
                photoId: image.photoId,
                text,
                confidence,
                box,
              });
              wordBoxes.push(box);
              wordConfidences.push(confidence);
            }
          }
        }
      }
    }

    const fullText = typeof full?.text === "string" ? full.text.trim() : "";
    if (fullText) {
      lines.push({
        photoId: image.photoId,
        text: fullText.slice(0, 1000),
        confidence: wordConfidences.length
          ? wordConfidences.reduce((sum, value) => sum + value, 0) /
            wordConfidences.length
          : 0,
        box: unionBoxes(wordBoxes) ?? wholeImage(),
      });
    } else if (wordBoxes.length === 0 && Array.isArray(item.textAnnotations)) {
      // Legacy textAnnotations has no confidence; preserve its visible text
      // while marking the confidence conservatively.
      for (const annotation of item.textAnnotations.slice(0, 1000)) {
        if (
          !annotation ||
          typeof annotation !== "object" ||
          Array.isArray(annotation)
        )
          continue;
        const annotationRecord = annotation as Record<string, unknown>;
        const text =
          typeof annotationRecord.description === "string"
            ? annotationRecord.description.trim()
            : "";
        if (!text) continue;
        lines.push({
          photoId: image.photoId,
          text: text.slice(0, 1000),
          confidence: 0,
          box:
            boxFromPolygon(annotationRecord.boundingPoly, image) ??
            wholeImage(),
        });
      }
    }
  });
  return {
    lines: lines.map((line, index) => ({
      ...line,
      lineId: `${String(line.photoId)}:line-${index + 1}`,
    })),
  };
}

export class GoogleVisionOcrVerifier implements IntakeOcrVerifier {
  private readonly options: GoogleVisionVerifierOptions;
  private readonly limits: ReturnType<typeof validateProviderLimits>;
  private readonly model: string;

  constructor(options: GoogleVisionVerifierOptions = {}) {
    if (!options.request && options.endpoint === "") {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "Google Vision endpoint is invalid",
      );
    }
    if (
      options.apiKey !== undefined &&
      (options.apiKey.length === 0 || options.apiKey.length > 500)
    ) {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "Google Vision credentials are invalid",
      );
    }
    this.options = options;
    this.limits = validateProviderLimits(options);
    this.model = options.model ?? DEFAULT_GOOGLE_VISION_MODEL;
    if (!/^[\w.:-]{1,120}$/.test(this.model)) {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "Invalid Google Vision model",
      );
    }
  }

  async verify(
    images: readonly IntakeAnalysisImage[],
  ): Promise<IntakeOcrResult> {
    validateImages(images, this.limits);
    const requests = imageParts(images).map((image) => ({
      image: { content: image.imageBase64 },
      features: [{ type: "DOCUMENT_TEXT_DETECTION" as const }],
    }));
    try {
      let payload: unknown;
      if (this.options.request) {
        const controller = new AbortController();
        try {
          payload = await withProviderTimeout(
            this.options.request({ requests, signal: controller.signal }),
            this.limits.timeoutMs,
            () => controller.abort(),
          );
          if (
            Buffer.byteLength(JSON.stringify(payload), "utf8") >
            this.limits.maxResponseBytes
          ) {
            throw new RecognitionProviderError(
              "response_too_large",
              "Google Vision response too large",
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
          const name = this.options.apiKeyHeader ?? "x-goog-api-key";
          if (!/^[A-Za-z0-9-]+$/.test(name)) {
            throw new RecognitionProviderError(
              "invalid_configuration",
              "Invalid Google Vision credential header",
            );
          }
          headers[name] = this.options.apiKey;
        }
        const result = await postJson(
          this.options.endpoint ?? DEFAULT_GOOGLE_VISION_ENDPOINT,
          { requests },
          headers,
          this.options,
        );
        payload = parseJson(result.text);
      }
      return validateOcrResult(normalizeGoogleResponse(payload, images), {
        provider: "google-vision",
        model: this.model,
      });
    } catch (error) {
      if (error instanceof RecognitionProviderError) throw error;
      throw safeProviderError(error);
    }
  }
}

export const GoogleVisionOcrVerifierAdapter = GoogleVisionOcrVerifier;
