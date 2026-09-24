# tablet-intake-finalize-and-print Review

## Status

Pass

## Checks Run

- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `npm test` — pass in implementation report, 177 tests.
- `npm run test:integration` — pass in implementation report, 48 passed and 1 skipped.
- `npm run test:browser` — pass in implementation report, 19 passed and 2 skipped across desktop, tablet, and tablet landscape.
- `npm run build` — pass in implementation report.
- `npm test -w @simply-clean/web -- test/intake-client.test.ts test/intake-ui.test.tsx test/qr-client.test.ts` — pass, 29 tests.
- Focused Intake API integration command for `intake.integration.test.ts` and `intake-recognition.integration.test.ts` — pass, 15 tests.
- `git diff --check` — pass.
- Repository search for retired active labels/instructions — pass; remaining `Add this Machine to Inventory` text is only a negative test assertion.

## Findings

No blocking findings.

The implementation keeps the decisive behavior in its existing owners:

1. Shared contracts permit type-free preparation and nullable active item projection.
2. Intake preparation creates the photo, Candidate, and targeted Recognition Run together without claiming that type was selected.
3. Recognition remains independent of the constrained human Machine-type choice.
4. The existing atomic Batch Commit is reused and now rejects an unmapped untyped Candidate before Machine creation.
5. The active UI removes the pre-upload classification, per-card status badge, per-card commit, and separate Finish Receiving action.
6. The final UI gate requires authoritative recognition-ready/confirmed state, human type, and no locally staged nameplate work; the server independently enforces the business rule.
7. Whole-Intake QR generation keeps the existing private POST/PDF boundary while making its result visible in a reserved tab and retaining a tested blocked-popup download fallback.
8. Historical Individual Intake Commit and `finishOnly` behavior remain available and covered for compatibility.

## Reuse / Slop Audit

- Duplicated logic: none found. Machine creation, evidence checks, idempotency, mappings, audit/outbox, type attribution, and PDF rendering remain in their canonical owners.
- Missed reuse: none. The final action correctly calls the existing non-`finishOnly` Batch Commit rather than looping over Candidate commits.
- Style mismatches: none material. New UI copy and controls use the existing card, message, button, and select patterns.
- Unnecessary complexity: none material. The parent receives only the local staged-work boolean needed to prevent premature finalization.
- Compatibility: preserved for old open Intakes with existing mappings and for legacy manual-review data.
- Security/privacy: preserved. No provider, evidence-access, QR-token, authorization, or logging boundary changed.
- Accessibility: controls retain labels; the removed visual status badges are not required to operate failures because retry/recapture actions and field states remain available.

## New Reusable Thing Created?

- No. The QR preview behavior is deliberately specific to whole-Intake PDF presentation; it does not justify a generic browser-download abstraction in this ticket.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes; active Intake orchestration is now post-recognition classification plus one final atomic Batch Commit.
- `CONTEXT.md` — yes; Machine Intake Item, Candidate Machine, Batch Commit, Individual Intake Commit, and Finish Receiving descriptions must distinguish current and historical behavior.
- `DECISIONS.md` — yes; record the new accepted workflow and superseded parts of ADR 0008/0012.
- `PRODUCT.md` — yes; the core warehouse journey and success criterion changed.
- `docs/adr/` — yes; add an ADR that explicitly supersedes pre-upload type selection and active individual commit/Finish Receiving while preserving targeted recognition and human approval.
- `AGENTS.md` — no; coding/workflow rules did not change.
- `ROADMAP.md` — yes; completed Intake behavior description changed.
- `specs/index.md` — yes; mark this ticket completed.
