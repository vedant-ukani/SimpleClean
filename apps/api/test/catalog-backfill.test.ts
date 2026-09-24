import {
  missingCatalogSpecificationFields,
  type CatalogSpecs,
} from "@simply-clean/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  parseCatalogBackfillArgs,
  runCatalogBackfill,
} from "../src/catalog-backfill.js";
import {
  CatalogService,
  type CatalogSpecificationBackfillSelection,
} from "../src/modules/catalog/catalog.service.js";

const emptySpecs: CatalogSpecs = {
  widthIn: null,
  depthIn: null,
  heightIn: null,
  weightLb: null,
  capacityLb: null,
  voltage: [],
  phase: [],
  fuel: [],
  configuration: [],
};

function candidate(
  variantId: string,
  manufacturer: string,
  model: string,
): Omit<CatalogSpecificationBackfillSelection, "inventoryPriority"> {
  return {
    variantId,
    baseRevisionId: `${variantId}-r1`,
    revision: 1,
    manufacturerId: `${manufacturer}-id`,
    manufacturer,
    family: "Family",
    model,
    equipmentClass: "washer",
    specs: emptySpecs,
    productionStartYear: null,
    productionEndYear: null,
    missingFields: missingCatalogSpecificationFields({
      specs: emptySpecs,
      productionStartYear: null,
      productionEndYear: null,
    }),
  };
}

describe("Catalog specification backfill", () => {
  it("detects missing scalar, list, and production fields", () => {
    expect(
      missingCatalogSpecificationFields({
        specs: {
          ...emptySpecs,
          widthIn: 30,
          voltage: ["208 V"],
        },
        productionStartYear: 2010,
        productionEndYear: null,
      }),
    ).toEqual([
      "depthIn",
      "heightIn",
      "weightLb",
      "capacityLb",
      "phase",
      "fuel",
      "configuration",
      "productionEndYear",
    ]);
  });

  it("orders Inventory variants first, then manufacturer, model, and variant", async () => {
    const repository = {
      listIncompleteLatestApprovedRevisions: vi
        .fn()
        .mockResolvedValue([
          candidate("z", "Zulu", "B"),
          candidate("b", "Alpha", "B"),
          candidate("a", "Alpha", "B"),
          candidate("c", "Alpha", "A"),
        ]),
      discoveryRunStatesByDedupeKey: vi.fn().mockResolvedValue(new Map()),
    };
    const service = new CatalogService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.previewSpecificationBackfill("all", new Set(["z"]), 4),
    ).resolves.toMatchObject({
      selected: [
        { variantId: "z", inventoryPriority: true },
        { variantId: "c", inventoryPriority: false },
        { variantId: "a", inventoryPriority: false },
        { variantId: "b", inventoryPriority: false },
      ],
    });
    await expect(
      service.previewSpecificationBackfill("inventory", new Set(["z"]), 4),
    ).resolves.toMatchObject({ selected: [{ variantId: "z" }] });
  });

  it("moves a current-base no-result behind the next fresh model before slicing", async () => {
    const candidates = [
      candidate("a", "Alpha", "A-1"),
      candidate("b", "Alpha", "B-1"),
    ];
    let firstDedupeKey: string | undefined;
    const repository = {
      listIncompleteLatestApprovedRevisions: vi
        .fn()
        .mockResolvedValue(candidates),
      discoveryRunStatesByDedupeKey: vi
        .fn()
        .mockImplementation((keys: string[]) => {
          firstDedupeKey ??= keys[0];
          return new Map(
            firstDedupeKey
              ? [
                  [
                    firstDedupeKey,
                    { status: "no_result", leaseExpiresAt: null },
                  ],
                ]
              : [],
          );
        }),
    };
    const service = new CatalogService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
    );
    repository.discoveryRunStatesByDedupeKey.mockResolvedValueOnce(new Map());
    await expect(
      service.previewSpecificationBackfill("all", new Set(), 1),
    ).resolves.toMatchObject({ selected: [{ variantId: "a" }] });
    await expect(
      service.previewSpecificationBackfill("all", new Set(), 1),
    ).resolves.toMatchObject({ selected: [{ variantId: "b" }] });
  });

  it("requires bounded scope arguments", () => {
    expect(
      parseCatalogBackfillArgs(["--scope", "all", "--max-models", "2"]),
    ).toEqual({ scope: "all", execute: false, maxModels: 2 });
    expect(() => parseCatalogBackfillArgs(["--scope", "all"])).toThrow(
      "--max-models is required",
    );
    expect(() =>
      parseCatalogBackfillArgs(["--scope", "inventory", "--max-models", "0"]),
    ).toThrow("positive integer");
  });

  it("keeps preview read-only and prints only bounded model identifiers and aggregates", async () => {
    const selection = {
      ...candidate("a", "Alpha", "A-1"),
      inventoryPriority: false,
    };
    const requestSpecificationEnrichment = vi.fn();
    const assertSpecificationEnrichmentAvailable = vi.fn();
    const output: string[] = [];
    const summary = await runCatalogBackfill(
      { scope: "all", execute: false, maxModels: 1 },
      {
        catalog: {
          resolveModel: vi.fn(),
          previewSpecificationBackfill: vi.fn().mockResolvedValue({
            selected: [selection],
            coverage: {
              total: 1,
              known: Object.fromEntries(
                selection.missingFields.map((field) => [field, 0]),
              ),
            },
          }),
          assertSpecificationEnrichmentAvailable,
          requestSpecificationEnrichment,
        } as never,
        inventoryIdentities: [],
        writeOutput: (text) => output.push(text),
        writeError: vi.fn(),
      },
    );
    expect(summary).toMatchObject({ selected: 1, attempted: 0 });
    expect(assertSpecificationEnrichmentAvailable).not.toHaveBeenCalled();
    expect(requestSpecificationEnrichment).not.toHaveBeenCalled();
    expect(output.join("")).toContain("Alpha — A-1");
  });

  it("fails execute preflight before reserving any model run", async () => {
    const selection = {
      ...candidate("a", "Alpha", "A-1"),
      inventoryPriority: false,
    };
    const requestSpecificationEnrichment = vi.fn();
    await expect(
      runCatalogBackfill(
        { scope: "all", execute: true, maxModels: 1 },
        {
          catalog: {
            resolveModel: vi.fn(),
            previewSpecificationBackfill: vi.fn().mockResolvedValue({
              selected: [selection],
              coverage: {
                total: 1,
                known: Object.fromEntries(
                  selection.missingFields.map((field) => [field, 0]),
                ),
              },
            }),
            assertSpecificationEnrichmentAvailable: vi.fn(() => {
              throw new Error("provider unavailable");
            }),
            requestSpecificationEnrichment,
          } as never,
          inventoryIdentities: [],
          writeOutput: vi.fn(),
          writeError: vi.fn(),
        },
      ),
    ).rejects.toThrow("provider unavailable");
    expect(requestSpecificationEnrichment).not.toHaveBeenCalled();
  });

  it("does not report historical cost for a reused run", async () => {
    const selection = {
      ...candidate("a", "Alpha", "A-1"),
      inventoryPriority: false,
    };
    const resolveModel = vi.fn().mockResolvedValue({
      result: { status: "exact", revisionId: selection.baseRevisionId },
      detail: {
        manufacturerId: selection.manufacturerId,
        manufacturer: selection.manufacturer,
        modelId: selection.variantId,
        family: selection.family,
        model: selection.model,
        equipmentClass: selection.equipmentClass,
        revisionId: selection.baseRevisionId,
        revision: selection.revision,
        aliases: [],
        productionStartYear: null,
        productionEndYear: null,
        specs: selection.specs,
        sources: [],
        evidence: [],
      },
    });
    const summary = await runCatalogBackfill(
      { scope: "all", execute: true, maxModels: 1 },
      {
        catalog: {
          resolveModel,
          previewSpecificationBackfill: vi.fn().mockResolvedValue({
            selected: [selection],
            coverage: {
              total: 1,
              known: Object.fromEntries(
                selection.missingFields.map((field) => [field, 0]),
              ),
            },
          }),
          assertSpecificationEnrichmentAvailable: vi.fn(),
          requestSpecificationEnrichment: vi.fn().mockResolvedValue({
            outcome: "reused",
            revision: null,
            run: {
              id: "historical-run",
              estimatedCostUsd: 9.99,
            },
          }),
        } as never,
        inventoryIdentities: [],
        writeOutput: vi.fn(),
        writeError: vi.fn(),
      },
    );
    expect(summary).toMatchObject({
      reused: 1,
      estimatedProviderCostUsd: 0,
    });
  });
});
