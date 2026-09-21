# Simply Clean Core Operations Platform

This repository contains the greenfield foundation for the Simply Clean operational system of record. It is an npm workspace with a Next.js web application, a NestJS API, and small shared packages for runtime configuration, API contracts, database access, and test setup.

## Prerequisites

- Node.js 22.12 or newer
- npm 11 or newer

Docker is not required for local development or tests. Local work uses PGlite, which provides PostgreSQL semantics in-process and stores development data under the gitignored `.local-data/` directory.

## Start locally

```sh
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

Database migration is an explicit setup and deployment step. It is intentionally separate from API startup so liveness remains available while PostgreSQL is temporarily unavailable. After setup, one command starts both applications:

- Web: <http://localhost:3000>
- API liveness: <http://localhost:3001/health/live>
- API database readiness: <http://localhost:3001/health/ready>

The web health page calls the API on the server and validates both responses against the shared contract.

## Verify

Run the canonical checks from the repository root:

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

The local integration suite creates disposable in-memory PGlite databases. CI also runs the database integration test against a PostgreSQL service through the normal wire driver.

## Database modes

`DATABASE_DRIVER=pglite` is the safe development and test default. `PGLITE_DATA_DIR` controls the local data location; use `:memory:` only for isolated tests.

For a deployed PostgreSQL database, set:

```sh
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://...
```

`DATABASE_URL` is required in PostgreSQL mode and is never included in validation messages or structured logs. Staging and production reject PGlite unless `ALLOW_PGLITE_IN_DEPLOYED=true` is explicitly set for an exceptional environment.

## Architecture boundary

The Core Operations Platform is authoritative for operational state. The API is a modular monolith backed by one PostgreSQL database, and shared packages contain only cross-application decisions:

- `apps/web` — Next.js user interface
- `apps/api` — NestJS HTTP API and future owning domain modules
- `packages/config` — environment parsing and validation
- `packages/contracts` — cross-application request/response contracts
- `packages/database` — the only database-driver construction boundary
- `packages/test-support` — test setup reused by multiple workspaces

Document and presentation generators elsewhere in the repository are communication artifacts and are not application dependencies.
