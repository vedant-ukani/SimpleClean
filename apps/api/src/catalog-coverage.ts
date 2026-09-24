import {
  CatalogSeedManifestSchema,
  type CatalogSeedManifest,
} from "@simply-clean/contracts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { parseImportFile } from "./modules/imports/import-parser.js";
import {
  CANONICAL_CATALOG_DATASET_FILES,
  composeCatalogManifests,
  coverageMarkdown,
  UNMATCHED_INVENTORY_EVIDENCE_DISPOSITION,
} from "./modules/catalog/catalog.coverage.js";
import { catalogManifestChecksum } from "./modules/catalog/catalog.service.js";

async function main() {
  const datasetUrls = CANONICAL_CATALOG_DATASET_FILES.map(
    (file) => new URL(`../catalog-data/${file}`, import.meta.url),
  );
  const datasets: CatalogSeedManifest[] = [];
  for (const url of datasetUrls)
    datasets.push(
      CatalogSeedManifestSchema.parse(JSON.parse(await readFile(url, "utf8"))),
    );
  for (const dataset of datasets)
    if (dataset.checksum !== catalogManifestChecksum(dataset))
      throw new Error(`Invalid dataset checksum: ${dataset.datasetId}`);
  const manifest = composeCatalogManifests(datasets);
  const workbook = await parseImportFile(
    "Inventory List.xlsx",
    await readFile(
      new URL(
        "../../../source-materials/inventory/Inventory List.xlsx",
        import.meta.url,
      ),
    ),
  );
  const inputs = workbook.rows.flatMap(({ candidate }) =>
    candidate.manufacturer && candidate.model
      ? [{ manufacturer: candidate.manufacturer, model: candidate.model }]
      : [],
  );
  const output = fileURLToPath(
    new URL(
      "../../../docs/catalog/inventory-model-coverage.md",
      import.meta.url,
    ),
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    coverageMarkdown(manifest, inputs, {
      title: "Current Inventory Catalog coverage",
      datasets,
      unresolvedEvidence: UNMATCHED_INVENTORY_EVIDENCE_DISPOSITION,
    }),
  );
  process.stdout.write(
    "Catalog coverage report generated (manufacturer/model values only).\n",
  );
}

main().catch(() => {
  process.stderr.write(
    "Catalog coverage failed; check the reviewed snapshot and read-only workbook.\n",
  );
  process.exitCode = 1;
});
