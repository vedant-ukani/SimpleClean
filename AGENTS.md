# Simply Clean Agent Instructions

Before planning or changing this project, read:

1. [ARCHITECTURE.md](./ARCHITECTURE.md) for scope, workflows, modules, states, integrations, invariants, and delivery order.
2. [CONTEXT.md](./CONTEXT.md) for canonical domain language.
3. Relevant records in [docs/adr](./docs/adr/) for accepted architectural decisions.

Implementation rules:

- The Core Operations Platform is authoritative for operational state.
- Keep inventory, production, listing, sales, payment, and shipment states separate.
- Build a modular monolith with explicit module interfaces and adapters at external seams.
- Keep serialized machine identity and workflow history in the platform, not Shopify or QuickBooks.
- Treat external webhooks as retried and possibly duplicated.
- Require approval and audit for consequential AI actions, pricing, publication, refunds, QA release, and shipment release.
- Do not automate a personal Facebook Marketplace account through an unattended VPS browser.
- Do not invent answers to open questions in ARCHITECTURE.md.
- Preserve user data and unrelated changes. Test module interfaces and cross-lifecycle invariants.

Repository conventions discovered during initial analysis:

- This is a greenfield application; existing Python/JavaScript files generate communication artifacts and are not application foundations.
- Application code belongs in the TypeScript workspace established by `SF-01`; do not import from `.codex-build/` or `build_workflow_doc.py`.
- Domain modules own their behavior and persistence interfaces. Do not reach into another module's tables from route/controller code.
- Validate untrusted input at the application boundary and enforce authorization again in the owning service.
- Persist a domain mutation and its outbox event in one database transaction.
- Treat `Inventory List.xlsx` as read-only migration input. Preserve source values and row provenance.
- Do not log secrets, tokens, PII, file contents, or complete communication payloads.

Testing commands:

- `npm run lint` — lint the full TypeScript workspace.
- `npm run typecheck` — type-check all shared packages and applications.
- `npm test` — run the workspace unit tests.
- `npm run test:integration` — run deterministic PGlite API/database integration tests locally.
- `npm run build` — produce all shared-package, API, and web production builds.

Reuse vs inline:

Reuse when the logic is a decision; inline when it is a description.

- Reuse rules that must remain consistent, such as authorization, identity normalization, idempotency, state transitions, and file policy.
- Inline locally obvious rendering and label shaping that contains no business rule.
- Do not repeat knowledge. Repeating small non-decision code can be clearer than introducing a premature abstraction.
