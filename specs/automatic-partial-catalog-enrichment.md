# Automatic enrichment for exact but incomplete Catalog matches

## Status

Completed and verified on 2026-09-24.

## Issue

An accepted Intake identity can resolve to an exact approved Catalog variant whose
latest approved revision contains only some specifications. `CatalogService`
previously stopped as soon as it found that exact match. It therefore did not invoke
the existing specification-enrichment workflow for the fields that remain
unknown.

The production example is Dexter model `WCVD40KCS-12` (40 lb washer), serial
`20401000466713`. The exact alias resolves to Catalog revision
`dexter-wcvd40kcs-12-r1`, which contains capacity, voltage, and phase but has no
approved height, width, depth, or weight. The Intake identity and Catalog match
are valid; the defect is that the asynchronous workflow treats “exact” as
equivalent to “complete.”

The official Dexter T-600 C-Series specification sheet contains dimensions and
weight for a related 40 lb product, but `T-600` is not an ADR 0018-safe anchored
leading base model of `WCVD40KCS-12`. Those values must not be copied into the
exact variant. The exact WCVD manual confirms the exact model code and product
class but does not provide the missing dimensional/weight facts. The correct
result is therefore to search official sources for the missing exact-model facts
and preserve them as unknown when strict evidence is unavailable.

## Ticket summary

When automatic Catalog discovery receives an accepted identity that resolves to
an exact approved variant, inspect the latest revision for missing specification
fields. If it is incomplete and live discovery is available, run the existing
additive specification-enrichment workflow for only those missing fields before
returning. Never replace known facts, weaken evidence policy, infer related-family
values, or make Intake commit depend on enrichment success.

## Acceptance criteria

1. An exact Catalog match with complete specifications returns immediately and
   makes no provider request.
2. An exact Catalog match with missing specification fields asks the existing
   specification-enrichment path for only those missing fields when discovery is
   configured and enabled.
3. A verified provider result creates one immutable additive revision on the same
   variant, carries forward existing facts and evidence, and publishes only the
   requested missing facts.
4. The request returns the newly published revision when enrichment succeeds.
5. A no-result response, an already-running/reusable run, disabled discovery, or
   unavailable provider configuration leaves the exact approved partial revision
   usable and visible.
6. A provider exception records the failed discovery run and remains retryable by
   the Operations outbox. The Machine must still be linked to the exact approved
   partial revision before the event is retried.
7. Recognition-completed and Machine-created events may both request enrichment,
   but the existing dedupe key prevents duplicate provider charges or duplicate
   revisions for the same base revision and missing-field set.
8. Candidate and Machine reads stay read-only. They may observe the last approved
   revision but never initiate provider work.
9. Existing Machines remain pinned to their recorded Catalog revision. A later
   additive revision is used by future resolutions; this ticket does not silently
   repoint historical Machine links.
10. Exact/full-model or ADR 0018-safe anchored leading-base-model official
    evidence remains mandatory. Related product series, class similarity,
    third-party listings, and search snippets cannot auto-publish facts.
11. No database migration or destructive Catalog seed rewrite is introduced.
12. Automated tests cover complete, successful partial, no-result/reused,
    disabled-provider, failure-and-retry, dedupe, and Machine-link behavior.

## Expected product behavior

| Existing exact revision | Discovery state | Workflow result |
| --- | --- | --- |
| Complete | Any | Return existing revision; do not search |
| Incomplete | Disabled or unavailable | Return existing partial revision |
| Incomplete | Verified missing facts | Publish and return additive revision |
| Incomplete | No verified facts | Return existing partial revision and retain no-result run |
| Incomplete | Run already active/completed | Reuse run; return its published revision when present, otherwise existing partial revision |
| Incomplete | Provider throws | Link the Machine to the existing exact revision, then let the outbox retry the failed enrichment |

The word “verified” continues to mean that every displayed fact is approved and
sourced. It does not mean every possible specification field is populated.

## Non-goals

- Guessing height, width, depth, or weight from capacity or equipment class.
- Treating the Dexter T-600 C-Series sheet as exact WCVD evidence.
- Changing recognition, OCR, accepted manufacturer/model text, or Machine identity.
- Updating physical Machine actual overrides.
- Automatically repointing Machines already pinned to an older approved revision.
- Adding a broad crawler, general third-party search policy, or approval bypass.
- Making live provider calls part of deterministic CI gates.
- Changing the Catalog UI solely to label partial records; existing unknown-value
  presentation remains valid.

## Existing behavior to reuse

| Decision | Canonical implementation |
| --- | --- |
| Exact identity and alias resolution | `CatalogService.resolveModel` and Catalog repository resolution |
| Missing-field calculation | `missingCatalogSpecificationFields` and `CATALOG_SPECIFICATION_ENRICHMENT_FIELDS` |
| Incomplete latest-revision context | `CatalogRepository.specificationEnrichmentContext` |
| Additive provider request and dedupe | `CatalogService.requestSpecificationEnrichment` |
| Official-host and exact/base evidence policy | `verifyCatalogDiscovery`, ADR 0017, and ADR 0018 |
| Immutable publication | `CatalogRepository.publishSpecificationEnrichment` |
| Retryable asynchronous trigger | Operations outbox and `CatalogEnrichmentService` |
| Read-only candidate lookup | `CatalogService.enrichmentForIdentity` |
| Bounded operator backfill | `apps/api/src/catalog-backfill.ts` |

No second enrichment algorithm, missing-field list, source policy, or publication
path may be added.

## Codegraph findings

- `requestDiscovery` is called by the Inventory Catalog enrichment event handler
  for recognition completion, Machine creation, and Machine identity update.
- `requestSpecificationEnrichment` is currently called only by the bounded
  backfill command and tests.
- The exact-match early return in `requestDiscovery` is the missing runtime edge.
- `enrichmentForIdentity` is a read path and must not gain a provider side effect.
- The expected change has narrow blast radius in Catalog orchestration, Inventory
  event ordering, and Catalog/Intake integration coverage.

## Files to modify

### `apps/api/src/modules/catalog/catalog.service.ts`

- Add a private availability predicate for automatic specification enrichment.
  Reuse it in `assertSpecificationEnrichmentAvailable` so the operator command
  retains its explicit configuration error while runtime discovery can safely
  preserve an existing exact revision when enrichment is unavailable.
- Replace the exact-match early return in `requestDiscovery` with this decision:
  - if the exact revision is complete, return it unchanged;
  - if incomplete and enrichment is unavailable, return it unchanged;
  - if incomplete and available, call `requestSpecificationEnrichment` using the
    exact revision's variant ID and the current request ID;
  - return a newly published/reused published revision when one exists;
  - otherwise return the pre-existing exact partial revision, with the relevant
    discovery run when available.
- Do not call enrichment recursively, alter `enrichmentForIdentity`, or broaden
  evidence validation.

### `apps/api/src/modules/inventory/catalog-enrichment.service.ts`

- For Machine create/identity-update events, guarantee that deterministic
  resolve-and-link runs against the unchanged current Machine even if the live
  enrichment attempt throws.
- After linking the existing exact revision, rethrow the provider failure so the
  outbox retains normal retry/dead-letter behavior.
- Preserve the version fence before writing a Machine resolution.
- Recognition-completed events remain provider-only and may retry normally; they
  do not own a Machine link yet.

### `apps/api/test/catalog.integration.test.ts`

- Add or extend integration cases proving runtime exact-partial orchestration,
  requested missing fields, additive publication, preservation of existing facts,
  no provider call for complete records, disabled behavior, reused/no-result runs,
  and dedupe across repeated calls.
- Assert that unsafe related-family evidence cannot publish missing facts.

### Inventory event integration test owning `CatalogEnrichmentService`

- Prove that a Machine with an exact partial Catalog match is linked even when the
  enrichment provider fails.
- Prove that the event still fails for retry after the link is persisted.
- Prove that a successful enrichment is linked at the newest approved revision.

## Reference-only files

- `specs/catalog-specification-backfill.md`
- `apps/api/src/modules/catalog/catalog.repository.ts`
- `apps/api/src/modules/catalog/discovery/catalog-discovery.policy.ts`
- `packages/contracts/src/catalog.ts`
- `docs/adr/0017-automatic-official-source-catalog-discovery.md`
- `docs/adr/0018-vision-assisted-intake-and-documented-base-models.md`
- `ARCHITECTURE.md`
- `CONTEXT.md`

## Files not to change

- Database schema and migrations.
- Intake recognition providers and prompts.
- Existing immutable Catalog revision rows or historical Machine resolution rows.
- Inventory source spreadsheets.
- Catalog web pages unless a failing acceptance test exposes a separate defect.

## Implementation sequence

1. Add focused failing tests for exact-complete and exact-partial runtime discovery.
2. Add the availability predicate and exact-partial branch to `requestDiscovery`.
3. Reuse `requestSpecificationEnrichment`; do not duplicate its request,
   verification, dedupe, cost, audit, or publication logic.
4. Add Machine-event failure-ordering coverage, then make linking resilient while
   preserving outbox retry semantics.
5. Run targeted Catalog and Inventory integration tests.
6. Run lint, typecheck, unit tests, all integration tests, browser tests, and build.
7. Exercise the exact Dexter variant once through the live bounded enrichment path.
   Accept `no_result` as correct unless strict official exact/base evidence is
   returned. Do not manually import related T-600 dimensions.
8. Restart the deployed review application and verify Intake and Catalog behavior.

## Verification requirements

- Provider test doubles must assert the request includes manufacturer, canonical
  exact model, equipment class, and only currently missing fields.
- Deterministic tests must assert existing non-null values and evidence are byte-for-
  byte stable in the new revision.
- Concurrency/repeat tests must assert one provider reservation/publication per
  dedupe key.
- A no-result run must be reusable without another provider call until the normal
  dedupe/version inputs change.
- Live verification must report what was found and which fields remain unknown; a
  missing field is not a failure when the official evidence policy rejects it.

## Documentation updates after acceptance

- Update the Catalog enrichment convention in `ARCHITECTURE.md` to state that an
  exact approved partial revision triggers additive missing-field discovery while
  remaining immediately usable.
- Record the refinement in `DECISIONS.md`: exact identity resolution and
  specification completeness are separate decisions; enrichment never weakens
  exact-match usability or official-source policy.
- Mark this specification completed in `specs/index.md` only after tests and live
  verification pass.

## Done criteria

- Every acceptance criterion has automated evidence.
- The Dexter example has been exercised through the implemented runtime path.
- Any published facts have exact or ADR 0018-safe official evidence and immutable
  provenance; otherwise dimensions and weight remain explicitly unknown.
- Existing Catalog and Intake workflows still pass full verification.
- The public review deployment runs the verified build.
- A completed architecture review exists at
  `reviews/automatic-partial-catalog-enrichment-review.md`.
