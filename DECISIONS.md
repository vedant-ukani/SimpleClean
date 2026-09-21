<!-- DECISIONS.md — important architectural/product decisions, why they were made, and tradeoffs. ADR-style, newest first. -->

# Decisions

## 2026-09-20 — Greenfield workspace structure

The implementation will use one TypeScript workspace with a Next.js web application, a NestJS API, and shared packages only for cross-application decisions such as contracts, configuration, database access, and test support. Domain behavior remains inside explicit API modules. This preserves the accepted modular-monolith decision while preventing premature microservices or a generic shared-code dumping ground.

## Existing accepted decisions

The detailed rationale and consequences remain canonical in these ADRs:

- [ADR 0001 — Core Operations Platform is the system of record](./docs/adr/0001-core-platform-system-of-record.md)
- [ADR 0002 — Modular monolith and evented integrations](./docs/adr/0002-modular-monolith-and-evented-integrations.md)
- [ADR 0003 — Separate operational state axes](./docs/adr/0003-separate-operational-state-axes.md)
- [ADR 0004 — Supervised Facebook Marketplace automation](./docs/adr/0004-supervised-facebook-marketplace-automation.md)
- [ADR 0005 — AI Surfer is a constrained automation client](./docs/adr/0005-ai-surfer-is-a-constrained-automation-client.md)
