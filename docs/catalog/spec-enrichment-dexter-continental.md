# Reviewed Catalog enrichment — Dexter and Continental Girbau

Snapshot date: 2026-09-23

This reviewed, immutable delta is [spec-enrichment-dexter-continental.2026-09-23.json](../../apps/api/catalog-data/spec-enrichment-dexter-continental.2026-09-23.json). It carries the original manufacturer/model identity, family, aliases, equipment class, serial rules, facts, and evidence, then adds a revision only where an exact-model official manufacturer document supported a previously missing field.

## Counts

| Measure                                                               |                                 Count |
| --------------------------------------------------------------------- | ------------------------------------: |
| Existing Dexter and Continental Girbau models examined                | 94 (51 Dexter; 43 Continental Girbau) |
| Models enriched in this delta                                         |  16 (2 Dexter; 14 Continental Girbau) |
| Newly filled fields                                                   |                                   107 |
| Models still incomplete for at least one requested field              |                                    94 |
| Models still incomplete for at least one non-year specification field |                                    75 |

Newly filled fields by field: width 15, depth 15, height 15, weight 15, capacity 15, voltage 7, phase 8, fuel 2, configuration 15, productionStartYear 0, productionEndYear 0.

Enriched models are Dexter T-1800 and T-170; Continental Girbau EH020, EH030, EH040, EH060, EH070, EH080, EH090, EH130, GS023, REM025, RMG033, RMG040, RMG055, and RMG070.

## Official source URLs

Dexter:

- https://www.dexter.com/upl/downloads/products/documents/69d66b1b5e087257812e0.pdf — T-1800 Express O-Series Washer Specifications.
- https://www.dexter.com/upl/downloads/products/documents/68228e5157fc302778bf6.pdf — T-170 Express 6-Cycle Dryer Specifications.

Continental Girbau:

- https://continental-laundry.com/wp-content/uploads/2023/10/ExpressWashBrochure.pdf — EH020, EH030, EH040, EH060, EH080, EH090, and EH130 product-specification table.
- https://continental-laundry.com/wp-content/uploads/2024/04/EH070A-OPL.pdf — EH070 product specifications.
- https://continental-laundry.com/wp-content/uploads/2023/10/GS023A.pdf — GS023 product specifications.
- https://continental-laundry.com/wp-content/uploads/2024/01/REM025A-SLS.pdf — REM025 product specifications.
- https://continental-laundry.com/wp-content/uploads/2025/05/RMG033A-PTC.pdf — RMG033 product specifications.
- https://continental-laundry.com/wp-content/uploads/2025/05/RMG040A-PTC.pdf — RMG040 product specifications.
- https://continental-laundry.com/wp-content/uploads/2025/05/RMG055A-PTC.pdf — RMG055 product specifications.
- https://continental-laundry.com/wp-content/uploads/2023/10/RMG070A-OPL.pdf — RMG070 product specifications.

## Review limitations

- No exact official document established production start or end years for any examined model; all 94 models therefore remain incomplete on at least one requested field.
- Dexter T-55 and the older Dexter WC/DD/DL/DR/SC families remained unchanged because the reviewed official pages and documents did not provide defensible exact-model specifications for the canonical records without relying on a family or similar model.
- Continental EH190 and EH255 documents identified `EH190 Stat` and `EH255 Stat` variants, not the canonical unsuffixed model records, so they were not used as exact-model evidence.
- Existing non-empty facts were not replaced when a newly retrieved document presented a different value. For example, GS models with already populated dimensions or configuration were not included merely to restate or reconcile them.
- Fuel and configuration were added only when the exact document explicitly described the model or its exact product line; no family-level fuel inference was made.
