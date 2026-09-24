import { describe, expect, it } from "vitest";

import {
  CatalogSeedManifestSchema,
  CatalogSourceSchema,
  CatalogSerialRuleSchema,
  normalizeCatalogIdentity,
  suggestedMachineType,
  MachineEffectiveSpecsSchema,
  ResolveCatalogModelResponseSchema,
  CatalogDiscoveryResultSchema,
  CatalogDiscoveryRunSchema,
  CandidateCatalogEnrichmentSchema,
} from "../src/index.js";

describe("catalog contracts", () => {
  it("shares exact identity normalization and stacked equipment classification", () => {
    expect(normalizeCatalogIdentity("  ＳＣ  30 ")).toBe("SC 30");
    expect(normalizeCatalogIdentity("SC-30")).toBe("SC-30");
    expect(suggestedMachineType("stack_dryer")).toBe("dryer");
    expect(suggestedMachineType("stacked_washer_dryer")).toBe("other");
  });
  it("requires explicit checksum unavailability and bounded serial rule mappings", () => {
    const source = {
      id: "official",
      url: "https://example.test/manual",
      title: "Manual",
      retrievedAt: "2026-09-23T00:00:00.000Z",
      documentRevision: null,
      checksum: null,
    };
    expect(CatalogSourceSchema.safeParse(source).success).toBe(false);
    expect(
      CatalogSourceSchema.safeParse({
        ...source,
        checksumUnavailableReason: "Document bytes were unavailable",
      }).success,
    ).toBe(true);
    expect(
      CatalogSourceSchema.safeParse({
        ...source,
        checksum: "a".repeat(64),
        checksumUnavailableReason: "Unavailable",
      }).success,
    ).toBe(false);
    const rule = {
      id: "rule",
      revision: 1,
      sourceId: "official",
      locator: "Serial table",
      type: "year_code_at_position",
      position: 0,
      length: 1,
      minimumSerialLength: 2,
      codes: { A: [2024, 2020] },
    };
    expect(CatalogSerialRuleSchema.safeParse(rule).success).toBe(false);
    expect(
      CatalogSerialRuleSchema.safeParse({ ...rule, codes: { A: [2020, 2024] } })
        .success,
    ).toBe(true);
    expect(
      CatalogSerialRuleSchema.safeParse({
        ...rule,
        position: 2,
        codes: { A: 2020 },
      }).success,
    ).toBe(false);
  });
  it("accepts a source-backed approved snapshot and rejects uncited facts", () => {
    const base = {
      datasetId: "official-models.2026-09-23",
      snapshotDate: "2026-09-23",
      checksum: "a".repeat(64),
      manufacturers: [
        {
          id: "dexter",
          name: "Dexter",
          aliases: [],
          sources: [
            {
              id: "dexter-t300",
              url: "https://dexter.com/t300",
              title: "T-300 Washer",
              retrievedAt: "2026-09-23T00:00:00.000Z",
              documentRevision: null,
              checksum: "b".repeat(64),
            },
          ],
          models: [
            {
              id: "dexter-t300",
              family: "T-Series",
              model: "T-300",
              aliases: ["T300"],
              equipmentClass: "washer",
              revision: {
                id: "dexter-t300-r1",
                revision: 1,
                approvedAt: "2026-09-23T00:00:00.000Z",
                productionStartYear: null,
                productionEndYear: null,
                specs: {
                  widthIn: 27.5,
                  depthIn: null,
                  heightIn: null,
                  weightLb: null,
                  capacityLb: 20,
                  voltage: [],
                  phase: [],
                  fuel: [],
                  configuration: [],
                },
                evidence: [
                  {
                    field: "model",
                    sourceId: "dexter-t300",
                    locator: "Heading",
                    officialValue: "T-300",
                    officialUnit: null,
                  },
                  {
                    field: "equipmentClass",
                    sourceId: "dexter-t300",
                    locator: "Heading",
                    officialValue: "washer",
                    officialUnit: null,
                  },
                  {
                    field: "widthIn",
                    sourceId: "dexter-t300",
                    locator: "Specifications table",
                    officialValue: "27.5",
                    officialUnit: "in",
                  },
                  {
                    field: "capacityLb",
                    sourceId: "dexter-t300",
                    locator: "Specifications table",
                    officialValue: "20",
                    officialUnit: "lb",
                  },
                ],
              },
              serialRules: [],
            },
          ],
        },
      ],
    };
    expect(CatalogSeedManifestSchema.safeParse(base).success).toBe(true);
    expect(
      CatalogSeedManifestSchema.safeParse({
        ...base,
        manufacturers: [
          {
            ...base.manufacturers[0],
            models: [
              {
                ...base.manufacturers[0]!.models[0],
                revision: {
                  ...base.manufacturers[0]!.models[0]!.revision,
                  evidence: [],
                },
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("models exact resolution and sourced effective values", () => {
    expect(
      ResolveCatalogModelResponseSchema.parse({
        status: "exact",
        matchKind: "canonical",
        revisionId: "rev-1",
        manufacturer: "Dexter",
        model: "T-300",
        equipmentClass: "washer",
        manufactureDate: { kind: "unknown", reason: "serial_rule_unavailable" },
      }).status,
    ).toBe("exact");
    expect(
      MachineEffectiveSpecsSchema.parse({
        widthIn: { value: 28, source: "actual" },
        depthIn: { value: null, source: "unknown" },
        heightIn: { value: 40, source: "catalog" },
        weightLb: { value: 300, source: "catalog" },
        capacityLb: { value: 30, source: "machine" },
      }).capacityLb.source,
    ).toBe("machine");
  });

  it("models bounded automatic discovery provenance without approval state", () => {
    const result = CatalogDiscoveryResultSchema.parse({
      manufacturer: "Dexter",
      model: "T-300",
      equipmentClass: "washer",
      modelEvidence: {
        sourceUrl: "https://dexter.com/products/t-300",
        locator: "Model heading",
        exactModelPresent: true,
      },
      equipmentClassEvidence: {
        sourceUrl: "https://dexter.com/products/t-300",
        locator: "Product type",
        exactModelPresent: true,
      },
      fields: [
        {
          field: "widthIn",
          normalizedValue: 27.5,
          officialValue: "27.5",
          officialUnit: "in",
          sourceUrl: "https://dexter.com/products/t-300",
          locator: "Specifications table",
          exactModelPresent: true,
        },
      ],
      productionStartYear: null,
      productionEndYear: null,
      serialRules: [],
    });
    expect(result.fields[0]?.field).toBe("widthIn");

    const run = CatalogDiscoveryRunSchema.parse({
      id: "run-1",
      status: "published",
      normalizedManufacturer: "DEXTER",
      normalizedModel: "T-300",
      provider: "openai",
      model: "gpt-6-luna",
      promptVersion: "catalog-discovery-prompt-v1",
      schemaVersion: "catalog-discovery-schema-v1",
      policyVersion: "automatic-official-source-policy-v1",
      publicationMode: "automatic_official_source_policy",
      revisionId: "revision-1",
      noResultReason: null,
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        totalTokens: 160,
        raw: { input_tokens: 120, output_tokens: 40, total_tokens: 160 },
      },
      webSearchCallCount: 1,
      pricing: {
        version: "test-pricing-v1",
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 2,
        webSearchUsdPerCall: 0.01,
      },
      estimatedCostUsd: 0.0102,
      responseFingerprint: "a".repeat(64),
      createdAt: "2026-09-23T00:00:00.000Z",
      completedAt: "2026-09-23T00:00:01.000Z",
    });
    expect(run.publicationMode).toBe("automatic_official_source_policy");
    expect(JSON.stringify(run)).not.toContain("approval");

    expect(
      CandidateCatalogEnrichmentSchema.parse({
        status: "researching",
        revision: null,
        discoveryRun: null,
        manufactureDate: {
          kind: "unknown",
          reason: "serial_rule_unavailable",
        },
      }).status,
    ).toBe("researching");
  });
});
