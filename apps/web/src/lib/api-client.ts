import { parseWebServerEnvironment } from "@simply-clean/config";
import {
  LivenessResponseSchema,
  ReadinessResponseSchema,
  type LivenessResponse,
  type ReadinessResponse,
} from "@simply-clean/contracts";

export interface PlatformHealth {
  live: LivenessResponse;
  ready: ReadinessResponse;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(`API request failed with status ${status}`);
    this.name = "ApiRequestError";
  }
}

async function responseDetail(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return undefined;
  }
}

async function getJson(
  url: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetcher(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...init.headers },
  });
  if (!response.ok) {
    throw new ApiRequestError(response.status, await responseDetail(response));
  }
  return response.json();
}

/** Read a protected API resource from a server-rendered web route. */
export async function getServerJson(
  path: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<unknown> {
  const { apiBaseUrl } = parseWebServerEnvironment(environment);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return getJson(
    `${apiBaseUrl.replace(/\/$/, "")}${normalizedPath}`,
    fetcher,
    cookie ? { headers: { cookie } } : {},
  );
}

/** Idempotent JSON mutation for protected browser views. */
export async function postBrowserJson(
  path: string,
  body: unknown,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return getJson(`/api${normalizedPath}`, fetcher, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

export async function getPlatformHealth(
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
): Promise<PlatformHealth> {
  const { apiBaseUrl } = parseWebServerEnvironment(environment);
  const [live, ready] = await Promise.all([
    getJson(`${apiBaseUrl}/health/live`, fetcher),
    getJson(`${apiBaseUrl}/health/ready`, fetcher),
  ]);
  return {
    live: LivenessResponseSchema.parse(live),
    ready: ReadinessResponseSchema.parse(ready),
  };
}
