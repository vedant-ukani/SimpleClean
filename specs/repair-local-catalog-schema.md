# repair-local-catalog-schema — Apply the pending Catalog migration locally

## Goal

Make the existing Catalog workspace available in the current local application without losing Inventory or Intake data. Confirm the migration state accurately, back up PGlite, apply the already-authored `0013_catalog` migration through the normal runner, import the reviewed Catalog snapshot, and verify the authenticated API and page.

## Ticket Summary

- Reproduce the unavailable Catalog page and failing Catalog API.
- Interpret Drizzle migration records using their timestamps/journal tags rather than assuming the one-based database row ID equals the zero-based migration index.
- Preserve the current local PGlite database before migration.
- Apply pending migrations only through `npm run db:migrate`.
- Import the reviewed snapshot through the existing idempotent `npm run catalog:import` command.
- Verify existing Machine records are preserved.
- Restart the application on port 3000 and verify the authenticated Catalog API and screen.
- Add no corrective migration or application code when the existing migration is merely pending.

## Expected Output

- `.local-data/pglite` is backed up before mutation.
- The existing migration journal advances from `0012_machine_capacity` to `0013_catalog`.
- All Catalog and actual-spec relations exist.
- The reviewed snapshot contains its approved Catalog revisions.
- Existing Machine count remains unchanged.
- Authenticated `/catalog/models` and `/catalog` both return 200, and the Catalog page renders its heading.
- The app remains running at `http://localhost:3000`.

## Non-Goals

- Do not reset or rebuild the local database.
- Do not create a new migration unless evidence proves the existing migration is recorded as applied while its objects are missing.
- Do not change Catalog UI, permissions, contracts, data, or domain behavior.
- Do not edit the migration journal manually.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `packages/database/drizzle/0013_catalog.sql` | Existing pending migration that creates Catalog and actual-spec relations. |
| `packages/database/drizzle/meta/_journal.json` | Maps migration timestamps to tags; canonical reference for identifying the latest applied migration. |
| `packages/database/src/database.ts` / `migrateDatabase` | Canonical PGlite/PostgreSQL migration boundary. |
| `apps/api/src/catalog-import.ts` | Existing reviewed-snapshot import entrypoint. |
| `apps/api/src/modules/catalog/catalog.repository.ts` | Existing dataset/checksum idempotency. |
| `apps/web/src/app/(protected)/catalog/**` | Existing Catalog list/detail screens. |

## Files to Modify

None expected. This is an operational local-environment repair using existing migrations and import commands.

## Files to Reference Only

| File | Why |
|---|---|
| `packages/database/drizzle/0013_catalog.sql` | Confirm the pending objects and shared constraint updates. |
| `apps/api/catalog-data/official-models.2026-09-23.json` | Existing approved snapshot. |
| `specs/AUT-352.md` | Catalog ownership, import, provenance, and idempotency requirements. |
| `specs/catalog-tab.md` | Existing UI/API acceptance expectations. |

## Files Not to Touch

- All application source, migrations, and tests unless the observed state disproves the pending-migration diagnosis.
- Inventory/Intake records.
- The reviewed Catalog snapshot.

## Codegraph Findings (live, this ticket)

- `packages/database/src/database.ts` is the single migration runner.
- `packages/database/src/migrate.ts` is invoked by root `npm run db:migrate`.
- `apps/api/src/catalog-import.ts` is invoked by root `npm run catalog:import`.
- Catalog routes, permissions, API module, and UI already exist and pass isolated tests.

## Reuse Audit

Reused:

- Existing migration 13, migration runner, reviewed snapshot importer, Catalog API/UI, authorization, and protected route-state handling.

New code justified because:

- None. The latest applied migration was `0012_machine_capacity`; migration 13 was pending.

Do not duplicate:

- Schema definitions, import logic, snapshot data, or migration management.

Escalated to human:

- None. The user authorized the local repair and the safe path preserves data.

## Implementation Plan

1. Stop the development processes so PGlite has a single writer.
2. Record pre-repair Machine count and migration timestamp/tag.
3. Copy `.local-data/pglite` to a distinct backup directory and verify the copy.
4. Run `npm run db:migrate`; confirm `0013_catalog` becomes the latest applied migration.
5. Run `npm run catalog:import`; accept either successful import or the identical-dataset idempotent result.
6. Verify Machine count, relation count, dataset count, and approved revision count.
7. Restart the app and verify authenticated Catalog API and SSR page behavior.

## Constraints

- Preserve all local data and unrelated dirty-worktree changes.
- Use normal migration/import commands; do not mutate the real migration journal directly.
- Do not expose credentials or Catalog payloads in logs.
- Stop on backup, migration, or import failure.

## Tests Required

- Existing database integration tests.
- Existing Catalog integration tests.
- `npm run lint`
- `npm run typecheck`
- Authenticated Catalog API and SSR verification.

## Done Criteria

- Backup exists and is recoverable.
- Machine count is unchanged.
- Latest migration is `0013_catalog`.
- Catalog snapshot has approved revisions.
- Catalog API and page return 200.
- App is running on port 3000.
- No unnecessary permanent code change remains.
