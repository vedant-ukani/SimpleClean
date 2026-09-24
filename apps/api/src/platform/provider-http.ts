export type ProviderHttpErrorCode =
  | "invalid_configuration"
  | "timeout"
  | "unavailable"
  | "rate_limited"
  | "response_too_large";

export class ProviderHttpError extends Error {
  constructor(
    readonly code: ProviderHttpErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export type ProviderFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function withBoundedProviderTimeout<T>(
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
            new ProviderHttpError("timeout", "Provider request timed out"),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!response.body) {
    const output = await response.text();
    if (Buffer.byteLength(output, "utf8") > maxBytes)
      throw new ProviderHttpError(
        "response_too_large",
        "Provider response too large",
      );
    return output;
  }
  const reader = response.body.getReader();
  const cancelOnAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", cancelOnAbort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ProviderHttpError(
          "response_too_large",
          "Provider response too large",
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    signal?.removeEventListener("abort", cancelOnAbort);
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

export async function boundedJsonPost(
  endpoint: string,
  body: unknown,
  headers: Record<string, string>,
  options: {
    timeoutMs: number;
    maxResponseBytes: number;
    fetch?: ProviderFetch;
  },
): Promise<{ response: Response; text: string }> {
  if (!/^https?:\/\//i.test(endpoint))
    throw new ProviderHttpError(
      "invalid_configuration",
      "Invalid provider endpoint",
    );
  const controller = new AbortController();
  try {
    return await withBoundedProviderTimeout(
      (async () => {
        const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.status === 429)
          throw new ProviderHttpError("rate_limited", "Provider rate limited");
        if (!response.ok)
          throw new ProviderHttpError(
            "unavailable",
            "Provider returned an error",
            response.status,
          );
        const text = await readBoundedResponseText(
          response,
          options.maxResponseBytes,
          controller.signal,
        );
        return { response, text };
      })(),
      options.timeoutMs,
      () => controller.abort(),
    );
  } catch (error) {
    if (error instanceof ProviderHttpError) throw error;
    if (isAbortError(error))
      throw new ProviderHttpError("timeout", "Provider request timed out");
    throw new ProviderHttpError("unavailable", "Provider unavailable");
  }
}
