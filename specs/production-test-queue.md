# production-test-queue — Technician test queue and QR-started washer and dryer checklists

## Goal

Give Technician/Cleaner users a focused, tablet-first testing workflow: the application filters ready work by each worker's Washer/Dryer specialty, a Machine QR scan opens its active Test Work Order, the worker records an approved checklist through taps and required photos rather than typing, and the system atomically routes the Machine to Awaiting Repair or Awaiting Clean. Preserve worker attribution, immutable test evidence, and separate Inventory and Production state.

## Ticket Summary

- Keep the existing `technician_cleaner` authorization role. Washer, Dryer, and Both are Production-owned worker specialties, not new roles or permissions.
- Let Owner Admin assign Washer, Dryer, both, or neither to each active Technician/Cleaner user.
- Automatically create one open Test Work Order when an on-hand Machine receives a final Repairable Preliminary Disposition.
- Backfill exactly one open Test Work Order for existing on-hand Machines whose current Production state is `preliminary_passed`.
- Add a protected **My Work** workspace. Technicians see only uncompleted Test Work Orders matching their specialties plus work already assigned to them; Owner Admin can inspect all work.
- Use stable readiness order within the pilot queue. Do not claim that readiness order represents sale urgency, price, or expected profit.
- After a Machine QR resolves, automatically open its active Test Work Order for users allowed to execute Production work. Preserve normal Machine lookup for other users or Machines without an active order.
- Starting a Test atomically claims the Work Order for the signed-in worker and moves Production to `testing`.
- Run one approved, immutable, versioned Washer or Dryer checklist. Each visible step uses large **Pass**, **Fail**, and permitted **N/A** controls; no technician text field is required.
- Allow a checklist step to require a private Machine photo. Reuse Files grants, policy, and storage; do not upload QR camera frames or create public media URLs.
- Persist each step result as append-only attributable history. A correction appends a later result and retains the original.
- Complete only when every required step has a latest valid result and every required photo is ready and linked to the same Machine/run.
- Completion with all required steps passing moves Production to `awaiting_clean`; any failed required step moves it to `awaiting_repair`. Inventory remains `on_hand`.
- The resulting queue and state identify the next handoff; this ticket does not perform Repair, Retest, Cleaning, or QA.

## Product Decisions for This Slice

- William's current Washer/Dryer division becomes a scheduling capability, not a dedicated authentication role. Names such as Blake or James are never hardcoded.
- `both` is represented by two specialty records, not a third Machine type or role.
- `other` Machines do not enter the automated Washer/Dryer Test queue; Owner Admin sees an exception instead.
- A worker with no specialty sees an empty queue and a clear Owner-configuration message.
- A QR label continues to identify a Machine only. The authenticated application resolves the Machine, asks Production for its active Work Order, and then navigates; the QR token never authorizes or encodes work.
- Scan resolution does not start or claim work. The worker explicitly taps **Start Test** after confirming the Machine summary.
- Only the claimant records results. Owner Admin may release or reassign an unfinished claim; reassignment is audited and never rewrites prior results.
- Queue order in this ticket is `queuedAt`, then Work Order ID. Transcript rules for sold/reserved priority remain required future Sales integration; value/profit ranking waits for authoritative Pricing data.
- Checklist templates are immutable once approved. A later approved version applies only to new runs; an in-progress run remains pinned to its starting version.
- Checklist selection is by Machine type in this slice. Model-specific selection is later work.
- Step failure itself is the structured failure record for this slice. Free-text diagnosis, Defects, AI troubleshooting, Repair instructions, Parts, and voice notes are later tickets.
- A completed successful test is not Cleaning completion or QA Release. Only a future explicit QA action can produce `qa_released`.

## Owner Approval Gate

- Agent B must receive one reviewed Washer checklist manifest and one reviewed Dryer checklist manifest before implementation starts.
- Each manifest must identify ordered step keys, worker-facing instruction, whether N/A is permitted, whether failure stops the run, and whether a photo is required.
- The photographed checklists and transcript are source material only. Agent B must not convert them into executable safety instructions without William's explicit approval.
- If the manifests are absent or ambiguous, Agent B stops and reports the named checklist fields that remain unresolved; it must not invent electrical, gas, mechanical, measurement, or pass/fail rules.

Gate satisfied for the 2026-09-24 pilot: the user explicitly approved the photographed checklists' Testing sections as the manifests, excluding Cleaning and QA. The approved mapping preserves visible order and worker-facing wording: 15 Washer steps and 16 Dryer steps. N/A is permitted only for the Washer step beginning “If possible, advance cycle to high spin”; `stopOnFailure=false` and `photoRequired=false` for every step because the source specifies neither a stop-on-failure rule nor a required still photo. Highlighted video requirements remain outside this slice; a still photo is not a video substitute.

## Expected Output

- Owner Admin can set a Technician/Cleaner's specialties from Team management without changing their application role.
- Technician/Cleaner Home replaces the placeholder with a **My Work** entry and matching queued count.
- `/work` shows responsive Test Work Order cards labeled Washer or Dryer, Machine facts, queue age, assignment, and current state.
- Scanning an eligible Machine opens `/work/<workOrderId>` automatically; scanning an ineligible Machine still produces a safe Machine lookup result.
- The Work Order page confirms Machine identity, offers **Start Test**, then presents one approved checklist step at a time with tap-only results and direct required-photo capture.
- **Finish Test** is enabled only after the server-valid completion conditions are met.
- A passing run displays **Ready for cleaning** and the Machine reports `awaiting_clean`.
- A failing run displays **Repair required**, lists failed steps, and the Machine reports `awaiting_repair`.
- Reloading or rescanning resumes the same pinned run without losing completed steps.
- Owner Admin can inspect all active/completed runs and release or reassign an unfinished claim.
- Every claim, reassignment, result, completion, state change, actor, checklist version, timestamp, audit entry, and outbox event survives reload and is queryable through Production.

## Non-Goals

- Do not implement Repair execution, diagnostic suggestions, Retest, Cleaning execution, cosmetic correction, Parts, QA Release, shipment release, or recovered-parts inventory.
- Do not add Washer Technician or Dryer Technician roles.
- Do not implement automated sold/reserved/value priority before Sales and Pricing supply authoritative signals.
- Do not build checklist authoring or approval UI; import only the two explicitly reviewed manifests.
- Do not add model-specific instructions, timers, multi-bay scheduling, automatic claim expiry, voice transcription, or video evidence.
- Do not change Preliminary Parts-only/Scrap Owner approval rules.
- Do not use Catalog facts, OCR, or AI to decide physical test outcomes.
- Do not add offline writes or protected response caching.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `ARCHITECTURE.md` Reuse Map and §§6–7 | Defines Production ownership, scan-before-work, separate lifecycle axes, and QA separation. |
| `docs/warehouse-workflow-observation.md` | Confirms current Washer/Dryer specialization, queue pain, testing evidence, and deferred rules. |
| `specs/AUT-357.md` | Existing Production transaction, permission, evidence, history, and Owner-review precedent. |
| `packages/contracts/src/production.ts` | Canonical home for Production commands and results. |
| `packages/contracts/src/{inventory,authorization,operations,files}.ts` | Canonical Machine states, permissions, audit/outbox values, and file policy. |
| `apps/api/src/modules/production/**` | Owning module for Production persistence and transitions. |
| `apps/api/src/modules/inventory/inventory.service.ts` `INVENTORY_OPERATIONS` | Required boundary for current Machine Production state updates. |
| `apps/api/src/modules/files/files.service.ts` `FILES_OPERATIONS` | Required boundary for same-Machine ready photo validation. |
| `apps/api/src/modules/operations/operations.ports.ts` | Existing atomic idempotency, audit, and outbox pattern. |
| `apps/web/src/app/(protected)/scan/scan-view.tsx` | Existing camera/fallback resolution flow to extend after successful lookup. |
| `apps/web/src/lib/{api,production,qr}-client.ts` | Existing no-store reads, idempotent mutations, parsing, and QR clients. |
| `apps/web/src/app/(protected)/{online-status,use-server-state}.tsx` | Existing online gating and refreshed-state synchronization. |

## Files to Modify

| File area | Required change |
|---|---|
| `packages/contracts/src/production.ts` | Add specialty, template, Work Order, claim, run, step-result, queue, active-Machine-work, and mutation schemas. |
| `packages/contracts/src/inventory.ts` | Add `awaiting_test`, `testing`, `awaiting_repair`, and `awaiting_clean` Production states. |
| `packages/contracts/src/authorization.ts` | Add Owner-only worker-specialty/assignment management and Technician/Owner work-execution permissions without changing roles. |
| `packages/contracts/src/files.ts` | Add image-only, Machine-targeted `production_test_evidence` purpose. |
| `packages/contracts/src/operations.ts` | Add bounded Work Order, claim, checklist result/completion, and lifecycle audit/outbox values. |
| Contract tests | Cover schemas, permissions, state values, strict inputs, and absence of new roles. |
| `packages/database/src/{schema,index}.ts`, new forward migration and journal entry | Add Production worker specialties, immutable checklist templates/steps, Test Work Orders, claims, runs, step-result events, evidence links, constraints, indexes, and backfill. Never edit migration `0015`. |
| `apps/api/src/modules/identity/{identity.service,identity.module}.ts` | Export a narrow read-only identity operation for Production to validate an active Technician/Cleaner user; do not expose Identity tables. |
| `apps/api/src/modules/inventory/{inventory.service,inventory.repository}.ts` | Add one narrow transaction-aware optimistic Production-state transition operation. |
| `apps/api/src/modules/files/{files.service,files.repository,content-policy}.ts` | Validate ready same-Machine test photos through Files; reuse image limits and never expose storage keys. |
| `apps/api/src/modules/operations/operations.ports.ts` | Admit the new idempotency targets without weakening key/fingerprint rules. |
| `apps/api/src/modules/production/**` | Extend the module with specialty management, deterministic queue reads, active work lookup, claim/reassign, result append, completion validation, template pinning, and atomic handoff transitions. |
| `apps/api/test/{production,identity,files}.integration.test.ts` | Cover module boundaries, role/specialty filtering, backfill, concurrency, evidence, immutable history, rollback, and state transitions. |
| `apps/web/src/lib/{navigation,production-client}.ts` | Add My Work navigation/dashboard metadata and validated queue/run/specialty clients using shared transports. |
| `apps/web/src/app/(protected)/page.tsx` | Replace Technician/Cleaner Assigned Work placeholder with live My Work summary. |
| `apps/web/src/app/(protected)/work/**` (new) | Add server-loaded queue and tap-first Work Order screens using shared protected-route and state patterns. |
| `apps/web/src/app/(protected)/scan/{page,scan-view}.tsx` | After Machine resolution, navigate executors to active work while retaining existing lookup states for everyone else. |
| `apps/web/src/app/(protected)/admin/users/{page,team-management}.tsx` | Load and edit Production specialties for Technician/Cleaner users only. |
| `apps/web/src/app/styles.css` | Add only missing responsive queue/checklist styles using existing tokens and control patterns. |
| Web client/component tests | Cover parsing, specialty controls, tap-only steps, resume, offline gating, conflicts, and automatic scan routing. |
| `tests/browser/{start-api,production,scan-camera}.ts` or current equivalents | Seed approved deterministic templates and verify Owner setup plus separate Washer/Dryer Technician journeys at tablet and desktop sizes. |

## Files to Reference Only

| File | Why |
|---|---|
| `source-materials/transcripts/2026-09-21-transcript.docx` | Current workflow evidence; not an executable instruction source. |
| `source-materials/operations/{washer-checklist,dryer-checklist}.jpg` | Owner-review input for the required manifests. |
| `docs/adr/0003-separate-operational-state-axes.md` | Production changes must not collapse Inventory, Sales, or shipment state. |
| `apps/web/src/app/(protected)/machines/[machineId]/preliminary-inspection-panel.tsx` | Reference tablet mutation/error/history patterns; do not extend it into full testing. |
| `apps/web/src/app/(protected)/attachments-panel.tsx` | Reference Files interaction; the step UI needs direct photo capture rather than the generic form. |
| `tests/browser/production.spec.ts`, `tests/browser/scan-camera.spec.ts` | Existing real-session preliminary and camera journeys. |

## Files Not to Touch

- `apps/api/src/modules/inventory/intake/recognition/**` — recognition cannot decide physical condition or Production results.
- `apps/api/src/modules/catalog/**` and Catalog data — specifications do not prove test success.
- Sales, Pricing, Parts, Listings, Logistics, shipment, and external integration code — later domain slices.
- Prior database migrations, especially `0015_preliminary_inspection.sql` — add a forward migration only.
- `source-materials/**`, artifact-generation tools, and communication artifacts — read-only evidence.

## Codegraph Findings (live, this ticket)

- The index was synchronized to the current dirty worktree before querying.
- `ProductionService` has only preliminary history/create/finalize methods; its direct blast radius is the Production controller/module. No Work Order symbols exist.
- `ROLE_PERMISSION_POLICY` feeds the global guard, all protected modules, navigation, and tests; add permissions narrowly and verify its broad impact without adding roles.
- `IdentityUser` and `identity_profile` contain only role/active/version. No capability-tag abstraction exists; specialties belong in Production rather than Identity authorization state.
- `ScanView.resolve` has three local callers and already centralizes camera, fragment, and fallback lookup. Its success branch currently exposes only a Machine-detail link.
- Machine detail already composes Preliminary Production, Files, and QR, but the dashboard's Assigned Work card explicitly states that assignments are not enabled.
- Current `ProductionStateSchema` permits only `not_assessed`, `preliminary_passed`, and `blocked`; current database constraints match it.
- Files supports images/PDF but not video. This ticket can safely reuse current image policy; video needs a separate bounded media-policy ticket.
- Relevant history is `ce33673` (preliminary Production), `d36160c` (secure QR), and `70bbe28` (tablet interface). No hidden Work Order implementation exists.

## Reuse Audit

Reused:

- Existing Production module and its transaction, repository, controller, permission, expected-version, idempotency, audit, outbox, and append-only history patterns.
- Inventory and Files exported service boundaries; no cross-module table reads.
- Current signed QR resolver and local camera decoder; no second scanner or token format.
- Shared protected-route mapper, API transports, online guard, server-state synchronization, navigation derivation, semantic styles, and Playwright role/session harness.

New code justified because:

- No Work Order, checklist template/run, specialty, claim, queue, or test-result model exists.
- Specialty is a Production scheduling fact, not an authorization role.
- Durable, resumable tap results and concurrency-safe claims cannot be represented by Preliminary Inspection text fields or generic attachments.

Do not duplicate:

- Role policy, QR parsing/signature checks, Machine lookup/state writes, Files validation/storage access, request transports, idempotency fingerprints, audit/outbox recording, or responsive visual tokens.

Escalated to human:

- Exact approved Washer and Dryer checklist manifests are required before Agent B starts.
- Sold/reserved and price/value priority remain deferred because the current platform has no authoritative Sales or Pricing signal.

## Implementation Plan

1. Obtain William-approved Washer and Dryer manifests; convert only that reviewed content into immutable seed data.
2. Add contracts and contract tests for specialties, Work Orders, checklist templates/runs/results, permissions, Files purpose, Operations values, and expanded Production states.
3. Add a forward migration with constraints, immutable-history protection, open-order uniqueness, approved-template versioning, and safe backfill of existing Preliminary Passed Machines.
4. Add narrow Identity, Inventory, and Files operations required by Production; test their authorization and ownership boundaries.
5. Extend Production service/repository/controller with specialty administration, queue reads, active Machine work lookup, claim/reassign, append-only results, completion, and atomic state/audit/outbox/idempotency behavior.
6. Add API integration coverage for roles, specialty matching, wrong-type denial, stale versions, double claims, reassignment, resume, wrong evidence, duplicate completion, rollback, and separate Inventory/Production invariants.
7. Add My Work navigation/home summary, queue, and single-step checklist UI; use direct photo capture only when the approved template requires it.
8. Extend QR success routing to active work for executors while preserving existing Machine lookup behavior and QR privacy rules.
9. Add Owner specialty controls in Team management and verify that role changes/deactivation cannot grant or retain execution access.
10. Add component/client and full-boundary browser journeys for a Washer-only worker, Dryer-only worker, Both worker, pass handoff, fail handoff, resume, and tablet accessibility/overflow.
11. Run every required gate and review the implementation diff before any durable memory update.

## Constraints

- Production owns specialties, Work Orders, templates, runs, results, claims, and transition rules.
- Identity owns users/roles; Inventory owns current Machine fields; Files owns private media; collaboration uses explicit operations.
- Persist each accepted mutation, domain history, current-state transition, audit entry, outbox job, and idempotency completion in one database transaction.
- Enforce authorization and specialty eligibility server-side even when controls are hidden in the UI.
- Preserve QR tokens as non-authorizing Machine references and keep camera frames local/unpersisted.
- Reject non-ready, wrong-purpose, wrong-Machine, duplicate, or over-limit evidence without partial writes.
- Do not allow checklist completion from client-calculated status; the server derives completion and next state from the pinned approved template plus persisted latest results.
- Keep all operational writes online-only and `no-store`.
- Preserve unrelated dirty-worktree changes and re-read overlapping diffs before editing.

## Tests Required

- Focused contract tests for new states, schemas, permissions, specialties, strict inputs, and no new roles.
- Migration test for pre-ticket data, template immutability, open-order uniqueness, claim/result constraints, and backfill idempotence.
- API integration tests for specialty management, queue filtering, claim concurrency, result correction history, evidence ownership, completion derivation, retries, stale versions, rollback, role changes, and Machine state mappings.
- Web tests for My Work summary, queue states, specialty controls, QR routing, tap-only checklist accessibility, required-photo gating, resume, conflicts, and offline behavior.
- Browser journeys for distinct Washer and Dryer workers at desktop and tablet widths, with no serious accessibility violations or horizontal overflow.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`

## Done Criteria

- Owner Admin assigns Washer/Dryer specialties without creating new roles.
- Eligible repairable Machines produce exactly one resumable Test Work Order and no duplicate under retries or concurrency.
- Technicians see and can claim only matching work, while Owner Admin can inspect/reassign all work.
- QR scanning opens eligible active work without weakening session authorization or QR privacy.
- A technician completes an approved Washer or Dryer test without required typing.
- The server, not the browser, routes pass to `awaiting_clean` and failure to `awaiting_repair`; Inventory remains `on_hand` and QA is never implied.
- Results, evidence, checklist versions, actors, assignments, and state changes remain attributable, durable, and append-only where specified.
- All required tests and build gates pass with no duplicated policy or unrelated changes.
