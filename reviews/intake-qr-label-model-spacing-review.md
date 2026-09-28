# intake-qr-label-model-spacing Review

## Status

Pass

## Checks Run

- `npm exec -w @laundrorama/api -- vitest run test/qr-label.test.ts` — pass, 7 tests.
- `npm exec -w @laundrorama/api -- vitest run --no-file-parallelism --maxWorkers=1 --testTimeout=10000 --hookTimeout=10000 test/qr-label.integration.test.ts` — pass, 5 tests.
- `npm run lint` — pass, reported by Agent B.
- `npm run typecheck` — pass, reported by Agent B.
- `npm run build` — pass, reported by Agent B.
- `git diff --check` — pass.
- Prettier check for every changed implementation, test, and specification file — pass.
- Representative nine-up PDF raster inspection — pass: normal, missing-model, and long-identity labels remain inside their cells with visible QR separation.
- Raster QR decode — pass for normal and long-identity labels; both recover their expected signed scan URLs.

## Findings

No required implementation findings.

The renderer now propagates the existing nullable Machine model, prints an
explicit missing-model value, and lays out its identity block against a reserved
QR band. Normal labels have at least a 12-point serial-to-QR gap. Long values
retain all text with bounded adaptive sizing and keep the QR inside the same
nine-up cell.

The endpoint, authorization, active-label lifecycle, signed payload, fallback
format, pagination, response privacy headers, and print-audit behavior remain
unchanged.

## Reuse / Slop Audit

- Duplicated logic: none. Model flows through the existing committed-Machine and
  QR rendering path.
- Missed reuse: none. Existing PDF primitives, text wrapping, QR generation,
  pagination, signing, and service orchestration remain canonical.
- Style mismatches: none after formatting checks.
- Unnecessary complexity: none. Adaptive layout is renderer-local and directly
  protects the fixed label cell from long Machine identity values.
- Scope creep: none in implementation files.

## New Reusable Thing Created?

- No. The adaptive geometry is private presentation logic inside the existing
  QR renderer.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — no Reuse Map change; update current Intake
  presentation text to include model on the whole-Intake sheet.
- `DECISIONS.md` — yes; record the deliberate addition of model to visible
  private label text and the readable spacing rule.
- `PRODUCT.md` — no; the established QR workflow is unchanged.
- `AGENTS.md` — no.
- `ROADMAP.md` — no.
- `specs/index.md` — yes; mark this follow-up completed after deployment and
  production verification.
