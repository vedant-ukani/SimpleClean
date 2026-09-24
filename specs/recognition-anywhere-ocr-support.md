# recognition-anywhere-ocr-support — Verify OpenAI fields against all same-photo Google OCR

## Goal

Allow active photo Intake to accept OpenAI's semantic field assignment when the
returned value is supported anywhere in the bounded Google OCR for that same
photo, even when OpenAI cites the full-nameplate OCR block rather than a
field-sized OCR line. Keep Google OCR as the character evidence, OpenAI as the
field-labeling decision, and a person's **Add this Machine to Inventory** action
as the final creation boundary.

## Ticket Summary

- Change only the active `intake-nameplate-v2` deterministic verification path.
- A non-null OpenAI field still requires valid same-photo OCR references, but its
  support is evaluated against all bounded Google OCR text for that photo rather
  than only the exact cited line contents.
- Compare using the existing field-aware normalization rules. Harmless label,
  punctuation, case, spacing, voltage, phase, fuel, type, and explicit-capacity
  equivalents remain supported; do not introduce OCR character guessing.
- For manufacturer, model, and serial, accept the normalized OpenAI value when
  it occurs as a complete contiguous token sequence in normalized Google OCR for
  the same photo. A shorter value must not match inside a larger OCR token.
- A character sequence absent from that photo's Google OCR remains rejected as
  `unsupported_evidence`.
- Unsupported optional fields remain null and do not block Candidate readiness.
- Preserve the current requirement that manufacturer, model, and serial are all
  supported before a Candidate becomes ready.

## Expected Output

- A full-nameplate Google OCR block containing `MODEL NO. <value>` and
  `SERIAL NO. <value>` supports OpenAI's exact model and serial values.
- The previously observed Dexter pattern reaches Ready when its manufacturer,
  model, and serial are present in the Google OCR block.
- OpenAI cannot introduce a model or serial character absent from Google OCR.
- Same-photo isolation, evidence provenance, human approval, and provisional
  Machine creation remain unchanged.
- Retrying the three retained failed photos after deployment can create new runs
  under the corrected policy; no re-upload is required.

## Non-Goals

- Do not send images to OpenAI.
- Do not trust OpenAI values that are absent from Google OCR.
- Do not globally substitute confusable characters such as `O/0` or `I/1`.
- Do not make optional voltage, phase, fuel, or capacity failures block Intake.
- Do not alter duplicate-Machine behavior, verified identity claims, imports,
  QR labels, file storage, or the Intake UI.
- Do not replay or mutate historical Recognition Runs automatically.
- Do not persist raw provider payloads or complete OCR text beyond current
  bounded provenance behavior.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` / `evaluateNameplates` | Canonical active deterministic support and readiness decision. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` / `normalizeRecognitionValue`, `normalizedFieldValue`, `normalizedVoltage` | Existing reusable field-aware normalization; must remain canonical. |
| `apps/api/src/modules/inventory/intake/recognition/providers/google-vision.verifier.adapter.ts` / `normalizeGoogleResponse` | Supplies bounded same-photo word evidence plus a full-nameplate OCR block. Reference only. |
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | OpenAI assigns fields from bounded OCR and returns OCR line references. Reference only. |
| `apps/api/test/intake-recognition-policy.test.ts` | Correct deterministic seam for the regression and isolation tests. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` | Reuse the current normalizers to determine whether each OpenAI value is supported anywhere in the same photo's bounded OCR while retaining valid-reference checks and readiness rules. Keep the logic in a small named helper rather than duplicating comparisons. |
| `apps/api/test/intake-recognition-policy.test.ts` | Add deterministic full-nameplate-block coverage, absent-character rejection, same-photo isolation, optional-field behavior, and field-aware voltage/phase evidence coverage. Update obsolete exact-whole-line expectations. |
| `packages/config/src/environment.ts` | Advance the default active policy identifier to `intake-nameplate-policy-v3` so new provenance distinguishes this behavior. |
| `apps/api/src/modules/inventory/intake/recognition/evaluation.ts` | Keep the standalone evaluation fallback aligned with policy v3. |
| `.env.example` | Document policy v3 for new environments. |

## Files to Reference Only

| File | Why |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition/providers/google-vision.verifier.adapter.ts` | Confirms the full-nameplate OCR block and bounded word evidence already exist; no adapter change is required for the chosen policy. |
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | Confirms OpenAI already receives the entire bounded Google OCR set and supplies semantic values plus citations. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | Existing persistence and Candidate-ready behavior consume policy decisions without a new contract. |
| `apps/api/test/intake-recognition.integration.test.ts` | Existing active targeted recognition integration boundary must remain green. |

## Files Not to Touch

- `packages/database/**` — no schema or migration is required.
- `packages/contracts/**` — provider and Intake contracts remain compatible.
- `apps/web/**` — this is a server-side recognition policy correction.
- `apps/api/src/modules/imports/**` — spreadsheet matching is unrelated.
- QR, Files, Identity, Operations, and Inventory Machine creation modules.

## Codegraph Findings (live, this ticket)

- `evaluateNameplates` already builds `imageLines` from every bounded Google OCR
  entry belonging to the target photo.
- Current validation limits support to semantic-provided `ocrLineIds`; model and
  serial additionally require normalized equality with the complete cited text.
  A full-nameplate citation therefore fails even when it visibly contains the
  exact returned model and serial.
- Google Vision's adapter emits bounded word evidence and appends one bounded
  full-nameplate text entry. OpenAI can validly cite that broad entry.
- Candidate readiness is already based only on supported manufacturer, model,
  and serial. Optional field rejection is retained as provenance and does not
  add a blocking reason.
- Recognition persistence already records bounded verification data and requires
  no storage change.

## Reuse Audit

Reused:

- Existing `normalizeRecognitionValue`, `normalizedFieldValue`, voltage parser,
  explicit-capacity parser, critical-field list, same-photo filtering, and
  verification provenance.
- Existing deterministic policy test fixtures and active recognition integration
  tests.

New code justified because:

- One small policy-local helper is needed to express the newly accepted
  same-photo OCR support decision consistently across fields.

Do not duplicate:

- Provider parsing, label stripping, voltage normalization, enum aliases,
  capacity-unit enforcement, or Candidate readiness logic.

Escalated to human:

- None. The user explicitly chose OpenAI for semantic labeling and Google OCR
  presence for character verification.

## Implementation Plan

1. Add a policy-local support helper that receives the field, normalized OpenAI
   value, and every bounded OCR line for the same photo.
2. Retain valid and same-photo citation checks, but stop treating cited lines as
   the exclusive support corpus.
3. Accept manufacturer/model/serial when their normalized exact character
   sequence occurs anywhere in normalized same-photo OCR.
4. Reuse field-aware normalization for phase, fuel, Machine type, voltage, and
   explicit capacity equivalents across same-photo OCR evidence.
5. Preserve unsupported-field nulling, critical readiness, conflict checks, and
   bounded verification provenance.
6. Add the full-nameplate regression and negative isolation/character tests.
7. Advance the default, evaluation fallback, and example environment policy
   identifier to `intake-nameplate-policy-v3`; retain explicit historical test
   fixtures that intentionally assert v2 provenance.
8. Run focused policy and Intake recognition tests, then lint, typecheck, and
   build.

## Constraints

- Preserve unrelated dirty-worktree changes and all uploaded Intake evidence.
- Keep analysis within the Files-owned bounded private-evidence boundary.
- Never log image bytes, raw provider payloads, complete OCR text, filenames,
  serials, secrets, or sensitive prompts.
- Do not loosen photo ownership: OCR from another image can never support a
  field.
- Do not infer or repair characters absent from Google OCR.
- Keep active Recognition Runs immutable; the corrected rule applies to a new
  retry/run recorded under policy v3.
- Maintain API and database compatibility.

## Tests Required

- `npm test --workspace @simply-clean/api -- intake-recognition-policy.test.ts`
- `npm run test:integration --workspace @simply-clean/api -- intake-recognition.integration.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Done Criteria

- A broad same-photo Google OCR block supports exact OpenAI manufacturer, model,
  and serial substrings after existing normalization.
- A one-character OpenAI/Google model or serial difference remains rejected.
- A model such as `M1` does not match OCR containing only `M10`, and a serial
  does not match as a proper substring of a larger serial or part-number token.
- OCR from another photo cannot support the field.
- Optional field mismatches do not block an otherwise supported Candidate.
- Targeted recognition integration, lint, typecheck, and build pass.
- No new provider, persistence, schema, or UI path is introduced.
