# Review — automatic-partial-catalog-enrichment

## Result

Approved.

## Scope reviewed

- Runtime exact-match completeness decision in Catalog orchestration.
- Reuse of the existing additive missing-field enrichment operation.
- Disabled, no-result, reused, provider-failure, and retry behavior.
- Machine resolution ordering and identity-version fencing.
- Immutable revision publication, evidence carry-forward, deduplication, and Machine pin preservation.
- Dexter `WCVD40KCS-12` source evidence and the ADR 0017/0018 publication boundary.

## Findings

1. The defect was the exact-match early return in `requestDiscovery`: it equated exact identity with complete specifications and bypassed the existing known-variant enrichment operation.
2. `requestDiscovery` now checks missing fields only on the exact approved revision. Complete revisions return without a provider request. Incomplete revisions invoke `requestSpecificationEnrichment` only when discovery is available and return a published revision when present; otherwise they retain the existing verified partial revision.
3. The read-only `enrichmentForIdentity` path remains side-effect free. Page reads cannot trigger provider cost or Catalog publication.
4. Machine event handling now resolves and links the unchanged current Machine in a `finally` block. A provider failure therefore cannot suppress a valid exact Catalog link, while the original error still propagates to preserve Operations outbox retry/dead-letter behavior.
5. Existing repository publication remains additive and immutable. It fills only fields missing on the locked base revision, carries prior facts/evidence, fences superseded bases, and leaves existing Machine pins unchanged.
6. The exact model plus missing-field set, base revision, provider/model, and prompt/schema/policy versions remain the dedupe boundary. Recognition and Machine events cannot duplicate the same provider attempt or revision.

## Source-policy review

Dexter's official V-Series manual explicitly lists `WCVD40KCS-12` and contains a separately headed T-600 mounting diagram, while its model-identification guide maps historical WCVD machines to V-Series and a 40 lb washer class to T-600. The documents do not explicitly crosswalk the exact code to the diagram, and the manual contains no weight value. `T-600` is not an anchored leading prefix of `WCVD40KCS-12`.

The newer official T-600 C-Series sheet therefore cannot automatically supply its 558 lb weight or dimensions to the older WCVD V-Series variant. Reviewed third-party WCVD material reports 631 lb, confirming a weight conflict. The implementation correctly rejects a related non-leading model and leaves unsupported facts unknown.

## Reuse audit

- Reused Catalog exact/alias resolution, missing-field calculation, incomplete-revision context, provider adapter, pricing, run leases, official-host verification, additive publication, evidence storage, audit, and cost provenance.
- Reused the Operations outbox for retry rather than adding a scheduler or synchronous page-side effect.
- Added only an availability predicate, the exact-partial orchestration edge, failure-safe Machine link ordering, and focused integration coverage.
- Added no schema, migration, alternate search policy, Catalog seed rewrite, UI mutation, or provider-specific controller logic.

## Verification

- Lint: pass.
- Workspace typecheck: pass.
- Unit tests: 255 passed across Contracts, Config, Database, API, and Web.
- Integration tests: Database 3 passed / 1 skipped; API 68 passed.
- Browser tests: 25 passed / 2 skipped across desktop, tablet, and tablet landscape.
- Production build: pass both in the browser gate and with the review deployment's API base configuration.
- Focused Catalog/Inventory implementation run: 24 passed; final Catalog integration run: 21 passed.
- Bounded live Dexter enrichment: `no_result` / `no_newly_verified_fields`; one deduplicated specification-enrichment run recorded, no Catalog revision published.
- Public deployment: login, authenticated identity, Catalog list, exact Dexter detail, and API/database readiness returned HTTP 200.

## Operational conclusion

The bounded live execution against `dexter-wcvd40kcs-12` correctly returned `no_result`. Revision `dexter-wcvd40kcs-12-r1` remains approved with capacity, voltage, and phase; height, width, depth, and weight remain unknown. No value was copied from a related T-600 sheet merely to make the record complete. The verified build is running at the public William review URL.
