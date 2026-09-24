# intake-catalog-alias-and-latency Review

## Status

Pass

## Checks Run

- Read the implementation against `specs/intake-catalog-alias-and-latency.md` and the Catalog/Intake invariants in `ARCHITECTURE.md`, ADR 0017, and ADR 0018.
- Recomputed the five pre-existing Catalog dataset SHA-256 hashes; every hash remains byte-for-byte identical to its pre-ticket value.
- Validated the new alias-only manifest checksum and confirmed it contains zero model revisions.
- Confirmed all 92 reviewed nameplate labels resolve through explicit aliases: 48 Dexter labels and 44 Continental Girbau labels.
- Confirmed live punctuation variants are covered, including `DEXTER LAUNDRY, INC` and `THE DEXTER CO.`.
- Confirmed cross-manufacturer alias collisions are rejected and no fuzzy, suffix-stripping, substring, or corporate-parent matching was introduced.
- Confirmed Google OCR keeps the 4000px analysis derivative while OpenAI receives the existing private, metadata-stripped 2000px preview with `detail: "auto"`.
- Confirmed the shared provider timeout now covers both response headers and bounded body reading in one abortable budget.
- Confirmed success, retry, and failure paths persist only bounded, privacy-safe attempt timings, byte counts, outcomes, and safe error codes.
- Reran focused contract/API tests: 117 tests passed.
- Reran the complete API integration suite: 61 tests passed across 10 files.
- Agent B also ran and passed `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run test:browser` (25 passed, 2 skipped), and `npm run build`.
- Imported `manufacturer-aliases.2026-09-24` into the local Catalog successfully: 2 manufacturers, 0 models.

## Findings

No blocking findings. The implementation satisfies the ticket and preserves exact Catalog identity semantics, Files ownership of private evidence, OCR character authority, worker-claim fencing, API compatibility, and existing official-source discovery policy.

## Reuse / Slop Audit

- Reuses the existing Catalog normalization, alias persistence, manifest checksum, exact model resolution, approved source identities, and discovery service.
- Reuses the existing upload-time private preview rather than creating another semantic-image pipeline.
- Reuses the Files operations boundary, storage adapter, checksum validation, provider-neutral HTTP transport, recognition provenance, and deterministic test adapters.
- No duplicate manufacturer matcher, image store, retry system, schema migration, or UI state path was added.
- The new manifest composition behavior is centralized and rejects ambiguous alias ownership.

## New Reusable Thing Created?

- Yes: ordered Catalog manifests can now contribute additive aliases to an existing canonical manufacturer while enforcing checksum validity and unique identity ownership.
- Yes: Intake recognition can request paired OCR and semantic image profiles from one Files-owned interface, tied to the same source checksum.
- Yes: recognition provenance now supports bounded per-attempt stage metrics for future latency diagnosis.

## Required Fixes

None.

## Memory Updates Needed

No architecture or decision-record update is required. The implementation follows the existing module boundaries and accepted ADRs. The completed specification and Catalog alias review are the durable records for this change.
