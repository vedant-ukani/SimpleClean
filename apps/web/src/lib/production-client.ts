import {
  PreliminaryInspectionHistoryResponseSchema,
  type CreatePreliminaryInspectionRequest,
  type PreliminaryInspectionHistoryResponse,
  type RecordPreliminaryDispositionRequest,
} from "@simply-clean/contracts";
import { getServerJson, postBrowserJson } from "./api-client";

export async function getPreliminaryHistory(
  machineId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<PreliminaryInspectionHistoryResponse> {
  return PreliminaryInspectionHistoryResponseSchema.parse(
    await getServerJson(
      `/inventory/machines/${machineId}/production`,
      fetcher,
      environment,
      cookie,
    ),
  );
}

export async function createPreliminaryInspection(
  machineId: string,
  request: CreatePreliminaryInspectionRequest,
  idempotencyKey: string,
): Promise<PreliminaryInspectionHistoryResponse> {
  return PreliminaryInspectionHistoryResponseSchema.parse(
    await postBrowserJson(
      `/inventory/machines/${machineId}/production/inspections`,
      request,
      idempotencyKey,
    ),
  );
}

export async function finalizePreliminaryDisposition(
  machineId: string,
  inspectionId: string,
  request: RecordPreliminaryDispositionRequest,
  idempotencyKey: string,
): Promise<PreliminaryInspectionHistoryResponse> {
  return PreliminaryInspectionHistoryResponseSchema.parse(
    await postBrowserJson(
      `/inventory/machines/${machineId}/production/inspections/${inspectionId}/dispositions`,
      request,
      idempotencyKey,
    ),
  );
}
