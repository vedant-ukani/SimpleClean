# INT-06 review — Machine capacity and whole-Intake QR label sheets

## Result

Pass. No blocking correctness or UI findings remain.

## Implemented behavior

- Intake Candidates, Machines, and immutable identity evidence retain nullable,
  bounded pound capacity.
- Recognition accepts capacity only from explicit units, including consistent
  dual-unit labels such as `25 lb / 11 kg`; worker-confirmed capacity remains
  authoritative on a retry.
- The active Intake UI offers common, custom, and Unknown capacity choices
  without exposing manual identity editing.
- Finish Receiving remains separate from individual Machine approval.
- A committed Intake can download one private nine-up Letter PDF for all mapped
  Machines. Printing requires every Machine to have capacity, reuses active QR
  labels, records print activity, and identifies missing-capacity Machines.
- Printed QR payloads remain opaque and authenticated. Visible text is limited
  to Laundrorama, manufacturer, capacity, type, full serial, and fallback code.
- Private photo previews remain contained at desktop and tablet widths.

## Recognition reliability follow-ups

The real-photo walkthrough exposed deterministic false negatives rather than a
provider outage. Equivalent voltage forms are now compared canonically,
optional field warnings do not block verified manufacturer/model/serial, and a
blur warning remains provenance when the critical identity exactly agrees with
Google OCR. Active capture also retries one version conflict with a fresh Batch
version, and targeted retries can fill unknown capacity without replacing a
worker-confirmed value.

## Real UI walkthrough

The application processed and approved three local nameplates through the
actual UI:

- Continental Girbau `EH020XA1321121011`, serial `1443228G16`, Washer, 20 lb.
- Dexter `WCVD25KCS-12`, serial `20408000472592`, Washer, 25 lb.
- Dexter `DC30X2NA-65EC1X-SWBSG-USA`, serial `01.15163.001`, Dryer, 40 lb.

The Intake was finished through the UI and the three-label PDF was downloaded.
Visual inspection initially found that the first label inherited the white page
fill and hid its readable text. The renderer now resets black fill before every
label, with a regression test. The refreshed one-page Letter PDF shows all three
manufacturers, capacities/types, full serials, QR codes, and fallback codes with
no overlap, cutoff, missing text, or horizontal preview overflow.

Artifacts:

- `.local-data/int06-real-qr-labels.pdf`
- `.local-data/int06-real-qr-labels-page-1.png`

## Invariants reviewed

- Capacity is not part of manufacturer-plus-serial identity and does not block
  individual Machine creation.
- Controllers and UI use Intake and QR service boundaries rather than reading
  another module's tables.
- Active-label uniqueness, signed opaque tokens, authenticated resolution,
  authorization, idempotency, audit, and print activity remain intact.
- The PDF is authenticated, private, `no-store`, and contains no price,
  customer, location, acquisition cost, or internal Machine ID.
- Live providers remain behind ports; deterministic fakes remain the product
  test gate.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — 168 tests passed.
- `npm run test:integration` — 47 passed, one skipped.
- `npm run test:browser` — 19 passed, two skipped across desktop, tablet, and
  tablet-landscape projects.
- `npm run build` — passed as part of the browser gate.
- Focused recognition policy/integration tests — 28 passed.
- Focused QR renderer tests — six passed.
- `git diff --check` — passed.

The integration-suite error logs for forced outbox failures are expected test
fixtures that verify transactional rollback; the suite passed.
