<!-- PRODUCT.md — product intent: what we are building, for whom, and what success looks like. -->

# Laundrorama Product

## What are we building?

One Laundrorama Core Operations Platform that follows every physical used-laundry Machine from acquisition and receiving through production, sale, delivery, warranty, or parts disposition. Simple Clean is William's separate new-equipment business and is not the authority for this used-equipment workflow. The completed first implementation milestone is the Safe Foundation: identity and permissions, core records, files, audit/events, inventory migration, QR identity, and a role-based tablet shell.

## Who is it for?

- William and future Owner Admin users who approve, supervise, price, sell, and resolve exceptions.
- Warehouse workers who receive, identify, locate, pack, and dispatch equipment.
- Technicians and cleaners who later test, repair, document, clean, and hand equipment to QA.
- Sellers, buyers, drivers, and integration clients through constrained interfaces in later releases.

## Core user journeys

1. Owner Admin imports and reviews existing inventory without corrupting authoritative records.
2. Warehouse staff batch-select one nameplate photo per Machine under an Acquisition Load and recognition starts immediately without another Upload action or pre-classification. After each result is ready they choose the observed type; failed evidence can be replaced or removed from active Intake without deleting its history. They add the complete remaining ready Intake to Inventory once, then open one printable QR sheet even when capacity is not yet known.
3. Authorized staff scan a QR code to retrieve the exact Machine and its permitted history.
4. Every consequential mutation is attributable, auditable, and available to reliable background work.
5. Later modules reuse the same Machine identity and operational history for production, listings, sales, fulfillment, warranty, and accounting projections.

## Success criteria

- Every Machine has one immutable internal identity and searchable history.
- Roles are enforced by the server, including on shared tablets.
- Spreadsheet migration is staged, reviewed, idempotent, and traceable to source rows.
- Files remain private and are linked to authoritative records through validated metadata.
- Retried commands and jobs do not create duplicate business results.
- Intake recognition for one Machine is not invalidated when the worker photographs the next; every Candidate must be recognition-ready and have a human-selected type before one explicit final action atomically creates the Intake's Machines.
- OpenAI may assign nameplate fields only when the returned characters are supported by bounded Google OCR from the same photo; broad OCR blocks do not reject an otherwise exact identity value.
- Every approved photo-Intake Candidate is preserved as a separate provisional Machine, including matching manufacturer-and-serial values; Intake never merges Machines automatically.
- Accepted nameplate identity can be enriched from an approved, versioned manufacturer/model catalog without blocking Intake, inventing missing characters, or overwriting physical Machine facts.
- Unsupported full models may be researched automatically, but only deterministic facts for that exact model or a safely related officially documented leading base model from provider-returned official manufacturer URLs become Catalog defaults; the full nameplate model remains preserved. Failed, conflicting, unrelated, or third-party research remains unknown and never blocks Intake.
- The Safe Foundation passes unit, API/database integration, and browser-level workflow tests.

## Non-goals

- Finalizing warehouse checklist steps before observation and William's approval.
- Implementing production, sales, CRM, logistics, accounting, or external-channel automation in the foundation milestone.
- Using Shopify, QuickBooks, spreadsheets, AI Surfer, or generated documents as the operational source of truth.
- Building microservices, a native tablet app, or broad autonomous consequential AI behavior. ADR 0017 as refined by ADR 0018 defines the sole narrow automatic-publication exception for deterministic official-source Catalog facts.
