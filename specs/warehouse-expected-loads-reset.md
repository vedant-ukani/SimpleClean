# warehouse-expected-loads-reset — Date-grouped Expected Loads and recoverable local data cleanup

## Goal

Make Warehouse Expected Loads immediately understandable by grouping every unreceived Load by its expected-arrival date, while preserving the existing rule that receipt—not the date—removes a Load from Warehouse view. Then fulfill the explicit local-data request by removing all current Load-rooted operational records only after a recoverable local backup and verified dependency-aware cleanup.

## Ticket Summary

- Warehouse continues to see every Acquisition Load whose `receivedAt` is null. Missing expected-arrival date does not hide a Load.
- Group Warehouse cards into **Overdue**, **Today**, **Upcoming**, and **No arrival date**, in that order.
- Sort Overdue oldest first, Today by display name, Upcoming soonest first, and No Date by creation order already returned by the server.
- Show each card's expected date and an explicit status. Do not show Source or Source Reference in the Warehouse list; Owner Load detail retains commercial provenance.
- Owner's all-Loads workspace remains a single operational list and keeps Load creation/editing.
- Use UTC calendar dates consistently with the existing date-only input/storage convention so browser timezone cannot move a Load between groups.
- A Load remains visible after its expected date passes; it moves to Overdue. It disappears only when `receivedAt` is set, currently by completing the final open Intake batch.
- Before destructive local cleanup, stop the local app, verify the target is the configured local PGlite and local file directory under this workspace, and record table-level counts without printing business data.
- Create a timestamped backup of `.local-data/pglite` and `.local-data/files` under `.local-data/backups/` while the database is closed.
- Remove all current records rooted at `inventory_load` using a single dependency-aware local transaction (or `TRUNCATE inventory_load CASCADE` if verified by a dry-run/catalog inspection), including dependent Machines, Intake, imports, QR labels, Machine/Load files, Catalog Machine resolutions/usages, and Production work/history. Preserve Identity users/sessions, Catalog model/revision data, configuration, and source materials.
- Clear corresponding local attachment bytes only after the database cleanup commits; retain the backup for recovery.
- Restart migrations/API/web at port 3100, verify zero Loads and zero Load-rooted Machines through authenticated reads, and verify sign-in plus Catalog remain functional.
- Do not add a production-facing Delete All button or remotely callable destructive endpoint.

## Expected Output

- Warehouse `/loads` displays separate Overdue, Today, Upcoming, and No arrival date sections with individual Load cards and dates.
- Received Loads remain absent from Warehouse and available to Owner as before.
- The current local environment starts with no Acquisition Loads or Load-rooted Machines after cleanup.
- A timestamped local backup exists and the exact recovery path is reported to the user.
- Identity accounts and approved Catalog records remain available after cleanup.

## Non-Goals

- Do not delete or edit `source-materials/**`, Catalog model/revision/source data, Identity accounts, credentials, or environment configuration.
- Do not change how receipt is recorded, add manual Warehouse receipt, infer receipt from expected date, or hide undated Loads.
- Do not expose bulk deletion in the application UI/API.
- Do not make date grouping a new Inventory domain state.
- Do not delete unrelated remote/staging/production databases or storage.

## Relevant Existing Code

| File/Symbol                                              | Why it matters                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(protected)/loads/loads-view.tsx`      | Current `receivedAt === null` Warehouse filter and one-block list.                                   |
| `apps/web/src/app/(protected)/loads/load-dates.ts`       | Existing UTC date-only conversion/display decisions to reuse.                                        |
| `apps/web/src/app/(protected)/loads/page.tsx`            | Sets `expectedOnly` for Warehouse while Owner sees all Loads.                                        |
| `apps/api/src/modules/inventory/inventory.repository.ts` | Canonical Load reads and receipt behavior; grouping remains presentation-only.                       |
| `packages/database/src/schema.ts`                        | Authoritative dependency graph rooted at `inventory_load`; foreign keys are restrictive.             |
| `packages/database/src/database.ts`                      | Canonical configured PGlite/PostgreSQL connection; cleanup must not create a parallel client policy. |
| `specs/complete-load-after-intake.md`                    | Existing authoritative rule for final Intake completion setting `receivedAt`.                        |

## Files to Modify

| File                                                    | Required change                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(protected)/loads/load-dates.ts`      | Add a pure UTC Expected Load grouping/sorting helper with explicit group keys/labels.                                                                   |
| `apps/web/src/app/(protected)/loads/loads-view.tsx`     | Render Warehouse Expected Loads as dated sections/cards, remove Warehouse source/reference display, retain Owner list/create behavior.                  |
| `apps/web/test/load-ui.test.tsx`                        | Cover group membership/order, UTC boundaries, received exclusion, No Date visibility, and Owner regression.                                             |
| `tests/browser/intake.spec.ts`                          | Verify grouped Warehouse presentation and existing disappearance after final Intake completion.                                                         |
| Local maintenance script/package command only if needed | Provide a local-only guarded count/cleanup operation; it must refuse non-PGlite, non-workspace, production, missing confirmation, or open-database use. |

## Files to Reference Only

| File                                                               | Why                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `packages/contracts/src/inventory.ts`                              | Existing Load fields are sufficient; do not add presentation groups to the API contract. |
| `apps/web/src/app/(protected)/loads/[loadId]/load-detail-view.tsx` | Owner expected/received field behavior remains canonical.                                |
| `PRODUCT.md` and `DECISIONS.md`                                    | Receipt and Warehouse visibility decisions remain unchanged.                             |

## Files Not to Touch

- `source-materials/**` — immutable migration/source evidence.
- Prior database migrations — cleanup is local operational data work, not a migration that deletes deployed data.
- Catalog source/snapshot files and Catalog domain tables — preserve reusable model truth.
- Authentication secrets and credential values — preserve users and never print secrets.

## Codegraph Findings (live, this ticket)

- `LoadsView` alone currently applies `receivedAt === null` for Warehouse and renders all visible rows under one section.
- `load-dates.ts` already standardizes date-only values at UTC midnight and UTC display; grouping should deepen that helper rather than add local date parsing in JSX.
- Load detail already exposes expected arrival and received values. Final Intake commit already sets receipt and the current Expected Loads filter reacts correctly.
- `inventory_load` is referenced with restrictive foreign keys by Machines, Intake batches, imports, and files; Production/QR/Catalog usage then depend on Machines. Deleting only Load rows cannot succeed or preserve referential integrity.
- The active local database directory is `.local-data/pglite`; the running development server holds it open. Cleanup requires a controlled stop and closed-database backup.

## Reuse Audit

Reused:

- Current `receivedAt` visibility rule, final Intake receipt transaction, UTC date helpers, responsive inventory surfaces, protected route state, configured database connection, and existing repository tests.

New code justified because:

- No Expected Load grouping/sorting helper or recoverable dependency-aware local cleanup path exists.

Do not duplicate:

- Receipt business logic, Load/Machine deletion endpoints, date parsing, database configuration, or source-material import behavior.

Escalated to human:

- None. The user explicitly requested removal of every current Load and later authorized completion of all planned scope. The operation remains local, backed up, and recoverable.

## Implementation Plan

1. Add and test the pure UTC group/sort helper.
2. Render Warehouse grouped sections while preserving Owner's current all-Loads/create experience and the received filter.
3. Extend browser coverage for dated/undated/received Load behavior.
4. Enumerate the live local dependency closure and counts, stop the app, verify local targets, and take closed-database/file backups.
5. Run the guarded Load-root cleanup transaction, clear now-orphaned local attachment bytes, migrate/restart, and verify zero Load-rooted records plus preserved Identity/Catalog.
6. Run all repository gates and record the backup/recovery path in the implementation report.

## Constraints

- Date grouping is presentation logic; `receivedAt` remains the only Warehouse Expected Loads inclusion rule.
- Use explicit UTC date strings and an injectable/reference `today` in pure tests; do not depend on the test runner's local timezone.
- Destructive cleanup must target only `/Users/vedant/Desktop/Simple Clean/.local-data/...` after canonical-path validation; no glob, `$HOME`, `~`, or unresolved variable may identify the target.
- The app/database must be closed before copying PGlite. Backup creation precedes cleanup, and cleanup stops on any failed verification.
- Report only counts and paths, never row contents, credentials, tokens, filenames, or file bytes.
- Preserve the backup; do not automatically delete it after verification.
- Preserve unrelated dirty-worktree changes.

## Tests Required

- Unit/component tests for UTC grouping/sorting and Owner/Warehouse rendering.
- Existing Inventory/Intake integration tests to prove receipt behavior is unchanged.
- Browser test for grouped Expected Loads and post-receipt disappearance.
- Post-cleanup authenticated smoke checks: zero Loads, zero Machines, sign-in works, Catalog count remains nonzero if it was nonzero before cleanup.
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`

## Done Criteria

- Warehouse sees every and only unreceived Load in the correct date group with clear individual cards.
- Owner Load management and automatic receipt behavior remain unchanged.
- The local database contains no current Loads or Load-rooted Machines, with Identity and Catalog preserved.
- A verified closed-database/file backup makes the cleanup recoverable.
- The app is running again on port 3100 and all required checks pass.
