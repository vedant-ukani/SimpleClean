# SF-04 Review

## Status

Pass

## Checks Run

- `git diff --check 69d9e4a..27e5241` — pass
- `npm run format:check` — pass
- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — pass; 35 unit/component tests
- `npm run test:integration` — pass; 15 integration tests, with the optional external PostgreSQL-wire test skipped locally as designed
- `npm run build` — pass; shared packages, NestJS API, and all Next.js routes built successfully
- Live codegraph query for `FILES_OPERATIONS FilesService StorageAdapter` — confirmed one Files use-case boundary and one provider-neutral byte-storage port

## Findings

Initial review found the following blocking issues; all were corrected in implementation commit `27e5241`:

1. Upload/download grants were user-bound but not tied to the exact signed-in session. Grants now persist and verify the issuing session, including a test using a second valid session for the same user.
2. Incomplete-file cleanup could race an in-flight object write. Upload consumption now establishes a versioned lease; ready/failure transitions compare the lease and version, and abandonment advances the version before object deletion. A late writer removes its bytes when its compare-and-set fails.
3. Cleanup did not originally protect every still-usable upload grant. Pending records with an unconsumed, unexpired grant or active lease cannot be abandoned.
4. Load attachments omitted arrival-condition photos, and upload failures could leave stale UI. The Load panel now exposes the required purpose and refreshes lifecycle state after failure.
5. Owner Admin lacked the required incomplete-file review surface. The protected review page now lists pending/failed records and exposes guarded abandonment.
6. Security and recovery coverage was incomplete. Tests now cover cross-user and cross-session grants, expiry/reuse, guessed keys, content mismatches, path confinement, cleanup/lease races, checksum agreement, and ready-file protection.

No blocking findings remain. Malware-provider integration and automatic cleanup workers remain intentionally outside SF-04; content signature/size/checksum validation is present, and SF-05 owns durable jobs.

## Reuse / Slop Audit

- Duplicated logic: none found. File policy, token hashing/consumption, generated storage keys, target authorization, and cleanup transitions each have one canonical module implementation.
- Missed reuse: none. Files consumes the exported Inventory operations for target validation and reuses current Identity sessions, shared permissions, `DatabaseConnection`, runtime contracts, and same-origin web clients.
- Style mismatches: none blocking. Repository transactions, immutable activity, versioned compare-and-set behavior, and role-aware UI follow the existing foundation patterns.
- Unnecessary complexity: none. The upload lease is required because PostgreSQL and object storage cannot commit atomically.
- Scope creep: none. OCR, thumbnails, public sharing, malware-provider integration, retention deletion, Shopify publication, receipts accounting, QR labels, and automatic workers were not introduced.

## New Reusable Thing Created?

- Yes — the Files module service interface at `apps/api/src/modules/files/files.service.ts` for future Inventory, Import, Production, Listing, and Logistics collaborators.
- Yes — the provider-neutral `StorageAdapter` with local and S3-compatible implementations.
- Yes — runtime file contracts and canonical role permissions in `packages/contracts`.
- Yes — generated private object keys, byte-signature validation, verified checksums, session-bound one-time grants, and lease/version cleanup behavior.
- Yes — immutable privacy-safe file activity and reusable Machine/Load attachment UI.

Add these concepts and conventions to the `ARCHITECTURE.md` Reuse Map.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes; Files service, storage adapter, content policy, grants, leases, and immutable activity now exist.
- `DECISIONS.md` — yes; private metadata/object separation and session-bound one-time grants are accepted foundation decisions.
- `PRODUCT.md` — no; behavior implements already accepted Safe Foundation scope.
- `AGENTS.md` — no; existing module ownership, privacy, authorization, and state rules remain sufficient.
- `ROADMAP.md` — no; delivery sequencing is unchanged.
