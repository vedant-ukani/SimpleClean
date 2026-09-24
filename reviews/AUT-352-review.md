# AUT-352 Review

## Status

Pass

## Checks Run

- `npm run catalog:coverage` — pass; regenerated the committed 53-model workbook benchmark report.
- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `npm test` — pass; 203 tests.
- `npm run test:integration` — pass.
- `npm run build` — pass.
- `npm run test:browser` — pass; 22 journeys passed and 2 existing journeys were skipped.
- `npm run catalog:import` twice against a disposable migrated database — pass; the first run imported the snapshot and the second was an idempotent no-op.
- `git diff --check` — pass.

## Findings

1. Catalog list/detail authorization originally existed only in controller guards. Fixed by passing current identity into the owning service and rechecking active `catalog.read` permission; revision IDs are now bounded at the service boundary.
2. Catalog identity normalization was duplicated. Fixed by making the contracts helper canonical and reusing it in manifest validation, resolution, and persistence.
3. Intake originally attempted Catalog enrichment for every Candidate. Fixed by requiring the current item to have an accepted `ready` recognition result and a confirmed Candidate before suggesting a type.
4. Distinct current serial rules could originally return the first conflicting year. Fixed by evaluating every latest rule revision and returning explicit `conflicting_rules` unknown when outcomes disagree.
5. Serial manufacture dates originally pinned only a rule ID. Fixed by preserving rule revision, source ID, and locator in the result, stored Machine resolution, and UI.
6. A browser Intake race could exhaust a single version-conflict retry while recognition advanced the Batch. Fixed with a bounded conflict-only retry that refreshes the authoritative version and never reuploads the file.

## Reuse / Slop Audit

- Duplicated logic: none remaining in the reviewed Catalog identity/classification decisions.
- Missed reuse: none remaining; authorization, outbox/audit, Intake readiness evidence, Inventory identity events, and existing web synchronization patterns are reused.
- Style mismatches: none requiring changes after lint and independent standards review.
- Unnecessary complexity: none identified. Unknown facts stay unknown; no fuzzy matching, runtime scraping, or speculative serial decoding was added.

## New Reusable Thing Created?

- Yes — the Catalog module and shared Catalog contracts now own exact model resolution, source-backed revisions, canonical Catalog identity normalization, and equipment-class mapping. The Architecture Reuse Map is updated.

## Required Fixes

1. None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes; mark Catalog contracts and shared decisions as implemented.
- `DECISIONS.md` — no; the separate, approved Catalog authority decision was already recorded.
- `PRODUCT.md` — no; product scope did not change.
- `AGENTS.md` — no; workflow and coding rules did not change.
- `ROADMAP.md` — yes; move AUT-352 to Completed.
- `specs/index.md` — yes; mark AUT-352 completed.
