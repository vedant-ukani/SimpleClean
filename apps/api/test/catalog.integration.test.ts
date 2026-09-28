import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@laundrorama/config";
import type {
  CatalogSeedManifest,
  IdentityUser,
} from "@laundrorama/contracts";
import {
  CATALOG_SPECIFICATION_ENRICHMENT_FIELDS,
  missingCatalogSpecificationFields,
} from "@laundrorama/contracts";
import type { DatabaseConnection } from "@laundrorama/database";
import { createTestEnvironment } from "@laundrorama/test-support";
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module.js";
import { runCatalogBackfill } from "../src/catalog-backfill.js";
import { CANONICAL_CATALOG_DATASET_FILES } from "../src/modules/catalog/catalog.coverage.js";
import {
  CATALOG_DISCOVERY_PROVIDER,
  CatalogService,
  catalogManifestChecksum,
} from "../src/modules/catalog/catalog.service.js";
import type { FakeCatalogDiscoveryProvider } from "../src/modules/catalog/discovery/fake-catalog-discovery.adapter.js";
import { CatalogDiscoveryProviderError } from "../src/modules/catalog/discovery/catalog-discovery.provider.js";
import { CatalogEnrichmentService } from "../src/modules/inventory/catalog-enrichment.service.js";
import { IdentityService } from "../src/modules/identity/identity.service.js";
import { InventoryService } from "../src/modules/inventory/inventory.service.js";
import { InventoryRepository } from "../src/modules/inventory/inventory.repository.js";
import { IntakeService } from "../src/modules/inventory/intake/intake.service.js";
import { IntakeRepository } from "../src/modules/inventory/intake/intake.repository.js";
import { DATABASE_CONNECTION } from "../src/platform/database.module.js";

let app: INestApplication;
function rows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  return value && typeof value === "object" && "rows" in value
    ? rows((value as { rows: unknown }).rows)
    : [];
}
const reader: IdentityUser = {
  id: "catalog-reader",
  name: "Reader",
  email: "reader@example.test",
  role: "owner_admin",
  active: true,
  version: 1,
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
};
afterEach(async () => {
  if (app) await app.close();
});

function snapshot(revision = 1): CatalogSeedManifest {
  const manifest: CatalogSeedManifest = {
    datasetId: `test-${revision}`,
    snapshotDate: "2026-09-23",
    checksum: "a".repeat(64),
    manufacturers: [
      {
        id: "test-manufacturer",
        name: "Test Manufacturer",
        aliases: ["TestMaker"],
        sources: [
          {
            id: `test-source-${revision}`,
            title: "Official test document",
            url: "https://example.test/official",
            retrievedAt: "2026-09-23T00:00:00.000Z",
            documentRevision: String(revision),
            checksum: "b".repeat(64),
          },
        ],
        models: [
          {
            id: "test-model",
            family: "Test washers",
            model: "TEST-30",
            aliases: ["TEST 30"],
            equipmentClass: "washer",
            serialRules: [],
            revision: {
              id: `test-revision-${revision}`,
              revision,
              approvedAt: "2026-09-23T00:00:00.000Z",
              productionStartYear: null,
              productionEndYear: null,
              specs: {
                widthIn: 30 + revision,
                depthIn: null,
                heightIn: null,
                weightLb: null,
                capacityLb: null,
                voltage: [],
                phase: [],
                fuel: [],
                configuration: [],
              },
              evidence: [
                {
                  field: "widthIn",
                  sourceId: `test-source-${revision}`,
                  locator: "Dimensions table",
                  officialValue: String(30 + revision),
                  officialUnit: "in",
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const model = manifest.manufacturers[0]!.models[0]!;
  model.revision.evidence.push(
    ...(["model", "equipmentClass"] as const).map((field) => ({
      field,
      sourceId: `test-source-${revision}`,
      locator: "Model heading",
      officialValue: field === "model" ? model.model : model.equipmentClass,
      officialUnit: null,
    })),
  );
  manifest.checksum = catalogManifestChecksum(manifest);
  return manifest;
}

async function setup(overrides: Record<string, string | undefined> = {}) {
  const module = await Test.createTestingModule({
    imports: [
      AppModule.register(
        parseServerEnvironment(createTestEnvironment(overrides)),
      ),
    ],
  }).compile();
  const connection = module.get<DatabaseConnection>(DATABASE_CONNECTION);
  await connection.migrate();
  app = module.createNestApplication({ bodyParser: false });
  await app.init();
  return { catalog: app.get(CatalogService), connection };
}

describe("Catalog persistence and Machine enrichment", () => {
  it("enriches only missing fields of an exact approved revision through runtime discovery", async () => {
    const { catalog } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
    });
    await catalog.importManifest(snapshot());
    const before = (
      await catalog.resolveModel({
        manufacturer: "TestMaker",
        model: "TEST 30",
      })
    ).detail!;
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const original = provider.discover.bind(provider);
    const requests: Parameters<typeof provider.discover>[0][] = [];
    vi.spyOn(provider, "discover").mockImplementation(async (request) => {
      requests.push(request);
      return original(request);
    });

    const result = await catalog.requestDiscovery(
      { manufacturer: "TestMaker", model: "TEST 30" },
      { requestId: "runtime-exact-partial" },
    );
    expect(requests).toEqual([
      {
        manufacturer: "Test Manufacturer",
        model: "TEST-30",
        equipmentClass: "washer",
        requestedFields: [...CATALOG_SPECIFICATION_ENRICHMENT_FIELDS]
          .filter((field) => field !== "widthIn")
          .sort(),
      },
    ]);
    expect(result).toMatchObject({
      status: "verified",
      revision: {
        modelId: before.modelId,
        revision: 2,
        specs: { widthIn: 31, capacityLb: 40 },
      },
      discoveryRun: {
        status: "published",
        operation: "specification_enrichment",
      },
    });
    expect(result.revision?.revisionId).not.toBe(before.revisionId);
    expect(result.revision?.specs.widthIn).toBe(before.specs.widthIn);
    for (const priorEvidence of before.evidence)
      expect(result.revision?.evidence).toContainEqual(priorEvidence);
    expect(missingCatalogSpecificationFields(result.revision!)).toContain(
      "depthIn",
    );
  });

  it("returns a complete exact revision without calling discovery", async () => {
    const { catalog } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
    });
    const manifest = snapshot();
    const model = manifest.manufacturers[0]!.models[0]!;
    model.revision.specs = {
      widthIn: 31,
      depthIn: 35,
      heightIn: 45,
      weightLb: 500,
      capacityLb: 30,
      voltage: ["208V"],
      phase: ["single_phase"],
      fuel: ["electric"],
      configuration: ["front load"],
    };
    model.revision.productionStartYear = 2020;
    model.revision.productionEndYear = 2024;
    for (const [field, officialValue, officialUnit] of [
      ["depthIn", "35", "in"],
      ["heightIn", "45", "in"],
      ["weightLb", "500", "lb"],
      ["capacityLb", "30", "lb"],
      ["voltage", "208V", null],
      ["phase", "single_phase", null],
      ["fuel", "electric", null],
      ["configuration", "front load", null],
      ["productionStartYear", "2020", null],
      ["productionEndYear", "2024", null],
    ] as const)
      model.revision.evidence.push({
        field,
        sourceId: "test-source-1",
        locator: "Complete specifications table",
        officialValue,
        officialUnit,
      });
    manifest.checksum = catalogManifestChecksum(manifest);
    await catalog.importManifest(manifest);
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );

    const result = await catalog.requestDiscovery(
      { manufacturer: "TestMaker", model: "TEST-30" },
      { requestId: "runtime-exact-complete" },
    );
    expect(result).toMatchObject({
      status: "verified",
      revision: { revisionId: "test-revision-1" },
    });
    expect(missingCatalogSpecificationFields(result.revision!)).toEqual([]);
    expect(provider.calls).toBe(0);
  });

  it("keeps an exact partial revision visible and reuses a no-result enrichment", async () => {
    const { catalog, connection } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
    });
    await catalog.importManifest(snapshot());
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const original = provider.discover.bind(provider);
    vi.spyOn(provider, "discover").mockImplementation(async (request) => {
      const response = await original(request);
      return {
        ...response,
        result: {
          ...response.result,
          fields: [],
          productionStartYear: null,
          productionEndYear: null,
          productionEvidence: [],
        },
      };
    });
    const identity = { manufacturer: "TestMaker", model: "TEST 30" };
    const first = await catalog.requestDiscovery(identity, {
      requestId: "runtime-no-result-first",
    });
    const second = await catalog.requestDiscovery(identity, {
      requestId: "runtime-no-result-second",
    });
    const read = await catalog.enrichmentForIdentity(identity);
    for (const result of [first, second, read])
      expect(result).toMatchObject({
        status: "verified",
        revision: { revisionId: "test-revision-1", specs: { widthIn: 31 } },
      });
    expect(first.discoveryRun).toMatchObject({
      status: "no_result",
      operation: "specification_enrichment",
    });
    expect(second.discoveryRun?.id).toBe(first.discoveryRun?.id);
    expect(provider.calls).toBe(1);
    expect(
      rows(
        await connection.database.execute(sql`
      select status from catalog_discovery_run
    `),
      ),
    ).toEqual([{ status: "no_result" }]);
  });

  it("keeps an exact partial revision when automatic discovery is disabled", async () => {
    const { catalog } = await setup({
      CATALOG_DISCOVERY_ENABLED: "false",
      CATALOG_DISCOVERY_PROVIDER: "fake",
    });
    await catalog.importManifest(snapshot());
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );

    const result = await catalog.requestDiscovery(
      { manufacturer: "TestMaker", model: "TEST 30" },
      { requestId: "runtime-disabled-partial" },
    );
    expect(result).toMatchObject({
      status: "verified",
      revision: { revisionId: "test-revision-1" },
    });
    expect(provider.calls).toBe(0);
    await expect(
      catalog.requestSpecificationEnrichment("test-model", {
        requestId: "operator-disabled-partial",
      }),
    ).rejects.toMatchObject({ code: "invalid_configuration" });
  });

  it("does not fill an exact variant from a related but non-leading model", async () => {
    const { catalog } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
    });
    await catalog.importManifest(snapshot());
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const original = provider.discover.bind(provider);
    vi.spyOn(provider, "discover").mockImplementation(async (request) => {
      const response = await original(request);
      return {
        ...response,
        result: { ...response.result, model: "T-600" },
      };
    });

    const result = await catalog.requestDiscovery(
      { manufacturer: "TestMaker", model: "TEST-30" },
      { requestId: "runtime-related-series-rejected" },
    );
    expect(result).toMatchObject({
      status: "verified",
      revision: { revisionId: "test-revision-1", specs: { capacityLb: null } },
      discoveryRun: { status: "no_result" },
    });
    expect(provider.calls).toBe(1);
    expect(
      (
        await catalog.resolveModel({
          manufacturer: "TestMaker",
          model: "TEST-30",
        })
      ).detail?.revisionId,
    ).toBe("test-revision-1");
  });

  it("links an exact partial Machine before retrying a failed enrichment", async () => {
    const { catalog, connection } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
    });
    await catalog.importManifest(snapshot());
    const worker = await app.get(IdentityService).provisionUser(
      {
        name: "Catalog worker",
        email: "catalog-worker@example.test",
        password: "secure-test-password",
        role: "warehouse",
      },
      { requestId: "partial-machine-worker" },
    );
    const inventory = app.get(InventoryService);
    const load = await inventory.createLoad(
      { displayName: "Partial Catalog load" },
      {
        actorUserId: worker.id,
        requestId: "partial-machine-load",
        idempotencyKey: "partial-machine-load",
      },
    );
    const machine = await inventory.createMachine(
      {
        sourceLoadId: load.id,
        machineType: "washer",
        manufacturer: "TestMaker",
        model: "TEST 30",
      },
      {
        actorUserId: worker.id,
        requestId: "partial-machine-create",
        idempotencyKey: "partial-machine-create",
      },
    );
    const event = {
      id: "partial-machine-event",
      eventType: "inventory.machine.created" as const,
      targetType: "machine" as const,
      targetId: machine.id,
      actorKind: "system" as const,
      actorUserId: null,
      requestId: "partial-machine-event",
      summary: { changedFields: ["identity"], outcome: "created" },
    };
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const original = provider.discover.bind(provider);
    vi.spyOn(provider, "discover")
      .mockRejectedValueOnce(
        new CatalogDiscoveryProviderError("timeout", "Safe timeout"),
      )
      .mockImplementation(original);
    const handler = app.get(CatalogEnrichmentService);

    await expect(handler.handle(event)).rejects.toThrow("Safe timeout");
    expect(
      (await catalog.currentMachineResolution(machine.id))?.revisionId,
    ).toBe("test-revision-1");
    const callsBeforeRead = vi.mocked(provider.discover).mock.calls.length;
    expect(
      (await inventory.getMachine(machine.id)).catalog?.revision?.revisionId,
    ).toBe("test-revision-1");
    expect(vi.mocked(provider.discover).mock.calls).toHaveLength(
      callsBeforeRead,
    );
    expect(
      rows(
        await connection.database.execute(sql`
      select status, attempt_count from catalog_discovery_run
    `),
      ),
    ).toEqual([{ status: "retryable_failure", attempt_count: 1 }]);
    const secondMachine = await inventory.createMachine(
      {
        sourceLoadId: load.id,
        machineType: "washer",
        manufacturer: "TestMaker",
        model: "TEST 30",
      },
      {
        actorUserId: worker.id,
        requestId: "partial-machine-create-second",
        idempotencyKey: "partial-machine-create-second",
      },
    );
    await handler.handle({
      ...event,
      id: "partial-machine-event-second",
      targetId: secondMachine.id,
      requestId: "partial-machine-event-second",
    });
    const newest = (
      await catalog.resolveModel({
        manufacturer: "TestMaker",
        model: "TEST 30",
      })
    ).detail;
    expect(newest).toMatchObject({ revision: 2, specs: { capacityLb: 40 } });
    expect(
      (await catalog.currentMachineResolution(secondMachine.id))?.revisionId,
    ).toBe(newest?.revisionId);
    expect(
      rows(
        await connection.database.execute(sql`
      select status, attempt_count from catalog_discovery_run
    `),
      ),
    ).toEqual([{ status: "published", attempt_count: 2 }]);
    await handler.handle(event);
    expect(
      (await catalog.currentMachineResolution(machine.id))?.revisionId,
    ).toBe("test-revision-1");
  });

  it("imports reviewed aliases idempotently, enriches known WCVD, and discovers an unknown approved-alias model", async () => {
    const { catalog } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
    });
    for (const file of CANONICAL_CATALOG_DATASET_FILES) {
      const manifest = JSON.parse(
        await readFile(
          new URL(`../catalog-data/${file}`, import.meta.url),
          "utf8",
        ),
      );
      expect((await catalog.importManifest(manifest)).imported).toBe(true);
    }
    const delta = JSON.parse(
      await readFile(
        new URL(
          "../catalog-data/manufacturer-aliases.2026-09-24.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect((await catalog.importManifest(delta)).imported).toBe(false);
    const additionalAliases = JSON.parse(
      await readFile(
        new URL(
          "../catalog-data/manufacturer-aliases-app-audit.2026-09-24.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect((await catalog.importManifest(additionalAliases)).imported).toBe(
      false,
    );
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const known = await catalog.requestDiscovery(
      { manufacturer: "DEXTER LAUNDRY, INC", model: "WCVD40KCS-12" },
      { requestId: "known-reviewed-label" },
    );
    expect(known).toMatchObject({
      status: "verified",
      revision: { manufacturer: "Dexter", model: "WCVD40KCS-12" },
    });
    expect(provider.calls).toBe(1);
    const exactNew = await catalog.requestDiscovery(
      { manufacturer: "DEXTER COMPANY", model: "WCVD18KCS-10" },
      { requestId: "official-wcvd18-10" },
    );
    expect(exactNew).toMatchObject({
      status: "verified",
      revision: {
        model: "WCVD18KCS-10",
        specs: { voltage: ["120V/60Hz"], phase: ["single_phase"] },
      },
    });
    for (const [manufacturer, model, baseModel] of [
      ["GIRBAU", "EH020XA1321121011", "EH020"],
      ["GIRBAU INC.", "RMG070X2132111111", "RMG070"],
      ["CONTINENTAL", "RMG040X1132111111", "RMG040"],
    ] as const) {
      expect(
        (await catalog.resolveModel({ manufacturer, model })).result.status,
      ).toBe("unsupported");
      for (const enrichment of [
        await catalog.enrichmentForIdentity({ manufacturer, model }),
        await catalog.requestDiscovery(
          { manufacturer, model },
          { requestId: `approved-base-${baseModel}` },
        ),
      ]) {
        expect(enrichment).toMatchObject({
          status: "verified",
          revision: { manufacturer: "Continental Girbau", model: baseModel },
        });
        expect(enrichment.revision?.specs.capacityLb).not.toBeNull();
      }
    }
    expect(provider.calls).toBe(2);
    const unknown = await catalog.requestDiscovery(
      { manufacturer: "THE DEXTER CO.", model: "WCVD99KCS-12" },
      { requestId: "unknown-reviewed-label" },
    );
    expect(provider.calls).toBe(3);
    expect(unknown).toMatchObject({
      status: "no_verified_specs",
      revision: null,
    });
  });

  it("rejects non-anchored, unofficial, identity-only, and ambiguous documented bases", async () => {
    const { catalog } = await setup();
    const base = snapshot();
    const model = base.manufacturers[0]!.models[0]!;
    model.model = "EH020";
    model.revision.evidence.find(
      (item) => item.field === "model",
    )!.officialValue = "EH020";
    base.checksum = catalogManifestChecksum(base);
    await catalog.importManifest(base);
    expect(
      await catalog.enrichmentForIdentity({
        manufacturer: "TestMaker",
        model: "EH020XA1321121011",
      }),
    ).toMatchObject({ status: "verified", revision: { model: "EH020" } });
    const shorter = snapshot();
    shorter.datasetId = "test-shorter-base";
    shorter.manufacturers[0]!.sources[0]!.id = "shorter-base-source";
    shorter.manufacturers[0]!.models[0]!.id = "shorter-base-model";
    shorter.manufacturers[0]!.models[0]!.revision.id = "shorter-base-revision";
    shorter.manufacturers[0]!.models[0]!.model = "EH02";
    for (const evidence of shorter.manufacturers[0]!.models[0]!.revision
      .evidence) {
      evidence.sourceId = "shorter-base-source";
      if (evidence.field === "model") evidence.officialValue = "EH02";
    }
    shorter.checksum = catalogManifestChecksum(shorter);
    await catalog.importManifest(shorter);
    expect(
      await catalog.enrichmentForIdentity({
        manufacturer: "TestMaker",
        model: "EH020XA1321121011",
      }),
    ).toMatchObject({ status: "verified", revision: { model: "EH020" } });
    expect(
      await catalog.enrichmentForIdentity({
        manufacturer: "TestMaker",
        model: "XEH020XA1321121011",
      }),
    ).toMatchObject({ status: "disabled", revision: null });
    expect(
      await catalog.enrichmentForIdentity({
        manufacturer: "Unknown Maker",
        model: "EH020XA1321121011",
      }),
    ).toMatchObject({ status: "disabled", revision: null });

    const unofficial = snapshot();
    unofficial.datasetId = "test-unofficial";
    unofficial.manufacturers[0]!.sources[0]!.id = "unofficial-source";
    unofficial.manufacturers[0]!.models[0]!.id = "unofficial-model";
    unofficial.manufacturers[0]!.models[0]!.revision.id = "unofficial-revision";
    for (const evidence of unofficial.manufacturers[0]!.models[0]!.revision
      .evidence)
      evidence.sourceId = "unofficial-source";
    unofficial.manufacturers[0]!.models[0]!.model = "RMG070";
    unofficial.manufacturers[0]!.models[0]!.revision.evidence.find(
      (item) => item.field === "model",
    )!.officialValue = "RMG070";
    unofficial.manufacturers[0]!.sources[0]!.sourceClass = "third_party";
    unofficial.checksum = catalogManifestChecksum(unofficial);
    await catalog.importManifest(unofficial);
    expect(
      await catalog.enrichmentForIdentity({
        manufacturer: "TestMaker",
        model: "RMG070X2132111111",
      }),
    ).toMatchObject({ status: "disabled", revision: null });

    const mismatchedEvidence = snapshot();
    mismatchedEvidence.datasetId = "test-mismatched-model-evidence";
    mismatchedEvidence.manufacturers[0]!.sources[0]!.id =
      "mismatched-evidence-source";
    mismatchedEvidence.manufacturers[0]!.models[0]!.id =
      "mismatched-evidence-model";
    mismatchedEvidence.manufacturers[0]!.models[0]!.revision.id =
      "mismatched-evidence-revision";
    mismatchedEvidence.manufacturers[0]!.models[0]!.model = "RMG055";
    for (const evidence of mismatchedEvidence.manufacturers[0]!.models[0]!
      .revision.evidence) {
      evidence.sourceId = "mismatched-evidence-source";
      if (evidence.field === "model") evidence.officialValue = "RMG070";
    }
    mismatchedEvidence.checksum = catalogManifestChecksum(mismatchedEvidence);
    await catalog.importManifest(mismatchedEvidence);
    expect(
      await catalog.enrichmentForIdentity({
        manufacturer: "TestMaker",
        model: "RMG055X1132111111",
      }),
    ).toMatchObject({ status: "disabled", revision: null });

    const identityOnly = snapshot();
    identityOnly.datasetId = "test-identity-only";
    identityOnly.manufacturers[0]!.sources[0]!.id = "identity-only-source";
    identityOnly.manufacturers[0]!.models[0]!.id = "identity-only-model";
    identityOnly.manufacturers[0]!.models[0]!.revision.id =
      "identity-only-revision";
    for (const evidence of identityOnly.manufacturers[0]!.models[0]!.revision
      .evidence)
      evidence.sourceId = "identity-only-source";
    identityOnly.manufacturers[0]!.models[0]!.model = "DL2X30";
    identityOnly.manufacturers[0]!.models[0]!.revision.evidence.find(
      (item) => item.field === "model",
    )!.officialValue = "DL2X30";
    identityOnly.manufacturers[0]!.models[0]!.revision.specs.widthIn = null;
    identityOnly.manufacturers[0]!.models[0]!.revision.evidence =
      identityOnly.manufacturers[0]!.models[0]!.revision.evidence.filter(
        (item) => item.field !== "widthIn",
      );
    identityOnly.checksum = catalogManifestChecksum(identityOnly);
    await catalog.importManifest(identityOnly);
    expect(
      await catalog.enrichmentForIdentity({
        manufacturer: "TestMaker",
        model: "DL2X30QA",
      }),
    ).toMatchObject({ status: "disabled", revision: null });

    const tied = snapshot();
    tied.datasetId = "test-ambiguous-base";
    tied.manufacturers[0]!.sources[0]!.id = "ambiguous-source";
    tied.manufacturers[0]!.models[0]!.id = "first-rmg040";
    tied.manufacturers[0]!.models[0]!.revision.id = "first-rmg040-revision";
    for (const evidence of tied.manufacturers[0]!.models[0]!.revision.evidence)
      evidence.sourceId = "ambiguous-source";
    tied.manufacturers[0]!.models[0]!.model = "RMG040";
    tied.manufacturers[0]!.models[0]!.revision.evidence.find(
      (item) => item.field === "model",
    )!.officialValue = "RMG040";
    const duplicate = structuredClone(tied.manufacturers[0]!.models[0]!);
    duplicate.id = "second-rmg040";
    duplicate.revision.id = "second-rmg040-revision";
    tied.manufacturers[0]!.models.push(duplicate);
    tied.checksum = catalogManifestChecksum(tied);
    await catalog.importManifest(tied);
    expect(
      await catalog.requestDiscovery(
        { manufacturer: "TestMaker", model: "RMG040X1132111111" },
        { requestId: "ambiguous-documented-base" },
      ),
    ).toMatchObject({ status: "no_verified_specs", revision: null });
  });
  it("imports the reviewed second pass idempotently with source classes and complete evidence", async () => {
    const { catalog, connection } = await setup();
    const reviewedFiles = CANONICAL_CATALOG_DATASET_FILES.slice(
      0,
      CANONICAL_CATALOG_DATASET_FILES.indexOf(
        "reviewed-enrichment.2026-09-24.json",
      ) + 1,
    );
    for (const file of reviewedFiles) {
      const manifest = JSON.parse(
        await readFile(
          new URL(`../catalog-data/${file}`, import.meta.url),
          "utf8",
        ),
      );
      expect((await catalog.importManifest(manifest)).imported).toBe(true);
    }
    const reviewed = JSON.parse(
      await readFile(
        new URL(
          "../catalog-data/reviewed-enrichment.2026-09-24.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect((await catalog.importManifest(reviewed)).imported).toBe(false);
    expect((await catalog.list({}, reader)).total).toBe(299);
    for (const [manufacturer, model, field, expected] of [
      ["Dexter", "WCVD18KCS-12", "widthIn", 26],
      ["Continental Girbau", "KWN", "capacityLb", 16],
      ["Speed Queen", "STT55", "capacityLb", 55],
      ["Maytag Commercial", "MDE28", "capacityLb", 23.1],
      ["Electrolux Professional", "WH6-8", "capacityLb", 18],
    ] as const) {
      const resolved = await catalog.resolveModel({ manufacturer, model });
      expect(resolved.result.status).toBe("exact");
      expect(resolved.detail?.specs[field]).toBe(expected);
      expect(resolved.detail?.publicationMode).toBe("reviewed_snapshot");
    }
    const missingEvidence = await connection.database.execute(sql`
      select count(*)::int as count from catalog_spec_revision revision
      where revision.dataset_id='catalog-reviewed-enrichment-2026-09-24'
        and exists (
          select 1 from jsonb_each(revision.specs) fact
          where fact.key in ('widthIn','depthIn','heightIn','weightLb','capacityLb')
            and fact.value <> 'null'::jsonb
            and not exists (
              select 1 from catalog_field_evidence evidence
              where evidence.revision_id=revision.id and evidence.field=fact.key
            )
        )
    `);
    expect(rows(missingEvidence)[0]?.count).toBe(0);
    const secondary = await connection.database.execute(sql`
      select distinct source_class from catalog_source
      where dataset_id='catalog-reviewed-enrichment-2026-09-24'
      order by source_class
    `);
    expect(rows(secondary).map((row) => row.source_class)).toEqual([
      "distributor",
      "official_manufacturer",
      "reseller",
      "third_party",
    ]);
  });

  it("imports the complete reviewed snapshot twice without duplicating models", async () => {
    const { catalog } = await setup();
    const manifest: unknown = JSON.parse(
      await readFile(
        new URL(
          "../catalog-data/official-models.2026-09-23.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const first = await catalog.importManifest(manifest);
    expect(first).toMatchObject({ imported: true, manufacturers: 6 });
    expect(first.models).toBeGreaterThan(53);
    expect(await catalog.importManifest(manifest)).toEqual({
      ...first,
      imported: false,
    });
    expect((await catalog.list({}, reader)).total).toBe(first.models);
  });

  it("imports the inventory delta idempotently, exposes approved provenance, and preserves pinned revisions", async () => {
    const { catalog } = await setup();
    const base: unknown = JSON.parse(
      await readFile(
        new URL(
          "../catalog-data/official-models.2026-09-23.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const delta: unknown = JSON.parse(
      await readFile(
        new URL(
          "../catalog-data/inventory-variants.2026-09-23.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const baseImport = await catalog.importManifest(base);
    expect(baseImport).toMatchObject({ imported: true, manufacturers: 6 });

    // Pin an existing Machine against the base snapshot before importing the
    // delta. The later import must not replace this historical link.
    const identity = await app.get(IdentityService).provisionUser(
      {
        name: "Catalog delta worker",
        email: "catalog-delta-worker@example.test",
        password: "secure-test-password",
        role: "warehouse",
      },
      { requestId: "catalog-delta-worker" },
    );
    const inventory = app.get(InventoryService);
    const context = {
      actorUserId: identity.id,
      requestId: "catalog-delta-pinning",
      idempotencyKey: "catalog-delta-load",
    };
    const load = await inventory.createLoad(
      { displayName: "Catalog delta load" },
      context,
    );
    const machine = await inventory.createMachine(
      {
        sourceLoadId: load.id,
        machineType: "dryer",
        manufacturer: "Huebsch",
        model: "HTT30",
      },
      { ...context, idempotencyKey: "catalog-delta-machine" },
    );
    const handler = app.get(CatalogEnrichmentService);
    const event = {
      id: "catalog-delta-pinning-event",
      eventType: "inventory.machine.created" as const,
      targetType: "machine" as const,
      targetId: machine.id,
      actorKind: "system" as const,
      actorUserId: null,
      requestId: "catalog-delta-pinning-event",
      summary: { changedFields: ["identity"], outcome: "created" },
    };
    await handler.handle(event);
    const pinned = await catalog.currentMachineResolution(machine.id);
    expect(pinned?.revisionId).toBe("huebsch-htt30-r1");
    const pendingMachine = await inventory.createMachine(
      {
        sourceLoadId: load.id,
        machineType: "washer",
        manufacturer: "Huebsch",
        model: "HFNKCASG115TW01",
      },
      { ...context, idempotencyKey: "catalog-delta-pending-machine" },
    );
    const pendingEvent = {
      ...event,
      id: "catalog-delta-pending-event",
      targetId: pendingMachine.id,
      requestId: "catalog-delta-pending-event",
    };
    await handler.handle(pendingEvent);
    expect(
      (await catalog.currentMachineResolution(pendingMachine.id))?.status,
    ).toBe("unsupported");

    const deltaImport = await catalog.importManifest(delta);
    expect(deltaImport).toEqual({
      imported: true,
      manufacturers: 2,
      models: 2,
    });
    expect(await catalog.importManifest(delta)).toEqual({
      ...deltaImport,
      imported: false,
    });
    expect((await catalog.list({}, reader)).total).toBe(299);
    expect(
      (await catalog.currentMachineResolution(machine.id))?.revisionId,
    ).toBe(pinned?.revisionId);
    const staleRefresh = await catalog.refreshUnresolvedAndLinkMachine(
      pendingMachine.id,
      pendingMachine,
      {
        actorKind: "system",
        requestId: "catalog-delta-stale-refresh",
        identityVersion: pendingMachine.version + 1,
      },
    );
    expect(staleRefresh?.status).toBe("unsupported");
    await handler.handle({
      ...event,
      id: "catalog-delta-import-event",
      eventType: "catalog.snapshot.imported",
      targetType: "catalog_snapshot",
      targetId: "inventory-variants-2026-09-23",
      requestId: "catalog-delta-import-refresh",
    });
    expect(
      (await catalog.currentMachineResolution(pendingMachine.id))?.revisionId,
    ).toBe("huebsch-hfnkcasg115tw01-r1");
    expect(
      (await catalog.currentMachineResolution(machine.id))?.revisionId,
    ).toBe(pinned?.revisionId);

    for (const [manufacturer, model, revisionId, sourceId] of [
      [
        "Huebsch",
        "HFNKCASG115TW01",
        "huebsch-hfnkcasg115tw01-r1",
        "inventory-huebsch-806117",
      ],
      [
        "Maytag",
        "MAH21PDDWW",
        "maytag-commercial-mah21pddww-r1",
        "inventory-maytag-mah21pddww",
      ],
    ] as const) {
      const resolution = await catalog.resolveModel({ manufacturer, model });
      expect(resolution.result).toMatchObject({
        status: "exact",
        matchKind: manufacturer === "Maytag" ? "alias" : "canonical",
        revisionId,
        equipmentClass: "washer",
      });
      expect(resolution.detail).toMatchObject({
        revisionId,
        sources: [{ id: sourceId }],
        evidence: expect.arrayContaining([
          expect.objectContaining({ field: "model", sourceId }),
          expect.objectContaining({ field: "equipmentClass", sourceId }),
        ]),
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
      });
    }
  });
  it("imports atomically, retains version history, and restricts reads to approved revisions", async () => {
    const { catalog, connection } = await setup();
    expect(await catalog.importManifest(snapshot())).toMatchObject({
      imported: true,
    });
    expect(await catalog.importManifest(snapshot())).toMatchObject({
      imported: false,
    });
    const changed = snapshot();
    changed.manufacturers[0]!.models[0]!.revision.specs.widthIn = 90;
    changed.checksum = catalogManifestChecksum(changed);
    await expect(catalog.importManifest(changed)).rejects.toThrow(
      "different content",
    );
    await catalog.importManifest(snapshot(2));
    expect(
      (
        await catalog.resolveModel({
          manufacturer: "TestMaker",
          model: "TEST 30",
        })
      ).result,
    ).toMatchObject({
      status: "exact",
      revisionId: "test-revision-2",
      matchKind: "alias",
    });
    expect((await catalog.list({}, reader)).total).toBe(1);
    expect(() => catalog.list({}, { ...reader, active: false })).toThrow();
    await expect(
      catalog.detail("test-revision-1", { ...reader, active: false }),
    ).rejects.toThrow();
    await expect(catalog.detail("a".repeat(161), reader)).rejects.toThrow(
      "Invalid Catalog revision ID",
    );
    expect(
      (await catalog.detail("test-revision-1", reader)).sources.map(
        (source) => source.id,
      ),
    ).toEqual(["test-source-1"]);
    await connection.database.execute(
      sql`update catalog_spec_revision set status='proposed' where id='test-revision-2'`,
    );
    expect(
      (
        await catalog.resolveModel({
          manufacturer: "Test Manufacturer",
          model: "TEST-30",
        })
      ).result.revisionId,
    ).toBe("test-revision-1");
    await expect(catalog.detail("test-revision-2", reader)).rejects.toThrow(
      "not found",
    );
    await request(app.getHttpServer()).get("/catalog/models").expect(401);
  });

  it("pins event resolutions across imports and redelivery, re-resolves identity, and audits actual overrides", async () => {
    const { catalog, connection } = await setup();
    await catalog.importManifest(snapshot());
    const identity = await app.get(IdentityService).provisionUser(
      {
        name: "Worker",
        email: "worker@example.test",
        password: "secure-test-password",
        role: "warehouse",
      },
      { requestId: "catalog-worker" },
    );
    const context = {
      actorUserId: identity.id,
      requestId: "catalog-test",
      idempotencyKey: "catalog-load-key",
    };
    const inventory = app.get(InventoryService);
    const load = await inventory.createLoad(
      { displayName: "Catalog test load" },
      context,
    );
    const machine = await inventory.createMachine(
      {
        sourceLoadId: load.id,
        machineType: "washer",
        manufacturer: "Test Manufacturer",
        model: "TEST-30",
        capacityLb: 40,
      },
      { ...context, idempotencyKey: "catalog-machine-key" },
    );
    const handler = app.get(CatalogEnrichmentService);
    const event = {
      id: "catalog-event",
      eventType: "inventory.machine.created" as const,
      targetType: "machine" as const,
      targetId: machine.id,
      actorKind: "system" as const,
      actorUserId: null,
      requestId: "event-request",
      summary: { changedFields: ["identity"], outcome: "created" },
    };
    const machineRepository = app.get(InventoryRepository);
    const storedMachine = await machineRepository.findMachine(machine.id);
    expect(storedMachine).toBeDefined();
    const findMachine = vi
      .spyOn(machineRepository, "findMachine")
      .mockResolvedValueOnce(storedMachine)
      .mockResolvedValueOnce({
        ...storedMachine!,
        model: "IDENTITY-CHANGED-DURING-DISCOVERY",
        version: storedMachine!.version + 1,
      });
    const staleLink = vi.spyOn(catalog, "resolveAndLinkMachine");
    await handler.handle(event);
    expect(staleLink).not.toHaveBeenCalled();
    findMachine.mockRestore();
    staleLink.mockRestore();
    await handler.handle(event);
    await catalog.importManifest(snapshot(2));
    await connection.database.execute(
      sql`update catalog_spec_revision set status='superseded' where id='test-revision-1'`,
    );
    await handler.handle(event);
    expect((await inventory.getMachine(machine.id)).catalog).toMatchObject({
      revision: { revisionId: "test-revision-1" },
      effectiveSpecs: {
        widthIn: { value: 31, source: "catalog" },
        capacityLb: { value: 40, source: "machine" },
      },
    });
    const updated = await inventory.updateActualSpecs(
      machine.id,
      { expectedVersion: 0, widthIn: 36 },
      identity,
      context,
    );
    expect(updated.catalog).toMatchObject({
      actualSpecs: { widthIn: 36, version: 1 },
      effectiveSpecs: { widthIn: { value: 36, source: "actual" } },
    });
    await expect(
      inventory.updateActualSpecs(
        machine.id,
        { expectedVersion: 0, widthIn: 37 },
        identity,
        context,
      ),
    ).rejects.toThrow("another request");
    await expect(
      inventory.updateActualSpecs(
        machine.id,
        { expectedVersion: 1, widthIn: 37 },
        { ...identity, role: "technician_cleaner" },
        context,
      ),
    ).rejects.toThrow();
    await inventory.updateMachineIdentity(
      machine.id,
      { expectedVersion: 1, model: "UNSUPPORTED" },
      context,
    );
    expect((await inventory.getMachine(machine.id)).catalog).toMatchObject({
      pendingIdentityResolution: true,
      revision: null,
      effectiveSpecs: { widthIn: { value: 36, source: "actual" } },
    });
    await handler.handle({
      ...event,
      eventType: "inventory.machine.identity_updated",
    });
    expect((await inventory.getMachine(machine.id)).catalog).toMatchObject({
      status: "unsupported",
      revision: null,
      effectiveSpecs: { widthIn: { value: 36, source: "actual" } },
    });
    const audit = await connection.database.execute(
      sql`select action from operations_audit_entry where action='inventory.machine.actual_specs_updated'`,
    );
    expect(audit).toMatchObject({
      rows: [{ action: "inventory.machine.actual_specs_updated" }],
    });
    vi.spyOn(catalog, "currentMachineResolution").mockRejectedValue(
      new Error("Catalog unavailable"),
    );
    expect(
      (
        await inventory.updateActualSpecs(
          machine.id,
          { expectedVersion: 1, widthIn: 37 },
          identity,
          context,
        )
      ).catalog,
    ).toMatchObject({
      resolutionId: null,
      pendingIdentityResolution: true,
      actualSpecs: { widthIn: 37, version: 2 },
      effectiveSpecs: { widthIn: { value: 37, source: "actual" } },
    });

    const intake = app.get(IntakeService);
    const batch = await intake.create(load.id, { loadId: load.id }, identity, {
      ...context,
      idempotencyKey: "catalog-batch-key",
    });
    const candidateDetail = await intake.createCandidate(
      batch.id,
      { expectedVersion: batch.version },
      identity,
      { ...context, idempotencyKey: "catalog-candidate-key" },
    );
    const candidate = candidateDetail.candidates[0]!;
    await connection.database.execute(
      sql`update inventory_intake_candidate set manufacturer='Test Manufacturer', model='TEST-30' where id=${candidate.id}`,
    );
    const resolveSpy = vi.spyOn(catalog, "resolveModel");
    const pending = await intake.get(batch.id, identity);
    expect(pending.candidates[0]?.catalogTypeSuggestion).toBeUndefined();
    expect(resolveSpy).not.toHaveBeenCalled();
    const readSpy = vi.spyOn(app.get(IntakeRepository), "find");
    const readyDetail = {
      ...candidateDetail,
      candidates: [
        {
          ...candidate,
          state: "confirmed" as const,
          confirmationSource: "recognition" as const,
          manufacturer: "Test Manufacturer",
          model: "TEST-30",
        },
      ],
      items: [
        {
          candidateId: candidate.id,
          photoId: candidate.id,
          fileId: candidate.id,
          machineType: null,
          candidateState: "confirmed" as const,
          candidateRevision: 1,
          latestRunId: candidate.id,
          latestRunState: "ready" as const,
          machineId: null,
        },
      ],
    };
    for (const latestRunState of [
      "queued",
      "running",
      "failed",
      "stale",
      "manual",
      "needs_recapture",
    ] as const) {
      readSpy.mockResolvedValue({
        ...readyDetail,
        items: [{ ...readyDetail.items[0]!, latestRunState }],
      });
      expect(
        (await intake.get(batch.id, identity)).candidates[0]
          ?.catalogTypeSuggestion,
      ).toBeUndefined();
    }
    expect(resolveSpy).not.toHaveBeenCalled();
    readSpy.mockResolvedValue(readyDetail);
    const suggested = await intake.get(batch.id, identity);
    expect(suggested.candidates[0]).toMatchObject({
      machineType: null,
      catalogTypeSuggestion: {
        equipmentClass: "washer",
        machineType: "washer",
        revisionId: "test-revision-2",
      },
    });
    vi.spyOn(catalog, "resolveModel").mockRejectedValue(
      new Error("Catalog unavailable"),
    );
    const unavailable = await intake.get(batch.id, identity);
    expect(unavailable.candidates[0]?.machineType).toBeNull();
    expect(unavailable.candidates[0]?.catalogTypeSuggestion).toBeUndefined();
  });

  it("automatically publishes one official-source discovery run and reuses it across Machines", async () => {
    const { catalog, connection } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
      CATALOG_DISCOVERY_MODEL: "deterministic-catalog-v1",
      CATALOG_DISCOVERY_PRICING_VERSION: "test-pricing-v1",
      CATALOG_DISCOVERY_INPUT_USD_PER_MILLION_TOKENS: "1",
      CATALOG_DISCOVERY_OUTPUT_USD_PER_MILLION_TOKENS: "2",
      CATALOG_DISCOVERY_WEB_SEARCH_USD_PER_CALL: "0.01",
    });
    await catalog.importManifest(snapshot());
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const first = await catalog.requestDiscovery(
      { manufacturer: "TestMaker", model: "NEW-40" },
      { requestId: "discovery-first" },
    );
    expect(first).toMatchObject({
      status: "verified",
      revision: {
        manufacturer: "Test Manufacturer",
        model: "NEW-40",
        publicationMode: "automatic_official_source_policy",
        specs: { widthIn: 30, capacityLb: 40 },
        discoveryRun: {
          status: "published",
          webSearchCallCount: 1,
          pricing: { version: "test-pricing-v1" },
        },
      },
    });
    expect(provider.calls).toBe(1);
    const second = await catalog.requestDiscovery(
      { manufacturer: "Test Manufacturer", model: "NEW-40" },
      { requestId: "discovery-second" },
    );
    expect(second).toMatchObject({
      status: "verified",
      discoveryRun: {
        status: "no_result",
        operation: "specification_enrichment",
      },
    });
    expect(provider.calls).toBe(2);
    await catalog.requestDiscovery(
      { manufacturer: "Test Manufacturer", model: "NEW-40" },
      { requestId: "discovery-third" },
    );
    expect(provider.calls).toBe(2);
    await expect(
      catalog.enrichmentForIdentity({
        manufacturer: "Test Manufacturer",
        model: "NEW-40",
      }),
    ).resolves.toMatchObject({
      status: "verified",
      manufactureDate: {
        kind: "unknown",
        reason: "serial_not_provided",
      },
    });
    expect(
      (
        await catalog.resolveModel({
          manufacturer: "Test Manufacturer",
          model: "NEW-40",
        })
      ).result.status,
    ).toBe("exact");
    const runs = rows(
      await connection.database.execute(
        sql`select status, attempt_count from catalog_discovery_run`,
      ),
    );
    expect(runs).toHaveLength(2);
    expect(runs).toEqual(
      expect.arrayContaining([
        { status: "published", attempt_count: 1 },
        { status: "no_result", attempt_count: 1 },
      ]),
    );
  });

  it("publishes an official base-model family while preserving the full accepted variant", async () => {
    const { catalog, connection } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
      CATALOG_DISCOVERY_MODEL: "deterministic-catalog-v1",
    });
    await catalog.importManifest(snapshot());
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const original = provider.discover.bind(provider);
    vi.spyOn(provider, "discover").mockImplementationOnce(async (request) => {
      const response = await original(request);
      return {
        ...response,
        result: { ...response.result, model: "EH020" },
      };
    });

    await expect(
      catalog.requestDiscovery(
        {
          manufacturer: "Test Manufacturer",
          model: "EH020XA1321121011",
        },
        { requestId: "discovery-leading-base-model" },
      ),
    ).resolves.toMatchObject({
      status: "verified",
      revision: {
        family: "EH020",
        model: "EH020XA1321121011",
      },
    });
    expect(
      rows(
        await connection.database.execute(sql`
          select f.name family, v.model, v.normalized_model, e.official_value
          from catalog_model_variant v
          join catalog_model_family f on f.id=v.family_id
          join catalog_spec_revision r on r.variant_id=v.id
          join catalog_field_evidence e on e.revision_id=r.id and e.field='model'
          where v.normalized_model='EH020XA1321121011'
        `),
      ),
    ).toEqual([
      {
        family: "EH020",
        model: "EH020XA1321121011",
        normalized_model: "EH020XA1321121011",
        official_value: "EH020",
      },
    ]);
  });

  it("does not derive a trusted manufacturer hostname from a third-party source", async () => {
    const { catalog, connection } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
      CATALOG_DISCOVERY_MODEL: "deterministic-catalog-v1",
    });
    const manifest = snapshot();
    manifest.manufacturers[0]!.sources[0]!.sourceClass = "third_party";
    manifest.checksum = catalogManifestChecksum(manifest);
    await catalog.importManifest(manifest);
    await expect(
      catalog.requestDiscovery(
        { manufacturer: "Test Manufacturer", model: "NEW-40" },
        { requestId: "discovery-untrusted-source" },
      ),
    ).resolves.toMatchObject({ status: "no_verified_specs" });
    expect(
      rows(
        await connection.database.execute(
          sql`select source_class from catalog_source`,
        ),
      ),
    ).toEqual([{ source_class: "third_party" }]);
    expect(
      rows(
        await connection.database.execute(
          sql`select id from catalog_discovery_run`,
        ),
      ),
    ).toEqual([]);
  });

  it("reclaims one discovery run after a temporary provider failure", async () => {
    const { catalog, connection } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
      CATALOG_DISCOVERY_MODEL: "deterministic-catalog-v1",
    });
    await catalog.importManifest(snapshot());
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const original = provider.discover.bind(provider);
    vi.spyOn(provider, "discover")
      .mockRejectedValueOnce(
        new CatalogDiscoveryProviderError("timeout", "Safe timeout"),
      )
      .mockImplementation(original);
    await expect(
      catalog.requestDiscovery(
        { manufacturer: "Test Manufacturer", model: "RETRY-40" },
        { requestId: "discovery-timeout" },
      ),
    ).rejects.toThrow("Safe timeout");
    await expect(
      catalog.requestDiscovery(
        { manufacturer: "Test Manufacturer", model: "RETRY-40" },
        { requestId: "discovery-retry" },
      ),
    ).resolves.toMatchObject({ status: "verified" });
    expect(
      rows(
        await connection.database.execute(
          sql`select status, attempt_count from catalog_discovery_run`,
        ),
      ),
    ).toEqual([{ status: "published", attempt_count: 2 }]);
    expect(
      rows(
        await connection.database.execute(sql`
          select safe_summary->>'outcome' outcome
          from operations_audit_entry
          where action='catalog.discovery.completed'
          order by created_at, id
        `),
      ),
    ).toEqual([{ outcome: "retryable_failure" }, { outcome: "published" }]);
  });

  it("enriches an existing variant additively while preserving evidence and Machine pins", async () => {
    const { catalog, connection } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
      CATALOG_DISCOVERY_MODEL: "deterministic-catalog-v1",
    });
    await catalog.importManifest(snapshot());
    const identity = await app.get(IdentityService).provisionUser(
      {
        name: "Backfill worker",
        email: "backfill-worker@example.test",
        password: "secure-test-password",
        role: "warehouse",
      },
      { requestId: "backfill-worker" },
    );
    const inventory = app.get(InventoryService);
    const context = {
      actorUserId: identity.id,
      requestId: "backfill-machine",
      idempotencyKey: "backfill-load",
    };
    const load = await inventory.createLoad(
      { displayName: "Backfill load" },
      context,
    );
    const firstMachine = await inventory.createMachine(
      {
        sourceLoadId: load.id,
        machineType: "washer",
        manufacturer: "Test Manufacturer",
        model: "TEST-30",
      },
      { ...context, idempotencyKey: "backfill-machine-1" },
    );
    const handler = app.get(CatalogEnrichmentService);
    const event = {
      id: "backfill-machine-event-1",
      eventType: "inventory.machine.created" as const,
      targetType: "machine" as const,
      targetId: firstMachine.id,
      actorKind: "system" as const,
      actorUserId: null,
      requestId: "backfill-machine-event-1",
      summary: { changedFields: ["identity"], outcome: "created" },
    };
    await catalog.resolveAndLinkMachine(firstMachine.id, firstMachine, {
      actorKind: "system",
      requestId: "backfill-initial-link",
      identityVersion: firstMachine.version,
    });
    expect(
      (await catalog.currentMachineResolution(firstMachine.id))?.revisionId,
    ).toBe("test-revision-1");

    const preview = await catalog.previewSpecificationBackfill(
      "all",
      new Set(["test-model"]),
      1,
    );
    expect(preview.selected[0]).toMatchObject({
      variantId: "test-model",
      baseRevisionId: "test-revision-1",
      inventoryPriority: true,
      missingFields: expect.arrayContaining(["capacityLb", "depthIn"]),
    });
    const enriched = await catalog.requestSpecificationEnrichment(
      "test-model",
      { requestId: "backfill-enrich" },
    );
    expect(enriched).toMatchObject({
      outcome: "published",
      run: { status: "published", operation: "specification_enrichment" },
      revision: {
        modelId: "test-model",
        revision: 2,
        specs: { widthIn: 31, capacityLb: 40 },
        discoveryRun: { operation: "specification_enrichment" },
      },
    });
    const revisionId = enriched.revision!.revisionId;
    const evidence = rows(
      await connection.database.execute(sql`
        select e.field, e.source_id, s.discovery_run_id
        from catalog_field_evidence e
        join catalog_source s on s.id=e.source_id
        where e.revision_id=${revisionId}
        order by e.field, e.source_id
      `),
    );
    expect(evidence).toEqual(
      expect.arrayContaining([
        {
          field: "widthIn",
          source_id: "test-source-1",
          discovery_run_id: null,
        },
        expect.objectContaining({
          field: "capacityLb",
          discovery_run_id: enriched.run!.id,
        }),
      ]),
    );
    expect(
      (await catalog.currentMachineResolution(firstMachine.id))?.revisionId,
    ).toBe("test-revision-1");

    const secondMachine = await inventory.createMachine(
      {
        sourceLoadId: load.id,
        machineType: "washer",
        manufacturer: "Test Manufacturer",
        model: "TEST-30",
      },
      { ...context, idempotencyKey: "backfill-machine-2" },
    );
    await handler.handle({
      ...event,
      id: "backfill-machine-event-2",
      targetId: secondMachine.id,
      requestId: "backfill-machine-event-2",
    });
    expect(
      (await catalog.currentMachineResolution(secondMachine.id))?.revisionId,
    ).toBe(revisionId);
  });

  it("reuses an enrichment no-result and fences a stale base revision", async () => {
    const { catalog, connection } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
      CATALOG_DISCOVERY_MODEL: "deterministic-catalog-v1",
    });
    await catalog.importManifest(snapshot());
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const original = provider.discover.bind(provider);
    vi.spyOn(provider, "discover").mockImplementationOnce(async (request) => {
      const response = await original(request);
      return {
        ...response,
        result: {
          ...response.result,
          fields: [],
          productionStartYear: null,
          productionEndYear: null,
          productionEvidence: [],
        },
      };
    });
    await expect(
      catalog.requestSpecificationEnrichment("test-model", {
        requestId: "backfill-no-result-1",
      }),
    ).resolves.toMatchObject({
      outcome: "no_result",
      run: { noResultReason: "no_newly_verified_fields" },
    });
    await expect(
      catalog.requestSpecificationEnrichment("test-model", {
        requestId: "backfill-no-result-2",
      }),
    ).resolves.toMatchObject({ outcome: "reused" });
    expect(provider.calls).toBe(1);

    await catalog.importManifest(snapshot(2));
    const staleContext = await app
      .get(CatalogService)
      .previewSpecificationBackfill("all", new Set(), 1);
    expect(staleContext.selected[0]?.baseRevisionId).toBe("test-revision-2");
    let releaseProvider!: () => void;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    vi.spyOn(provider, "discover").mockImplementationOnce(async (request) => {
      providerStarted();
      await release;
      return original(request);
    });
    const staleRequest = catalog.requestSpecificationEnrichment("test-model", {
      requestId: "backfill-stale-revision-2",
    });
    await started;
    await catalog.importManifest(snapshot(3));
    releaseProvider();
    await expect(staleRequest).resolves.toMatchObject({
      outcome: "no_result",
      run: { noResultReason: "superseded" },
    });
    expect(
      rows(
        await connection.database.execute(sql`
          select revision, specs->>'widthIn' width
          from catalog_spec_revision
          where variant_id='test-model'
          order by revision
        `),
      ),
    ).toEqual([
      { revision: 1, width: "31" },
      { revision: 2, width: "32" },
      { revision: 3, width: "33" },
    ]);
  });

  it("allows only one concurrent runtime enrichment attempt to publish", async () => {
    const { catalog, connection } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
      CATALOG_DISCOVERY_MODEL: "deterministic-catalog-v1",
    });
    await catalog.importManifest(snapshot());
    const provider = app.get<FakeCatalogDiscoveryProvider>(
      CATALOG_DISCOVERY_PROVIDER,
    );
    const original = provider.discover.bind(provider);
    let providerStarted!: () => void;
    let releaseProvider!: () => void;
    const started = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    vi.spyOn(provider, "discover").mockImplementationOnce(async (request) => {
      providerStarted();
      await release;
      return original(request);
    });
    const identity = { manufacturer: "TestMaker", model: "TEST 30" };
    const first = catalog.requestDiscovery(identity, {
      requestId: "runtime-concurrent-1",
    });
    await started;
    await expect(
      catalog.requestDiscovery(identity, {
        requestId: "runtime-concurrent-2",
      }),
    ).resolves.toMatchObject({
      status: "verified",
      revision: { revisionId: "test-revision-1" },
      discoveryRun: { status: "running" },
    });
    releaseProvider();
    await expect(first).resolves.toMatchObject({
      status: "verified",
      revision: { revision: 2 },
      discoveryRun: { status: "published" },
    });
    expect(provider.calls).toBe(1);
    expect(
      rows(
        await connection.database.execute(sql`
          select revision from catalog_spec_revision
          where variant_id='test-model'
          order by revision
        `),
      ),
    ).toEqual([{ revision: 1 }, { revision: 2 }]);
  });

  it("runs a bounded deterministic backfill across manufacturers with safe totals", async () => {
    const { catalog } = await setup({
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
      CATALOG_DISCOVERY_MODEL: "deterministic-catalog-v1",
      CATALOG_DISCOVERY_INPUT_USD_PER_MILLION_TOKENS: "1",
      CATALOG_DISCOVERY_OUTPUT_USD_PER_MILLION_TOKENS: "2",
      CATALOG_DISCOVERY_WEB_SEARCH_USD_PER_CALL: "0.01",
    });
    const manifest = snapshot();
    manifest.manufacturers.push({
      id: "dexter-test",
      name: "Dexter",
      aliases: [],
      sources: [
        {
          id: "dexter-test-source",
          title: "Dexter official model",
          url: "https://dexter.com/models/D-10",
          retrievedAt: "2026-09-23T00:00:00.000Z",
          documentRevision: "1",
          checksum: "c".repeat(64),
        },
      ],
      models: [
        {
          id: "dexter-test-model",
          family: "D",
          model: "D-10",
          aliases: [],
          equipmentClass: "washer",
          serialRules: [],
          revision: {
            id: "dexter-test-revision-1",
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
            evidence: [
              {
                field: "model",
                sourceId: "dexter-test-source",
                locator: "Model heading",
                officialValue: "D-10",
                officialUnit: null,
              },
              {
                field: "equipmentClass",
                sourceId: "dexter-test-source",
                locator: "Product category",
                officialValue: "washer",
                officialUnit: null,
              },
            ],
          },
        },
      ],
    });
    manifest.checksum = catalogManifestChecksum(manifest);
    await catalog.importManifest(manifest);
    const output: string[] = [];
    const errors: string[] = [];
    const summary = await runCatalogBackfill(
      { scope: "inventory", execute: true, maxModels: 2 },
      {
        catalog,
        inventoryIdentities: [
          { manufacturer: "TestMaker", model: "TEST 30" },
          { manufacturer: "Dexter", model: "D-10" },
        ],
        writeOutput: (text) => output.push(text),
        writeError: (text) => errors.push(text),
      },
    );
    expect(summary).toMatchObject({
      selected: 2,
      attempted: 2,
      published: 2,
      noResult: 0,
      reused: 0,
      failed: 0,
    });
    expect(summary.estimatedProviderCostUsd).toBeGreaterThan(0);
    expect(output.join("\n")).toContain("Dexter — D-10");
    expect(output.join("\n")).toContain("Test Manufacturer — TEST-30");
    expect(errors).toEqual([]);
  });
});
