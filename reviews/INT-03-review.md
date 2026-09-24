# INT-03 implementation review

Date: 2026-09-22

## Outcome

Pass. INT-03 replaces the active mixed-photo/Gemini Intake recognition path
with an OCR-first single-nameplate flow. Google Vision returns bounded OCR
lines, OpenAI assigns those lines to structured Machine fields, and the
application's deterministic policy decides whether the evidence is safe to
apply or requires recapture. Recognition remains advisory: only the existing
human **Approve and Add to Inventory** transaction creates Machines.

The deterministic implementation gates use fake providers and do not consume
live credentials. After the key was configured, the live Google Vision +
OpenAI upload-to-candidate path was also exercised through the real UI.

## Implemented boundaries

- One uploaded nameplate photo maps to at most one Candidate Machine; the
  active worker no longer asks a semantic provider to group photos.
- Google Vision OCR runs before semantic assignment. Stable, bounded OCR line
  identifiers and Files-owned bounded JPEG evidence are passed to OpenAI.
- The OpenAI Responses request uses a strict `intake-nameplate-v2` schema,
  image input, and no web-search or other tool declaration.
- Manufacturer, model, and serial are critical. Machine type, voltage, phase,
  and fuel may remain null when the nameplate does not support them.
- Runtime validation rejects unknown keys. Deterministic policy rejects
  unknown photo or OCR references, extra or duplicate groups, duplicate field
  proposals, unsupported enum values, model/serial collisions, and unresolved
  confusable characters.
- Raw OCR remains separate from normalized values. Labels and harmless
  formatting can be removed deterministically and are recorded as correction
  metadata; `O/0`, `I/1`, `S/5`, and `B/8` disagreements are not silently
  substituted.
- Recognition failure retains the private photo and offers bounded retry;
  ambiguous or incomplete evidence creates a targeted clearer-photo request.
  The callable recognition manual-fallback API/client/UI action was removed,
  while historical persisted states remain readable.
- Gemini remains available only to the separate legacy evaluation tooling and
  is rejected by the active nameplate provider factory.
- Private photo previews are constrained to their responsive grid/card with
  `width` and `max-width` containment plus `object-fit: contain`.

## Review findings resolved

- Removed provider-authored correction objects from the OpenAI semantic
  contract; corrections now originate only from deterministic normalization.
- Made the strict OpenAI JSON Schema require every declared object property.
- Normalized labeled OCR such as `MODEL: M1` and `SERIAL: SN-1` before exact
  identity comparison.
- Allowed explicit null optional fields without requiring invented OCR
  evidence or rejecting an otherwise valid identity.
- Restored canonical-value validation for Machine type, phase, and fuel.
- Prevented unknown-only semantic groups from creating decisions or recapture
  records that reference nonexistent photos.
- Rejected duplicate photo membership and duplicate field proposals instead
  of choosing an arbitrary value.
- Removed active grouping/manual-fallback copy from the nameplate workflow.
- Updated the default policy identifier to `intake-nameplate-policy-v2`.
- Fixed a live-found verifier defect where a value spanning several referenced
  OCR lines was compared against each line separately. Bounded combined
  evidence such as `THE` + `DEXTER` + `CO` now verifies `THE DEXTER CO`
  without weakening exact model/serial or confusable-character checks.
- Tightened semantic instructions so ambiguous optional values such as
  `1 OR 3` phase are returned as null rather than forced into a domain enum.

## Verification

- `npm run lint` passed.
- `npm run typecheck` passed for all packages and applications.
- `npm test` passed after the live-found fix: Contracts 13, Config 14,
  Database 1, API 53, Web 74.
- `npm run test:integration` passed: Database 3 passed with 1 optional test
  skipped; API 37 passed.
- `npm run test:browser` passed: 19 passed and 2 intentionally skipped across
  desktop, tablet, and tablet-landscape projects. This command also completed
  the production build successfully.
- `git diff --check` passed.

## Live verification

- The application restarted from the persistent local `.env` with recognition
  enabled, OpenAI `gpt-6-astra`, Google Vision
  `document-text-detection`, policy `intake-nameplate-policy-v2`, and explicit
  0.90 field/OCR pilot thresholds. Liveness and database readiness passed.
- A deliberately cropped plate correctly produced **Needs a clearer photo**
  and no Candidate or Inventory mutation.
- A complete Dexter plate exposed the multi-line OCR matcher defect. After the
  deterministic fix and restart, the same private image reached **Ready** in
  about 20 seconds and produced one Candidate with manufacturer
  `THE DEXTER CO`, model `MCN55AEK`, serial `407034`, and voltage `208-240 V`.
- The responsive preview measured 972×729 inside a 1038×919 parent with no
  horizontal overflow at a 1440-pixel viewport.
- No Machine was created because the plate did not explicitly identify a
  required Machine type and the local database exposed no active destination
  Location. The test did not invent either value or use manual field entry.

## Remaining operational gate

The upload, live providers, deterministic verification, result refresh, and
contained preview are verified. A full **Approve and Add to Inventory** test
still requires a nameplate that explicitly supports Machine type and an active
destination Location selected by the operator. Do not weaken those domain
requirements merely to force a successful commit.
