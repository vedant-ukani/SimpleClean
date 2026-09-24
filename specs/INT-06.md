# INT-06 — Machine capacity and whole-Intake QR label sheets

## Goal

Capture a Machine's operational pound capacity during the existing pipelined
Intake workflow and let an authorized warehouse worker print one private,
ready-to-apply QR label sheet for every Machine committed through that Intake.
The sheet must let a worker match each label to the physical Machine without
scanning every code.

## Ticket Summary

- Add nullable `capacityLb` to the Intake Candidate, Machine, and immutable
  Machine identity evidence.
- Recognition may propose capacity only when the bounded nameplate/OCR evidence
  explicitly supports a numeric capacity and unit.
- Deterministic policy normalizes an explicit pound value to a bounded positive
  integer. It may normalize an explicit kilogram value to the nearest pound
  while preserving the raw evidence and unit. It must never infer capacity from
  a model number, catalog, manufacturer website, or general web search.
- Capacity is not an identity-critical recognition field. Unknown capacity must
  not prevent a Machine from being committed to Inventory.
- The active Intake review provides a constrained capacity control for a worker
  to confirm or correct the value: common values `20`, `30`, `40`, `50`, `60`,
  and `80`, plus a bounded custom pound value and Unknown.
- Capacity changes are attributable, optimistic-versioned, and audited. They do
  not enable manual editing of manufacturer, model, serial, voltage, phase, or
  fuel in the active automated Intake workflow.
- After Finish Receiving, Owner Admin and Warehouse users can generate one
  whole-Intake QR label sheet. Technician/Cleaner remains read/scan-only.
- The sheet includes every durable Candidate-to-Machine mapping for exactly one
  Intake Batch. It must not query another module's tables from controller/UI
  code.
- Reuse an existing active QR label. If a Machine has no active label, create
  one idempotently. Never reissue or duplicate an active label during printing.
- The QR payload remains the existing opaque signed reference and still
  requires authenticated resolution.
- Human-readable printed text is an approved revision to the prior SF-07
  privacy decision. Each label shows Laundrorama, manufacturer, capacity in
  pounds, Machine type, full serial, and fallback code. It never shows price,
  customer, location, internal Machine ID, or acquisition cost.
- A Machine with missing capacity makes the sheet not ready. The UI identifies
  the affected committed Machine and links to its Intake/Machine review rather
  than printing an ambiguous label.
- Generate a private, no-store US Letter PDF in a three-column by three-row
  layout (nine labels per page). Additional Machines create additional pages.
- Reprinting uses the same active labels and records another print activity.

## Expected Output

- Intake recognition and review can display and confirm capacity.
- Inventory Machine details display capacity and allow authorized correction
  through the existing versioned Machine identity update boundary.
- A completed Intake page has a `Print all QR labels` action.
- The downloaded PDF contains up to nine readable labels per US Letter page.
- Deterministic tests cover capacity parsing, persistence, authorization,
  idempotent label reuse, multi-page rendering, and the browser workflow.
- A real local UI test uploads several representative nameplates, commits their
  Machines, finishes receiving, and downloads/opens the resulting label sheet.

## Non-Goals

- Do not add manufacturer-site or general web search.
- Do not create a Model Specification/catalog module in this ticket.
- Do not infer capacity from model syntax unless explicit evidence says it is a
  capacity value.
- Do not make capacity part of manufacturer-plus-serial duplicate identity.
- Do not add price, customer, location, or internal IDs to printed labels.
- Do not add unattended printing or printer-driver integration.
- Do not support configurable label-stock templates in the first release.
- Do not alter individual QR revocation, reissue, scan, or fallback lookup
  semantics.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `packages/contracts/src/intake.ts` | Owns Candidate, Intake detail, mappings, and commands. |
| `packages/contracts/src/intake-recognition.ts` | Owns recognized field names and bounded provider results. |
| `packages/contracts/src/inventory.ts` | Owns Machine, evidence, QR, and identity-update contracts. |
| `packages/database/src/schema.ts` | Owns Machine, evidence, Candidate, and QR persistence. |
| `apps/api/src/modules/inventory/intake/intake.service.ts` | Canonical Intake orchestration boundary. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | Owns Candidate persistence and Candidate-to-Machine mappings. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` | Owns deterministic field acceptance. |
| `apps/api/src/modules/inventory/intake/recognition/providers` | Replaceable semantic/OCR adapters and deterministic fakes. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Canonical Machine access and identity update boundary. |
| `apps/api/src/modules/inventory/qr/qr-label.service.ts` | Owns QR authorization, lifecycle, signing, and print orchestration. |
| `apps/api/src/modules/inventory/qr/qr-label.repository.ts` | Owns active-label uniqueness and immutable activity. |
| `apps/api/src/modules/inventory/qr/qr-label.renderer.ts` | Existing single-label QR renderer. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Active Intake worker workflow. |
| `apps/web/src/lib/qr-client.ts` | Existing private QR download client. |

## Files to Modify

| File area | Required change |
|---|---|
| `packages/contracts/src/{inventory,intake,intake-recognition}.ts` | Add bounded `capacityLb`, capacity commands, and bulk-sheet contracts. |
| `packages/database/src/schema.ts` and a new migration | Add nullable capacity columns without rewriting prior migrations. |
| `apps/api/src/modules/inventory/inventory.*` | Map/persist/display capacity and reuse versioned identity update. |
| `apps/api/src/modules/inventory/intake/*` | Persist worker capacity, pass it through individual commit, and expose mapped Machines through the service boundary. |
| `apps/api/src/modules/inventory/intake/recognition/*` | Extract and deterministically accept explicit capacity evidence. |
| `apps/api/src/modules/inventory/qr/*` | Ensure/reuse active labels and render a private multi-page PDF. |
| `apps/web/src/lib/{intake,inventory,qr}-client.ts` | Add the bounded capacity and sheet operations. |
| Intake review and Machine detail UI | Show/edit capacity and download the whole-Intake PDF. |
| Existing unit/integration/browser tests | Cover the end-to-end behavior. |

## Files to Reference Only

| File | Why |
|---|---|
| `docs/adr/0007-single-nameplate-automated-recognition.md` | Preserve evidence-only recognition and no-web-search. |
| `docs/adr/0008-pipelined-individual-intake-commit.md` | Preserve independent item processing and Finish Receiving. |
| `specs/SF-07.md` | Preserve opaque QR identity and label lifecycle. |
| `specs/INT-04.md` | Preserve the active worker-selected type and individual commit flow. |

## Files Not to Touch

- `source-materials/**` — immutable source and test evidence.
- `.codex-build/**` and `Deliverables/**` — not application foundations.
- External sales, accounting, production, and shipment modules — outside scope.

## Codegraph Findings (live, this ticket)

- `IntakeBatchDetailSchema.machineMappings` already supplies the authoritative
  `candidateId -> machineId` set for one receiving session.
- `QrLabelService` already owns permission checks, signing, lifecycle, and
  individual rendering.
- `QrLabelRepository` already enforces one active label per Machine and records
  immutable label activity.
- `QrLabelRenderer` is covered by QR unit tests and should retain its existing
  single-label behavior.
- Capacity does not exist in current contracts, schema, recognition, UI, or QR
  output.
- The codegraph index has pending changes; current on-disk source was confirmed
  with targeted searches before this spec.

## Reuse Audit

Reused:

- Existing Intake mapping and service boundaries.
- Existing Machine identity/evidence persistence and optimistic versions.
- Existing QR signer, fallback code, active-label uniqueness, activity history,
  and authorization.
- Existing deterministic recognition fakes and browser Intake journey.

New code justified because:

- No capacity fact or constrained capacity command exists.
- No bulk label renderer or Intake-scoped QR endpoint exists.
- PDF pagination is distinct from the existing one-label SVG description.

Do not duplicate:

- Machine lookups, identity normalization, permission checks, QR signing,
  Intake mappings, provider access, or print activity rules.

Escalated to human:

- None. The user approved implementation after reviewing the human-readable
  label content and the 3x3 US Letter recommendation.

## Implementation Plan

1. Add contracts, schema columns, and a forward-only migration for capacity.
2. Extend Inventory and Intake repository mappings and versioned commands.
3. Extend fake/OpenAI recognition schemas and deterministic capacity parsing.
4. Add Intake/Machine UI controls and capacity display.
5. Add an Intake-owned read boundary for committed mapped Machine summaries.
6. Add an idempotent QR service operation that ensures one active label per
   mapped Machine and rejects incomplete/empty/open Intake sheets.
7. Add a bounded PDF sheet renderer with 3x3 pagination and readable fields.
8. Add the protected PDF endpoint and web download action.
9. Add unit, integration, component, and deterministic browser tests.
10. Run the full workspace gates, then test several real nameplates through the
    local UI and visually inspect the downloaded sheet.

## Constraints

- Preserve existing API behavior unless extended by this ticket.
- QR payloads remain opaque and signed; readable facts stay outside the token.
- The PDF response is authenticated, private, `no-store`, and excluded from PWA
  caching.
- Validate all numeric input at the contract boundary and again in the owning
  service where required.
- Persist domain mutations, audit, idempotency, and outbox records using the
  existing transaction conventions.
- Never log full serials, OCR text, image bytes, provider payloads, or PDF bytes.
- Live provider results are diagnostic evidence, not deterministic test gates.
- Preserve unrelated dirty-worktree changes.

## Tests Required

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- Focused QR, Intake, recognition-provider, recognition-policy, and UI tests
  during implementation.
- Local browser walkthrough with at least three representative nameplate files.

## Done Criteria

- Capacity survives recognition/review, individual commit, Inventory reads, and
  authorized correction without changing identity matching.
- A finished Intake with complete label facts downloads one valid private PDF
  containing every mapped Machine exactly once.
- Repeated sheet generation reuses active QR labels and records print activity.
- Missing capacity produces a clear actionable UI state and no ambiguous sheet.
- QR scans and fallback codes still resolve under the existing permission model.
- All required automated checks pass.
- Real UI testing verifies several nameplates and the resulting sheet visually.
- No unrelated workspace changes are overwritten or committed.
