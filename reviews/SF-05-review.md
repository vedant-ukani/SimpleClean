# SF-05 Review

## Status

Pass

## Checks Run

- `git diff --check b7fee1a..636158f` — pass
- `npm run format:check` — pass
- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — pass; 45 unit/component tests
- `npm run test:integration` — pass; 20 integration tests, with the optional external PostgreSQL-wire test skipped locally as designed
- `npm run build` — pass; shared packages, NestJS API, and all Next.js routes built successfully
- Live codegraph review of Operations/Inventory/Identity/Files boundaries — confirmed one mutation-recorder port, one idempotency coordinator, and one outbox worker boundary

## Findings

Implementation and independent review found the following blocking or material issues; all were corrected in final commit `636158f`:

1. Hung handlers could block a worker drain and graceful shutdown. Dispatch now has a deadline shorter than its lease, batches dispatch concurrently, and lifecycle behavior is tested.
2. Worker attempts originally advanced only after handler failure, so repeated process crashes could reclaim forever. Attempts now advance on claim, expired maximum-attempt leases dead-letter, and crash recovery is tested.
3. Success/failure compare-and-set originally accepted an expired lease until another worker reclaimed it. Both transitions now require the lease to remain unexpired at completion time.
4. Scheduled poll failures were silently swallowed. The worker now emits only a generic privacy-safe error signal and never passes exception text to the logger.
5. Idempotent Machine replay revalidated a Location that could have been deactivated after the original success. Completed reservations now resolve before current prerequisites, so replay returns the original Machine.
6. Failed-work UI initially filtered only a mixed newest-page result, and retry lacked target context. It now queries attention states directly and shows target type/ID, attempts, safe error, and update time.
7. Audit history lacked exact-record filtering and the UI hid the attributable actor/request. Target ID filtering now requires target type, and Owner history displays the actor or System plus correlation ID.
8. Initial test coverage did not fully exercise Load/Location/Machine concurrency, changed fingerprints, stale leases, rollback of specialized history, and privacy boundaries. The final suite covers those cases.

No blocking findings remain.

## Reuse / Slop Audit

- Duplicated logic: none found. Mutation recording, safe summaries, request fingerprinting, idempotency reservation, lease claiming, retry/backoff, and dead-letter transitions each have one canonical Operations implementation.
- Missed reuse: none. Domain repositories retain their existing transactions and specialized histories, call a shared recorder with the active executor, and reuse request identity/correlation context.
- Style mismatches: none blocking. Runtime schemas, repository transactions, compare-and-set versions, permissions, clients, and protected UI follow the existing foundation patterns.
- Unnecessary complexity: none. One outbox-job record is both the transactional event and durable delivery unit; no second queue or external broker was introduced.
- Scope creep: none. No external provider, scheduled retention, Import, QR, production, listing, or sales behavior was added.

## New Reusable Thing Created?

- Yes — Operations mutation-recorder port for transaction-scoped audit and outbox creation.
- Yes — idempotency coordinator with hashed keys, canonical fingerprints, and target-reference replay.
- Yes — PostgreSQL outbox worker with claim leases, bounded retries, stale-lease rejection, dead-letter visibility, and versioned requeue.
- Yes — internal event handler registry using stable job IDs as the future handler idempotency boundary.
- Yes — Owner Operations contracts, APIs, client, and review surface.

Add these concepts and conventions to the `ARCHITECTURE.md` Reuse Map.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes; Operations module, recorder, idempotency, dispatcher, worker, and conventions now exist.
- `DECISIONS.md` — yes; atomic audit/outbox and PostgreSQL lease-based delivery are accepted foundation decisions.
- `PRODUCT.md` — no; behavior implements already accepted Safe Foundation outcomes.
- `AGENTS.md` — no; it already requires atomic outbox, privacy, and idempotency reuse.
- `ROADMAP.md` — no; delivery sequencing is unchanged.
