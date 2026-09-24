# ADR 0017 — Automatic official-source Catalog discovery

## Status

Accepted on 2026-09-23.

## Context

Intake already accepts manufacturer, model, and serial characters only when bounded Google OCR supports OpenAI's field assignment. The approved Catalog can resolve known models, but an exact accepted model may not yet have an approved revision. Blocking Intake for manual Catalog research would slow receiving, while accepting general web results would let reseller pages, related models, or generated claims become operational facts.

The project normally requires human approval for consequential AI publication. For this narrow Catalog path, the owner explicitly chose automatic publication without a human approval step, provided a deterministic source-and-evidence policy—not the model's confidence—decides what may publish.

## Decision

Run Catalog discovery as a separate asynchronous provider call after accepted Intake identity. Send only the canonical manufacturer and exact model; do not send image bytes, OCR text, serial numbers, Load data, or user data. Machine creation and identity-update events provide a fallback trigger. Catalog/provider failure never changes recognition readiness, Batch Commit eligibility, or Machine creation.

OpenAI web search is unrestricted so previously unknown official pages can be found. A returned fact may publish automatically only when all of these conditions hold:

- the manufacturer resolves exactly or through an approved Catalog alias;
- the cited HTTPS URL was returned by the provider's web-search source data;
- its hostname is the exact hostname, or a subdomain, of an existing Catalog source classified as `official_manufacturer`;
- the exact normalized model and equipment class have located official evidence;
- each field is conflict-free, schema-bounded, and deterministically consistent with its official value and unit;
- serial-year logic uses an existing typed Catalog rule schema and official exact-model or documented-family evidence.

Third-party, distributor, reseller, marketplace, lookalike-domain, family-only, conflicting, malformed, or unsupported facts remain unknown. No approval queue or approval control is created for this path.

Successful results become immutable approved Catalog revisions with publication mode `automatic_official_source_policy`. Discovery runs are deduplicated by normalized identity and provider/model/prompt/schema/policy versions, use bounded leases and retries, and atomically record privacy-safe audit/outbox events. Persist source URLs and locators, versions, token/search usage, pricing snapshot, estimated cost, and a response fingerprint; do not persist raw prompts, raw provider responses, source bodies, or serial numbers.

Inventory retains ownership of physical Machine identity and actual measurements. Actual Machine values continue to override Catalog defaults, and final packed facts remain authoritative for shipping.

## Consequences

- A new exact model can gain reusable sourced specifications without waiting for a person.
- Unrestricted discovery cannot by itself make a fact authoritative; the deterministic official-source gate remains the publication authority.
- Old or poorly documented models may legitimately produce `No verified specifications found` even when search returns plausible values.
- Search usage and estimated cost are visible and auditable, while billing-provider records remain authoritative.
- Intake recognition remains a separate evidence process and cannot use web search to repair unreadable identity characters.

## Supersedes

This ADR creates a narrow exception to the Catalog-approval portion of the 2026-09-23 decision **Keep verified model enrichment in a separate Catalog module**. That decision's module ownership, recognition separation, immutable revisions, worker-selected type, and Machine-actual precedence remain active.
