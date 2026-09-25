# restrict-catalog-to-owner-admin — Limit standalone Catalog access

## Goal

Restrict the standalone Catalog workspace and Catalog list/detail API to Owner Admin users while preserving model specifications and Machine-specific actual measurements on Machine detail for Warehouse and Technician/Cleaner users.

## Ticket Summary

- Keep `catalog.read` as the single canonical permission for standalone Catalog browsing.
- Grant `catalog.read` only to `owner_admin`.
- Remove `catalog.read` from `warehouse` and `technician_cleaner`.
- Let the existing permission-derived navigation remove the Catalog tab for roles that no longer have the permission.
- Preserve Warehouse and Technician/Cleaner access to linked approved specifications through Machine detail under `inventory.machines.read`.
- Preserve Inventory ownership of actual Machine measurements and overrides.
- Verify direct Catalog API and route access remains server-authorized, not merely hidden in navigation.

## Expected Output

- Owner Admin users can see and browse `/catalog` and `/catalog/[revisionId]`.
- Warehouse and Technician/Cleaner users do not see the Catalog navigation item.
- Direct Catalog API requests by Warehouse and Technician/Cleaner users return `403`.
- Warehouse and Technician/Cleaner users can still open authorized Machine detail and see its linked Catalog specifications.
- Existing actual-measurement behavior on Machine detail is unchanged.

## Non-Goals

- Do not remove, duplicate, or migrate Catalog model/specification data.
- Do not copy shared model facts into every Machine record.
- Do not change Catalog discovery, publication, enrichment, matching, or provenance.
- Do not change Machine actual-measurement permissions or persistence.
- Do not add role-specific conditionals to controllers or React components.
- Do not redesign Catalog or Machine detail UI.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `packages/contracts/src/authorization.ts` / `ROLE_PERMISSIONS`, `roleHasPermission` | Canonical role-to-permission policy consumed by API authorization and navigation. |
| `apps/web/src/lib/navigation.ts` / `navigationForRole` | Derives Catalog navigation visibility from `catalog.read`; no new branching is required. |
| `apps/api/src/modules/catalog/catalog.controller.ts` | Catalog list/detail endpoints already require `catalog.read`. |
| `apps/api/src/modules/catalog/catalog.service.ts` | Rechecks active identity and permission for Catalog reads. |
| `apps/api/src/modules/inventory/inventory.service.ts` / `getMachine` | Attaches linked approved Catalog resolution to Machine detail independently of standalone Catalog access. |
| `apps/web/src/app/(protected)/machines/[machineId]/machine-detail-view.tsx` | Displays inherited Catalog specifications and actual Machine measurements. |

## Files to Modify

| File | Required change |
|---|---|
| `packages/contracts/src/authorization.ts` | Remove `catalog.read` from Warehouse and Technician/Cleaner grants; retain it for Owner Admin. |
| `packages/contracts/test/authorization.test.ts` | Update role permission expectations and explicitly cover the Owner-only Catalog grant. |
| `apps/web/test/identity-ui.test.tsx` | Expect Catalog navigation only for Owner Admin. |
| `apps/api/test/catalog.integration.test.ts` | Use an Owner Admin identity for positive Catalog read coverage. |
| `apps/api/test/identity.integration.test.ts` | Cover real-session Owner success and Warehouse/Technician `403` responses for Catalog reads. |
| `tests/browser/catalog.spec.ts` | Keep the Warehouse Machine-detail specification journey and move standalone Catalog browsing to Owner Admin; assert restricted-role navigation/access as appropriate. |

## Files to Reference Only

| File | Why |
|---|---|
| `apps/web/src/lib/navigation.ts` | Existing permission-derived navigation should react automatically to the policy change. |
| `apps/api/src/modules/catalog/catalog.controller.ts` | Existing endpoint permission guard remains canonical. |
| `apps/api/src/modules/catalog/catalog.service.ts` | Existing service authorization remains canonical. |
| `apps/api/src/modules/inventory/inventory.controller.ts` | Machine detail remains authorized by `inventory.machines.read`. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Existing linked-specification composition must remain intact. |
| `apps/web/src/app/(protected)/machines/[machineId]/machine-detail-view.tsx` | Existing inherited/actual specification presentation must remain intact. |
| `apps/web/src/lib/server-route-state.ts` | Existing forbidden protected-route mapping remains canonical. |
| `specs/catalog-tab.md` | Historical implementation context for the standalone Catalog workspace. |

## Files Not to Touch

- Catalog domain implementation, contracts, schema, migrations, snapshots, source adapters, discovery, enrichment, and publication.
- Inventory Machine schema and actual-measurement implementation.
- Intake recognition and Machine-to-Catalog linking.
- Source materials, generated artifacts, and unrelated dirty-worktree files.

## Codegraph Findings (live, this ticket)

- No callable live codegraph query was available; current symbols and callers were confirmed with repository search.
- `roleHasPermission` is the shared decision used by both API authorization and permission-derived navigation.
- Catalog list/detail routes already enforce `catalog.read`; hiding navigation is not the security boundary.
- `InventoryService.getMachine` attaches linked Catalog resolution under Machine read authorization, so removing standalone `catalog.read` does not remove the specifications shown on Machine detail.
- Existing browser coverage already distinguishes Warehouse Machine-detail specifications from standalone Catalog browsing.

## Reuse Audit

Reused:

- Canonical `ROLE_PERMISSIONS` and `roleHasPermission` policy.
- Existing Catalog controller/service permission checks.
- Existing permission-derived navigation filtering.
- Existing Machine detail composition of linked Catalog facts and actual measurements.
- Existing authentication/session fixtures and protected route-state handling.

New code justified because:

- No new production abstraction is required. Only test assertions/fixtures need to change around the revised policy.

Do not duplicate:

- Role checks in navigation components, pages, controllers, or domain services.
- Catalog specification values in Inventory records.
- Machine-detail specification rendering or authorization logic.

Escalated to human:

- None. The owner explicitly chose Owner/Admin-only standalone Catalog access while retaining specifications on individual Machine detail.

## Implementation Plan

1. Change the canonical role permission map so only Owner Admin has `catalog.read`.
2. Update policy and navigation unit tests to prove the exact new grant matrix.
3. Update Catalog integration fixtures and add session-backed denial coverage for Warehouse and Technician/Cleaner.
4. Update browser acceptance so Owner Admin browses the standalone Catalog while Warehouse still sees linked specifications on Machine detail.
5. Run focused tests, then the full workspace validation gates.

## Constraints

- Preserve existing API contracts and Catalog data.
- Follow `AGENTS.md`, including the reuse-vs-inline rule.
- Keep authorization server-side and sourced from the persisted current session/profile.
- Preserve unrelated worktree changes.
- Keep changes scoped to this access-policy decision.
- Do not log secrets, credentials, PII, or sensitive payloads.

## Tests Required

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`

## Done Criteria

- Only Owner Admin has `catalog.read` in the canonical policy.
- Only Owner Admin sees the standalone Catalog navigation item.
- Warehouse and Technician/Cleaner receive server-side denial for direct Catalog reads.
- Warehouse and Technician/Cleaner retain linked specifications on authorized Machine detail.
- Catalog data and Machine actual-measurement behavior are unchanged.
- Focused and full workspace checks pass.
- No duplicate authorization or specification logic is introduced.
