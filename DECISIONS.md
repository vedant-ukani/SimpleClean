<!-- DECISIONS.md — important architectural/product decisions, why they were made, and tradeoffs. ADR-style, newest first. -->

# Decisions

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

Create every received or expected physical Machine with an immutable UUID and allow incomplete provisional plate facts. Preserve raw identity submissions separately from the normalized current view. Verifying manufacturer plus serial acquires one unique normalized identity claim; a duplicate attempt keeps both Machines and persists the attempted Machine as a linked conflict. Identity evidence, verification decisions, and relocations are immutable and attributable, while current operational records use optimistic versions.

Consequences: unloading and migration do not stop for catalog enrichment, unknown values remain null rather than guessed, and concurrent verification cannot silently create duplicate confirmed identities. Later OCR/import/QR/production modules call the Inventory service interface and must not reimplement identity normalization or write its tables directly.

## 2026-09-21 — Staff authentication and platform authorization

Use Better Auth for staff email/password credentials, secure cookies, and database-backed sessions. Keep the three Simply Clean application roles and their permissions in a platform-owned Identity module and shared authorization contract rather than Better Auth organizations or browser state. Every protected API request resolves the signed session and current persisted platform profile; role changes and deactivation revoke sessions, and the final active Owner Admin is protected transactionally.

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
