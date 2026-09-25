# Laundrorama Agent Instructions

Before planning or changing this project, read:

1. [ARCHITECTURE.md](./ARCHITECTURE.md) for scope, workflows, modules, states, integrations, invariants, and delivery order.
2. [CONTEXT.md](./CONTEXT.md) for canonical domain language.
3. Relevant records in [docs/adr](./docs/adr/) for accepted architectural decisions.

Implementation rules:

- Laundrorama is the used-equipment operation; Simple Clean is the separate new-equipment business. The application workspace uses `@laundrorama/*` under [ADR 0020](./docs/adr/0020-laundrorama-technical-identity.md). The host project directory may still carry its older name and is not an application identity.
- The Core Operations Platform is authoritative for operational state.
- Keep inventory, production, listing, sales, payment, and shipment states separate.
- Build a modular monolith with explicit module interfaces and adapters at external seams.
- Keep serialized machine identity and workflow history in the platform, not Shopify or QuickBooks.
- Treat external webhooks as retried and possibly duplicated.
- Require approval and audit for consequential AI actions, pricing, publication, refunds, QA release, and shipment release. The only publication exception is the audited automatic Catalog path in ADR 0017 as refined by ADR 0018: deterministic exact documented-model or safe leading-base-model evidence, provider-returned sources, and the official-host policy must pass; it must otherwise publish nothing.
- Do not automate a personal Facebook Marketplace account through an unattended VPS browser.
- Do not invent answers to open questions in ARCHITECTURE.md.
- Preserve user data and unrelated changes. Test module interfaces and cross-lifecycle invariants.

Repository conventions discovered during initial analysis:

- This is a greenfield application; existing Python/JavaScript files generate communication artifacts and are not application foundations.
- Application code belongs in the TypeScript workspace established by `SF-01`; do not import from `.codex-build/` or `tools/artifact-generation/build_workflow_doc.py`.
- Domain modules own their behavior and persistence interfaces. Do not reach into another module's tables from route/controller code.
- Validate untrusted input at the application boundary and enforce authorization again in the owning service.
- Persist a domain mutation and its outbox event in one database transaction.
- Treat `source-materials/inventory/Inventory List.xlsx` as read-only migration input. Preserve source values and row provenance.
- Do not log secrets, tokens, PII, file contents, or complete communication payloads.
- Keep service-worker caching limited to the canonical public-asset allowlist and generic offline page. Never add protected or operational responses or offline writes.
- Protected pages use the shared route-state mapper; client views that retain server-derived state use the shared synchronization pattern so reconnect cannot leave stale operational data visible.
- Keep AI/vision/OCR providers behind explicit application ports and adapters. Provider SDKs do not belong in controllers, repositories, React components, or domain services.
- Recognition reads only bounded private evidence through the Files-owned server interface. Enforce provider timeouts and byte/output limits, and never log secrets, image bytes, raw OCR/provider payloads, or complete sensitive prompts.
- Use deterministic fake recognition adapters for unit, integration, and browser acceptance. Keep live-provider benchmarks separate from deterministic product gates.
- Keep Model Specifications, approved manufacturer evidence, aliases, and serial-date rules in the Catalog module. Inventory owns physical Machine identity and actual overrides; Intake recognition must not call Catalog or public websites.
- Manufacturer source adapters preserve versioned provenance and never overwrite prior revisions or write Inventory tables. They may automatically publish only through ADR 0017's strict official-source policy as refined by ADR 0018's anchored documented-base-model rule; third-party, conflicting, unsupported, or policy-failing facts remain unknown.

Testing commands:

- `npm run lint` — lint the full TypeScript workspace.
- `npm run typecheck` — type-check all shared packages and applications.
- `npm test` — run the workspace unit tests.
- `npm run test:integration` — run deterministic PGlite API/database integration tests locally.
- `npm run test:browser` — build and run disposable full-boundary Playwright journeys at desktop and tablet sizes.
- `npm run build` — produce all shared-package, API, and web production builds.

Reuse vs inline:

Reuse when the logic is a decision; inline when it is a description.

- Reuse rules that must remain consistent, such as authorization, identity normalization, idempotency, state transitions, and file policy.
- Inline locally obvious rendering and label shaping that contains no business rule.
- Do not repeat knowledge. Repeating small non-decision code can be clearer than introducing a premature abstraction.
