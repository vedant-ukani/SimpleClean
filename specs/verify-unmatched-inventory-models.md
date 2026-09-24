# verify-unmatched-inventory-models — Verify unmatched existing-inventory models

## Goal

Increase deterministic Catalog coverage for the 36 existing-inventory model
strings that remain unsupported, without weakening exact matching or treating
reseller claims, visual similarity, or undocumented suffix removal as verified
manufacturer evidence. Publish the two exact official matches already found as
an append-only Catalog dataset, keep every remaining string explicitly
classified, and produce a repeatable path for later evidence-backed additions.

## Ticket Summary

- Preserve the approved `official-models.2026-09-23` dataset unchanged.
- Add a new immutable delta dataset containing only newly verified variants,
  sources, revisions, and evidence.
- First approved increment:
  - Huebsch `HFNKCASG115TW01` — washer; exact official Alliance evidence.
  - Maytag `MAH21PDDWW` — washer; exact official Maytag evidence.
- Do not add aliases or canonical variants for the 28 family-only strings.
- Do not auto-correct the 6 unresolved strings.
- Retain official-source URL, title, retrieval date, document revision when
  stated, content checksum when bytes are retained, and field locators.
- Keep secondary-source exact occurrences in the research report only.
- Generate current Inventory coverage from the base dataset plus ordered delta
  datasets while preserving the historical AUT-352 report.
- Re-resolve affected Machines through the existing Catalog/Inventory event
  boundary after the approved delta is imported; do not update Inventory tables
  from an import script.

## Expected Output

- A reviewed immutable Catalog delta that imports after the AUT-352 base
  dataset and adds two approved exact variants.
- `resolveModel` returns exact matches for `HFNKCASG115TW01` and
  `MAH21PDDWW`, including source-backed equipment class and specifications only
  where official evidence exists.
- A current coverage report shows 19 of 53 distinct workbook models matched and
  34 still unsupported; 106 of 227 workbook rows are matched.
- The 34 unresolved strings remain visible with their evidence disposition; no
  family-only string silently becomes an alias.
- Existing Machines keep their pinned historical revisions until the normal
  identity-resolution workflow processes an attributable re-resolution event.

## Non-Goals

- Do not scrape or query the public internet during Intake or model resolution.
- Do not build the ongoing AUT-392 crawler, scheduler, market-comparable
  ingestion, or source-change monitoring in this slice.
- Do not treat a reseller, auction, marketplace, or third-party parts site as
  approval evidence.
- Do not add serial-year decoding without an official, versioned serial rule.
- Do not infer production year from a document date, listing year, or family
  generation.
- Do not overwrite actual Machine dimensions, weight, capacity, nameplate
  identity, worker-selected type, or historical pinned revisions.
- Do not mutate the source Inventory workbook or publish serial values.
- Do not add a fuzzy resolver or punctuation/suffix-stripping normalization.

## Research Baseline

The reviewed follow-up is
`docs/catalog/unmatched-inventory-model-research-2026-09-23.md`.

| Disposition | Distinct strings | Workbook rows | Runtime treatment |
|---|---:|---:|---|
| Existing approved exact/alias | 17 | 99 | Exact Catalog resolution |
| New official exact candidates | 2 | 7 | Add through the new delta |
| Official family-only | 28 | 115 | Keep unsupported |
| No defensible official match | 6 | 6 | Keep unsupported and request evidence |

The family-only and unresolved row counts overlap neither other category; the
36 currently unsupported strings total 128 rows. After this increment, 34
unsupported strings total 121 rows.

## Evidence and Approval Rules

1. A complete model string may become canonical only when the complete string
   appears in an official manufacturer/manufacturer-owned source, or when an
   explicitly approved manufacturer nomenclature rule validates every character
   of the option-coded string.
2. A model alias requires official equivalence evidence or a separately
   attributable approval record. Similar spelling is not equivalence.
3. Family evidence may support a research disposition and follow-up request; it
   cannot make the exact resolver return a family specification for a longer
   unverified string.
4. Every non-null specification field needs field-level official evidence.
   Unsupported fields remain null/empty.
5. A source-byte checksum is recorded only when the reviewed bytes are retained.
   Otherwise record the existing explicit checksum-unavailable reason.
6. New evidence uses new stable source/revision IDs. Existing source or revision
   identity is never repurposed for changed content.
7. Approval is human-attributable. The dataset/import pipeline may validate and
   propose facts but cannot manufacture approval evidence.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `packages/contracts/src/catalog.ts` / `CatalogSeedManifestSchema` | Canonical manifest, source, revision, evidence, spec, and serial-rule validation. |
| `packages/contracts/src/catalog.ts` / `normalizeCatalogIdentity` | Exact identity normalization; must not be broadened. |
| `apps/api/src/modules/catalog/catalog.logic.ts` / `resolveManifestModel` | Deterministic canonical/alias/ambiguous/unsupported resolution. |
| `apps/api/src/modules/catalog/catalog.service.ts` / `catalogManifestChecksum` | Canonical deterministic dataset checksum. |
| `apps/api/src/modules/catalog/catalog.repository.ts` / `importManifest` | Append-only import, immutable identity checks, audit, and approved revisions. |
| `apps/api/src/modules/catalog/catalog.coverage.ts` | Current exact/alias/ambiguous/unsupported workbook benchmark. |
| `apps/api/src/catalog-import.ts` | Existing explicit manifest import entrypoint. |
| `apps/api/src/catalog-coverage.ts` | Read-only workbook coverage generator. |
| `apps/api/catalog-data/official-models.2026-09-23.json` | Immutable AUT-352 base dataset. |
| `apps/api/src/modules/inventory/catalog-enrichment.service.ts` | Existing event-driven Machine re-resolution boundary. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/api/catalog-data/inventory-variants.2026-09-23.json` (new) | Add the two official exact variants, unique source IDs, approved revision IDs, evidence locators, unknown fields, and a valid deterministic checksum. Keep this a delta; do not copy all 297 base variants. |
| `apps/api/src/modules/catalog/catalog.coverage.ts` | Add a small deterministic composition helper for coverage-only projection of ordered, individually validated base/delta manifests. Reject conflicting manufacturer identity, source ID content, model ID content, normalized canonical models, or aliases. Do not change runtime resolution semantics. |
| `apps/api/src/catalog-coverage.ts` | Load the immutable base plus the new delta, verify each checksum, compose them for the workbook benchmark, and write a new current coverage report without replacing `AUT-352-coverage.md`. |
| `apps/api/test/catalog.coverage.test.ts` | Prove base+delta composition, 19/53 current matches, 34 unsupported strings, 227/106/121 row counts, no workbook serial leakage, and conflict rejection. |
| `apps/api/test/catalog.integration.test.ts` | Import base then delta; prove idempotency, two new exact resolutions, approved-only reads, source/evidence visibility, and no change to existing pinned revisions. |
| `apps/api/test/catalog.test.ts` | Add focused exact-resolution assertions for the two new variants and retain unsupported assertions for representative family-only/typo strings. |
| `docs/catalog/inventory-model-coverage.md` (generated) | Current composite coverage report with dataset IDs, per-dataset checksums, model/source totals, distinct and row-weighted Inventory coverage, and all unresolved strings. Never include serials. |
| `docs/catalog/README.md` | Distinguish immutable historical coverage from the current composite report and document the explicit delta import/coverage commands. |

## Files to Reference Only

| File | Why |
|---|---|
| `docs/catalog/AUT-352-coverage.md` | Historical baseline: 17/53 distinct matches. Preserve unchanged. |
| `docs/catalog/AUT-352-source-research.md` | Original source review and conservative evidence policy. |
| `docs/catalog/unmatched-inventory-model-research-2026-09-23.md` | Current 36-string evidence matrix and prioritization. |
| `packages/database/src/schema.ts` | Existing Catalog version/source/evidence tables are sufficient. |
| `apps/api/src/modules/inventory/inventory.repository.ts` | Machine persistence remains Inventory-owned. |
| `source-materials/inventory/Inventory List.xlsx` | Read-only benchmark input. |

## Files Not to Touch

- `apps/api/catalog-data/official-models.2026-09-23.json` — immutable approved
  base dataset.
- Intake recognition providers and policy — recognition must not call Catalog or
  the internet.
- Catalog resolver normalization — no fuzzy or suffix-stripping behavior.
- Inventory source workbook — immutable migration evidence.
- Catalog UI — it already renders approved revisions and evidence; new imported
  revisions should appear through the existing API.
- Database schema/migrations — the existing append-only Catalog schema supports
  this data increment.

## Codegraph Findings (live, this ticket)

- The index is current: 207 files, 3,095 nodes, and 10,129 edges.
- `catalogManifestChecksum` is called by the import/coverage paths and covered by
  Catalog unit and integration tests; reuse it for every delta.
- `CatalogRepository.importManifest` owns atomic persistence, identity conflict
  checks, source/evidence insertion, and the `catalog.snapshot.imported` audit.
- `catalogCoverage` currently evaluates one manifest and deduplicates workbook
  inputs by exact manufacturer/model pair. Composition belongs before this
  function; runtime repository resolution must not gain multi-source guessing.
- The coverage script reads only manufacturer/model values through the bounded
  Inventory parser and already checks that serials never enter the report.
- Catalog list/detail already expose approved revisions and provenance, so no UI
  change is required.
- The working tree contains extensive existing changes. Agent B must modify only
  the files listed above and preserve all unrelated work.

## Reuse Audit

Reused:

- Existing manifest schemas, checksum function, exact resolver, Catalog import
  transaction, source/evidence tables, audit boundary, coverage renderer,
  Inventory workbook parser, Machine resolution events, and Catalog UI.

New code justified because:

- Coverage currently accepts only one manifest, while safe Catalog growth must
  preserve the base and add immutable deltas. A bounded composition helper is
  needed for reporting/tests only.
- A new delta and current composite report are required so historical AUT-352
  artifacts are not rewritten.

Do not duplicate:

- Identity normalization, checksum canonicalization, manifest validation,
  source/evidence validation, resolver status decisions, workbook parsing,
  Machine mutation, or protected Catalog rendering.

Escalated to human:

- None for the first two exact variants. The other 34 strings explicitly remain
  pending evidence; this ticket does not convert uncertainty into a decision.

## Implementation Plan

1. Retain approved copies/checksums of the official Huebsch and Maytag source
   documents and record precise model/equipment/spec locators.
2. Create the immutable delta with the two canonical variants. Populate only
   source-supported specs; leave unsupported dimensions, weight, capacity,
   utilities, production years, and serial rules unknown.
3. Add coverage-only manifest composition with strict conflict detection.
4. Generate the current composite coverage report from the base, delta, and
   read-only workbook.
5. Add unit/coverage/integration tests for import, exact resolution, provenance,
   idempotency, historical pinning, conflict rejection, and privacy.
6. Import the base and delta explicitly in a disposable test database. Production
   import remains a separate operator action using the existing command.
7. After deployment/import, enqueue normal Catalog re-resolution for affected
   Machine identities through the existing event boundary; never patch Machine
   catalog links directly.
8. Continue the document-request queue in descending row impact, beginning with
   `STT30NBCB2G2N02`, `WCAD25KCS-12ECSZ`, `DDAD30KCS-65EC`,
   `DL2X30QSS`, `SCT030QCAFXU400000`, and `SC20BY20U60001`.

## Constraints

- Preserve exact manufacturer and model strings from Inventory.
- Keep source retrieval outside runtime resolution and Intake.
- Treat web results as untrusted research until reviewed against official bytes.
- Respect site terms, robots rules, rate limits, and caching when retrieving
  documents.
- Do not log source bytes, workbook contents, serials, tokens, or full payloads.
- Keep physical Machine measurements authoritative over Catalog defaults; final
  freight uses actual packed measurements.
- Preserve current public contracts and database schema unless implementation
  proves a concrete incompatibility and stops for architectural review.
- Follow `AGENTS.md`, including module ownership and reuse rules.

## Tests Required

- Focused tests:
  - `npm test -w @simply-clean/api -- --run test/catalog.test.ts test/catalog.coverage.test.ts`
  - `npm run test:integration -w @simply-clean/api -- --run test/catalog.integration.test.ts`
- Workspace gates:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run test:integration`
  - `npm run test:browser`
  - `npm run build`

## Done Criteria

- The original AUT-352 dataset and report are byte-for-byte unchanged.
- The delta checksum validates and imports twice without duplication.
- The Catalog contains 299 approved variants after base+delta import.
- `HFNKCASG115TW01` and `MAH21PDDWW` resolve exactly with official provenance.
- Representative family-only strings (`STT30NBCB2G2N02`,
  `WCAD25KCS-12ECSZ`) and likely errors (`DLX30QSS`, `DDAG30KCS-65`) remain
  unsupported.
- Current coverage reports 19/53 distinct matches, 34 unsupported strings, 106
  matched workbook rows, and 121 unsupported rows without exposing serials.
- Existing pinned Machine revisions do not change during import.
- No fuzzy matching, undocumented alias, inferred manufacture year, duplicate
  business rule, schema migration, or unrelated refactor is introduced.
- Focused tests and all workspace gates pass.
