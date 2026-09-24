# INT-05 review — Locationless intake and legacy Inventory migration

## Result

Pass. No blocking or follow-up correctness findings remain.

## Implemented behavior

- Individual Intake Commit, compatible Batch Commit, and Finish Receiving no
  longer require a destination.
- Inventory always validates the source Load. A supplied destination is still
  required to be active and retains normal initial location-history behavior.
- A missing destination creates an on-hand provisional Machine with a null
  current location.
- The active Intake screen no longer fetches or renders a Location selector and
  no longer disables type/capture controls when no Location exists.
- Browser coverage tracks the exact Machine links created by the Intake run,
  opens the normal Inventory list, and proves each record is visible with
  **Location not assigned** at desktop, tablet, and tablet-landscape sizes.
- The retired general Imports workspace remains retired.

## Workbook execution

The exact source workbook was staged through the authenticated Owner Imports
API, not copied into database tables. Import Run
`1aa3a976-0117-4639-b19c-3f30fa2e96eb` preserved 227 source rows, approved the
172 non-error on-hand rows, and committed 172 provisional `other` Machines.
The 55 sold/shipped rows remain non-committable source evidence. The committed
run checksum matched the source file, and the live Inventory total became 174,
including the two pre-existing provisional test Machines.

## Invariants reviewed

- Source workbook remains read-only and privately stored.
- Import approval, exact match snapshots, atomic commit, idempotency,
  audit/outbox, and Import Row -> Machine provenance remain in the existing
  module boundaries.
- Location domain APIs, relocation history, nullable Batch destination, and the
  destination-lock rule remain intact.
- Recognition remains advisory; every Intake Machine still requires human
  confirmation/approval.
- No provider SDK, file bytes, raw OCR payload, or direct cross-module table
  write was introduced.

## Verification

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — 156 tests passed.
- `npm run test:integration` — 42 tests passed, one skipped (39 API plus three
  database integration tests).
- `npm run test:browser` — 19 passed, two skipped across desktop, tablet, and
  tablet-landscape projects.
- `npm run build` — passed as part of the browser gate.
- `git diff --check` — passed.

The integration-suite error logs for forced outbox failures are expected test
fixtures that verify transactional rollback; the suite passed.
