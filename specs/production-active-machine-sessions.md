# production-active-machine-sessions — Dedicated testing work, active Machine groups, and attributable time

## Goal

Give each dedicated Washer or Dryer technician one low-friction workspace for several Machines at once. A technician can select or scan Machines into one active group session, see which are being worked, running, or waiting, switch between their individual immutable Test records, and retain an attributable server-timed labor history without typing. Remove the duplicated bearing checklist step while preserving Initial Check as the early economic gate. Keep Cleaner and Owner experiences focused: Cleaner receives no testing work, and Owner manages exceptions and assignments without an Initial Checks queue.

## Ticket Summary

- Keep the canonical application role `technician_cleaner`; Washer Technician, Dryer Technician, and Cleaner are Production assignments, not new authentication roles.
- Replace the two independent specialty checkboxes with one clear assignment: **Washer Technician**, **Dryer Technician**, or **Cleaner / no testing**. Persist Washer/Dryer through the existing Production specialty table and represent Cleaner as no testing specialty.
- A testing worker has exactly one active Washer or Dryer specialty for the pilot. Existing data with both specialties remains readable, but Owner must choose one before that user starts new work.
- Cleaner/no-specialty users receive no Initial Checks, Test Work Orders, QR work destinations, session controls, or Test mutations.
- Owner Admin's `/work` view omits Initial Checks. Owner retains Initial Check access from eligible Machine details, Owner Review, all Test-order inspection, and reassignment controls.
- Publish immutable Washer v2 and Dryer v2 Test templates that preserve the approved photo-derived order and wording except for removal of the duplicated first bearing step. New runs use v2; pinned and completed v1 runs remain unchanged.
- Test detail shows the latest passing Initial Bearing Check as a read-only summary with actor and timestamp.
- Provide **Report new bearing concern** as an explicit, no-typing exception. It records attributable immutable history, stops the active Test, moves the Machine to `awaiting_repair`, and removes it from the active session. It must not rewrite the Preliminary Inspection or imply Owner-approved scrap.
- `/work` separates **Active Session**, **My Active Machines**, and **Available Tests**. Initial Checks remain visible only to matching Washer/Dryer technicians.
- A technician may own several Test Work Orders. Each Machine keeps its own Work Order, pinned checklist, results, video, evidence, and lifecycle state.
- A technician may have at most one open group session (`active` or `paused`). A session may contain 1–20 Test Work Orders and can receive more matching Machines later.
- Creating or adding to a session atomically claims/starts all selected eligible orders. A conflict on any requested order causes no partial group mutation.
- Session item states are **Working**, **Running cycle**, **Waiting**, **Completed**, or **Removed**. State changes are large tap controls and require no notes.
- The group timer starts automatically, supports Pause, Resume, and Finish Session, survives refresh/sign-out, and is derived from server timestamps rather than a browser-owned duration.
- Session labor time is allocated over each elapsed interval equally across current Working/Running items. Waiting, Completed, and Removed items receive no allocation. Preserve unallocated session time when no item is eligible; never silently assign it.
- Finishing a Test marks its session item Completed. If no unfinished item remains, the session completes automatically. Explicit Finish Session closes timing and detaches unfinished orders while leaving their claims and checklist progress resumable under My Active Machines.
- QR scan of a Machine in the signed-in technician's open session returns to that session and highlights the Machine. A matching unclaimed/claimed order can be added to the current session; a Machine claimed by another worker remains unavailable.
- All accepted session, item, timer, claim, checklist, bearing-exception, and lifecycle mutations are idempotent, audited, and recorded with outbox events in the same transaction.

## Expected Output

- Team Management offers one Production assignment selector per active Technician/Cleaner account: Washer Technician, Dryer Technician, or Cleaner / no testing.
- Owner `/work` shows Production orders and oversight but no Initial Checks section. Owner can still open an eligible Initial Check through Machine detail and resolve Owner Review.
- Technician `/work` clearly separates an active timed group, already claimed Machines, and available matching Tests; Cleaner sees no testing workspace content.
- Technicians can select several Tests, start one group, add a Machine by QR, change each Machine's work state, pause/resume/finish the group, and resume every Machine's individual checklist.
- Active and completed session views show total elapsed time, unallocated time, and per-Machine allocated time with server `asOf` timestamps.
- New Test runs use bearing-free v2 templates and display the prior Initial Check summary. Old v1 runs still show their pinned original checklist.
- A newly noticed bearing concern exits the Test/session safely to Awaiting Repair with attributable history.

## Non-Goals

- Do not create new application roles or duplicate the global permission policy for Washer/Dryer/Cleaner labels.
- Do not combine Machines into one Test Work Order or one checklist/video record.
- Do not implement Repair execution, Cleaning execution, Parts, Retest, QA Release, shift scheduling, payroll, automatic claim expiry, model-specific checklists, test-bay capacity limits, notifications, or background countdown alerts.
- Do not infer labor cost, productivity, or payroll from session time.
- Do not edit or delete historical v1 templates, runs, results, Preliminary Inspections, or completed sessions.
- Do not make Owner's work queue the path for routine Initial Checks.
- Do not add offline mutations or cache protected work/session responses.

## Relevant Existing Code

| File/Symbol                                                                 | Why it matters                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ARCHITECTURE.md` Reuse Map, Production sections, invariants                | Production ownership, module boundaries, separate lifecycle axes, and attributable time requirement.                         |
| `packages/contracts/src/production.ts`                                      | Canonical Production Work, specialty, queue, checklist, and mutation contracts.                                              |
| `packages/contracts/src/authorization.ts`                                   | Canonical application roles and permissions; must not gain Washer/Dryer role duplication.                                    |
| `packages/database/src/schema.ts` Production tables                         | Existing specialties, immutable templates/runs/results, claims, and one-open-order-per-Machine invariant.                    |
| `apps/api/src/modules/production/test-work.repository.ts`                   | Current claim/start/result/finish transactions, specialty filtering, QR destination, audit/outbox, and idempotency patterns. |
| `apps/api/src/modules/production/production.repository.ts`                  | Immutable Preliminary Inspection source for the bearing summary; do not duplicate its rules.                                 |
| `apps/web/src/app/(protected)/work/**`                                      | Current queue, Initial Check, and individual Test runner to deepen.                                                          |
| `apps/web/src/app/(protected)/admin/users/team-management.tsx`              | Existing specialty administration to simplify into one assignment.                                                           |
| `apps/web/src/app/(protected)/scan/scan-view.tsx`                           | Existing server-resolved QR navigation and error states.                                                                     |
| `apps/web/src/app/(protected)/use-server-state.tsx` and `online-status.tsx` | Required synchronization and online-only mutation patterns.                                                                  |

## Files to Modify

| File area                                                                           | Required change                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/contracts/src/{production,operations}.ts` and tests                       | Add session/item/event/summary schemas, bounded batch commands, bearing summary/exception, queue partitions, work destination, actions/targets; restrict new assignment input to zero or one specialty.                                                |
| `packages/database/src/{schema,index}.ts`, migration journal, new forward migration | Add session/item/event persistence and constraints; add active-session link/indexes; publish v2 templates without bearing; extend audit/outbox/idempotency checks.                                                                                     |
| `apps/api/src/modules/production/test-work.{controller,service,repository}.ts`      | Add group-session reads/mutations, atomic multi-order claim/start reuse, event-derived timing summary, queue partitioning, QR session destination, Cleaner denial, Owner queue hiding, bearing summary/exception, and completion/session coordination. |
| `apps/api/src/modules/production/production.repository.ts`                          | Expose the latest valid Initial Check summary through a narrow same-module read; do not duplicate disposition mapping.                                                                                                                                 |
| `apps/web/src/lib/production-client.ts`                                             | Parse/read/mutate new contracts through existing transports and idempotency handling.                                                                                                                                                                  |
| `apps/web/src/app/(protected)/work/page.tsx` and new `work/session/**`              | Render queue partitions, group selection, server-timed session, per-Machine status controls, QR-highlighted session item, and clear empty states.                                                                                                      |
| `apps/web/src/app/(protected)/work/[orderId]/**`                                    | Show bearing summary, start/add through the session flow, retain individual checklist/video, and expose the new bearing-concern exception.                                                                                                             |
| `apps/web/src/app/(protected)/admin/users/team-management.tsx`                      | Replace independent checkboxes with one Production assignment selector and accurate labels.                                                                                                                                                            |
| `apps/web/src/app/(protected)/scan/scan-view.tsx`                                   | Navigate a session member to the active group and allow an eligible Test to join the current group without weakening QR authorization.                                                                                                                 |
| `apps/web/src/app/(protected)/page.tsx`, `apps/web/src/lib/navigation.ts`           | Present accurate active/available counts; do not show Cleaner a testing count or Owner an Initial Checks count.                                                                                                                                        |
| `apps/web/src/app/styles.css`                                                       | Add only reusable responsive session/timer/status styles using existing visual tokens.                                                                                                                                                                 |
| API, database, web, and browser tests below                                         | Prove authorization, concurrency, timing, history, template pinning, and full user journeys.                                                                                                                                                           |

## Files to Reference Only

| File                                                         | Why                                                                                                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/production-test-queue.md`                             | Existing individual Work Order, claim, template, and lifecycle contract; this ticket supersedes its timer/multi-bay non-goal and two-specialty UI. |
| `specs/technician-triage-and-machine-video.md`               | Existing Initial Check/video contract and recorded bearing follow-up.                                                                              |
| `docs/warehouse-workflow-observation.md`                     | Transcript-backed multi-Machine and future multi-bay workflow evidence.                                                                            |
| `docs/adr/0002-modular-monolith-and-evented-integrations.md` | Keep all session behavior inside Production and use exported module interfaces.                                                                    |
| `docs/adr/0003-separate-operational-state-axes.md`           | A session must not collapse Machine Inventory, Production, Sales, or shipment state.                                                               |

## Files Not to Touch

- `source-materials/**` — read-only evidence.
- Prior migrations through `0017_machine_test_video.sql` — forward migration only.
- Catalog, Intake recognition, Imports, Sales, Listings, Logistics, Parts, and external integrations — outside this Production slice.
- QR token/signing format and Files media policy — reuse existing Machine identity and private video behavior.

## Codegraph Findings (live, this ticket)

- The index was synchronized before this spec. `TestWorkRepository` is the single current persistence seam for queue, claim, start, result, finish, assignment, and work destination.
- `production_test_work_order` permits several orders assigned to one user and enforces only one open order per Machine; no worker/session/timer constraint exists.
- `start` already combines idempotency reservation, specialty validation, optimistic Machine transition, template pinning, claim history, audit/outbox, and order mutation. Batch start must extract and reuse its transaction-local decision rather than loop through public methods.
- `queue` currently mixes assigned and available orders, returns Initial Checks to Owner, and treats any `technician_cleaner` with matching specialties as eligible.
- `getTestQueue` feeds both Home and `/work`; contract changes require both callers and their tests.
- QR work destination is server-owned and already prefers active Test work. It is the correct seam for a session destination; React must not recreate claim/specialty rules.
- Team Management currently permits both specialties through independent checkboxes. The table already represents the desired single Washer or Dryer assignment without an Identity-role migration.
- No session/timer model or reusable timer reducer exists. New event summarization is justified and should remain Production-owned.

## Reuse Audit

Reused:

- Existing Production specialty table, Work Orders, claims, pinned templates, runs/results, video linking, optimistic versions, idempotency coordinator, audit/outbox recorder, Inventory transition interface, QR resolver, protected transports, online gating, and server-state synchronization.
- Existing immutable Preliminary history for bearing provenance and existing Files boundary for Test evidence/video.

New code justified because:

- There is no durable group session, item work state, timer event history, interval allocation, queue partition, or server response for active multi-Machine work.
- A dedicated bearing-concern exception is needed after removing the duplicated checklist step; silently editing Preliminary history or inventing a hidden checklist step would corrupt meaning.

Do not duplicate:

- Role permissions, specialty eligibility, order claim/start logic, Machine lifecycle SQL, QR authorization, checklist completion, video validation, idempotency fingerprints, audit/outbox recording, or client transports.

Escalated to human:

- None. The transcript supports group checkout and time distribution; the user explicitly requested active groups and timers. Test-bay capacity and payroll use remain intentionally out of scope.

## Implementation Plan

1. Add strict contracts and pure deterministic event-to-time summary tests, including equal allocation and unallocated intervals.
2. Add a forward migration for sessions/items/events, order session linkage, constraints/indexes, Operations values, and immutable Washer/Dryer v2 templates without bearing.
3. Refactor current transaction-local order start/claim behavior for reuse by individual and atomic group starts without changing existing history semantics.
4. Implement session create/add/pause/resume/item-state/finish reads and commands with optimistic versions, idempotency, audit/outbox, and automatic item/session completion.
5. Tighten Production assignment/authorization: one Washer or Dryer assignment, no testing for Cleaner/no specialty, Owner Initial Checks hidden from queue but retained through Machine detail.
6. Add the Initial Check summary and new-bearing-concern command, routing safely to Awaiting Repair and coordinating active session state.
7. Partition `/work`, add the responsive session/timer UI, and make Test start/resume and QR navigation session-aware.
8. Update Home and Team Management labels/counts and add regression/full-boundary coverage.
9. Run all repository gates, inspect the complete diff, and re-index only after review approval.

## Constraints

- One current Work Order, checklist, Test video, and lifecycle history remains authoritative per Machine.
- A worker has at most one open session; an order belongs to at most one open session; all database constraints and service checks must agree.
- Group claim/start is all-or-nothing and never partially starts Machines after a conflict.
- Server timestamps and append-only events are authoritative. The browser may animate a display clock but never submits elapsed duration.
- Event ordering must be deterministic (`createdAt`, stable ID); duration cannot become negative. Completed history is immutable.
- Time allocation conserves eligible session time apart from explicitly reported unallocated intervals; use integer milliseconds internally and expose bounded whole seconds.
- Session mutations require the current worker and current specialty; Owner inspection/reassignment does not silently impersonate a worker session.
- Changing a worker to Cleaner/no testing cannot grant new execution. Existing claimed work remains visible to Owner for reassignment and inaccessible to that worker.
- Preserve unrelated dirty-worktree changes and the current application/data unless a listed migration or mutation requires otherwise.
- Never log credentials, tokens, video/image bytes, filenames, or complete operational payloads.

## Tests Required

- Focused contract tests for single assignment, sessions/items/events, bounded batch commands, queue partitions, QR destinations, bearing summary/exception, and Operations values.
- Pure timing tests with fixed timestamps: active, pause/resume, add/remove, state changes, equal allocation, waiting exclusion, unallocated time, completion, ordering, and rounding conservation.
- Migration tests: old data preserved, v1 immutable, v2 lacks bearing and applies only to new runs, one open session per worker/order, valid state/event constraints.
- API integration: Owner queue hides Initial Checks; Owner Machine-detail Initial Check remains; Washer/Dryer isolation; Cleaner denial; multi-claim atomicity; session concurrency/stale versions/retries; pause/resume/finish; QR resume/add; Test completion; bearing concern; assignment removal.
- Web tests: queue sections, group selection, live timer derived from server time, status controls, refresh/resume, Cleaner/Owner empty states, assignment selector, v1/v2 checklist display, bearing summary/exception, offline/busy/conflict accessibility.
- Browser journeys at desktop/tablet sizes: Washer worker creates a two-Machine session, changes one to Running and one to Waiting, refreshes, resumes by QR, completes one Test with video, finishes the session, and sees retained per-Machine time; Dryer isolation and Cleaner denial are also verified.
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`

## Done Criteria

- Owner, Cleaner, Washer Technician, and Dryer Technician each see only the intended work surfaces and server authorization matches the UI.
- A technician can group, time, switch, pause/resume, QR-resume, and finish multiple Machines without typing or losing individual Test history.
- Timer and per-Machine allocations survive refresh and are explainable from immutable server events.
- New runs omit the redundant bearing step, old runs remain pinned, and a new concern has a safe attributable path.
- All mutations remain atomic, idempotent, audited, outboxed, online-only, and compatible with separate Machine lifecycle axes.
- All required checks pass with no duplicated authorization, claim, timing, lifecycle, QR, Files, or transport logic.
