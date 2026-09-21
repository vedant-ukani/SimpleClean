# ADR 0002 Modular Monolith and Evented Integrations

## Status

Accepted

## Context

The business needs several distinct capabilities, but they participate in the same equipment lifecycle and require strong consistency around identity, availability, reservations, and production. Independent microservices would create distributed transactions and operational burden before scale requires them.

## Decision

Implement the Core Operations Platform as a modular monolith with one PostgreSQL database. Modules interact through explicit internal interfaces. Integration work is performed asynchronously from a transactional outbox by durable workers.

## Consequences

- Initial development, deployment, querying, and transactions remain straightforward.
- Module seams preserve a future path to extraction.
- Long-running and retryable integration work does not block user requests.
- Module ownership and database access rules must be enforced in code review because the database is shared.
