import { createHash } from "node:crypto";

import type {
  CatalogDiscoveryProvider,
  CatalogDiscoveryProviderResponse,
  CatalogDiscoveryRequest,
} from "./catalog-discovery.provider.js";

export class FakeCatalogDiscoveryProvider implements CatalogDiscoveryProvider {
  calls = 0;

  constructor(
    private readonly fixture?:
      | Omit<CatalogDiscoveryProviderResponse, "responseFingerprint">
      | ((
          request: CatalogDiscoveryRequest,
        ) => Omit<CatalogDiscoveryProviderResponse, "responseFingerprint">),
  ) {}

  async discover(
    request: CatalogDiscoveryRequest,
  ): Promise<CatalogDiscoveryProviderResponse> {
    this.calls += 1;
    const fixture =
      typeof this.fixture === "function" ? this.fixture(request) : this.fixture;
    if (!fixture)
      throw new Error("Deterministic Catalog discovery fixture is required");
    const requestedFields = new Set(request.requestedFields);
    return {
      ...fixture,
      result: {
        ...fixture.result,
        equipmentClass: request.equipmentClass ?? fixture.result.equipmentClass,
        fields: fixture.result.fields.filter((field) =>
          requestedFields.has(field.field),
        ),
        productionStartYear: requestedFields.has("productionStartYear")
          ? fixture.result.productionStartYear
          : null,
        productionEndYear: requestedFields.has("productionEndYear")
          ? fixture.result.productionEndYear
          : null,
        // Serial rules are a legacy discovery field, not an enrichment field.
        serialRules: requestedFields.has("serialRules")
          ? fixture.result.serialRules
          : [],
      },
      responseFingerprint: createHash("sha256")
        .update(
          JSON.stringify({
            ...fixture,
            request: {
              equipmentClass: request.equipmentClass,
              requestedFields: request.requestedFields,
            },
          }),
        )
        .digest("hex"),
    };
  }
}
