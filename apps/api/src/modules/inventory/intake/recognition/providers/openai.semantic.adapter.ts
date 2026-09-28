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
import { SEMANTIC_JSON_SCHEMA } from "./semantic-schema.js";

export interface OpenAISemanticRecognizerOptions extends BoundedProviderOptions {
  apiKey: string;
  endpoint?: string;
  model?: string;
}

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const SEMANTIC_PROMPT =
  "Map each single machine nameplate to manufacturer, model, serial, equipmentClass, voltage, phase, fuel, and capacityLb using the attached image for layout, adjacency, and visible label semantics together with the supplied Google Cloud Vision OCR evidence. You may use image layout to assign an OCR-backed row even when a printed field label is cropped or missed by OCR. Copy visible identity and utility values exactly from the supplied same-photo OCR text; the image cannot repair or invent characters, and you must never correct, complete, reinterpret, or reconstruct characters or use outside knowledge. Each photo is one machine and must produce at most one group; never group photos together. Unsupported fields must be null with empty evidence. For equipmentClass, return only washer, dryer, stack_dryer, stacked_washer_dryer, washer_dryer_combo, or other. Propose a class only when the same-photo OCR explicitly names that physical configuration and the image layout supports its meaning; cite the OCR line showing those words. A model number, manufacturer, capacity, or unseen whole-machine appearance alone cannot establish the class. A stack dryer has two dryers; a stacked washer/dryer has a washer and dryer; a washer/dryer combo is one combined unit. If these are not distinguished by the evidence, return null. Only use single_phase or three_phase for phase when unambiguous in OCR; values such as 1 OR 3 must be null. Only use gas, electric, steam, or other for fuel when an explicit fuel or heat-source declaration appears in OCR or is visibly associated with the OCR value in the image, such as FUEL, GAS TYPE, HEAT SOURCE, or EQUIPPED FOR. Capacity labels, electrical labels, and steam-pressure labels such as MAX STEAM PSI do not establish fuel; leave fuel null unless a fuel or heat-source declaration supports it. For capacityLb, return the visible OCR-backed capacity including its unit (lb, pounds, kg, or kilograms); a bare number or model-derived capacity must be null. Every non-null field must reference one or more supplied OCR line identifiers from the same photo, and same-photo OCR must support every copied character or equipment-class phrase. Use normalized boxes from 0 to 1. Return only the requested JSON object.";

function boundedOcrEvidence(ocr: IntakeOcrResult | undefined): Array<{
  lineId: string;
  photoId: string;
  text: string;
  confidence: number;
  box: IntakeOcrResult["lines"][number]["box"];
}> {
  return (ocr?.lines ?? []).slice(0, 300).map((line, index) => ({
    lineId: line.lineId ?? `${line.photoId}:line-${index + 1}`,
    photoId: line.photoId,
    text: line.text.slice(0, 240),
    confidence: line.confidence,
    box: line.box,
  }));
}
function responsePayload(root: unknown): unknown {
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new RecognitionProviderError(
      "invalid_response",
      "Recognition provider returned an invalid result",
    );
  }
  const value = root as Record<string, unknown>;
  if (value.groups !== undefined) return value;
  if (typeof value.output_text === "string")
    return parseJson(value.output_text);
  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string") return parseJson(text);
      }
    }
  }
  if (value.response && typeof value.response === "object")
    return responsePayload(value.response);
  throw new RecognitionProviderError(
    "invalid_response",
    "Recognition provider returned no semantic result",
  );
}

export class OpenAISemanticRecognizer implements IntakeSemanticRecognizer {
  private readonly options: OpenAISemanticRecognizerOptions;
  private readonly limits: ReturnType<typeof validateProviderLimits>;
  private readonly model: string;

  constructor(options: OpenAISemanticRecognizerOptions) {
    if (!options.apiKey || options.apiKey.length > 500) {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "OpenAI recognition credentials are not configured",
      );
    }
    this.options = options;
    this.limits = validateProviderLimits(options);
    this.model = options.model ?? "gpt-6-luna";
    if (!/^[\w.:-]{1,120}$/.test(this.model)) {
      throw new RecognitionProviderError(
        "invalid_configuration",
        "Invalid OpenAI model",
      );
    }
  }

  async recognize(
    images: readonly IntakeAnalysisImage[],
    ocr?: IntakeOcrResult,
  ): Promise<IntakeSemanticResult> {
    validateImages(images, this.limits);
    if (!ocr) {
      throw new RecognitionProviderError(
        "invalid_response",
        "Google OCR evidence is required for semantic assignment",
      );
    }
    if (ocr.lines.length === 0) {
      return validateSemanticResult(
        { groups: [] },
        {
          provider: "openai",
          model: this.model,
          schemaVersion: "intake-nameplate-v3",
          requestId: null,
        },
      );
    }
    const evidence = boundedOcrEvidence(ocr);
    const boundedImages = imageParts(images);
    try {
      const result = await postJson(
        this.options.endpoint ?? OPENAI_ENDPOINT,
        {
          model: this.model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `${SEMANTIC_PROMPT} The photo identifiers, in order, are: ${boundedImages.map((image) => image.photoId).join(", ")}. Use only these identifiers in photoIds and photoId fields. Each following photo is paired with only its bounded same-photo Google OCR evidence.`,
                },
                ...boundedImages.flatMap((image) => [
                  {
                    type: "input_text" as const,
                    text: `Photo identifier: ${image.photoId}. Bounded same-photo Google OCR evidence is JSON: ${JSON.stringify(evidence.filter((line) => line.photoId === image.photoId))}`,
                  },
                  {
                    type: "input_image" as const,
                    image_url: `data:${image.mediaType};base64,${image.imageBase64}`,
                    detail: "auto" as const,
                  },
                ]),
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "intake_semantic_result",
              strict: true,
              schema: SEMANTIC_JSON_SCHEMA,
            },
          },
        },
        { authorization: `Bearer ${this.options.apiKey}` },
        this.options,
      );
      const root = parseJson(result.text);
      const payload = responsePayload(root);
      const requestId = result.response.headers.get("x-request-id");
      return validateSemanticResult(payload, {
        provider: "openai",
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

export const OpenAISemanticAdapter = OpenAISemanticRecognizer;
