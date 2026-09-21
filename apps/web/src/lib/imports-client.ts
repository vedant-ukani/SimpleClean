import { parseWebServerEnvironment } from "@simply-clean/config";
import {
  ImportCommitResponseSchema,
  ImportRowListResponseSchema,
  ImportRunListResponseSchema,
  ImportRunResponseSchema,
  type ImportCommitResponse,
  type ImportRow,
  type ImportRowListResponse,
  type ImportRun,
} from "@simply-clean/contracts";

export class ImportRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(`Import request failed with status ${status}`);
    this.name = "ImportRequestError";
  }
}

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
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = undefined;
    }
    throw new ImportRequestError(response.status, detail);
  }
  return response.json();
}

function serverUrl(
  path: string,
  environment: Record<string, string | undefined>,
): string {
  return `${parseWebServerEnvironment(environment).apiBaseUrl}${path}`;
}

function cookieHeaders(cookie?: string): RequestInit {
  return cookie ? { headers: { cookie } } : {};
}

export async function getImportRuns(
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<ImportRun[]> {
  return ImportRunListResponseSchema.parse(
    await requestJson(
      serverUrl("/imports", environment),
      fetcher,
      cookieHeaders(cookie),
    ),
  ).runs;
}

export async function getImportRun(
  runId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<ImportRun> {
  return ImportRunResponseSchema.parse(
    await requestJson(
      serverUrl(`/imports/${runId}`, environment),
      fetcher,
      cookieHeaders(cookie),
    ),
  ).run;
}

export async function getImportRows(
  runId: string,
  query: {
    classification?: ImportRow["classification"];
    page?: number;
    pageSize?: number;
  } = {},
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<ImportRowListResponse> {
  const params = new URLSearchParams();
  if (query.classification) {
    params.set("classification", query.classification);
  }
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const suffix = params.size ? `?${params.toString()}` : "";
  return ImportRowListResponseSchema.parse(
    await requestJson(
      serverUrl(`/imports/${runId}/rows${suffix}`, environment),
      fetcher,
      cookieHeaders(cookie),
    ),
  );
}

export async function getBrowserImportRows(
  runId: string,
  query: {
    classification?: ImportRow["classification"];
    page?: number;
    pageSize?: number;
  } = {},
): Promise<ImportRowListResponse> {
  const params = new URLSearchParams();
  if (query.classification) {
    params.set("classification", query.classification);
  }
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const suffix = params.size ? `?${params.toString()}` : "";
  return ImportRowListResponseSchema.parse(
    await requestJson(`/api/imports/${runId}/rows${suffix}`, fetch),
  );
}

async function retryBrowserCreate(
  path: string,
  init: Omit<RequestInit, "method">,
): Promise<unknown> {
  const idempotencyKey = crypto.randomUUID();
  const request = () =>
    requestJson(path, fetch, {
      ...init,
      method: "POST",
      headers: {
        ...init.headers,
        "idempotency-key": idempotencyKey,
      },
    });
  try {
    return await request();
  } catch (error) {
    if (error instanceof ImportRequestError) throw error;
    return request();
  }
}

export async function uploadInventoryImport(
  file: File,
  loadId: string,
): Promise<ImportRun> {
  const body = new FormData();
  body.set("file", file);
  body.set("loadId", loadId);
  return ImportRunResponseSchema.parse(
    await retryBrowserCreate("/api/imports", { body }),
  ).run;
}

export async function approveInventoryImport(
  runId: string,
  expectedVersion: number,
  rowIds: string[],
): Promise<ImportRun> {
  return ImportRunResponseSchema.parse(
    await requestJson(`/api/imports/${runId}/approve`, fetch, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion, rowIds }),
    }),
  ).run;
}

export async function commitInventoryImport(
  runId: string,
  expectedVersion: number,
): Promise<ImportCommitResponse> {
  return ImportCommitResponseSchema.parse(
    await retryBrowserCreate(`/api/imports/${runId}/commit`, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion }),
    }),
  );
}

export function importSourceUrl(runId: string): string {
  return `/api/imports/${encodeURIComponent(runId)}/source`;
}

export function importReportUrl(runId: string): string {
  return `/api/imports/${encodeURIComponent(runId)}/report`;
}
