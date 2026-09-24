# Locationless intake and Inventory workbook migration

## Problem

The active photo-intake flow cannot start or add a Machine unless an active
destination Location exists. The pilot database currently has no active
Locations, so this blocks receiving even though a Machine's physical location
is not required to establish its Inventory identity.

The supplied `source-materials/inventory/Inventory List.xlsx` is also not yet
present in the live application database. The existing import boundary can
stage the workbook safely, but the dedicated Imports workspace was retired and
the current database has no Import Run. Workers therefore cannot see the
legacy on-hand Machines beside Machines created by photo intake.

## Required outcome

- Location is optional during intake. A worker can select a Machine type,
  photograph one nameplate, approve the recognized facts, and add the Machine
  to Inventory without choosing a Location.
- A Machine committed without a destination has `currentLocationId = null` and
  is displayed as **Location not assigned**. It can still be relocated later
  through Inventory's existing location history workflow.
- If an existing/historical Intake Batch already has a destination, commit
  continues to validate and apply it.
- The supplied workbook is staged, explicitly approved, and committed through
  the existing Imports -> Inventory service boundary. No direct table copy is
  allowed.
- Only the 172 `In Inventory` rows are committable. The 55 legacy
  `Purchased (Shipped)` rows stay preserved as non-committable import evidence.
- Every imported Machine remains provisional, uses machine type `other`, keeps
  exact source-row provenance, and appears in the normal Inventory list.
- A newly approved photo-intake Machine appears in that same Inventory list.

## Acceptance scenarios

### Intake without Location

Given there are no active Locations, a Warehouse or Owner worker can capture a
nameplate, complete recognition/review, and add the Candidate to Inventory.
The resulting Machine is on hand, provisional, linked to its source Load, and
has no current Location.

### Existing destination remains honored

Given a historical open Intake Batch already has an active destination, adding
a Machine validates that destination and records the normal initial location
history. An inactive or unknown destination still fails safely.

### Workbook migration

Given the unmodified supplied workbook, staging produces 227 source rows: 172
warning/on-hand candidates and 55 error/sold-shipped rows. Explicit approval
of the 172 non-error rows and one atomic commit creates 172 provisional
Machines exactly once. Replays do not duplicate them, and the workbook bytes
remain unchanged.

### One Inventory surface

After migration and after a new intake approval, `/machines` reports both sets
of Machines. Locationless records render **Location not assigned** and their
Machine detail pages retain source evidence.

## Constraints

- Do not remove the Location domain, schema, APIs, relocation history, or
  destination compatibility from historical Batches.
- Do not invent washer/dryer types or other missing workbook facts.
- Do not import sold/shipped history as on-hand Inventory.
- Do not bypass Owner approval, Inventory normalization, duplicate findings,
  audit/outbox, idempotency, or Import Row -> Machine provenance.
- Do not edit the source workbook or import directly into Inventory tables.
- Keep photo recognition human-approved; recognition must not auto-commit a
  Machine.

