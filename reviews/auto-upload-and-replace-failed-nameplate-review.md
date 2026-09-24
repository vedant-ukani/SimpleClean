# auto-upload-and-replace-failed-nameplate Review

## Status

Pass

## Checks Run

- Focused web Intake tests — pass, 18 tests.
- Focused API Intake integration test — pass, 10 tests in architect rerun; implementation report also passed the broader 78-test API command.
- `npm run lint` — pass in implementation report.
- `npm run typecheck` — pass in implementation report.
- `npm run build` — pass in implementation report.
- `npm run test:browser` — pass in implementation report, 19 passed and 2 skipped across desktop and tablet sizes.
- `git diff --check` — pass.

## Findings

No blocking findings.

The UI starts the existing upload/preparation flow directly from file selection and retains local staging only for progress or upload/preparation failures. Persisted failed/stale cards no longer retry the same evidence. Replacement prepares a new item before excluding the old failed photo, so a failed replacement cannot erase the worker's recovery path. Explicit removal uses audited exclusion rather than hard deletion.

The repository now defines active Candidates by current assigned evidence. Excluded failed Candidates and immutable recognition history remain stored but are omitted from active items and final Batch Commit validation/creation. Existing mapped Candidates remain included for compatibility, and unassigned photos still fail the existing photo-accounting check.

## Reuse / Slop Audit

- Duplicated logic: none material; existing upload, `prepareIntakeItem`, `excludePhoto`, recognition polling, and Batch Commit boundaries are reused.
- Missed reuse: none.
- Style mismatches: none material.
- Unnecessary complexity: none; no new endpoint, state, or migration was introduced.
- Error recovery: replacement prepares first, preserves the failed card on preparation failure, and leaves failed-only removal available if exclusion fails after preparation.
- Security/privacy: preserved; no evidence bytes, provider payloads, or private identifiers are logged or exposed.
- Accessibility: failed actions have explicit labels and remain file/camera compatible on tablets.

## New Reusable Thing Created?

- No. The active-Candidate SQL condition is an Intake-owned business rule and remains inside the repository rather than becoming a generic abstraction.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes; record immediate preparation and exclusion-based failed evidence handling.
- `CONTEXT.md` — yes; distinguish excluded failed evidence from active Intake items.
- `DECISIONS.md` — yes; preserve failed evidence while removing it from active commit scope.
- `PRODUCT.md` — yes; warehouse journey now begins recognition on selection and provides failed-item replacement/removal.
- `AGENTS.md` — no.
- `ROADMAP.md` — yes; record completed refinement.
- `specs/index.md` — yes; mark completed.
