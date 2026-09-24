import type { IntakeSemanticResult } from "@simply-clean/contracts";

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
const SEMANTIC_PROMPT =
  "Read visible machine nameplate facts and group photos belonging to the same machine. Return only JSON. The top-level object must contain exactly groups and requestId: groups is an array, and requestId is a string or null. Each group must contain exactly key, photoIds, confidence, fields, and quality; key is a non-empty string, photoIds is an array of image UUIDs, confidence is a number from 0 to 1, fields is an array, and quality is an array. Each field must contain exactly field, value, confidence, photoId, and box; field must be one of machineType, manufacturer, model, serial, voltage, phase, fuel, or capacityLb; value is a string or null; confidence is a number from 0 to 1; photoId is an image UUID; box must contain exactly x, y, width, and height, all normalized numbers from 0 to 1 with positive width and height that stay within the image. Each quality item must contain exactly photoId and reason, where reason is one of blur, glare, cutoff, small_text, or unreadable. Use empty arrays when there are no fields or quality findings. Do not infer facts that are not visible. For capacityLb, require an explicit visible unit (lb, pounds, kg, or kilograms); do not derive it from a model number. Do not add extra keys or markdown; return only the JSON object. The image identifiers, in order, are: ";

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
  ): Promise<IntakeSemanticResult> {
    validateImages(images, this.limits);
    const endpoint =
      this.options.endpoint ??
      `${GEMINI_ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`;
    try {
      const parts = [
        ...imageParts(images).map((image) => ({
          inlineData: { mimeType: image.mediaType, data: image.imageBase64 },
        })),
        {
          text: `${SEMANTIC_PROMPT}${images.map((image) => image.photoId).join(", ")}. Use only these identifiers in photoIds and photoId fields.`,
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
        requestId: requestId && requestId.length <= 200 ? requestId : null,
      });
    } catch (error) {
      if (error instanceof RecognitionProviderError) throw error;
      throw safeProviderError(error);
    }
  }
}

export const GeminiSemanticAdapter = GeminiSemanticRecognizer;
