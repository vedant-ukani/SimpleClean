# Safe Foundation Program

Status: completed and accepted on 2026-09-21. See `reviews/SF-01-review.md` through `reviews/SF-08-review.md` and `reviews/safe-foundation-program-review.md`.

## Outcome

Create the secure technical foundation for the Simple Clean Core Operations Platform without pretending that the warehouse intake workflow has already been finalized. The result must be a running, tested application skeleton that can safely hold users, roles, loads, provisional machines, locations, files, audit history, spreadsheet imports, and QR labels. It must also provide a simple shared-tablet shell that can be refined after the warehouse observation.

This program is one milestone composed of eight independently reviewable tickets. Each ticket receives its own `code-architect` specification, implementation pass, test pass, review, and durable-memory update.

## Product boundaries

The Safe Foundation establishes shared infrastructure and minimum domain records. It does not implement the final intake checklist, testing rules, repair workflow, pricing engine, listings, CRM, shipping quotes, QuickBooks synchronization, or autonomous AI actions.

The existing architectural rules remain binding:

- The Core Operations Platform is authoritative for operational state.
- Inventory, production, listing, sales, payment, and shipment states remain separate.
- The system is a modular monolith with explicit module interfaces and adapters at external seams.
- Machine identity and workflow history remain in the platform, not Shopify or QuickBooks.
- External events are treated as retried and possibly duplicated.
- Consequential actions require approval and an audit trail.
- A personal Facebook Marketplace account must not be automated through an unattended VPS browser.
- Open business questions in `ARCHITECTURE.md` are not silently converted into hardcoded rules.

## Technical baseline

- Workspace: one TypeScript repository containing the web application, API application, and shared packages.
- Web: Next.js, React, and TypeScript.
- Tablet: responsive Progressive Web App delivered by the web application; no native tablet app initially.
- API: NestJS modular TypeScript application.
- Database: PostgreSQL through one repository/data-access boundary.
- Files: S3-compatible object storage behind a storage adapter.
- Jobs: PostgreSQL-backed durable jobs and a transactional outbox.
- Validation/contracts: shared runtime schemas and generated/static TypeScript types where appropriate.
- Testing: unit tests, API integration tests against PostgreSQL, and browser-level integration tests for the foundation workflow.
- Environments: development, test, staging, and production configuration with validated environment variables.

Provider choices must remain replaceable behind adapters. Secrets, credentials, PII, full SMS/email bodies, and file contents must never be written to application logs.

## Ticket SF-01 — Application, database, and environments

### Goal

Create a runnable TypeScript workspace and the operational infrastructure required by every later ticket.

### Requirements

- Establish a Git repository and deterministic package manager configuration.
- Create a Next.js web application and NestJS API application.
- Create shared packages for configuration, contracts, database access, and test support only where they encode reusable decisions.
- Provide local PostgreSQL and S3-compatible development services or an equivalent deterministic local test setup.
- Add validated configuration for development, test, staging, and production.
- Add health/readiness endpoints covering the API and database dependency.
- Add formatting, linting, type checking, unit-test, integration-test, and build commands.
- Add a continuous-integration workflow that runs the non-secret checks.
- Provide `.env.example` files containing names and safe descriptions, never real secrets.
- Add structured logging and error boundaries without logging sensitive payloads.

### Acceptance criteria

- One documented command starts the local development stack.
- Web and API boot successfully.
- API health and database readiness checks pass.
- Lint, typecheck, tests, and production builds pass from the repository root.

## Ticket SF-02 — Authentication and role permissions

### Goal

Require secure sign-in and consistently enforce Owner Admin, Warehouse, and Technician/Cleaner permissions across web routes and API operations.

### Requirements

- Use an established authentication library/provider rather than inventing cryptography.
- Store only the minimum identity/profile information needed by the platform.
- Support secure sessions, logout, expiration, revocation, and test-user provisioning.
- Define canonical roles and permissions in one shared authorization policy.
- Enforce authorization server-side; hidden navigation is not security.
- Support individual accountability even when a physical tablet is shared.
- Record sign-in and authorization-sensitive activity without storing secrets.
- Provide an Owner Admin-only user and role management surface sufficient for the pilot.

### Acceptance criteria

- Anonymous users cannot access protected pages or APIs.
- Each role sees the correct navigation and receives the correct API permissions.
- A forged client-side role cannot bypass server authorization.
- Login, logout, session expiry/revocation, and role-denial tests pass.

## Ticket SF-03 — Loads, machines, locations, and users

### Goal

Create the minimum authoritative operational records needed to identify a received machine and locate it without finalizing the detailed intake workflow.

### Requirements

- Create Acquisition Load, Machine, Location, and User/Profile modules with explicit service interfaces.
- Assign every Machine an immutable internal identifier independent of serial number.
- Support provisional Machine records because plate data may be incomplete during unloading.
- Store manufacturer, model, serial, voltage, phase, fuel, machine type, source load, current location, and identity-verification state as nullable/controlled fields.
- Preserve raw user-entered or imported identity evidence instead of silently overwriting it.
- Prevent duplicate confirmed serial numbers within the appropriate manufacturer/identity scope while allowing explicit exception handling.
- Use separate inventory and production state fields; do not create a single universal status.
- Use optimistic concurrency or an equivalent mechanism for conflicting updates.
- Provide API operations and simple Owner/Warehouse views to create, read, update, search, and relocate records.

### Acceptance criteria

- An authorized warehouse user can create a provisional Machine under a Load, assign a Location, and retrieve it by ID.
- Critical identity changes are validated and audited.
- Duplicate confirmed identities produce a visible conflict instead of silent duplication.
- Domain and API integration tests cover authorization, validation, concurrency, and database constraints.

## Ticket SF-04 — Photos and document storage

### Goal

Attach trustworthy photo/document evidence to operational records while keeping object storage replaceable and access controlled.

### Requirements

- Create a storage adapter with a local/test implementation and S3-compatible implementation.
- Store file metadata in PostgreSQL and bytes in object storage.
- Support attachments for Loads and Machines with typed purposes such as nameplate, arrival condition, document, receipt, and other.
- Validate size, allowed content types, declared purpose, and record ownership.
- Use generated storage keys; never trust a client filename as an object key.
- Provide short-lived authorized upload/download flows.
- Track upload state so abandoned or failed uploads are visible and cleanable.
- Record uploader, timestamp, checksum, media type, size, and related record.

### Acceptance criteria

- Authorized staff can upload and view a Machine nameplate photo.
- Unauthorized users cannot obtain an upload or download grant.
- Unsupported file types and oversized uploads are rejected.
- Metadata, object existence, checksum, and audit events agree in integration tests.

## Ticket SF-05 — Audit history and reliable internal events

### Goal

Make consequential changes traceable and create the reliable event foundation required for future integrations and background work.

### Requirements

- Add an append-only audit log containing actor, action, target, timestamp, request/correlation ID, and a privacy-safe change summary.
- Centralize audit creation for domain mutations; do not rely on UI-only logging.
- Add a transactional outbox written in the same database transaction as relevant state changes.
- Add a durable worker that claims, retries, and dead-letters failed jobs safely.
- Require idempotency keys for externally initiated or retry-prone mutations where applicable.
- Expose Owner Admin views for record history, failed jobs, and safe retry.
- Do not store secrets or complete sensitive payloads in audit or job error records.

### Acceptance criteria

- Creating or changing a Load, Machine, Location assignment, role, file, import, or QR label produces an audit record.
- A transaction failure cannot leave an outbox event without its domain change or vice versa.
- Duplicate delivery of one idempotent command produces one business result.
- Retry and dead-letter behavior is covered by integration tests.

## Ticket SF-06 — Inventory spreadsheet staging and import

### Goal

Bring the current inventory workbook into the platform through a reversible, reviewed staging workflow rather than writing unvalidated rows directly into authoritative inventory.

### Requirements

- Accept XLSX and CSV files through an Owner Admin-only import flow.
- Store the source file and create an immutable Import Run record.
- Map current workbook columns into normalized candidate fields while retaining original row values and row numbers.
- Validate and classify each row as ready, warning, or error.
- Detect likely duplicates using serial, model, and existing records without automatically merging uncertain matches.
- Provide a preview with filters and explicit approval before committing records.
- Make commit idempotent so retrying the same Import Run cannot duplicate Machines.
- Produce a downloadable result/error report.
- Do not guess missing voltage, phase, serial number, or model identity.

### Acceptance criteria

- The supplied `source-materials/inventory/Inventory List.xlsx` can be uploaded and parsed into staging.
- Invalid and ambiguous rows remain visible without corrupting authoritative Machines.
- An approved subset can be committed once and traced back to the exact source rows.
- Parser, validation, duplicate, approval, rollback/failure, and idempotency tests pass.

## Ticket SF-07 — QR label generation and scan lookup

### Goal

Give each Machine a durable scannable identity that resolves to the authorized platform record without exposing business data in the QR payload.

### Requirements

- Generate an opaque or signed lookup token linked to the immutable Machine ID.
- Do not embed serial number, customer information, pricing, or other sensitive data in the QR code.
- Support label generation only after the Machine record exists.
- Produce a printable label containing the QR code, a short human-readable fallback code, and minimal safe text.
- Support revocation/reissue while preserving label history.
- Resolve scans through an authenticated route and enforce role access.
- Record label creation, printing/download, reissue, and scan events at an appropriate privacy-safe level.

### Acceptance criteria

- An authorized user can generate, download, scan, and resolve a Machine label.
- A revoked token no longer resolves.
- Guessing sequential Machine IDs does not bypass authorization.
- QR payload, print rendering, revocation, lookup, and authorization tests pass.

## Ticket SF-08 — Shared-tablet application shell

### Goal

Provide a fast, understandable PWA shell for warehouse and technician users using the foundation records, without freezing the final warehouse workflow prematurely.

### Requirements

- Add installable PWA metadata, responsive tablet layouts, and accessible navigation.
- Provide role-aware home screens for Warehouse and Technician/Cleaner.
- Include foundation screens only: assigned/recent work placeholder, expected Loads, Machine search, QR scan entry, Machine summary, Location selection, and file/photo access.
- Clearly label workflow-specific screens as pilot placeholders where the warehouse observation is still required.
- Optimize primary interactions for touch and shared tablets.
- Handle loading, empty, offline/unavailable, permission-denied, validation, and retry states.
- Preserve individual session accountability and provide a prominent user switch/logout control.
- Avoid hardcoding final checklist fields, status transitions, or safety decisions.

### Acceptance criteria

- Warehouse and Technician/Cleaner test users can sign in on a tablet-sized browser and see only their permitted foundation screens.
- A warehouse user can find a Machine by search or QR, view its summary and files, and update its Location when permitted.
- PWA install metadata, responsive behavior, accessibility checks, and browser integration tests pass.

## Program-level integration test

The final test must exercise the complete Safe Foundation across real application boundaries:

1. Owner Admin signs in and uploads the supplied inventory workbook.
2. The workbook is stored, parsed into an Import Run, and reviewed.
3. Approved rows create provisional or verified Machine records without duplicates.
4. A Warehouse user signs in and opens an expected Load.
5. The user assigns a Location and uploads a nameplate photo.
6. The user generates a QR label and resolves the Machine by scanning its payload.
7. A Technician/Cleaner can view the permitted Machine summary but cannot perform Owner-only operations.
8. Audit history shows the import, record creation, location change, file attachment, and QR event.
9. Retrying import commit and an idempotent API mutation creates no duplicate business records.
10. A forced background-job failure retries and becomes visible for Owner Admin review without corrupting operational data.

## Program done criteria

- All eight ticket specifications and reviews exist.
- Each ticket's required unit and integration tests pass.
- The program-level browser/API/database integration test passes.
- Root lint, typecheck, test, and build commands pass.
- No secrets or user data are committed.
- The Reuse Map identifies the canonical locations and conventions created by the foundation.
- Documentation explains how to start, test, and review the system locally.
- Remaining warehouse-dependent questions are explicit and not hardcoded.
