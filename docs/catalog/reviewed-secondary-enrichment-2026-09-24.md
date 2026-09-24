# Reviewed Catalog enrichment — 2026-09-24

This review adds one immutable `reviewed_snapshot` delta after the five earlier canonical datasets: [reviewed-enrichment.2026-09-24.json](../../apps/api/catalog-data/reviewed-enrichment.2026-09-24.json). It adds 165 previously unknown numerical fields on 39 existing exact model variants. The latest approved Catalog still has 299 models; 140 have no recorded width, depth, height, weight, or capacity. Every new value has a field-level locator and source. The original identity, aliases, serial rules, populated facts, and evidence are carried into a strictly higher revision.

| Manufacturer | Models enriched | Newly filled fields |
|---|---:|---:|
| Continental Girbau | 3 | 7 |
| Dexter | 2 | 7 |
| Speed Queen | 1 | 4 |
| Maytag Commercial | 13 | 55 |
| Electrolux Professional | 20 | 92 |
| Total | 39 | 165 |

The reviewed sources add 33 unique documents or pages. Exact URLs, titles, dates, source classes, and field locators are in the dataset. Source content checksums are explicitly unavailable where document bytes were not retained. The dataset itself has a deterministic SHA-256 checksum.

## Source policy

The automatic Catalog discovery path remains governed by [ADR 0017](../adr/0017-automatic-official-source-catalog-discovery.md) and [ADR 0018](../adr/0018-vision-assisted-intake-and-documented-base-models.md): it may publish only policy-passing official manufacturer evidence. This delta was separately reviewed and imported as a `reviewed_snapshot`. A distributor, reseller, or archived manual can supply a reviewed fact when the exact Catalog model and machine measurement are identified and the value is not in conflict with existing evidence. Such a source does not become an allowed automatic-discovery host.

Seller corroboration needs review because listings can reuse family specifications, describe a configured or used unit, or confuse shipping size with machine size. The Dexter WCVD measurements accepted here have both a distributor specification row and a separate exact-model reseller product overview. The Maytag MDE28/MDG28 measurements come from an authorized distributor specification sheet, and the MLE27/MLG27 dimensions and uncrated weight come from an archived manufacturer manual hosted by a third party. Their source classes are `distributor`, `reseller`, and `third_party`, respectively. No marketplace-only lead was promoted.

## Deliberate exclusions

- Electrolux WH6-6 has conflicting source values and received no revision. TD6-7LAC and TD6-20LAC depth varies by fuel; their scalar depth remains unknown. Dryer capacity varies with fill ratio, so no scalar capacity was added for the researched TD6 models.
- Continental EH190 and EH255 have Stat/Tilt dimension and weight differences. Only their common rated capacity was added. The KWN values describe machine dimensions and net weight, not shipping measurements.
- Dexter WCVD25KCS-12 depth had only one usable secondary source, and WCVD40KCS-12 had a weight conflict. Neither value was added. The already populated WCVD capacity remained untouched.
- Speed Queen ST025/ST030/ST035/ST055 already had the stable dimensions and capacities. Their weights vary by configuration. ST050/ST075 had non-null dimensions that differ from the newly found brochure, so the prior revisions were preserved. STT55 weight depends on configuration; only its stable dimensions and per-pocket capacity were added.
- Maytag MDE28/MDG28 height and weight vary between coin and non-coin versions. MLE26/MLG26 and MLE27/MLG27 capacity was not inferred from a kilogram claim or another configuration.
- Unsupported Inventory strings, family-only evidence, marketplace-only offers, and disputed scalar fields remain unknown. No new model identity or alias was created.

The current [Inventory coverage report](inventory-model-coverage.md) lists the canonical datasets and shows exact/alias coverage against the read-only workbook. Existing Machine links remain pinned to their earlier revision; future resolutions can use this new one.
