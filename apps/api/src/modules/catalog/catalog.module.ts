import { Module } from "@nestjs/common";
import type { ServerConfig } from "@laundrorama/config";

import { SERVER_CONFIG } from "../../platform/logging.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogRepository } from "./catalog.repository.js";
import {
  CATALOG_DISCOVERY_PROVIDER,
  CATALOG_OPERATIONS,
  CatalogService,
} from "./catalog.service.js";
import {
  CatalogDiscoveryProviderError,
  type CatalogDiscoveryProvider,
} from "./discovery/catalog-discovery.provider.js";
import { FakeCatalogDiscoveryProvider } from "./discovery/fake-catalog-discovery.adapter.js";
import { OpenAICatalogDiscoveryProvider } from "./discovery/openai-catalog-discovery.adapter.js";

const FAKE_HOSTS: Record<string, string> = {
  DEXTER: "dexter.com",
  "SPEED QUEEN": "speedqueencommercial.com",
  ELECTROLUX: "electroluxprofessional.com",
  MAYTAG: "maytagcommerciallaundry.com",
  HUEBSCH: "huebsch.com",
  CONTINENTAL: "continental-laundry.com",
  "TEST MANUFACTURER": "example.test",
};

export function createCatalogDiscoveryProvider(
  config: ServerConfig,
): CatalogDiscoveryProvider {
  if (config.catalogDiscoveryProvider === "openai")
    return new OpenAICatalogDiscoveryProvider({
      apiKey: config.catalogDiscoveryApiKey ?? "",
      model: config.catalogDiscoveryModel,
      ...(config.catalogDiscoveryEndpoint
        ? { endpoint: config.catalogDiscoveryEndpoint }
        : {}),
      timeoutMs: config.catalogDiscoveryTimeoutMs,
      maxResponseBytes: config.catalogDiscoveryMaxOutputBytes,
    });
  if (config.catalogDiscoveryProvider === "fake")
    return new FakeCatalogDiscoveryProvider((request) => {
      const host =
        FAKE_HOSTS[request.manufacturer.toUpperCase()] ?? "example.test";
      const url = `https://${host}/models/${encodeURIComponent(request.model)}`;
      return {
        result: {
          manufacturer: request.manufacturer,
          model: request.model,
          equipmentClass: "washer",
          modelEvidence: {
            sourceUrl: url,
            locator: "Model heading",
            exactModelPresent: true,
          },
          equipmentClassEvidence: {
            sourceUrl: url,
            locator: "Product category",
            exactModelPresent: true,
          },
          fields: [
            {
              field: "widthIn",
              normalizedValue: 30,
              officialValue: "30",
              officialUnit: "in",
              sourceUrl: url,
              locator: "Specifications table",
              exactModelPresent: true,
            },
            {
              field: "capacityLb",
              normalizedValue: 40,
              officialValue: "40",
              officialUnit: "lb",
              sourceUrl: url,
              locator: "Specifications table",
              exactModelPresent: true,
            },
          ],
          productionStartYear: null,
          productionEndYear: null,
          productionEvidence: [],
          serialRules: [],
        },
        sources: [{ url, title: `${request.model} official specifications` }],
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          raw: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        },
        webSearchCallCount: 1,
        requestId: "fake-catalog-discovery-request",
      };
    });
  return {
    discover: async () => {
      throw new CatalogDiscoveryProviderError(
        "invalid_configuration",
        "Catalog discovery is disabled",
      );
    },
  };
}

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogRepository,
    CatalogService,
    {
      provide: CATALOG_DISCOVERY_PROVIDER,
      inject: [SERVER_CONFIG],
      useFactory: createCatalogDiscoveryProvider,
    },
    { provide: CATALOG_OPERATIONS, useExisting: CatalogService },
  ],
  exports: [CATALOG_OPERATIONS, CatalogService],
})
export class CatalogModule {}
