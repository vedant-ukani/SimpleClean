# Review: Google OCR-authoritative Intake assignment

Status: Pass

## Scope reviewed

- Google Vision execution before semantic field assignment.
- Removal of image content from the OpenAI request.
- Exact OCR-supported field mapping and same-photo evidence references.
- Candidate readiness without active targeted recapture.
- Failure, retry, duplicate, provenance, and explicit approval boundaries.

## Findings

No blocking findings.

The active provider sequence is Google OCR followed by OCR-only Luna field
assignment. The deterministic policy accepts only values supported by cited
same-photo OCR lines and still requires manufacturer, model, and serial. The
repository confirms accepted Candidates but does not create Machines; rejected
targeted decisions become failed without inserting a Recapture Request. Exact
duplicate protection and the explicit **Add to Inventory** transaction remain
unchanged.

## Live verification

The live Google Vision and `gpt-6-luna` path accepted all three supplied test
images with the expected identifiers:

- `IMG_6128`: model `DL2X30QA`, serial `1990300131068`.
- `IMG_6140`: model `WCVD25KCS-12`, serial `20410000474379`.
- `IMG_6184`: model `EH020XA1321121011`, serial `1443229G16`.

The fuel prompt was tightened after the third test so a steam-pressure rating is
not treated as the Machine's fuel source. The rerun returned `fuel: null`.

## Verification

- Workspace lint passed.
- Workspace typecheck passed.
- Unit suites passed: contracts 13, config 14, database 1, API 62, web 78.
- Integration suites passed: database 3 with 1 skipped; API 44.
- Browser acceptance passed: 19 with 2 skipped.
- Production build and whitespace validation passed.

## Reuse and slop audit

The change reuses the existing Files preprocessing, Google Vision adapter,
semantic schema, Inventory normalization and duplicate matching, Candidate
update transaction, retry machinery, and approval boundary. It adds no parallel
OCR transport, duplicate matcher, recapture system, or Machine-creation path.
The evaluator's injected adapters are a narrow ordering test seam rather than a
new product abstraction.
