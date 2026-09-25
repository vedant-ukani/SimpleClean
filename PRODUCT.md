<!-- PRODUCT.md — product intent: what we are building, for whom, and what success looks like. -->

# Laundrorama Product

## What are we building?

One Laundrorama Core Operations Platform that follows every physical used-laundry Machine from acquisition and receiving through production, sale, delivery, warranty, or parts disposition. Simple Clean is William's separate new-equipment business and is not the authority for this used-equipment workflow. The completed first implementation milestone is the Safe Foundation: identity and permissions, core records, files, audit/events, inventory migration, QR identity, and a role-based tablet shell.

## Who is it for?

- William and future Owner Admin users who approve, supervise, price, sell, and resolve exceptions.
- Warehouse workers who receive, identify, pack, and dispatch equipment.
- Technicians and cleaners who later test, repair, document, clean, and hand equipment to QA.
- Sellers, buyers, drivers, and integration clients through constrained interfaces in later releases.

## Core user journeys

1. Owner Admin imports and reviews existing inventory without corrupting authoritative records.
2. Warehouse staff plan unreceived Loads in UTC date groups—Overdue, Today, Upcoming, or No arrival date—then batch-select one nameplate photo per Machine and recognition starts immediately without another Upload action or pre-classification. After each result is ready they choose the observed type; failed evidence can be replaced or removed from active Intake without deleting its history. They add the complete remaining ready Intake to Inventory once. Closing the final open Intake Batch marks the Load received and removes it from Warehouse Expected Loads, then they open one printable QR sheet even when capacity is not yet known.
3. Authorized staff use the protected Scan page's explicit in-app camera, an external QR scanner, or the printed fallback code to retrieve the exact Machine and its permitted history.
4. Warehouse and Technician staff record an attributable preliminary inspection with optional private evidence; safe dispositions update Production while Parts-only or Scrap requires Owner Admin approval before Inventory becomes Scrapped.
5. A dedicated Washer or Dryer Technician's specialty-filtered My Work starts with a tap-only bearing check: a smooth Machine proceeds to its generated Test Work Order, while a concern or inability to assess routes to Owner review. The technician groups up to 20 matching Machines in one resumable server-timed session, marks each Working, Running cycle, or Waiting, and opens the individual checklist by QR without typing. A passing full Test retains one verified private Machine video; a failed Test proceeds to Repair without requiring a success video. Cleaners receive no testing queue.
6. Every consequential mutation is attributable, auditable, and available to reliable background work.
7. Later modules reuse the same Machine identity and operational history for production, listings, sales, fulfillment, warranty, and accounting projections.

## Success criteria

- Every Machine has one immutable internal identity and searchable history.
- Roles are enforced by the server, including on shared tablets.
- Spreadsheet migration is staged, reviewed, idempotent, and traceable to source rows.
- Files remain private and are linked to authoritative records through validated metadata.
- Retried commands and jobs do not create duplicate business results.
- Intake recognition for one Machine is not invalidated when the worker photographs the next; every Candidate must be recognition-ready and have a human-selected type before one explicit final action atomically creates the Intake's Machines.
- A Load remains expected through upload, recognition, and individual Machine commit; the transaction that closes its final open Intake Batch marks it received exactly once.
- Warehouse Expected Loads use UTC date grouping without changing the receipt rule, keep undated Loads visible, and omit commercial source fields from the Warehouse list.
- OpenAI may assign nameplate fields only when the returned characters are supported by bounded Google OCR from the same photo; broad OCR blocks do not reject an otherwise exact identity value.
- Every approved photo-Intake Candidate is preserved as a separate provisional Machine, including matching manufacturer-and-serial values; Intake never merges Machines automatically.
- Accepted nameplate identity can be enriched from an approved, versioned manufacturer/model catalog without blocking Intake, inventing missing characters, or overwriting physical Machine facts.
- Unsupported full models may be researched automatically, but only deterministic facts for that exact model or a safely related officially documented leading base model from provider-returned official manufacturer URLs become Catalog defaults; the full nameplate model remains preserved. Failed, conflicting, unrelated, or third-party research remains unknown and never blocks Intake.
- Preliminary Inspection preserves immutable observations, decisions, private evidence links, actors, reasons, and timestamps while keeping Inventory and Production state separate; it never implies full test, repair, clean, QA Release, listing eligibility, or shipment readiness.
- Technician My Work and QR routing reuse server-owned specialty and lifecycle rules. Initial bearing checks require no typing, and a successful full Test cannot complete without a ready same-Machine private video linked to that exact Test run.
- Every Technician checklist write occurs inside the worker's one active timed session; per-Machine time is derived from immutable server events and waiting Machines receive no allocation.
- In-app QR scanning starts only after a worker action, decodes camera frames locally without storing or uploading them, and resolves only the platform's signed same-origin Machine labels through normal session authorization.
- The Safe Foundation passes unit, API/database integration, and browser-level workflow tests.

## Non-goals

- Finalizing warehouse checklist steps before observation and William's approval.
- Implementing production, sales, CRM, logistics, accounting, or external-channel automation in the foundation milestone.
- Using Shopify, QuickBooks, spreadsheets, AI Surfer, or generated documents as the operational source of truth.
- Building microservices, a native tablet app, or broad autonomous consequential AI behavior. ADR 0017 as refined by ADR 0018 defines the sole narrow automatic-publication exception for deterministic official-source Catalog facts.
