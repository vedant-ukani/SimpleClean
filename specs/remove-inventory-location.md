# remove-inventory-location — Remove Inventory Location from the active product

## Goal

Remove Inventory Location as an active application concept while preserving unrelated geographic/address concepts and immutable historical data. Machines no longer expose, search, assign, or change a physical Location. The Machines overview replaces its Location column with the Machine's recorded Model Number.

## Ticket Summary

- Remove active Location CRUD, Machine relocation, relocation history, and Intake destination behavior from shared contracts, authorization, API services/controllers/repositories, web clients, and UI.
- Remove current Location fields from active Machine and Machine-detail payloads.
- Stop Machine search from joining or matching Location code/name.
- Remove Location from Scan results and Machine detail.
- Change the Machines overview column from **Location** to **Model Number**, rendering `machine.model` through the existing unknown-value formatter.
- Preserve old database rows, old migration files, audit/outbox discriminants, and unrelated address, logistics, browser URL, and OCR-evidence-location behavior.

## Expected Output

- `/machines` columns are Machine, Serial, Model Number, and Type / Capacity.
- Machine rows remain full-row links with the same responsive and accessible behavior.
- Machine detail has no current-location fact, relocation form, or location-history panel.
- Scan results contain no Location fact.
- `/inventory/locations`, `/inventory/locations/:id`, `/inventory/machines/:id/relocate`, and `/inventory/intake/:batchId/destination` are no longer application routes.
- Active Machine, Machine Detail, Machine create, and Intake Batch contracts contain no Inventory Location fields.
- No active permission allows Location management or Machine relocation.
- Existing persisted Location and relocation records are not deleted.

## Non-Goals

- Do not remove seller/pickup addresses, customer or shipping destinations, logistics GPS/location pings, browser `window.location`, or OCR evidence coordinates.
- Do not delete or rewrite historical migrations or stored Location, relocation, Intake destination, audit, outbox, or idempotency rows.
- Do not remove legacy Operations action/target literals needed to parse immutable historical records; ensure active code no longer produces them.
- Do not rename the canonical Machine field from `model` to `modelNumber`; **Model Number** is presentation copy for `Machine.model`.
- Do not redesign the Machines overview beyond the requested column replacement.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `packages/contracts/src/inventory.ts` | Canonical Machine, Location, relocation, and detail contracts. |
| `packages/contracts/src/intake.ts` | Intake destination contract and legacy error values. |
| `packages/contracts/src/authorization.ts` | Canonical Location/relocation permissions. |
| `apps/api/src/modules/inventory/inventory.controller.ts` | Active Location and relocation HTTP routes. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Inventory service interface and active mutation policy. |
| `apps/api/src/modules/inventory/inventory.repository.ts` | Location CRUD, Machine location joins/search, creation assignment, and relocation history. |
| `apps/api/src/modules/inventory/intake/**` | Intake destination route, validation, locking, and initial-location assignment. |
| `apps/web/src/app/(protected)/machines/**` | Overview, detail facts, relocation UI, and history. |
| `apps/web/src/app/(protected)/scan/scan-view.tsx` | Scan result Location fact. |
| `packages/database/src/schema.ts` | Active Drizzle declarations for legacy Location storage. |

## Files to Modify

| File/area | Required change |
|---|---|
| `packages/contracts/src/inventory.ts` | Remove Inventory Location schemas/types/responses, Machine current-location fields, location history, create-location input, create-Machine location input, and relocation input. |
| `packages/contracts/src/intake.ts` | Remove active `destinationLocationId`, destination command schema/type, and route payload dependencies. Retain only legacy error values proven necessary to parse stored history. |
| `packages/contracts/src/authorization.ts` and tests | Remove Location read/manage and Machine-relocate permissions and role grants. |
| `packages/database/src/schema.ts` and `packages/database/src/index.ts` | Remove active Drizzle declarations/exports for Inventory Location, current Machine location, relocation history, and Intake destination. Do not edit prior migrations or delete stored data. |
| `apps/api/src/modules/inventory/inventory.controller.ts` | Remove Location CRUD and Machine relocation endpoints. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Remove Location and relocation methods from `InventoryOperations` and its implementation. |
| `apps/api/src/modules/inventory/inventory.repository.ts` | Remove Location/history mappers and CRUD, current-location joins/serialization/search, creation assignment, and relocation mutation/history writes. Preserve identity, Load, lifecycle, import, Catalog, and production ports. |
| `apps/api/src/modules/inventory/intake/intake.controller.ts` | Remove the destination endpoint. |
| `apps/api/src/modules/inventory/intake/intake.service.ts` | Remove destination parsing/mutation and active destination error mapping. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | Stop reading, validating, locking, or applying Intake destinations and initial relocation history. New Intake Machines remain location-free. |
| `apps/web/src/lib/inventory-client.ts` | Remove Location reads and relocation mutation. |
| `apps/web/src/lib/intake-client.ts` | Remove the unused destination mutation client. |
| `apps/web/src/app/(protected)/machines/machines-view.tsx` | Replace Location with Model Number, remove location copy from search placeholder and accessible row name, and keep full-row links. |
| `apps/web/src/app/(protected)/machines/[machineId]/page.tsx` | Stop permission checks and Location loading/props. |
| `apps/web/src/app/(protected)/machines/[machineId]/machine-detail-view.tsx` | Remove current Location, relocation handler/form, and Location history. |
| `apps/web/src/app/(protected)/scan/scan-view.tsx` | Remove the Location result fact. |
| `apps/web/src/app/styles.css` | Rename/remove overview location-specific selectors without changing the selected table layout. |
| Affected unit/integration/browser tests | Remove Location fixtures and journeys; assert Model Number and absence of Location/relocation APIs and UI. |

## Files to Reference Only

| File | Why |
|---|---|
| `packages/contracts/src/operations.ts` | Legacy Location/relocation discriminants may be required to read immutable audit/outbox history. |
| `packages/database/drizzle/0002_inventory_foundation.sql` and `0008_inventory_intake.sql` | Historical schema creation; append-only and must not be rewritten. |
| `apps/api/src/modules/production/**` | Production may consume `Machine`; it must not acquire Location responsibilities. |
| `apps/api/src/modules/imports/**` | Imports continue using the Inventory service boundary without physical Location. |
| `apps/api/src/modules/inventory/qr/**` | QR resolution returns the reduced Machine Detail contract and retains privacy behavior. |

## Files Not to Touch

- `source-materials/**` — immutable migration input.
- Historical SQL migrations — preserve installed database history.
- Logistics, sales, CRM, and communication code that uses geographic destinations or addresses.
- Browser routing and QR URL parsing that uses `window.location` or URL origins/fragments.
- OCR/recognition evidence coordinates or text that describes a value's location in an image.

## Codegraph Findings (live, this ticket)

- `InventoryLocation` has callers in the Inventory repository/service and Machine detail UI; there is no remaining standalone Locations page.
- `RelocateMachineRequest` feeds the web Inventory client and Inventory relocation service/repository path.
- `MachineDetail.locationHistory` is rendered only on Machine detail and included in QR-resolved detail payloads.
- Intake still retains a compatibility destination endpoint and repository logic even though active Intake UI no longer fetches or renders it.
- The current codegraph index reports pending changes; all findings were confirmed against on-disk source with repository search.
- The canonical Model Number value is nullable `Machine.model` / `inventory_machine.model`; no separate `modelNumber` fact exists.

## Reuse Audit

Reused:

- Reuse `recorded(machine.model)` for the overview Model Number value.
- Reuse existing full-row Machine links, result-grid layout, route-state mapping, server-state synchronization, Inventory service boundary, and authorization policy.
- Preserve Operations' legacy discriminants to read immutable audit history rather than inventing an archive translator.

New code justified because:

- No new business helper is required. Test-only fixture builders may be tightened if they remove repeated obsolete Location fields without hiding assertions.

Do not duplicate:

- Machine model formatting, permissions, route-state mapping, Inventory serialization, or Intake commit policy.

Escalated to human:

- None. The user explicitly removed Inventory Location from scope. This spec chooses non-destructive deactivation: active code stops reading/writing it while historical storage remains intact.

## Implementation Plan

1. Reduce contracts and authorization first so stale callers fail at compile time.
2. Remove active Inventory Location/relocation and Intake destination endpoints, service methods, repository queries, and serializers.
3. Remove Location declarations from the active Drizzle schema/exports while retaining physical historical tables/columns and prior migrations.
4. Remove web Location reads, props, facts, controls, history, and client mutations.
5. Replace the Machines overview Location column with `Model Number` backed by `machine.model`; update responsive class names and accessible row labels.
6. Update fixtures and focused contract, API, web, QR, Intake, Production, authorization, and browser tests. Replace relocation journeys with retained identity/QR/production boundary assertions.
7. Run focused checks, then all deterministic project gates.

## Constraints

- Preserve unrelated user changes and the completed scanner/QR work.
- Preserve current identity, Load provenance, Intake evidence, Catalog linkage, Production lifecycle, QR, audit, idempotency, and outbox invariants.
- Do not erase existing Location or relocation records.
- Do not let removed destination handling block Intake; every new Intake Machine is created without Location.
- Machine search remains bounded and paginated across ID, manufacturer, model, serial, and Load facts.
- Existing audit/outbox rows using legacy Location actions or target types must remain parseable.
- Follow `AGENTS.md`, including module ownership and reuse-vs-inline rules.

## Tests Required

- Focused contract/authorization unit tests for reduced Machine and Intake payloads.
- Inventory integration tests for location-free create/get/search/identity/lifecycle behavior and `404` on removed HTTP routes.
- Intake integration tests for location-free batch commit with no destination command.
- Web unit tests for Model Number, absent Location/relocation UI, and reduced Machine fixtures.
- QR/Scan tests for the reduced Machine Detail response and absent Location display.
- Browser tests across desktop, tablet portrait, and tablet landscape for Machine search, full-row detail navigation, Scan, Intake, and absence of relocation controls.
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- `git diff --check`

## Done Criteria

- No active API, contract, permission, UI, search behavior, service method, or repository mutation exposes Inventory Location, Intake destination, or Machine relocation.
- `/machines` shows Model Number in the former Location column using the canonical nullable `model` value.
- Machine detail and Scan contain no Location field or relocation/history surface.
- Historical database/migration/audit records are preserved and active audit reads remain compatible.
- Unrelated geographic/address, logistics, browser URL, and OCR coordinate behavior is unchanged.
- Required deterministic checks pass with no duplicate policy or formatting logic introduced.
