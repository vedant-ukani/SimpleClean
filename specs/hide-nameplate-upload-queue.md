# hide-nameplate-upload-queue — Remove temporary upload queue from Intake

## Goal

After a worker chooses one or more nameplate photos, upload and preparation continue automatically in the background without rendering a temporary thumbnail grid, filenames, retry buttons, or remove buttons. A successfully prepared photo should appear directly as its normal Machine intake card, beginning with `Reading nameplate…`. A local upload or preparation failure must be cleared from the hidden work tracker so it cannot invisibly block the final `Add Machines to Inventory` action.

## Ticket Summary

- Remove the visible staged-nameplate queue from the Intake page.
- Preserve immediate automatic upload and preparation after file selection.
- Preserve the internal pending-work signal while selected files are actually uploading or preparing, so the final Batch Commit cannot race unfinished work.
- Clear locally failed work from that pending-work signal.
- For partial or complete local failure, show one concise page-level message telling the worker to select the failed photo again.
- Do not add a replacement progress grid, thumbnail strip, per-file retry control, or per-file removal control for pre-preparation work.
- Keep the existing persisted failed-Machine controls unchanged. Those cards represent retained Intake Evidence and still support retake/reselection and exclusion.

## Expected Output

- `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` no longer renders `Staged nameplates` or creates browser object URLs for temporary previews.
- `apps/web/src/app/styles.css` no longer contains styling used only by the removed staged queue.
- `apps/web/test/intake-ui.test.tsx` verifies automatic processing without the queue and verifies that a local failure does not leave hidden pending work.
- The normal Machine cards remain the first visual representation of selected photos.

## Non-Goals

- Do not change API routes, persistence, recognition policy, OCR/provider behavior, or Batch Commit rules.
- Do not remove the `Machine intake queue` section or rename domain concepts.
- Do not remove retake/remove controls from persisted failed Machine cards.
- Do not expose a manual `Upload nameplates` action.
- Do not change Machine-type selection, capacity editing, or QR printing.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` / `MachineIntakeQueue` | Owns selection, temporary work tracking, upload/preparation, and queue rendering. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` / `onStagedWorkChange` | Prevents final Batch Commit while background preparation is incomplete. |
| `apps/web/src/app/styles.css` / `.intake-staged-nameplate*` | Styles only the temporary queue being removed. |
| `apps/web/test/intake-ui.test.tsx` | Existing component coverage for auto-upload, version-conflict retry, and persisted failed-item replacement. |
| `tests/browser/intake.spec.ts` | Existing full-boundary proof that selected photos become Machine cards and final commit remains gated. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Remove temporary queue presentation and preview-URL lifecycle; retain only minimal internal in-flight tracking; remove failed local items immediately; return or collect failure results so the final page message is accurate. |
| `apps/web/src/app/styles.css` | Remove selectors used only by the deleted queue markup. |
| `apps/web/test/intake-ui.test.tsx` | Assert queue absence during processing and after failure; cover automatic preparation and failure cleanup/message. |
| `tests/browser/intake.spec.ts` | Add a queue-absence assertion if it fits the existing journey without provider timing assumptions. |

## Files to Reference Only

| File | Why |
|---|---|
| `apps/web/src/lib/intake-client.ts` | Existing upload/preparation request boundary; contracts stay unchanged. |
| `specs/auto-upload-and-replace-failed-nameplate.md` | Defines automatic selection behavior and persisted failed-evidence replacement. |
| `specs/tablet-intake-finalize-and-print.md` | Defines final Batch Commit gating and the active tablet workflow. |

## Files Not to Touch

- `apps/api/**` — no backend change is required.
- `packages/**` — no domain or shared decision changes are required.
- `prisma/**` — no persistence change is required.
- Recognition adapters and prompts — provider behavior is outside this UI ticket.

## Codegraph Findings (live, this ticket)

- `MachineIntakeQueue` is the only owner of `stagedNameplates`, `updateStaged`, `removeStaged`, `uploadAndPrepare`, and `retryStaged`.
- The staged queue markup is local to `review-view.tsx`.
- `.intake-staged-nameplate*` selectors occur only in `styles.css` and the markup being removed.
- `onStagedWorkChange` is the existing parent boundary for final-action gating and must be preserved.
- The browser Intake journey already asserts there is no manual upload button and that the final action is disabled while selected photos are being prepared.

## Reuse Audit

Reused:

- Existing `uploadPhoto`, `prepareIntakeItem`, version-conflict recovery, `onDetail`, and recognition refresh behavior.
- Existing page-level `onMessage` feedback.
- Existing `onStagedWorkChange` final-action gate.
- Existing persisted failed-evidence controls.

New code justified because:

- The upload loop needs a small local result/failure count so it can produce accurate feedback and always release hidden pending work. This is orchestration local to `MachineIntakeQueue`, not a reusable business rule.

Do not duplicate:

- File upload or Intake client behavior.
- Version-conflict retry logic.
- Persisted failed-evidence replacement/exclusion behavior.

Escalated to human:

- None. The requested presentation and failure behavior are fully specified.

## Implementation Plan

1. Simplify `StagedNameplate` to the minimum fields needed for in-flight orchestration; remove preview URL, display status, and display error state that existed only for the queue.
2. Remove object URL creation, revocation, queue rendering, and `retryStaged`.
3. Make every selected item leave the internal staged collection after either successful preparation or terminal local failure.
4. Have `uploadAndPrepare` report how many selected items failed locally, without hiding successful items.
5. Show a concise reselect message when one or more items fail; avoid a misleading all-success message.
6. Remove obsolete CSS and update focused tests.

## Constraints

- Preserve existing API contracts.
- Follow `AGENTS.md`, including domain ownership and reuse rules.
- Keep the internal pending-work gate accurate for the full upload/preparation lifetime.
- Do not log file contents or provider payloads.
- Keep controls usable on tablet sizes and retain accessible labels.
- Avoid state updates that leave a failed item hidden but counted.

## Tests Required

- `npm --workspace @simply-clean/web test -- --run apps/web/test/intake-ui.test.tsx` or the repository-equivalent focused web test command.
- `npm run typecheck`
- `npm run lint`
- Run the focused Intake browser journey if the local test environment is available.

## Done Criteria

- Selecting nameplate photos never displays the temporary preview/upload queue.
- Automatic upload and preparation still begin on selection.
- Prepared photos appear directly as normal Machine cards.
- Local failures tell the worker to select those photos again.
- Failed local work is no longer counted as pending and cannot invisibly block the final action.
- Persisted failed Machine cards retain their existing retake and remove controls.
- Focused tests, typecheck, and lint pass.
