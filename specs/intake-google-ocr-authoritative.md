# intake-google-ocr-authoritative — Google OCR with Luna field assignment

## Goal

Make the active single-nameplate Intake path use Google Cloud Vision as the authoritative text reader and `gpt-6-luna` only as a bounded field mapper. A normal plate with supported manufacturer, model, and serial should become a ready Candidate automatically, without a Recapture Request. A person still reviews and explicitly selects **Add to Inventory**; recognition never creates a Machine by itself.

## Ticket Summary

- Preserve the current production order: Files-owned JPEG derivative → Google Vision OCR → OpenAI semantic assignment → deterministic policy → Candidate persistence.
- Stop sending image bytes to OpenAI. Luna receives only bounded Google OCR lines, stable line IDs, confidence, and boxes.
- Prompt Luna to copy exact visible values from the supplied OCR evidence and map them to `manufacturer`, `model`, `serial`, `machineType`, `voltage`, `phase`, `fuel`, and `capacityLb`.
- Keep `manufacturer`, `model`, and `serial` as the critical fields required for automatic readiness.
- Require every non-null field to cite valid OCR line IDs from the same photo. Reject invented line IDs and values unsupported by the cited Google text.
- Treat semantic and OCR confidence scores plus glare/blur/small-text findings as provenance and review information, not blockers, when the critical mapped values are supported by valid Google evidence.
- Do not create new Recapture Requests in the active targeted recognition path.
- If a provider fails, required Google text is missing, Luna returns malformed/unsupported evidence, or an exact duplicate identity exists, retain the photo and end in the existing `failed` state with a stable reason. Do not invent values and do not create a recapture row.
- Keep retry behavior for failed provider calls and failed recognition runs.
- Preserve worker-selected Machine type. Recognition must not overwrite it.
- Keep historical `needs_recapture` runs, recapture rows, contracts, and endpoints readable for compatibility.
- Keep the existing explicit human **Add to Inventory** action as the only Machine-creation boundary.
- Keep `gpt-6-luna` as the semantic model.

## Expected Output

- Uploading a valid nameplate starts Google OCR first.
- Luna receives compact OCR evidence but no image.
- Luna maps the Google text to machine fields using strict structured output.
- Supported manufacturer/model/serial values make the Candidate confirmed and the run `ready`, even when the providers report glare, small text, or lower confidence.
- The UI presents the ready Candidate for explicit **Add to Inventory** approval.
- New targeted runs never create a Recapture Request.
- Missing or unsupported critical data produces a visible failed/retry state without silently storing an invented identity.
- Existing historical recapture records remain viewable.

## Non-Goals

- No automatic Machine creation or bypass of the human Add-to-Inventory action.
- No weakening of exact duplicate identity protection.
- No public web/catalog lookup and no reconstruction of missing serial characters.
- No manual identity-field entry.
- No changes to private Files storage, HEIC conversion, checksums, or provider credential handling.
- No database migration solely to delete historical recapture states.
- No changes to unrelated Inventory, QR, import, production, sales, or fulfillment code.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.service.ts` / `handle()` | Already runs OCR first and passes stable OCR evidence to semantic assignment. |
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | Owns the Luna prompt, strict schema, bounded request, and current image attachment. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` / `evaluateNameplates()` | Owns evidence validation and currently converts confidence, quality, and character disagreement into recapture. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` / `applyTargeted()` | Applies accepted fields and currently inserts a recapture row for rejected targeted decisions. |
| `packages/contracts/src/intake-recognition.ts` | Defines stable recognition states, reasons, evidence, and provenance. |
| `apps/api/test/recognition.providers.test.ts` | Covers OpenAI payload/schema behavior. |
| `apps/api/test/intake-recognition-policy.test.ts` | Covers confidence, quality, OCR evidence, and confusable-character decisions. |
| `apps/api/test/intake-recognition.integration.test.ts` | Covers durable recognition, Candidate persistence, retry, and recapture behavior. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Already supports ready and failed item states plus explicit Add to Inventory. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | Send bounded OCR evidence only; remove `input_image`; strengthen exact-copy/mapping prompt; require OCR input for live OpenAI assignment. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` | Make valid same-photo OCR references and supported critical values decisive; keep confidence/quality as non-blocking provenance; remove recapture-oriented ambiguity rejection from active v2 decisions. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | For targeted rejected decisions, persist evidence and finish as `failed` with a stable reason; do not insert a recapture row. Preserve duplicate protection and accepted Candidate update. |
| `apps/api/src/modules/inventory/intake/recognition/evaluation.ts` | Make the full live evaluation path run OCR first and pass its result into semantic assignment; keep the OCR-only benchmark unchanged. |
| `apps/api/test/recognition.providers.test.ts` | Assert Luna receives OCR text/IDs but no image bytes or `input_image` part. |
| `apps/api/test/intake-recognition-policy.test.ts` | Replace recapture expectations with Google-authoritative mapping behavior, including the tested Dexter and Girbau strings. |
| `apps/api/test/intake-recognition.integration.test.ts` | Prove valid mapping reaches ready/confirmed with zero recaptures; prove missing/unsupported/duplicate cases fail without a recapture row. |
| `apps/api/test/recognition.evaluation.test.ts` | Prove the full evaluator passes OCR output into semantic assignment and remains compatible with OCR-authoritative adapters. |
| `apps/web/test/intake-ui.test.tsx` | Adjust only if active failed/ready presentation assertions depend on new recapture creation. |

## Files to Reference Only

| File | Why |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.service.ts` | The live sequence is already correct and should remain unchanged unless a failing test exposes a narrow need. |
| `apps/api/src/modules/inventory/intake/recognition.ports.ts` | Existing provider-neutral OCR/semantic signatures already carry OCR evidence. |
| `apps/api/src/modules/inventory/intake/recognition/providers/google-vision.verifier.adapter.ts` | Existing bounded Google OCR implementation remains authoritative. |
| `apps/api/src/modules/inventory/intake/recognition/providers/semantic-schema.ts` | Existing strict field/evidence schema should be reused. |
| `apps/api/src/modules/inventory/normalization.ts` | Canonical identity normalization remains unchanged. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | Existing explicit approval and Machine-creation boundary remains unchanged. |
| `docs/adr/0007-single-nameplate-automated-recognition.md` | Its recapture decision will be superseded after implementation passes review. |
| `docs/adr/0008-pipelined-individual-intake-commit.md` | Preserve per-item recognition and explicit individual commit. |

## Files Not to Touch

- Files storage adapters and private object access.
- Inventory identity matching or unique-claim rules.
- Database migrations/schema unless implementation proves the existing failed state cannot represent the outcome.
- Recognition credentials or API keys.
- Source images, benchmark labels, and generated artifacts.
- Unrelated web workspaces and modules.

## Codegraph Findings (live, this ticket)

- `IntakeRecognitionService.handle()` invokes Google OCR at line 244, then passes the OCR result to semantic recognition at line 245.
- `OpenAISemanticRecognizer.recognize()` includes bounded OCR JSON and also attaches each image at high detail; this is the source of avoidable visual contradiction and image-token cost.
- `DeterministicIntakeConfidencePolicy.evaluateNameplates()` requires configured confidence floors, blocks on quality findings, and rejects semantic/OCR differences as `ocr_disagreement` or `ambiguous_characters`.
- `IntakeRecognitionRepository.applyTargeted()` updates the existing Candidate and marks the run ready when accepted; otherwise it inserts `inventory_intake_recapture` and marks the run `needs_recapture`.
- The targeted Candidate already exists with the worker-selected Machine type, so accepted recognition only needs to update automatic plate fields.
- The existing `failed` state and stable reason codes can represent a non-recapture failure without a migration.
- Exact duplicate matching is enforced in Inventory immediately before Candidate update and must remain blocking.
- `gpt-6-luna` is already the validated default, adapter fallback, evaluation fallback, example configuration, and active local configuration.

## Reuse Audit

Reused:

- Files-owned bounded analysis preprocessing.
- Google Vision adapter and stable OCR line IDs.
- Existing OpenAI Responses API transport, strict JSON schema, timeout, and safe error handling.
- Existing field/evidence contracts and Inventory normalization.
- Existing Candidate update, duplicate locking, audit, outbox, and explicit individual commit.
- Existing failed/retry UI state.

New code justified because:

- The active semantic adapter still sends an image even though Google should be the sole text reader.
- The active policy still encodes the now-reversed recapture decision.
- The repository currently has no active rejected path that preserves evidence without creating a recapture.

Do not duplicate:

- OCR parsing/transport, provider HTTP handling, Machine identity matching, Candidate commit, or retry scheduling.

Escalated to human:

- None. The user explicitly selected Google-authoritative OCR, Luna field mapping, automatic recognition acceptance, and no recapture.

## Implementation Plan

1. Add provider tests proving the OpenAI request contains bounded OCR evidence and no image content.
2. Update the semantic prompt to map and copy only supplied Google OCR values; unsupported optional values remain null.
3. Update active v2 policy tests for low confidence, glare/small text, exact Google-supported values, and O/0 cases.
4. Simplify active v2 acceptance so valid OCR references and supported critical values determine readiness; retain malformed/reference/identity checks.
5. Change targeted rejected persistence to `failed` plus stable reason and zero new recapture rows.
6. Add integration coverage for ready Candidate persistence, no-recapture failure, duplicate protection, and retry behavior.
7. Sequence the full live evaluator as OCR → semantic and add a regression that proves OCR evidence is forwarded.
8. Run focused tests followed by workspace lint, typecheck, unit, integration, browser, and build gates.
9. Review the diff for privacy, identity, and approval invariants.
10. After review passes, add a superseding ADR and update durable product/architecture language to remove active recapture claims.

## Constraints

- Google OCR text is evidence; Luna maps it but may not invent or reconstruct characters.
- Non-null values must cite OCR evidence belonging to the same photo.
- Manufacturer, model, and serial are required for automatic readiness.
- Machine type remains worker-selected and cannot be overwritten.
- Exact duplicate identity must remain blocked.
- Historical recapture data remains immutable/readable.
- No secrets, image bytes, complete provider payloads, or complete prompts may enter logs or audit summaries.
- Preserve all unrelated working-tree changes.

## Tests Required

- `npx vitest run apps/api/test/recognition.providers.test.ts`
- `npx vitest run apps/api/test/intake-recognition-policy.test.ts`
- `npx vitest run apps/api/test/recognition.evaluation.test.ts`
- `npx vitest run apps/api/test/intake-recognition.integration.test.ts --no-file-parallelism --maxWorkers=1`
- `npx vitest run apps/web/test/intake-ui.test.tsx apps/web/test/intake-client.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- `git diff --check`

## Done Criteria

- A valid uploaded nameplate follows Google OCR → Luna mapping → ready Candidate.
- OpenAI receives no image bytes in this workflow.
- The Dexter values `DL2X30QA` and `1990300131068` are accepted when cited from Google OCR evidence.
- The Girbau Google value `EH020XA1321121011` is not replaced by Luna visual interpretation.
- Confidence and image-quality warnings do not block otherwise supported critical values.
- New targeted recognition never inserts a Recapture Request.
- Missing/unsupported critical data and exact duplicates do not silently enter Inventory.
- The worker still explicitly approves Add to Inventory.
- Focused and workspace verification passes without exposing credentials or provider payloads.
