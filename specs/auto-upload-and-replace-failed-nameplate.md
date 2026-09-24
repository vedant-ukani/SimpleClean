# auto-upload-and-replace-failed-nameplate — Immediate recognition and failed-item replacement

## Goal

Make nameplate capture one direct tablet action: selecting photos immediately uploads and prepares them for recognition, with no second Upload button. When recognition fails, replace retrying the same evidence with clear retake/reselect and remove actions that preserve the failed evidence history without allowing it to block the final Intake commit.

## Ticket Summary

- Selecting one or more nameplate images must immediately start the existing upload and sequential preparation flow.
- Remove the `Upload nameplates` button from the active Intake UI.
- Keep compact local previews and per-file upload/preparation feedback while work is in progress.
- Upload failures may retain their local Retry/Remove staging controls because the file never became Intake evidence.
- A persisted active item whose latest targeted run is `failed` or `stale` must not show `Retry this Machine`.
- Only failed/stale persisted items show:
  - a camera/file input labeled `Retake or choose another image`; and
  - a `Remove failed image` button.
- Ready, queued, running, and committed items must not show the failed-item removal control.
- Retake/reselect uploads the replacement file, prepares it as a new targeted Machine Intake Item through the existing type-free `prepareIntakeItem` boundary, and only after that succeeds excludes the old failed photo. This preserves the old Candidate/run/photo history while the replacement appears as the active item.
- If replacement upload/preparation fails, retain the original failed card so the worker can try again.
- If the replacement item succeeds but excluding the old item fails, retain both cards and show an actionable message; the old card's remove action remains available for recovery.
- Removing a failed item must use exclusion, not hard deletion. Recognition rows reference the evidence with `ON DELETE RESTRICT`, and failed evidence remains auditable.
- Excluding a failed item's only active photo must remove that item from the active `items` projection without deleting its Candidate, photo, or Recognition Run.
- Atomic Batch Commit must validate and create only Candidates that still have at least one currently assigned photo. An excluded/orphaned failed Candidate must not block the remaining active ready Candidates.
- Keep the final `Add Machines to Inventory` button disabled when no active items remain or when any remaining active item is not ready/typed.

## Expected Output

- Choosing photos immediately shows uploading/reading activity; there is no Upload button to click.
- A failed card offers `Retake or choose another image` and `Remove failed image`, with no retry-same-image action.
- A replacement photo enters recognition automatically and the old failed card disappears after safe exclusion.
- Removing a failed item hides it from the active queue and it no longer blocks final Batch Commit, while its evidence and recognition history remain stored.
- The existing successful post-recognition type selection and one final atomic Inventory action remain unchanged.

## Non-Goals

- Do not retry the same failed recognition evidence from the active UI.
- Do not physically delete File, photo, Candidate, Recognition Run, OCR, semantic, audit, or provenance records.
- Do not add a new Candidate state or database migration.
- Do not change Google Vision, OpenAI, deterministic evidence policy, required serial behavior, or provider prompts/models.
- Do not expose failed-item removal on ready, queued, running, committed, or legacy manual-review cards.
- Do not change the QR workflow, type-selection workflow, capacity rules, duplicate-storage behavior, or final atomic commit boundary.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` / `MachineIntakeQueue` | Owns selection, local staging, preparation, persisted cards, retry actions, and final readiness. |
| `apps/web/src/lib/intake-client.ts` / `prepareIntakeItem`, `excludeIntakePhoto` | Existing validated browser boundaries for creating replacement items and preserving old evidence as excluded. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` / `excludePhoto`, `commit`, `detail` | Exclusion preserves rows; commit and active item projection must ignore Candidates with no assigned photo. |
| `apps/web/test/intake-ui.test.tsx` | Active selection, failed-card controls, replacement ordering, and visibility rules. |
| `apps/api/test/intake.integration.test.ts` | Exclusion and atomic Batch Commit behavior. |
| `tests/browser/intake.spec.ts` | Full-boundary tablet nameplate journey and absence of the Upload button. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Auto-start upload/preparation from file selection; remove Upload button; replace persisted retry with retake/reselect plus failed-only remove; orchestrate replacement prepare-before-exclude; preserve recovery messages and staged-work gating. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | Project only Candidates with a currently assigned photo as active items; scope Batch Commit Candidate validation/creation to Candidates with assigned photos while preserving excluded evidence/history. |
| `apps/web/test/intake-ui.test.tsx` | Assert automatic start, no Upload button, failed-only replacement/removal, correct replacement ordering and recovery, and absence on nonfailed items. |
| `apps/api/test/intake.integration.test.ts` | Prove excluded failed Candidates are retained but omitted from active items and do not block committing remaining ready/typed Candidates. |
| `tests/browser/intake.spec.ts` | Remove explicit Upload click and verify selection automatically starts the multi-photo workflow. |

## Files to Reference Only

| File | Why |
|---|---|
| `packages/contracts/src/intake.ts` | Existing states and nullable item/type contract remain sufficient. |
| `apps/api/src/modules/inventory/intake/intake.service.ts` | Existing exclusion and commit service boundaries remain unchanged. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | Failed runs/evidence remain immutable and attributable. |
| `packages/database/src/schema.ts` | Confirms photo/run delete restrictions and that no migration is needed. |
| `docs/adr/0015-post-recognition-type-and-final-intake-commit.md` | Immediate preparation and final atomic approval boundaries remain authoritative. |

## Files Not to Touch

- `apps/api/src/modules/inventory/intake/recognition/providers/**` and `recognition.policy.ts` — recognition behavior is not being changed.
- `packages/database/drizzle/**` and `packages/database/src/schema.ts` — no schema change is required.
- `apps/api/src/modules/inventory/qr/**` and `apps/web/src/lib/qr-client.ts` — QR behavior is outside this ticket.
- `source-materials/**`, `.codex-build/**`, and `tools/artifact-generation/**` — non-runtime inputs/artifacts.

## Codegraph Findings (live, this ticket)

- `chooseNameplates` currently only stages local files; `uploadNameplates` separately calls the reusable `uploadAndPrepare` helper.
- `Retry this Machine` calls `requestIntakeRecognition` against the same persisted photo.
- `prepareIntakeItem` already creates one type-free Candidate/photo/targeted run and is the correct replacement-item boundary.
- `excludeIntakePhoto` already preserves the photo row, clears its active Candidate assignment, marks it excluded, resets the affected Candidate to draft, bumps the Batch version, and records audit/idempotency.
- `removePhoto` is not safe after recognition because targeted runs reference the photo with `ON DELETE RESTRICT`.
- `IntakeRepository.detail()` currently derives an item from the latest run even when the Candidate no longer has an assigned photo; it must require a current assigned-photo lateral row.
- `IntakeRepository.commit()` currently checks every Candidate in the Batch, including a draft Candidate orphaned by evidence exclusion; active validation must use only Candidates with currently assigned photos.

## Reuse Audit

Reused:

- Existing bounded concurrent file upload and sequential optimistic-version preparation.
- Existing `prepareIntakeItem` for replacement evidence as a new active item.
- Existing audited `excludePhoto` mutation for preserving/removing failed evidence from active work.
- Existing staged-work callback and final readiness predicate.
- Existing atomic Batch Commit for all remaining active Candidates.

New code justified because:

- A small UI orchestration is needed to prepare replacement evidence before excluding the original failed item.
- Repository queries need an explicit active-Candidate definition based on currently assigned evidence; no reusable predicate exists yet.

Do not duplicate:

- File grants/upload policy, item preparation, exclusion, recognition requests, Candidate creation, or Batch Commit logic.
- Do not create a replacement-evidence endpoint or physically delete recognition history.

Escalated to human:

- None. Live data, delete restrictions, exclusion behavior, and active commit/query behavior were confirmed.

## Implementation Plan

1. Make photo selection stage the chosen files and immediately invoke the existing upload/preparation routine; remove the explicit Upload button.
2. Keep local upload failure retry/removal controls, but remove persisted same-photo recognition retry.
3. Add failed/stale-only replacement input and removal button.
4. For replacement, upload and prepare the new item first, then exclude the old photo using the latest returned Batch version; refresh detail/recognition and surface recoverable partial-success messages.
5. Make exclusion hide Candidates with no current assigned photo from active `items`.
6. Scope final Batch Commit validation and Machine creation to Candidates with current assigned photos, without deleting or mutating excluded evidence/history.
7. Update focused UI/API/browser coverage and run the required gates.

## Constraints

- Preserve immutable failed recognition evidence and audit history.
- Preserve one active photo per newly prepared replacement item; the excluded old photo is historical evidence, not an active item.
- Never exclude the old failed item before replacement preparation succeeds.
- Continue validating authorization, idempotency, Load ownership, file readiness, optimistic versions, and server-side final commit rules.
- Existing unassigned photos still block commit; only explicitly excluded failed evidence is ignored.
- Preserve old individually mapped Candidates and legacy manual-review compatibility.
- Follow `AGENTS.md`, existing style, and the reuse-vs-inline rule.
- Preserve unrelated dirty-worktree changes and do not commit.
- Do not log filenames, image bytes, OCR/provider payloads, secrets, or PII.

## Tests Required

- `npm run lint`
- `npm run typecheck`
- Focused web Intake tests.
- Focused API Intake integration tests.
- `npm run test:browser`
- `npm run build`
- Manual confirmation that the latest four-photo Intake remains readable and its now-ready first item is not offered failed-only controls.

## Done Criteria

- Selecting photos starts upload/preparation without another button click.
- No active `Upload nameplates` button remains.
- Failed/stale persisted items show only replacement and failed-image removal actions, not same-image retry.
- Replacement begins recognition automatically and does not discard the original until the new item is prepared.
- Remove is absent from nonfailed persisted items.
- Excluded failed evidence/history remains stored but disappears from active items and does not block remaining valid Machines.
- Final Batch Commit still requires every remaining active Candidate to be recognition-ready, confirmed, and typed.
- Focused and full required gates pass with no unrelated regression.
