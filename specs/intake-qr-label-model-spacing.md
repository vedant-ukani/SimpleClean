# intake-qr-label-model-spacing — Add model identity and QR breathing room

## Goal

Make every whole-Intake PDF label easier to match and cut by adding the
Machine's model number to the visible identity block and restoring a clear
vertical gap between the last identity line and the QR code. Preserve the
existing private, audited, nine-up Letter sheet and its QR lifecycle.

## Ticket Summary

- Add a visible `Model: <value>` line to every whole-Intake QR label.
- If the Machine has no recorded model, print `Model: Not recorded` so the
  omission is explicit rather than silently removing the field.
- Keep the full visible serial number as `Serial: <value>` or the existing
  `Serial: Not recorded` fallback.
- Recompose the label so a normal one-line serial has a clearly visible gap
  before the QR begins. The attached production screenshot is the regression
  reference: the serial baseline currently meets the QR's top edge.
- Keep nine labels per US Letter page, current borders, manufacturer,
  capacity/type, fallback code, and pagination.
- A 10-label sheet must still create two pages.
- Long manufacturer/model/serial text must stay within its cell and must not
  be silently truncated.

## Expected Output

- The whole-Intake PDF identity block reads, in order: Laundrorama,
  manufacturer, capacity/type, model, and serial.
- The QR is slightly reduced and/or repositioned to create visual separation
  while remaining readily scannable.
- The fallback code remains below the QR with clear separation from the cell
  border.
- The existing Intake reprint action produces the improved layout without a
  new endpoint or UI change.
- Automated tests prove model propagation, missing-model behavior,
  pagination, readable facts, and an unchanged opaque scan URL.

## Non-Goals

- Do not change the QR payload, signature, fallback-code format, active-label
  reuse, revocation, authorization, print audit, response headers, or filename.
- Do not change the standalone one-label SVG.
- Do not change Intake, Machine, database, or HTTP schemas.
- Do not add prices, customers, seller details, locations, costs, source
  references, or internal Machine IDs to labels.
- Do not redesign the Warehouse or Intake screens.
- Do not change page size, label count, printer configuration, or add direct
  unattended printing.

## Relevant Existing Code

| File/Symbol                                                                                | Why it matters                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `ARCHITECTURE.md` Reuse Map                                                                | Inventory QR owns label rendering and Intake supplies committed Machines through its service boundary. |
| `apps/api/src/modules/inventory/qr/qr-label.renderer.ts` / `QrSheetMachine`, `renderSheet` | Canonical nine-up PDF layout and visible label facts.                                                  |
| `apps/api/src/modules/inventory/qr/qr-label.service.ts` / `printIntakeSheet`               | Existing orchestration already receives the complete committed `Machine`, including nullable `model`.  |
| `apps/api/src/modules/inventory/intake/intake.service.ts` / `committedMachines`            | Required domain boundary for retrieving Machines mapped to a committed Intake.                         |
| `packages/contracts/src/inventory.ts` / `MachineSchema`                                    | Confirms that `model` is already a nullable Machine fact; no contract work is required.                |
| `apps/api/test/qr-label.test.ts`                                                           | Direct PDF content and pagination coverage.                                                            |
| `apps/api/test/qr-label.integration.test.ts`                                               | Existing private endpoint, authorization, active-label reuse, and print-history coverage.              |

## Files to Modify

| File                                                     | Required change                                                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/inventory/qr/qr-label.renderer.ts` | Add nullable model input, render its labeled fallback, and adjust the identity/QR/fallback geometry to prevent crowding while preserving nine-up output. |
| `apps/api/src/modules/inventory/qr/qr-label.service.ts`  | Pass `machine.model` into the existing renderer input.                                                                                                   |
| `apps/api/test/qr-label.test.ts`                         | Assert recorded and missing model text, pagination, unchanged facts, and geometry that leaves a meaningful serial-to-QR gap.                             |
| `apps/api/test/qr-label.integration.test.ts`             | Assert that the committed Machine's model reaches the generated PDF through the real endpoint.                                                           |

## Files to Reference Only

| File                                                         | Why                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `apps/api/src/modules/inventory/qr/qr-label.controller.ts`   | Existing authenticated, private, no-store PDF response must remain unchanged.   |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | Existing mapping query already returns full `Machine` values through Inventory. |
| `docs/adr/0011-intake-capacity-and-whole-load-qr-sheets.md`  | Original privacy and physical-matching rationale.                               |
| `specs/INT-06.md`                                            | Original nine-up sheet acceptance contract.                                     |
| `specs/intake-history-qr-reprint.md`                         | Reprint entry points must continue to reuse this same renderer.                 |

## Files Not to Touch

- `packages/database/**` — no schema or migration change is needed.
- `packages/contracts/**` — model is already present on `Machine`.
- `apps/web/**` — all current print and reprint actions already call the
  canonical sheet endpoint.
- `apps/api/src/modules/inventory/qr/qr-label.signer.ts` — QR identity is out of
  scope.
- `apps/api/src/modules/inventory/qr/qr-label.repository.ts` — label lifecycle
  and audit are unchanged.

## Codegraph Findings (live, this ticket)

- `QrLabelRenderer.renderSheet` is called by the QR service and directly covered
  by `apps/api/test/qr-label.test.ts`.
- `QrSheetMachine` is local to the renderer boundary; adding `model` has a small
  compile-time blast radius.
- `QrLabelService.printIntakeSheet` is the only production construction site
  for sheet-label inputs.
- `IntakeService.committedMachines` already returns `Machine[]`, and
  `MachineSchema` already includes nullable `model`.
- The current geometry puts the serial baseline at `cell top - 76` and the QR
  top at approximately `cell top - 76.67`, explaining the screenshot's near
  collision.
- No web component constructs or lays out label contents.

## Reuse Audit

Reused:

- The existing committed-Machine Intake boundary.
- The existing QR signer, active-label lookup/create flow, renderer, PDF
  builder, adaptive text helper, nine-up grid, and print-audit loop.
- The existing nullable Machine `model` fact; no new schema or DTO.

New code justified because:

- The PDF needs one additional renderer field and a local layout adjustment.
  This is presentation, not a new reusable business rule.
- A small renderer-local geometry assertion may be added if needed to prevent
  recurrence; do not introduce a general layout framework.

Do not duplicate:

- Machine reads, label creation, URL signing, authorization, print recording,
  PDF transport, or page pagination.

Escalated to human:

- None. The screenshot and request resolve the presentation choice.

## Implementation Plan

1. Extend `QrSheetMachine` with nullable `model`.
2. Pass `machine.model` from `printIntakeSheet` without changing the endpoint or
   orchestration.
3. Render `Model: ...` between capacity/type and serial.
4. Rebalance the identity baselines and QR dimensions/position. For an ordinary
   one-line model and serial, retain at least roughly 12 PDF points of white
   space between the serial text and the QR's top edge.
5. Preserve full text with the existing adaptive behavior. Exercise realistic
   long values and ensure lines stay inside the label and out of the QR area.
6. Extend unit and integration assertions, then render a representative PDF for
   visual inspection at actual page scale.

## Constraints

- Keep the QR at a practical printed scanning size; do not trade the spacing
  fix for an unusually small code.
- Keep all content inside each approximately 188 × 243 point cell.
- Model and serial remain human-readable text outside the opaque QR payload.
- Preserve the renderer's PDF text escaping and non-ASCII replacement.
- Preserve current ordering of Machines and pages.
- Follow `AGENTS.md`, including service boundaries and reuse rules.
- Do not log the model, serial, PDF bytes, signed URL, or fallback code.

## Tests Required

- `npm exec -w @laundrorama/api -- vitest run test/qr-label.test.ts`
- `npm exec -w @laundrorama/api -- vitest run --no-file-parallelism --maxWorkers=1 --testTimeout=10000 --hookTimeout=10000 test/qr-label.integration.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Render and inspect a representative nine-up PDF containing recorded, missing,
  and long model/serial values; confirm no overlap and successful QR scan.

## Done Criteria

- Whole-Intake and historical reprint PDFs show Model Number for every Machine,
  with an explicit missing-value fallback.
- Serial text no longer touches the QR in the normal label case.
- The QR remains decodable and the fallback remains readable.
- Nine-up pagination and all existing privacy, authorization, label lifecycle,
  and audit behavior are unchanged.
- Focused tests, lint, typecheck, build, visual inspection, and resumed end-to-end
  verification pass.
- No duplicate logic or unrelated changes are introduced.
