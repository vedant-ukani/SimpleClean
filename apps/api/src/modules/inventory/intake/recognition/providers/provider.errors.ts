/**
 * Errors intentionally contain no provider response body, URL, prompt, image
 * metadata, or credentials.  They are safe to persist as a short diagnostic
 * at the recognition-run boundary.
 */
export type RecognitionProviderErrorCode =
  | "invalid_configuration"
  | "input_too_large"
  | "timeout"
  | "unavailable"
  | "rate_limited"
  | "response_too_large"
  | "invalid_response";

export class RecognitionProviderError extends Error {
  readonly code: RecognitionProviderErrorCode;
  readonly status: number | undefined;

  constructor(
    code: RecognitionProviderErrorCode,
    message = "Recognition provider request failed",
    status?: number,
  ) {
    super(message);
    this.name = "RecognitionProviderError";
    this.code = code;
    this.status = status;
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function safeProviderError(error: unknown): RecognitionProviderError {
  if (error instanceof RecognitionProviderError) return error;
  if (isAbortError(error)) {
    return new RecognitionProviderError(
      "timeout",
      "Recognition provider timed out",
    );
  }
  return new RecognitionProviderError(
    "unavailable",
    "Recognition provider unavailable",
  );
}
