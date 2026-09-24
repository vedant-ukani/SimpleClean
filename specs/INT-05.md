# INT-05 — Locationless intake and legacy Inventory migration

## Goal

Unblock the pilot by making Intake destination optional and load the supplied
legacy on-hand workbook through the existing safe import boundary. Imported
and newly received Machines must be visible in the normal Inventory screen.

## Expected output

- The active Intake screen no longer asks for or waits on a destination.
- Capture, recognition, confirmation, individual commit, and Finish Receiving
  work when `destinationLocationId` is null.
- Inventory creates a locationless Machine when no destination is provided.
- A non-null destination remains validated and applied for compatible API and
  historical Batch callers.
- `/machines` renders locationless Machines as **Location not assigned**.
- The existing workbook stages as immutable evidence and commits the 172
  on-hand rows through Imports and Inventory after explicit approval.
- The 55 sold/shipped rows remain preserved in the Import Run and never become
  current Inventory Machines.

## Non-goals

- No removal of Locations or relocation history.
- No recurring spreadsheet synchronization or generic import workspace.
- No inference of washer/dryer type for the historical workbook.
- No migration of price, testing, cleaning, repair, sale, payment, or shipment
  history.
- No automatic photo-recognition commit.

## Domain behavior

`currentLocationId` is optional at Machine creation. The Inventory-owned intake
creation port must always validate the source Load. When a location is present,
it must also validate that the Location is active and retain the existing
location-history behavior. When it is absent, it creates the Machine with null
current location and no initial relocation entry.

Both per-Candidate commit and the compatible batch commit pass the nullable
destination through to Inventory. Finish Receiving depends only on resolved
evidence and complete Candidate -> Machine mappings; it does not require a
destination.

The destination command and nullable contract remain for historical/API
compatibility. Once a Batch has a destination and a Machine mapping, the
existing destination-lock rule remains unchanged.

## Active web workflow

- Remove the destination fetch, selector, blocking copy, and destination-based
  disabled state from the active Intake review.
- Keep Machine type available immediately when the Batch is open.
- Keep Capture next nameplate available based on permission, connectivity, and
  request state only.
- Rename the closing panel to receiving/approval language that does not imply a
  required Location.
- Keep existing Inventory links for committed item cards.

## Workbook execution

Use the existing Owner-only Imports application boundary. Create or reuse a
clearly named migration Load, stage the exact unmodified workbook, inspect the
stored counts/findings, explicitly select every non-error on-hand row, and
commit the complete selection atomically. Never insert Machines directly.

Before staging, compare the source checksum with existing Import Runs. If an
existing run for the same checksum is already committed, reuse its result and
do not stage or commit a duplicate run.

Expected supplied-workbook result:

- 227 staged rows;
- 172 warning/on-hand rows eligible for explicit approval;
- 55 error/sold-shipped rows not eligible for approval;
- 10 rows in five duplicate-serial warning groups;
- 172 provisional, locationless, `other` Machines after commit.

## Files to modify

- Inventory intake repository/service interfaces and focused tests.
- Inventory repository intake creation validation and focused tests.
- Intake review UI and UI/browser tests.
- Durable architecture/context/decision records that currently say destination
  is required.
- Add a bounded one-time operational command only if needed to invoke the
  existing Imports service safely; it must not duplicate parser, approval,
  Inventory, transaction, or authorization decisions.

## Reuse constraints

- Reuse `InventoryRepository.createIntakeMachine` and its transaction-aware
  Machine creation helper.
- Reuse Imports staging, approval snapshot, atomic commit, checksum,
  idempotency, private storage, matching, and provenance.
- Reuse the Inventory search/list route and the existing locationless label.
- Do not restore a general Imports workspace solely for this one migration.

## Tests required

1. Integration: individual Candidate commit succeeds without a destination and
   creates a locationless on-hand Machine.
2. Integration: batch compatibility commit and Finish Receiving succeed
   without a destination and cannot duplicate mappings.
3. Integration: a present active destination is still applied; an inactive
   destination remains rejected.
4. Web: capture/type controls are enabled with null destination and no
   destination prompt or selector is rendered.
5. Browser desktop/tablet: intake one deterministic Machine with no active
   Locations, add it, open Inventory, and find the Machine.
6. Import regression: supplied workbook stages with 227/172/55 counts and the
   source file is unchanged.
7. Operational verification: committed Import Run has 172 mappings and the
   Inventory total increases by 172 exactly once.

Run focused tests, then `npm run lint`, `npm run typecheck`, `npm test`,
`npm run test:integration`, `npm run test:browser`, `npm run build`, and
`git diff --check`.

## Done criteria

- A worker can complete automated photo intake with zero active Locations.
- New intake Machines and imported workbook Machines share the same Inventory
  list and detail routes.
- Optional location does not weaken Load provenance, evidence, duplicate,
  approval, idempotency, audit/outbox, or relocation-history guarantees.
- The supplied workbook is unchanged and cannot be imported twice into the
  same live database through this execution.
- All deterministic project gates pass.

