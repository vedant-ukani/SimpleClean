import type {
  IntakeSemanticResult,
  IntakeOcrResult,
  IntakeGroupDecision,
} from "@simply-clean/contracts";

export interface IntakeAnalysisImage {
  photoId: string;
  sourceChecksum: string;
  bytes: Buffer;
  mediaType: "image/jpeg";
  width: number;
  height: number;
}
export interface IntakeSemanticRecognizer {
  recognize(
    images: readonly IntakeAnalysisImage[],
    ocr?: IntakeOcrResult,
  ): Promise<IntakeSemanticResult>;
}
export interface IntakeOcrVerifier {
  verify(images: readonly IntakeAnalysisImage[]): Promise<IntakeOcrResult>;
}
export interface IntakeConfidencePolicyConfig {
  version: string;
  groupFloor?: number;
  fieldFloor?: number;
  ocrFloor?: number;
}
export interface IntakeConfidencePolicy {
  evaluate(input: {
    images: readonly IntakeAnalysisImage[];
    semantic: IntakeSemanticResult;
    ocr: IntakeOcrResult;
    config: IntakeConfidencePolicyConfig;
  }): IntakeGroupDecision[];
}
export const INTAKE_SEMANTIC_RECOGNIZER = Symbol("INTAKE_SEMANTIC_RECOGNIZER");
export const INTAKE_OCR_VERIFIER = Symbol("INTAKE_OCR_VERIFIER");
export const INTAKE_CONFIDENCE_POLICY = Symbol("INTAKE_CONFIDENCE_POLICY");
export const INTAKE_RECOGNITION_HANDLER = Symbol("INTAKE_RECOGNITION_HANDLER");
