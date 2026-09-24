import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { parseServerEnvironment } from "@simply-clean/config";
import { readFile } from "node:fs/promises";
import { AppModule } from "./app.module.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { CANONICAL_CATALOG_DATASET_FILES } from "./modules/catalog/catalog.coverage.js";
import { catalogImportSummary } from "./catalog-import-summary.js";
import type { CatalogSeedManifest } from "@simply-clean/contracts";

async function main() {
  const explicitPaths = process.argv.slice(2);
  const manifestPaths: (string | URL)[] = explicitPaths.length
    ? explicitPaths
    : CANONICAL_CATALOG_DATASET_FILES.map(
        (file) => new URL(`../catalog-data/${file}`, import.meta.url),
      );
  const app = await NestFactory.createApplicationContext(
    AppModule.register({
      ...parseServerEnvironment(process.env),
      operationsWorkerPollingEnabled: false,
    }),
    { logger: false },
  );
  try {
    const catalog = app.get(CatalogService);
    const manifests: CatalogSeedManifest[] = [];
    for (const manifestPath of manifestPaths) {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const datasetId = String(manifest.datasetId ?? "unknown");
      const result = await catalog.importManifest(manifest);
      manifests.push(manifest);
      process.stdout.write(
        `${result.imported ? "Imported" : "Already imported"} ${datasetId}: ${result.manufacturers} manufacturers, ${result.models} models.\n`,
      );
    }
    const { manufacturers, models } = catalogImportSummary(manifests);
    process.stdout.write(
      `Catalog import total: ${manifestPaths.length} datasets, ${manufacturers} manufacturers, ${models} models.\n`,
    );
  } finally {
    await app.close();
  }
}

main().catch(() => {
  process.stderr.write(
    "Catalog import failed; check snapshot validation, database migration, and dataset identity.\n",
  );
  process.exitCode = 1;
});
