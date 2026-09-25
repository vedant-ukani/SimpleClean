import {
  CatalogSerialRuleSchema,
  normalizeCatalogIdentity,
  type CatalogDiscoveryResult,
  type CatalogSerialRule,
  type CatalogSpecificationEnrichmentField,
  type CatalogSpecs,
} from "@laundrorama/contracts";

type EquipmentClass = CatalogDiscoveryResult["equipmentClass"];

export interface DiscoveryPolicyContext {
  manufacturer: string;
  model: string;
  trustedHostnames: readonly string[];
  returnedSources: readonly { url: string; title: string }[];
  expectedEquipmentClass?: EquipmentClass;
  requestedFields?: readonly CatalogSpecificationEnrichmentField[];
}

export interface VerifiedDiscoveryEvidence {
  field:
    | keyof CatalogSpecs
    | "model"
    | "equipmentClass"
    | "productionStartYear"
    | "productionEndYear";
  sourceUrl: string;
  locator: string;
  officialValue: string | null;
  officialUnit: string | null;
}

export type VerifiedCatalogDiscovery =
  | {
      outcome: "verified";
      manufacturer: string;
      /** Full accepted nameplate model retained as the Catalog variant. */
      model: string;
      /** Exact officially documented model retained as the Catalog family. */
      documentedModel: string;
      equipmentClass: EquipmentClass;
      specs: CatalogSpecs;
      productionStartYear: number | null;
      productionEndYear: number | null;
      evidence: VerifiedDiscoveryEvidence[];
      serialRules: Array<{
        rule: CatalogSerialRule;
        sourceUrl: string;
        locator: string;
      }>;
      sources: Array<{ url: string; title: string }>;
    }
  | {
      outcome: "no_result";
      reason:
        | "identity_mismatch"
        | "model_evidence_unverified"
        | "equipment_class_evidence_unverified"
        | "equipment_class_mismatch"
        | "no_verified_specifications"
        | "no_newly_verified_fields";
    };

function trustedEvidence(
  evidence: {
    sourceUrl: string;
    locator: string;
    exactModelPresent: boolean;
  },
  context: DiscoveryPolicyContext,
  allowFamily = false,
): boolean {
  if (!evidence.locator.trim() || (!allowFamily && !evidence.exactModelPresent))
    return false;
  if (
    !context.returnedSources.some((source) => source.url === evidence.sourceUrl)
  )
    return false;
  try {
    const url = new URL(evidence.sourceUrl);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return context.trustedHostnames.some((trusted) => {
      const normalized = trusted.toLowerCase().replace(/\.$/, "");
      return hostname === normalized || hostname.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

function numericValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(trimmed))
    return undefined;
  const parsed = Number(trimmed.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function convertedMeasurement(
  field: "widthIn" | "depthIn" | "heightIn" | "weightLb" | "capacityLb",
  officialValue: string,
  officialUnit: string | null,
): number | undefined {
  const value = numericValue(officialValue);
  if (value === undefined || !officialUnit) return undefined;
  const unit = officialUnit.trim().toLowerCase().replace(/\./g, "");
  let converted: number | undefined;
  if (["widthIn", "depthIn", "heightIn"].includes(field)) {
    if (["in", "inch", "inches"].includes(unit)) converted = value;
    if (["cm", "centimeter", "centimeters"].includes(unit))
      converted = value / 2.54;
    if (["mm", "millimeter", "millimeters"].includes(unit))
      converted = value / 25.4;
    if (converted === undefined || converted < 1 || converted > 300)
      return undefined;
  } else {
    if (["lb", "lbs", "pound", "pounds"].includes(unit)) converted = value;
    if (["kg", "kilogram", "kilograms"].includes(unit))
      converted = value * 2.2046226218;
    const maximum = field === "capacityLb" ? 1_000 : 10_000;
    if (converted === undefined || converted < 1 || converted > maximum)
      return undefined;
  }
  return Math.round(converted * 10_000) / 10_000;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(right) * 0.001);
}

export function hasDocumentedModelRelationship(
  documentedModel: string,
  acceptedModel: string,
): boolean {
  const documented = normalizeCatalogIdentity(documentedModel);
  const accepted = normalizeCatalogIdentity(acceptedModel);
  return (
    documented.length >= 4 &&
    /[A-Z]/.test(documented) &&
    /[0-9]/.test(documented) &&
    (accepted === documented || accepted.startsWith(documented))
  );
}

function verifiedFieldValue(
  field: CatalogDiscoveryResult["fields"][number],
): CatalogSpecs[keyof CatalogSpecs] | undefined {
  if (
    ["widthIn", "depthIn", "heightIn", "weightLb", "capacityLb"].includes(
      field.field,
    )
  ) {
    if (typeof field.normalizedValue !== "number") return undefined;
    const converted = convertedMeasurement(
      field.field as
        "widthIn" | "depthIn" | "heightIn" | "weightLb" | "capacityLb",
      field.officialValue,
      field.officialUnit,
    );
    return converted !== undefined &&
      nearlyEqual(converted, field.normalizedValue)
      ? converted
      : undefined;
  }
  const values = Array.isArray(field.normalizedValue)
    ? field.normalizedValue
    : typeof field.normalizedValue === "string"
      ? [field.normalizedValue]
      : [];
  const bounded = values.map((value) => value.trim()).filter(Boolean);
  if (!bounded.length) return undefined;
  if (field.field === "phase") {
    if (
      bounded.some((value) => !["single_phase", "three_phase"].includes(value))
    )
      return undefined;
  }
  if (field.field === "fuel") {
    if (
      bounded.some(
        (value) => !["gas", "electric", "steam", "other"].includes(value),
      )
    )
      return undefined;
  }
  const evidenceTokens = new Set(
    normalizeCatalogIdentity(field.officialValue)
      .replace(/[^A-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );
  const normalizedValues = bounded.map((value) =>
    normalizeCatalogIdentity(value)
      .replace(/[^A-Z0-9]+/g, " ")
      .trim(),
  );
  if (
    new Set(normalizedValues).size !== normalizedValues.length ||
    normalizedValues.some((value) =>
      value
        .split(/\s+/)
        .filter(Boolean)
        .some((token) => !evidenceTokens.has(token)),
    )
  )
    return undefined;
  return bounded;
}

export function verifyCatalogDiscovery(
  result: CatalogDiscoveryResult,
  context: DiscoveryPolicyContext,
): VerifiedCatalogDiscovery {
  if (
    normalizeCatalogIdentity(result.manufacturer) !==
      normalizeCatalogIdentity(context.manufacturer) ||
    !hasDocumentedModelRelationship(result.model, context.model)
  )
    return { outcome: "no_result", reason: "identity_mismatch" };
  if (
    context.expectedEquipmentClass !== undefined &&
    result.equipmentClass !== context.expectedEquipmentClass
  )
    return { outcome: "no_result", reason: "equipment_class_mismatch" };
  if (!trustedEvidence(result.modelEvidence, context))
    return { outcome: "no_result", reason: "model_evidence_unverified" };
  if (!trustedEvidence(result.equipmentClassEvidence, context))
    return {
      outcome: "no_result",
      reason: "equipment_class_evidence_unverified",
    };

  const specs: CatalogSpecs = {
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
  const evidence: VerifiedDiscoveryEvidence[] = [
    {
      field: "model",
      sourceUrl: result.modelEvidence.sourceUrl,
      locator: result.modelEvidence.locator,
      officialValue: result.model,
      officialUnit: null,
    },
    {
      field: "equipmentClass",
      sourceUrl: result.equipmentClassEvidence.sourceUrl,
      locator: result.equipmentClassEvidence.locator,
      officialValue: result.equipmentClass,
      officialUnit: null,
    },
  ];
  const requestedFields = context.requestedFields
    ? new Set(context.requestedFields)
    : undefined;
  for (const fieldName of [
    "widthIn",
    "depthIn",
    "heightIn",
    "weightLb",
    "capacityLb",
    "voltage",
    "phase",
    "fuel",
    "configuration",
  ] as const) {
    if (requestedFields && !requestedFields.has(fieldName)) continue;
    const candidates = result.fields.filter(
      (field) => field.field === fieldName && trustedEvidence(field, context),
    );
    const verified = candidates.flatMap((field) => {
      const value = verifiedFieldValue(field);
      return value === undefined ? [] : [{ field, value }];
    });
    const distinct = new Map(
      verified.map((item) => [JSON.stringify(item.value), item]),
    );
    if (distinct.size !== 1) continue;
    const accepted = [...distinct.values()][0]!;
    (specs as Record<string, unknown>)[fieldName] = accepted.value;
    evidence.push({
      field: fieldName,
      sourceUrl: accepted.field.sourceUrl,
      locator: accepted.field.locator,
      officialValue: accepted.field.officialValue,
      officialUnit: accepted.field.officialUnit,
    });
  }

  let productionStartYear: number | null = null;
  let productionEndYear: number | null = null;
  for (const fieldName of [
    "productionStartYear",
    "productionEndYear",
  ] as const) {
    if (requestedFields && !requestedFields.has(fieldName)) continue;
    const values = result.productionEvidence.filter(
      (item) => item.field === fieldName && trustedEvidence(item, context),
    );
    const proposed = result[fieldName];
    if (
      proposed !== null &&
      values.length === 1 &&
      numericValue(values[0]!.officialValue) === proposed
    ) {
      if (fieldName === "productionStartYear") productionStartYear = proposed;
      else productionEndYear = proposed;
      evidence.push({
        field: fieldName,
        sourceUrl: values[0]!.sourceUrl,
        locator: values[0]!.locator,
        officialValue: values[0]!.officialValue,
        officialUnit: values[0]!.officialUnit,
      });
    }
  }
  if (
    productionStartYear !== null &&
    productionEndYear !== null &&
    productionStartYear > productionEndYear
  ) {
    productionStartYear = null;
    productionEndYear = null;
    for (let index = evidence.length - 1; index >= 0; index -= 1)
      if (
        evidence[index]?.field === "productionStartYear" ||
        evidence[index]?.field === "productionEndYear"
      )
        evidence.splice(index, 1);
  }

  const serialRules = requestedFields
    ? []
    : result.serialRules.flatMap((candidate) => {
        if (
          !trustedEvidence(
            candidate,
            context,
            candidate.evidenceScope === "documented_family",
          )
        )
          return [];
        const parsed = CatalogSerialRuleSchema.safeParse({
          id: candidate.rule.id,
          revision: candidate.rule.revision,
          type: candidate.rule.type,
          position: candidate.rule.position,
          length: candidate.rule.length,
          minimumSerialLength: candidate.rule.minimumSerialLength,
          ...(candidate.rule.type === "year_code_at_position"
            ? {
                codes: Object.fromEntries(
                  candidate.rule.codes.map((entry) => [
                    entry.code,
                    entry.endYear === null || entry.endYear === entry.startYear
                      ? entry.startYear
                      : [entry.startYear, entry.endYear],
                  ]),
                ),
              }
            : {
                earliestYear: candidate.rule.earliestYear ?? undefined,
                latestYear: candidate.rule.latestYear ?? undefined,
              }),
          sourceId: "pending",
          locator: candidate.locator,
        });
        return parsed.success
          ? [
              {
                rule: parsed.data,
                sourceUrl: candidate.sourceUrl,
                locator: candidate.locator,
              },
            ]
          : [];
      });
  const hasSpec = Object.values(specs).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null,
  );
  if (
    !hasSpec &&
    productionStartYear === null &&
    productionEndYear === null &&
    serialRules.length === 0
  )
    return {
      outcome: "no_result",
      reason: requestedFields
        ? "no_newly_verified_fields"
        : "no_verified_specifications",
    };

  const sourceUrls = new Set([
    ...evidence.map((item) => item.sourceUrl),
    ...serialRules.map((item) => item.sourceUrl),
  ]);
  return {
    outcome: "verified",
    manufacturer: context.manufacturer,
    model: context.model,
    documentedModel: result.model,
    equipmentClass: result.equipmentClass,
    specs,
    productionStartYear,
    productionEndYear,
    evidence,
    serialRules,
    sources: context.returnedSources.filter((item) => sourceUrls.has(item.url)),
  };
}
