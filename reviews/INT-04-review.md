# INT-04 Review — Pipelined Machine Intake

## Result

Pass.

INT-04 keeps one Load-level Intake Batch while making every nameplate an independent Machine Intake Item. Workers can capture the next Machine while earlier recognition runs, review automatic read-only identity fields, add each ready Machine to Inventory separately, and close the receiving session only after every item already has a durable Machine mapping.

## Reviewed invariants

- Item preparation atomically binds one private photo, one Candidate, the worker-observed Machine type, and one targeted Recognition Run.
- Adding another item does not stale an earlier targeted run.
- Targeted recognition reads only the intended private evidence and cannot overwrite the worker-selected Machine type.
- Recognition status is bounded and represents multiple independent runs.
- Individual commit revalidates evidence, warnings, destination, duplicate identity, and Candidate state before creating exactly one Machine.
- Candidate-to-Machine mapping, Candidate state, Machine creation, audit, outbox, and idempotency complete in one transaction.
- The Intake Batch remains open after an individual commit.
- The shared destination cannot change after the first Machine is added.
- Finish Receiving rejects unresolved or unmapped items and never creates an unreviewed Machine.
- Historical batch-wide recognition and commit data remain readable.
- Active identity fields are automatic/read-only; poor or ambiguous evidence uses targeted recapture.
- Private previews use contained responsive sizing. File pickers use the platform image category plus explicit HEIC/HEIF extensions, while the Files backend remains the strict byte/type authority.

## Findings resolved during review

1. A newly captured second item was not added to recognition polling if the first run had already finished. Capture now refreshes the run collection, so every new targeted run restarts polling.
2. Rapid capture could use a stale batch version. Item preparation now reads the authoritative current Batch before reserving the next item.
3. Native image selection was too narrowly described by MIME identifiers. Intake inputs now use `image/*` plus explicit `.heic` and `.heif` extensions; unsupported bytes are still rejected by the server.
4. The browser acceptance test still described the retired manual/batch-wide flow. It now covers two pipelined Machines, independent readiness, read-only fields, contained previews, individual commits, an open Batch after the first commit, and finish-only closure.

## Verification

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — 22 files, 156 tests passed across packages and applications.
- `npm run test:integration` — 10 files, 42 tests passed; 1 optional database test skipped.
- `npm run test:browser` — 19 passed across desktop, tablet portrait, and tablet landscape; 2 intentionally skipped.
- `npm run build` — passed.
- `npm run db:migrate` — migration `0011_pipelined_intake` applied successfully to the local database.
- `git diff --check` — passed.

A separate Computer Use pass confirmed the restarted app, authentication, seeded Load, Intake start, destination selection, and contained empty-state layout. The macOS native picker automation could preview both HEIC and JPEG files but could not activate its Open action, so the complete disposable UI journey was executed by Playwright instead. That full-boundary test covers upload, two independent recognition runs, contained previews, individual commits, open-Batch behavior after the first commit, Finish Receiving, and final Inventory navigation.

The browser product gates use deterministic recognition adapters. Live Google Vision/OpenAI behavior remains a deployment/provider check and does not replace deterministic product acceptance.
