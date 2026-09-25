# Review — AUT-357 Preliminary inspection and disposition

## Outcome

Accepted after fixes. The implementation matches the reviewed ticket: authorized staff can record a tablet-friendly Preliminary Inspection with optional private evidence, history is immutable and attributable, and current Inventory and Production states remain separate.

## Findings resolved

- Migration 0015 originally changed populated `not_started` rows before removing the old production-state check. The migration now removes that constraint first, and a populated pre-0015 upgrade regression proves the transition to `not_assessed`.
- Inventory relocation originally forced every moved Machine to `on_hand`, which could reverse an Owner-approved Parts-only/Scrap decision. Relocation now rejects Scrapped Machines, and the integration journey proves state and version remain unchanged.
- The shared browser JSON mutation helper now retries one transport failure with the identical idempotency key and preserves status-bearing HTTP failures.

## Specification and architecture review

- Production owns inspection/disposition behavior and immutable history; Inventory owns current Machine lifecycle fields; Files owns private evidence. Cross-module changes use explicit transaction-aware service interfaces.
- Repairable maps to Production Preliminary Passed with Inventory On Hand. Hold and Owner Review map to Production Blocked with Inventory On Hand. Parts-only and Scrap map to Production Blocked and Inventory Scrapped only with Owner Admin approval.
- Warehouse and Technician Parts-only/Scrap recommendations route to Owner Review. Bearing assessment remains observational and never causes an automatic disposition.
- Inspection, evidence links, disposition, lifecycle update, idempotency completion, audit, and outbox records commit atomically. Stale versions, invalid evidence, changed-input retries, non-latest decisions, and forced recorder failures leave no partial result.
- Preliminary approval does not create a test, repair, clean, QA Release, listing, sale, or shipment release.

## Reuse and slop audit

- Reused the shared authorization policy, Files and Inventory module interfaces, Operations idempotency/mutation recorder, protected route-state synchronization, attachment flow, and responsive panel/form patterns.
- Added one justified Production domain boundary and one reusable browser JSON mutation helper. No alternate Machine write, file-policy, authorization, audit/outbox, or request-transport implementation was introduced.

## Verification

Independent final verification passed workspace lint and typecheck; 263 unit tests; 71 API integration tests plus 4 database integration tests with 1 intentional PostgreSQL-only skip; production build; and 28 Playwright journeys with 2 intentional skips across desktop, tablet portrait, and tablet landscape. The browser journey covers Warehouse evidence upload and Parts-only recommendation, Owner approval, separate lifecycle states, reload persistence, accessibility, and horizontal-overflow checks.
