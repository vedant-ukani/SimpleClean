import { parseWebServerEnvironment } from "@simply-clean/config";
import {
  AuditListResponseSchema,
  JobListResponseSchema,
  OutboxJobResponseSchema,
  type AuditListQuery,
  type AuditListResponse,
  type JobListQuery,
  type JobListResponse,
  type OutboxJob,
} from "@simply-clean/contracts";

async function requestJson(
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
    throw new Error(`Operations request failed with status ${response.status}`);
  }
  return response.json();
}

function serverUrl(
  path: string,
  environment: Record<string, string | undefined>,
): string {
  return `${parseWebServerEnvironment(environment).apiBaseUrl}${path}`;
}

function queryString(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params.toString()}` : "";
}

export async function getAuditHistory(
  query: Partial<AuditListQuery> = {},
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<AuditListResponse> {
  return AuditListResponseSchema.parse(
    await requestJson(
      serverUrl(`/operations/audit${queryString(query)}`, environment),
      fetcher,
      cookie ? { headers: { cookie } } : {},
    ),
  );
}

export async function getOperationsJobs(
  query: Partial<JobListQuery> = {},
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<JobListResponse> {
  return JobListResponseSchema.parse(
    await requestJson(
      serverUrl(`/operations/jobs${queryString(query)}`, environment),
      fetcher,
      cookie ? { headers: { cookie } } : {},
    ),
  );
}

export async function retryOperationsJob(
  jobId: string,
  expectedVersion: number,
): Promise<OutboxJob> {
  return OutboxJobResponseSchema.parse(
    await requestJson(`/api/operations/jobs/${jobId}/retry`, fetch, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion }),
    }),
  ).job;
}
