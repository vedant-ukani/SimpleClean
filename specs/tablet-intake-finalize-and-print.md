# tablet-intake-finalize-and-print — Post-recognition type selection and one final Inventory action

## Goal

Make the active tablet Intake flow match the warehouse task: choose and upload all nameplate images without classifying them first, let each image run through recognition, classify each recognized Machine as Washer, Dryer, or Other, and add every ready Machine to Inventory through one final audited action. Remove per-card Inventory actions and status badges. Make the whole-Intake QR action visibly open the PDF for tablet printing instead of silently downloading it.

## Ticket Summary

- Keep one selected nameplate image equal to one physical Machine Intake Item.
- Do not ask for Machine type in the local staging area and do not block upload on type.
- Prepare each uploaded image with a null Machine type and queue its existing targeted Recognition Run immediately.
- Preserve compact previews, bounded concurrent byte upload, sequential optimistic-version item preparation, retry behavior, private evidence, and the existing recognition provider boundaries.
- Return active Intake items even while their Machine type is null.
- After recognition has completed successfully, show a required `Choose type` dropdown on the persisted Machine card with Washer, Dryer, and Other options.
- The selected type remains a constrained human observation and uses the existing candidate-type mutation and attribution fields. OpenAI must not choose or overwrite it.
- Remove the visible per-card recognition/status badge, including `Added to Inventory`. Keep the card's field values, failure/recapture actions, and global actionable messages.
- Remove `Add this Machine to Inventory` from every active card.
- Replace active `Finish Receiving` with one final `Add Machines to Inventory` button at the end of the Intake.
- Enable that button only when there is at least one Intake item, no locally staged/uploading/preparing item remains, every item has a successful ready Recognition Run, every Candidate is confirmed, and every Candidate has a human-selected type. An already-mapped item in an older open Intake is considered resolved for compatibility.
- The final button must call the existing non-`finishOnly` Batch Commit so all unmapped ready Candidates are created and the Intake Batch is closed in one database transaction. It must not loop over the per-Candidate endpoint from the browser.
- The server must reject final Batch Commit with `machine_type_required` if any unmapped Candidate lacks a type, even if a stale or custom client tries to commit.
- Preserve historical Individual Intake Commit and `finishOnly` API behavior for already-created/in-progress Intakes and compatibility tests, but the active UI must no longer expose those actions.
- `Print all QR labels` must synchronously reserve a new browser tab from the user click, load the private PDF Blob into that tab when the request completes, and leave the PDF visible for the tablet's print/share controls.
- If a preview tab cannot be opened, fall back to the existing PDF download rather than doing nothing. Return enough result information for the UI to say whether the sheet opened or downloaded.
- Close an unused blank preview tab when the PDF request fails, keep the existing authenticated/no-store POST and idempotency behavior, and revoke Blob URLs only after a safe delay rather than immediately.

## Expected Output

- The Intake staging area shows compact selected-nameplate previews and one `Upload nameplates` action, with no per-image type controls.
- Uploaded Machine cards become recognizable immediately; once ready, each has a `Machine type` dropdown starting at `Choose type`.
- Cards have no top status badge and no per-card Inventory button.
- One `Add Machines to Inventory` button appears at the end, remains disabled until the complete active Intake is ready and typed, and atomically creates/closes the Intake when confirmed.
- The committed Intake's `Print all QR labels` action opens a visible PDF preview tab on normal browsers/tablets, with download fallback when popups are blocked.
- Old individually committed Intake data remains readable and finishable through the compatible API path.

## Non-Goals

- Do not change Google Vision, OpenAI prompts/models, OCR-presence policy, recognition readiness rules, or provider adapters.
- Do not accept OpenAI's proposed Machine type.
- Do not add manual manufacturer/model/serial editing to the active workflow.
- Do not merge or suppress duplicate Machines.
- Do not make capacity required for Inventory creation or QR printing.
- Do not change individual QR label downloads or QR token/authorization rules.
- Do not remove historical Individual Intake Commit or legacy manual-review support.
- Do not add a database migration; `inventory_intake_candidate.machine_type` is already nullable.
- Do not redesign unrelated Intake, Load, Machine, navigation, or visual-system surfaces.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `ARCHITECTURE.md` Reuse Map | Inventory Intake owns orchestration; QR owns label rendering; contracts own cross-app validation. |
| `packages/contracts/src/intake.ts` / `PrepareIntakeItemRequestSchema`, `IntakeBatchDetailSchema` | Preparation currently requires type and active items currently declare a non-null type. |
| `apps/api/src/modules/inventory/intake/intake.service.ts` / `prepareItem`, `commit` | Existing validated service boundary and error mapping. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` / `prepareItem`, `changeCandidateType`, `commit`, `detail` | Canonical transaction, human type attribution, atomic Batch Commit, and item projection. |
| `apps/web/src/lib/intake-client.ts` / `prepareIntakeItem`, `commitIntakeBatch` | Validated browser client for preparation and the reusable atomic final action. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` / `MachineIntakeQueue`, `IntakeReviewView` | Active staging, cards, type selection, per-card commit, final action, polling, and QR UI. |
| `apps/web/src/lib/qr-client.ts` / `downloadIntakeQrLabelSheet` | Existing valid PDF request currently ends in a hidden anchor download. |
| `apps/api/test/intake-recognition.integration.test.ts` | Full-boundary targeted recognition preparation/readiness behavior. |
| `apps/api/test/intake.integration.test.ts` | Atomic Batch Commit and historical individual-commit compatibility. |
| `apps/web/test/intake-ui.test.tsx` | Active UI behavior and readiness gating. |
| `apps/web/test/intake-client.test.ts`, `apps/web/test/qr-client.test.ts` | Request shape and PDF browser behavior. |
| `tests/browser/intake.spec.ts` | Desktop/tablet full-boundary Intake journey. |

## Files to Modify

| File | Required change |
|---|---|
| `packages/contracts/src/intake.ts` | Make preparation type optional/absent and active item type nullable; keep the explicit type-change request required. |
| `apps/api/src/modules/inventory/intake/intake.service.ts` | Pass nullable preparation type through the existing service boundary if needed; retain current authorization/idempotency/error mapping. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | Create prepared Candidate with null type and null human-selection attribution; include null-type items in detail; explicitly require type for every unmapped Candidate in atomic Batch Commit. |
| `apps/web/src/lib/intake-client.ts` | Remove Machine type from the prepare request signature/body; continue parsing the updated detail contract. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Remove staging classification, card status badges, and per-card commit; add post-recognition `Choose type`; compute complete active readiness including local staging; expose one final atomic action; show accurate QR open/download message. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/page.tsx` | Replace the stale route instructions that still describe type-before-upload and one-at-a-time Inventory creation. |
| `apps/web/src/lib/qr-client.ts` | Add tablet-safe visible whole-Intake PDF preview with blocked-popup download fallback and lifecycle cleanup. Leave individual-label behavior unchanged. |
| `apps/api/test/intake-recognition.integration.test.ts` | Cover prepare-without-type, visible null-type item, recognition completion, later human type selection, and final atomic commit. |
| `apps/api/test/intake.integration.test.ts` | Cover server rejection of a confirmed but untyped Candidate; retain compatibility tests for individual commit/finish-only. |
| `apps/web/test/intake-client.test.ts` | Assert prepare request omits type and final commit remains the batch endpoint. |
| `apps/web/test/intake-ui.test.tsx` | Cover no staging type controls, immediate preparation, post-recognition dropdown, readiness disable/enable rules, no status badges/per-card button, and one final action. |
| `apps/web/test/qr-client.test.ts` | Cover visible tab preview, delayed URL cleanup, request failure cleanup, and blocked-popup download fallback. |
| `tests/browser/intake.spec.ts` | Update the real desktop/tablet journey to upload first, wait for recognition, choose types, use one final Inventory action, and observe a visible QR PDF page/popup. |

## Files to Reference Only

| File | Why |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | Recognition intentionally excludes Machine type when applying accepted OCR facts; preserve it. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` | Readiness remains the recognition owner's decision. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Batch Commit must continue using the Inventory-owned Machine creation interface. |
| `apps/api/src/modules/inventory/qr/qr-label.service.ts` | PDF generation and print recording are already correct. |
| `apps/web/src/app/styles.css` | Reuse existing staging/card/control styles; edit only if removed markup leaves a concrete layout defect. |
| `docs/adr/0008-pipelined-individual-intake-commit.md` | Historical decision that the new accepted ADR will partially supersede after implementation passes. |
| `docs/adr/0012-batch-nameplates-and-capacity-optional-qr-sheets.md` | Historical pre-upload classification decision to supersede after implementation passes. |
| `docs/adr/0014-openai-field-assignment-with-same-photo-ocr-presence.md` | Same-photo OCR support and human approval boundary remain unchanged. |

## Files Not to Touch

- `apps/api/src/modules/inventory/intake/recognition/providers/**` — provider behavior is outside this workflow ticket.
- `apps/api/src/modules/inventory/intake/recognition.policy.ts` — recognition acceptance is unchanged.
- `packages/database/drizzle/**` and `packages/database/src/schema.ts` — the type column is already nullable.
- `apps/api/src/modules/inventory/qr/qr-label.renderer.ts` — PDF content/layout is already valid.
- `source-materials/**`, `.codex-build/**`, and `tools/artifact-generation/**` — read-only inputs or non-application artifacts.

## Codegraph Findings (live, this ticket)

- `prepareIntakeItem` is exported only from `apps/web/src/lib/intake-client.ts`, called by active `review-view.tsx`, and asserted in `apps/web/test/intake-client.test.ts`.
- `PrepareIntakeItemRequestSchema` is the shared API boundary; the controller delegates to `IntakeService.prepareItem` without its own business rule.
- `commitIntakeBatch` already drives the repository's non-`finishOnly` atomic transaction and is used by the active/legacy review plus web tests.
- `IntakeRepository.commit()` already locks the Batch, validates optimistic version and private evidence, skips existing mappings, creates all unmapped confirmed Candidates through Inventory, records mappings/audit/idempotency, and closes the Batch in one transaction.
- `IntakeRepository.detail()` currently drops active items unless `row.machine_type` is truthy; this must change so null-type recognized items remain visible.
- `changeCandidateType` already records the actor/time and preserves a confirmed Candidate state. Reuse it after recognition.
- `downloadIntakeQrLabelSheet` is used only by active Intake review and its client test; the individual-label download is a separate function and should not change.

## Reuse Audit

Reused:

- Existing item preparation and targeted Recognition Run transaction.
- Existing candidate-type PATCH endpoint and attribution columns.
- Existing recognition readiness/confirmation result; do not invent UI recognition rules.
- Existing non-`finishOnly` atomic Batch Commit, Inventory service interface, mapping, audit/outbox, evidence, and idempotency rules.
- Existing global Intake message surface for actionable success/failure information.
- Existing PDF endpoint and Blob generation; change only browser presentation.
- Existing compact card/thumbnail/control visual patterns.

New code justified because:

- The active UI needs a small derived readiness predicate that includes persisted item readiness plus local staged/upload/preparation state. No existing shared decision owns this browser-only presentation state.
- Whole-Intake PDF preview needs a result (`opened` or fallback `downloaded`) so the UI message is truthful.

Do not duplicate:

- Machine creation, evidence validation, type attribution, optimistic concurrency, QR rendering, or recognition readiness inside React.
- Do not issue sequential per-Candidate commit requests from the final UI action.
- Do not create another QR endpoint or PDF renderer.

Escalated to human:

- None. The nullable database column, existing batch transaction, current caller set, and compatibility path were confirmed in live code.

## Implementation Plan

1. Update shared Intake contracts so preparation no longer requires type and item projections may carry null type.
2. Update service/repository preparation to create a Candidate with null type and no type-selection attribution while preserving the same photo/run transaction and fingerprint behavior.
3. Update the detail projection to return every valid item even when its type is null.
4. Harden the existing atomic Batch Commit with an explicit null-type rejection before any Machine creation.
5. Remove staging classification state and validation from the active web flow; upload/prepare selected files exactly as today without a type argument.
6. Render the persisted type selector with `Choose type` after recognition succeeds; continue using the existing type mutation.
7. Remove visible card status labels and individual commit controls while retaining preview, recognized facts, capacity, retry, and recapture behavior.
8. Derive final active readiness from the authoritative detail/recognition state plus local staged work, and wire one `Add Machines to Inventory` action to non-`finishOnly` Batch Commit.
9. Make the whole-Intake QR client pre-open a tab, fill it with the returned Blob PDF, fall back to a download when blocked, and report the presentation mode.
10. Update focused contract/client/UI/integration/browser tests, then run all required workspace gates.

## Constraints

- Preserve authorization and server-side validation; disabled UI is not enforcement.
- Preserve one photo, one Candidate, and one targeted Recognition Run per active item.
- Keep all consequential Inventory creation behind one explicit human confirmation and the existing atomic transaction.
- A selected type must not stale or alter recognized manufacturer/model/serial/electrical facts. Keep selection unavailable until the targeted run has completed if the existing Candidate revision rule would otherwise stale the run.
- Keep committed Intake terminal/read-only behavior.
- Preserve legacy data and API compatibility for previously individually committed Candidates.
- Preserve active duplicate-storage behavior: matching serials neither block nor merge Machines.
- Preserve optional capacity behavior.
- Keep private PDF requests authenticated and `no-store`; do not expose the Blob URL beyond the opened local tab.
- Follow `AGENTS.md`, existing code style, and the reuse-vs-inline rule.
- Keep changes scoped to this ticket and do not overwrite unrelated dirty-worktree changes.
- Do not log secrets, image bytes, OCR payloads, filenames, PII, or complete sensitive prompts.

## Tests Required

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- Manual browser verification at desktop and tablet size on `http://localhost:3000`:
  - choose multiple nameplates and verify no type prompt appears before upload;
  - upload and verify recognition starts immediately;
  - verify each completed card has `Choose type` and no top status text/per-card Inventory button;
  - verify final action remains disabled through staged, running, failed, or untyped states;
  - select every type, verify final action enables, approve it once, and verify the correct Machine count is created;
  - click `Print all QR labels` and verify a visible PDF preview/tab or explicit download fallback.

## Done Criteria

- No active pre-upload Machine-type prompt or validation remains.
- Null-type active items survive contract parsing and render after upload/recognition.
- OpenAI/recognition cannot set or overwrite the human Machine type.
- Every ready card supports the constrained type selection and no card exposes an Inventory commit action.
- No card displays `Queued`, `Reading nameplate`, `Ready for review`, `Recognition failed`, or `Added to Inventory` as a top status badge.
- Exactly one active `Add Machines to Inventory` action exists at the end of the Intake and is enabled only when the whole selected Intake is ready and typed.
- Final creation/closure is one atomic, idempotent Batch Commit and a custom client cannot commit an untyped Candidate.
- Historical individual-commit and finish-only behavior remains covered and working.
- Whole-Intake QR printing becomes visibly actionable on tablet, with tested blocked-popup fallback.
- Focused tests and all workspace quality gates pass.
- No duplicate business logic or unrelated refactor is introduced.
