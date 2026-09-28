import type {
  IntakeOcrResult,
  IntakeSemanticResult,
} from "@laundrorama/contracts";

import type {
  IntakeAnalysisImage,
  IntakeSemanticRecognizer,
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
  type BoundedProviderOptions,
} from "./provider.http.js";
import { validateSemanticResult } from "./provider.validation.js";

export interface GeminiSemanticRecognizerOptions extends BoundedProviderOptions {
  apiKey: string;
  endpoint?: string;
  model?: string;
}

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";
const SEMANTIC_PROMPT = [
  "Read visible machine nameplate facts and group photos belonging to the same machine. Return only JSON.",
  "The top-level object must contain exactly groups and requestId: groups is an array, and requestId is a string or null.",
  "Each group must contain exactly key, photoIds, confidence, fields, and quality; key is a non-empty string, photoIds is an array of image UUIDs, confidence is a number from 0 to 1, fields is an array, and quality is an array.",
  "Each field must contain exactly field, value, confidence, photoId, box, and ocrLineIds; field must be one of equipmentClass, manufacturer, model, serial, voltage, phase, fuel, or capacityLb; value is a string or null; confidence is a number from 0 to 1; photoId is an image UUID; ocrLineIds is an array of supplied same-photo OCR line identifiers, empty for null values; box must contain exactly x, y, width, and height, all normalized numbers from 0 to 1 with positive width and height that stay within the image.",
  "For equipmentClass, return only washer, dryer, stack_dryer, stacked_washer_dryer, washer_dryer_combo, or other. This is advisory, never a final human-confirmed choice. Propose equipmentClass only when the same-photo OCR explicitly names that physical configuration and the image layout supports its meaning; cite the OCR line showing those words. A model number, manufacturer, capacity, or unseen whole-machine appearance alone cannot establish the class. A stack dryer has two dryers; a stacked washer/dryer has a washer and dryer; a washer/dryer combo is one combined unit. If no same-photo OCR is supplied, or these configurations cannot be distinguished, return null.",
  "Each quality item must contain exactly photoId and reason, where reason is one of blur, glare, cutoff, small_text, or unreadable. Use empty arrays when there are no fields or quality findings. Do not infer facts that are not visible. Every non-null field must cite supplied same-photo OCR evidence; copy identity and utility values exactly from that evidence.",
  "For capacityLb, require an explicit visible unit (lb, pounds, kg, or kilograms); do not derive it from a model number. Do not add extra keys or markdown; return only the JSON object. The image identifiers, in order, are: ",
].join(" ");

function responsePayload(root: unknown): unknown {
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new RecognitionProviderError(
      "invalid_response",
      "Recognition provider returned an invalid result",
    );
  }
  const value = root as Record<string, unknown>;
  if (value.groups !== undefined) return value;
  if (value.response && typeof value.response === "object")
    return responsePayload(value.response);
  const candidates = value.candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const content = (candidate as Record<string, unknown>).content;
      if (!content || typeof content !== "object") continue;
      const parts = (content as Record<string, unknown>).parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (!part || typeof part !== "object") continue;
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string") return parseJson(text);
      }
    }
  }
  throw new RecognitionProviderError(
    "invalid_response",
    "Recognition provider returned no semantic result",
  );
}

export class GeminiSemanticRecognizer implements IntakeSemanticRecognizer {
  private readonly options: GeminiSemanticRecognizerOptions;
  private readonly limits: ReturnType<typeof validateProviderLimits>;
  private readonly model: string;

  constructor(options: GeminiSemanticRecognizerOptions) {
    if (!options.apiKey || options.apiKey.length > 500) {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "Gemini recognition credentials are not configured",
      );
    }
    this.options = options;
    this.limits = validateProviderLimits(options);
    this.model = options.model ?? "gemini-2.5-flash";
    if (!/^[\w.:-]{1,120}$/.test(this.model)) {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "Invalid Gemini model",
      );
    }
  }

  async recognize(
    images: readonly IntakeAnalysisImage[],
    ocr?: IntakeOcrResult,
  ): Promise<IntakeSemanticResult> {
    validateImages(images, this.limits);
    const endpoint =
      this.options.endpoint ??
      `${GEMINI_ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`;
    try {
      const imageIds = new Set(images.map((image) => image.photoId));
      const evidence = (ocr?.lines ?? [])
        .slice(0, 300)
        .map((line, index) => ({
          lineId: line.lineId ?? `${line.photoId}:line-${index + 1}`,
          photoId: line.photoId,
          text: line.text.slice(0, 240),
          confidence: line.confidence,
          box: line.box,
        }))
        .filter((line) => imageIds.has(line.photoId));
      const parts = [
        ...imageParts(images).map((image) => ({
          inlineData: { mimeType: image.mediaType, data: image.imageBase64 },
        })),
        {
          text: `${SEMANTIC_PROMPT}${images.map((image) => image.photoId).join(", ")}. Use only these identifiers in photoIds and photoId fields. Bounded same-photo OCR evidence is JSON: ${JSON.stringify(evidence)}.`,
        },
      ];
      const result = await postJson(
        endpoint,
        {
          contents: [{ role: "user", parts }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: "low" },
          },
        },
        { "x-goog-api-key": this.options.apiKey },
        this.options,
      );
      const payload = responsePayload(parseJson(result.text));
      const requestId = result.response.headers.get("x-request-id");
      return validateSemanticResult(payload, {
        provider: "gemini",
        model: this.model,
        schemaVersion: "intake-nameplate-v3",
        requestId: requestId && requestId.length <= 200 ? requestId : null,
      });
    } catch (error) {
      if (error instanceof RecognitionProviderError) throw error;
      throw safeProviderError(error);
    }
  }
}

export const GeminiSemanticAdapter = GeminiSemanticRecognizer;
