# SF-03 Review

## Status

Pass

## Checks Run

- `git diff --check 50f0b17..e9fc904` — pass
- `npm run format:check` — pass
- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm test` — pass; 17 unit/component tests
- `npm run test:integration` — pass; 12 integration tests, with the optional external PostgreSQL-wire test skipped locally as designed
- `npm run build` — pass; shared packages, NestJS API, and all protected Next.js routes built successfully
- Live codegraph query for `InventoryService` — confirmed the exported module service is the sole Inventory use-case boundary used by the controller/module

## Findings

Initial review found the following blocking issues; all were corrected in follow-up commit `e9fc904`:

1. A duplicate `received_at` assignment made successful Load updates invalid. The assignment is now singular and a successful versioned update is covered by integration testing.
2. A duplicate nested version guard in verification was removed.
3. Verification/conflict decisions lacked authenticated actor/request history. They now create immutable transactionally consistent verification-history records for ordinary, conflict, and concurrent-conflict paths.
4. The original concurrency assertion proved only one unique claim. The strengthened test identifies winner and loser, proves the loser persisted as a linked `conflict`, validates both histories, and proves history update/delete is blocked.
5. Machine search treated `%` and `_` as SQL wildcards. One canonical escaping helper and explicit SQL escape semantics now preserve literal search intent, with integration coverage.

No blocking findings remain.

## Reuse / Slop Audit

- Duplicated logic: none found after fixes. Identity matching and SQL-like escaping each have one canonical module helper.
- Missed reuse: none. Inventory reuses current request identity, shared authorization, `DatabaseConnection`, Zod contracts, migrated PGlite setup, same-origin proxy, and protected layout.
- Style mismatches: none blocking. Repository transactions, result mapping, runtime schemas, and role-aware presentation follow established patterns.
- Unnecessary complexity: none. The identity-claim table is justified by concurrency correctness; no OCR, file, cost, checklist, or final lifecycle behavior was introduced.
- Scope creep: none. User/Profile remains in Identity; Inventory did not duplicate it.

## New Reusable Thing Created?

- Yes — Inventory module service interface at `apps/api/src/modules/inventory/inventory.service.ts` for later import, file, QR, production, and listing collaborators.
- Yes — canonical Machine/load/location runtime contracts in `packages/contracts/src/inventory.ts`.
- Yes — normalized manufacturer/serial identity claims and Inventory-owned normalization in `apps/api/src/modules/inventory/normalization.ts`.
- Yes — optimistic versioned mutation/result pattern for operational records.
- Yes — immutable identity evidence, verification history, and location history patterns.

Add these concepts and conventions to the `ARCHITECTURE.md` Reuse Map.

## Required Fixes

None.

## Memory Updates Needed

- `ARCHITECTURE.md` / Reuse Map — yes; Inventory module, contracts, identity claims/evidence, relocation history, and versioning now exist.
- `DECISIONS.md` — yes; provisional identity plus explicit unique verification claims is now an accepted operational identity design.
- `PRODUCT.md` — no; behavior implements already accepted Safe Foundation scope.
- `AGENTS.md` — no; existing module ownership, state separation, authorization, and reuse rules remain sufficient.
- `ROADMAP.md` — no; delivery sequencing is unchanged.
