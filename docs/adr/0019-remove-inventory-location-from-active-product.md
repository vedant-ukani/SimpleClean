# ADR 0019 — Remove Inventory Location from the active product

## Status

Accepted

## Context

The current operational pilot does not need to assign Machines to named physical Inventory Locations. The retained Location APIs, relocation command, history, permissions, Intake destination compatibility path, and UI facts add workflow and maintenance cost without supporting the current receiving, identity, inspection, QR, or Catalog outcomes.

Historical databases may already contain Location definitions, Machine assignments, Intake destinations, relocation history, and related audit/outbox records. Removing the active feature must not erase or invalidate that immutable history.

## Decision

Remove Inventory Location, Machine relocation, and Intake destination from active contracts, permissions, APIs, services, repository behavior, search, and web interfaces. New Machines and Intake Batches have no active Location fact. The Machines overview uses the existing nullable Machine `model` value for a **Model Number** column in place of Location.

Keep historical SQL migrations and persisted Location, assignment, destination, relocation, audit, outbox, and idempotency rows intact. Active Drizzle declarations and application paths do not read or write those legacy fields. Retain legacy Operations action and target discriminants only so immutable historical records remain parseable.

This decision supersedes ADR 0009's retained Location-domain behavior. It does not affect seller/pickup addresses, customer or shipping destinations, logistics tracking/GPS, browser URLs, or OCR evidence coordinates.

## Consequences

- Machine search covers internal ID, manufacturer, model, serial, and Load facts, not Location.
- Machine detail and Scan show no Location fact, relocation action, or Location history.
- Existing Location data remains recoverable but dormant; there is no active mutation or migration that deletes it.
- Reintroducing physical location tracking later requires a new explicit product decision and migration plan rather than silently reviving the legacy interfaces.
