# ADR 0005 AI Surfer Is a Constrained Automation Client

## Status

Accepted

## Context

AI Surfer can provide an always-on agent runtime and already appears to support email-oriented follow-up. Allowing an external agent runtime to own business records, share master credentials, or perform irreversible actions directly would weaken data integrity, security, and auditability.

## Decision

Treat AI Surfer as an optional automation client of the Core Operations Platform. Give it scoped, revocable credentials and narrow interfaces for reading approved context, proposing updates, producing summaries, and creating draft actions. Consequential actions require platform policy checks and human approval.

AI Surfer does not write directly to the database and is not the authoritative CRM, workflow engine, or credential store.

## Consequences

- AI Surfer can be retained or replaced without migrating core business state.
- Agent actions are attributable and auditable.
- Additional interfaces and approval queues are required.
- Fully autonomous external communication is intentionally deferred.
