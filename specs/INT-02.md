# INT-02 — Automatic Intake recognition and targeted recapture

Status: Implemented and verified on 2026-09-22. Google Vision is the provisional primary OCR verifier for the INT-02 pilot, with PaddleOCR retained as the self-hosted fallback. The live comparison used candidate labels and therefore remains provisional pending human label review, false-accept/recapture calibration, and privacy/vendor review.

## Goal

Let Laundrorama staff upload a Load's photos as one dump and receive automatically grouped Candidate Machines with verified visible nameplate facts. Reliable results require no photo-by-photo grouping or field-by-field approval; uncertain evidence produces a specific Recapture Request. Recognition remains advisory and replaceable, while one person still authorizes the existing atomic Batch Commit.

## Ticket Summary

- Start recognition automatically after a selected upload set is fully linked; also expose an idempotent retry action.
- Analyze bounded private Intake Evidence asynchronously. Never send public URLs, browser grants, storage keys, filenames, or unrelated Load data to a provider.
- Propose Machine groups and visible `machineType`, `manufacturer`, `model`, `serial`, `voltage`, `phase`, and `fuel` facts.
- Verify semantic extraction with an independent OCR result, evidence location, image-quality result, cross-photo agreement where available, deterministic normalization, and current Inventory matching.
- Apply only proposals accepted by a versioned Confidence Policy. Persist why each group/field was accepted, rejected, or sent to recapture.
- Auto-create/update Candidate drafts, assign photos, and mark exception-free accepted candidates ready without per-field confirmation. Never overwrite worker edits or results produced from a stale photo set.
- Create targeted Recapture Requests for blur, glare, cutoff, small/unreadable text, missing critical plate facts, conflicting reads, or ambiguous grouping.
- Let a recapture upload reference its request and re-run recognition. Permit an attributable manual fallback when recognition is disabled, unavailable, or cannot resolve real evidence.
- Keep exact duplicate identity blocking, warning acknowledgement, destination selection, and one irreversible human Batch Commit.
- Keep live-provider evaluation separate from deterministic product gates.

## Expected Output

- `specs/INT-02.md` and the durable ADR/Reuse Map updates describing supervised replaceable recognition.
- Intake recognition contracts, PostgreSQL evidence/provenance tables, provider ports/adapters, deterministic policy, durable job handler, API commands, and private Files analysis seam.
- Configurable OpenAI semantic adapter (initial production model `gpt-6-astra`), Gemini semantic challenger adapter, Google Vision `document-text-detection` provisional pilot verifier, and PaddleOCR self-hosted fallback adapter. Model IDs, endpoints, credentials, timeouts, limits, and policy version come only from validated configuration.
- A disabled/manual mode and deterministic fake adapters. Missing provider configuration must never prevent INT-01 manual Intake.
- Exception-only Intake UI showing progress, policy-accepted results, targeted recapture instructions, manual fallback, and one final commit summary.
- A provider evaluation command that reads a labeled manifest, reports exact field match, false auto-accepts, grouping purity, recapture rate, latency, and cost metadata without modifying source photos.
- Unit, API/database integration, and browser coverage for the complete fake-provider journey; live-provider evaluation is opt-in and never part of `npm test`.

## Non-Goals

- No autonomous Batch Commit, Machine identity verification, Machine merge, or direct provider write to application tables.
- No catalog lookup, inferred dimensions/weight/condition/operation, pricing, bulk QR printing, production, listing, or broad cross-workflow Exception Case module.
- No model training/fine-tuning, provider credential provisioning, or claim that a generic benchmark proves warehouse accuracy.
- No client-side authoritative OCR, public image URL, service-worker cache entry, offline recognition, or queued offline mutation.
- No removal of INT-01's manual grouping/fact correction path.
- No mutation of the supplied source photos or storage of complete raw provider payloads in audit/outbox/logs.

## Provider and Acceptance Strategy

- `IntakeSemanticRecognizer` receives metadata-stripped bounded JPEG analysis images and returns groups, visible fields, normalized evidence boxes, quality observations, provider request ID, model, and schema version.
- Production semantic adapters support OpenAI and Gemini through the same port. Selection is configuration; the evaluation harness compares them on the same labeled manifest.
- `IntakeOcrVerifier` returns line text, polygons, scores, and runtime/model provenance. Google Vision is the provisional primary independent verifier for the pilot; PaddleOCR remains the self-hosted fallback; tests inject a deterministic fake.
- Provider confidence is only one input. Automatic field acceptance requires supported evidence, no quality blocker, deterministic normalization, and independent agreement. Serial acceptance requires exact normalized semantic/OCR agreement; disagreement or one unreadable character creates recapture.
- Automatic group acceptance requires non-overlapping photo membership, no conflicting serial/model evidence, at least one usable Machine/nameplate evidence path, and the configured policy floor. Numeric floors are explicit deployment/evaluation configuration; absent floors disable automatic acceptance rather than silently choosing a threshold.
- Exact Inventory identity matches block. Likely matches remain reviewable warnings and cannot be auto-acknowledged.
- Policy decisions are pure and deterministic for persisted inputs. Every result records `policyVersion` and stable reason codes.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/api/src/modules/inventory/intake/{intake.service,intake.repository}.ts` | Owns batch versions, grouping, confirmation, warnings, destination, commit, and provenance. |
| `InventoryRepository.createIntakeMachine()` and `normalization.ts` | Canonical transaction-aware Machine creation and identity normalization. |
| `FILES_OPERATIONS` / `FilesService` / `StorageAdapter` | Canonical private evidence validation, checksum/storage agreement, HEIC decoding, and byte access. |
| `OperationsWorker` / `InternalEventHandlerRegistry` | Existing at-least-once worker, leases, retries, dead letters, and handler registry. |
| `packages/contracts/src/intake.ts` | Runtime Intake request/response and state contracts. |
| `packages/config/src/environment.ts` | Only allowed environment/configuration parsing boundary. |
| `packages/database/drizzle/0008_inventory_intake.sql` | Existing Intake constraints and committed-batch immutability triggers. |
| `review-view.tsx` / `apps/web/src/lib/intake-client.ts` | Existing bounded upload queue, private previews, optimistic mutations, manual review, and commit UI. |
| `useServerState`, `useOnlineStatus`, `server-route-state.ts` | Canonical refresh, offline, and protected-route behavior. |

## Files to Modify

| Area | Required change |
|---|---|
| Contracts | Extend `intake.ts`, `operations.ts`, exports, and tests with recognition run, group, field evidence, verification, policy decision, recapture, provenance, stable status/reason/finding codes, and recognition commands. |
| Configuration | Add validated enable/provider/model/endpoint/credential/timeout/image-byte/output/policy-floor settings. Reject fake providers in deployed environments and require credentials only for enabled adapters. |
| Database | Extend `schema.ts`; add migration `0009_intake_recognition.sql` for runs, groups, group photos, field suggestions, verifications, recaptures, candidate confirmation source, indexes, lifecycle checks, and committed-batch immutability. |
| Files | Extend the Files-owned operations interface with checksum-verified bounded analysis images. Convert all supported Intake formats to rotated, metadata-stripped JPEG under explicit per-image/pixel/batch limits. |
| Inventory matching | Consolidate Intake duplicate/warning decisions behind an executor-aware Inventory matching/locking seam; prevent cross-batch exact-identity commit races without acquiring verified identity claims. |
| Intake recognition | Add provider ports, policy, repository/orchestrator, OpenAI/Gemini/Google Vision/PaddleOCR adapters, durable event handler, and composition inside Inventory. External calls stay outside database transactions. |
| Intake API | Add idempotent request/retry, recapture-evidence/manual-fallback commands, and read status through the existing protected controller/service and permissions. |
| Web | Extend the Intake client/view for automatic start, status polling, accepted provenance, targeted recapture, controlled refresh of editable fields, actionable failures, and terminal post-commit state. |
| Evaluation/docs | Add an opt-in labeled-manifest evaluation command, example schema, `.env`/README documentation, and privacy-safe metrics output. |
| Tests | Extend contracts/config/API/Files/Operations/UI/browser fixtures and root scripts; browser API uses fake adapters only. |

## Files to Reference Only

- `PRODUCT.md`, `ARCHITECTURE.md`, `CONTEXT.md`, `DECISIONS.md`, `ROADMAP.md`, ADRs 0001–0003, 0005, and 0006.
- `specs/INT-01.md`, `reviews/INT-01-review.md`, and prior Safe Foundation specs.
- `source-materials/inventory/laundrorama-inventory-photos/**` as read-only optional evaluation input.
- Existing local/S3 storage adapters, auth/session behavior, QR implementation, import lifecycle, and PWA cache policy.

## Files Not to Touch

- Source photos, transcripts, workbook, generated Deliverables, `.codex-build/**`, and artifact-generation tools.
- Better Auth tables/session semantics, verified `machine_identity_claim` semantics, QR payload/signing, Imports, Production, Sales, Listings, Payments, and Logistics.
- Existing package scopes, repository/directory names, and unrelated branding.
- Service-worker allowlist except regression tests proving recognition/Intake/File routes remain network-only.

## Codegraph Findings (live, this ticket)

- The index is current: 179 files, 2,390 nodes, and 7,272 edges.
- No recognition/grouping/OCR provider symbols exist; the additions are justified.
- `createIntakeMachine()` is the only safe Machine-creation seam for Batch Commit.
- `findIntakeEvidence()` exposes metadata only. Files needs a bounded analysis method; Intake must not inject `StorageAdapter`.
- Operations outbox events contain a target and privacy-safe summary, not domain payloads. The handler resolves the persisted Recognition Run and deduplicates with the stable job ID.
- Domain handlers are not yet registered, but `InternalEventHandlerRegistry.register()` is the intended extension point.
- Existing Intake matching SQL duplicates Inventory normalization decisions and permits a cross-batch provisional duplicate race; consolidate it during this ticket.
- `CandidateEditor` and destination selection use uncontrolled defaults. Recognition refreshes would display stale values unless the view adopts an authoritative refresh/dirty-edit strategy.
- Commit success currently leaves local detail open. INT-02 must refresh/set terminal state and disable further edits.

## Reuse Audit

Reused:

- Intake batch/version/commit, Machine creation, identity normalization, private Files evidence, HEIC conversion, Operations audit/idempotency/outbox/worker, role policy, route-state, online guard, server-state sync, and upload queue.

New code justified because:

- No provider port, Recognition Run, grouping proposal, field evidence, independent verifier, policy decision, recapture lifecycle, or async Intake handler exists.

Do not duplicate:

- Inventory normalization/matching, Files byte/storage checks, Operations retry/idempotency, Intake confirmation/commit rules, request IDs, permission checks, API clients, or PWA cache policy.

Escalated to human:

- Review the private candidate labels before treating the side-by-side Google/Paddle measurements as final accuracy, calibrate false-accept and recapture behavior before enabling automatic acceptance, and complete the privacy/vendor review for the provisional Google primary. Numeric auto-accept floors remain explicit configuration; the safe default is no automatic acceptance when they are absent.

## Implementation Plan

1. Add contracts, configuration, schema/migration, controlled operations actions, and database lifecycle/immutability tests.
2. Add the Files-owned bounded analysis-image seam and checksum/HEIC/privacy tests.
3. Consolidate Inventory-owned matching/identity locking and add the cross-batch commit race test.
4. Implement provider-neutral ports, deterministic Confidence Policy, fake adapters, and adapter contract tests.
5. Implement OpenAI, Gemini, Google Vision, and PaddleOCR adapters with structured-output validation, abort timeouts, response-size limits, and redacted errors.
6. Persist and queue idempotent Recognition Runs; register the durable handler; call providers outside transactions; apply results only after version/photo-fingerprint/checksum revalidation.
7. Apply accepted proposals atomically to candidates/photos, persist provenance, create targeted recaptures for exceptions, and preserve manual fallback.
8. Extend the UI/client with auto-start, polling, exception-only review, recapture upload, accessible status, stale-state protection, and terminal commit refresh.
9. Add the opt-in provider evaluation harness and documentation.
10. Run review, reuse/slop audit, full root gates, and browser journeys at desktop/tablet/tablet-landscape sizes.

## Constraints

- Recognition is never authoritative inventory and never runs inside Batch Commit's transaction.
- Every provider input is bounded and obtained from Files; every provider output is runtime-schema validated and size-limited before persistence.
- No secrets, image bytes, storage keys, filenames, complete prompts, complete OCR text, or raw provider payloads enter logs, audit summaries, or outbox errors.
- A Recognition Run is bound to batch version, ordered photo IDs/checksums, provider/model, prompt/schema, verifier, and policy version. Changed input creates a new run; stale output is retained as history but not applied.
- Automatic application bumps the batch version and invalidates affected manual confirmations. Manual edits made after a run starts always win.
- Recapture requests are blockers until a later accepted run or an attributable manual fallback resolves them.
- Existing exact duplicate blocking and likely-match acknowledgement remain human decisions.
- Provider failure, timeout, disabled configuration, or dead letter leaves the batch open and the manual INT-01 route usable.
- Original evidence remains immutable; derived analysis bytes are ephemeral or Files-owned and are never public/cacheable.

## Tests Required

- Root gates: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run test:browser`, `npm run build`, `git diff --check`.
- Contracts/config: every state/reason/provider setting, deployed fake rejection, missing enabled credentials, bounds, nullable unknowns, and runtime output rejection.
- Files: JPEG/PNG/WebP/HEIC/HEIF analysis, rotation/metadata stripping, per-image and total limits, checksum/object mismatch, unavailable object, and no public/grant path.
- Policy: exact agreement, serial character disagreement, quality blockers, missing critical fields, conflicting photos, overlapping groups, duplicate matches, absent floors, and stable reason codes.
- Provider adapters: mocked success/refusal/malformed/oversized/timeout/rate-limit responses; no live call.
- Recognition integration: idempotent request, queued/running/ready/needs-recapture/failed, retry/dead-letter/manual fallback, provenance, stale output rejection, recapture rerun, warning handling, and privacy-safe audit/outbox.
- Commit integration: policy/source checksum/recapture/duplicate revalidation, all-or-nothing rollback, stable retry, and concurrent different-batch exact-identity prevention.
- UI/client: authoritative refresh without stale fields, automatic request once uploads link, polling, accessible progress, targeted instructions, provider failure/manual path, destination errors, version conflict, and post-commit read-only state.
- Browser: fake-provider upload dump -> auto groups/accepts -> targeted recapture -> resolved exception -> one Batch Commit; provider failure/manual fallback; offline/reconnect; stale tab; no cache; Axe and horizontal-overflow checks at supported sizes.
- Optional evaluation: real credentials and labeled manifest only; print aggregate metrics and never alter input photos or determine CI success.

## Done Criteria

- A worker can dump a Load's photos and see accepted Machine groups/facts without manual grouping or per-field approval.
- Low-confidence or ambiguous evidence gives a concrete recapture instruction and cannot silently enter a Machine.
- A successful recapture clears the exception through a new versioned run; provider failure still permits reviewed manual Intake.
- One human Batch Commit remains the only transition that creates provisional Machines, and it revalidates current evidence and identity state atomically.
- Recognition/provider replacement does not change authoritative Machine identity, Files privacy, or Intake commit semantics.
- Deterministic full gates pass; optional live evaluation reports its limitations separately.
