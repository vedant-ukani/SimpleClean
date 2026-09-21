# Simply Clean Core Operations Platform

This repository contains the greenfield foundation for the Simply Clean operational system of record. It is an npm workspace with a Next.js web application, a NestJS API, and small shared packages for runtime configuration, API contracts, database access, and test setup.

## Prerequisites

- Node.js 22.12 or newer
- npm 11 or newer

Docker is not required for local development or tests. Local work uses PGlite, which provides PostgreSQL semantics in-process and stores development data under the repository's gitignored `.local-data/` directory. Relative local database and file-storage paths are anchored to the npm workspace root so every workspace command uses the same data.

## Start locally

```sh
npm install
cp .env.example .env
# Set AUTH_SECRET and QR_SIGNING_SECRET to separate values generated with:
# openssl rand -base64 32
npm run db:migrate
npm run dev
```

Database migration is an explicit setup and deployment step. It is intentionally separate from API startup so liveness remains available while PostgreSQL is temporarily unavailable. After setup, one command starts both applications:

- Web: <http://localhost:3000>
- API liveness: <http://localhost:3001/health/live>
- API database readiness: <http://localhost:3001/health/ready>

The browser reaches authentication and application APIs through the same-origin `/api/*` route. Better Auth serves credential and session behavior under `/auth/*` in the API; platform identity behavior is under `/identity/*`.

QR labels use `PLATFORM_PUBLIC_ORIGIN` to construct authenticated `/scan#<token>` links. `QR_SIGNING_SECRET` must be generated independently from `AUTH_SECRET`; rotating it invalidates every existing signed QR token, so rotation requires a planned label reissue operation.

Signed-in foundation views are available at `/loads`, `/machines`, and `/locations`. Owner Admin manages Load and Location definitions; Owner Admin and Warehouse users can create, identify, verify, and relocate Machines; Technician/Cleaner users have read-only Machine search and Location access. Inventory APIs are served under `/inventory/*`.

Machine and Acquisition Load detail pages also provide private attachments. File relationships and checksums live in PostgreSQL; bytes are accessed only through short-lived, one-time grants under `/files/*` and are never exposed through static serving.

Owner Admins can review privacy-safe mutation history and failed internal work at `/admin/operations`. Creating a Load, Location, or Machine requires an `Idempotency-Key` header; the web application generates one UUID for each submit attempt so a retried request cannot create a duplicate record.

## Provision the first staff user

After running migrations, set these values in your local `.env` file:

```sh
AUTH_BOOTSTRAP_EMAIL=owner@example.com
AUTH_BOOTSTRAP_NAME=Owner Name
AUTH_BOOTSTRAP_PASSWORD=a-unique-initial-password
AUTH_BOOTSTRAP_ROLE=owner_admin
```

Then run:

```sh
npm run auth:provision
```

The command reads the password only from the environment, never from a command-line argument or source-controlled default. It creates or updates the requested pilot account through Better Auth and the Identity module. Remove the bootstrap password from `.env` after provisioning, communicate it out of band, and sign in at <http://localhost:3000/login>. Each worker uses an individual account; use the prominent switch-user/sign-out control before handing over a shared tablet.

## Shared tablet PWA

The staff web application is one responsive installable PWA; there is no separate native or shared-account tablet application. Open it in a modern browser over HTTPS (or localhost), sign in with the worker's individual account, and use the browser's **Install app** action when a home-screen icon is useful. Warehouse and Technician/Cleaner home screens expose only their permitted foundation destinations and clearly mark the future assigned-work area as a pilot placeholder.

The PWA stores only versioned public application assets and a generic offline page. It never stores protected pages, API/session responses, attachments, imports, reports, QR labels, Loads, or Machines for offline use, and it never queues offline writes. When the connection is unavailable, reconnect before viewing or changing operational records. Successful switch-user/sign-out also clears this application's public cache version before the next person signs in.

## Verify

Run the canonical checks from the repository root:

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:browser
npm run build
```

The local integration suite creates disposable in-memory PGlite databases. Browser tests start isolated API, storage, and web processes, provision disposable role users and records, and run both desktop and tablet Chromium projects without reading or writing the root inventory workbook. CI also runs the database integration test against a PostgreSQL service through the normal wire driver.

## Database modes

`DATABASE_DRIVER=pglite` is the safe development and test default. `PGLITE_DATA_DIR` controls the local data location; use `:memory:` only for isolated tests.

For a deployed PostgreSQL database, set:

```sh
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://...
```

`DATABASE_URL` is required in PostgreSQL mode and is never included in validation messages or structured logs. Staging and production reject PGlite unless `ALLOW_PGLITE_IN_DEPLOYED=true` is explicitly set for an exceptional environment.

## Private file storage

Local development and tests default to `FILE_STORAGE_DRIVER=local`, with bytes under the gitignored `FILE_LOCAL_DIRECTORY`. Staging and production require S3-compatible storage unless `ALLOW_LOCAL_FILE_STORAGE_IN_DEPLOYED=true` is explicitly set. S3 credentials use the AWS standard provider chain unless both explicit access-key variables are supplied.

The configured size and grant TTL settings apply to every upload and download. JPEG, PNG, WebP, and PDF content is verified from its bytes; an attachment becomes ready only after its stored size, media type, and SHA-256 agree.

## Audit and internal work

Successful foundation mutations append a central audit entry and an outbox job in the same PostgreSQL transaction as the owning domain change. Audit summaries contain controlled field names and outcomes only; request bodies, credentials, serial values, filenames, tokens, file bytes, and exception text are not stored there.

The API process polls the PostgreSQL outbox when `OPERATIONS_WORKER_POLLING_ENABLED=true`. Claim leases, maximum attempts, polling interval, and exponential-backoff base are configured by the `OPERATIONS_WORKER_*` environment values in `.env.example`. Tests disable polling and call the worker directly. A delivery with no registered internal subscribers succeeds. Handler failures store only the safe code `handler_failed`, retry automatically, and eventually become `dead_letter`; an Owner Admin can requeue the current dead-letter version from the Operations page. The stable job ID is the idempotency boundary future handlers must use for at-least-once delivery.

## Inventory spreadsheet import

Owner Admins can stage a legacy inventory file at `/admin/imports`. Choose the existing Acquisition Load that supplied the equipment, upload one `.xlsx` or UTF-8 `.csv` file, review every source row and finding, explicitly select the rows to approve, then separately confirm the atomic commit. The source remains private and unchanged. Unsupported sold/shipped history cannot be approved, warnings are never selected automatically, and a successful commit creates provisional Machines with exact source-row provenance.

Imports use the configured `FILE_MAX_BYTES` limit (15 MiB by default) and reject unsupported or mismatched content. Parsing is bounded to 20 worksheets, 10,000 aggregate non-header rows, 640,000 aggregate cells, 64 columns per sheet, 256 characters per header, 4,000 JSON characters per typed cell value, and 8 MiB of expanded staged evidence. Formula text is retained as inert evidence and is never evaluated; a formula-backed serial is rejected. If Inventory matches change after approval, that approval becomes terminal and the Owner must stage a new Import Run.

Private object storage and PostgreSQL cannot share one atomic transaction. The importer verifies stored-object metadata before staging, cleans up definite pre-commit failures best-effort, and retains the private object when the database outcome is uncertain so a committed Import Run is not broken. After a storage or database outage, operators should reconcile private objects against Import Runs.

For local acceptance, start the platform, create or choose an Acquisition Load, and upload the unmodified root `Inventory List.xlsx`. The review should show 227 source rows: 172 on-hand candidates, 55 non-committable sold/shipped rows, and five duplicate serial groups. Download the source and result report from the Import Run review page; do not edit or write back to the workbook.

## Architecture boundary

The Core Operations Platform is authoritative for operational state. The API is a modular monolith backed by one PostgreSQL database, and shared packages contain only cross-application decisions:

- `apps/web` — Next.js user interface
- `apps/api` — NestJS HTTP API and future owning domain modules
- `packages/config` — environment parsing and validation
- `packages/contracts` — cross-application request/response contracts
- `packages/database` — the only database-driver construction boundary
- `packages/test-support` — test setup reused by multiple workspaces

Document and presentation generators elsewhere in the repository are communication artifacts and are not application dependencies.
