import {
  CatalogSeedManifestSchema,
  normalizeCatalogIdentity,
  type CatalogSeedManifest,
} from "@simply-clean/contracts";
import { createHash } from "node:crypto";
import { resolveManifestModel } from "./catalog.logic.js";
import { catalogManifestChecksum } from "./catalog.service.js";

export const CANONICAL_CATALOG_DATASET_FILES = [
  "official-models.2026-09-23.json",
  "inventory-variants.2026-09-23.json",
  "spec-enrichment-dexter-continental.2026-09-23.json",
  "spec-enrichment-speedqueen-maytag.2026-09-23.json",
  "spec-enrichment-electrolux-huebsch.2026-09-23.json",
  "reviewed-enrichment.2026-09-24.json",
  "dexter-wcvd18kcs-10.2026-09-24.json",
  "manufacturer-aliases.2026-09-24.json",
  "manufacturer-aliases-app-audit.2026-09-24.json",
] as const;

/**
 * A coverage projection is allowed to combine immutable snapshots for
 * reporting, but the runtime resolver still receives one imported snapshot at
 * a time. A later delta may replace an existing model only as an explicit,
 * strictly higher revision with unchanged identity and serial rules.
 */
export function composeCatalogManifests(
  rawManifests: readonly CatalogSeedManifest[],
): CatalogSeedManifest {
  if (rawManifests.length === 0)
    throw new Error("At least one Catalog manifest is required");

  const manifests = rawManifests.map((raw) =>
    CatalogSeedManifestSchema.parse(raw),
  );
  for (const manifest of manifests)
    if (manifest.checksum !== catalogManifestChecksum(manifest))
      throw new Error(
        `Invalid Catalog manifest checksum: ${manifest.datasetId}`,
      );
  const manufacturers = new Map<
    string,
    CatalogSeedManifest["manufacturers"][number]
  >();
  const manufacturerNames = new Map<string, string>();
  const sourceById = new Map<string, string>();
  const modelById = new Map<
    string,
    { manufacturerId: string; model: CatalogSeedModel }
  >();
  const modelKeyByManufacturer = new Map<string, Map<string, string>>();

  for (const manifest of manifests) {
    for (const manufacturer of manifest.manufacturers) {
      const normalizedName = normalizeCatalogIdentity(manufacturer.name);
      for (const identity of [manufacturer.name, ...manufacturer.aliases]) {
        const normalizedIdentity = normalizeCatalogIdentity(identity);
        const existingNameId = manufacturerNames.get(normalizedIdentity);
        if (existingNameId && existingNameId !== manufacturer.id)
          throw new Error(`Conflicting manufacturer identity for ${identity}`);
        manufacturerNames.set(normalizedIdentity, manufacturer.id);
      }

      const existing = manufacturers.get(manufacturer.id);
      if (existing) {
        if (normalizeCatalogIdentity(existing.name) !== normalizedName)
          throw new Error(
            `Conflicting manufacturer identity for ${manufacturer.id}`,
          );
        const knownAliases = new Set(
          existing.aliases.map(normalizeCatalogIdentity),
        );
        for (const alias of manufacturer.aliases) {
          const normalizedAlias = normalizeCatalogIdentity(alias);
          if (!knownAliases.has(normalizedAlias)) {
            existing.aliases.push(alias);
            knownAliases.add(normalizedAlias);
          }
        }
      } else {
        manufacturers.set(manufacturer.id, {
          ...manufacturer,
          aliases: [...manufacturer.aliases],
          sources: [...manufacturer.sources],
          models: [...manufacturer.models],
        });
      }

      for (const source of manufacturer.sources) {
        const content = stableJson(source);
        const previous = sourceById.get(source.id);
        if (previous && previous !== content)
          throw new Error(`Conflicting source content for ${source.id}`);
        if (!previous && existing) existing.sources.push(source);
        sourceById.set(source.id, content);
      }

      const modelKeys =
        modelKeyByManufacturer.get(manufacturer.id) ??
        new Map<string, string>();
      modelKeyByManufacturer.set(manufacturer.id, modelKeys);
      for (const model of manufacturer.models) {
        const content = stableJson(model);
        const previous = modelById.get(model.id);
        if (previous) {
          if (
            previous.manufacturerId !== manufacturer.id ||
            modelIdentity(previous.manufacturerId, previous.model) !==
              modelIdentity(manufacturer.id, model)
          )
            throw new Error(`Conflicting model content for ${model.id}`);

          const previousContent = stableJson(previous.model);
          if (previousContent !== content) {
            if (model.revision.revision <= previous.model.revision.revision)
              throw new Error(`Conflicting model content for ${model.id}`);
            if (!existing)
              throw new Error(`Conflicting model content for ${model.id}`);
            const index = existing.models.findIndex(
              (candidate) => candidate.id === model.id,
            );
            if (index < 0)
              throw new Error(`Conflicting model content for ${model.id}`);
            existing.models[index] = model;
            modelById.set(model.id, {
              manufacturerId: manufacturer.id,
              model,
            });
          }
        } else {
          if (existing) existing.models.push(model);
          modelById.set(model.id, {
            manufacturerId: manufacturer.id,
            model,
          });
        }

        const canonicalKey = normalizeCatalogIdentity(model.model);
        const previousCanonical = modelKeys.get(canonicalKey);
        if (previousCanonical && previousCanonical !== model.id)
          throw new Error(
            `Conflicting normalized canonical model for ${manufacturer.name}: ${model.model}`,
          );
        modelKeys.set(canonicalKey, model.id);
        for (const alias of model.aliases) {
          const aliasKey = normalizeCatalogIdentity(alias);
          const previousAlias = modelKeys.get(aliasKey);
          if (previousAlias && previousAlias !== model.id)
            throw new Error(
              `Conflicting normalized alias for ${manufacturer.name}: ${alias}`,
            );
          modelKeys.set(aliasKey, model.id);
        }
      }
    }
  }

  const datasetId = compositeCatalogDatasetId(manifests);
  const snapshotDate = manifests[manifests.length - 1]!.snapshotDate;
  const composed = {
    datasetId,
    snapshotDate,
    checksum: "0".repeat(64),
    manufacturers: [...manufacturers.values()],
  } satisfies CatalogSeedManifest;
  return CatalogSeedManifestSchema.parse({
    ...composed,
    checksum: catalogManifestChecksum(composed),
  });
}

/**
 * Keep the composed snapshot identity readable without allowing a long input
 * sequence to exceed the Catalog manifest's dataset ID limit.
 */
export function compositeCatalogDatasetId(
  manifests: readonly CatalogSeedManifest[],
): string {
  const orderedIds = manifests.map((manifest) => manifest.datasetId).join("\n");
  const digest = createHash("sha256").update(orderedIds).digest("hex");
  const prefix =
    (manifests[0]?.datasetId ?? "catalog")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "catalog";
  return `catalog-${prefix}-composite-${digest}`;
}

export interface CatalogCoverageInput {
  manufacturer: string;
  model: string;
}

export type CatalogEvidenceDisposition =
  "official_family_only" | "no_defensible_official_match";

type CatalogSeedModel =
  CatalogSeedManifest["manufacturers"][number]["models"][number];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function modelIdentity(
  manufacturerId: string,
  model: CatalogSeedModel,
): string {
  return stableJson({
    manufacturerId,
    modelId: model.id,
    family: model.family,
    model: normalizeCatalogIdentity(model.model),
    aliases: model.aliases.map(normalizeCatalogIdentity),
    equipmentClass: model.equipmentClass,
    serialRules: model.serialRules,
  });
}

/** Reviewed dispositions for the 34 strings still unsupported after the delta. */
export const UNMATCHED_INVENTORY_EVIDENCE_DISPOSITION = {
  "Continental\u0000DDAG30KCS-65": "no_defensible_official_match",
  "Dexter\u0000DDAD30KCS-65EC": "official_family_only",
  "Dexter\u0000DDAD30KCW-65": "official_family_only",
  "Dexter\u0000DDAD50KCS-65": "official_family_only",
  "Dexter\u0000DDAD50KCS-65EC": "official_family_only",
  "Dexter\u0000DJ2X3AA": "no_defensible_official_match",
  "Dexter\u0000DJX3AA": "no_defensible_official_match",
  "Dexter\u0000DL2X300": "official_family_only",
  "Dexter\u0000DL2X30Q": "official_family_only",
  "Dexter\u0000DL2X30QA": "official_family_only",
  "Dexter\u0000DL2X30QSS": "official_family_only",
  "Dexter\u0000DLX30QSS": "no_defensible_official_match",
  "Dexter\u0000WC0300XA-10EC2X-SSBCS-USX": "official_family_only",
  "Dexter\u0000WCAD25KCS-12ECSZ": "official_family_only",
  "Dexter\u0000WCAD40KCB-12US": "official_family_only",
  "Dexter\u0000WCAD45KCS-12ECSZ": "official_family_only",
  "Dexter\u0000WCAD75KCS-12EC": "official_family_only",
  "Electrolux\u0000SP135P2325SNANNUSA": "no_defensible_official_match",
  "Maytag\u0000MLG27PDBWW1": "official_family_only",
  "Speed Queen\u0000SC20BC20U60001": "official_family_only",
  "Speed Queen\u0000SC20BY20U60001": "official_family_only",
  "Speed Queen\u0000SC30BY20U60001": "official_family_only",
  "Speed Queen\u0000SC35MD20U40420": "official_family_only",
  "Speed Queen\u0000SC40BY20U60001": "official_family_only",
  "Speed Queen\u0000SC60BCFXU60001": "official_family_only",
  "Speed Queen\u0000SC60BY20U60001": "official_family_only",
  "Speed Queen\u0000SCT020QCAFXU400000": "official_family_only",
  "Speed Queen\u0000SCT030QCAFXU400000": "official_family_only",
  "Speed Queen\u0000ST075NBCB1G1N05": "official_family_only",
  "Speed Queen\u0000ST075NCDB1G1N04": "official_family_only",
  "Speed Queen\u0000ST075NCDB1G1Q03": "official_family_only",
  "Speed Queen\u0000STT30NBCB2G2N02": "official_family_only",
  "Speed Queen\u0000STT30NBCB2GN02": "official_family_only",
  "Speedqueen\u0000SBCB2G1W01": "no_defensible_official_match",
} as const satisfies Readonly<Record<string, CatalogEvidenceDisposition>>;

export interface CatalogCoverageReportOptions {
  /** Keep the historical renderer available while current reports use a new title. */
  title?: string;
  datasets?: readonly CatalogSeedManifest[];
  unresolvedEvidence?: Readonly<Record<string, CatalogEvidenceDisposition>>;
}

export function catalogCoverage(
  manifest: CatalogSeedManifest,
  input: readonly CatalogCoverageInput[],
) {
  const distinct = new Map<string, CatalogCoverageInput>();
  for (const entry of input)
    distinct.set(`${entry.manufacturer}\u0000${entry.model}`, entry);
  return [...distinct.values()]
    .sort(
      (a, b) =>
        a.manufacturer.localeCompare(b.manufacturer) ||
        a.model.localeCompare(b.model),
    )
    .map((entry) => {
      const result = resolveManifestModel(manifest, entry);
      const classification =
        result.status === "exact"
          ? result.matchKind === "alias"
            ? "alias"
            : "exact"
          : result.status === "ambiguous"
            ? "ambiguous"
            : "unsupported";
      return {
        ...entry,
        classification,
        revisionId: result.revisionId ?? null,
      };
    });
}

export function coverageMarkdown(
  manifest: CatalogSeedManifest,
  input: readonly CatalogCoverageInput[],
  options: CatalogCoverageReportOptions = {},
): string {
  const results = catalogCoverage(manifest, input);
  const escape = (value: string) =>
    value.replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
  const datasets = options.datasets ?? [manifest];
  const rowResults = input.map((entry) => {
    const result = resolveManifestModel(manifest, entry);
    return {
      ...entry,
      classification:
        result.status === "exact"
          ? result.matchKind === "alias"
            ? "alias"
            : "exact"
          : result.status === "ambiguous"
            ? "ambiguous"
            : "unsupported",
    } as const;
  });
  const rowCountByKey = new Map<string, number>();
  for (const entry of input) {
    const key = `${entry.manufacturer}\u0000${entry.model}`;
    rowCountByKey.set(key, (rowCountByKey.get(key) ?? 0) + 1);
  }
  const lines = [
    `# ${options.title ?? "AUT-352 Catalog coverage"}`,
    "",
    `Snapshot: ${manifest.snapshotDate}. Composite dataset: \`${manifest.datasetId}\`.`,
    "",
    "This report composes individually validated, immutable Catalog datasets for a read-only Inventory benchmark. It does not establish undocumented historical completeness or option-code equivalence. Family support never resolves an unverified full variant. Runtime resolution performs no internet lookup.",
    "",
    "Source-content checksums are unavailable where explicitly recorded below. These sources were reviewed through public document extraction; no source-byte checksum is fabricated. The dataset itself has a deterministic SHA-256 checksum.",
    "",
    "| Dataset | Checksum | Models | Sources |",
    "|---|---|---:|---:|",
  ];
  for (const dataset of datasets) {
    const modelCount = dataset.manufacturers.reduce(
      (sum, manufacturer) => sum + manufacturer.models.length,
      0,
    );
    const sourceCount = dataset.manufacturers.reduce(
      (sum, manufacturer) => sum + manufacturer.sources.length,
      0,
    );
    lines.push(
      `| \`${escape(dataset.datasetId)}\` | \`${dataset.checksum}\` | ${modelCount} | ${sourceCount} |`,
    );
  }
  lines.push(
    "",
    "| Manufacturer | Models | Families | Sources | Content checksums unavailable |",
    "|---|---:|---:|---:|---:|",
  );
  for (const manufacturer of manifest.manufacturers)
    lines.push(
      `| ${escape(manufacturer.name)} | ${manufacturer.models.length} | ${new Set(manufacturer.models.map((model) => model.family)).size} | ${manufacturer.sources.length} | ${manufacturer.sources.filter((source) => source.checksum === null).length} |`,
    );
  const totalModels = manifest.manufacturers.reduce(
    (sum, manufacturer) => sum + manufacturer.models.length,
    0,
  );
  const totalSources = manifest.manufacturers.reduce(
    (sum, manufacturer) => sum + manufacturer.sources.length,
    0,
  );
  const serialRules = manifest.manufacturers.reduce(
    (sum, manufacturer) =>
      sum +
      manufacturer.models.reduce(
        (count, model) => count + model.serialRules.length,
        0,
      ),
    0,
  );
  const allModels = manifest.manufacturers.flatMap(
    (manufacturer) => manufacturer.models,
  );
  const numericFields = [
    "widthIn",
    "depthIn",
    "heightIn",
    "weightLb",
    "capacityLb",
  ] as const;
  lines.push(
    "",
    "Specification field coverage (a field is counted only when its value has approved source evidence):",
    "",
    "| Field | Models with a recorded value |",
    "|---|---:|",
  );
  for (const field of numericFields)
    lines.push(
      `| ${field} | ${allModels.filter((model) => model.revision.specs[field] !== null).length} |`,
    );
  for (const field of ["voltage", "phase", "fuel", "configuration"] as const)
    lines.push(
      `| ${field} | ${allModels.filter((model) => model.revision.specs[field].length > 0).length} |`,
    );
  lines.push(
    "",
    `${allModels.filter((model) => numericFields.every((field) => model.revision.specs[field] === null)).length} models have no recorded numerical measurement or capacity. Missing facts remain unknown; model/type coverage is not specification completeness.`,
  );
  lines.push(
    "",
    `Totals: ${manifest.manufacturers.length} manufacturers; ${totalModels} model variants; ${totalSources} sources; ${serialRules} serial-date rules.`,
    "",
    "No verified public serial-year rule was established for the production snapshot. Manufacture year is unknown; model production/generation ranges are a separate field.",
    "",
    `Workbook benchmark: ${new Set(results.map((row) => row.model)).size} distinct model strings; ${results.length} manufacturer/model spellings. Original model strings are retained. Only manufacturer/model values are read into this report; serials and other workbook values are excluded.`,
    "",
    `Row-weighted coverage: ${rowResults.length} Inventory rows; ${rowResults.filter((row) => row.classification === "exact" || row.classification === "alias").length} matched; ${rowResults.filter((row) => row.classification === "unsupported").length} unsupported; ${rowResults.filter((row) => row.classification === "ambiguous").length} ambiguous.`,
  );
  for (const classification of [
    "exact",
    "alias",
    "ambiguous",
    "unsupported",
  ] as const) {
    const group = results.filter(
      (row) => row.classification === classification,
    );
    lines.push(
      "",
      `## ${classification} (${group.length})`,
      "",
      "| Workbook manufacturer | Workbook model | Pinned revision |",
      "|---|---|---|",
    );
    for (const row of group)
      lines.push(
        `| ${escape(row.manufacturer)} | ${escape(row.model)} | ${row.revisionId ?? "—"} |`,
      );
  }
  const unresolved = results.filter(
    (row) => row.classification === "unsupported",
  );
  const unresolvedEvidence = options.unresolvedEvidence;
  const dispositionLabel = (row: (typeof unresolved)[number]) => {
    const disposition =
      unresolvedEvidence?.[`${row.manufacturer}\u0000${row.model}`];
    if (!unresolvedEvidence) return null;
    if (!disposition)
      throw new Error(
        `Missing reviewed evidence disposition for ${row.manufacturer} ${row.model}`,
      );
    return disposition === "official_family_only"
      ? "Official family-only"
      : "No defensible official match";
  };
  const dispositionCounts = unresolved.reduce((counts, row) => {
    const disposition = dispositionLabel(row);
    if (disposition)
      counts.set(disposition, (counts.get(disposition) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  lines.push(
    "",
    "## Unresolved Inventory strings",
    "",
    "These strings remain unsupported because family-only or secondary-source evidence does not authorize an exact variant or alias. See [current source research](unmatched-inventory-model-research-2026-09-23.md) for the reviewed disposition and next evidence request.",
    "",
    ...(unresolvedEvidence
      ? [
          `Reviewed dispositions: ${dispositionCounts.get("Official family-only") ?? 0} Official family-only; ${dispositionCounts.get("No defensible official match") ?? 0} No defensible official match.`,
          "",
        ]
      : []),
    unresolvedEvidence
      ? "| Manufacturer | Inventory model | Rows | Runtime status | Evidence disposition |"
      : "| Manufacturer | Inventory model | Rows | Runtime status |",
    unresolvedEvidence ? "|---|---|---:|---|---|" : "|---|---|---:|---|",
  );
  for (const row of unresolved)
    lines.push(
      unresolvedEvidence
        ? `| ${escape(row.manufacturer)} | ${escape(row.model)} | ${rowCountByKey.get(`${row.manufacturer}\u0000${row.model}`) ?? 0} | unsupported | ${dispositionLabel(row)} |`
        : `| ${escape(row.manufacturer)} | ${escape(row.model)} | ${rowCountByKey.get(`${row.manufacturer}\u0000${row.model}`) ?? 0} | unsupported |`,
    );
  lines.push("", "## Official source registry", "");
  for (const manufacturer of manifest.manufacturers) {
    lines.push(`### ${manufacturer.name}`, "");
    for (const source of manufacturer.sources)
      lines.push(
        `- ${source.id}: [${escape(source.title)}](${source.url}). Retrieved ${source.retrievedAt}; document revision: ${source.documentRevision ?? "not stated"}; content checksum: ${source.checksum ?? `unavailable (${source.checksumUnavailableReason})`}.`,
      );
    lines.push("");
  }
  lines.push(
    "See [source research](AUT-352-source-research.md) for family-only evidence and unresolved variants. Family-only strings remain unsupported in the resolver until exact official evidence is approved.",
    "",
  );
  return lines.join("\n");
}
