import { describe, expect, it } from "vitest";
import {
  CatalogSeedManifestSchema,
  normalizeCatalogIdentity,
  type CatalogSeedManifest,
} from "@simply-clean/contracts";
import { readFile } from "node:fs/promises";

import {
  evaluateSerialRules,
  resolveManifestModel,
} from "../src/modules/catalog/catalog.logic.js";
import {
  CANONICAL_CATALOG_DATASET_FILES,
  composeCatalogManifests,
} from "../src/modules/catalog/catalog.coverage.js";
import { effectiveMachineSpecs } from "../src/modules/inventory/actual-specs.js";

const manifest: CatalogSeedManifest = {
  datasetId: "test",
  snapshotDate: "2026-09-23",
  checksum: "a".repeat(64),
  manufacturers: [
    {
      id: "speed-queen",
      name: "Speed Queen",
      aliases: ["Speedqueen"],
      sources: [
        {
          id: "sq-source",
          url: "https://speedqueencommercial.com/models",
          title: "Models",
          retrievedAt: "2026-09-23T00:00:00.000Z",
          documentRevision: null,
          checksum: "b".repeat(64),
        },
      ],
      models: [
        {
          id: "sq-sc30",
          family: "SC",
          model: "SC30",
          aliases: ["SC 30"],
          equipmentClass: "washer",
          revision: {
            id: "sq-sc30-r1",
            revision: 1,
            approvedAt: "2026-09-23T00:00:00.000Z",
            productionStartYear: 2010,
            productionEndYear: null,
            specs: {
              widthIn: 29,
              depthIn: 35,
              heightIn: 44,
              weightLb: 420,
              capacityLb: 30,
              voltage: [],
              phase: [],
              fuel: [],
              configuration: [],
            },
            evidence: [
              "widthIn",
              "depthIn",
              "heightIn",
              "weightLb",
              "capacityLb",
            ].map((field) => ({
              field: field as "widthIn",
              sourceId: "sq-source",
              locator: "table",
              officialValue: "1",
              officialUnit: "unit",
            })),
          },
          serialRules: [
            {
              id: "sq-year",
              revision: 1,
              sourceId: "sq-source",
              locator: "serial guide",
              type: "year_code_at_position",
              position: 0,
              length: 1,
              minimumSerialLength: 2,
              codes: { A: 2020, B: [2021, 2022] },
            },
            {
              id: "sq-year",
              revision: 2,
              sourceId: "sq-source",
              locator: "corrected serial guide",
              type: "year_code_at_position",
              position: 0,
              length: 1,
              minimumSerialLength: 2,
              codes: { A: 2024 },
            },
          ],
        },
        {
          id: "sq-sc30-duplicate",
          family: "Legacy",
          model: "LEGACY30",
          aliases: ["COLLISION"],
          equipmentClass: "washer",
          revision: {
            id: "sq-sc30-r2",
            revision: 1,
            approvedAt: "2026-09-23T00:00:00.000Z",
            productionStartYear: null,
            productionEndYear: null,
            specs: {
              widthIn: null,
              depthIn: null,
              heightIn: null,
              weightLb: null,
              capacityLb: null,
              voltage: [],
              phase: [],
              fuel: [],
              configuration: [],
            },
            evidence: [],
          },
          serialRules: [],
        },
        {
          id: "sq-sc40-duplicate",
          family: "Legacy",
          model: "LEGACY40",
          aliases: ["COLLISION"],
          equipmentClass: "stacked_washer_dryer",
          revision: {
            id: "sq-sc40-r1",
            revision: 1,
            approvedAt: "2026-09-23T00:00:00.000Z",
            productionStartYear: null,
            productionEndYear: null,
            specs: {
              widthIn: null,
              depthIn: null,
              heightIn: null,
              weightLb: null,
              capacityLb: null,
              voltage: [],
              phase: [],
              fuel: [],
              configuration: [],
            },
            evidence: [],
          },
          serialRules: [],
        },
      ],
    },
  ],
};

describe("Catalog exact resolver", () => {
  it("resolves reviewed legal nameplate labels while rejecting unsupported variants", async () => {
    const manifests = await Promise.all(
      CANONICAL_CATALOG_DATASET_FILES.map(async (file) =>
        CatalogSeedManifestSchema.parse(
          JSON.parse(
            await readFile(
              new URL(`../catalog-data/${file}`, import.meta.url),
              "utf8",
            ),
          ),
        ),
      ),
    );
    const composed = composeCatalogManifests(manifests);
    for (const manufacturer of [
      "THE DEXTER COMPANY",
      "THE DEXTER COMPANY.",
      "DEXTER LAUNDRY, INC.",
      "DEXTER LAUNDRY, INC",
      "DEXTER LAUNDRY INC.",
      "THE DEXTER CO",
      "THE DEXTER CO.",
    ])
      expect(
        resolveManifestModel(composed, { manufacturer, model: "WCVD40KCS-12" }),
      ).toMatchObject({ status: "exact", manufacturer: "Dexter" });
    for (const manufacturer of [
      "Continental Girbau, Inc.",
      "Continental Girbau, Inc",
      "Continental Girbau Inc.",
    ])
      expect(
        resolveManifestModel(composed, { manufacturer, model: "KWN" }),
      ).toMatchObject({ status: "exact", manufacturer: "Continental Girbau" });
    for (const manufacturer of [
      "THE DEXTER CORPORATION",
      "Alliance Laundry Systems",
      "Continental-Girbau Inc.",
    ])
      expect(
        resolveManifestModel(composed, { manufacturer, model: "WCVD40KCS-12" })
          .status,
      ).toBe("unsupported");
  });
  it("normalizes only unicode/case/whitespace and requires aliases for punctuation", () => {
    expect(normalizeCatalogIdentity("  speed   QUEEN ")).toBe("SPEED QUEEN");
    expect(
      resolveManifestModel(manifest, {
        manufacturer: "Speedqueen",
        model: "SC30",
      }),
    ).toMatchObject({
      status: "exact",
      matchKind: "alias",
      revisionId: "sq-sc30-r1",
    });
    expect(
      resolveManifestModel(manifest, {
        manufacturer: "Speed Queen",
        model: "SC-30",
      }).status,
    ).toBe("unsupported");
    expect(
      resolveManifestModel(manifest, {
        manufacturer: "Speed Queen",
        model: "SC 30",
      }),
    ).toMatchObject({ status: "exact", matchKind: "alias" });
    expect(
      resolveManifestModel(manifest, {
        manufacturer: "Speed Queen",
        model: "COLLISION",
      }).status,
    ).toBe("ambiguous");
    expect(
      resolveManifestModel(manifest, { manufacturer: null, model: "SC30" })
        .status,
    ).toBe("insufficient_input");
  });

  it("evaluates only typed serial rules to exact, range, and unknown", () => {
    const rules = manifest.manufacturers[0]!.models[0]!.serialRules;
    expect(evaluateSerialRules(rules, "A123")).toEqual({
      kind: "exact",
      year: 2024,
      ruleId: "sq-year",
      ruleRevision: 2,
      sourceId: "sq-source",
      locator: "corrected serial guide",
    });
    expect(evaluateSerialRules(rules, "B123")).toEqual({
      kind: "unknown",
      reason: "serial_not_decodable",
    });
    expect(evaluateSerialRules([rules[0]!], "B123")).toEqual({
      kind: "range",
      startYear: 2021,
      endYear: 2022,
      ruleId: "sq-year",
      ruleRevision: 1,
      sourceId: "sq-source",
      locator: "serial guide",
    });
    expect(evaluateSerialRules(rules, "Z123")).toEqual({
      kind: "unknown",
      reason: "serial_not_decodable",
    });
    expect(evaluateSerialRules(rules, null)).toEqual({
      kind: "unknown",
      reason: "serial_not_provided",
    });
  });

  it("rejects conflicting current serial rules and retains exact rule provenance", () => {
    const first = manifest.manufacturers[0]!.models[0]!.serialRules[1]!;
    const conflicting = { ...first, id: "another-rule", codes: { A: 2022 } };
    expect(evaluateSerialRules([first, conflicting], "A123")).toEqual({
      kind: "unknown",
      reason: "conflicting_rules",
    });
    expect(
      evaluateSerialRules(
        [first, { ...conflicting, codes: { A: 2024 } }],
        "A123",
      ),
    ).toMatchObject({
      kind: "exact",
      year: 2024,
      ruleRevision: 2,
      sourceId: "sq-source",
    });
  });

  it("prefers actual, then Machine capacity, then pinned catalog", () => {
    expect(
      effectiveMachineSpecs(
        { widthIn: 28, depthIn: null, heightIn: null, weightLb: null },
        35,
        manifest.manufacturers[0]!.models[0]!.revision.specs,
      ),
    ).toEqual({
      widthIn: { value: 28, source: "actual" },
      depthIn: { value: 35, source: "catalog" },
      heightIn: { value: 44, source: "catalog" },
      weightLb: { value: 420, source: "catalog" },
      capacityLb: { value: 35, source: "machine" },
    });
  });

  it("resolves the two reviewed inventory variants without broadening exact matching", async () => {
    const manifests = await Promise.all(
      [
        "official-models.2026-09-23.json",
        "inventory-variants.2026-09-23.json",
      ].map(async (file) =>
        CatalogSeedManifestSchema.parse(
          JSON.parse(
            await readFile(
              new URL(`../catalog-data/${file}`, import.meta.url),
              "utf8",
            ),
          ),
        ),
      ),
    );
    const composed = composeCatalogManifests(manifests);
    expect(
      resolveManifestModel(composed, {
        manufacturer: "Huebsch",
        model: "HFNKCASG115TW01",
      }),
    ).toMatchObject({
      status: "exact",
      matchKind: "canonical",
      revisionId: "huebsch-hfnkcasg115tw01-r1",
      equipmentClass: "washer",
    });
    expect(
      resolveManifestModel(composed, {
        manufacturer: "Maytag",
        model: "MAH21PDDWW",
      }),
    ).toMatchObject({
      status: "exact",
      matchKind: "alias",
      revisionId: "maytag-commercial-mah21pddww-r1",
      equipmentClass: "washer",
    });
    for (const [manufacturer, model] of [
      ["Speed Queen", "STT30NBCB2G2N02"],
      ["Dexter", "WCAD25KCS-12ECSZ"],
      ["Dexter", "DLX30QSS"],
      ["Continental", "DDAG30KCS-65"],
    ] as const)
      expect(
        resolveManifestModel(composed, { manufacturer, model }).status,
      ).toBe("unsupported");
  });
});
