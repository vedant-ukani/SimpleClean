# INT-03 — Nameplate recognition with Google Vision, OpenAI field assignment, and deterministic validation

## Status

Implemented and verified with live Google Vision + OpenAI requests. The live
upload-to-candidate path passes. Final Inventory creation remains blocked when
the nameplate does not explicitly supply the required Machine type or when no
active destination Location exists; the system does not invent either value.

## Problem

The intake workflow accepts one private equipment nameplate photo for one physical machine. The current recognition path depends on Gemini for semantic extraction and Google Cloud Vision for verification. In live testing, Google Vision successfully returned OCR while Gemini was rate-limited, leaving the intake batch without manufacturer, model, or serial fields.

Operators must not be forced into manual field entry. The system needs an automated path that can read a nameplate, assign text to the correct inventory fields, resolve common OCR ambiguity safely, and refuse to invent identity values when the evidence is insufficient.

## Product decision

Replace Gemini in this intake path with OpenAI for semantic field assignment. Keep Google Cloud Vision as the OCR source and use deterministic application rules as the independent verifier.

Do not add manufacturer-site or general web search. Do not infer missing identity data from public product catalogs. The OpenAI API key will be configured after implementation; deterministic tests must not require live provider credentials.

## User workflow

1. The operator uploads exactly one nameplate photo for one machine.
2. The application stores and displays the private photo without viewport overflow.
3. Google Cloud Vision performs document-text OCR and returns text plus spatial evidence.
4. The application converts the provider response into a bounded, provider-neutral OCR representation. Raw provider payloads and image bytes are not logged.
5. OpenAI receives the bounded private image evidence, compact OCR evidence, and a strict output schema.
6. OpenAI assigns supported values to manufacturer, model number, serial number, and equipment type. It must return `null` rather than guess and must identify the evidence supporting each populated field.
7. Deterministic rules verify the proposed identity and any character-level correction.
8. When verification succeeds, the UI displays a completed machine candidate and its evidence for the existing approval flow. The operator does not type the fields manually.
9. When identity remains ambiguous, the system requests a clearer nameplate photo. It does not create or mutate inventory from ambiguous evidence.

## Recognition output

The provider-neutral proposal must distinguish:

- Original OCR text.
- Proposed normalized value.
- Evidence references supporting each field.
- Character corrections such as `O` to `0` or `I` to `1`.
- Unresolved alternatives or ambiguity reasons.
- Validation outcome and safe retry/retake action.

At minimum, the candidate covers:

- Manufacturer.
- Model number.
- Serial number.
- Equipment type when supported; otherwise `null`.

## Deterministic validation requirements

- Preserve raw OCR separately from every normalized or resolved value.
- Never apply global character substitutions.
- Require proposed evidence to be traceable to bounded OCR or image evidence.
- Require model and serial values to be distinct.
- Reject electrical ratings, dates, and obvious labels as identity values.
- Remove labels and harmless spacing only through explicit normalization rules.
- Validate allowed character sets and plausible lengths without inventing a universal manufacturer format.
- Accept a character correction only when field context and independent evidence agree.
- Retain an audit-friendly record of each accepted character correction and its reason.
- Check serial uniqueness through the existing inventory-owned interface before approval or commit.
- Treat duplicate, conflicting, incomplete, or unresolved identity as non-committable.
- Never use provider-reported confidence as the sole acceptance criterion.

## OCR ambiguity handling

For confusable characters such as `O/0`, `I/1`, `S/5`, and `B/8`:

1. Preserve the original Google OCR symbol.
2. Allow the semantic provider to propose a correction from the high-resolution nameplate evidence.
3. Evaluate the proposal against field-level rules and any available independent OCR evidence.
4. Record the position, original character, proposed character, and reason.
5. Accept only one uniquely supported resolution.
6. If alternatives remain plausible, return an ambiguity result and request a clearer photo.

Image preprocessing or targeted re-OCR may be used only through bounded Files/recognition interfaces and must not overwrite the original evidence.

## Provider and privacy boundaries

- Keep Google Vision and OpenAI behind existing recognition ports and adapters.
- Provider SDKs must not enter controllers, repositories, React components, or domain services.
- Recognition may read only bounded private evidence through the Files-owned server interface.
- Enforce request timeouts, byte limits, output limits, and retry limits.
- Never log API keys, image bytes, raw OCR/provider payloads, full sensitive prompts, or complete provider responses.
- Persist only the minimum evidence and provenance required for review and audit.
- Provider failures remain retryable and must not delete the uploaded photo.
- The UI must state which OCR, semantic, verification, and policy versions produced a result.

## Failure behavior

- Missing OpenAI credentials: recognition reports a safe configuration failure without exposing secret details.
- Rate limiting, timeout, or temporary provider unavailability: use the existing bounded retry behavior, then present a retryable recognition state.
- Invalid provider schema: reject the result and retain the photo.
- OCR contains insufficient text: request a clearer nameplate photo.
- OpenAI returns unsupported or contradictory values: deterministic validation rejects the proposal.
- Duplicate serial: block candidate approval/commit through the inventory boundary.
- No recognition failure may create or update inventory automatically.

## UI requirements

- Keep the existing contained, responsive image preview.
- Replace Gemini provenance with OpenAI provenance when configured.
- Remove manual field-entry fallback from this recognition failure path.
- Clearly distinguish processing, ready, retryable failure, and clearer-photo-required states.
- When ready, show the proposed fields and concise evidence without exposing raw provider payloads.
- When characters were corrected, show an understandable evidence note rather than provider internals.

## Testing requirements

- Deterministic fake Google Vision and OpenAI adapters for unit, integration, and browser tests.
- Unit coverage for field assignment contracts, schema rejection, normalization, and ambiguity rules.
- Table-driven tests for common confusables and for cases that must remain unresolved.
- Integration coverage for OCR-to-semantic-to-validation orchestration, retries, provenance, duplicate serial blocking, and no inventory mutation on failure.
- Browser coverage for a successful upload-to-candidate journey and a clearer-photo-required journey at desktop and tablet sizes.
- Live-provider evaluation remains separate from deterministic product gates and runs only after the user configures the OpenAI key.
- Run the repository lint, typecheck, unit, integration, browser, and build commands appropriate to the touched scope.

## Acceptance criteria

- Gemini is not called by the nameplate intake path.
- Google Vision OCR output is transformed into bounded provider-neutral evidence.
- OpenAI maps supported nameplate evidence into a strict structured proposal.
- Deterministic validation independently accepts or rejects the proposal.
- Common OCR character corrections are never silently or globally substituted.
- Ambiguous identity requests a clearer photo and cannot create an inventory record.
- Successful recognition produces a reviewable candidate without manual typing.
- The existing explicit approval and audited Batch Commit boundary remains intact.
- All deterministic automated tests pass without real provider credentials.
- The application remains ready for a live end-to-end test after the OpenAI key is added.

## Non-goals

- Grouping multiple photographs or multiple machines.
- Recognizing full-machine photographs.
- Manufacturer-site or general internet search.
- Reconstructing missing serial numbers.
- Automatically committing inventory without the existing approval boundary.
- Replacing the Files ownership boundary or inventory ownership rules.
- Benchmarking or choosing a long-term provider based on one image.

## Deferred live verification

After implementation and after the user supplies the OpenAI API key:

1. Restart the application with the configured provider.
2. Upload a real HEIC/JPEG nameplate through the UI.
3. Confirm Google OCR, OpenAI assignment, deterministic validation, provenance, and candidate rendering.
4. Confirm the image remains within the viewport.
5. Confirm failure states retain the private photo and do not mutate inventory.
