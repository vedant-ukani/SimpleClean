# INT-02 implementation review

Date: 2026-09-22

## Outcome

INT-02 is implemented on top of the INT-01 Laundrorama Intake flow. A worker can dump private arrival/nameplate photos into an Intake batch. Recognition runs asynchronously, groups evidence, extracts Machine facts, verifies them through an independent text-reading adapter, and applies only policy-approved results. Uncertain evidence becomes a targeted recapture request; an operator can also choose an idempotent manual fallback. Machine creation still occurs only at the existing human Batch Commit boundary.

## Implemented boundaries

- Replaceable semantic and OCR adapters: OpenAI, Gemini, Google Vision, PaddleOCR, deterministic fake, and disabled/manual mode. Google Vision is the provisional INT-02 pilot primary OCR verifier; PaddleOCR remains the self-hosted fallback.
- Bounded, checksum-verified analysis images through the Files boundary; private originals remain private.
- Deterministic confidence policy with canonical Machine enum normalization, independent agreement, overlap detection, quality findings, and explicit rejection reasons.
- Durable, run-targeted Operations jobs; immutable retry history; ordered input fingerprints; stale-result rejection.
- Recognition groups, field evidence/provenance, recapture state, and same-batch database ownership guards.
- Automatic candidate application without overwriting worker edits or duplicating candidates on retry/recapture.
- Exact and likely identity protection, including concurrent cross-batch commit serialization.
- Automatic UI start/polling, exception-only recapture, retry, manual fallback, safe terminal refresh, and final Batch Commit.
- Offline-safe/manual INT-01 behavior remains available when recognition is disabled or unavailable.

## Review findings resolved

- Retry now creates a new immutable run and the UI sends the explicit retry command.
- Disabled mode no longer instantiates credential-dependent providers.
- Unsupported Machine type, phase, and fuel values cannot reach candidate persistence.
- All groups sharing an overlapping photo are rejected.
- HEIC analysis obeys the configured pixel bound.
- Deployed provider endpoints require HTTPS.
- Recapture requests enforce the caller's expected batch version.
- Exact-match field provenance and Operations/idempotency targets are internally consistent.
- Recognition child records cannot cross Intake batches or be reparented around committed immutability.
- The browser refreshes derived candidates before publishing a terminal recognition state.

## Verification

- Formatting, lint, workspace type checks, and production builds passed.
- Unit/component suites passed: Contracts 13, Config 12, Database 1, API 38, Web 81.
- Database integration passed: 3 passed, 1 optional PostgreSQL-wire test skipped.
- API integration passed: 34 tests, including recognition, immutable retries, manual-fallback replay, stale output, and concurrent cross-batch identity commit.
- Browser acceptance passed with the real deterministic recognition worker: 20 passed, 4 intentionally skipped, across desktop, tablet, and tablet landscape.
- `git diff --check` passed.

## Deployment gate

The live OCR comparison is complete on the shared 92-image manifest using the
one-megapixel evaluator constraint. Google Vision is the provisional pilot
primary; PaddleOCR remains the self-hosted fallback. The private candidate
labels are `agent-candidate-unreviewed`, so the measurements are not final
accuracy claims. Before production auto-approval, a person must review the
labels, thresholds must be calibrated from measured false-accept/recapture
results, deployed provider endpoints and secrets must be configured, and the
privacy/vendor review must complete. Recognition remains disabled by default in
source examples and the INT-01 manual path remains available.
