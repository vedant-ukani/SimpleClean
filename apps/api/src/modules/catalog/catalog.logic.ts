import type {
  CatalogManufactureDateSchema,
  CatalogSeedManifest,
  CatalogSerialRule,
  ResolveCatalogModelRequest,
  ResolveCatalogModelResponse,
} from "@simply-clean/contracts";
import type { z } from "zod";
import { normalizeCatalogIdentity } from "@simply-clean/contracts";

type ManufactureDate = z.infer<typeof CatalogManufactureDateSchema>;

function normalizeOptional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeCatalogIdentity(value);
  return normalized || null;
}

export function evaluateSerialRules(
  rules: readonly CatalogSerialRule[],
  serial: string | null | undefined,
): ManufactureDate {
  const normalized = normalizeOptional(serial);
  if (!normalized) return { kind: "unknown", reason: "serial_not_provided" };
  if (!rules.length)
    return { kind: "unknown", reason: "serial_rule_unavailable" };
  try {
    // A later approved revision is an explicit correction of an earlier rule.
    const seenRuleIds = new Set<string>();
    const matches: Exclude<ManufactureDate, { kind: "unknown" }>[] = [];
    for (const rule of [...rules].sort(
      (left, right) =>
        right.revision - left.revision || left.id.localeCompare(right.id),
    )) {
      if (seenRuleIds.has(rule.id)) continue;
      seenRuleIds.add(rule.id);
      const provenance = {
        ruleId: rule.id,
        ruleRevision: rule.revision,
        sourceId: rule.sourceId,
        locator: rule.locator,
      };
      if (normalized.length < rule.minimumSerialLength) continue;
      const token = normalized.slice(
        rule.position,
        rule.position + rule.length,
      );
      if (token.length !== rule.length) continue;
      if (rule.type === "year_code_at_position") {
        const result = rule.codes?.[token];
        if (typeof result === "number") {
          matches.push({ kind: "exact", year: result, ...provenance });
        }
        if (Array.isArray(result)) {
          matches.push({
            kind: "range",
            startYear: result[0],
            endYear: result[1],
            ...provenance,
          });
        }
        continue;
      }
      if (!/^\d{2}$/.test(token) || !rule.earliestYear || !rule.latestYear)
        continue;
      const suffix = Number(token);
      const candidates: number[] = [];
      for (
        let century = Math.floor(rule.earliestYear / 100) * 100;
        century <= rule.latestYear;
        century += 100
      ) {
        const year = century + suffix;
        if (year >= rule.earliestYear && year <= rule.latestYear)
          candidates.push(year);
      }
      if (candidates.length === 1) {
        matches.push({ kind: "exact", year: candidates[0]!, ...provenance });
      }
      if (candidates.length > 1) {
        matches.push({
          kind: "range",
          startYear: Math.min(...candidates),
          endYear: Math.max(...candidates),
          ...provenance,
        });
      }
    }
    const outcomes = new Set(
      matches.map((match) =>
        match.kind === "exact"
          ? `${match.year}:${match.year}`
          : `${match.startYear}:${match.endYear}`,
      ),
    );
    if (outcomes.size > 1)
      return { kind: "unknown", reason: "conflicting_rules" };
    return matches[0] ?? { kind: "unknown", reason: "serial_not_decodable" };
  } catch {
    return { kind: "unknown", reason: "rule_error" };
  }
}

export function resolveManifestModel(
  manifest: CatalogSeedManifest,
  input: ResolveCatalogModelRequest,
): ResolveCatalogModelResponse {
  const manufacturerInput = normalizeOptional(input.manufacturer);
  const modelInput = normalizeOptional(input.model);
  if (!manufacturerInput || !modelInput)
    return { status: "insufficient_input" };

  const manufacturerMatches = manifest.manufacturers.filter((manufacturer) =>
    [manufacturer.name, ...manufacturer.aliases]
      .map(normalizeCatalogIdentity)
      .includes(manufacturerInput),
  );
  if (manufacturerMatches.length === 0) return { status: "unsupported" };
  const matches = manufacturerMatches.flatMap((manufacturer) =>
    manufacturer.models
      .filter((model) =>
        [model.model, ...model.aliases]
          .map(normalizeCatalogIdentity)
          .includes(modelInput),
      )
      .map((model) => ({ manufacturer, model })),
  );
  if (matches.length === 0) return { status: "unsupported" };
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      candidateRevisionIds: matches
        .map(({ model }) => model.revision.id)
        .sort(),
    };
  }
  const { manufacturer, model } = matches[0]!;
  const canonicalManufacturer =
    normalizeCatalogIdentity(manufacturer.name) === manufacturerInput;
  const canonicalModel = normalizeCatalogIdentity(model.model) === modelInput;
  return {
    status: "exact",
    matchKind: canonicalManufacturer && canonicalModel ? "canonical" : "alias",
    revisionId: model.revision.id,
    manufacturer: manufacturer.name,
    model: model.model,
    equipmentClass: model.equipmentClass,
    manufactureDate: evaluateSerialRules(model.serialRules, input.serial),
  };
}
