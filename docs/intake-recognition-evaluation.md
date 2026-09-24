# Intake recognition evaluation

Provider evaluation is opt-in and separate from `npm test`. It reads a labeled JSON manifest and source photos, converts each source image to a bounded in-memory metadata-stripped JPEG, runs the configured OCR adapter first, passes that bounded OCR evidence to the semantic adapter, and prints aggregate JSON metrics. It never changes source photos or writes provider payloads.

Copy the example manifest and replace its paths and labels with a representative, permissioned set:

```sh
cp apps/api/evaluation/intake-recognition.manifest.example.json /tmp/intake-recognition.manifest.json
```

The manifest is version `1`. Each case contains `images` with a UUID `photoId`, a source `path`, an expected `groupKey`, and nullable expected visible fields. Optional `cost` metadata is copied into the aggregate report; no provider cost is inferred.

The safe local command uses the current `INTAKE_RECOGNITION_*` configuration names:

```sh
INTAKE_RECOGNITION_SEMANTIC_PROVIDER=fake \
INTAKE_RECOGNITION_VERIFIER_PROVIDER=fake \
npm run evaluate:intake-recognition -- --manifest apps/api/evaluation/intake-recognition.manifest.example.json
```

`fake` adapters are deterministic and intended for wiring/fixture checks. The default provider mode is `disabled`, and omitted confidence floors keep automatic acceptance disabled. To evaluate a live provider, configure its endpoint/model/credential in an ignored `.env`, then explicitly add `--allow-live`:

```sh
INTAKE_RECOGNITION_SEMANTIC_PROVIDER=openai \
INTAKE_RECOGNITION_SEMANTIC_API_KEY=... \
INTAKE_RECOGNITION_VERIFIER_PROVIDER=paddleocr \
INTAKE_RECOGNITION_VERIFIER_ENDPOINT=https://ocr.example.internal/recognize \
npm run evaluate:intake-recognition -- --allow-live --manifest /path/to/manifest.json
```

The report includes exact field-match rate, false auto-accept count, grouping purity, recapture rate, total/average/p95 latency, and supplied cost metadata. A provider timeout, malformed/oversized response, missing credential, or missing bounded image fails the evaluation with a short safe error; credentials, image bytes, filenames, complete prompts, and raw provider responses are never printed.

## OCR verifier benchmark

The OCR-only benchmark evaluates one source photo per manifest case. It uses
the same Files-owned HEIC/JPEG conversion as Intake recognition and never runs
semantic recognition or the Intake confidence policy. The benchmark command
requires an explicit provider and `--allow-live`:

```sh
npm run evaluate:ocr-verifiers -- \
  --provider paddleocr \
  --allow-live \
  --manifest .local-data/ocr-benchmark/manifest.json \
  --detailed-output .local-data/ocr-benchmark/paddleocr-detailed.json
```

For the real one-photo smoke check, add `--require-lines`; the command fails
if the provider returns no non-empty OCR line. For a comparable live run on
the current corpus, set `INTAKE_RECOGNITION_MAX_PIXELS=1000000`. This is a
common evaluator preprocessing limit: both PaddleOCR and Google Vision must
receive the resulting identical metadata-stripped JPEG bytes.

Google Vision uses the existing verifier endpoint and API-key settings. Set
`INTAKE_RECOGNITION_VERIFIER_PROVIDER=google-vision`,
`INTAKE_RECOGNITION_VERIFIER_ENDPOINT`, and
`INTAKE_RECOGNITION_VERIFIER_API_KEY` in an ignored environment, then run:

```sh
INTAKE_RECOGNITION_MAX_PIXELS=1000000 \
INTAKE_RECOGNITION_VERIFIER_MODEL=document-text-detection \
npm run evaluate:ocr-verifiers -- \
  --provider google-vision \
  --allow-live \
  --manifest .local-data/ocr-benchmark/manifest.json \
  --detailed-output .local-data/ocr-benchmark/google-vision-detailed.json
```

Use the same `INTAKE_RECOGNITION_MAX_PIXELS=1000000` setting for the Google
run; do not compare it with a run using another derivative size.

For the INT-02 pilot, the provisional operational selection is Google Vision
with model `document-text-detection`; PaddleOCR remains the self-hosted
fallback. The validated deployment configuration must set
`INTAKE_RECOGNITION_ENABLED=true`, the selected semantic provider, the Google
Vision endpoint (`https://vision.googleapis.com/v1/images:annotate`), and the
API key through the deployment secret manager. Keep the source example
disabled and do not write credentials there. The benchmark/pilot explicitly
sets the one-megapixel limit; the general configuration default remains
unchanged.

Aggregate JSON on stdout contains field-level and overall exact matches,
missing/unreadable counts, request/image counts, total/average/p95 latency,
and supplied cost metadata. Recognized text and filenames are written only
when `--detailed-output` names a private ignored path. No winner should be
declared until visible-field labels for each image have been reviewed; the
inventory workbook and filenames do not establish image-to-machine ground
truth.

The current private manifest uses candidate labels merged from
`labels-a.candidate.json` and `labels-b.candidate.json`. Their status is
recorded in `.local-data/ocr-benchmark/labels.metadata.json` as
`agent-candidate-unreviewed`; these labels are evaluation scaffolding, not
adjudicated ground truth. The current private reports are
`google-vision-report.json`, `google-vision-detailed.json`,
`paddleocr-report-v2.json`, and `paddleocr-detailed-v2.json`. The measured
Google-primary/Paddle-fallback recommendation is provisional until a person
reviews the labels and false-accept/recapture behavior is calibrated.

For the local PaddleOCR path, install and run the loopback bridge described in
`tools/paddleocr-bridge/README.md`, then set the verifier endpoint to
`http://127.0.0.1:8765/recognize`; this HTTP loopback endpoint is local-only.
Any deployed PaddleOCR fallback must use an approved HTTPS internal endpoint,
because staging and production reject non-HTTPS provider endpoints. Provider
selection remains replaceable and provider failure still leaves the INT-01
manual Intake path available.
