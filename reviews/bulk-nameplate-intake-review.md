# bulk-nameplate-intake Review

## Status

Pass

## Checks Run

- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test --workspace @simply-clean/web` — pass, 79 tests
- API QR renderer/unit suite — pass, 62 tests
- Focused QR integration coverage — pass, 5 tests
- Focused `tests/browser/intake.spec.ts`, desktop Chromium — pass
- Focused `tests/browser/intake.spec.ts`, tablet Chromium — pass
- `npm run build` — pass
- `git diff --check` — pass

## Findings

No remaining required fixes.

The initial review found two issues: the browser journey still exercised the
retired one-photo controls, and an exact duplicate was presented as an
acknowledgeable warning. Both were corrected. The browser journey now selects
three files once, assigns each type, uploads once, leaves one capacity unknown,
and verifies a valid mixed-capacity QR sheet. Exact manufacturer-plus-serial
matches now render as non-interactive blockers and disable the add action; only
weaker matches retain acknowledgement controls.

## Reuse / Slop Audit

- Duplicated logic: no new API, mutation boundary, identity matcher, file policy,
  or QR signer was introduced. The UI reuses `prepareIntakeItem` per image.
- Missed reuse: none. Bounded upload, authoritative Batch refresh, per-item
  recognition, active-label reuse, and private download behavior remain canonical.
- Style mismatches: none. Staging and thumbnail rules live in the shared visual
  system and reuse existing controls/tokens.
- Unnecessary complexity: none. Client staging is required to associate an
  observed type with each selected file before authoritative preparation.

## New Reusable Thing Created?

- No. The staged nameplate queue is specific to the Intake workflow and does not
  justify a cross-application abstraction.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes; record batch selection with one-item
  preparation and capacity-optional sheet behavior.
- `DECISIONS.md` — yes; the user changed the accepted capacity printing rule and
  active Intake presentation.
- `PRODUCT.md` — yes; update the warehouse receiving journey.
- `AGENTS.md` — no; engineering rules are unchanged.
- `ROADMAP.md` — no; delivery sequencing is unchanged.

The required durable updates are recorded in ADR 0012, `DECISIONS.md`,
`ARCHITECTURE.md`, and `PRODUCT.md`.
