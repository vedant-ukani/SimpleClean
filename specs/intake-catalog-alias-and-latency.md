# intake-catalog-alias-and-latency — Reliable manufacturer resolution and bounded recognition latency

## Goal

Ensure accepted manufacturer names printed on reviewed warehouse nameplates resolve to the correct canonical Catalog manufacturer, so known models receive specifications and unknown models can enter official-source discovery. Restore predictable Intake recognition latency after adding image-assisted field assignment by using the existing smaller private preview for OpenAI, enforcing one total timeout per provider request, and persisting privacy-safe per-stage attempt timings.

## Ticket Summary

- Add a new immutable Catalog delta for the manufacturer identities observed in the reviewed 92-nameplate benchmark.
- Resolve these reviewed labels uniquely:
  - 36 `THE DEXTER COMPANY`
  - 10 `DEXTER LAUNDRY, INC.`
  - 2 `THE DEXTER CO`
  - 44 `Continental Girbau, Inc.`
- Include punctuation variants required by the current live Intake values and the user-observed `THE DEXTER CO.` form.
- Preserve deterministic exact canonical/approved-alias matching. Do not add fuzzy, edit-distance, substring, or unreviewed corporate-parent matching.
- Merge additive manufacturer aliases across ordered immutable Catalog manifests while rejecting any alias claimed by two manufacturers.
- Keep the original 4000px bounded derivative for Google Vision OCR.
- Send OpenAI the already-created, private, metadata-stripped 2000px Intake preview instead of the 4000px OCR derivative.
- Change OpenAI image detail from `high` to `auto`; Google OCR remains authoritative for every returned character.
- Make the shared bounded JSON provider timeout cover the entire request, including response-body reading, rather than resetting the same timeout after response headers arrive.
- Record bounded stage timings and safe outcomes for every recognition attempt without persisting images, OCR text, prompts, provider payloads, serials, or credentials.
- Import the new alias delta into the local Catalog after tests so the current application can resolve the reviewed labels.

## Expected Output

- A new checksum-addressed manufacturer-alias Catalog delta is part of the canonical import sequence.
- All 92 reviewed nameplate manufacturer labels resolve uniquely to either `Dexter` or `Continental Girbau`.
- `THE DEXTER COMPANY` + `WCVD40KCS-12` resolves the already-approved Dexter revision without a web-search call.
- An unsupported Dexter model using any approved reviewed label passes manufacturer resolution and creates a Catalog discovery run under the existing official-host policy.
- Google Vision receives the high-resolution Files-owned analysis derivative; OpenAI receives the smaller Files-owned private preview plus the same bounded OCR evidence.
- Recognition provenance exposes aggregate preparation, OCR, semantic, and total milliseconds for each attempt, together with safe outcome/error codes and byte counts.
- A stalled provider cannot consume two timeout windows—one before headers and another while reading the body.
- Existing Intake UI and API response shapes remain backward compatible; the new provenance fields are optional additions.

## Non-Goals

- Do not infer arbitrary manufacturer aliases from spelling similarity or legal suffix stripping.
- Do not map ambiguous corporate parents such as Alliance Laundry Systems to a single equipment brand.
- Do not weaken model matching, official-host verification, documented-base-model rules, or Catalog publication policy.
- Do not make OpenAI authoritative for characters or allow images to repair OCR.
- Do not remove Google Vision, bypass the Files boundary, introduce public image URLs, or read object storage directly from recognition.
- Do not change Batch Commit, Machine identity, duplicate handling, worker-selected type, capacity evidence, or QR behavior.
- Do not add UI controls, database migrations, or a new background system.
- Do not use live-provider latency as a deterministic product gate.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `packages/contracts/src/catalog.ts` / `normalizeCatalogIdentity` | Canonical case/whitespace-preserving exact Catalog normalization; must not become fuzzy. |
| `apps/api/src/modules/catalog/catalog.repository.ts` / `importManifest`, `discoveryContext` | Imports approved aliases and requires an exact canonical/alias manufacturer before discovery. |
| `apps/api/src/modules/catalog/catalog.coverage.ts` / `composeCatalogManifests` | Canonical ordered snapshot composition currently rejects additive alias changes. |
| `apps/api/src/modules/catalog/catalog.service.ts` / `requestDiscovery` | Reuses exact approved revisions before starting official-source discovery. |
| `apps/api/src/modules/files/files.service.ts` / `getIntakeAnalysisImages` | Files-owned private evidence read and current 4000px OCR derivative. |
| `apps/api/src/modules/files/content-policy.ts` / `createIntakePreview` | Existing metadata-stripped 2000px private preview; reuse it for semantic input. |
| `apps/api/src/modules/inventory/intake/recognition.service.ts` / `handle` | Sequential preparation, Google OCR, OpenAI assignment, retry classification, and provenance persistence. |
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | Owns OpenAI image request and current `detail: "high"`. |
| `apps/api/src/platform/provider-http.ts` / `boundedJsonPost` | Shared provider-neutral timeout and bounded response reader. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | Fenced apply/requeue/fail writes and recognition provenance storage. |
| `packages/contracts/src/intake-recognition.ts` / `IntakeRecognitionProvenanceSchema` | Publicly validated safe recognition provenance. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/api/catalog-data/manufacturer-aliases.2026-09-24.json` (new) | Add only reviewed Dexter and Continental Girbau manufacturer aliases as an immutable, checksummed delta. Reuse unchanged canonical manufacturer IDs and approved official source identities; include no model revisions. |
| `apps/api/src/modules/catalog/catalog.coverage.ts` | Add the delta to `CANONICAL_CATALOG_DATASET_FILES`; merge non-conflicting additive aliases for the same canonical manufacturer; reject cross-manufacturer or canonical-name collisions. |
| `apps/api/test/catalog.coverage.test.ts` | Prove additive alias composition, checksum enforcement, collision rejection, and 92/92 reviewed-label coverage. |
| `apps/api/test/catalog.test.ts` | Prove reviewed Dexter and Continental nameplate values resolve through the composed manifests while unsupported/fuzzy values remain unsupported. |
| `apps/api/test/catalog.integration.test.ts` | Import the alias delta idempotently; prove known WCVD resolution skips discovery and an unknown approved-alias model reaches the fake discovery provider. |
| `docs/catalog/manufacturer-alias-review-2026-09-24.md` (new) | Record the non-sensitive reviewed label/count matrix, canonical mapping, exclusions, and verification command. Do not include serials or OCR payloads. |
| `docs/catalog/README.md` | Document the new canonical delta and explicit import order. |
| `apps/api/src/modules/files/files.repository.ts` | Return preview key, byte count, and checksum through the existing private analysis-evidence query. |
| `apps/api/src/modules/files/files.service.ts` | Add one Files-owned recognition-evidence read that returns the current OCR derivative and a validated semantic preview for the same photo/source checksum. Keep the existing analysis method for evaluation compatibility. |
| `apps/api/src/modules/files/content-policy.ts` | Add the minimal reusable validation/dimension helper needed to consume the stored metadata-stripped JPEG preview without re-encoding it. |
| `apps/api/src/modules/inventory/intake/recognition.service.ts` | Use OCR and semantic image profiles separately; measure stage durations; pass safe attempt metrics to fenced repository writes. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | Append bounded attempt metrics on success, retryable failure, and terminal failure without erasing prior attempts; retain worker-claim fencing. |
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | Send the semantic preview using `detail: "auto"`; retain OCR-backed prompt and strict output schema. |
| `apps/api/src/platform/provider-http.ts` | Enforce one total timeout around fetch plus bounded body reading and abort the request when that total budget expires. |
| `packages/contracts/src/intake-recognition.ts` | Add optional bounded recognition attempt metrics to provenance. |
| `packages/contracts/test/intake-recognition.test.ts` | Validate timing bounds, optional backward compatibility, attempt limits, and rejection of unsafe/unbounded values. |
| `apps/api/test/intake-files.test.ts` | Prove the semantic derivative is a valid bounded JPEG no larger than 2000px and remains tied to the original checksum. |
| `apps/api/test/recognition.providers.test.ts` | Assert OpenAI receives the smaller semantic image and `detail: "auto"`; add a response-body stall test proving a single total timeout. |
| `apps/api/test/intake-recognition.integration.test.ts` | Prove separate OCR/semantic image profiles, successful timing provenance, and preserved metrics across a retry without leaking evidence. |

## Files to Reference Only

| File | Why |
|---|---|
| `apps/api/catalog-data/official-models.2026-09-23.json` | Immutable canonical manufacturers, trusted official sources, and WCVD model revision. |
| `apps/api/catalog-data/spec-enrichment-dexter-continental.2026-09-23.json` | Existing later approved revisions; must continue composing after the alias delta. |
| `.local-data/ocr-benchmark/google-vision-detailed.json` | Local reviewed benchmark evidence used only to confirm aggregate manufacturer labels/counts; never imported or required by tests. |
| `docs/adr/0017-automatic-official-source-catalog-discovery.md` | Exact approved-alias and official-host publication requirements. |
| `docs/adr/0018-vision-assisted-intake-and-documented-base-models.md` | Image-layout use and OCR-character authority. |
| `apps/api/src/modules/operations/operations.worker.ts` | The 179-second deadline explains retry amplification; this ticket bounds provider work below it without changing generic outbox semantics. |
| `apps/api/src/modules/inventory/intake/recognition/providers/google-vision.verifier.adapter.ts` | Google keeps receiving the high-resolution analysis profile. |

## Files Not to Touch

- `apps/api/catalog-data/official-models.2026-09-23.json` and existing deltas — imported snapshots are immutable.
- `packages/database/drizzle/**` and `packages/database/src/schema.ts` — JSON provenance and existing File preview columns are sufficient.
- `apps/web/**` — no UI change is required.
- `source-materials/**` — immutable source evidence.
- Catalog discovery provider/policy files — source and model publication rules remain unchanged.
- Recognition policy — same-photo OCR support and explicit-unit capacity rules remain unchanged.
- `.env` and credentials — implementation must not alter secrets.

## Codegraph Findings (live, this ticket)

- The refreshed index contains 215 files, 3,286 nodes, and 11,020 edges before this ticket.
- `discoveryContext` has three Catalog callers; fixing imported aliases repairs existing-model enrichment and unknown-model discovery through one canonical boundary.
- `composeCatalogManifests` affects only coverage composition and its tests/scripts; runtime resolution remains repository-backed.
- `getIntakeAnalysisImages` has one production caller (`IntakeRecognitionService`) plus the evaluation seam, so a new dual-profile Files method can preserve benchmark compatibility.
- `OpenAISemanticRecognizer` is composed only by recognition service/evaluation and directly covered by provider tests.
- `boundedJsonPost` is shared by OCR, semantic recognition, and Catalog discovery. Its timeout correction must preserve each adapter's existing safe error taxonomy.
- `dispatchWithinLease` affects Operations plus recognition tests. No generic worker rewrite is required once each provider consumes one total timeout window and the two sequential provider budgets remain below the configured lease.
- The working tree contains extensive existing work. Agent B must touch only the files listed for this ticket and preserve all unrelated changes.

## Reuse Audit

Reused:

- Existing exact Catalog normalization, approved alias table, immutable snapshot import, trusted-host discovery context, checksum logic, and fake discovery provider.
- Existing 2000px private preview created at upload time; no second semantic image pipeline or public URL.
- Existing Files storage adapter and checksum/media agreement checks.
- Existing provider-neutral bounded HTTP transport and recognition provider error mapping.
- Existing recognition claim fencing, JSON provenance column, deterministic fake adapters, and integration harness.

New code justified because:

- The current manifest composer cannot safely express an additive alias-only delta for an existing canonical manufacturer.
- Recognition needs two image profiles from one Files-owned evidence read: a high-resolution OCR derivative and a smaller semantic derivative.
- Existing records cannot identify preparation, OCR, or OpenAI latency, so bounded per-attempt metrics are required.
- The shared HTTP helper currently restarts the timeout while reading the response body, allowing one provider request to consume approximately twice its configured budget.

Do not duplicate:

- Manufacturer normalization, model resolution, alias persistence, snapshot checksums, image decoding, provider error mapping, retry fencing, or timing schemas.

Escalated to human:

- None. The user explicitly requested reviewed nameplate aliases and the latency correction. Ambiguous or unreviewed manufacturer identities remain safely unresolved.

## Implementation Plan

1. Create red Catalog composition/resolution tests for the reviewed manufacturer matrix and collision cases.
2. Add the alias-only immutable delta, checksum it with `catalogManifestChecksum`, and include it in canonical import order.
3. Merge additive aliases only when the canonical manufacturer ID/name agree; reject any identity claimed elsewhere.
4. Add Catalog integration coverage proving WCVD exact reuse and fake discovery for an unknown Dexter variant.
5. Extend the Files analysis evidence query to validate and return both original and stored preview objects in one bounded method.
6. Keep Google on the 4000px analysis image; send OpenAI the validated 2000px preview at automatic detail.
7. Refactor `boundedJsonPost` so one abortable timeout wraps fetch and body consumption together.
8. Define bounded optional attempt metrics and append them through claim-fenced success/requeue/failure updates.
9. Add unit and integration regressions for derivative bounds, request shape, total timeout, retries, and non-sensitive metrics.
10. Run focused tests, then all workspace gates.
11. Import the new delta into the local Catalog using the existing import command, restart the application on port 3000, and verify the current Dexter WCVD candidates now show approved specifications.

## Constraints

- Preserve exact accepted manufacturer/model strings on Intake Candidates and Machines.
- Alias approval is explicit data, not a heuristic. Case normalization remains allowed; punctuation variants must be reviewed aliases.
- An alias must resolve to exactly one canonical manufacturer.
- Semantic preview and OCR derivative must share photo ID and original source checksum.
- Preview bytes remain private and are read only through Files operations.
- Google OCR remains authoritative for characters; OpenAI image use remains layout/label interpretation only.
- Timing metrics must use monotonic elapsed measurement, bounded non-negative integers, and safe codes only.
- Never log or persist image bytes, raw OCR, complete prompts/provider payloads, serials, tokens, filenames, or credentials in metrics.
- Preserve provider adapter error types and existing API compatibility.
- Follow `AGENTS.md`, including module ownership and reuse-vs-inline rules.

## Tests Required

- `npm test -w @simply-clean/contracts -- --run test/intake-recognition.test.ts test/catalog.test.ts`
- `npm test -w @simply-clean/api -- --run test/catalog.test.ts test/catalog.coverage.test.ts test/intake-files.test.ts test/recognition.providers.test.ts`
- `npm run test:integration -w @simply-clean/api -- --run test/catalog.integration.test.ts test/intake-recognition.integration.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`

## Done Criteria

- All 92 reviewed nameplate labels resolve uniquely through approved aliases; no fuzzy or ambiguous corporate-parent mapping is introduced.
- The original five Catalog datasets remain byte-for-byte unchanged; the alias delta validates and imports twice idempotently.
- Existing `WCVD40KCS-12` candidates using Dexter legal-name labels resolve approved specifications without OpenAI web search.
- An unsupported Dexter model using an approved reviewed label reaches the fake discovery provider and retains every ADR 0017/0018 gate.
- Google receives the OCR-sized derivative and OpenAI receives the private 2000px semantic preview with `detail: "auto"`.
- A response that stalls after headers times out within one configured provider window and aborts its reader.
- Success, retry, and failure paths retain bounded stage metrics for every attempt without sensitive evidence.
- Focused tests and all workspace gates pass.
- The local Catalog imports the alias delta and the application is running again on port 3000.
- No duplicate logic, schema migration, unsafe alias, unrelated refactor, or user-data loss is introduced.
