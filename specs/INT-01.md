# INT-01 — Laundrorama load-level bulk photo intake and review

## Goal

Give Laundrorama warehouse staff a fast tablet workflow for turning a bounded set of arrival/nameplate photos under one Acquisition Load into reviewed, provisional Machine records. Photos remain private evidence, workers explicitly group and confirm every Machine, and one committed batch cannot create partial or duplicate inventory.

`Laundrorama` is the used-equipment product name established in the 2026-09-21 transcript. This ticket uses that name in its specification and new intake UI copy. Renaming repository folders, package scopes such as `@simply-clean/*`, or unrelated existing screens is a separate branding change.

## Ticket Summary

- Add a Load-owned `Intake Batch` aggregate to the Inventory domain. A batch belongs to exactly one existing Acquisition Load and progresses from `open` to terminal `committed`.
- Let Owner and Warehouse users select many photos in one tablet action. The browser presents this as a batch upload but sends bounded, independently retryable uploads through the existing one-file Files grant/content flow with at most three uploads in flight.
- Support 1–100 private image files per Intake Batch. Reuse the configured per-file byte limit; never accept an unbounded multipart request or hold the complete batch in API memory.
- Add Files purpose `intake_evidence`, valid only for Load targets. Original bytes remain a Load attachment; Intake stores only authorized File IDs, order, disposition, and candidate association.
- Extend the Files image policy for JPEG, PNG, WebP, HEIC, and HEIF intake evidence. Preserve the original privately and create a private, metadata-stripped, bounded JPEG review preview. Use a maintained decoder; do not hand-roll HEIF decoding.
- Verify declared type, byte signature, decoded dimensions, pixel-count limit, output size/checksum, and storage agreement before marking the file ready. A failed original or preview write deletes attempted objects and uses the existing safe File failure lifecycle.
- Do not copy, retarget, or publicly expose photo bytes. Preview and original download endpoints require short-lived, one-time grants and return `private, no-store` responses.
- Let staff create candidate Machine groups, assign one or more photos to each candidate, and mark irrelevant photos excluded. One photo is assigned to at most one candidate; a candidate may have many photos.
- Candidate facts are `machineType`, manufacturer, model, serial, voltage, phase, and fuel. All facts except `machineType` may remain null. Unknown facts stay null; never infer or copy a catalog value.
- A candidate moves from `draft` to `confirmed` only through an explicit worker action. Confirmation requires `machineType` and at least one assigned ready photo. Editing a confirmed candidate returns it to `draft`.
- Every photo must be assigned to a confirmed candidate or explicitly excluded before commit. Every non-excluded candidate must be confirmed.
- Require one active destination Location for the batch before commit. Committed Machines start `on_hand`, `not_started`, provisional, and at that Location under the selected Load.
- Treat the reviewed nameplate/configuration as evidence. Add identity source kind `photo_intake`; preserve final candidate facts and photo-to-Machine provenance without verifying identity.
- Reuse Inventory matching before commit. An exact normalized manufacturer+serial match inside the batch or against an existing Machine blocks that candidate. Serial-only or manufacturer+model matches remain visible warnings and require an explicit per-candidate acknowledgement.
- Commit all confirmed candidates and their mappings in one database transaction through an Inventory-owned, transaction-aware creation port. Do not call the public transaction-opening `createMachine` once per candidate and do not write Inventory tables from Intake route/controller code.
- Require `Idempotency-Key` on create, review-save, photo-link, and commit commands. Use optimistic batch versions. A completed retry returns the same batch/Machine mappings; changed fingerprints conflict; concurrent commits cannot fork records.
- Record privacy-safe audit/outbox actions for batch creation, review updates, and commit. Each Machine creation emits the existing canonical `inventory.machine.created` record in the same transaction.
- Add a Laundrorama intake entry point on the Load detail page and a protected tablet-first review page. The API remains the authorization boundary.

## Workflow and State Model

1. An Owner or Warehouse user opens an existing Acquisition Load and selects **Start Laundrorama intake**.
2. The user chooses up to 100 photos. The UI uploads each photo through a separate existing Files grant, shows per-photo progress/failure, and links each ready `intake_evidence` File to the open batch.
3. The review grid displays private JPEG previews. The user groups photos into candidate Machines or explicitly excludes irrelevant photos.
4. The user enters only facts visible in the evidence, chooses a machine type, reviews duplicate warnings, and confirms each candidate.
5. The user selects one active destination Location and commits the batch with a clear count confirmation.
6. The API locks and revalidates the batch, Load, Location, Files, group assignments, candidate confirmations, and duplicate state; it then creates all Machines and immutable mappings atomically.
7. The result links to every created Machine. The committed batch remains read-only evidence and retries return the same result.

State invariants:

- `open`: photos, candidates, assignments, exclusions, acknowledgements, order, and destination may change with the expected version.
- `committed`: batch evidence, candidate facts, dispositions, acknowledgements, and Machine mappings are immutable.
- A File must be `ready`, target the same Load, and have purpose `intake_evidence` before it can be linked.
- A File ID belongs to at most one Intake Batch. Removing it from an open batch removes only the Intake association, never its Files record or private object.
- A committed candidate maps to exactly one new Machine; a Machine created by intake maps back to exactly one batch candidate.
- Failure before transaction commit creates no Machines or mappings. A safe commit failure leaves the batch `open` and retryable; no raw exception or identity value is written to audit/outbox.

## Supplied Photo Facts

Read-only inspection of `source-materials/inventory/laundrorama-inventory-photos/` on 2026-09-21 found 92 `.HEIC` images. Current Files contracts accept only JPEG, PNG, WebP, and PDF, so HEIC/HEIF preview support is required for the supplied evidence to be usable. The source directory is read-only acceptance material and must never be renamed, converted in place, or committed as generated test output.

## Expected Output

- Intake contracts for batches, photos, candidates, warning acknowledgements, review commands, commit results, list/detail responses, and stable state/finding codes.
- Inventory-owned Intake API/service/repository with Load/File/Location validation, optimistic versioning, duplicate analysis, atomic Machine creation, provenance, audit, outbox, and idempotency.
- PostgreSQL schema/migration for batches, candidate drafts/final facts, photo associations/dispositions, acknowledgements, and immutable committed mappings.
- Files policy/metadata/storage support for private HEIC/HEIF originals and safe JPEG intake previews without widening PDF behavior or making any object public.
- Laundrorama Load intake UI with multi-select upload progress, preview grid, grouping, field review, warnings, destination selection, commit confirmation, and created-Machine links.
- Deterministic contract, file-policy, API/database, UI, and desktop/tablet browser coverage.

## Non-Goals

- No OCR, AI extraction, confidence scoring, catalog lookup, or automatic photo grouping. INT-01 creates the reviewed evidence boundary those features can use later.
- No silent Machine creation, automatic identity verification, auto-merge, or overwrite of an existing Machine.
- No pricing, cost, sales, listing, payment, shipment, production queue, repair checklist, technician assignment, or parts workflow.
- No bulk QR label sheet, automatic QR creation, QR payload change, or printed Machine facts. Existing per-Machine QR behavior remains unchanged.
- No offline upload, offline review, background synchronization, or caching of private/operational responses.
- No video, PDF intake evidence, general-purpose thumbnail service, image editing, or modification of the supplied photos.
- No repository-wide rename from Simple Clean/`@simply-clean/*` to Laundrorama.

## Relevant Existing Code

| File/Symbol                                                                    | Why it matters                                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/inventory/inventory.service.ts` / `INVENTORY_OPERATIONS` | Canonical Load/Location lookup, Machine validation, creation, matching seam, and idempotency error mapping.                                       |
| `apps/api/src/modules/inventory/inventory.repository.ts`                       | Existing normalization, provisional identity evidence, location history, transaction, audit, and import-style transaction-aware creation pattern. |
| `apps/api/src/modules/files/files.service.ts` / `FILES_OPERATIONS`             | Canonical target authorization, one-time upload/download grants, content inspection, storage verification, and safe failure handling.             |
| `apps/api/src/modules/files/storage.adapter.ts`                                | Existing replaceable private-object boundary; original and preview objects must use it.                                                           |
| `apps/api/src/modules/operations/operations.ports.ts`                          | Canonical mutation recorder, idempotency coordinator, and request fingerprint.                                                                    |
| `packages/contracts/src/{inventory,files,authorization,operations}.ts`         | Runtime schemas and controlled state/action/permission unions to extend.                                                                          |
| `apps/web/src/app/(protected)/attachments-panel.tsx`                           | Existing Load/Machine attachment UX and file helper composition; reuse its grant/upload behavior rather than bypassing Files.                     |
| `apps/web/src/app/(protected)/loads/[loadId]/**`                               | Canonical protected Load route and entry point for the intake workflow.                                                                           |
| `apps/web/src/lib/{inventory-client,files-client,server-route-state}.ts`       | Validated same-origin clients, stable idempotency convention, and protected route-state mapping.                                                  |

## Files to Modify

| Area                               | Required change                                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts/authorization/operations | Add `intake.ts`, `intake.read/manage`, `photo_intake`, `intake_evidence`, HEIC/HEIF media types, Intake actions/target, preview responses, and exports. Owner and Warehouse receive Intake permissions; Technician/Cleaner does not.    |
| Database schema/migration/tests    | Add Intake aggregate/provenance tables, constraints, indexes, terminal immutability protection, `photo_intake` source check, Intake actions/target checks, and Files preview metadata.                                                  |
| Files module/tests                 | Extend inspected image policy, generate/verify private JPEG intake previews, add grant-bound preview retrieval, and retain single-file bounded uploads.                                                                                 |
| Inventory module/tests             | Add `inventory/intake/**`, register its controller/providers, generalize candidate matching where useful, and add a transaction-aware Intake Machine creation port that reuses existing normalization/evidence/history/recording logic. |
| API composition/config             | Register any maintained HEIC decoder and explicit decoded-dimension/pixel/preview limits; do not add a second storage provider or multipart batch endpoint.                                                                             |
| Web/client/tests                   | Add Load entry point, `/loads/[loadId]/intake/[batchId]`, validated Intake client, bounded upload queue, private preview retrieval, review/commit UI, and role/offline/error states.                                                    |
| Browser fixtures                   | Add deterministic Laundrorama intake journeys at desktop and tablet sizes using synthetic JPEG plus a small licensed/generated HEIC fixture, never user photos.                                                                         |
| `README.md`                        | Document supported intake image types, limits, online-only behavior, role access, review requirement, and local verification.                                                                                                           |

Agent B may choose exact internal filenames and a maintained HEIC-capable decoder. Keep Intake inside the Inventory domain boundary; do not introduce a generic workflow engine, media service, or AI adapter.

## Files to Reference Only

- `ARCHITECTURE.md`, `CONTEXT.md`, `DECISIONS.md`, `PRODUCT.md`, `ROADMAP.md`, and ADRs 0001–0003.
- `specs/SF-03.md`, `specs/SF-04.md`, `specs/SF-05.md`, `specs/SF-07.md`, and `specs/SF-08.md`.
- `source-materials/inventory/laundrorama-inventory-photos/**` and `source-materials/transcripts/2026-09-21-transcript.docx`.

## Files Not to Touch

- User source photos/transcripts, workbook, generated Deliverables, `.codex-build/`, and artifact-generation tools.
- Better Auth/session tables or semantics, spreadsheet Imports lifecycle, QR signing/rendering, and future Production/Sales/Listing/Payments/Logistics modules.
- Service-worker public allowlist except adding regression coverage that Intake/File preview routes remain network-only and uncached.
- Existing package scopes, repository/directory names, and unrelated global branding.

## Codegraph Findings

- `InventoryOperations` is already consumed across Files and Imports. The spreadsheet importer proves the safe pattern: a domain workflow owns its transaction and calls an Inventory-owned executor-aware creation method.
- `InventoryRepository.createMachine` already centralizes Load/Location validation, normalization, identity evidence, history, Operations recording, and idempotency, but it opens its own transaction. Calling it per candidate would allow partial batch creation.
- `FilesService.createUploadGrant` and `uploadContent` enforce target access, one-time session-bound grants, byte inspection, private storage agreement, and state transitions. A new multi-file byte endpoint would duplicate and weaken this boundary.
- `AttachmentsPanel` is shared by Load and Machine details. Intake should reuse its lower-level file clients/patterns while keeping grouping/review UI separate from generic attachments.
- The live graph has no Intake aggregate, photo grouping, candidate review, commit mapping, HEIC preview, or batch browser journey. These are the justified additions.

## Reuse Audit

Reused:

- Acquisition Load, Machine, Location, identity normalization/evidence, private storage, File grants/activity, role guard, request context, PostgreSQL transaction boundary, Operations audit/outbox/idempotency, protected route mapper, online-state guard, server-state synchronization, and tablet shell.

New code justified because:

- No bounded Load Intake Batch, photo disposition/grouping, candidate confirmation, photo-to-Machine provenance, HEIC review preview, or atomic batch commit exists.

Do not duplicate:

- Machine SQL/normalization/history, File upload/download authorization, storage selection, MIME/signature policy helpers, audit/outbox SQL, idempotency hashing, permission parsing, request IDs, route-state mapping, or service-worker policy.

Escalated to human:

- None for INT-01. OCR provider/thresholds, catalog source, multi-Machine photo semantics, final exception workflow, and bulk QR content remain explicitly deferred rather than guessed.

## Implementation Plan

1. Add Intake/File/Inventory/Operations contracts, permissions, image limits, controlled states/actions, schema, migration, and terminal evidence protections.
2. Deepen Files with validated HEIC/HEIF intake originals and grant-bound JPEG previews; add content-policy/storage/privacy tests before UI work.
3. Add Inventory Intake batch CRUD/review behavior, photo-link validation, candidate matching, and executor-aware atomic Machine creation by refactoring shared Inventory creation internals rather than copying them.
4. Implement idempotent batch creation, versioned review saves, warning acknowledgement, locked commit, immutable provenance, and safe failure/retry behavior.
5. Add the Laundrorama Load entry point and tablet review UI using the existing file clients, online guard, protected route mapper, and server-state synchronization pattern.
6. Add unit, integration, browser, privacy, concurrency, rollback, and regression tests; run the full root gates and a read-only manual trial with the supplied HEIC set.

## Constraints

- Core Operations remains authoritative. A photo/candidate is not a Machine until explicit commit succeeds.
- Facts come from worker-reviewed evidence. Missing values remain null; the actual nameplate/configuration wins over any later catalog suggestion.
- Intake writes no Files or core Machine tables directly. Files owns bytes/grants/previews; Inventory owns Machine creation and identity evidence.
- Commit is all-or-nothing. Batch, candidate, photo, mapping, Machine, history, audit, outbox, and idempotency records share the intended transaction where relational state changes together.
- Original images and previews are private, non-cacheable, authorization-checked, and absent from logs/audit summaries/outbox errors. Strip preview metadata.
- The browser may retry individual failed uploads with new grants. It must not retry a changed review/commit body with an old idempotency key.
- Exact duplicate identity blocks commit; likely matches require explicit acknowledgement and remain provisional. Nothing auto-merges or verifies.
- No protected route or response is added to the service-worker cache; all mutations require a live connection.

## Tests Required

- Root gates: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run test:browser`, `npm run build`.
- Contracts/database: all states, permissions, media types, purpose/target compatibility, versions, foreign keys, unique File/Machine mappings, checks/indexes, and committed-row immutability.
- Files: valid JPEG/PNG/WebP/HEIC/HEIF intake evidence; extension/signature/type mismatch; corrupt/truncated/oversize/decompression-bomb inputs; dimension/pixel limits; metadata stripping; preview checksum/storage failure cleanup; one-time issuer/session-bound grants; private/no-store headers.
- Intake authorization: Owner/Warehouse can manage; Technician/Cleaner and anonymous sessions cannot read or mutate batches or previews; Load/File permissions remain enforced independently.
- Review: 1 and 100 photos, 101 rejected, upload concurrency bounded, partial upload retry, same-Load ready File validation, unique File association, grouping/reordering/exclusion, confirmation requirements, edit-after-confirm returns draft, stale version conflict.
- Matching: exact duplicates within batch/existing inventory block; serial/model warnings require acknowledgement; commit-time recheck catches races; unknown fields remain null.
- Commit: active destination required, all photos accounted, all candidates confirmed, `on_hand`/`not_started`/provisional Machine state, `photo_intake` evidence, location history, immutable provenance, all-or-nothing rollback, sequential/concurrent idempotency, stable retry result.
- Audit/privacy: batch and Machine actions are atomic and summaries contain no filename, photo bytes, preview bytes, serial/model values, storage keys, token, exception text, or PII.
- UI/browser: Laundrorama copy, multi-select progress, retry, private preview grid, grouping, warnings, destination/commit confirmation, created links, desktop/tablet layouts, reconnect behavior, and no operational/offline cache entries.
- Manual acceptance: create a test Load and Location, select the 92 supplied HEIC files without modifying them, group a safe subset, confirm/commit, and verify private previews, exact counts, one Machine per confirmed candidate, no excluded/unassigned Machine, and stable retry results.

## Done Criteria

- Laundrorama staff can select and review a real Load's photo set on a tablet without creating Machines one at a time.
- No Machine appears before explicit confirmation and atomic commit; failed, repeated, or concurrent commits create no partial or duplicate inventory.
- Every created Machine has the correct Load, active destination, provisional/on-hand/not-started state, reviewed identity evidence, and immutable photo provenance.
- Supplied HEIC photos remain untouched and can be privately previewed through the supported intake path.
- Role enforcement, privacy, duplicate handling, audit/outbox, online-only behavior, and full root gates pass without duplicating established domain or platform logic.
