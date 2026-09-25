# technician-triage-and-machine-video — Tap-only initial checks and private test videos

## Goal

Give a Washer/Dryer technician one low-friction Production path from QR scan to initial bearing check to full testing, with no required typing. Machines that have not been assessed must appear in My Work, the initial check must deterministically create Test work or route an exception to Owner review, and a successfully tested Machine must retain a private video attachment showing its identity and operation.

## Ticket Summary

- Extend **My Work** with an **Initial checks** queue before the existing Test Work Order queue.
- Initial-check candidates are on-hand Washer/Dryer Machines in `not_assessed` Production state.
- Technician/Cleaner users see only candidates matching their configured Washer/Dryer specialties. Owner Admin sees all candidates. Warehouse does not gain My Work access.
- A Machine QR scan by a Production executor routes first to its active Test Work Order, otherwise to its eligible initial check, otherwise to the existing Machine result.
- The initial-check screen shows Machine identity and three large tap targets with no text input:
  - **Smooth — no bearing concern**
  - **Bearing noise or movement detected**
  - **Unable to assess**
- The server owns the mapping into the existing immutable Preliminary Inspection model:
  - smooth → `no_concern_observed` + `repairable` → `awaiting_test` and exactly one Test Work Order;
  - bearing concern → `concern_observed` + `owner_review` → `blocked`;
  - unable → `unable_to_assess` + `owner_review` → `blocked`.
- Fixed observation/reason text is generated centrally by Production. The browser must not manufacture lifecycle decisions or submit free-form substitutes.
- Keep Owner approval for Parts-only/Scrap and all existing append-only history. Never automatically scrap or mark a Machine parts-only because of bearing noise.
- Replace the active free-text Preliminary Inspection creation form on Machine detail with an **Open initial check** action when eligible. Keep inspection/disposition history and Owner decision controls readable.
- Add private Machine-targeted `production_test_video` attachments using the existing Files grant/storage boundary.
- Accept only signature-verified `video/mp4`, `video/quicktime`, and `video/webm` for that purpose.
- Add a separate configured video byte limit, default 100 MiB. Keep the existing general file limit unchanged. Multipart handling may be buffered only within that explicit bound.
- A Test run that has no failed checklist results requires one ready same-Machine `production_test_video` before completion. A failed run does not require or link a success video and still routes to `awaiting_repair`.
- The test screen offers direct rear-camera video capture/upload after all checklist steps are recorded as passing, with brief guidance: start on the manufacturer nameplate, then show the Machine operating.
- Completion links the ready video to the exact immutable Test run while it remains visible in the Machine attachment list.
- Existing required still-photo evidence remains image-only under `production_test_evidence`; a video is not accepted as a photo substitute.
- All video access remains authenticated, grant-backed, private, and `no-store`.

## Expected Output

- `/work` visibly separates **Initial checks** from **Ready to test** work.
- `/work/initial-check/[machineId]` provides a tablet-first, no-typing initial bearing check.
- Scanning an eligible unassessed Machine label opens that initial check for matching technicians.
- Smooth results immediately make the Machine available as Test work; concern/unable results disappear from technician work and enter the existing Owner-review path.
- Successful Washer/Dryer Test completion is blocked until its private test video is uploaded and verified.
- Machine Attachments lists the ready video and permits authorized private download through the existing one-time grant flow.
- A forward migration adds only the new video media policy and Test-run relationship; existing Machines, inspections, orders, results, and files remain intact.

## Non-Goals

- Do not implement the Repair checklist, Cleaning workflow, QA Release, parts inventory, or shipment release.
- Do not automatically decide Parts-only or Scrap from bearing evidence.
- Do not create a second Preliminary Inspection history model or a persistent initial-check work-order table.
- Do not give Warehouse users the Technician My Work workspace or specialty assignments.
- Do not add speech-to-text, notes, timers, model-specific diagnostics, automatic video analysis, thumbnails, transcoding, editing, or public sharing.
- Do not require preliminary photos or videos in this ticket.
- Do not treat a successful test/video as QA Release, listing approval, or shipment approval.
- Do not change QR payloads; the QR remains a non-authorizing Machine lookup reference.
- Do not broaden `production_test_evidence` to video or weaken its still-photo checks.
- Do not add protected responses or offline writes to the service-worker cache.

## Planned Follow-up Scope

- Keep the Initial Bearing Check as the canonical early gate before full testing. Publish new immutable Washer and Dryer Test checklist versions without the duplicate bearing step; apply them only to new Test runs.
- On the Test screen, show the prior bearing result, technician, and time as a read-only pre-check summary. Offer an explicit bearing recheck only when the technician notices a new concern, and record that recheck as a new attributable event.
- Preserve the checklist version and results already pinned to in-progress runs, and leave completed Test history unchanged.

## Relevant Existing Code

| File/Symbol                                                                                           | Why it matters                                                                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/contracts/src/production.ts`                                                                | Owns Preliminary, specialty, queue, checklist, run, and completion contracts.         |
| `apps/api/src/modules/production/production.repository.ts` / `stateFor` / `create`                    | Canonical atomic Preliminary history, disposition, lifecycle, and Test-order handoff. |
| `apps/api/src/modules/production/test-work.repository.ts` / `queue` / `createOnRepairable` / `finish` | Existing specialty queue, claim rules, immutable Test results, and pass/fail routing. |
| `apps/api/src/modules/inventory/inventory.service.ts` / `INVENTORY_OPERATIONS`                        | Only supported cross-module access to Machine state.                                  |
| `packages/contracts/src/files.ts`                                                                     | Canonical attachment purposes/media types and grant payloads.                         |
| `apps/api/src/modules/files/content-policy.ts`                                                        | Canonical target/purpose/byte-signature policy.                                       |
| `apps/api/src/modules/files/files.service.ts` / `FILES_OPERATIONS`                                    | Private ready-file validation and grant/storage boundary.                             |
| `apps/web/src/app/(protected)/work/page.tsx`                                                          | Existing My Work queue surface.                                                       |
| `apps/web/src/app/(protected)/work/[orderId]/test-work-view.tsx`                                      | Existing tap-only Test runner and still-photo upload pattern.                         |
| `apps/web/src/app/(protected)/scan/scan-view.tsx`                                                     | Existing QR-to-active-Test routing.                                                   |
| `apps/web/src/app/(protected)/attachments-panel.tsx`                                                  | Reusable Machine attachment upload/list/download UI.                                  |
| `apps/web/src/app/(protected)/machines/[machineId]/preliminary-inspection-panel.tsx`                  | Existing manual creation/history/Owner approval surface to simplify.                  |

## Files to Modify

| File                                                                                                  | Required change                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/production.ts` and tests                                                      | Add initial-check input/choice, queue candidates/work destination, Test-run video link, and finish request with nullable video ID.                    |
| `packages/contracts/src/files.ts` and tests                                                           | Add `production_test_video` and the three bounded video media types.                                                                                  |
| `packages/config/src/environment.ts`, config tests, `.env.example`                                    | Add `FILE_VIDEO_MAX_BYTES` with a 100 MiB default and bounded validation.                                                                             |
| `packages/database/src/schema.ts`, exports if required, migration journal, new forward migration      | Widen file purpose/media checks, require Machine target, add nullable Test-run video FK/unique relationship, preserve prior rows.                     |
| `apps/api/src/modules/inventory/{inventory.service,inventory.repository}.ts`                          | Add a narrow transaction-aware operation returning on-hand, unassessed Washer/Dryer candidates; do not expose tables to Production.                   |
| `apps/api/src/modules/production/{production.controller,production.service,production.repository}.ts` | Add the tap-only command and central deterministic mapping while reusing the existing Preliminary transaction.                                        |
| `apps/api/src/modules/production/{test-work.controller,test-work.service,test-work.repository}.ts`    | Compose initial candidates into My Work, resolve QR work destination, specialty-authorize the quick check, and enforce/link success video on finish.  |
| `apps/api/src/modules/files/{content-policy,files.service,files.repository,files.module}.ts`          | Detect video containers, enforce purpose-specific limits, validate ready Test video separately from still evidence, and raise multipart bound safely. |
| `apps/web/src/lib/{production-client,files-client}.ts`                                                | Parse the new contracts and submit quick checks/video-aware completion using existing transports and grants.                                          |
| `apps/web/src/app/(protected)/work/page.tsx`                                                          | Render separate initial-check and Test queues with clear empty states.                                                                                |
| `apps/web/src/app/(protected)/work/initial-check/[machineId]/**`                                      | Add the focused identity confirmation and three-button initial-check view.                                                                            |
| `apps/web/src/app/(protected)/work/[orderId]/test-work-view.tsx`                                      | Capture/upload a private success video and pass its ready ID to completion; keep failed completion video-free.                                        |
| `apps/web/src/app/(protected)/scan/scan-view.tsx`                                                     | Route through the server-provided next-work destination after QR resolution.                                                                          |
| `apps/web/src/app/(protected)/attachments-panel.tsx`                                                  | Offer Production test video only for Machine targets and accept matching video types without changing Load policy.                                    |
| `apps/web/src/app/(protected)/machines/[machineId]/preliminary-inspection-panel.tsx`                  | Remove free-text creation UI, add eligible initial-check link, preserve history and Owner disposition actions.                                        |
| `apps/web/src/app/styles.css`                                                                         | Reuse existing panel/button tokens for large initial-check and video controls.                                                                        |
| API, web, contract, database, and browser tests named below                                           | Cover policy, authorization, transitions, QR routing, video gating, and regressions.                                                                  |

## Files to Reference Only

| File                                                         | Why                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `ARCHITECTURE.md` §§6–7 and Reuse Map                        | Production/Files/Inventory ownership and lifecycle invariants.                                          |
| `CONTEXT.md`                                                 | Preliminary Inspection, Preliminary Disposition, Machine, Production Work Order, and evidence language. |
| `DECISIONS.md` preliminary and private-file decisions        | Owner-review and private-by-default constraints.                                                        |
| `docs/adr/0002-modular-monolith-and-evented-integrations.md` | Cross-module collaboration through explicit interfaces.                                                 |
| `specs/AUT-357.md`                                           | Existing immutable Preliminary behavior.                                                                |
| `specs/production-test-queue.md`                             | Existing specialty/Test queue and photographed pilot checklist contract.                                |
| `specs/SF-04.md`                                             | Existing private attachment/grant/storage guarantees.                                                   |
| `apps/web/src/app/(protected)/scan/qr-camera-scanner.tsx`    | Camera cleanup pattern only; do not reuse QR frame capture as video evidence.                           |

## Files Not to Touch

- `source-materials/**` — read-only source evidence.
- Existing migrations through `packages/database/drizzle/0016_production_test_queue.sql` — add a forward migration only.
- Catalog, Intake recognition, Imports, Listings, Sales, Logistics, and external integrations — outside this slice.
- QR signing/token generation — destination resolution changes, not label identity.
- Service-worker protected-data policy — no video or work response caching.

## Codegraph Findings (live, this ticket)

- The index was synchronized before this spec; current symbols and dirty-worktree additions are included.
- `getTestQueue` has callers on the protected Home and `/work`; extending its response requires both consumers and tests to be updated.
- `TestWorkRepository` already depends on `INVENTORY_OPERATIONS`, `FILES_OPERATIONS`, audit, and idempotency, so candidate composition and video validation belong there without new cross-table controller queries.
- `ProductionRepository.create` already writes inspection, disposition, Machine lifecycle, audit/outbox, idempotency, and calls `createOnRepairable` in one transaction. The quick command must feed this path rather than copy it.
- `AttachmentsPanel` is shared by Load and Machine detail. Video options must be target-conditional so Load upload policy stays unchanged.
- Files currently validates JPEG/PNG/WebP/HEIC/HEIF/PDF signatures and buffers within a configured hard limit. Video needs explicit signatures and a separate bound; filename/MIME alone is insufficient.
- `production_test_evidence` is currently used by checklist step results and validated as a same-Machine ready photo. Expanding it to video would weaken an existing invariant, so a separate purpose is required.
- QR resolution currently asks only for an active Test order. A server-returned destination avoids duplicating specialty/state decisions in `scan-view.tsx`.

## Reuse Audit

Reused:

- Existing Preliminary transaction/state mapping, Test-order uniqueness, specialty assignments, claim rules, Inventory operations interface, Files grants/storage/content checks, protected transports, synchronized client state, route-state handling, QR resolver, audit/outbox, and idempotency coordinator.
- Existing `MachineSchema` in queue candidates; do not introduce a second Machine summary contract unless response size proves material.
- Existing Machine attachment list/download behavior for completed video access.

New code justified because:

- No tap-only Preliminary command, initial-check queue/destination, video media policy, or Test-run video relationship exists.
- A distinct video purpose preserves the existing still-photo evidence invariant.
- A server-owned destination is necessary to keep QR UI free of specialty/state business rules.

Do not duplicate:

- Disposition mapping in React, Machine state SQL in Production, specialty authorization in pages, MIME/purpose policy in upload components, signature detection in controllers, or one-time grant logic outside Files.

Escalated to human:

- None. The 100 MiB limit is a bounded pilot default; duration/transcoding policy remains explicitly out of scope.

## Implementation Plan

1. Extend contracts/config and add the forward migration for video policy plus the Test-run video relationship.
2. Add strict MP4/QuickTime/WebM signature detection and purpose-specific byte limits in Files; expose separate ready-photo and ready-video validation operations.
3. Add Inventory's narrow preliminary-candidate read operation and compose it into Production's specialty-filtered queue.
4. Add the validated initial-check command. Derive fixed existing Preliminary input on the server and reuse the existing atomic repository transaction.
5. Add a Production work-destination read that prefers active Test work, then an eligible initial check, else none; enforce authorization server-side.
6. Extend successful Test completion to validate and link one ready same-Machine test video. Preserve current failed-test routing without requiring video.
7. Build the initial-check route, queue cards, QR routing, and Machine-detail link with no free-text creation controls.
8. Add the Test video capture/upload control and Machine attachment option using existing Files grants and online/error patterns.
9. Add deterministic contract, policy, database, API, component, and browser coverage; run all workspace gates.

## Constraints

- Preserve unrelated dirty-worktree changes and current uncommitted Production Test implementation.
- The initial queue is derived from authoritative current Machine state; it does not create speculative records.
- Only `on_hand` + `not_assessed` Washer/Dryer Machines are eligible. `blocked` Machines do not loop back into technician initial work.
- Technician quick checks require matching specialty at mutation time; stale cards must fail safely with conflict/not-found behavior.
- The initial-check mapping is centralized, deterministic, and idempotent. Concurrent taps create at most one inspection effect and one open Test order.
- Video must be ready, Machine-targeted, purpose-correct, same-Machine, unused by another Test run, and checksum/storage verified before linking.
- Successful completion and video linking occur in the same database transaction as Test/Machine state completion. File bytes remain outside the database under Files ownership.
- Continue to use current full-buffer upload mechanics only within the explicit 100 MiB video ceiling; never log bytes, filenames, grant tokens, request bodies, or raw storage errors.
- Keep download responses private and `no-store`; no public/pre-signed object URL enters contracts or UI state.
- UI controls must be keyboard accessible, tablet-sized, explicit about busy/offline state, and resilient to refresh/conflict.

## Tests Required

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- Contract tests: strict quick-check choices, queue/destination shape, Test-run video ID, finish request, new purpose/media types.
- Content-policy tests: valid representative MP4/QuickTime/WebM signatures; declared/detected mismatch; disguised bytes; wrong target/purpose; existing photo/PDF regressions; normal/video byte bounds.
- Database tests: forward migration preserves existing rows, media/purpose checks reject invalid values, Test-run video FK/uniqueness works.
- Production integration: specialty queue filtering; smooth creates one Test order; concern/unable blocks to Owner review; retry replay; stale version/concurrency; Other/off-hand/ineligible rejection; Owner view.
- Test integration: same-Machine ready video permits successful completion and is linked; absent/wrong-purpose/wrong-Machine/not-ready/reused video is rejected; failed run needs no video and routes to repair; still-photo evidence remains image-only.
- Web tests: queue sections, no-typing initial view, button disabled/busy/offline states, Machine-detail manual form removal/history retention, capture accept/camera attributes, success-video gating, QR destination routing.
- Browser journey: sign in as matching Technician, scan/open unassessed Machine, tap smooth, enter generated Test order, complete steps, upload a deterministic small video fixture, finish to Awaiting Clean, and confirm video on Machine attachments.
- Browser exception journey: bearing concern routes to Owner review and disappears from technician My Work without creating Test work.

## Done Criteria

- A matching Technician can start from My Work or QR and record the initial bearing outcome without typing or navigating through the full Machine form.
- Smooth creates exactly one Test Work Order; concern/unable creates no Test order and remains reversible under Owner review.
- Machine detail no longer exposes free-text Preliminary creation in the active workflow, while history and Owner decisions remain available.
- A passing Test cannot finish without one verified private video linked to that Machine and Test run; a failing Test can finish without video and moves to Awaiting Repair.
- Videos remain private, bounded, signature-checked, attributable, downloadable from Machine attachments, and absent from public/offline caches.
- Existing photo evidence, QR privacy, role permissions, lifecycle separation, idempotency, audit/outbox, and unrelated workflows remain green.
- All required tests and builds pass with no duplicated state, specialty, file-policy, or transport logic.
