# remove-retired-workspaces — Remove four obsolete web workspaces safely

## Goal

Remove the File Review, Operations, Imports, and standalone Locations workspaces from the Simple Clean staff web application so they no longer appear in navigation, dashboards, browser routes, or client-only code. Preserve the underlying domain capabilities and stored data that Intake, Inventory, attachments, audit, idempotency, and durable jobs still require.

## Ticket Summary

- Remove all four destinations from role navigation and dashboard cards.
- Remove the corresponding Next.js route trees so bookmarked web URLs return `404` rather than exposing a hidden workspace.
- Remove browser-only clients, components, and tests that exist solely for those deleted routes.
- Remove only the standalone Location management surface. Keep Location facts, search, Machine relocation, history, and Intake destination selection.
- Keep Files attachments and private evidence access. Remove only the incomplete-file review client functions and page.
- Keep the Imports and Operations API modules, contracts, database tables, migrations, audit/outbox worker, idempotency behavior, and deterministic backend tests.
- Update user-facing repository documentation and browser acceptance coverage to describe and prove the new surface area.

## Expected Output

- The only primary staff destinations are Home, Loads (when permitted), Machines, Scan, and Team (Owner Admin only).
- `/admin/files`, `/admin/operations`, `/admin/imports`, nested import URLs, and `/locations` have no web routes and return `404`.
- Machines and Intake still read active Locations; authorized staff can still relocate a Machine from its detail screen.
- Load/Machine attachments, Intake evidence, audit recording, idempotency, outbox delivery, and import history remain intact behind their existing backend boundaries.

## Non-Goals

- Do not remove Files, Imports, Operations, Inventory, or Intake API modules.
- Do not remove permissions, shared contracts, database schema, migrations, data, internal ports, or integration tests for those backend capabilities.
- Do not remove Location fields, APIs, search, Machine relocation, Location history, or Intake destination selection.
- Do not redesign the interface in this ticket; the separate `professional-ui-redesign` ticket owns that work.
- Do not rename repository paths or `@simply-clean/*` package scopes.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/web/src/lib/navigation.ts` — `navigationForRole`, `dashboardForRole` | Canonical role-derived web destinations. |
| `apps/web/src/app/(protected)/admin/files/**` | File Review route and incomplete-upload cleanup UI. |
| `apps/web/src/app/(protected)/admin/operations/**` | Audit/job-review route and retry UI. |
| `apps/web/src/app/(protected)/admin/imports/**` | Spreadsheet staging, review, approval, and commit UI. |
| `apps/web/src/app/(protected)/locations/**` | Standalone Location definition management UI. |
| `apps/web/src/lib/files-client.ts` | Shared attachment client plus two review-only functions. |
| `apps/web/src/lib/inventory-client.ts` | Shared Location reads and route-only Location mutation helpers. |
| `tests/browser/foundation.spec.ts` | Full-boundary role, route, relocation, accessibility, and responsive journeys. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/web/src/lib/navigation.ts` | Remove the four destinations, their dashboard cards, and permission helpers used only by deleted pages. Preserve permission-derived navigation for remaining destinations. |
| `apps/web/src/lib/files-client.ts` | Remove only `getIncompleteFiles`, `abandonIncompleteFile`, and review-only schema imports. Preserve upload, attachment listing, and download behavior. |
| `apps/web/src/lib/inventory-client.ts` | Remove `createLocation`, `updateLocation`, and `deactivateLocation` only if repo search confirms no remaining callers. Preserve `getLocations` and relocation clients. |
| `apps/web/test/identity-ui.test.tsx` | Assert the reduced role navigation and dashboard destinations. |
| `tests/browser/foundation.spec.ts` | Remove obsolete UI journeys; keep role, attachment, scan, relocation, reconnect, focus, touch-target, and accessibility coverage; assert removed links are absent and removed routes return `404`. |
| `README.md` | Stop advertising the deleted workspaces. Clarify that Location remains embedded in Inventory/Intake and that backend operational/import capabilities are retained without dedicated web pages. |

## Files to Delete

- `apps/web/src/app/(protected)/admin/files/page.tsx`
- `apps/web/src/app/(protected)/admin/files/incomplete-files-review.tsx`
- `apps/web/src/app/(protected)/admin/operations/page.tsx`
- `apps/web/src/app/(protected)/admin/operations/operations-filters.tsx`
- `apps/web/src/app/(protected)/admin/operations/operations-review.tsx`
- `apps/web/src/app/(protected)/admin/imports/page.tsx`
- `apps/web/src/app/(protected)/admin/imports/imports-dashboard.tsx`
- `apps/web/src/app/(protected)/admin/imports/[importRunId]/page.tsx`
- `apps/web/src/app/(protected)/admin/imports/[importRunId]/import-review.tsx`
- `apps/web/src/app/(protected)/locations/page.tsx`
- `apps/web/src/app/(protected)/locations/locations-view.tsx`
- `apps/web/src/lib/imports-client.ts`
- `apps/web/src/lib/operations-client.ts`
- `apps/web/test/files-review-ui.test.tsx`
- `apps/web/test/imports-ui.test.tsx`
- `apps/web/test/imports-client.test.ts`
- `apps/web/test/operations-ui.test.tsx`
- `apps/web/test/operations-client.test.ts`

## Files to Reference Only

| File | Why |
|---|---|
| `ARCHITECTURE.md` Reuse Map | Confirms Files, Imports, Operations, and Inventory ownership boundaries. |
| `packages/contracts/src/authorization.ts` | Permissions remain backend policy even when no dedicated page exposes them. |
| `apps/api/src/modules/files/**` | Attachments and private Intake evidence still depend on Files. |
| `apps/api/src/modules/operations/**` | Audit, idempotency, and outbox are cross-domain infrastructure. |
| `apps/api/src/modules/imports/**` | Historical migrations and backend behavior remain supported. |
| `apps/api/src/modules/inventory/**` | Location is a retained domain concept and invariant. |
| `apps/web/src/app/(protected)/machines/**` | Machine create/detail/relocation still consumes Locations. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/**` | Intake still requires a valid destination Location. |
| `apps/web/src/lib/pwa-cache-policy.ts` | Protected/API cache exclusions remain valid even for removed page paths. |

## Files Not to Touch

- `packages/database/**` — preserve schema, migrations, and historical data.
- `packages/contracts/src/files.ts`, `imports.ts`, `operations.ts`, and `inventory.ts` — backend contracts remain active.
- `apps/api/**` — this ticket removes web surfaces, not platform capabilities.
- `source-materials/**` — immutable migration/evidence inputs.

## Codegraph Findings (live, this ticket)

- `navigationForRole` feeds `ActiveNavigation`; `dashboardForRole` feeds the protected home page and is covered by `identity-ui.test.tsx`.
- File Review components are called only from `/admin/files`; their two client functions are isolated from attachment upload/download behavior.
- The Operations web components and client are isolated from `OperationsModule`; the module is imported across Identity, Inventory, Files, Imports, Intake, and QR mutation paths.
- The Imports web route owns all callers of `imports-client.ts`; backend import contracts and integration tests do not depend on the web client.
- Location mutations from the web client are used only by the standalone Locations page. `getLocations` remains called by Machines, Machine detail, and Intake.
- `tests/browser/foundation.spec.ts` currently combines obsolete import/operations journeys with still-critical Machine relocation and reconnect coverage; edit it surgically.

## Reuse Audit

Reused:

- Keep canonical authorization in `packages/contracts`; do not create a second deny list.
- Keep `navigationForRole`/`dashboardForRole` as the single role-to-UI mapping.
- Keep shared protected route state, server-state synchronization, and PWA cache policy unchanged.
- Keep Inventory-owned Location and Machine relocation rules.

New code justified because:

- A small route-absence browser assertion is needed to prove removed bookmarks do not expose hidden pages.

Do not duplicate:

- Permission checks, Location validation, attachment policy, import parsing, audit recording, idempotency, or outbox behavior.

Escalated to human:

- None. Repository evidence shows backend removal would break retained workflows, so this spec fixes the safe boundary at the web surface.

## Implementation Plan

1. Remove the four navigation/dashboard destinations and route-only permission helpers.
2. Delete the four Next.js route trees and their isolated components.
3. Remove isolated Operations/Imports clients and review-only Files/Location client functions after confirming zero remaining callers.
4. Delete obsolete web unit tests and update canonical navigation tests.
5. Replace obsolete browser journeys with link-absence and direct-route `404` checks while retaining Location relocation and other lifecycle coverage.
6. Update README route documentation without changing architecture claims.
7. Run formatting, static checks, unit tests, the browser suite, and the production build.

## Constraints

- Preserve existing API contracts and database state.
- Follow `AGENTS.md`, including module ownership and reuse-vs-inline rules.
- Preserve authorization, route-state, reconnect, accessibility, and 44px touch-target behavior.
- Keep unrelated intake-recognition and user-owned worktree changes intact.
- Do not log secrets, tokens, PII, file contents, or sensitive payloads.

## Tests Required

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:browser`
- `npm run build`

## Done Criteria

- No remaining web navigation, dashboard card, route file, or UI-only client references any removed workspace.
- Removed direct page URLs return `404` for an authenticated user.
- Location reads/relocation and Intake destination selection still work.
- Attachments, audit/outbox, import backend behavior, contracts, migrations, and stored data remain untouched.
- Required checks pass and no duplicate policy is introduced.
