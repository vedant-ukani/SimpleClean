import {
  CATALOG_SPECIFICATION_ENRICHMENT_FIELDS,
  type CatalogDiscoveryResult,
} from "@laundrorama/contracts";
import { describe, expect, it } from "vitest";

import { FakeCatalogDiscoveryProvider } from "../src/modules/catalog/discovery/fake-catalog-discovery.adapter.js";
import { verifyCatalogDiscovery } from "../src/modules/catalog/discovery/catalog-discovery.policy.js";
import { OpenAICatalogDiscoveryProvider } from "../src/modules/catalog/discovery/openai-catalog-discovery.adapter.js";

const source = "https://docs.example.test/models/T-300";
const openedSource = "https://docs.example.test/manuals/T-300";
const foundSource = "https://docs.example.test/manuals/T-300#dimensions";

function result(
  overrides: Partial<CatalogDiscoveryResult> = {},
): CatalogDiscoveryResult {
  return {
    manufacturer: "Test Manufacturer",
    model: "T-300",
    equipmentClass: "washer",
    modelEvidence: {
      sourceUrl: source,
      locator: "Heading",
      exactModelPresent: true,
    },
    equipmentClassEvidence: {
      sourceUrl: source,
      locator: "Product category",
      exactModelPresent: true,
    },
    fields: [
      {
        field: "widthIn",
        normalizedValue: 27.5591,
        officialValue: "70",
        officialUnit: "cm",
        sourceUrl: source,
        locator: "Specifications / Dimensions",
        exactModelPresent: true,
      },
    ],
    productionStartYear: null,
    productionEndYear: null,
    productionEvidence: [],
    serialRules: [],
    ...overrides,
  };
}

const context = {
  manufacturer: "Test Manufacturer",
  model: "T-300",
  trustedHostnames: ["example.test"],
  returnedSources: [{ url: source, title: "Official T-300" }],
};

const legacyRequest = {
  manufacturer: "Test Manufacturer",
  model: "T-300",
  equipmentClass: null,
  requestedFields: [
    ...CATALOG_SPECIFICATION_ENRICHMENT_FIELDS,
    "serialRules",
  ] as const,
};

describe("automatic official-source Catalog policy", () => {
  it("accepts exact official/subdomain evidence and deterministic conversion", () => {
    const verified = verifyCatalogDiscovery(result(), context);
    expect(verified).toMatchObject({
      outcome: "verified",
      model: "T-300",
      documentedModel: "T-300",
      specs: { widthIn: 27.5591 },
      evidence: [
        expect.objectContaining({
          field: "model",
          sourceUrl: source,
        }),
        expect.objectContaining({
          field: "equipmentClass",
          sourceUrl: source,
        }),
        expect.objectContaining({ field: "widthIn", sourceUrl: source }),
      ],
    });
  });

  it("accepts a deterministic leading documented base model for a full accepted model", () => {
    expect(
      verifyCatalogDiscovery(result({ model: "EH020" }), {
        ...context,
        model: "EH020XA1321121011",
      }),
    ).toMatchObject({
      outcome: "verified",
      model: "EH020XA1321121011",
      documentedModel: "EH020",
      evidence: expect.arrayContaining([
        expect.objectContaining({ field: "model", officialValue: "EH020" }),
      ]),
    });
  });

  it.each([
    ["unrelated", "T-300", "EH020XA1321121011"],
    ["non-anchored substring", "EH020", "XXEH020XA1321121011"],
    ["too short", "E2", "E2XA1321121011"],
    ["no ASCII letter", "0201", "0201XA1321121011"],
    ["no ASCII digit", "MODEL", "MODELXA1321121011"],
  ])("rejects a %s documented-model relationship", (_case, model, accepted) => {
    expect(
      verifyCatalogDiscovery(result({ model }), {
        ...context,
        model: accepted,
      }),
    ).toMatchObject({ outcome: "no_result", reason: "identity_mismatch" });
  });

  it("requires exact documented-model evidence for an accepted base model", () => {
    expect(
      verifyCatalogDiscovery(
        result({
          model: "EH020",
          modelEvidence: {
            sourceUrl: source,
            locator: "Family heading",
            exactModelPresent: false,
          },
        }),
        { ...context, model: "EH020XA1321121011" },
      ),
    ).toMatchObject({
      outcome: "no_result",
      reason: "model_evidence_unverified",
    });
  });

  it("rejects lookalike, non-returned, non-HTTPS, and inexact-model evidence", () => {
    for (const sourceUrl of [
      "https://example.test.evil.invalid/T-300",
      "https://unreturned.example.test/T-300",
      "http://docs.example.test/models/T-300",
    ]) {
      expect(
        verifyCatalogDiscovery(
          result({
            modelEvidence: {
              sourceUrl,
              locator: "Heading",
              exactModelPresent: true,
            },
          }),
          context,
        ),
      ).toMatchObject({ outcome: "no_result" });
    }
    expect(
      verifyCatalogDiscovery(
        result({
          modelEvidence: {
            sourceUrl: source,
            locator: "Family heading",
            exactModelPresent: false,
          },
        }),
        context,
      ),
    ).toMatchObject({ outcome: "no_result" });
  });

  it("drops conflicts and invalid normalized values and never executes arbitrary serial rules", () => {
    const conflicting = result({
      fields: [
        ...result().fields,
        {
          ...result().fields[0]!,
          normalizedValue: 31,
          officialValue: "31",
          officialUnit: "in",
        },
        {
          ...result().fields[0]!,
          field: "weightLb",
          normalizedValue: 999,
          officialValue: "100",
          officialUnit: "kg",
        },
      ],
      serialRules: [
        {
          sourceUrl: source,
          locator: "Serial prose",
          exactModelPresent: true,
          evidenceScope: "exact_model",
          rule: {
            id: "bad-rule",
            revision: 1,
            type: "two_digit_year_at_position",
            position: 0,
            length: 3,
            minimumSerialLength: 3,
            codes: [],
            earliestYear: 2000,
            latestYear: 2099,
          },
        },
      ],
    });
    expect(verifyCatalogDiscovery(conflicting, context)).toMatchObject({
      outcome: "no_result",
      reason: "no_verified_specifications",
    });
  });

  it("rejects compound or ranged official scalar text instead of accepting a numeric prefix", () => {
    for (const officialValue of ["30 x 40", "30-32"]) {
      expect(
        verifyCatalogDiscovery(
          result({
            fields: [
              {
                ...result().fields[0]!,
                normalizedValue: 30,
                officialValue,
                officialUnit: "in",
              },
            ],
          }),
          context,
        ),
      ).toMatchObject({
        outcome: "no_result",
        reason: "no_verified_specifications",
      });
    }
  });

  it("rejects unsupported extra values inside a discovered list", () => {
    expect(
      verifyCatalogDiscovery(
        result({
          fields: [
            {
              field: "fuel",
              normalizedValue: ["gas", "steam"],
              officialValue: "Gas",
              officialUnit: null,
              sourceUrl: source,
              locator: "Utilities table",
              exactModelPresent: true,
            },
          ],
        }),
        context,
      ),
    ).toMatchObject({
      outcome: "no_result",
      reason: "no_verified_specifications",
    });
  });

  it("filters enrichment to requested fields and ignores serial rules", () => {
    const verified = verifyCatalogDiscovery(
      result({
        fields: [
          ...result().fields,
          {
            field: "capacityLb",
            normalizedValue: 40,
            officialValue: "40",
            officialUnit: "lb",
            sourceUrl: source,
            locator: "Specifications / Capacity",
            exactModelPresent: true,
          },
        ],
        serialRules: [
          {
            sourceUrl: source,
            locator: "Serial prose",
            exactModelPresent: true,
            evidenceScope: "exact_model",
            rule: {
              id: "ignored-rule",
              revision: 1,
              type: "two_digit_year_at_position",
              position: 0,
              length: 2,
              minimumSerialLength: 2,
              codes: [],
              earliestYear: 2000,
              latestYear: 2099,
            },
          },
        ],
      }),
      {
        ...context,
        expectedEquipmentClass: "washer",
        requestedFields: ["capacityLb"],
      },
    );
    expect(verified).toMatchObject({
      outcome: "verified",
      specs: { widthIn: null, capacityLb: 40 },
      serialRules: [],
      evidence: expect.arrayContaining([
        expect.objectContaining({ field: "capacityLb" }),
      ]),
    });
    expect(
      (verified as Extract<typeof verified, { outcome: "verified" }>).evidence,
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "widthIn" })]),
    );
  });

  it("rejects a stored equipment-class mismatch and reports no newly verified fields", () => {
    expect(
      verifyCatalogDiscovery(result({ equipmentClass: "dryer" }), {
        ...context,
        expectedEquipmentClass: "washer",
        requestedFields: ["capacityLb"],
      }),
    ).toMatchObject({
      outcome: "no_result",
      reason: "equipment_class_mismatch",
    });
    expect(
      verifyCatalogDiscovery(result(), {
        ...context,
        expectedEquipmentClass: "washer",
        requestedFields: ["capacityLb"],
      }),
    ).toMatchObject({
      outcome: "no_result",
      reason: "no_newly_verified_fields",
    });
  });
});

describe("OpenAI Catalog discovery adapter", () => {
  it("uses required unrestricted web search and returns bounded sources and usage", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new OpenAICatalogDiscoveryProvider({
      apiKey: "test-key",
      model: "gpt-test",
      fetch: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            id: "response-1",
            usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
            output: [
              {
                type: "web_search_call",
                action: {
                  type: "search",
                  sources: [
                    { type: "url", url: source },
                    { type: "url", url: "http://docs.example.test/insecure" },
                  ],
                },
              },
              {
                type: "web_search_call",
                action: { type: "open_page", url: openedSource },
              },
              {
                type: "web_search_call",
                action: { type: "find_in_page", url: foundSource },
              },
              {
                type: "message",
                content: [
                  { type: "output_text", text: JSON.stringify(result()) },
                ],
              },
            ],
          }),
          { status: 200, headers: { "x-request-id": "request-1" } },
        );
      },
    });
    const response = await provider.discover({
      ...legacyRequest,
    });
    expect(requestBody).toMatchObject({
      model: "gpt-test",
      tools: [{ type: "web_search", search_context_size: "high" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      reasoning: { effort: "low" },
    });
    expect(JSON.stringify(requestBody)).not.toContain("allowed_domains");
    const prompt = JSON.stringify(requestBody);
    expect(prompt).toContain("Stored equipment class");
    expect(prompt).toContain(
      "exact officially documented model or deterministic leading base model",
    );
    expect(prompt).toContain(
      "exactModelPresent refers to that returned documented model",
    );
    expect(prompt).toContain(JSON.stringify(null));
    for (const field of CATALOG_SPECIFICATION_ENRICHMENT_FIELDS)
      expect(prompt).toContain(field);
    expect(response).toMatchObject({
      sources: [
        { url: source, title: "docs.example.test" },
        { url: openedSource, title: "docs.example.test" },
        { url: foundSource, title: "docs.example.test" },
      ],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      webSearchCallCount: 3,
      requestId: "request-1",
    });
  });

  it("keeps deterministic fake enrichment bounded to requested fields and class", async () => {
    const provider = new FakeCatalogDiscoveryProvider({
      result: result({
        fields: [
          ...result().fields,
          {
            field: "capacityLb",
            normalizedValue: 40,
            officialValue: "40",
            officialUnit: "lb",
            sourceUrl: source,
            locator: "Specifications / Capacity",
            exactModelPresent: true,
          },
        ],
      }),
      sources: [{ url: source, title: "Official T-300" }],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, raw: {} },
      webSearchCallCount: 1,
      requestId: null,
    });
    const response = await provider.discover({
      manufacturer: "Test Manufacturer",
      model: "T-300",
      equipmentClass: "dryer",
      requestedFields: ["capacityLb"],
    });
    expect(response.result).toMatchObject({
      equipmentClass: "dryer",
      fields: [expect.objectContaining({ field: "capacityLb" })],
      serialRules: [],
    });
  });

  it("bounds returned web-search sources across all actions", async () => {
    const provider = new OpenAICatalogDiscoveryProvider({
      apiKey: "test-key",
      model: "gpt-test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            id: "response-bounded",
            output: [
              {
                type: "web_search_call",
                action: {
                  type: "search",
                  sources: Array.from({ length: 101 }, (_, index) => ({
                    type: "url",
                    url: `https://docs.example.test/result/${index}`,
                  })),
                },
              },
              {
                type: "web_search_call",
                action: {
                  type: "open_page",
                  url: "https://docs.example.test/result/extra",
                },
              },
              {
                type: "message",
                content: [
                  { type: "output_text", text: JSON.stringify(result()) },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    });
    const response = await provider.discover({
      ...legacyRequest,
    });
    expect(response.sources).toHaveLength(100);
    expect(response.sources.at(-1)).toEqual({
      url: "https://docs.example.test/result/99",
      title: "docs.example.test",
    });
  });
});
