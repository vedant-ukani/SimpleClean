# Reviewed Catalog snapshots

Run `npm run db:migrate` against the intended database, then `npm run catalog:import` to import the code-reviewed snapshot. Running the import again with identical dataset content is a no-op. Changing the checksum/content under an existing dataset ID is rejected; corrections require a new dataset and specification revision. Import is an explicit system action with audit/outbox records, and no HTTP mutation or silent approval endpoint exists.

`AUT-352-coverage.md` is the immutable historical baseline from the original
approved snapshot and must not be regenerated for later Catalog additions.
Run `npm run catalog:coverage` to generate the current composite report at
[inventory-model-coverage.md](inventory-model-coverage.md) from the immutable
workbook, the approved base dataset, and ordered delta datasets. The report
contains manufacturer/model strings only. [Source research](AUT-352-source-research.md)
distinguishes exact evidence from family-only support.

With no arguments, `npm run catalog:import` imports the canonical sequence in
order: `official-models.2026-09-23.json`,
`inventory-variants.2026-09-23.json`,
`spec-enrichment-dexter-continental.2026-09-23.json`,
`spec-enrichment-speedqueen-maytag.2026-09-23.json`,
`spec-enrichment-electrolux-huebsch.2026-09-23.json`,
`reviewed-enrichment.2026-09-24.json`, and
`manufacturer-aliases.2026-09-24.json`. The final alias-only delta adds
approved Dexter and Continental Girbau nameplate labels after the model
revisions. To import a reviewed subset, pass one or more explicit paths; they
are imported in the order given,
for example `npm run catalog:import -- catalog-data/official-models.2026-09-23.json catalog-data/inventory-variants.2026-09-23.json`.
Repeating an import with identical content is a no-op; changed content under an
existing dataset ID is rejected. Later deltas may overlay only a strictly
higher revision with unchanged model identity and serial rules.

The reviewed manufacturer label matrix and exclusions are recorded in
[manufacturer-alias-review-2026-09-24.md](manufacturer-alias-review-2026-09-24.md).

Source content hashes are nullable only with an explicit unavailability reason. Verified checksums are computed from retrieved document bytes; sources reviewed without those bytes remain explicitly unavailable. The coverage report lists both counts. URL hashes are never presented as document hashes. The entire reviewed manifest retains a deterministic SHA-256 checksum, including each source's checksum availability information.

No publicly verified serial-year rules were established. Manufacture year remains unknown. A model generation/production range is not a physical Machine's manufacture date.

Machine create/identity-update outbox events resolve current identity and pin an approved revision. Repeated or older events cannot replace a pinned revision for unchanged identity. New snapshots affect future identity resolutions; existing links remain reproducible, including after their revisions are superseded. While an identity change awaits processing, the API hides stale Catalog facts. Catalog failure does not block Intake or Inventory-owned actual measurements.

Catalog values are shared defaults. Actual width, depth, height, and weight belong to Inventory, are version checked, and produce attributable audit/outbox records. Machine-specific `capacityLb` wins over Catalog capacity. Unknown, ambiguous, and family-only matches never populate identity or the worker's Machine-type selection.
