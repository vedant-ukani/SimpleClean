import type {
  CatalogDiscoveryResult,
  CatalogDiscoveryUsage,
  CatalogSpecificationEnrichmentField,
} from "@laundrorama/contracts";

type CatalogEquipmentClass = CatalogDiscoveryResult["equipmentClass"];
export type CatalogDiscoveryRequestedField =
  CatalogSpecificationEnrichmentField | "serialRules";

export interface CatalogDiscoveryRequest {
  manufacturer: string;
  model: string;
  /** The stored class for an existing variant, or null for unknown-model discovery. */
  equipmentClass: CatalogEquipmentClass | null;
  requestedFields: readonly CatalogDiscoveryRequestedField[];
}

export interface CatalogDiscoveryProviderResponse {
  result: CatalogDiscoveryResult;
  sources: Array<{ url: string; title: string }>;
  usage: CatalogDiscoveryUsage;
  webSearchCallCount: number;
  requestId: string | null;
  responseFingerprint: string;
}

export interface CatalogDiscoveryProvider {
  discover(
    request: CatalogDiscoveryRequest,
  ): Promise<CatalogDiscoveryProviderResponse>;
}

export type CatalogDiscoveryProviderErrorCode =
  | "invalid_configuration"
  | "timeout"
  | "unavailable"
  | "rate_limited"
  | "response_too_large"
  | "invalid_response";

export class CatalogDiscoveryProviderError extends Error {
  constructor(
    readonly code: CatalogDiscoveryProviderErrorCode,
    message = "Catalog discovery provider request failed",
    readonly status?: number,
  ) {
    super(message);
    this.name = "CatalogDiscoveryProviderError";
  }
}
