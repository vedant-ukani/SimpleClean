import {
  CatalogSeedManifestSchema,
  type CatalogSeedManifest,
} from "@simply-clean/contracts";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  catalogCoverage,
  CANONICAL_CATALOG_DATASET_FILES,
  composeCatalogManifests,
  coverageMarkdown,
  UNMATCHED_INVENTORY_EVIDENCE_DISPOSITION,
} from "../src/modules/catalog/catalog.coverage.js";
import { catalogManifestChecksum } from "../src/modules/catalog/catalog.service.js";
import { catalogImportSummary } from "../src/catalog-import-summary.js";
import { resolveManifestModel } from "../src/modules/catalog/catalog.logic.js";
import { parseImportFile } from "../src/modules/imports/import-parser.js";

const REVIEWED_PASS_DATASET_FILES = CANONICAL_CATALOG_DATASET_FILES.slice(
  0,
  CANONICAL_CATALOG_DATASET_FILES.indexOf(
    "reviewed-enrichment.2026-09-24.json",
  ) + 1,
);

describe("Reviewed Catalog snapshot coverage", () => {
  it("composes the checksummed additive alias delta and resolves all 92 reviewed labels", async () => {
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
    const delta = manifests.at(-1)!;
    const originalAliasDelta = manifests.find(
      (manifest) => manifest.datasetId === "manufacturer-aliases.2026-09-24",
    )!;
    expect(originalAliasDelta.checksum).toBe(
      "f4c4cc7545bf99655b4c9e31b9f0b0839203313f29a623b3f400ce4e10294dcd",
    );
    expect(originalAliasDelta.checksum).toBe(
      catalogManifestChecksum(originalAliasDelta),
    );
    expect(delta.datasetId).toBe("manufacturer-aliases-app-audit.2026-09-24");
    expect(
      delta.manufacturers.map((manufacturer) => manufacturer.aliases),
    ).toEqual([["DEXTER COMPANY"], ["GIRBAU", "GIRBAU INC.", "CONTINENTAL"]]);
    expect(
      delta.manufacturers.flatMap((manufacturer) => manufacturer.models),
    ).toHaveLength(0);
    expect(delta.checksum).toBe(catalogManifestChecksum(delta));
    const composed = composeCatalogManifests(manifests);
    const reviewed = [
      ["THE DEXTER COMPANY", 36, "Dexter", "WCVD40KCS-12"],
      ["DEXTER LAUNDRY, INC.", 10, "Dexter", "WCVD40KCS-12"],
      ["THE DEXTER CO", 2, "Dexter", "WCVD40KCS-12"],
      ["Continental Girbau, Inc.", 44, "Continental Girbau", "KWN"],
    ] as const;
    expect(reviewed.reduce((sum, [, count]) => sum + count, 0)).toBe(92);
    for (const [label, count, canonical, model] of reviewed)
      for (let index = 0; index < count; index++)
        expect(
          resolveManifestModel(composed, { manufacturer: label, model }),
        ).toMatchObject({
          status: "exact",
          manufacturer: canonical,
        });
    expect(
      composed.manufacturers.flatMap((manufacturer) => manufacturer.models),
    ).toHaveLength(300);
    expect(
      resolveManifestModel(composed, {
        manufacturer: "DEXTER COMPANY",
        model: "WCVD18KCS-10",
      }),
    ).toMatchObject({ status: "exact", revisionId: "dexter-wcvd18kcs-10-r1" });
    for (const label of ["GIRBAU", "GIRBAU INC.", "CONTINENTAL"])
      expect(
        resolveManifestModel(composed, { manufacturer: label, model: "EH020" }),
      ).toMatchObject({ status: "exact", manufacturer: "Continental Girbau" });
    expect(
      resolveManifestModel(composed, {
        manufacturer: "DEXTER COMPANY",
        model: "WCVD18KCS 10",
      }).status,
    ).toBe("unsupported");
    const dexter = composed.manufacturers.find(
      (manufacturer) => manufacturer.id === "dexter",
    )!;
    const wcvd = dexter.models.find((model) => model.model === "WCVD18KCS-10")!;
    const officialIds = new Set(
      dexter.sources
        .filter((source) => source.sourceClass === "official_manufacturer")
        .map((source) => source.id),
    );
    expect(wcvd.revision.specs).toMatchObject({
      voltage: ["120V/60Hz"],
      phase: ["single_phase"],
    });
    for (const field of ["model", "equipmentClass", "voltage", "phase"])
      expect(
        wcvd.revision.evidence.some(
          (evidence) =>
            evidence.field === field &&
            officialIds.has(evidence.sourceId) &&
            evidence.locator,
        ),
      ).toBe(true);
    const invalid = structuredClone(delta);
    invalid.checksum = "0".repeat(64);
    expect(() =>
      composeCatalogManifests([...manifests.slice(0, -1), invalid]),
    ).toThrow("checksum");
    for (const collision of ["Speed Queen", "Continental Girbau"]) {
      const conflicting = structuredClone(delta);
      conflicting.manufacturers[0]!.aliases.push(collision);
      conflicting.checksum = catalogManifestChecksum(conflicting);
      expect(() =>
        composeCatalogManifests([...manifests.slice(0, -1), conflicting]),
      ).toThrow("Conflicting manufacturer identity");
    }
  });
  it("reports unique manufacturers and models across overlapping canonical imports", async () => {
    const manifests = await Promise.all(
      REVIEWED_PASS_DATASET_FILES.map(async (file) =>
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
    expect(catalogImportSummary(manifests)).toEqual({
      manufacturers: 6,
      models: 299,
    });
    expect(catalogImportSummary(manifests.slice(0, 1))).toEqual({
      manufacturers: 6,
      models: 297,
    });
  });

  it("keeps the reviewed secondary pass additive, sourced, and separate from automatic discovery", async () => {
    const manifests = await Promise.all(
      REVIEWED_PASS_DATASET_FILES.map(async (file) =>
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
    const reviewedIndex = REVIEWED_PASS_DATASET_FILES.indexOf(
      "reviewed-enrichment.2026-09-24.json",
    );
    const prior = composeCatalogManifests(manifests.slice(0, reviewedIndex));
    const latest = composeCatalogManifests(manifests);
    const delta = manifests[reviewedIndex]!;
    expect(delta.checksum).toBe(catalogManifestChecksum(delta));
    expect(
      delta.manufacturers.flatMap((manufacturer) => manufacturer.models),
    ).toHaveLength(39);
    const previousById = new Map(
      prior.manufacturers.flatMap((manufacturer) =>
        manufacturer.models.map((model) => [model.id, model] as const),
      ),
    );
    let additions = 0;
    for (const manufacturer of delta.manufacturers) {
      const sourceById = new Map(
        manufacturer.sources.map((source) => [source.id, source] as const),
      );
      for (const model of manufacturer.models) {
        const previous = previousById.get(model.id)!;
        expect(previous).toBeDefined();
        expect(model.revision.revision).toBe(previous.revision.revision + 1);
        expect(model.revision.publicationMode).toBe("reviewed_snapshot");
        expect({ ...model, revision: undefined }).toEqual({
          ...previous,
          revision: undefined,
        });
        expect(model.revision.evidence).toEqual(
          expect.arrayContaining(previous.revision.evidence),
        );
        for (const [field, value] of Object.entries(model.revision.specs)) {
          const old =
            previous.revision.specs[
              field as keyof typeof previous.revision.specs
            ];
          if (old !== null && !(Array.isArray(old) && old.length === 0))
            expect(value).toEqual(old);
          if (old === null && value !== null) {
            additions += 1;
            const newEvidence = model.revision.evidence.filter(
              (evidence) =>
                evidence.field === field &&
                !previous.revision.evidence.some(
                  (oldEvidence) =>
                    JSON.stringify(oldEvidence) === JSON.stringify(evidence),
                ),
            );
            expect(newEvidence.length).toBeGreaterThan(0);
            for (const evidence of newEvidence)
              expect(sourceById.has(evidence.sourceId)).toBe(true);
          }
        }
      }
    }
    expect(additions).toBe(165);
    expect(
      latest.manufacturers.flatMap((manufacturer) => manufacturer.models),
    ).toHaveLength(299);
    expect(
      latest.manufacturers
        .flatMap((manufacturer) => manufacturer.models)
        .filter((model) =>
          (
            [
              "widthIn",
              "depthIn",
              "heightIn",
              "weightLb",
              "capacityLb",
            ] as const
          ).every((field) => model.revision.specs[field] === null),
        ),
    ).toHaveLength(140);
    const allSources = delta.manufacturers.flatMap(
      (manufacturer) => manufacturer.sources,
    );
    for (const id of [
      "dexter-reviewed-segotw-wcvd-20260924",
      "maytag-reviewed-md28-distributor-20260924",
    ])
      expect(allSources.find((source) => source.id === id)?.sourceClass).toBe(
        "distributor",
      );
    for (const id of [
      "dexter-reviewed-123laundry-wcvd18-20260924",
      "dexter-reviewed-123laundry-wcvd25-20260924",
    ])
      expect(allSources.find((source) => source.id === id)?.sourceClass).toBe(
        "reseller",
      );
    expect(
      allSources.find(
        (source) =>
          source.id === "maytag-reviewed-mle27-mlg27-archive-20260924",
      )?.sourceClass,
    ).toBe("third_party");
    expect(
      allSources.filter(
        (source) =>
          source.id.includes("-reviewed-") &&
          source.sourceClass === "marketplace",
      ),
    ).toHaveLength(0);
  });

  it("validates all six manufacturers and classifies every workbook model without publishing serial values", async () => {
    const manifest = CatalogSeedManifestSchema.parse(
      JSON.parse(
        await readFile(
          new URL(
            "../catalog-data/official-models.2026-09-23.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    expect(manifest.checksum).toBe(catalogManifestChecksum(manifest));
    expect(manifest.manufacturers).toHaveLength(6);
    expect(
      manifest.manufacturers.every(
        (manufacturer) => manufacturer.models.length > 0,
      ),
    ).toBe(true);
    const workbook = await parseImportFile(
      "Inventory List.xlsx",
      await readFile(
        new URL(
          "../../../source-materials/inventory/Inventory List.xlsx",
          import.meta.url,
        ),
      ),
    );
    const input = workbook.rows.flatMap(({ candidate }) =>
      candidate.manufacturer && candidate.model
        ? [{ manufacturer: candidate.manufacturer, model: candidate.model }]
        : [],
    );
    const coverage = catalogCoverage(manifest, input);
    expect(new Set(coverage.map((entry) => entry.model)).size).toBe(53);
    expect(
      coverage.every((entry) =>
        ["exact", "alias", "ambiguous", "unsupported"].includes(
          entry.classification,
        ),
      ),
    ).toBe(true);
    const markdown = coverageMarkdown(manifest, input);
    for (const serial of workbook.rows
      .map((row) => row.candidate.serial)
      .filter((serial): serial is string =>
        Boolean(serial && serial.length >= 8),
      ))
      expect(markdown).not.toContain(serial);
    expect(
      manifest.manufacturers.flatMap((manufacturer) =>
        manufacturer.models.flatMap((model) => model.serialRules),
      ),
    ).toHaveLength(0);
  });

  it("composes the approved delta without weakening exact coverage or exposing rows", async () => {
    const loaded = await Promise.all(
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
    const base = loaded[0]!;
    const delta = loaded[1]!;
    expect(base.checksum).toBe(catalogManifestChecksum(base));
    expect(delta.checksum).toBe(catalogManifestChecksum(delta));
    const manifest = composeCatalogManifests([base, delta]);
    const workbook = await parseImportFile(
      "Inventory List.xlsx",
      await readFile(
        new URL(
          "../../../source-materials/inventory/Inventory List.xlsx",
          import.meta.url,
        ),
      ),
    );
    const input = workbook.rows.flatMap(({ candidate }) =>
      candidate.manufacturer && candidate.model
        ? [{ manufacturer: candidate.manufacturer, model: candidate.model }]
        : [],
    );
    const coverage = catalogCoverage(manifest, input);
    const matched = coverage.filter((row) =>
      ["exact", "alias"].includes(row.classification),
    );
    expect(coverage).toHaveLength(53);
    expect(matched).toHaveLength(19);
    expect(
      coverage.filter((row) => row.classification === "unsupported"),
    ).toHaveLength(34);
    expect(input).toHaveLength(227);
    const rowMatches = input.filter((entry) => {
      const row = coverage.find(
        (candidate) =>
          candidate.manufacturer === entry.manufacturer &&
          candidate.model === entry.model,
      );
      return row?.classification === "exact" || row?.classification === "alias";
    });
    expect(rowMatches).toHaveLength(106);
    expect(
      input.filter((entry) => {
        const row = coverage.find(
          (candidate) =>
            candidate.manufacturer === entry.manufacturer &&
            candidate.model === entry.model,
        );
        return row?.classification === "unsupported";
      }),
    ).toHaveLength(121);
    expect(
      coverage.find((row) => row.model === "HFNKCASG115TW01"),
    ).toMatchObject({ classification: "exact" });
    expect(coverage.find((row) => row.model === "MAH21PDDWW")).toMatchObject({
      classification: "alias",
    });
    for (const model of [
      "STT30NBCB2G2N02",
      "WCAD25KCS-12ECSZ",
      "DLX30QSS",
      "DDAG30KCS-65",
    ])
      expect(coverage.find((row) => row.model === model)).toMatchObject({
        classification: "unsupported",
      });
    const markdown = coverageMarkdown(manifest, input, {
      datasets: [base, delta],
      title: "Current Inventory Catalog coverage",
      unresolvedEvidence: UNMATCHED_INVENTORY_EVIDENCE_DISPOSITION,
    });
    expect(markdown).toContain(
      "Row-weighted coverage: 227 Inventory rows; 106 matched; 121 unsupported",
    );
    expect(markdown).toContain(
      "Reviewed dispositions: 28 Official family-only; 6 No defensible official match.",
    );
    expect(markdown.match(/\| Official family-only \|/g)).toHaveLength(28);
    expect(markdown.match(/\| No defensible official match \|/g)).toHaveLength(
      6,
    );
    const evidenceValues = Object.values(
      UNMATCHED_INVENTORY_EVIDENCE_DISPOSITION,
    );
    expect(Object.keys(UNMATCHED_INVENTORY_EVIDENCE_DISPOSITION)).toHaveLength(
      34,
    );
    expect(
      evidenceValues.filter((value) => value === "official_family_only"),
    ).toHaveLength(28);
    expect(
      evidenceValues.filter(
        (value) => value === "no_defensible_official_match",
      ),
    ).toHaveLength(6);
    for (const serial of workbook.rows
      .map((row) => row.candidate.serial)
      .filter((serial): serial is string =>
        Boolean(serial && serial.length >= 8),
      ))
      expect(markdown).not.toContain(serial);
  });

  it("rejects conflicting identities, source content, models, canonical models, and aliases", async () => {
    const base = CatalogSeedManifestSchema.parse(
      JSON.parse(
        await readFile(
          new URL(
            "../catalog-data/inventory-variants.2026-09-23.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    const withConflict = (mutate: (manifest: CatalogSeedManifest) => void) => {
      const copy = structuredClone(base);
      mutate(copy);
      copy.checksum = catalogManifestChecksum(copy);
      return copy;
    };
    expect(() =>
      composeCatalogManifests([
        base,
        withConflict((manifest) => {
          manifest.manufacturers[0]!.name = "Different Huebsch";
        }),
      ]),
    ).toThrow("manufacturer identity");
    expect(() =>
      composeCatalogManifests([
        base,
        withConflict((manifest) => {
          manifest.manufacturers[1]!.name = "Other Manufacturer";
          manifest.manufacturers[1]!.aliases = ["Huebsch"];
        }),
      ]),
    ).toThrow("manufacturer identity");
    expect(() =>
      composeCatalogManifests([
        base,
        withConflict((manifest) => {
          manifest.manufacturers[1]!.name = "Huebsch";
          manifest.manufacturers[1]!.aliases = [];
        }),
      ]),
    ).toThrow("manufacturer identity");
    expect(() =>
      composeCatalogManifests([
        base,
        withConflict((manifest) => {
          manifest.manufacturers[0]!.sources[0]!.title = "Changed source";
        }),
      ]),
    ).toThrow("source content");
    expect(() =>
      composeCatalogManifests([
        base,
        withConflict((manifest) => {
          manifest.manufacturers[0]!.models[0]!.model = "OTHER";
        }),
      ]),
    ).toThrow("model content");
    expect(() =>
      composeCatalogManifests([
        base,
        withConflict((manifest) => {
          manifest.manufacturers[0]!.models[0]!.id = "another-id";
        }),
      ]),
    ).toThrow("normalized canonical model");
    expect(() =>
      composeCatalogManifests([
        base,
        withConflict((manifest) => {
          const duplicate = structuredClone(
            manifest.manufacturers[0]!.models[0]!,
          );
          duplicate.id = "another-alias-id";
          duplicate.model = "UNIQUE-MODEL";
          duplicate.revision.id = "another-alias-revision";
          duplicate.aliases = ["HFNKCASG115TW01"];
          manifest.manufacturers[0]!.models.push(duplicate);
        }),
      ]),
    ).toThrow("normalized alias");
    expect(() => {
      const tampered = structuredClone(base);
      tampered.manufacturers[0]!.models[0]!.model = "TAMPERED";
      composeCatalogManifests([base, tampered]);
    }).toThrow("checksum");
  });

  it("overlays only a strictly higher revision with unchanged model identity", async () => {
    const readManifest = async (file: string) =>
      CatalogSeedManifestSchema.parse(
        JSON.parse(
          await readFile(
            new URL(`../catalog-data/${file}`, import.meta.url),
            "utf8",
          ),
        ),
      );
    const base = await readManifest("official-models.2026-09-23.json");
    const enrichment = await readManifest(
      "spec-enrichment-speedqueen-maytag.2026-09-23.json",
    );
    const composed = composeCatalogManifests([base, enrichment]);
    const enriched = composed.manufacturers
      .find((manufacturer) => manufacturer.id === "speed-queen")
      ?.models.find((model) => model.id === "speed-queen-sct040");
    expect(enriched).toMatchObject({
      id: "speed-queen-sct040",
      revision: {
        revision: 2,
        specs: { widthIn: 30.6, capacityLb: 40 },
      },
    });
    expect(
      composed.manufacturers
        .find((manufacturer) => manufacturer.id === "speed-queen")
        ?.models.filter((model) => model.id === "speed-queen-sct040"),
    ).toHaveLength(1);

    const conflictingIdentity = structuredClone(enrichment);
    conflictingIdentity.manufacturers[0]!.models[0]!.family =
      "Different family";
    conflictingIdentity.checksum = catalogManifestChecksum(conflictingIdentity);
    expect(() => composeCatalogManifests([base, conflictingIdentity])).toThrow(
      "model content",
    );

    const conflictingRevision = structuredClone(enrichment);
    conflictingRevision.manufacturers[0]!.models[0]!.revision.revision = 1;
    conflictingRevision.manufacturers[0]!.models[0]!.revision.specs.widthIn = 31;
    conflictingRevision.checksum = catalogManifestChecksum(conflictingRevision);
    expect(() => composeCatalogManifests([base, conflictingRevision])).toThrow(
      "model content",
    );
  });

  it("keeps composed dataset IDs bounded and order-sensitive for long sequences", async () => {
    const base = CatalogSeedManifestSchema.parse(
      JSON.parse(
        await readFile(
          new URL(
            "../catalog-data/official-models.2026-09-23.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    const manifests = Array.from({ length: 8 }, (_, index) => {
      const manifest = structuredClone(base);
      manifest.datasetId = `reviewed-catalog-sequence-${"x".repeat(70)}-${index}`;
      manifest.checksum = catalogManifestChecksum(manifest);
      return manifest;
    });

    const composed = composeCatalogManifests(manifests);
    expect(composed.datasetId).toMatch(
      /^catalog-reviewed-catalog-sequence-[a-z0-9-]+-composite-[a-f0-9]{64}$/,
    );
    expect(composed.datasetId.length).toBeLessThanOrEqual(160);
    expect(
      composeCatalogManifests([...manifests].reverse()).datasetId,
    ).not.toBe(composed.datasetId);
  });
});
