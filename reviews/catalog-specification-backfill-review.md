# Review — catalog-specification-backfill

## Result

Approved after review corrections.

## Scope reviewed

- Missing-field selection across scalar, list, and production-year facts.
- Inventory-first catalog-wide preview and bounded sequential execution.
- Existing-variant discovery deduplication, provider request boundaries, and official-source policy.
- Additive immutable revision publication, evidence carry-forward, stale-base fencing, and audit/cost provenance.
- Existing Machine pin preservation, latest-revision resolution, command safety, and deterministic provider coverage.

## Findings resolved

1. A terminal no-result model originally remained incomplete and could occupy the same bounded slot on every rerun, preventing later models from being reached. Preview now computes the same current-base enrichment dedupe keys used by execution, batch-loads their run states, and orders fresh/retryable work before active or terminal reusable work. Repeated bounded runs therefore advance through the catalog while keeping Inventory and stable identity ordering within each work class.
2. Reused runs originally added their historical estimated cost to the current command summary. Cost reporting now counts only newly executed, non-reused runs.
3. Provider list evidence initially allowed unsupported extra list members. Verification now requires every normalized list value to be supported by the official evidence text and rejects duplicates/conflicts.

## Required checks

- The command is preview-only unless `--execute` is supplied and requires both scope and a positive model bound.
- Existing known values are retained exactly; enrichment fills only fields missing on the locked base revision.
- Exact manufacturer, model, and stored equipment class remain required, with HTTPS evidence from an existing trusted official manufacturer host.
- Provider input contains only canonical public manufacturer/model, stored equipment class, and requested missing field names. It contains no Inventory rows, Machine data, serial, OCR, image, user, or private evidence.
- Publication targets the existing variant, creates revision `n + 1`, copies prior evidence/source references, and adds sources/evidence only for accepted new facts.
- A concurrently superseded base records a terminal `no_result` with reason `superseded`; no stale revision is published.
- Existing Machine resolutions remain pinned; new resolutions use the latest approved revision.
- Unsupported-model AUT-392 discovery retains its full field/serial-rule behavior and separate operation dedupe.
- No scheduler, web mutation screen, approval queue, source crawler, schema migration, or live paid provider call was added.

## Reuse audit

- Reused Catalog normalization, exact/alias resolution, trusted-host derivation, discovery leases, provider adapter, pricing, strict policy, immutable source/evidence storage, mutation recording, and existing Catalog UI reads.
- Reused the Inventory import parser only in the operator command to rank exact/alias-resolved workbook identities; Catalog does not read Inventory tables.
- New code is limited to the missing known-variant enrichment operation, incomplete-revision selection, same-variant publication, and bounded operator command. No parallel discovery, normalization, or rendering framework was introduced.

## Verification

- Lint: pass.
- Workspace typecheck: pass.
- Unit: 231 passed before the review correction; focused post-correction unit/discovery tests: 17 passed.
- Full integration before the review correction: 60 passed, 1 existing skip. An initial unrelated imports authorization assertion was intermittent and passed alone; the final full run passed.
- Post-correction Catalog integration: 11 passed.
- Build: pass.
- Prettier and diff checks: pass.
- Live OpenAI execution: intentionally not run. Catalog can fall back to the configured Intake semantic credential, but a catalog-wide execution incurs provider cost and requires an explicit bounded operator invocation.

## Operational note

Use `npm run catalog:backfill -- --scope all --max-models <n>` to preview. Add `--execute` only after configuring the Catalog discovery credential and choosing an explicit bounded batch size. Unknown official facts remain unknown; the workflow does not infer from similar models.
