# remove-inventory-location Review

## Status

Pass

## Checks Run

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — pass: contracts 26, config 15, database 1, API 110, web 130
- `npm run test:integration` — pass: API 75; database 4 passed, 1 skipped
- `npm run test:browser` — pass: 34 passed, 2 skipped across desktop, tablet portrait, and tablet landscape
- `npm run build` — pass
- `git diff --check` — pass
- `npm run format:check` — not clean because six pre-existing dirty scanner/QR/storage/database-test files outside this ticket are not formatted; ticket implementation files were not broad-formatted over unrelated work

## Findings

No blocking findings.

1. Active Machine contracts, API routes, Inventory/Intake services, repository reads/writes, permissions, clients, and UI no longer expose Inventory Location, Intake destination, or relocation.
2. The Machines overview uses the canonical nullable `Machine.model` fact for the new **Model Number** column and preserves the existing full-row navigation and responsive layout.
3. Historical SQL migrations and persisted Location/relocation rows remain untouched. Focused integration coverage proves historical columns/rows may still exist without leaking into active Machine reads or searches.
4. Legacy Operations action/target discriminants remain intentionally parseable for immutable audit/outbox history, with no active Location mutation producer remaining.
5. Unrelated address, logistics, browser URL, and OCR evidence-location behavior remains intact.

## Reuse / Slop Audit

- Duplicated logic: none introduced.
- Missed reuse: none; the overview reuses `recorded(machine.model)` and the existing result-row system.
- Style mismatches: none in ticket implementation.
- Unnecessary complexity: none; Location paths were deleted rather than hidden behind flags or compatibility wrappers.

## New Reusable Thing Created?

- No. This ticket removes an obsolete capability and reuses existing Machine model formatting.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes; Inventory no longer owns an active Location/relocation capability.
- `DECISIONS.md` and `docs/adr/` — yes; ADR 0009's retained Location-domain decision is superseded.
- `PRODUCT.md` — yes; Warehouse outcomes no longer include locating Machines.
- `CONTEXT.md` — yes; remove Inventory Location from active domain language and Intake transitions.
- `README.md` and `docs/safe-foundation-program.md` — yes; remove stale active Location/relocation claims.
- `AGENTS.md` — no; engineering rules are unchanged.
- `ROADMAP.md` — yes; record completion.
- `specs/index.md` — yes; mark the ticket completed.
