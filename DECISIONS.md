<!-- DECISIONS.md — important architectural/product decisions, why they were made, and tradeoffs. ADR-style, newest first. -->

# Decisions

## 2026-09-28 — Print model identity with readable QR separation

Include the Machine's recorded model number in the private whole-Intake nine-up QR sheet, or show **Model: Not recorded** when it is unknown. Keep manufacturer, capacity/type, model, and full serial as a readable identity block with visible whitespace before the QR; adapt unusually long identity values inside the fixed label cell without truncating them. The opaque signed QR payload, fallback code, active-label reuse, authorization, private no-store response, and print audit remain unchanged.

Consequences: warehouse staff can match a printed label using both model and serial, including when reprinting a historical Intake. This deliberately expands ADR 0011's visible matching facts to include model while retaining its exclusion of price, customer, location, cost, source details, and internal Machine ID. Nine labels still fit on each US Letter page, and the QR remains large enough to scan after the spacing adjustment.

## 2026-09-25 — Time Washer and Dryer work through active multi-Machine sessions

Treat Washer Technician, Dryer Technician, and Cleaner as Production assignments within the existing Technician/Cleaner security role. A worker has at most one specialty and one open Test session; Cleaners receive no Initial Check or Test work. Owner Admin retains Machine-detail Initial Check and Owner Review access but has no Initial Checks queue.

Every Test start or resume joins the worker's server-owned session. Sessions support 1–20 same-specialty Machines, active/paused/completed states, per-Machine working/running/waiting states, QR resume, and equal elapsed-time allocation across actively timed Machines. Individual immutable Work Orders, checklist results, and private videos remain separate. New Washer/Dryer template revisions omit the duplicate bearing step; historical runs keep their pinned templates. A new bearing concern exits the Test and session to Awaiting Repair without rewriting Initial Check history.

Consequences: technicians can move among several Machines without typing or losing attributable labor time; checklist mutations cannot bypass session timing; session-changing actions use optimistic versions; rejoining a claimed Machine does not invent another claim event. Repair execution, payroll/billing interpretation, and test-bay capacity remain separate future decisions.

## 2026-09-25 — Group Warehouse Expected Loads by UTC arrival date

Warehouse sees every unreceived Load grouped as Overdue, Today, Upcoming, or No arrival date using UTC calendar dates. Missing or past expected dates never hide a Load; only `receivedAt` removes it after the final Intake batch closes. Warehouse cards omit commercial Source and Source Reference, while Owner Load management retains them.

Consequences: arrival date is presentation and planning data, not a new lifecycle state. The authorized local pilot data reset removed Load-rooted records only after a closed-database backup; Identity and Catalog data were preserved, and no production delete endpoint was added.

## 2026-09-25 — Use tap-only initial checks and require private video for successful Tests

Show on-hand, unassessed Washers and Dryers in Technician My Work according to the worker's configured specialty. The initial check accepts only Smooth, Bearing concern, or Unable to assess. Production derives the immutable Preliminary observation and disposition: Smooth creates Test work, while concern or inability blocks further testing in Owner Review. QR resolution remains a Machine lookup and asks Production for the authorized next-work destination.

A full Test with no failed checklist results requires one ready, same-Machine private `production_test_video` linked to that exact Test run. A failed Test routes to Awaiting Repair without requiring or linking a success video. Test video remains private, signature-checked, checksum/storage-verified, bounded to the configured video limit, and distinct from still-photo checklist evidence.

Consequences: technicians do not type preliminary findings or choose lifecycle states; bearing concerns never automatically Scrap or mark Parts-only; specialty and state decisions stay server-owned; successful Test evidence is attributable without implying Cleaning, QA Release, listing approval, or shipment release.

## 2026-09-24 — Remove Inventory Location from the active product

Remove Inventory Location, Machine relocation, and Intake destination from active contracts, permissions, APIs, repository behavior, search, and web interfaces. Show the existing nullable Machine `model` as **Model Number** in the former Location column on the Machines overview. Preserve historical SQL migrations and stored Location, relocation, destination, audit, outbox, and idempotency records without exposing or mutating them through active product paths.

Consequences: current Machine and Intake payloads contain no Location fields, Scan and Machine detail contain no Location surfaces, and workers cannot assign or relocate a Machine. Legacy Operations discriminants remain parseable for immutable history. Seller/pickup addresses, shipping destinations, logistics tracking, browser URLs, and OCR evidence coordinates are unaffected. This supersedes the retained Location-domain behavior in ADR 0009; see [ADR 0019](./docs/adr/0019-remove-inventory-location-from-active-product.md).

## 2026-09-24 — Complete a Load when its final Intake batch closes

Mark an Acquisition Load received in the same transaction that closes its final open Intake Batch. Photo upload, recognition, Candidate review, and historical individual Machine commit do not complete the Load. Because the data model permits several Intake batches for one Load, closing one batch leaves the Load expected while another remains open; the last closing batch sets the receipt timestamp. Starting a new Intake on an already received Load is rejected.

Consequences: Warehouse sees the Load throughout active receiving and it disappears from Expected Loads only after complete receiving. Intake creation and finalization serialize on the Load row, so a concurrent new batch cannot race with receipt and concurrent final batches cannot hide the Load early. Machine creation, mappings, Batch state, Load receipt, audit/outbox records, and idempotency completion commit or roll back together.

## 2026-09-24 — Limit standalone Catalog browsing to Owner Admin

Grant `catalog.read` only to Owner Admin. Warehouse and Technician/Cleaner users do not see or directly access the standalone Catalog workspace, but they continue to receive approved model specifications through the Machine records they are authorized to view. Shared manufacturer facts remain canonical Catalog data; physical measurements, configuration differences, and other unit-specific facts remain Inventory-owned Machine overrides.

Consequences: Warehouse and Technician/Cleaner workflows stay focused on Machines rather than the complete model library, while server-side Catalog list/detail authorization remains authoritative. Specifications are not copied into every Machine, corrections to shared model facts remain reusable, and actual Machine or final packed values continue to override Catalog defaults.

## 2026-09-24 — Decode Machine QR camera frames locally

Add an explicit **Scan QR code** action to the protected Scan page. Prefer the environment-facing camera, sample bounded frames locally in the browser, and accept only an absolute same-origin `/scan#<signed token>` payload before calling the existing authenticated resolver. Never upload, persist, log, or cache camera frames or unrelated decoded content; preserve the printed fallback code and external deep-link paths.

Consequences: camera permission is never requested on page load, all tracks stop after capture, Stop, page hiding, unmount, or error, and invalid QR content produces no API request. A decoded token remains only a lookup reference: the server still verifies its signature, active-label state, current session, and Machine permission.

## 2026-09-24 — Keep preliminary disposition conservative and separate from QA

Record Preliminary Inspections as immutable Production history with optional ready private Machine evidence and an attributable disposition. Repairable sets Production to Preliminary Passed while Inventory remains On Hand. Hold and Owner Review block Production while Inventory remains On Hand. A Warehouse or Technician Parts-only/Scrap recommendation becomes Owner Review; only Owner Admin may finalize Parts-only or Scrap, which sets Inventory to Scrapped and Production to Blocked. Scrapped Machines require a future explicit reviewed workflow for restoration.

Consequences: bearing findings remain observations rather than automatic decisions; no repair-cost threshold, model rule, checklist, or evidence count is invented. Reinspection appends history. Preliminary approval never means tested, repaired, cleaned, QA Released, listing-eligible, sold, or shippable, and future reversal workflows require an explicit reviewed decision.

## 2026-09-24 — Exact Catalog matches remain usable while missing facts are enriched

Treat exact model resolution and specification completeness as separate Catalog decisions. When an accepted identity resolves to an exact approved revision that still has unknown fields, keep that revision immediately usable and invoke the existing additive specification-enrichment operation for only its missing fields. A verified result publishes an immutable next revision on the same variant; a no-result or unavailable provider leaves the partial revision unchanged. Provider failures remain durable-work failures, but Machine events link the current exact approved revision before propagating the error for retry.

Consequences: exact matches no longer suppress official web research merely because some facts are already known. Existing facts and evidence cannot be overwritten, repeated recognition/Machine events reuse the same base-and-missing-fields run, existing Machine pins do not move, and future resolutions use the newest approved revision. ADR 0017 and ADR 0018 remain the publication authority: related series such as T-600 cannot populate `WCVD40KCS-12` unless exact or safe anchored-base official evidence passes; conflicting or unsupported dimensions and weight remain unknown.

## 2026-09-23 — Use image layout for OCR-backed assignment and documented base-model specifications

Send each bounded, metadata-stripped nameplate JPEG to OpenAI with its bounded Google OCR so the semantic mapper can use layout, adjacency, and visible labels when a printed field label is cropped or missed. Google OCR remains the exact-character authority: every non-null value needs same-photo OCR support, and the image cannot repair or invent characters. Capacity still requires an explicit unit, and worker-selected Machine type remains authoritative.

For separate Catalog discovery, accept official specifications for either the full accepted model or an exact officially documented leading base model. A base model is valid only as an anchored normalized prefix of at least four characters containing a letter and digit, with exact evidence on a provider-returned trusted official URL. Preserve the full nameplate model as the variant and store the documented base as its family. All other ADR 0017 source, locator, equipment-class, unit, conflict, audit, and automatic-publication gates remain active. See [ADR 0018](./docs/adr/0018-vision-assisted-intake-and-documented-base-models.md).

## 2026-09-23 — Automatically publish only strict official-source Catalog discoveries

After accepted OCR-backed manufacturer and full-model identity, run a separate asynchronous Catalog discovery request. Search may inspect the unrestricted public web, but automatic publication has no human approval step only when every accepted fact cites provider-returned HTTPS evidence on an already trusted `official_manufacturer` hostname, names the exact full model or an ADR 0018-safe documented leading base model, includes a locator, is conflict-free, and passes deterministic schema/unit checks. Typed official serial rules are the only path to a manufacture-year result.

Third-party, reseller, distributor, marketplace, lookalike-domain, unrelated-family, conflicting, and unsupported claims remain unknown. Discovery is deduplicated, retryable, immutable, audited, usage/cost-attributed, and non-blocking for Intake. Inventory actual values still override Catalog defaults. This is the sole narrow exception to the general human-approval rule for consequential AI publication; see [ADR 0017](./docs/adr/0017-automatic-official-source-catalog-discovery.md) and its [ADR 0018](./docs/adr/0018-vision-assisted-intake-and-documented-base-models.md) refinement.

## 2026-09-23 — Keep verified model enrichment in a separate Catalog module

Create a Catalog domain module for canonical manufacturers, model families and variants, approved specification revisions, source evidence, aliases, and manufacturer/series-specific serial-date rules. Other modules receive one deterministic resolution result from accepted manufacturer, model, and optional serial values; they do not query Catalog tables directly.

Catalog enrichment runs after nameplate recognition and cannot reconstruct unreadable identity, search the public internet inside Intake, or overwrite immutable nameplate evidence. Reviewed snapshot material creates approved provenance-bearing revisions. ADR 0017, as refined by ADR 0018, permits automatic publication only through strict exact documented-model or safe anchored-base-model evidence from provider-returned official hosts; all other unsupported or conflicting material remains unknown. A Catalog match may suggest Washer, Dryer, or Other, but the current attributable worker confirmation remains authoritative. Physical Machine overrides supersede catalog defaults, and actual packed dimensions and weight remain authoritative for final shipping.

## 2026-09-23 — Start recognition on selection; exclude failed evidence without deleting it

Selecting nameplate files immediately starts upload and sequential item preparation; the active Intake has no separate Upload button. Failed or stale items offer a clearer replacement image or failed-only removal rather than retrying the same evidence.

Replacement preparation succeeds before the original failed photo is excluded. Exclusion preserves the failed photo, Candidate, Recognition Run, and audit history but removes that orphaned Candidate from the active queue and final Batch Commit scope. Unassigned photos and all remaining active Candidates still satisfy the existing accounting, recognition, and type rules. See [ADR 0016](./docs/adr/0016-immediate-nameplate-preparation-and-failed-evidence-exclusion.md).

## 2026-09-23 — Classify after recognition and add the complete Intake once

Let warehouse staff select and upload all nameplates without choosing Washer, Dryer, or Other first. Each upload still becomes one private photo, Candidate, and independent targeted Recognition Run. After a result is ready, the worker records the observed Machine type; recognition cannot populate or overwrite that human choice.

Replace the active per-card Inventory buttons and separate Finish Receiving action with one **Add Machines to Inventory** action. It is enabled only after every selected item is prepared, recognition-ready, confirmed, and typed. The server revalidates those rules and reuses the existing audited, idempotent Batch Commit transaction to create every unmapped provisional Machine and close the Intake atomically. Historical individual mappings and finalization APIs remain compatible. After commit, the whole-Intake QR PDF opens in a visible tablet tab, with download fallback when popups are blocked. This supersedes the active presentation and sequencing portions of ADR 0008 and ADR 0012; see [ADR 0015](./docs/adr/0015-post-recognition-type-and-final-intake-commit.md).

## 2026-09-23 — OpenAI assigns fields; same-photo Google OCR proves their characters

Let OpenAI assign manufacturer, model, serial, voltage, phase, fuel, type, and capacity from bounded Google OCR. Every non-null value still requires valid same-photo OCR references, but deterministic support is checked against all bounded OCR for that photo rather than requiring the complete cited line to equal the field.

Manufacturer, model, and serial must occur as complete contiguous normalized token sequences, so a full-nameplate OCR block can support the correct value while `M1` cannot match `M10` and missing or changed characters still fail. Field-aware equivalents remain available for optional facts, explicit units remain required for capacity, and unsupported optional facts do not block readiness. New runs use `intake-nameplate-policy-v3`; a person still reviews and explicitly adds each provisional Machine. See [ADR 0014](./docs/adr/0014-openai-field-assignment-with-same-photo-ocr-presence.md).

## 2026-09-23 — Store duplicate photo-Intake Machines separately

Create a separate provisional Machine for every supported, worker-approved photo-Intake Candidate, even when its normalized manufacturer and serial match an existing Machine or another Candidate. Remove Intake duplicate warnings, acknowledgement controls, and blockers. Preserve a new immutable Machine ID plus the Candidate, photo, evidence, audit, and Intake mapping for each record; never merge Machines automatically.

Request idempotency still prevents the same commit request from creating a second business result. Later explicit identity verification retains the unique normalized identity claim and records a conflict while keeping both Machines. Spreadsheet migration keeps its separate duplicate-review behavior. This supersedes the photo-Intake duplicate-blocking portions of ADR 0010 and ADR 0012; see [ADR 0013](./docs/adr/0013-store-duplicate-intake-machines.md).

## 2026-09-23 — Batch nameplate selection and capacity-optional QR sheets

Let warehouse staff choose several nameplate photos for one Load in a single tablet action, review compact thumbnails, and select Washer, Dryer, or Other for each image before upload. Each image still passes through the existing single-item preparation, recognition, evidence checking, individual approval, and Machine creation boundaries; batch selection does not group Machines or authorize bulk approval.

After Finish Receiving, unknown capacity no longer blocks the private whole-Intake QR sheet. Known values retain the existing pound label, while missing values print as **Capacity unknown** with the Machine type. This supersedes only the capacity-required printing part of ADR 0011 and supplements the active Intake presentation from ADR 0008. ADR 0013 later supersedes ADR 0012's duplicate-warning and blocking behavior; ADR 0015 later supersedes its type-before-upload and per-Machine approval presentation. See [ADR 0012](./docs/adr/0012-batch-nameplates-and-capacity-optional-qr-sheets.md).

## 2026-09-23 — Capacity and whole-Intake QR label sheets

Capture a nullable, bounded pound capacity during individual Machine Intake. Recognition accepts capacity only from explicit unit-bearing nameplate evidence; workers may confirm a common value, enter a bounded custom value, or keep it unknown. Capacity is not part of serialized identity and does not block adding a Machine to Inventory.

After Finish Receiving, Owner Admin and Warehouse users can print one private nine-up Letter PDF for every Machine mapped by that Intake. Printing requires capacity on every mapped Machine, reuses or creates exactly one active QR label per Machine, and records print activity. The QR token remains opaque and authenticated; visible label text is limited to Laundrorama, manufacturer, capacity, type, full serial, and fallback code. See [ADR 0011](./docs/adr/0011-intake-capacity-and-whole-load-qr-sheets.md).

## 2026-09-23 — Google OCR is authoritative for active Intake field assignment

Use Google Cloud Vision as the sole text reader in the active single-nameplate Intake path. Send only bounded Google OCR lines, stable line IDs, confidence, and boxes to `gpt-6-luna`; do not send image bytes to OpenAI. Luna maps supported text into the strict Machine-field schema, and the deterministic policy requires same-photo citations plus supported manufacturer, model, and serial values before confirming the Candidate.

Provider confidence and image-quality warnings remain provenance rather than readiness blockers. Missing or unsupported critical evidence, malformed output, and provider failures fail the targeted run without creating a new Recapture Request; the retained photo remains retryable. A person still reviews the values and explicitly selects **Add to Inventory** before a Machine is created. Historical recapture data remains readable. ADR 0013 later supersedes ADR 0010's exact-duplicate failure behavior. This supersedes ADR 0007's active independent-reader and targeted-recapture decisions; see [ADR 0010](./docs/adr/0010-google-ocr-authoritative-intake-assignment.md).

## 2026-09-23 — Luna field assignment with fenced recognition retries

Use `gpt-6-luna` as the configured OpenAI semantic field-assignment model for live Intake recognition while Google Cloud Vision remains the bounded OCR provider and the deterministic policy remains the authority for accepting exact identity. Normalize explicit plate labels such as `MODEL NO.`, `SERIAL NO.`, and `S/N` before comparing provider values, but preserve genuine values such as `NO123`.

Fence every Recognition Run execution with a non-secret claim derived from the stable outbox job ID and delivery attempt. A redelivery may reclaim an abandoned `running` run, but apply, requeue, and failure writes succeed only for the currently claimed attempt. This prevents a late expired handler from overwriting a newer retry or creating duplicate recognition artifacts. Existing Recognition Runs and evidence are not rewritten or automatically retried.

## 2026-09-23 — Locationless intake during the pilot (superseded)

Make the Intake Batch destination optional. Individual Candidate Commit, compatible historical Batch Commit, and Finish Receiving continue to enforce Load provenance, evidence, approval, idempotency, audit, and outbox invariants; when a destination is supplied they still validate it as active, create the normal initial location history, and preserve the existing destination-lock behavior. When it is absent, Inventory creates an on-hand provisional Machine with a null current location and no initial relocation entry.

The active Intake UI no longer fetches or renders destination choices, so workers can capture, review, approve, and add Machines without any active Locations. This compatibility decision was superseded on 2026-09-24 when ADR 0019 removed Inventory Location, relocation, and Intake destination from the active product. See [ADR 0009](./docs/adr/0009-locationless-intake.md) and [ADR 0019](./docs/adr/0019-remove-inventory-location-from-active-product.md).

## 2026-09-23 — Pipelined recognition with individual Machine approval

Keep one Intake Batch as the Load-level receiving session, but process each nameplate as an independent Machine Intake Item. Preparing an item records the worker-observed Washer/Dryer/Other type, binds one private photo to one Candidate, and queues a targeted Recognition Run. The worker can capture the next item while previous recognition continues. Each ready Candidate is reviewed and committed to exactly one Inventory Machine through an audited, idempotent transaction; Finish Receiving only closes the Batch after every item is already mapped.

Consequences: adding another photo cannot stale an unrelated run, identity fields remain automatic/read-only in the active workflow, a present destination becomes immutable after the first individual commit, and no final action can silently approve unreviewed Machines. Historical batch-wide recognition and Batch Commit data remain readable. ADR 0015 later supersedes type during preparation, active individual commits, and separate Finish Receiving while preserving targeted recognition. See [ADR 0008](./docs/adr/0008-pipelined-individual-intake-commit.md).

## 2026-09-22 — Single-nameplate automated recognition

Treat each intake upload as one private nameplate photo for one physical Machine. Use Google Cloud Vision for bounded document-text OCR, OpenAI for structured field assignment, and a versioned deterministic policy plus current Inventory matching for independent verification. Preserve raw OCR separately, audit character-level corrections, and never globally substitute confusable characters.

Consequences: the active path does not group photos, use manufacturer-site or general web search, or fall back to manual field entry. Ambiguous evidence creates a targeted Recapture Request, while provider failures retain the photo and remain retryable. Recognition stays advisory and a person still authorizes Batch Commit. See [ADR 0007](./docs/adr/0007-single-nameplate-automated-recognition.md).

## 2026-09-22 — Provisional Google Vision primary for the INT-02 pilot

Use Google Cloud Vision `document-text-detection` as the provisional primary
OCR verifier for the INT-02 pilot, with PaddleOCR retained as the self-hosted
fallback behind the same replaceable `IntakeOcrVerifier` port. The side-by-side
run used the same 92-image manifest and the same one-megapixel,
metadata-stripped JPEG preprocessing: Google matched 345/537 candidate fields
(64.25%) versus PaddleOCR's 285/537 (53.07%), with 40.1 seconds versus 543.8
seconds total latency. These are pilot measurements, not final accuracy claims:
the manifest labels are `agent-candidate-unreviewed` and require human review.

Consequences: the pilot deployment explicitly selects Google through validated
configuration while recognition remains disabled by default in source examples;
PaddleOCR remains the documented fallback. Human label adjudication, measured
false-accept/recapture calibration, and privacy/vendor review remain deployment
gates. This choice does not change the supervised recognition boundary, the
manual INT-01 fallback, the human-authorized Batch Commit, or Machine identity
authority.

## 2026-09-22 — Supervised, replaceable Intake recognition

Treat photo grouping, nameplate extraction, independent OCR verification, confidence-policy acceptance, and targeted recapture as one Inventory Intake recognition pipeline behind replaceable provider ports. Persist provider/model/schema/policy provenance and source evidence; never treat model confidence alone as verified Machine identity.

Consequences: reliable results can be accepted without field-by-field review, uncertain evidence becomes a targeted Recapture Request, provider failures fall back to INT-01's manual path, and a person still authorizes one final audited Batch Commit. Files owns bounded private analysis access, Operations owns durable retries, and provider adapters cannot write domain tables. See [ADR 0006](./docs/adr/0006-supervised-replaceable-intake-recognition.md).

## 2026-09-21 — Laundrorama owns the used-equipment workflow

Use Laundrorama as the product and business name for the used-equipment Core Operations Platform. Simple Clean is William's separate new-equipment business and must not be treated as the authority for Laundrorama inventory, intake, production, sales, or fulfillment.

Consequences: new used-equipment specifications and UI use Laundrorama. The dedicated technical-identity migration uses `@laundrorama/*` package scopes. The host directory name is a separate app-level concern. See [ADR 0020](./docs/adr/0020-laundrorama-technical-identity.md).

## 2026-09-21 — Files owns private intake-image derivatives

Keep the immutable original intake image and any review derivative inside the Files module's private-storage boundary. HEIC/HEIF intake evidence is decoded through a maintained adapter under explicit byte, dimension, and pixel limits; review output is a metadata-stripped JPEG. A preview is derived display material, not authoritative evidence.

Consequences: Files owns original and preview metadata, checksums, storage agreement, cleanup, and grant validation. Original and preview access remains short-lived, one-time, authorization-checked, and `no-store`; neither may enter the service-worker cache or become a public object URL. Intake stores File references and provenance but never stores, transforms, or authorizes the bytes itself.

## 2026-09-21 — Shared-tablet PWA with public-only offline assets

Deliver one responsive installable web application for Owner, Warehouse, and Technician/Cleaner users. Every worker signs in with an individual account, sees permission-derived navigation, and keeps visible identity and switch-user controls. Cache only versioned public application assets plus a generic offline page; never cache sessions, protected pages, operational data, files, imports, reports, or QR responses, and never queue offline mutations.

Consequences: the PWA remains useful as a home-screen application without exposing the prior worker's data on a shared device. Operational screens remain network-authoritative, disable mutations while offline, and refresh server data after reconnect. Protected routes share one error-state mapping, and prop-derived client state synchronizes after server refresh. Desktop and tablet behavior is verified through disposable full-boundary Playwright journeys rather than snapshots alone.

## 2026-09-21 — Opaque, revocable Machine QR identity

Keep Machine QR labels inside Inventory and encode only a versioned random Label ID plus a dedicated HMAC signature in the platform URL fragment. The browser submits the token through an authenticated protected request; the token is a lookup reference, not an authorization credential. Store label lifecycle and privacy-safe activity in PostgreSQL, render printable SVG on demand, and retain revoked labels as immutable history.

Consequences: QR images, filenames, audit summaries, and printed text do not disclose Machine IDs, serials, prices, customers, or locations. Reissue atomically revokes the exact expected active Label ID and version before creating a replacement, preventing stale-tab ABA changes. Secret rotation invalidates existing signatures and therefore requires an explicit reissue migration. Owner Admin and Warehouse can manage labels; every authorized role can resolve them through normal current-session permission checks.

## 2026-09-21 — Approval-gated inventory spreadsheet migration

Treat inventory spreadsheets as immutable migration evidence, not as a live database or a trusted command stream. Store source bytes privately, parse workbook and CSV content within explicit structural and evidence limits, preserve typed source cells and row provenance, and require an Owner to approve only non-error rows before an atomic Inventory commit. Imports call Inventory-owned identity matching and Machine creation rather than copying those rules.

Consequences: formulas are retained as inert evidence and formula-backed serials are rejected; legacy sold/shipped rows remain visible but non-committable; executable workbook parts are rejected; and each staged row stores an immutable exact match snapshot. Every commit attempt rechecks that snapshot. If matching Inventory changed, the run becomes terminal and must be restaged so approval never silently applies to different duplicate evidence. Private storage and PostgreSQL remain separate systems, so definite pre-commit failures are cleaned up best-effort while uncertain database outcomes retain source bytes for reconciliation.

## 2026-09-21 — Atomic audit, idempotency, and PostgreSQL outbox delivery

Record a privacy-safe central audit entry and a durable outbox job through one Operations port using the owning domain repository's active PostgreSQL transaction. Keep specialized Identity, Inventory, and Files histories for domain evidence. Require retry-prone Inventory creates to hash their idempotency keys, compare canonical request fingerprints, and store only the completed target reference.

Consequences: a domain mutation, audit entry, and outbox job commit together or not at all; duplicate accepted creates resolve to one record; and cross-domain history remains searchable without copying sensitive payloads. The API-hosted worker provides at-least-once internal delivery through bounded leases, attempt-on-claim, stale-lease rejection, finite backoff, dead-letter visibility, and versioned Owner requeue. Future event handlers must use the stable job ID for side-effect idempotency. External brokers and provider handlers remain later adapter decisions.

## 2026-09-21 — Private file metadata, storage adapters, and one-time access

Keep Machine/Load attachment metadata and relationships in PostgreSQL while storing bytes behind a provider-neutral Files module `StorageAdapter`. Use generated opaque object keys, byte-signature/media/size/checksum validation, and private local or S3-compatible storage. Issue only short-lived one-time grants whose SHA-256 hashes are persisted and whose use is bound to the issuing user, exact session, file, and operation.

Consequences: filenames and storage providers cannot become authorization boundaries, storage keys are never public URLs, and current target permission is rechecked before every grant use. Because the database and object store cannot share one transaction, upload leases and optimistic versions coordinate readiness, failure, and cleanup; only verified objects become ready, late writers remove their bytes after a lost race, and ready objects are excluded from incomplete cleanup. Malware-provider selection, retention deletion, and automatic cleanup remain later decisions.

## 2026-09-21 — Provisional Machine identity and explicit verification claims

Create every received or expected physical Machine with an immutable UUID and allow incomplete provisional plate facts. Preserve raw identity submissions separately from the normalized current view. Verifying manufacturer plus serial acquires one unique normalized identity claim; a duplicate attempt keeps both Machines and persists the attempted Machine as a linked conflict. Identity evidence and verification decisions are immutable and attributable, while current operational records use optimistic versions.

Consequences: unloading and migration do not stop for catalog enrichment, unknown values remain null rather than guessed, and concurrent verification cannot silently create duplicate confirmed identities. Later OCR/import/QR/production modules call the Inventory service interface and must not reimplement identity normalization or write its tables directly.

## 2026-09-21 — Staff authentication and platform authorization

Use Better Auth for staff email/password credentials, secure cookies, and database-backed sessions. Keep the three Laundrorama application roles and their permissions in a platform-owned Identity module and shared authorization contract rather than Better Auth organizations or browser state. Every protected API request resolves the signed session and current persisted platform profile; role changes and deactivation revoke sessions, and the final active Owner Admin is protected transactionally.

Consequences: credential cryptography and session semantics remain delegated to an established library, while operational authorization stays explicit and replaceable. Shared tablets still require individual accounts and a prominent sign-out/user-switch action. Adding future module permissions extends the canonical policy rather than introducing controller- or UI-local role checks.

## 2026-09-21 — Foundation tooling and database execution

Use npm workspaces without an additional monorepo orchestrator. Use strict TypeScript, Zod for runtime configuration/contracts, Vitest for unit and integration tests, and Drizzle as the PostgreSQL access/migration layer. Local and deterministic tests may use PGlite because Docker is unavailable; CI and deployed environments use the PostgreSQL wire driver. Database migrations run as an explicit setup/deployment command so database outages do not prevent the API liveness endpoint from starting.

Consequences: package boundaries stay explicit and simple; local tests remain reproducible; the wire path remains verified in CI; later domain modules must reuse the established configuration and database factories rather than create direct clients.

## 2026-09-20 — Greenfield workspace structure

The implementation will use one TypeScript workspace with a Next.js web application, a NestJS API, and shared packages only for cross-application decisions such as contracts, configuration, database access, and test support. Domain behavior remains inside explicit API modules. This preserves the accepted modular-monolith decision while preventing premature microservices or a generic shared-code dumping ground.

## Existing accepted decisions

The detailed rationale and consequences remain canonical in these ADRs:

- [ADR 0001 — Core Operations Platform is the system of record](./docs/adr/0001-core-platform-system-of-record.md)
- [ADR 0002 — Modular monolith and evented integrations](./docs/adr/0002-modular-monolith-and-evented-integrations.md)
- [ADR 0003 — Separate operational state axes](./docs/adr/0003-separate-operational-state-axes.md)
- [ADR 0004 — Supervised Facebook Marketplace automation](./docs/adr/0004-supervised-facebook-marketplace-automation.md)
- [ADR 0005 — AI Surfer is a constrained automation client](./docs/adr/0005-ai-surfer-is-a-constrained-automation-client.md)
- [ADR 0006 — Supervised, replaceable Intake recognition](./docs/adr/0006-supervised-replaceable-intake-recognition.md)
- [ADR 0007 — Single-nameplate automated recognition](./docs/adr/0007-single-nameplate-automated-recognition.md)
- [ADR 0008 — Pipelined recognition and individual Intake commit](./docs/adr/0008-pipelined-individual-intake-commit.md)
- [ADR 0009 — Locationless Intake during the pilot (superseded by ADR 0019)](./docs/adr/0009-locationless-intake.md)
- [ADR 0010 — Google OCR authoritative Intake assignment](./docs/adr/0010-google-ocr-authoritative-intake-assignment.md)
- [ADR 0011 — Capacity and whole-Intake QR sheets](./docs/adr/0011-intake-capacity-and-whole-load-qr-sheets.md)
- [ADR 0012 — Batch nameplate selection and capacity-optional QR sheets](./docs/adr/0012-batch-nameplates-and-capacity-optional-qr-sheets.md)
- [ADR 0013 — Store duplicate photo-Intake Machines separately](./docs/adr/0013-store-duplicate-intake-machines.md)
- [ADR 0014 — OpenAI field assignment with same-photo OCR presence](./docs/adr/0014-openai-field-assignment-with-same-photo-ocr-presence.md)
- [ADR 0015 — Post-recognition Machine type and one final Intake commit](./docs/adr/0015-post-recognition-type-and-final-intake-commit.md)
- [ADR 0016 — Immediate nameplate preparation and failed evidence exclusion](./docs/adr/0016-immediate-nameplate-preparation-and-failed-evidence-exclusion.md)
- [ADR 0017 — Automatic official-source Catalog discovery](./docs/adr/0017-automatic-official-source-catalog-discovery.md)
- [ADR 0018 — Vision-assisted Intake and documented base models](./docs/adr/0018-vision-assisted-intake-and-documented-base-models.md)
- [ADR 0019 — Remove Inventory Location from the active product](./docs/adr/0019-remove-inventory-location-from-active-product.md)
- [ADR 0020 — Laundrorama technical identity migration](./docs/adr/0020-laundrorama-technical-identity.md)
