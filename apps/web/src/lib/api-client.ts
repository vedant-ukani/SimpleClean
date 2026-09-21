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

async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }
  return response.json();
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
