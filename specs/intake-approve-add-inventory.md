# Intake approval and Inventory handoff

## Goal

Make the existing supervised Intake boundary obvious and dependable in the UI: after staff upload photos, review or correct the recognized Machine candidates, and resolve any blockers, one explicit **Approve and Add to Inventory** action creates the reviewed Machines in Inventory. Rejection, recapture, incomplete review, and failed approval create no Machines.

## Ticket Summary

- Keep the existing upload, recognition, grouping, correction, candidate confirmation, destination, and atomic Batch Commit behavior.
- Rename the final user-facing commit action to **Approve and Add to Inventory** and explain that approval creates the displayed number of provisional Inventory Machines.
- Keep the irreversible confirmation step, using the same user-facing language and Machine count.
- Prevent rapid repeated activation in the browser while the approval request is in flight.
- After success, show a clear committed state, the created Machine links, and an obvious **View Inventory** link.
- Preserve server-authoritative idempotency, version, locking, duplicate identity, evidence, and all-or-nothing commit checks.
- Add regression coverage proving reviewed corrections are committed, blocked/rejected states create nothing, and repeated approval creates exactly one Machine per candidate.

## Expected Output

- The Intake review page ends with an **Approve and Add to Inventory** button instead of implementation-oriented “commit” wording.
- The confirmation dialog states exactly how many Machines will be added and that the action cannot be undone.
- While approval is running, the action cannot be triggered a second time and exposes an accessible busy state.
- Successful approval shows the created Machine records and a route to the Inventory list.
- Failed, rejected, recapture-required, or incomplete Intake remains open and creates no Inventory records.
- Deterministic UI, API integration, and browser tests cover the complete supervised journey without calling live AI/OCR providers.

## Non-Goals

- No autonomous approval or confidence-threshold change.
- No per-candidate Inventory creation; approval remains one atomic Batch Commit.
- No change to provisional Machine identity or the separate identity-verification workflow.
- No new benchmark-label/adjudication database, export, provider, schema, or migration.
- No change to Google Vision, Gemini, PaddleOCR, Files storage, QR, Imports, Production, or authentication.
- No automatic navigation that hides the committed summary or created Machine links.

## Relevant Existing Code

| File/Symbol                                                                        | Why it matters                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx`     | Owns the review controls, final commit action, busy state, committed summary, and created Machine links.                                         |
| `apps/web/src/lib/intake-client.ts`                                                | Existing validated Intake client and idempotency-header behavior.                                                                                |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` / `commit()`          | Existing atomic Batch Commit, row lock, optimistic version, evidence and duplicate checks, Machine creation, mapping, audit, and terminal state. |
| `apps/api/src/modules/inventory/inventory.repository.ts` / `createIntakeMachine()` | Canonical transaction-aware Inventory creation seam.                                                                                             |
| `apps/web/test/intake-ui.test.tsx`                                                 | Existing editable-review and terminal-commit UI coverage.                                                                                        |
| `apps/api/test/intake.integration.test.ts`                                         | Existing proof that commit creates Inventory Machines with `photo_intake` evidence.                                                              |
| `tests/browser/intake.spec.ts`                                                     | Existing full-boundary fake-recognition Intake journey.                                                                                          |

## Files to Modify

| File                                                                           | Required change                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Replace final commit terminology with approval/Inventory language, add an in-flight repeated-activation guard, preserve terminal state, and add a clear Inventory-list link after success. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/page.tsx`        | Use the same approval/Inventory language in the page introduction.                                                                                                                         |
| `apps/web/src/lib/intake-client.ts`                                            | Parse the existing commit response contract instead of returning an unvalidated payload.                                                                                                   |
| `apps/web/test/intake-ui.test.tsx`                                             | Assert exact approval language, corrections in the approved payload/state, busy/duplicate activation behavior, failure behavior, and committed success links.                              |
| `apps/web/test/intake-client.test.ts`                                          | Assert the existing commit response contract is parsed at the client boundary.                                                                                                             |
| `apps/api/test/intake.integration.test.ts`                                     | Strengthen exactly-once coverage for repeated/concurrent commit and assert rejected/incomplete/recapture-blocked attempts create zero Machines where coverage is missing.                  |
| `tests/browser/intake.spec.ts`                                                 | Exercise upload/recognition/review, approval wording, one successful Inventory creation, terminal state, and navigation to the created Inventory record/list using deterministic fakes.    |

## Files to Reference Only

| File                                                         | Why                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `apps/api/src/modules/inventory/intake/intake.controller.ts` | Existing protected commit endpoint and input boundary.                            |
| `apps/api/src/modules/inventory/intake/intake.service.ts`    | Existing service and conflict mapping.                                            |
| `packages/contracts/src/intake.ts`                           | Existing commit request/response and state contracts.                             |
| `apps/api/test/intake-recognition.integration.test.ts`       | Existing recognition, recapture, provenance, retry, and manual fallback coverage. |
| `specs/INT-02.md`                                            | Canonical recognition and final human Batch Commit requirements.                  |

## Files Not to Touch

- Database schema or migrations; the authoritative atomic commit already exists.
- Recognition providers, policy, evaluation harness, or private benchmark data.
- Source photos, transcripts, workbook, credentials, or `.local-data/**`.
- Machine identity verification, QR, Imports, Production, Sales, Listings, Payments, Logistics, auth, or service-worker policy.

## Codegraph Findings (live, this ticket)

- The existing review page uploads private evidence, starts recognition, supports corrections and photo grouping, confirms candidates, selects a destination, and calls the protected commit endpoint.
- `IntakeRepository.commit()` is the only safe approval seam. It locks and revalidates the open batch, requires every photo and candidate to be ready, checks duplicate identity, creates Machines through `createIntakeMachine()`, maps candidates, records audit/outbox work, and marks the batch terminal in one transaction.
- A committed response already includes created Machine IDs, and the UI already renders direct Machine links.
- Browser controls are disabled from React busy state, while the backend independently rejects stale/already-committed state. Add a synchronous in-flight guard and focused test so rapid activation cannot dispatch two browser requests.
- Current user-facing wording is **Commit reviewed Machines** and does not make the Inventory outcome obvious. There is no post-success Inventory-list link.

## Reuse Audit

Reused:

- Existing Batch Commit API, Inventory creation seam, candidate corrections, recognition provenance, optimistic versions, idempotency, duplicate checks, audit/outbox recording, terminal state, and route-state behavior.
- Existing UI button, confirmation, busy state, committed summary, and Machine detail links.
- Existing deterministic fake-recognition browser harness.

New code justified because:

- Only a small synchronous in-flight UI guard and presentation changes are missing. Keep them local to the review view.

Do not duplicate:

- Commit rules, Inventory writes, idempotency logic, version checks, Machine creation, route clients, recognition policy, or identity verification.

Escalated to human:

- None. The user explicitly chose supervised UI approval before Inventory creation.

## Implementation Plan

1. Update the review page introduction, final summary, button, confirmation, busy label/state, and success actions to use approval/Inventory language.
2. Add a synchronous in-flight guard around the existing commit call while retaining the React busy state and server protections.
3. Parse the commit response with the existing shared contract and derive committed Machine links from persisted mappings so reload/reconnect preserves the success state.
4. Refresh authoritative state after an ambiguous request failure so a committed server result is never presented as an open/blocked batch.
5. Extend UI/client tests for exact labels, corrected values, blocked/failure states, rapid repeated activation, response validation, reload behavior, and success links.
6. Strengthen API integration assertions for corrected Inventory values, exactly-once creation, and zero creation on recapture-blocked attempts without changing production commit behavior unless a test exposes a real defect.
7. Update the deterministic browser journey to correct a value, approve the reviewed batch, and verify the resulting Inventory navigation/record.
8. Run targeted tests, then the proportional repository gates and review the diff for reuse, accessibility, privacy, and scope.

## Constraints

- The provider never creates Inventory records; only the existing human-authorized Batch Commit can do so.
- Approval remains atomic for the whole Intake Batch.
- Corrected values must be persisted through the existing candidate update/confirm path before approval.
- Do not mark Machine identity as verified; committed Machines remain provisional.
- Do not expose filenames, OCR text, provider payloads, credentials, or private image data in logs or audit summaries.
- Preserve online-only mutation behavior, optimistic versions, accessible status messaging, and terminal read-only state.
- Preserve existing API contracts unless a test proves a defect that cannot be fixed within the current contract.

## Tests Required

- Targeted web: `npm test --workspace apps/web -- intake-ui.test.tsx`
- Targeted API integration: run the repository's established command for `apps/api/test/intake.integration.test.ts`.
- Targeted browser: run the repository's established Playwright command for `tests/browser/intake.spec.ts`.
- Repository checks: `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Run broader integration/build gates if production code outside the review view changes.

## Done Criteria

- A worker can upload photos, review/correct the recognized candidates, resolve all blockers, and select a destination.
- **Approve and Add to Inventory** creates exactly one provisional Inventory Machine per confirmed candidate through the existing atomic commit.
- Rapid repeated activation or request replay cannot create duplicates.
- Rejection, recapture-required, incomplete review, canceled confirmation, and failed approval create no Machines.
- Success is clearly visible and provides links to the created Machines and Inventory list.
- Deterministic targeted tests and required repository checks pass.
- No duplicate commit or Inventory logic is introduced.
