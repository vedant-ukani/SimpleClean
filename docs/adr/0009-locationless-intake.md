# ADR 0009 — Locationless Intake during the pilot

## Status

Accepted

## Context

The pilot may receive Machines before an active physical Location has been
created. Requiring a destination during Intake blocks the worker even though a
Machine's Inventory identity, Load provenance, evidence, approval, and duplicate
checks do not depend on a current Location. Existing historical Intake Batches
and the destination API still need to remain compatible.

## Decision

Make the Intake Batch destination optional. Inventory always validates the source
Load. When a destination is present, Intake validates that it is active, applies
the current location, and records the existing initial location history. When it
is absent, Intake creates an on-hand provisional Machine with a null current
location and no initial relocation entry.

The active Intake UI does not fetch or render destination choices and does not
gate capture, review, individual commit, or Finish Receiving on a Location. The
nullable destination field and destination command remain available for
historical/API callers. Once a destination exists and a Machine mapping has been
created, the existing destination-lock rule remains unchanged.

## Consequences

- Workers can receive Machines with no active Locations; Inventory shows
  `Location not assigned` until a later relocation.
- Existing destination-aware callers retain active-location validation and
  location history behavior.
- Location domain APIs, schema, and relocation history remain intact.
- The supplied legacy workbook migration remains a separate explicit Imports
  operation and is not run by this decision.
