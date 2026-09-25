import type { CatalogSeedManifest } from "@laundrorama/contracts";

export function catalogImportSummary(
  manifests: readonly CatalogSeedManifest[],
): { manufacturers: number; models: number } {
  const manufacturerIds = new Set<string>();
  const modelIds = new Set<string>();
  for (const manifest of manifests) {
    for (const manufacturer of manifest.manufacturers) {
      manufacturerIds.add(manufacturer.id);
      for (const model of manufacturer.models) modelIds.add(model.id);
    }
  }
  return { manufacturers: manufacturerIds.size, models: modelIds.size };
}
