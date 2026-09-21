# SF-07 Review

## Status

Pass

## Checks Run

- `npm run format:check` — pass
- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — pass (87 tests)
- `npm run test:integration` — pass twice consecutively (31 tests each run, one optional PostgreSQL-wire test skipped)
- `npm run build` — pass
- QR matrix round-trip decoding — pass; rendered label decodes to the exact configured `/scan#<signed-token>` URL

## Findings

No blocking findings remain.

The first review found an ABA concurrency risk: after revoke and create, an old tab could target a different active label with the same version. Reissue now requires both the exact expected Label ID and version, includes both in its idempotency fingerprint, and verifies both while locked. Regression tests cover revoke/create/stale reissue and competing reissues.

The first independent root run also exposed nondeterministic integration deadlines under concurrent PGlite suites. API integration files now run through one bounded worker with explicit 10-second test/hook limits. Two consecutive full integration runs pass.

## Reuse / Slop Audit

- Duplicated logic: none found; QR lifecycle remains under Inventory and reuses canonical Operations and Identity boundaries.
- Missed reuse: none found after the web permission helper was consolidated.
- Style mismatches: none found after root formatting/lint checks.
- Unnecessary complexity: none found; opaque signed lookup, immutable activity, and exact-label optimistic concurrency are justified security controls.

## New Reusable Thing Created?

- Yes — Inventory's QR signer, renderer boundary, lifecycle service, and authenticated resolver are the canonical Machine-label implementation.
- Yes — the validated same-origin QR web client and `/scan` route are the canonical scan entry point.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes; record QR ownership, opaque fragment tokens, and exact-label concurrency.
- `DECISIONS.md` — yes; record the private signed-label design and secret-rotation consequence.
- `PRODUCT.md` — no.
- `AGENTS.md` — no.
- `ROADMAP.md` — no; SF-08 remains.
