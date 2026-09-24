# INT-01 Review

## Status

Pass

## Checks Run

- `npm run format:check` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: Contracts 13, Config 11, Database 1, API 24, Web 74.
- `npm run test:integration` — passed: Database 3 passed / 1 environment-dependent test skipped; API 32 passed.
- `npm run build` — passed, including the production Next.js Intake route.
- `npm run test:browser` — passed: 20 passed / 4 role-or-profile-specific tests skipped; the complete Intake journey passed at desktop, tablet, and tablet-landscape sizes.
- `git diff --check` — passed.
- Read-only supplied-photo acceptance — the application preview pipeline converted all 92 HEIC files to bounded JPEG previews; 92 passed / 0 failed and no source file was changed.

## Review Result

The first implementation pass did not satisfy the ticket. Review returned it for a complete user workflow, server-safe client behavior, route binding, confirmation invalidation, exact-match blocking, operation-specific preview grants, database invariants, Files-module ownership, shared Machine creation, and dedicated tests. The corrected implementation now satisfies those findings.

The final workflow provides bounded three-worker uploads with independently visible status, private preview grants, reversible photo grouping/exclusion, candidate fact review and confirmation, warning acknowledgement, destination selection, and atomic commit with created-Machine links. Mutations are permission-checked, idempotent, optimistic-versioned, auditable, and disabled while offline or another mutation is active.

The commit boundary revalidates ready same-Load evidence, photo accounting, candidate confirmation, active destination, and duplicate identity. It creates provisional `on_hand` / `not_started` Machines, `photo_intake` identity evidence, destination history, and immutable candidate-to-Machine provenance in one transaction. Completed retries return the same mappings.

Files owns original and preview bytes, validation, metadata, storage agreement, cleanup, and one-time operation-bound access. HEIC dimensions are checked before raw pixel allocation, and the maintained decoder was verified against the complete supplied set.

## Reuse / Slop Audit

- Intake remains an Inventory-owned submodule and consumes a Files-owned evidence port instead of reading Files tables directly.
- Public Machine creation and Intake commit share the Inventory transaction-aware Machine creation primitive.
- The web route reuses the protected route-state mapper, server/browser client convention, online guard, and synchronized server-state pattern.
- No second storage layer, authorization policy, idempotency implementation, audit path, matching boundary, or offline write queue was introduced.

## New Reusable Things

- Inventory-owned Intake Batch orchestration and atomic batch commit.
- Files-owned private review derivatives with operation-specific preview grants.
- Bounded online multi-photo upload queue with serialized versioned Intake links.

## Remaining Scope

OCR suggestions, automatic grouping, bulk QR work, and Intake exception handling remain deferred to later reviewed tickets, as required by INT-01.
