import {
  CatalogDiscoveryResultSchema,
  type CatalogDiscoveryUsage,
} from "@laundrorama/contracts";
import { createHash } from "node:crypto";

import {
  boundedJsonPost,
  ProviderHttpError,
  type ProviderFetch,
} from "../../../platform/provider-http.js";
import {
  CatalogDiscoveryProviderError,
  type CatalogDiscoveryProvider,
  type CatalogDiscoveryProviderResponse,
  type CatalogDiscoveryRequest,
} from "./catalog-discovery.provider.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const PROMPT =
  "Research only the accepted manufacturer and exact accepted model supplied by the caller. Use public web search, but never infer or repair identity characters. In result.model, return the exact officially documented model or deterministic leading base model whose normalized characters are an anchored prefix of the accepted full model; never use fuzzy, edit-distance, contains, related-model, or suffix matching. exactModelPresent refers to that returned documented model and requires the cited official evidence to contain it exactly, whether it equals the accepted full model or is its leading base model. Return official evidence for that documented model and the equipment class plus source-backed specifications. Preserve official values and units and cite a non-empty page, section, or table locator for every fact. Report conflicting facts separately. Return values only for the explicitly requested specification fields; leave all other specification fields empty or null even when found. A serial rule may use only one of the supplied typed rule forms and must identify whether its evidence is exact-model or a documented family rule. Return only the strict JSON object.";

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "manufacturer",
    "model",
    "equipmentClass",
    "modelEvidence",
    "equipmentClassEvidence",
    "fields",
    "productionStartYear",
    "productionEndYear",
    "productionEvidence",
    "serialRules",
  ],
  properties: {
    manufacturer: { type: "string" },
    model: { type: "string" },
    equipmentClass: {
      type: "string",
      enum: ["washer", "dryer", "stack_dryer", "stacked_washer_dryer", "other"],
    },
    modelEvidence: { $ref: "#/$defs/evidence" },
    equipmentClassEvidence: { $ref: "#/$defs/evidence" },
    fields: {
      type: "array",
      maxItems: 80,
      items: { $ref: "#/$defs/field" },
    },
    productionStartYear: { type: ["integer", "null"] },
    productionEndYear: { type: ["integer", "null"] },
    productionEvidence: {
      type: "array",
      maxItems: 2,
      items: { $ref: "#/$defs/productionEvidence" },
    },
    serialRules: {
      type: "array",
      maxItems: 20,
      items: { $ref: "#/$defs/serialRule" },
    },
  },
  $defs: {
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["sourceUrl", "locator", "exactModelPresent"],
      properties: {
        sourceUrl: { type: "string" },
        locator: { type: "string" },
        exactModelPresent: { type: "boolean" },
      },
    },
    field: {
      type: "object",
      additionalProperties: false,
      required: [
        "field",
        "normalizedValue",
        "officialValue",
        "officialUnit",
        "sourceUrl",
        "locator",
        "exactModelPresent",
      ],
      properties: {
        field: {
          type: "string",
          enum: [
            "widthIn",
            "depthIn",
            "heightIn",
            "weightLb",
            "capacityLb",
            "voltage",
            "phase",
            "fuel",
            "configuration",
          ],
        },
        normalizedValue: {
          anyOf: [
            { type: "number" },
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        officialValue: { type: "string" },
        officialUnit: { type: ["string", "null"] },
        sourceUrl: { type: "string" },
        locator: { type: "string" },
        exactModelPresent: { type: "boolean" },
      },
    },
    productionEvidence: {
      type: "object",
      additionalProperties: false,
      required: [
        "field",
        "officialValue",
        "officialUnit",
        "sourceUrl",
        "locator",
        "exactModelPresent",
      ],
      properties: {
        field: {
          type: "string",
          enum: ["productionStartYear", "productionEndYear"],
        },
        officialValue: { type: "string" },
        officialUnit: { type: ["string", "null"] },
        sourceUrl: { type: "string" },
        locator: { type: "string" },
        exactModelPresent: { type: "boolean" },
      },
    },
    serialRule: {
      type: "object",
      additionalProperties: false,
      required: [
        "sourceUrl",
        "locator",
        "exactModelPresent",
        "evidenceScope",
        "rule",
      ],
      properties: {
        sourceUrl: { type: "string" },
        locator: { type: "string" },
        exactModelPresent: { type: "boolean" },
        evidenceScope: {
          type: "string",
          enum: ["exact_model", "documented_family"],
        },
        rule: { $ref: "#/$defs/typedSerialRule" },
      },
    },
    typedSerialRule: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "revision",
        "type",
        "position",
        "length",
        "minimumSerialLength",
        "codes",
        "earliestYear",
        "latestYear",
      ],
      properties: {
        id: { type: "string" },
        revision: { type: "integer" },
        type: {
          type: "string",
          enum: ["year_code_at_position", "two_digit_year_at_position"],
        },
        position: { type: "integer" },
        length: { type: "integer" },
        minimumSerialLength: { type: "integer" },
        codes: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["code", "startYear", "endYear"],
            properties: {
              code: { type: "string" },
              startYear: { type: "integer" },
              endYear: { type: ["integer", "null"] },
            },
          },
        },
        earliestYear: { type: ["integer", "null"] },
        latestYear: { type: ["integer", "null"] },
      },
    },
  },
} as const;

export interface OpenAICatalogDiscoveryOptions {
  apiKey: string;
  model: string;
  endpoint?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetch?: ProviderFetch;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CatalogDiscoveryProviderError(
      "invalid_response",
      "Catalog discovery provider returned invalid JSON",
    );
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function outputText(root: Record<string, unknown>): string | undefined {
  if (typeof root.output_text === "string") return root.output_text;
  if (!Array.isArray(root.output)) return undefined;
  for (const item of root.output) {
    const content = record(item)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = record(part)?.text;
      if (typeof text === "string") return text;
    }
  }
  return undefined;
}

function returnedSources(root: Record<string, unknown>) {
  if (!Array.isArray(root.output)) return [];
  const sources = new Map<string, { url: string; title: string }>();
  const addSource = (urlValue: unknown, titleValue?: unknown) => {
    if (typeof urlValue !== "string" || urlValue.length > 2_000) return;
    let hostname: string;
    try {
      const parsed = new URL(urlValue);
      if (parsed.protocol !== "https:") return;
      hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
      if (!hostname) return;
    } catch {
      return;
    }
    const providedTitle =
      typeof titleValue === "string" ? titleValue.trim() : "";
    const title =
      providedTitle && providedTitle.length <= 500 ? providedTitle : hostname;
    if (sources.has(urlValue)) {
      if (providedTitle && providedTitle.length <= 500)
        sources.set(urlValue, { url: urlValue, title });
      return;
    }
    if (sources.size >= 100) return;
    sources.set(urlValue, { url: urlValue, title });
  };
  for (const item of root.output) {
    const itemRecord = record(item);
    if (itemRecord?.type !== "web_search_call") continue;
    const action = record(itemRecord.action);
    if (Array.isArray(action?.sources))
      for (const source of action.sources) {
        const sourceRecord = record(source);
        addSource(sourceRecord?.url, sourceRecord?.title);
      }
    if (action?.type === "open_page" || action?.type === "find_in_page")
      addSource(action.url);
  }
  return [...sources.values()];
}

function usage(root: Record<string, unknown>): CatalogDiscoveryUsage {
  const rawRecord = record(root.usage) ?? {};
  const raw = Object.fromEntries(
    Object.entries(rawRecord).flatMap(([key, value]) =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? [[key, value]]
        : [],
    ),
  );
  return {
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    totalTokens:
      raw.total_tokens ?? (raw.input_tokens ?? 0) + (raw.output_tokens ?? 0),
    raw,
  };
}

export class OpenAICatalogDiscoveryProvider implements CatalogDiscoveryProvider {
  constructor(private readonly options: OpenAICatalogDiscoveryOptions) {
    if (!options.apiKey || options.apiKey.length > 500)
      throw new CatalogDiscoveryProviderError(
        "invalid_configuration",
        "Catalog discovery credentials are not configured",
      );
    if (!/^[\w.:-]{1,120}$/.test(options.model))
      throw new CatalogDiscoveryProviderError(
        "invalid_configuration",
        "Invalid Catalog discovery model",
      );
  }

  async discover(
    request: CatalogDiscoveryRequest,
  ): Promise<CatalogDiscoveryProviderResponse> {
    try {
      const transport = await boundedJsonPost(
        this.options.endpoint ?? OPENAI_ENDPOINT,
        {
          model: this.options.model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `${PROMPT} Canonical accepted manufacturer: ${JSON.stringify(request.manufacturer)}. Canonical exact accepted model: ${JSON.stringify(request.model)}. Stored equipment class (null means unknown legacy discovery): ${JSON.stringify(request.equipmentClass)}. Requested specification fields: ${JSON.stringify(request.requestedFields)}.`,
                },
              ],
            },
          ],
          tools: [{ type: "web_search", search_context_size: "high" }],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
          reasoning: { effort: "low" },
          text: {
            format: {
              type: "json_schema",
              name: "catalog_discovery_result",
              strict: true,
              schema: JSON_SCHEMA,
            },
          },
        },
        { authorization: `Bearer ${this.options.apiKey}` },
        {
          timeoutMs: this.options.timeoutMs ?? 60_000,
          maxResponseBytes: this.options.maxResponseBytes ?? 1_048_576,
          ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        },
      );
      const root = record(parseJson(transport.text));
      if (!root || root.status === "incomplete")
        throw new CatalogDiscoveryProviderError(
          "invalid_response",
          "Catalog discovery provider returned an incomplete response",
        );
      const text = outputText(root);
      const parsed = text
        ? CatalogDiscoveryResultSchema.safeParse(parseJson(text))
        : { success: false as const };
      if (!parsed.success)
        throw new CatalogDiscoveryProviderError(
          "invalid_response",
          "Catalog discovery provider returned an invalid result",
        );
      const sources = returnedSources(root);
      const webSearchCallCount = Array.isArray(root.output)
        ? root.output.filter((item) => record(item)?.type === "web_search_call")
            .length
        : 0;
      const headerRequestId = transport.response.headers.get("x-request-id");
      const bodyRequestId = typeof root.id === "string" ? root.id : null;
      const requestId = headerRequestId ?? bodyRequestId;
      return {
        result: parsed.data,
        sources,
        usage: usage(root),
        webSearchCallCount,
        requestId: requestId && requestId.length <= 200 ? requestId : null,
        responseFingerprint: createHash("sha256")
          .update(transport.text)
          .digest("hex"),
      };
    } catch (error) {
      if (error instanceof CatalogDiscoveryProviderError) throw error;
      if (error instanceof ProviderHttpError)
        throw new CatalogDiscoveryProviderError(
          error.code,
          "Catalog discovery provider request failed",
          error.status,
        );
      throw new CatalogDiscoveryProviderError(
        "unavailable",
        "Catalog discovery provider unavailable",
      );
    }
  }
}
