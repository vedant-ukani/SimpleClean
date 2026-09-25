# complete-load-after-intake Review

## Status

Pass

## Checks Run

- Focused receipt integration tests — pass (active final commit, historical finish, and concurrent multi-batch completion)
- `apps/api/test/intake.integration.test.ts` — pass (12/12)
- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — pass
- `npm run test:integration` — pass (74/74)
- `npm run build` — pass
- `git diff --check` — pass
- Changed Intake browser journey — the new Expected Loads disappearance assertion passes on desktop, tablet, and tablet landscape
- Full `npm run test:browser` — blocked by unrelated concurrent location-removal UI/fixture failures after the new Load-disappearance assertion passes; 19 passed, 2 skipped, 15 failed in that overlapping worktree state

## Findings

No actionable scoped findings.

The Load row is locked before terminal Batch mutation, and Intake creation uses the same Load lock. This makes create-vs-complete and concurrent multi-batch completion serialize on one Load. The final batch state, Machine/mapping mutations, Load receipt, audit/outbox records, and idempotency completion share one database transaction. A failed recorder write rolls back every scoped mutation, and replay does not duplicate the Load update.

## Reuse / Slop Audit

- Duplicated logic: none; the existing Batch Commit transaction, Inventory mutation recorder, Load contract, and Expected Loads filter are reused.
- Missed reuse: none; the public Load update transaction was correctly not nested inside Intake commit.
- Style mismatches: none.
- Unnecessary complexity: none; the multi-batch rule is implemented through one Load lock and one open-batch check.

## New Reusable Thing Created?

- No broad new abstraction. The transaction-aware Inventory Load lock/receipt methods are narrow internal seams for Intake orchestration and fit the existing repository pattern.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes for receiving workflow/invariant; no Reuse Map location change.
- `DECISIONS.md` — yes; record the last-open-batch Load completion rule and concurrency consequence.
- `PRODUCT.md` — yes; the Warehouse journey now completes and removes the Load from Expected Loads.
- `AGENTS.md` — no; implementation rules are unchanged.
- `ROADMAP.md` — no; delivery sequencing is unchanged.
- `specs/index.md` — yes; mark the ticket completed.

## Verification Note

The scoped browser behavior is verified in all configured viewports. The later failure occurs in an existing Inventory-row/location assertion modified by parallel location-removal work, not in Load receipt or Expected Loads filtering; that unrelated work was preserved.
