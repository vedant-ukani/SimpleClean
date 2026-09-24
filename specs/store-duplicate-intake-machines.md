# store-duplicate-intake-machines — Store every Intake Machine without duplicate blocking

## Goal

Let photo Intake store every recognized physical Machine as its own provisional
Inventory record even when manufacturer, serial, or model matches an existing
Machine or another Candidate. Remove duplicate-warning controls from Intake and
never merge records automatically.

## Ticket Summary

- Exact manufacturer-plus-serial matches must no longer fail targeted or legacy
  Intake recognition.
- Serial-only, manufacturer/model, and exact identity matches must not downgrade
  Candidates, require acknowledgement, disable approval, or block commit.
- Remove the Inventory warning/serial-match UI from active and compatible legacy
  Intake review.
- Every committed Candidate creates one new provisional Machine with a distinct
  immutable Machine ID, evidence, mapping, audit entry, and outbox event.
- Preserve existing request/response contract fields and finding enums for
  backward compatibility, but new Intake behavior does not populate or enforce
  duplicate warnings.
- Preserve later explicit identity verification: a unique verified identity claim
  may still mark a Machine as conflicted, but it never merges or deletes records.

## Expected Output

- A supported nameplate result reaches Ready for review even when the same
  normalized manufacturer and serial already exist.
- **Add this Machine to Inventory** remains available without a warning checkbox.
- Committing two duplicate Candidates creates two different provisional Machines
  and two durable Candidate-to-Machine mappings.
- The Intake screen contains no Inventory warnings or serial-match button/control.
- Existing QR, recognition evidence, file privacy, idempotency, and Finish
  Receiving behavior remains unchanged.

## Non-Goals

- Do not merge, update, relink, or delete existing Machines.
- Do not weaken the unique verified `machine_identity_claim` boundary or later
  explicit identity-verification conflict behavior.
- Do not change spreadsheet-import match staging/approval rules.
- Do not change OCR evidence support, required manufacturer/model/serial facts,
  Machine type selection, capacity, QR printing, or file handling.
- Do not remove historical database warning/acknowledgement rows or migrate data.
- Do not remove public contract enum values in this compatibility-preserving
  ticket.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` / `applyTargeted`, `apply` | Converts supported recognition into Candidate state and currently rejects/downgrades identity matches. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` / `confirmCandidate`, `commitCandidate`, `commit`, `detail` | Enforces duplicate warnings/exact-match rejection and creates mapped provisional Machines. |
| `apps/api/src/modules/inventory/inventory.repository.ts` / `createIntakeMachine` | Creates distinct provisional Machines; the machine table already allows duplicate normalized identities. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Renders warning controls and duplicate-specific button disabling. |
| `packages/database/src/schema.ts` / Machine and identity-claim tables | Confirms provisional Machine rows are not identity-unique while verified claims remain unique. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | Stop identity matching from changing supported recognition acceptance or Candidate confirmation in targeted and legacy application paths. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | Remove warning acknowledgement and exact-match rejection from confirmation, individual commit, and compatible batch commit; return empty Intake warnings for new/current detail behavior and remove now-unused private matching helpers. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Remove duplicate warning copy/helpers, warning fieldsets, acknowledgement state, duplicate-specific disabled conditions, and warning arguments from active UI actions while retaining compatible client calls. |
| `apps/api/test/intake.integration.test.ts` | Replace exact/weak/concurrent duplicate rejection assertions with proof that all Candidates create separate provisional Machines and mappings. |
| `apps/api/test/intake-recognition.integration.test.ts` | Prove an exact existing/same-batch identity does not fail otherwise supported targeted recognition. |
| `apps/web/test/intake-ui.test.tsx` | Assert duplicate warnings are not rendered and approval remains available. |
| `tests/browser/intake.spec.ts` | Assert the active workflow contains no Inventory warning or serial-match control; retain the batch-upload journey. |

## Files to Reference Only

| File | Why |
|---|---|
| `ARCHITECTURE.md` Reuse Map | Keeps Machine creation, evidence, identity claims, and Intake transactions in their owning modules. |
| `packages/contracts/src/intake.ts` | Warning/request/finding fields remain parseable for compatibility but are not enforced by current Intake. |
| `apps/api/src/modules/inventory/inventory.repository.ts` / `verifyMachine` | Later verification remains the only owner of unique identity claims and conflict marking. |
| `packages/database/drizzle/0002_inventory_foundation.sql` | Confirms uniqueness exists on verified claims, not provisional Machine identity columns. |
| `apps/web/src/lib/intake-client.ts` | Existing client may continue sending an empty acknowledgement list. |

## Files Not to Touch

- `packages/database/**` — no migration or constraint change is needed.
- `apps/api/src/modules/imports/**` — spreadsheet-import matching remains reviewed.
- Recognition provider/policy code — evidence correctness remains mandatory.
- QR, Files, Identity, Operations, and service-worker modules — unrelated
  security and lifecycle boundaries remain unchanged.
- Historical ticket specs — they remain records of earlier accepted behavior.

## Codegraph Findings (live, this ticket)

- Targeted recognition calls `lockIntakeIdentity`, rejects an exact match, records
  `exact_identity_match`, and leaves the run failed instead of confirming the
  already prepared Candidate.
- Legacy recognition repeats exact rejection and calls
  `hasIntakeIdentityWarning`, which downgrades matched Candidates to `draft`.
- Candidate confirmation rejects exact matches and requires acknowledgement for
  weaker warnings. Individual and compatible batch commit repeat exact identity
  checks before calling `createIntakeMachine`.
- Intake detail recomputes warning kinds against authoritative Machines and other
  Candidates and exposes them to the UI.
- `inventory_machine` has ordinary indexes, not a unique normalized identity
  constraint. `createIntakeMachine` therefore safely creates distinct provisional
  rows with the same normalized manufacturer/serial.
- `machine_identity_claim` uniquely owns verified manufacturer/serial identities.
  Intake creation does not insert claims; later verification preserves both
  Machines and marks a conflict instead of merging.
- Candidate-to-Machine and photo constraints preserve one-to-one provenance but
  do not prevent separate duplicate-identity Machines.

## Reuse Audit

Reused:

- Existing per-item recognition, Candidate confirmation, transactional Machine
  creation, immutable evidence, mappings, audit/outbox, idempotency, and Finish
  Receiving.
- Existing provisional identity state and later verification/conflict model.
- Existing integration fixtures and browser Intake journey.

New code justified because:

- No new application abstraction is required. The change removes gates and adds
  regression assertions for the new accepted policy.

Do not duplicate:

- Machine creation, normalization, evidence recording, identity verification,
  idempotency, or commit transaction logic.

Escalated to human:

- None. The user explicitly directed Intake to store every duplicate separately
  and remove the serial warning control.

## Implementation Plan

1. Remove identity-match influence from targeted and legacy recognition apply
   paths so supported evidence confirms the Candidate normally.
2. Remove duplicate warning and exact-match enforcement from Candidate
   confirmation, individual commit, and compatible batch commit while preserving
   all other revalidation and transaction checks.
3. Stop computing/exposing current Intake warning controls and remove their UI
   state, copy, and disabled behavior.
4. Replace rejection tests with deterministic duplicate-storage coverage for
   same-batch, existing-Inventory, and concurrent cross-batch cases.
5. Verify every duplicate produces a distinct provisional Machine, immutable
   evidence, and unique Candidate mapping, with retries remaining idempotent.
6. Run focused API, web, browser, lint, typecheck, and build checks.

## Constraints

- Preserve unrelated dirty-worktree changes.
- Never merge or overwrite an existing Machine when a duplicate is received.
- Keep every new Machine provisional; do not create verified identity claims.
- Retain manufacturer/model/serial values exactly as accepted by the existing
  evidence policy and normalization boundary.
- Preserve API compatibility for acknowledgement fields and historical finding
  enum values even though current Intake ignores duplicate acknowledgement.
- Do not log serials, raw OCR, filenames, image bytes, or sensitive payloads.
- Keep commit mutations, evidence, mapping, audit, and outbox atomic.

## Tests Required

- `npm run lint`
- `npm run typecheck`
- Focused API Intake integration and recognition integration tests
- `npm test --workspace @simply-clean/web`
- Focused `tests/browser/intake.spec.ts` in desktop and tablet projects
- `npm run build`

## Done Criteria

- Supported targeted recognition is Ready despite an existing exact identity.
- No Intake warning/serial-match control is rendered.
- Duplicate acknowledgement is not required by confirmation or commit.
- Two duplicate Candidates create two distinct provisional Machines and retain
  separate mappings/evidence without merging or overwriting.
- Later verified identity claims remain unique and conflict-aware.
- Required checks pass with no new schema, API break, or duplicate domain logic.
