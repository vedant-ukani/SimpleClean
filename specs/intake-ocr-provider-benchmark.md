# intake-ocr-provider-benchmark — Compare PaddleOCR and Google Vision on warehouse nameplates

Status: Completed. The INT-02 pilot recommendation is provisional because the
private manifest uses `agent-candidate-unreviewed` labels; human adjudication
and false-accept/recapture calibration remain deployment gates.

## Goal

Run a fair, repeatable OCR-only comparison of PaddleOCR and Google Cloud Vision against the same 92 Laundrorama machine-nameplate photos. Both providers must receive the exact same bounded, metadata-stripped JPEG derivative. The result must make provider selection depend on exact visible-field accuracy, unsafe misses, recapture rate, latency, and measured cost rather than generic vendor claims.

## Ticket Summary

- Install an isolated local PaddleOCR runtime suitable for this Apple M4 Mac and expose a loopback-only compatibility service for the existing `IntakeOcrVerifier` port.
- Add a Google Cloud Vision verifier adapter behind the same port and existing bounded-provider controls.
- Add an OCR-only evaluation command that reuses the Files-owned HEIC/JPEG preprocessing and scores target nameplate fields without invoking a semantic recognizer or the Intake confidence policy.
- Keep the 92 source HEIC files immutable. Put manifests, detailed OCR output, caches, virtual environments, and reports under ignored local-data paths.
- Support one photo per evaluation item so the corpus stays within configured batch limits.
- Write only aggregate, privacy-safe metrics to stdout. Detailed recognized text may be written only to an explicit ignored local path for adjudication.
- Run PaddleOCR and Google Vision over all 92 images when an explicit credential is configured; never copy or print that credential.

## Expected Output

- A local PaddleOCR virtual environment and loopback bridge that pass a real single-image smoke test.
- A provider-neutral Google Vision adapter selectable as an Intake OCR verifier.
- `npm run evaluate:ocr-verifiers` (or equivalently named documented command) supporting `paddleocr` and `google-vision`.
- A private 92-image local manifest/report area under `.local-data/ocr-benchmark/`.
- Aggregate reports with per-field exact match, overall exact match, unreadable/missing rate, latency totals/average/p95, request/image count, and supplied/measured cost metadata.
- Completed PaddleOCR and Google Vision results on all 92 photos, plus a provisional INT-02 pilot recommendation of Google Vision as primary and PaddleOCR as the self-hosted fallback. Accuracy remains provisional until the candidate labels are reviewed.

Measured pilot result using the same 1,000,000-pixel evaluator limit and the
same metadata-stripped JPEG derivatives: Google Vision matched 345/537 fields
(64.25%) with 40.1 seconds total latency; PaddleOCR matched 285/537 (53.07%)
with 543.8 seconds total latency. The private reports remain under
`.local-data/ocr-benchmark/`.

## Non-Goals

- Do not treat these candidate-label measurements as final accuracy or warehouse-ground-truth claims until image-level visible-field labels are reviewed. The provisional pilot configuration may still record Google Vision as primary.
- Do not use OCR output itself as unquestioned ground truth.
- Do not infer photo-to-Machine grouping from filenames or capture order.
- Do not fine-tune models, deploy production infrastructure, enable automatic Intake acceptance, or change confidence thresholds.
- Do not commit source photos, serial-number labels, raw OCR text, credentials, model caches, or virtual environments.
- Do not change Machine identity, Intake commit, Files authorization, PWA, database, or UI behavior.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition/evaluation.ts` | Canonical manifest loading, bounded image preprocessing, provider limits, safe aggregate reporting, and live-provider opt-in. |
| `apps/api/src/modules/files/content-policy.ts` | Canonical HEIC decoding, rotation, pixel limits, metadata stripping, and JPEG normalization. |
| `apps/api/src/modules/inventory/intake/recognition/recognition.ports.ts` | `IntakeOcrVerifier` contract both providers must implement. |
| `apps/api/src/modules/inventory/intake/recognition/providers/paddleocr.verifier.adapter.ts` | Existing bounded HTTP adapter and normalized OCR response contract. |
| `apps/api/src/modules/inventory/intake/recognition/providers/provider.http.ts` | Canonical timeout, byte/output limits, request body, and safe provider errors. |
| `apps/api/src/modules/inventory/intake/recognition/providers/provider.validation.ts` | Canonical runtime validation for normalized OCR lines. |
| `packages/config/src/environment.ts` | Sole provider selection/credential/endpoint configuration boundary. |
| `apps/api/test/recognition.providers.test.ts` | Existing mocked provider adapter contract tests. |
| `apps/api/test/recognition.evaluation.test.ts` | Existing deterministic evaluation metric tests. |
| `docs/intake-recognition-evaluation.md` | Existing live-provider safety and evaluation documentation. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition/evaluation.ts` or a focused sibling | Extract/reuse bounded analysis-image loading and add OCR-only manifest, observations, metrics, and runner without duplicating preprocessing. |
| `apps/api/src/ocr-verifier-evaluate.ts` | Add a narrow CLI with explicit live opt-in and optional ignored detailed-report path. |
| `apps/api/src/modules/inventory/intake/recognition/providers/google-vision.verifier.adapter.ts` | Map bounded JPEGs to Google Vision REST requests and normalize full text plus word-level text/confidence/boxes. |
| `apps/api/src/modules/inventory/intake/recognition/providers/index.ts` | Export the Google adapter. |
| `apps/api/src/modules/inventory/intake/recognition.service.ts` | Compose the Google adapter only when selected. |
| `packages/config/src/environment.ts` | Admit `google-vision`, require its credential when enabled, and preserve deployed HTTPS validation. |
| `.env.example` | Document Google Vision selection using the existing verifier endpoint/key settings without adding a second secret family. |
| `package.json` / `apps/api/package.json` | Add the evaluation command only where required. |
| `apps/api/test/recognition.providers.test.ts` | Mock Google success, malformed output, API error, timeout, and oversized output. |
| `apps/api/test/recognition.evaluation.test.ts` | Cover exact target-field scoring, missing/unreadable fields, latency, and privacy-safe output. |
| `packages/config/test/environment.test.ts` | Cover Google provider credential and deployed endpoint rules. |
| `docs/intake-recognition-evaluation.md` | Document setup, private outputs, commands, interpretation, and ground-truth limitations. |
| `tools/paddleocr-bridge/**` | Add the smallest loopback service and setup instructions needed to translate PaddleOCR output to the existing adapter contract. |

## Files to Reference Only

| File | Why |
|---|---|
| `specs/INT-02.md` | Provider boundaries, privacy constraints, and live-evaluation deployment gate. |
| `docs/adr/0006-supervised-replaceable-intake-recognition.md` | Accepted recognition architecture. |
| `source-materials/inventory/laundrorama-inventory-photos/**` | Immutable private evaluation inputs. |
| `source-materials/inventory/Inventory List.xlsx` | Possible human cross-check only; it has no image-to-row mapping. |

## Files Not to Touch

- Source photos, workbook, transcripts, or generated Deliverables.
- Contracts, database schema/migrations, Intake repositories/services other than provider composition, web UI, auth, QR, imports, or service-worker policy.
- Existing provider secrets or unrelated dirty-worktree files.

## Codegraph Findings (live, this ticket)

- The index is current with 199 files, 2,777 nodes, and 8,558 edges.
- `PaddleOcrVerifier` is used by the runtime composition and the existing evaluation harness; provider HTTP/validation helpers are reusable.
- The current evaluator always runs semantic recognition and confidence policy, so it cannot fairly isolate OCR performance.
- Google Vision is an allowed verifier provider through the validated configuration and provider-neutral adapter.
- The Files content policy already turns HEIC into bounded, rotated, metadata-stripped JPEG; provider-specific conversion would be duplicate and unfair.
- The 92 source photos total about 135 MiB and normalized output can exceed the 40 MiB batch limit; evaluate one image per item.

## Reuse Audit

Reused:

- Files image conversion, `IntakeOcrVerifier`, provider HTTP limits/errors, OCR result validation, environment configuration, opt-in live evaluation, and existing test patterns.

New code justified because:

- The Google Vision adapter, Apple-local Paddle compatibility service, and OCR-only target-field benchmark are implemented by this ticket.

Do not duplicate:

- HEIC/JPEG preprocessing, provider timeouts/size bounds, OCR schemas, environment parsing, or privacy-safe error mapping.

Escalated to human:

- Google Vision was evaluated with an explicit server-side credential and the same manifest/preprocessing constraint as PaddleOCR. Runtime credentials remain deployment-managed and must never enter source-controlled files.
- Image-level visible-field ground truth is absent. Agent-generated candidate labels must be reviewed before the final provider decision.

## Implementation Plan

1. Extract the bounded manifest-image loader into a reusable evaluation helper without changing its output.
2. Add deterministic OCR-only manifest/metric types and tests. Score normalized expected visible values against normalized OCR line text; report field-specific counts and difficult/unreadable items.
3. Implement and test `GoogleVisionOcrVerifier` using the existing provider port, request limits, abort timeout, response-size bound, safe errors, and normalized boxes.
4. Extend validated provider configuration and runtime/evaluation composition for `google-vision`.
5. Add a CLI that prints aggregate JSON and writes detailed private results only when an explicit ignored output path is given.
6. Add a loopback-only PaddleOCR bridge that accepts the existing `{model, images}` request, runs general PP-OCR, converts four-point polygons to axis-aligned pixel boxes, and returns normalized adapter-compatible results.
7. Create an isolated ignored Python environment, install a pinned compatible PaddlePaddle/PaddleOCR stack, and smoke-test one photo without changing source bytes.
8. Build a private 92-image manifest with stable UUIDs and one photo per item. Candidate labels may be bootstrapped from OCR but remain unverified until visually adjudicated.
9. Run PaddleOCR on all 92 images and save aggregate plus detailed ignored reports.
10. Run Google Vision on the same derivatives when an explicit credential is configured, produce the side-by-side comparison, and record any provisional pilot recommendation without weakening security.

## Constraints

- Bind the local bridge to `127.0.0.1`; do not expose it publicly.
- Preserve the source HEIC files byte-for-byte.
- Both providers receive identical normalized JPEG bytes from the canonical content policy.
- Never print credentials, image bytes, raw provider responses, filenames, or complete OCR text to stdout/application logs.
- Detailed local reports may contain filenames and OCR text only under `.local-data/ocr-benchmark/`, which is already ignored.
- Google requests require `--allow-live`; Paddle loopback also remains explicit rather than part of deterministic test gates.
- Provider errors must fail closed and identify only a safe error code.
- Google full-text output may support non-serial substring agreement; word-level output must remain available for exact serial agreement.

## Tests Required

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- Targeted provider, configuration, and evaluation tests.
- Real Paddle single-image smoke test, then 92-image run.
- Google 92-image run only after valid credentials are present.
- `git diff --check`

## Done Criteria

- PaddleOCR runs successfully on this Mac and processes all 92 immutable photos through the canonical JPEG preprocessing.
- Google Vision can be selected and evaluated through the same OCR contract with mocked tests passing.
- The evaluation reports exact target-field matches, misses, unreadable rate, latency, and cost without leaking private data to stdout.
- A private manifest and detailed Paddle report exist for all 92 images.
- The Google run is completed on the same corpus, with the pilot recommendation recorded as provisional because the candidate labels remain unreviewed.
- No final accuracy winner or automatic-acceptance threshold is declared until the image-level labels are reviewed and false-accept/recapture behavior is calibrated.
