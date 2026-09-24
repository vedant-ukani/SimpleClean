# vision-assisted-intake-and-base-model-discovery — Image-aware nameplate mapping and official base-model specifications

## Goal

Make Intake recognition robust when a nameplate's printed `MODEL` or `SERIAL` label is damaged, missed by OCR, or outside the camera frame, while keeping Google OCR authoritative for the exact characters. Let automatic Catalog discovery use official specifications published under a deterministic leading base model such as `EH020` for a full nameplate model such as `EH020XA1321121011`, without overwriting the full model recorded on the Machine.

## Ticket Summary

- Send each bounded, metadata-stripped Intake JPEG to the OpenAI semantic adapter together with the existing bounded Google OCR lines and boxes.
- Let OpenAI use image layout to decide which OCR-supported row is manufacturer, model, serial, capacity, voltage, phase, fuel, or type even when a printed field label is cropped or OCR misses it.
- Keep the deterministic Confidence Policy authoritative: manufacturer, model, and serial characters must still exist as complete contiguous token sequences in same-photo Google OCR; image interpretation cannot repair or invent characters.
- Keep capacity optional and accept it only with explicit `lb`/`lbs`/`pound(s)` or `kg`/`kilogram(s)` evidence. A bare `60` must not become capacity.
- Permit Catalog discovery to return an officially documented leading base model for a longer accepted nameplate model.
- Deterministically accept that relationship only when the normalized documented model is either equal to the accepted model or is an anchored leading prefix, is at least four characters, contains both a letter and a digit, and has exact official evidence on an already trusted manufacturer hostname.
- Preserve the accepted full nameplate model as the Catalog variant used for Machine resolution. Store/use the documented base model as the Catalog family and as the official model evidence value.
- Keep all other Catalog publication gates: provider-returned HTTPS URL, trusted official hostname, nonempty locator, equipment-class evidence, deterministic units/conversions, and conflict rejection.
- Bump recognition/catalog prompt-policy version defaults needed for honest provenance and discovery deduplication. Do not change the discovery JSON schema version unless its wire shape changes.

## Expected Output

- A production OpenAI Intake request contains bounded `input_image` parts at high detail plus the existing OCR evidence.
- A nameplate with unlabeled but readable stacked model/serial rows can become ready when OpenAI maps them and Google OCR contains the exact characters.
- An OpenAI proposal of bare `60` as capacity remains rejected while visible `20 LBS` can be accepted.
- `Continental Girbau` model `EH020XA1321121011` can publish verified EH020 dimensions/weight from trusted official EH020 evidence, while the Machine/Catalog variant remains `EH020XA1321121011`.
- Unrelated, substring-only, too-short, untrusted, non-returned, HTTP, family-only-without-exact-documented-model, conflicting, or malformed Catalog facts remain rejected.
- Deterministic tests cover request shape, label-independent mapping support, explicit-unit capacity, base-model acceptance, false-positive rejection, and publication persistence.

## Non-Goals

- Do not remove Google Vision or make OpenAI's visual character reading authoritative.
- Do not use web search to repair nameplate identity.
- Do not accept fuzzy/edit-distance/contains matching for Catalog models.
- Do not change Machine identity, Batch Commit, duplicate handling, or worker type-selection rules.
- Do not add UI controls, approval queues, database migrations, or manual identity entry.
- Do not expose private image URLs or log image bytes, OCR payloads, prompts, serials, credentials, or provider responses.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` / `OpenAISemanticRecognizer` | Owns the current OCR-only OpenAI request and strict semantic prompt. |
| `apps/api/src/modules/inventory/intake/recognition/providers/provider.http.ts` / `imageParts` | Existing bounded JPEG-to-base64 helper and provider limits. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` / `hasSamePhotoOcrSupport` | Canonical exact same-photo character gate and explicit-unit capacity normalization. |
| `apps/api/src/modules/catalog/discovery/openai-catalog-discovery.adapter.ts` | Owns the web-search prompt and strict discovery response. |
| `apps/api/src/modules/catalog/discovery/catalog-discovery.policy.ts` / `verifyCatalogDiscovery` | Canonical deterministic publication gate. |
| `apps/api/src/modules/catalog/catalog.repository.ts` / `publishDiscovery` | Persists the Catalog family, full variant, immutable revision, and evidence. |
| `packages/contracts/src/catalog.ts` | Owns provider/result contracts and Catalog normalization. |
| `packages/config/src/environment.ts` | Owns recognition and discovery version defaults. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | Add bounded high-detail JPEG inputs paired with OCR; revise prompt so image supplies layout/label semantics only and exact field characters remain OCR-backed. |
| `apps/api/test/recognition.providers.test.ts` | Assert image request shape, bounded data URI, layout-aware prompt, OCR requirement, and no sensitive metadata. |
| `apps/api/test/intake-recognition-policy.test.ts` | Add/retain regressions proving unlabeled model/serial tokens can pass exact same-photo support and bare-number capacity cannot. |
| `apps/api/src/modules/catalog/discovery/openai-catalog-discovery.adapter.ts` | Ask for the exact officially documented model or deterministic leading base model, with `exactModelPresent` referring to the returned documented model. |
| `apps/api/src/modules/catalog/discovery/catalog-discovery.policy.ts` | Add one named deterministic documented-model relationship check; return both full accepted variant model and documented family model. |
| `apps/api/src/modules/catalog/catalog.repository.ts` | Persist documented model as family name while preserving the accepted full model as variant model/normalized identity. |
| `apps/api/test/catalog.discovery.test.ts` | Cover EH020-style acceptance and false-positive rejection while preserving every official-source gate. |
| `apps/api/test/catalog.integration.test.ts` | Prove publication stores the base family and full variant with official evidence. |
| `packages/config/src/environment.ts` | Bump default recognition/catalog prompt-policy versions without changing pricing. |
| `packages/config/test/environment.test.ts` | Assert new version defaults. |
| `.env.example` | Document new non-secret version defaults. |

## Files to Reference Only

| File | Why |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition/providers/semantic-schema.ts` | Existing semantic wire schema should remain unchanged. |
| `apps/api/src/modules/inventory/intake/recognition/recognition.ports.ts` | Existing `IntakeAnalysisImage` port already carries bounded JPEG bytes. |
| `apps/api/src/modules/files/content-policy.ts` | Files already creates metadata-stripped bounded JPEG analysis derivatives. |
| `docs/adr/0014-openai-field-assignment-with-same-photo-ocr-presence.md` | Character authority and support invariants remain active. |
| `docs/adr/0017-automatic-official-source-catalog-discovery.md` | Most automatic-publication gates remain active; durable docs are updated only after review. |

## Files Not to Touch

- `packages/database/drizzle/**` and `packages/database/src/schema.ts` — no schema change is required.
- `apps/web/**` — no UI behavior is requested.
- `.env` — contains local credentials; the architect will update only the local non-secret version values after review if needed.
- `source-materials/**` — immutable source evidence.

## Codegraph Findings (live, this ticket)

- `OpenAISemanticRecognizer` has six production callers through recognition service/evaluation composition and direct coverage in `recognition.providers.test.ts`.
- `imageParts` is the existing provider-neutral base64 helper already used by the Gemini semantic adapter; reuse it rather than duplicating encoding.
- `verifyCatalogDiscovery` has three service callers and policy coverage in `catalog.discovery.test.ts`.
- `publishDiscovery` currently uses `verified.model` for both family and variant, so it must separate documented family from accepted full variant without a migration.
- The index is current: 215 files, 3,286 nodes, and 11,020 edges before this ticket.

## Reuse Audit

Reused:

- Files-owned JPEG preprocessing and recognition provider limits.
- `imageParts` for bounded image encoding.
- Existing OpenAI bounded transport and strict JSON schema.
- Inventory's same-photo OCR character policy and explicit-unit capacity parser.
- Catalog identity normalization, trusted-source gate, deterministic unit conversion, immutable discovery publication, and dedupe/version configuration.

New code justified because:

- Catalog needs one explicit, tested business decision for accepted full-model to documented leading-base-model matching.
- Verified discovery must carry the documented family separately from the accepted full variant; the current type conflates them.

Do not duplicate:

- Image preprocessing, identity normalization, URL/hostname trust checks, unit conversion, source parsing, or database identity rules.

Escalated to human:

- None. The user explicitly approved image input and relaxed base-model matching using the observed EH020 case.

## Implementation Plan

1. Add red provider tests asserting OpenAI receives high-detail JPEG image parts and OCR in the same request, and revise the semantic prompt expectations.
2. Reuse `imageParts` in `OpenAISemanticRecognizer`; pair images with identifiers without public URLs or metadata and keep strict OCR citations.
3. Add/confirm policy regressions for unlabeled same-photo identity tokens and explicit-unit capacity rejection.
4. Add red Catalog policy tests for exact models, anchored documented prefixes, EH020, and rejected unrelated/substring/too-short candidates.
5. Revise the Catalog prompt and verification result so the full accepted model and documented family are distinct.
6. Persist the documented family with the full accepted variant and official model evidence; add an integration assertion.
7. Bump prompt/policy version defaults and tests so old `no_result` dedupe records do not suppress the new behavior.
8. Run targeted tests, then workspace lint, typecheck, unit tests, integration tests, and build.

## Constraints

- Preserve existing API contracts unless the internal verified-discovery type must gain the documented family.
- Follow `AGENTS.md`, including provider ports/adapters and domain ownership.
- Google OCR remains the authority for exact manufacturer/model/serial characters.
- Image interpretation may assign meaning and layout only; it cannot make absent characters pass deterministic policy.
- Capacity must retain explicit unit evidence.
- Keep changes scoped and do not clean or overwrite unrelated dirty-worktree changes.
- Do not log secrets, tokens, PII, image bytes, raw OCR/provider payloads, complete prompts, or serial numbers.

## Tests Required

- `npm --workspace @simply-clean/api test -- --run recognition.providers.test.ts intake-recognition-policy.test.ts catalog.discovery.test.ts`
- `npm run test:integration -- --run catalog.integration.test.ts intake-recognition.integration.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run build`

## Done Criteria

- The OpenAI recognition adapter sends one bounded high-detail image per Intake photo plus bounded OCR evidence.
- Exact OCR-backed model and serial rows can be assigned without readable labels; invented or mismatching characters still fail.
- Bare-number capacity remains null/rejected and does not block otherwise valid identity.
- Trusted official EH020 evidence can enrich full model `EH020XA1321121011`, preserving that full variant identity and publishing EH020 as its documented family.
- Existing source, URL, locator, equipment-class, conflict, and unit gates still reject unsafe results.
- Versioned dedupe permits a new discovery attempt after deployment.
- Targeted and full verification commands pass with no unrelated changes overwritten.
