import { parseWebServerEnvironment } from "@laundrorama/config";
import {
  LivenessResponseSchema,
  ReadinessResponseSchema,
  type LivenessResponse,
  type ReadinessResponse,
} from "@laundrorama/contracts";

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

/** Read a protected API resource from an interactive browser view. */
export async function getBrowserJson(
  path: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return getJson(`/api${normalizedPath}`, fetcher);
}

/** Idempotent JSON mutation for protected browser views. */
export async function postBrowserJson(
  path: string,
  body: unknown,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  };
  try {
    return await getJson(`/api${normalizedPath}`, fetcher, init);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return getJson(`/api${normalizedPath}`, fetcher, init);
  }
}

/** Idempotent PUT for owner-managed protected settings. */
export async function putBrowserJson(
  path: string,
  body: unknown,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const init: RequestInit = {
    method: "PUT",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  };
  try { return await getJson(`/api${normalizedPath}`, fetcher, init); }
  catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return getJson(`/api${normalizedPath}`, fetcher, init);
  }
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
