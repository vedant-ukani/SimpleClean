export {
  DeterministicFakeOcrVerifier,
  DeterministicFakeSemanticRecognizer,
  FakeOcrVerifier,
  FakeSemanticRecognizer,
} from "./fake.adapters.js";
export {
  GeminiSemanticAdapter,
  GeminiSemanticRecognizer,
} from "./gemini.semantic.adapter.js";
export {
  OpenAISemanticAdapter,
  OpenAISemanticRecognizer,
} from "./openai.semantic.adapter.js";
export {
  PaddleOcrVerifier,
  PaddleOcrVerifierAdapter,
} from "./paddleocr.verifier.adapter.js";
export {
  GoogleVisionOcrVerifier,
  GoogleVisionOcrVerifierAdapter,
} from "./google-vision.verifier.adapter.js";
export {
  RecognitionProviderError,
  safeProviderError,
  type RecognitionProviderErrorCode,
} from "./provider.errors.js";
export {
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_MAX_IMAGE_PIXELS,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_MAX_TOTAL_IMAGE_BYTES,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  MAX_IMAGES,
  type BoundedProviderOptions,
  type FetchLike,
  type ProviderInputLimits,
} from "./provider.http.js";
export {
  GEMINI_SEMANTIC_SCHEMA,
  SEMANTIC_JSON_SCHEMA,
} from "./semantic-schema.js";
