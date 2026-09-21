# ADR 0003 Separate Operational State Axes

## Status

Accepted

## Context

A Machine may be physically on hand, advertised for sale, reserved by a buyer, awaiting repair, and not yet released by QA at the same time. A single status field cannot represent these facts without producing ambiguous combinations and brittle transitions.

## Decision

Represent inventory, production, listing, sales, payment, and shipment states separately. Coordinating rules react to events between those lifecycles. For example, a Deposit Received event reserves inventory and creates a prioritized Production Work Order without falsely marking the Machine as QA Released.

## Consequences

- The software reflects the real workflow without inventing compound statuses.
- Reporting and permissions become clearer.
- Cross-lifecycle invariants and transition tests are required.
