# complete-load-after-intake — Complete a Load when receiving finishes

## Goal

When Warehouse successfully completes the final Intake receiving session for an Acquisition Load, mark that Load received in the same database transaction so it no longer appears in Warehouse's Expected Loads list. Preserve support for multiple Intake batches by completing the Load only after the closing commit leaves no other open batch for that Load.

## Ticket Summary

- Treat a successful terminal Intake Batch Commit as the receiving completion signal.
- Apply the rule to the active **Add Machines to Inventory** path and the compatible historical **Finish Receiving** path because both terminally close an Intake Batch.
- Do not mark a Load received during photo upload, recognition, Candidate confirmation, type selection, individual Candidate commit, or a rejected/rolled-back Batch Commit.
- Because multiple batches may exist for one Load, mark `receivedAt` only when no other open Intake Batch remains after the current batch closes.
- Lock the Load row while closing/checking batches so concurrent batch completion or creation cannot hide a Load early or create a new receiving session after receipt.
- Reject creation of a new Intake Batch for a Load that is already received.
- Persist Machine creation, mappings, terminal batch state, Load receipt, audit/outbox records, and idempotency completion atomically.
- Preserve the current API response and web workflow; the existing Expected Loads filter will hide the received Load on the next authoritative navigation/refresh.

## Expected Output

- Completing the only open Intake Batch sets the Load's `receivedAt` timestamp and increments its version.
- If another Intake Batch for the same Load is still open, completing one batch leaves the Load expected; completing the last open batch marks it received.
- Warehouse no longer sees that Load in Expected Loads after the final successful Intake completion.
- Owner Admin continues to see received Loads in the all-loads view.
- Failed, incomplete, stale, or rolled-back Intake completion leaves `receivedAt` unchanged.
- Replaying the same successful commit returns the committed result without writing another Load receipt or duplicate audit/outbox event.

## Non-Goals

- Do not enforce one Intake Batch per Load or remove historical multi-batch data.
- Do not add a manual **Mark Load Received** button.
- Do not make photo upload, recognition, or individual Candidate commit complete a Load.
- Do not add expected Machine counts, manifests, partial-delivery quantities, or reopening behavior.
- Do not change the Warehouse Expected Loads presentation filter or role permissions.
- Do not change Intake recognition, Catalog linking, QR generation, Machine identity, or actual-measurement behavior.
- Do not add a database migration; `inventory_load.received_at` already exists.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/api/src/modules/inventory/intake/intake.repository.ts` / `create`, `commit` | Owns receiving-session creation and the atomic active/historical finalization transaction. |
| `apps/api/src/modules/inventory/inventory.repository.ts` / `updateLoad`, `createIntakeMachine` | Owns Load persistence/audit and the existing transaction-aware Inventory mutation pattern. |
| `apps/api/test/intake.integration.test.ts` | Covers Batch Commit, idempotency, rollback, historical finish, and multiple batches for one Load. |
| `apps/web/src/app/(protected)/loads/loads-view.tsx` | Already excludes received Loads when `expectedOnly` is true. |
| `tests/browser/intake.spec.ts` | Exercises Warehouse's complete real-session Intake workflow. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/api/src/modules/inventory/inventory.repository.ts` | Add a narrow transaction-aware Load receipt mutation/locking seam that sets `received_at = now()`, increments version, and records the canonical `inventory.load.updated` mutation once. Preserve unrelated existing edits in this dirty file. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | Lock/validate the Load during Intake creation and terminal commit; reject new batches for received Loads; after closing a batch, mark the Load received only when no other open batch remains. Apply the same final-close rule to active and `finishOnly` branches. |
| `apps/api/src/modules/inventory/intake/intake.service.ts` | Map the repository's received-Load rejection to a distinct `load_received` conflict instead of reusing the misleading `batch_committed` code. |
| `apps/api/test/intake.integration.test.ts` | Add success, failure, replay, multi-batch, historical finish, concurrency, audit, and received-Load batch-creation coverage. |
| `tests/browser/intake.spec.ts` | Verify the Load is initially expected and disappears from Warehouse Expected Loads after the final active commit. |

## Files to Reference Only

| File | Why |
|---|---|
| `packages/contracts/src/inventory.ts` | Existing Load response already exposes nullable `receivedAt`; no contract change is expected. |
| `apps/api/src/modules/inventory/intake/intake.controller.ts` | Existing protected endpoints and idempotency headers remain unchanged. |
| `apps/web/src/app/(protected)/loads/loads-view.tsx` | Existing `receivedAt === null` Expected Loads rule should react without modification. |
| `apps/web/src/app/(protected)/loads/page.tsx` | Existing role-derived `expectedOnly` behavior remains unchanged. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Existing active final action already calls non-`finishOnly` Batch Commit. |
| `docs/adr/0008-pipelined-individual-intake-commit.md` | Historical Individual Commit and Finish Receiving semantics remain supported. |
| `docs/adr/0015-post-recognition-type-and-final-intake-commit.md` | Active final Batch Commit remains the explicit human authorization boundary. |

## Files Not to Touch

- `packages/database/drizzle/**` and `packages/database/src/schema.ts` — no schema change is required.
- Intake recognition policy/providers and Files evidence handling — receiving evidence rules are unchanged.
- Catalog, QR, Production, Imports, Sales, Logistics, auth, and service-worker code — outside this lifecycle fix.
- `apps/web/src/app/(protected)/loads/loads-view.tsx` — its existing expected-only filter is already correct.
- Source materials, generated artifacts, and unrelated dirty-worktree files.

## Codegraph Findings (live, this ticket)

- No callable live codegraph query was available; the Reuse Map, current source, repository search, and tests were used to confirm current callers and invariants.
- `IntakeRepository.commit()` already owns one database transaction spanning idempotency reservation, Batch row locking, validation, Machine creation, Candidate mappings, terminal Batch state, audit/outbox, and idempotency completion.
- `InventoryRepository.createIntakeMachine()` demonstrates the existing pattern for an Inventory-owned mutation using the caller's active transaction.
- Public `InventoryRepository.updateLoad()` opens its own transaction and requires the general optimistic update contract, so it must not be called from Batch Commit.
- The schema permits multiple batches for one Load, and integration coverage intentionally commits two batches for the same Load. One batch alone is therefore not proof of full Load receipt.
- The Warehouse Expected Loads UI already filters out records whose `receivedAt` is non-null; no UI business rule needs to be duplicated.

## Reuse Audit

Reused:

- Existing atomic Intake commit transaction, Batch row lock, idempotency reservation/completion, and mutation recorder.
- Inventory-owned transaction-aware repository mutation pattern.
- Existing `inventory.load.updated` audit/outbox action and `receivedAt` Load contract.
- Existing Expected Loads filter and authoritative navigation refresh.
- Existing multi-batch, active Batch Commit, historical finish, and browser fixtures.

New code justified because:

- Intake needs one narrow Inventory-owned transaction-aware operation to lock/complete a Load without nesting the public Load-update transaction.
- A Load-level concurrency check is required to coordinate multiple batches and prevent new Intake after receipt.

Do not duplicate:

- General Load update behavior, mutation recording, idempotency, Machine creation, or the Expected Loads filter.
- Do not infer receipt in React or issue a second browser/API mutation after Batch Commit.

Escalated to human:

- None. The implementation permits multiple batches, so this spec conservatively defines receipt as the last open batch closing rather than silently assuming one-to-one cardinality.

## Implementation Plan

1. Add an InventoryRepository helper that participates in a supplied `DatabaseExecutor`, locks/reads the Load for receiving, and performs an idempotent receipt update with canonical mutation recording.
2. During Intake Batch creation, serialize on the Load and reject missing or already-received Loads before inserting a new open batch.
3. During Batch Commit, retain the existing Batch lock/version/idempotency checks and also serialize on the associated Load before terminal mutation work.
4. After the current Batch becomes committed, query for another open Intake Batch for the same Load. If one exists, leave the Load expected. If none exists, set `received_at = now()` through the Inventory-owned helper in the same transaction.
5. Apply step 4 to both active non-`finishOnly` final commit and compatible `finishOnly` closure. Keep Individual Candidate Commit non-terminal for Load receipt.
6. Ensure an existing idempotent replay returns before receipt/audit mutation, and receipt updates are conditional so only the first successful transition records `inventory.load.updated` with `received_at`.
7. Add deterministic integration coverage for atomicity, concurrency, replay, multi-batch ordering, historical compatibility, and creation rejection after receipt.
8. Extend the Warehouse browser journey to prove the completed Load is absent from Expected Loads, then run all repository gates.

## Constraints

- Preserve existing API request/response contracts.
- Use the database clock for `receivedAt`.
- Lock ordering must be consistent across Intake creation and completion so create-vs-complete and concurrent multi-batch completion cannot deadlock or expose an incorrect receipt state.
- The Load receipt update, its audit/outbox event, Machines, mappings, Batch state, and idempotency result must commit or roll back together.
- A failed Batch validation or Machine creation must not change the Load.
- A Load already received must not accept a new Intake Batch through a stale/custom client.
- Rejected creation on a received Load must return the distinct `load_received` conflict code; do not describe it as a committed Batch.
- Preserve all historical Intake records and compatibility endpoints.
- Follow `AGENTS.md`, existing style, and the reuse-vs-inline rule.
- Keep changes scoped and preserve unrelated worktree edits, especially in `inventory.repository.ts`.
- Do not log secrets, image bytes, OCR/provider payloads, filenames, PII, or complete sensitive prompts.

## Tests Required

- Focused API integration for `apps/api/test/intake.integration.test.ts`.
- Focused Playwright run for `tests/browser/intake.spec.ts` across configured desktop/tablet projects.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- `git diff --check`

## Done Criteria

- Upload, recognition, type selection, and individual Candidate commit leave the Load expected.
- A successful final close of the only open Intake Batch sets `receivedAt` exactly once.
- With multiple open batches, the Load remains expected until the last one closes.
- Active Batch Commit and historical `finishOnly` closure use the same Load-completion rule.
- New Intake creation for a received Load is rejected server-side.
- Failed/stale/incomplete commits leave the Load and its version unchanged.
- Idempotent replay and concurrent completion do not duplicate the receipt mutation or audit/outbox event.
- Warehouse Expected Loads no longer contains the received Load after authoritative navigation/refresh; Owner Admin's all-loads view remains capable of showing it.
- No schema, contract, role, Catalog, recognition, or unrelated workflow changes are introduced.
- Focused and full verification gates pass with no duplicate lifecycle logic.
