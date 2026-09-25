import {
  CatalogDetailResponseSchema,
  CatalogListResponseSchema,
  type CatalogListResponse,
  type CatalogModelDetail,
} from "@laundrorama/contracts";

import { getServerJson } from "./api-client";

export interface CatalogListRequest {
  query?: string;
  manufacturer?: string;
  page?: number;
  pageSize?: number;
}

function catalogQuery(input: CatalogListRequest): string {
  const params = new URLSearchParams();
  if (input.query) params.set("query", input.query);
  if (input.manufacturer) params.set("manufacturer", input.manufacturer);
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  return params.size ? `?${params.toString()}` : "";
}

export async function getCatalogModels(
  input: CatalogListRequest = {},
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<CatalogListResponse> {
  return CatalogListResponseSchema.parse(
    await getServerJson(
      `/catalog/models${catalogQuery(input)}`,
      fetcher,
      environment,
      cookie,
    ),
  );
}

export async function getCatalogModel(
  revisionId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<CatalogModelDetail> {
  return CatalogDetailResponseSchema.parse(
    await getServerJson(
      `/catalog/models/${encodeURIComponent(revisionId)}`,
      fetcher,
      environment,
      cookie,
    ),
  ).model;
}
