# intake-ocr-provider-benchmark Review

## Status

Pass — implementation and both live runs complete; Google Vision is the provisional INT-02 pilot primary and PaddleOCR remains the self-hosted fallback

## Checks Run

- `npm run typecheck` — pass (Agent B)
- API recognition tests — 40 passed (Agent B)
- Config tests — 13 passed (Agent B)
- `npm run lint` — pass (Agent B)
- `git diff --check` — pass (Agent B)
- Corrected real Paddle smoke run — pass, 20 non-empty OCR lines
- Corrected real 92-image Paddle run — pass, all 92 observations contained OCR lines
- Google Vision smoke run — pass, non-empty OCR lines
- Google Vision 92-image run — pass, 92 requests; 91 images returned non-empty OCR lines, with one deterministic empty OCR response
- Independent root typecheck — pass
- Independent root API suite — 11 files / 40 tests passed

## Findings

No remaining implementation findings. The initial invalid Paddle run was rejected and every required fix was verified:

1. PaddleOCR 3.x nested results are unwrapped, and the smoke command requires non-empty OCR lines.
2. Provider-specific resizing was removed. The corrected Paddle run used the evaluator's common `INTAKE_RECOGNITION_MAX_PIXELS=1000000`; Google must use the same value.
3. Benchmark matching reuses the production agreement helper: serial is exact normalized equality; other fields use normalized containment.
4. Both private 46-image label files were merged into the ignored manifest, with provenance marked `agent-candidate-unreviewed`.

Corrected Paddle result: 92/92 images returned text, 3–56 lines per image, 285/537 candidate fields matched (53.07%), 64/90 serials matched (71.11%), average latency 5,910.5 ms, p95 7,051.6 ms. These accuracy figures remain provisional until a person reviews the candidate labels.

Google Vision result on the same manifest and one-megapixel evaluator limit:
345/537 candidate fields matched (64.25%), 76/90 serials matched (84.44%),
average latency 436.2 ms, and p95 549.8 ms. The aggregate and detailed reports
are private under `.local-data/ocr-benchmark/`. The comparison supports a
provisional pilot recommendation only because the labels are
`agent-candidate-unreviewed`.

## Reuse / Slop Audit

- Duplicated logic: no material duplication; the evaluator reuses Files conversion and provider bounds.
- Missed reuse: resolved; the evaluator imports the production agreement helper.
- Style mismatches: none material.
- Unnecessary complexity: duplicate alias fields (`cases`/`requests`, `images`/`imageCount`) are tolerable for compatibility but should not expand further.

## New Reusable Thing Created?

- Yes — `GoogleVisionOcrVerifier` at `apps/api/src/modules/inventory/intake/recognition/providers/google-vision.verifier.adapter.ts`, plus the OCR-only evaluator. Both are recorded in the Reuse Map.

## Required Fixes

None for the implementation. External completion steps:

1. Have a person review the private candidate labels before treating accuracy as final.
2. Calibrate false-accept and recapture thresholds against the reviewed labels before enabling automatic acceptance.
3. Complete the deployment privacy/vendor review and keep the explicit Google primary/PaddleOCR fallback configuration documented.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — completed: Google Vision adapter and OCR-only live evaluation seam recorded.
- `DECISIONS.md` — completed: provisional Google Vision primary/PaddleOCR fallback decision recorded with the candidate-label caveat.
- `PRODUCT.md` — no.
- `AGENTS.md` — no.
- `ROADMAP.md` — no; INT-02 is already listed as completed.
