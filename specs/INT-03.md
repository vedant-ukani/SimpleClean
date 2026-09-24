# INT-03 — Automated single-nameplate field assignment

## Goal

Replace the active Intake path's Gemini/mixed-photo behavior with automatic nameplate recognition for the real workflow: every private photo represents one physical Machine's nameplate. Google Vision supplies bounded OCR, OpenAI assigns visible text to structured fields, and deterministic rules independently decide whether the proposal is ready or needs a clearer photo. No manual field-entry fallback or internet/catalog search is introduced; one person still authorizes the existing atomic **Approve and Add to Inventory** action.

## Ticket Summary

- Treat each linked photo as one nameplate and one Candidate Machine; a batch may contain several nameplate photos, but photos are never grouped together.
- Run Google Vision OCR before semantic assignment and pass only bounded provider-neutral OCR lines plus the corresponding bounded JPEG evidence to OpenAI.
- Require strict OpenAI structured output for manufacturer, model, serial, machine type, voltage, phase, and fuel; unsupported fields are `null`.
- Reference real OCR lines/evidence boxes for each proposed field. OpenAI may not invent OCR evidence identifiers.
- Preserve raw OCR separately from normalized values and record every material character correction or ambiguity.
- Never globally replace `O/0`, `I/1`, `S/5`, `B/8`, or similar characters.
- Accept harmless normalization such as surrounding labels, spacing, punctuation, and case only through deterministic rules.
- Require model and serial to be distinct. Reject electrical ratings, dates, labels, and unsupported values as identity fields.
- For model/serial character disagreement, require one uniquely supported deterministic resolution; otherwise create a targeted Recapture Request.
- Keep Inventory-owned duplicate matching and the existing approval/Batch Commit boundary unchanged.
- Remove the recognition failure/manual-fallback action from the API and UI. Failure offers bounded retry; ambiguity offers recapture.
- Do not enable OpenAI web search or call manufacturer/public catalog sites.
- Keep live-provider testing deferred until the user supplies an OpenAI key.

## Expected Output

- Uploading one or more nameplate photos starts an OCR-first recognition run.
- Each photo produces at most one Candidate Machine draft and is never grouped with another photo.
- Recognition results show Google Vision and OpenAI provenance, proposed values, concise evidence, and any accepted character normalization.
- A valid result becomes ready for the existing final approval without manual typing.
- An ambiguous or unreadable result asks for a clearer nameplate photo and cannot create Inventory.
- A provider timeout/rate limit retains the photo and exposes retry only.
- Deterministic tests cover the complete pipeline without real provider credentials.

## Non-Goals

- No full-machine photo recognition or photo-to-Machine grouping.
- No manufacturer-site, catalog, or general web search.
- No serial reconstruction from public data.
- No automatic Inventory commit or identity verification.
- No provider key provisioning or live OpenAI gate in CI.
- No new image preprocessing/storage boundary; reuse Files.
- No new Inventory normalization, duplicate, or Machine-creation implementation.
- No migration of historical INT-02 recognition rows.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.service.ts` / `handle()` | Durable orchestration currently calls semantic recognition before OCR. |
| `apps/api/src/modules/inventory/intake/recognition.ports.ts` | Provider-neutral semantic, OCR, and deterministic-policy interfaces. |
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | Existing bounded OpenAI Responses API, image input, strict schema, timeout, and safe errors. |
| `apps/api/src/modules/inventory/intake/recognition/providers/google-vision.verifier.adapter.ts` | Existing bounded Google `document-text-detection` OCR adapter. |
| `apps/api/src/modules/inventory/intake/recognition/providers/{semantic-schema,provider.validation,fake.adapters}.ts` | Runtime/provider schema validation and deterministic test doubles. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` | Pure acceptance policy and canonical reuse of Inventory normalization. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | JSONB evidence/provenance persistence, recapture creation, and candidate application. |
| `packages/contracts/src/intake-recognition.ts` | Cross-boundary states, reasons, evidence, proposal, provenance, and command schemas. |
| `FilesService.getIntakeAnalysisImages()` | Canonical private HEIC/JPEG conversion, checksum, and bounded analysis-image seam. |
| `InventoryRepository` / `normalization.ts` | Canonical identity normalization, duplicate checks, and Machine creation. |
| `review-view.tsx` / `apps/web/src/lib/intake-client.ts` | Recognition state, polling, provenance, recapture, manual fallback, and approval UI. |

## Files to Modify

| File | Required change |
|---|---|
| `packages/contracts/src/intake-recognition.ts` | Add bounded OCR evidence references, character-resolution/ambiguity data, new stable reason codes, and a backward-readable `intake-nameplate-v2` schema version. Remove the manual-fallback command contract while retaining historical persisted `manual` states. |
| `apps/api/src/modules/inventory/intake/recognition.ports.ts` | Pass bounded OCR evidence into semantic assignment without exposing provider payloads. Preserve replaceable ports. |
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | Accept image plus compact OCR input, request exactly one assignment per photo, return strict evidence references, use the configured model, and provide no web-search tool. |
| `apps/api/src/modules/inventory/intake/recognition/providers/{semantic-schema,provider.validation}.ts` | Define and validate the v2 assignment/evidence shape and reject unknown/missing photo or OCR references. |
| `apps/api/src/modules/inventory/intake/recognition/providers/{fake.adapters,gemini.semantic.adapter}.ts` | Update the shared signature; fake supports deterministic v2 product tests, while Gemini remains compile-compatible but is not selected by INT-03. |
| `apps/api/src/modules/inventory/intake/recognition.service.ts` | Run OCR first, generate bounded stable line identifiers, then call OpenAI with OCR; use `intake-nameplate-v2`; remove the manual-fallback service path; preserve retries and privacy-safe errors. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` | Enforce one photo/one proposal, evidence ownership, critical-field rules, distinct model/serial, safe normalization, confusable-character ambiguity, and null-on-rejection behavior. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | Persist v2 evidence/corrections through existing JSONB, generate specific recapture instructions, and remove the callable manual-fallback mutation without changing historical schema. |
| `apps/api/src/modules/inventory/intake/intake.controller.ts` | Remove the recognition manual-fallback endpoint. |
| `apps/web/src/lib/intake-client.ts` | Remove the manual-fallback client and continue parsing shared status contracts. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Remove manual fallback controls/copy, present one nameplate result per photo, show evidence/corrections safely, and offer only retry or recapture for failure/ambiguity. |
| `.env.example` | Document the disabled-by-default OpenAI + Google Vision configuration without adding credentials. |
| Focused API/web/browser tests | Replace grouping/manual-fallback expectations with OCR-first single-nameplate success, ambiguity, retry, provenance, and no-Inventory-on-failure coverage. |

## Files to Reference Only

| File | Why |
|---|---|
| `apps/api/src/modules/files/files.service.ts` and content policy | Reuse private bounded analysis access; do not create another image path. |
| `apps/api/src/modules/inventory/normalization.ts` and Inventory repositories | Reuse identity decisions and duplicate protection. |
| `apps/api/src/modules/operations/**` | Reuse durable job leases/retry/idempotency unchanged. |
| `packages/database/drizzle/0009_intake_recognition.sql` and `0010_intake_recognition_integrity.sql` | Confirm existing JSONB/provenance and immutability can store v2; no migration expected. |
| `specs/INT-02.md`, `specs/intake-approve-add-inventory.md`, ADRs 0006–0007 | Preserve privacy, advisory recognition, and final approval invariants while applying the superseding workflow decision. |

## Files Not to Touch

- Files storage adapters, original source photos, HEIC ownership, or preview-grant security.
- Inventory identity claims, duplicate SQL, Machine creation, or Batch Commit semantics.
- Auth, QR, imports, production, sales, listings, payments, shipment, or unrelated PWA behavior.
- `.env`, credentials, private benchmark manifests, generated artifacts, `.codex-build/**`, or source spreadsheets.
- Google Vision request behavior except type adaptation required by the provider-neutral OCR contract.

## Codegraph Findings (live, this ticket)

- Current index: 184 files, 2,694 nodes, 8,429 edges; recognition, Files, Inventory, and UI symbols resolve.
- `OpenAISemanticRecognizer` already provides the Responses API, strict schema, image/media limits, timeout/error mapping, and request provenance.
- Its current `recognize(images)` input has no OCR and its prompt/schema still asks for mixed-photo grouping.
- `IntakeRecognitionService.handle()` currently calls OpenAI/Gemini before Google/Paddle OCR.
- Recognition groups/fields/verifications/provenance already persist as JSONB with committed-batch immutability, so v2 should not require a database migration.
- `DeterministicIntakeConfidencePolicy` already reuses `normalizeIdentityMatchValue`, but currently accepts grouping concepts and retains rejected values; INT-03 must produce null accepted output while preserving rejected evidence separately.
- Manual fallback currently exists in the shared contract, controller, service, repository, web client/view, and deterministic tests.
- Files, Operations, Inventory matching, and final approval boundaries already satisfy the required ownership model and must be reused unchanged.

## Reuse Audit

Reused:

- Files analysis images, Google OCR, OpenAI HTTP/schema/error infrastructure, Operations worker/retries, recognition JSONB/provenance, Inventory normalization/matching, Recapture Requests, UI polling, and final Batch Commit.

New code justified because:

- Existing contracts have no OCR line identifiers, semantic evidence references, character-resolution audit, or ambiguity representation.
- Existing policy models mixed-photo grouping rather than one-nameplate assignment.

Do not duplicate:

- OCR transport, image preprocessing, provider HTTP/error handling, identity normalization, duplicate checking, retry scheduling, candidate commit, or web route-state logic.

Escalated to human:

- None. The user explicitly selected Google Vision + OpenAI + deterministic rules, no web search, no manual field-entry fallback, and deferred live testing until the key is configured.

## Implementation Plan

1. Add failing contract and policy tests for v2 evidence, single-photo assignments, safe normalization, confusable characters, distinct model/serial, invalid references, and recapture outcomes.
2. Evolve the provider-neutral semantic input and strict OpenAI schema; reuse the existing bounded HTTP/image/error infrastructure.
3. Change orchestration to OCR-first, compact and bound OCR lines, invoke OpenAI, then evaluate the deterministic policy.
4. Map each input photo to exactly one decision and store accepted fields separately from rejected/ambiguous evidence using existing JSONB/provenance.
5. Remove callable manual fallback from API/client/UI while keeping historical states readable.
6. Update fake adapters and integration fixtures; prove retries retain photos and ambiguous evidence creates no Inventory mutation.
7. Update the UI to show automatic results, evidence/correction notes, retry, and targeted recapture without manual-entry copy.
8. Run targeted tests, full project gates, Code Architect review, and memory update. Do not run live providers until the user adds the key.

## Constraints

- Multiple photos may exist in one Intake Batch, but each photo is exactly one nameplate/Candidate and cannot share a recognition group.
- OpenAI receives only bounded Files-owned JPEGs and compact OCR evidence; no filenames, storage keys, public URLs, unrelated Load data, or search tools.
- Provider output must be runtime-validated before policy or persistence.
- Raw selected OCR evidence remains distinguishable from normalized/accepted values.
- Safe normalization may remove explicit labels, surrounding whitespace, separators, and case. It must not change an alphanumeric identity character silently.
- A model/serial confusable-character difference without independent deterministic support is `ambiguous_characters` and requires recapture.
- Rejected values remain evidence only and must not populate Candidate fields.
- Provider confidence may contribute to policy but never independently authorizes a field.
- Recognition remains advisory; only the existing human approval creates provisional Machines.
- No secrets, image bytes, full prompts, complete OCR text, or raw provider payloads enter logs, audit summaries, or outbox errors.

## Tests Required

- `npx vitest run apps/api/test/recognition.providers.test.ts`
- `npx vitest run apps/api/test/intake-recognition-policy.test.ts`
- Established focused integration run for `apps/api/test/intake-recognition.integration.test.ts`
- `npx vitest run apps/web/test/intake-ui.test.tsx apps/web/test/intake-client.test.ts`
- Established focused Playwright run for `tests/browser/intake.spec.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- `git diff --check`

## Done Criteria

- Google OCR runs before OpenAI and the OpenAI request contains bounded OCR evidence plus the private analysis image.
- Every nameplate photo produces no more than one Candidate proposal and no grouping decision is required from the worker.
- Valid manufacturer/model/serial values populate a ready Candidate without manual typing.
- Conflicting, unsupported, or ambiguous characters produce a specific Recapture Request and no accepted Candidate value.
- Recognition failure retains the photo and offers retry; no manual-fallback command or UI is available.
- OpenAI web search and public catalog lookup are absent.
- Final approval remains explicit, atomic, idempotent, audited, and the only path that creates Inventory.
- Targeted and full deterministic gates pass without live provider credentials.
- No duplicate Files, Inventory, Operations, or transport logic is introduced.
