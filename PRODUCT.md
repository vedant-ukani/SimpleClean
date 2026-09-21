<!-- PRODUCT.md — product intent: what we are building, for whom, and what success looks like. -->

# Product

## What are we building?

One Core Operations Platform that follows every physical laundry Machine from acquisition and receiving through production, sale, delivery, warranty, or parts disposition. The first implementation milestone is the Safe Foundation: identity and permissions, core records, files, audit/events, inventory migration, QR identity, and a role-based tablet shell.

## Who is it for?

- William and future Owner Admin users who approve, supervise, price, sell, and resolve exceptions.
- Warehouse workers who receive, identify, locate, pack, and dispatch equipment.
- Technicians and cleaners who later test, repair, document, clean, and hand equipment to QA.
- Sellers, buyers, drivers, and integration clients through constrained interfaces in later releases.

## Core user journeys

1. Owner Admin imports and reviews existing inventory without corrupting authoritative records.
2. Warehouse staff identify a Machine under an Acquisition Load, attach evidence, assign a location, and attach a QR label.
3. Authorized staff scan a QR code to retrieve the exact Machine and its permitted history.
4. Every consequential mutation is attributable, auditable, and available to reliable background work.
5. Later modules reuse the same Machine identity and operational history for production, listings, sales, fulfillment, warranty, and accounting projections.

## Success criteria

- Every Machine has one immutable internal identity and searchable history.
- Roles are enforced by the server, including on shared tablets.
- Spreadsheet migration is staged, reviewed, idempotent, and traceable to source rows.
- Files remain private and are linked to authoritative records through validated metadata.
- Retried commands and jobs do not create duplicate business results.
- The Safe Foundation passes unit, API/database integration, and browser-level workflow tests.

## Non-goals

- Finalizing warehouse checklist steps before observation and William's approval.
- Implementing production, sales, CRM, logistics, accounting, or external-channel automation in the foundation milestone.
- Using Shopify, QuickBooks, spreadsheets, AI Surfer, or generated documents as the operational source of truth.
- Building microservices, a native tablet app, or autonomous consequential AI behavior.
