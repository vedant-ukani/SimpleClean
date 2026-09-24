import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { parseServerEnvironment } from "@simply-clean/config";
import {
  CATALOG_SPECIFICATION_ENRICHMENT_FIELDS,
  missingCatalogSpecificationFields,
  normalizeCatalogIdentity,
  type CatalogModelDetail,
} from "@simply-clean/contracts";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { AppModule } from "./app.module.js";
import {
  CatalogService,
  catalogSpecificationCoverage,
  type CatalogSpecificationBackfillScope,
  type CatalogSpecificationBackfillSelection,
  type CatalogSpecificationCoverage,
} from "./modules/catalog/catalog.service.js";
import { parseImportFile } from "./modules/imports/import-parser.js";

export interface CatalogBackfillOptions {
  scope: CatalogSpecificationBackfillScope;
  execute: boolean;
  maxModels: number;
}

export interface CatalogBackfillSummary {
  selected: number;
  attempted: number;
  published: number;
  noResult: number;
  reused: number;
  failed: number;
  estimatedProviderCostUsd: number;
  coverageBefore: CatalogSpecificationCoverage;
  coverageAfter: CatalogSpecificationCoverage;
}

export interface CatalogBackfillDependencies {
  catalog: Pick<
    CatalogService,
    | "resolveModel"
    | "previewSpecificationBackfill"
    | "assertSpecificationEnrichmentAvailable"
    | "requestSpecificationEnrichment"
  >;
  inventoryIdentities: readonly { manufacturer: string; model: string }[];
  writeOutput: (text: string) => void;
  writeError: (text: string) => void;
}

export function parseCatalogBackfillArgs(
  args: readonly string[],
): CatalogBackfillOptions {
  let scope: CatalogSpecificationBackfillScope | undefined;
  let execute = false;
  let maxModels: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      if (execute) throw new Error("--execute may be specified only once");
      execute = true;
      continue;
    }
    if (argument === "--scope") {
      const value = args[++index];
      if (scope || (value !== "inventory" && value !== "all"))
        throw new Error("--scope must be inventory or all");
      scope = value;
      continue;
    }
    if (argument === "--max-models") {
      const value = args[++index];
      if (maxModels !== undefined || !value || !/^[1-9]\d*$/.test(value))
        throw new Error("--max-models must be a positive integer");
      maxModels = Number(value);
      if (!Number.isSafeInteger(maxModels))
        throw new Error("--max-models must be a positive integer");
      continue;
    }
    throw new Error(`Unknown Catalog backfill argument: ${argument ?? ""}`);
  }
  if (!scope) throw new Error("--scope is required");
  if (maxModels === undefined) throw new Error("--max-models is required");
  return { scope, execute, maxModels };
}

function formatCoverage(coverage: CatalogSpecificationCoverage): string {
  return CATALOG_SPECIFICATION_ENRICHMENT_FIELDS.map(
    (field) => `${field}=${coverage.known[field]}/${coverage.total}`,
  ).join(" ");
}

function coverageFromDetails(
  details: readonly CatalogModelDetail[],
): CatalogSpecificationCoverage {
  const candidates = details.map((detail) => ({
    variantId: detail.modelId,
    baseRevisionId: detail.revisionId,
    revision: detail.revision,
    manufacturerId: detail.manufacturerId,
    manufacturer: detail.manufacturer,
    family: detail.family,
    model: detail.model,
    equipmentClass: detail.equipmentClass,
    specs: detail.specs,
    productionStartYear: detail.productionStartYear,
    productionEndYear: detail.productionEndYear,
    missingFields: missingCatalogSpecificationFields(detail),
  }));
  return catalogSpecificationCoverage(candidates);
}

async function inventoryPriorityVariantIds(
  catalog: CatalogBackfillDependencies["catalog"],
  identities: CatalogBackfillDependencies["inventoryIdentities"],
): Promise<Set<string>> {
  const variants = new Set<string>();
  const distinct = new Map<string, { manufacturer: string; model: string }>();
  for (const identity of identities)
    distinct.set(
      `${normalizeCatalogIdentity(identity.manufacturer)}\u0000${normalizeCatalogIdentity(identity.model)}`,
      identity,
    );
  for (const identity of distinct.values()) {
    const resolution = await catalog.resolveModel(identity);
    if (resolution.result.status === "exact" && resolution.detail)
      variants.add(resolution.detail.modelId);
  }
  return variants;
}

async function currentDetails(
  catalog: CatalogBackfillDependencies["catalog"],
  selections: readonly CatalogSpecificationBackfillSelection[],
): Promise<CatalogModelDetail[]> {
  const details: CatalogModelDetail[] = [];
  for (const selection of selections) {
    const resolution = await catalog.resolveModel({
      manufacturer: selection.manufacturer,
      model: selection.model,
    });
    if (resolution.result.status === "exact" && resolution.detail)
      details.push(resolution.detail);
  }
  return details;
}

export async function runCatalogBackfill(
  options: CatalogBackfillOptions,
  dependencies: CatalogBackfillDependencies,
): Promise<CatalogBackfillSummary> {
  const inventoryVariants = await inventoryPriorityVariantIds(
    dependencies.catalog,
    dependencies.inventoryIdentities,
  );
  const preview = await dependencies.catalog.previewSpecificationBackfill(
    options.scope,
    inventoryVariants,
    options.maxModels,
  );
  dependencies.writeOutput(
    `Selected ${preview.selected.length} incomplete Catalog model(s).\n`,
  );
  for (const selection of preview.selected)
    dependencies.writeOutput(
      `${selection.manufacturer} — ${selection.model}\n`,
    );
  dependencies.writeOutput(
    `Coverage before: ${formatCoverage(preview.coverage)}\n`,
  );

  const summary: CatalogBackfillSummary = {
    selected: preview.selected.length,
    attempted: 0,
    published: 0,
    noResult: 0,
    reused: 0,
    failed: 0,
    estimatedProviderCostUsd: 0,
    coverageBefore: preview.coverage,
    coverageAfter: preview.coverage,
  };
  if (options.execute) {
    dependencies.catalog.assertSpecificationEnrichmentAvailable();
    const countedRuns = new Set<string>();
    for (const selection of preview.selected) {
      summary.attempted += 1;
      try {
        const result =
          await dependencies.catalog.requestSpecificationEnrichment(
            selection.variantId,
            {
              requestId: `catalog-backfill:${selection.baseRevisionId}`,
            },
          );
        if (result.outcome === "published") summary.published += 1;
        else if (result.outcome === "reused") summary.reused += 1;
        else summary.noResult += 1;
        if (
          result.outcome !== "reused" &&
          result.run &&
          !countedRuns.has(result.run.id)
        ) {
          countedRuns.add(result.run.id);
          summary.estimatedProviderCostUsd += result.run.estimatedCostUsd;
        }
      } catch {
        summary.failed += 1;
        dependencies.writeError(
          `Catalog backfill failed for ${selection.manufacturer} — ${selection.model}.\n`,
        );
        break;
      }
    }
    summary.coverageAfter = coverageFromDetails(
      await currentDetails(dependencies.catalog, preview.selected),
    );
  }
  dependencies.writeOutput(
    `Coverage after: ${formatCoverage(summary.coverageAfter)}\n`,
  );
  dependencies.writeOutput(
    `Summary: selected=${summary.selected} attempted=${summary.attempted} published=${summary.published} no-result=${summary.noResult} reused=${summary.reused} failed=${summary.failed} estimated-provider-cost-usd=${summary.estimatedProviderCostUsd.toFixed(6)}\n`,
  );
  return summary;
}

async function main(): Promise<void> {
  const options = parseCatalogBackfillArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(
    AppModule.register({
      ...parseServerEnvironment(process.env),
      operationsWorkerPollingEnabled: false,
    }),
    { logger: false },
  );
  try {
    const workbook = await parseImportFile(
      "Inventory List.xlsx",
      await readFile(
        new URL(
          "../../../source-materials/inventory/Inventory List.xlsx",
          import.meta.url,
        ),
      ),
    );
    const inventoryIdentities = workbook.rows.flatMap(({ candidate }) =>
      candidate.manufacturer && candidate.model
        ? [{ manufacturer: candidate.manufacturer, model: candidate.model }]
        : [],
    );
    const summary = await runCatalogBackfill(options, {
      catalog: app.get(CatalogService),
      inventoryIdentities,
      writeOutput: (text) => process.stdout.write(text),
      writeError: (text) => process.stderr.write(text),
    });
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url))
  main().catch(() => {
    process.stderr.write(
      "Catalog backfill failed; check arguments, provider configuration, and database state.\n",
    );
    process.exitCode = 1;
  });
