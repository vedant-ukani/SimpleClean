# AUT-392 Architecture Review

## Status

Pass.

## Scope reviewed

- Separate post-recognition Catalog discovery trigger and Machine-event fallback.
- OpenAI Responses API request, web-search source extraction, bounded transport, strict structured result, and pricing/usage capture.
- Official-source publication policy, immutable revision persistence, deduplication, leases/retries, and atomic audit/outbox behavior.
- Intake and Machine read composition, provenance display, effective-value precedence, and absence of a Catalog approval control.
- Contract, configuration, migration, unit, integration, browser, and live-provider behavior.

## Findings resolved during review

1. Snapshot import originally failed to persist `sourceClass`, allowing a non-official source to inherit the official default. Import now preserves the class, trusted-host derivation filters to `official_manufacturer`, the database constrains allowed classes, and integration coverage proves a third-party host cannot start discovery.
2. Scalar parsing originally accepted numeric prefixes from compound/ranged text. It now requires a complete scalar and regression tests reject values such as `30 x 40` and `30-32`.
3. Candidate enrichment originally omitted the manufacture-date result. Exact resolution now returns it and Intake renders exact/range/unknown outcomes without using the serial in the discovery request.
4. Retryable failure originally changed discovery state without the same transaction's audit/outbox record. Failure state and `catalog.discovery.completed` are now atomic and covered by retry integration tests.
5. Machine fallback now re-reads identity after the potentially slow provider call and refuses to link stale identity state.
6. The first real OpenAI smoke test exposed that current `web_search_call.action.sources` entries can contain a URL without a title. The adapter now accepts bounded HTTPS title-less sources, derives a hostname label, includes `open_page`/`find_in_page` URLs, deduplicates, caps the combined list at 100, and has production-shaped tests.

## Required checks

- No human Catalog approval screen, queue, command, or mutation was added.
- Discovery receives only accepted manufacturer and exact model; it receives no image, OCR, serial, Load, user, or private URL data.
- The OpenAI request uses required unrestricted web search and sends no domain filter.
- Publication requires exact manufacturer/model, provider-returned HTTPS source membership, exact/subdomain matching against a pre-existing `official_manufacturer` host, nonempty locators, conflict removal, deterministic conversion/ranges, and an existing typed serial-rule schema.
- Third-party, distributor, reseller, marketplace, lookalike, conflicting, malformed, and unsupported results cannot become effective Catalog facts.
- Provider calls occur outside repository transactions and outside HTTP GET/controller/React paths.
- One versioned identity tuple has one active discovery run; terminal no-result and successful results are reused, while retryable failures can be reclaimed safely.
- Discovery failure is non-blocking for recognition, worker type selection, Intake commit, and Machine creation.
- Catalog reads still use approved revisions; Machine actual values and final packed facts retain precedence.
- Raw prompts, raw provider responses, serials, image/OCR evidence, and source bodies are not persisted or logged.

## Reuse audit

- Reused Catalog normalization, alias resolution, manifest/revision/source/evidence persistence, typed serial evaluation, Operations mutation recording/outbox delivery, Inventory actual-over-Catalog precedence, protected clients, and current Intake/Machine views.
- The new `apps/api/src/platform/provider-http.ts` neutral seam is justified because Catalog is the second provider-backed domain. It owns only generic bounded JSON transport; domain payload validation and error meaning remain local.
- No duplicate normalization, serial evaluator, retry worker, effective-spec precedence, or approval framework was introduced.

## Verification

- Lint: pass.
- Typecheck: pass.
- Unit: 221 passed.
- Integration: 56 passed, 1 expected skip.
- Browser: 25 passed, 2 expected skips.
- Build: pass.
- Post-fix independent rerun: all 221 unit tests and all 56 integration tests passed.
- Live OpenAI smoke (`Dexter` / `WCVD40KCS-12`): 21,097 input tokens, 602 output tokens, 2 web-search calls, 18 parsed returned sources, estimated $0.0224107 using the recorded 2026-09-23 GPT-6 Luna Standard price snapshot. The deterministic gate correctly returned no verified new specifications because the response did not contain a policy-valid conflict-free specification; no Catalog mutation was performed.
- Local forward migration through `0014_catalog_discovery.sql`: pass; existing records were preserved. Local discovery is configured to reuse the existing Intake OpenAI credential after the application restarts.

## Durable memory updates

- Added ADR 0017 for the narrow no-human-approval automatic official-source publication exception.
- Updated `DECISIONS.md`, `ARCHITECTURE.md`, `AGENTS.md`, `PRODUCT.md`, `ROADMAP.md`, and `specs/index.md` to reflect the completed behavior and provider-transport reuse seam.
