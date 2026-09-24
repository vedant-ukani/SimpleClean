import { createTestEnvironment } from "@simply-clean/test-support";
import { describe, expect, it, vi } from "vitest";

import { getCatalogModel, getCatalogModels } from "../src/lib/catalog-client";

const timestamp = "2026-09-23T00:00:00.000Z";
const source = {
  id: "source-1",
  url: "https://example.test/model.pdf",
  title: "Official model guide",
  retrievedAt: timestamp,
  documentRevision: null,
  checksum: "a".repeat(64),
};
const model = {
  manufacturerId: "dexter",
  manufacturer: "Dexter",
  modelId: "t-400",
  family: "T Series",
  model: "T-400",
  equipmentClass: "washer" as const,
  revisionId: "revision-1",
  revision: 1,
};

function detail() {
  return {
    model: {
      ...model,
      aliases: ["T400"],
      productionStartYear: 2010,
      productionEndYear: 2020,
      specs: {
        widthIn: 30,
        depthIn: null,
        heightIn: 50,
        weightLb: null,
        capacityLb: 40,
        voltage: ["208 V"],
        phase: ["three_phase"],
        fuel: [],
        configuration: [],
      },
      sources: [source],
      evidence: [
        {
          field: "model",
          sourceId: source.id,
          locator: "Heading",
          officialValue: "T-400",
          officialUnit: null,
        },
        {
          field: "equipmentClass",
          sourceId: source.id,
          locator: "Heading",
          officialValue: "washer",
          officialUnit: null,
        },
      ],
    },
  };
}

describe("Catalog client", () => {
  it("encodes list filters and parses the typed response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [model],
          page: 2,
          pageSize: 25,
          total: 26,
        }),
      ),
    );

    await expect(
      getCatalogModels(
        { query: "T-400 / test", manufacturer: "Dexter & Co", page: 2 },
        fetcher,
        createTestEnvironment(),
        "session=cookie",
      ),
    ).resolves.toMatchObject({ page: 2, total: 26 });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://localhost:3001/catalog/models?query=T-400+%2F+test&manufacturer=Dexter+%26+Co&page=2",
    );
  });

  it("encodes revision IDs and parses detail provenance", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(detail())));

    await expect(
      getCatalogModel("revision/1", fetcher, createTestEnvironment()),
    ).resolves.toMatchObject({
      revisionId: "revision-1",
      sources: [{ title: "Official model guide" }],
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://localhost:3001/catalog/models/revision%2F1",
    );
  });
});
