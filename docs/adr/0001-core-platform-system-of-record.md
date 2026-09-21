# ADR 0001 Core Operations Platform Is the System of Record

## Status

Accepted

## Context

The workflow spans inventory, sales, refurbishment, communications, payments, and shipping. Shopify, Facebook, spreadsheets, email, telephone systems, accounting software, freight providers, and AI tools each hold partial and sometimes conflicting information.

## Decision

The Core Operations Platform is authoritative for Machines, availability, Leads, Quotes, Reservations, Sales Orders, Production Work Orders, Shipments, and workflow state. External tools receive projections or submit constrained commands through integrations.

Shopify remains authoritative for its channel checkout events. QuickBooks remains authoritative for the general ledger. External facts are imported, reconciled, and represented in the platform without allowing those tools to redefine unrelated operational state.

## Consequences

- Staff have one operational view.
- Availability and reservations can be enforced consistently.
- Integrations require identifiers, reconciliation, retry handling, and visible errors.
- Spreadsheet editing can no longer be treated as an authoritative operational update after migration.
