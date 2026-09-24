import {
  type IntakeOcrResult,
  type IntakeSemanticResult,
} from "@simply-clean/contracts";

import type {
  IntakeAnalysisImage,
  IntakeOcrVerifier,
  IntakeSemanticRecognizer,
} from "../../recognition.ports.js";
import {
  validateImages,
  validateProviderLimits,
  type ProviderInputLimits,
} from "./provider.http.js";
import {
  validateOcrResult,
  validateSemanticResult,
} from "./provider.validation.js";

export interface DeterministicFakeSemanticOptions extends ProviderInputLimits {
  /** A fixed result or a pure function of the ordered photo IDs. */
  result?:
    | IntakeSemanticResult
    | ((
        images: readonly IntakeAnalysisImage[],
        ocr?: IntakeOcrResult,
      ) => IntakeSemanticResult);
  provider?: string;
  model?: string;
}

export interface DeterministicFakeOcrOptions extends ProviderInputLimits {
  result?:
    | IntakeOcrResult
    | ((images: readonly IntakeAnalysisImage[]) => IntakeOcrResult);
  provider?: string;
  model?: string;
}

/**
 * A predictable adapter for tests and local development. The default output
 * deliberately contains no facts: callers can provide a fixture result when
 * exercising acceptance and recapture paths.
 */
export class DeterministicFakeSemanticRecognizer implements IntakeSemanticRecognizer {
  private readonly limits: Required<ProviderInputLimits>;
  private readonly options: DeterministicFakeSemanticOptions;

  constructor(options: DeterministicFakeSemanticOptions = {}) {
    this.options = options;
    this.limits = validateProviderLimits(options);
  }

  async recognize(
    images: readonly IntakeAnalysisImage[],
    ocr?: IntakeOcrResult,
  ): Promise<IntakeSemanticResult> {
    validateImages(images, this.limits);
    const result =
      typeof this.options.result === "function"
        ? this.options.result(images, ocr)
        : this.options.result;
    if (result) {
      // Validate fixture results too; tests should exercise the same boundary as production.
      return validateSemanticResult(result, {
        provider: this.options.provider ?? "fake",
        model: this.options.model ?? "deterministic-v1",
        requestId: result.requestId,
      });
    }
    const generated: IntakeSemanticResult = {
      provider: this.options.provider ?? "fake",
      model: this.options.model ?? "deterministic-v1",
      schemaVersion: "intake-nameplate-v2",
      requestId: null,
      groups: images.map((image, index) => ({
        key: `photo-${index + 1}`,
        photoIds: [image.photoId],
        confidence: 1,
        fields: [],
        quality: [],
      })),
    };
    return validateSemanticResult(generated, {
      ...generated,
      schemaVersion: "intake-nameplate-v2",
    });
  }
}

/** Deterministic OCR substitute; default output is an empty independent read. */
export class DeterministicFakeOcrVerifier implements IntakeOcrVerifier {
  private readonly limits: Required<ProviderInputLimits>;
  private readonly options: DeterministicFakeOcrOptions;

  constructor(options: DeterministicFakeOcrOptions = {}) {
    this.options = options;
    this.limits = validateProviderLimits(options);
  }

  async verify(
    images: readonly IntakeAnalysisImage[],
  ): Promise<IntakeOcrResult> {
    validateImages(images, this.limits);
    const result =
      typeof this.options.result === "function"
        ? this.options.result(images)
        : this.options.result;
    if (result) {
      return validateOcrResult(result, {
        provider: this.options.provider ?? "fake",
        model: this.options.model ?? "deterministic-v1",
      });
    }
    return {
      provider: this.options.provider ?? "fake",
      model: this.options.model ?? "deterministic-v1",
      lines: [],
    };
  }
}

// Short aliases keep composition roots and tests readable while retaining the
// explicit deterministic names in stack traces and documentation.
export const FakeSemanticRecognizer = DeterministicFakeSemanticRecognizer;
export const FakeOcrVerifier = DeterministicFakeOcrVerifier;
