# bulk-nameplate-intake — Batch-select nameplates with per-image type review

## Goal

Make Load Intake efficient for a truckload of Machines: staff choose all
nameplate photos in one action, review a compact thumbnail for each, assign
Washer, Dryer, or Other per image, and then start the existing independent
recognition workflow. Whole-Intake QR sheets must remain printable when capacity
was left unknown, and duplicate warnings must use plain operational language.

## Ticket Summary

- Replace the active one-photo capture control and global Washer/Dryer/Other
  buttons with one multi-file control labelled **Choose nameplates**.
- Stage every selected image in a compact client-side list with a bounded
  thumbnail and one required Machine type dropdown per image.
- Let staff remove a staged image before submission.
- Enable one **Upload nameplates** action only after every staged image has a
  selected type. Upload with bounded concurrency and prepare items sequentially
  through the existing per-item endpoint so optimistic batch versions remain
  correct.
- Preserve per-item recognition, retries, type correction, individual Inventory
  approval, and Finish Receiving.
- Make persisted Intake previews compact rather than full-card width.
- Replace raw warning enum text with clear explanations. Exact manufacturer and
  serial matches remain non-overridable duplicate blockers; weaker serial-only
  and manufacturer/model matches retain explicit acknowledgement.
- After Finish Receiving, allow the whole-Intake QR PDF to print even when one
  or more Machines have unknown capacity. Known capacities keep their current
  `40 LB - Washer` format; unknown values render `Capacity unknown - Washer`.

## Expected Output

- A worker selects many nameplate images once, sees small previews, chooses a
  type for every image, and uploads the group without repeating the file chooser.
- The three green type buttons and `Capture next nameplate` control are absent
  from the active Intake UI.
- Prepared items still recognize and commit independently using the existing API
  and data model.
- QR label sheets download successfully with mixed known and unknown capacities.
- Inventory warnings explain the possible duplicate condition in plain language.

## Non-Goals

- Do not group multiple photos into one Machine; every chosen image still means
  one physical Machine and one Machine Intake Item.
- Do not add bulk Inventory approval or bypass individual human review.
- Do not change identity normalization, exact-duplicate rejection, OCR/provider
  behavior, privacy rules, QR token contents, or label authorization.
- Do not add a bulk API endpoint or database migration.
- Do not remove the optional capacity selector from Intake.
- Do not rewrite the historical legacy Intake review path.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` / `MachineIntakeQueue` | Owns the active capture controls, item cards, capacity controls, warning rendering, and finished-sheet action. |
| `apps/web/src/lib/intake-client.ts` / `prepareIntakeItem` | Existing one-photo/type API client that must remain the preparation boundary. |
| `apps/web/src/app/styles.css` / Intake classes | Canonical thumbnail, staging, queue, and responsive visual rules. |
| `apps/api/src/modules/inventory/qr/qr-label.service.ts` / `printIntakeSheet` | Currently blocks a sheet when any committed Machine lacks capacity. |
| `apps/api/src/modules/inventory/qr/qr-label.renderer.ts` / `QrSheetMachine` | Renders visible label facts and currently requires numeric capacity. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` / `warningKinds`, `hasExactIdentityMatch` | Canonical matching and duplicate decisions; UI must describe rather than duplicate them. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Add active multi-file staging with per-file type selection/removal, reuse bounded upload and sequential item preparation, remove global type buttons, improve warning copy, and remove obsolete missing-capacity sheet handling. |
| `apps/web/src/app/styles.css` | Add responsive compact staged-nameplate layout and bound persisted preview dimensions to a tablet-friendly thumbnail. |
| `apps/api/src/modules/inventory/qr/qr-label.service.ts` | Remove the missing-capacity rejection and pass nullable capacity to the renderer. |
| `apps/api/src/modules/inventory/qr/qr-label.renderer.ts` | Accept nullable capacity and render explicit unknown-capacity text while preserving known formatting. |
| `apps/web/test/intake-ui.test.tsx` | Cover multi-file staging, required per-image type selection, button removal, compact previews, and human-readable warnings. |
| `apps/api/test/qr-label.test.ts` | Cover known and unknown capacity label text. |
| `apps/api/test/qr-label.integration.test.ts` | Replace the capacity-required failure expectation with successful mixed/unknown-capacity sheet coverage. |
| `tests/browser/intake.spec.ts` | Select three files once, assign three types in staged rows, upload once, verify independent processing, omit at least one capacity, and download/inspect the mixed-capacity PDF. |

## Files to Reference Only

| File | Why |
|---|---|
| `ARCHITECTURE.md` Reuse Map | Establishes Inventory Intake, Files, QR, visual-system, privacy, and test ownership. |
| `packages/contracts/src/intake.ts` | Confirms the existing one-file/type request and warning shapes are sufficient. |
| `apps/api/src/modules/inventory/intake/intake.service.ts` | Existing application boundary for per-item preparation and commit. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | Exact matching remains authoritative and unchanged. |
| `apps/web/src/lib/qr-client.ts` | Existing authenticated private PDF download remains unchanged. |

## Files Not to Touch

- `packages/database/**` — no schema change.
- Recognition providers/policy — the recognition and evidence rules remain intact.
- Machine identity normalization/matching code — duplicate semantics are unchanged.
- Service-worker/cache policy — private Intake and QR responses remain online-only.
- Historical ticket specs — they remain records of the decisions accepted then.

## Codegraph Findings (live, this ticket)

- `MachineIntakeQueue` owns one global `machineType` state and a single-file
  `capture()` function. The active file input reads only `files[0]` and uses
  `capture="environment"`.
- `prepareIntakeItem` already atomically links one uploaded file, creates one
  Candidate/Item, records the selected type, and queues targeted recognition.
  Reusing it avoids a new API or transaction boundary.
- Each preparation increments the Batch version. Concurrent preparation would
  create avoidable conflicts, so preparation must be sequential even if raw file
  uploads use the existing maximum concurrency of three.
- The legacy path already demonstrates bounded parallel upload but does not have
  per-image type selection and must not become the active workflow.
- `.intake-photo-preview` currently uses `width: 100%`; both active and legacy
  previews inherit the oversized presentation.
- Warning kinds compare normalized facts against Inventory plus other Candidates
  in the same Batch. `serial_match` is an exact manufacturer+serial duplicate and
  cannot be overridden by acknowledgement during commit.
- `printIntakeSheet` rejects null capacity before creating/reusing labels. The
  renderer and service are internal boundaries, so accepting `number | null`
  requires no public contract change.

## Reuse Audit

Reused:

- Existing private `uploadPhoto` flow, per-item `prepareIntakeItem` client/API,
  optimistic version refresh/retry pattern, targeted recognition, item queue,
  type correction, individual commit, and Finish Receiving.
- Existing bounded-concurrency approach from the legacy uploader, adapted inside
  the active workflow without making the legacy UI authoritative.
- Existing QR service authorization, active-label reuse, print history, PDF
  rendering, and private download behavior.
- Existing server-supplied warning kinds; the UI adds presentation copy only.

New code justified because:

- Active staged upload items need selected type, local preview lifecycle, removal,
  and upload/preparation status that the legacy `UploadItem` does not model.
- Nullable visible capacity formatting belongs in the sheet renderer because it
  is a label-presentation decision.

Do not duplicate:

- Type enums, identity matching, Intake mutation rules, version-conflict policy,
  file authorization, QR signing, or download transport.

Escalated to human:

- None. The user explicitly changed the accepted product rule: missing capacity
  must no longer block whole-Intake QR printing.

## Implementation Plan

1. Replace the active capture panel with one multiple file input and local staged
   nameplate cards containing compact preview, filename, required type dropdown,
   and remove control.
2. Validate that every staged image has a type, upload bytes with at most three
   concurrent requests, then prepare successful files sequentially using the
   latest authoritative Batch version and the existing conflict retry.
3. Keep failed staged items actionable without duplicating successfully prepared
   items; clear only items that entered the authoritative queue.
4. Replace raw warning codes with clear duplicate explanations while retaining
   the existing acknowledgement/blocking behavior.
5. Bound active/legacy image previews in canonical CSS and keep cards responsive
   at tablet and phone widths.
6. Remove the capacity gate from sheet generation, render a clear unknown value,
   and simplify the finished Intake UI accordingly.
7. Update deterministic unit, integration, and browser coverage for one-shot
   multi-file selection, per-image types, compact images, duplicate explanations,
   and mixed-capacity sheet printing.

## Constraints

- Preserve unrelated dirty-worktree changes.
- Treat every selected image as private evidence; do not log filenames, bytes,
  image data, raw OCR, or full payloads.
- Revoke local object URLs when staged previews are removed or the component
  unmounts.
- Bound selection to the existing remaining 100-photo limit and accepted image
  media types.
- Do not start preparation for a staged item without an explicit selected type.
- A retry must not duplicate a successfully prepared Candidate or recognition run.
- Keep interactive targets at least 44px and labels accessible.
- Keep known QR label text unchanged; unknown capacity must be explicit, not zero,
  blank, `null`, or `undefined`.
- Preserve authenticated `no-store` private QR responses and print activity.

## Tests Required

- `npm run lint`
- `npm run typecheck`
- `npm test -w @simply-clean/web`
- Focused API QR renderer/integration tests
- Focused Playwright `tests/browser/intake.spec.ts` in desktop and tablet projects
- `npm run build`

## Done Criteria

- One file-chooser action can select multiple nameplates and every selected image
  has an independent required type dropdown before preparation.
- No global Washer/Dryer/Other buttons or single-file `Capture next nameplate`
  control remain in the active Intake UI.
- Compact previews remain contained and do not dominate the queue at desktop,
  tablet, or phone widths.
- Per-item recognition, correction, warning review, approval, and Finish Receiving
  continue to work independently and idempotently.
- Exact duplicate identity remains blocked; weaker warning acknowledgements remain
  attributable and the UI explains both clearly.
- A finished Intake with unknown capacity downloads a valid sheet whose affected
  labels say `Capacity unknown - <Type>`.
- Required checks pass with no duplicate domain logic or unrelated changes.
