# ADR 0006 Supervised, Replaceable Intake Recognition

## Status

Accepted

## Context

Laundrorama workers should be able to upload a Load's photos together and avoid manually grouping every image or approving every visible nameplate field. Plain OCR cannot reliably decide which images show the same physical Machine, distinguish model from serial, detect unusable evidence, or prove that a critical value is correct. A single provider's confidence score is also not calibrated proof for dirty, angled, reflective equipment nameplates.

The platform already owns private Intake Evidence, Candidate Machines, Inventory identity matching, atomic Batch Commit, audit, idempotency, and provider-neutral file storage. Recognition must deepen those boundaries without becoming a second source of operational truth.

## Decision

Implement Intake recognition as a replaceable, asynchronous pipeline owned by Inventory Intake and connected to external or local vision/OCR systems through explicit provider ports.

The pipeline may propose photo-to-Machine groups and visible nameplate fields. Automatic acceptance requires a versioned policy that combines image quality, semantic extraction, an independent OCR read, cross-photo agreement where available, deterministic field validation, and current Inventory matching. Provider confidence alone is insufficient.

Persist recognition provenance, including provider and model identity, prompt/schema and policy versions, source File checksum, bounded evidence location, normalized suggestions, verifier results, and acceptance reasons. Unknown or conflicting facts remain unknown. Low-confidence or ambiguous evidence creates a targeted Recapture Request.

Files owns bounded private byte access for analysis. Provider adapters never receive public object URLs or browser grants and never write application tables. Recognition failures are retryable and leave INT-01's manual review path available.

High-confidence results may remove field-by-field approval, but recognition alone does not create or verify a Machine. A person resolves remaining exceptions and authorizes one final, attributable Batch Commit through the existing Inventory boundary.

Provider selection and confidence thresholds remain configuration backed by a representative, versioned evaluation set. Deterministic product tests use fake adapters; live provider evaluation is a separate non-blocking test suite.

## Consequences

- Workers normally review only targeted recapture or conflict exceptions.
- Recognition can be replaced or disabled without migrating authoritative Machine identity.
- The system stores more evidence and policy provenance and requires durable background processing.
- Two agreeing readers and deterministic checks cost more than a single OCR request but materially reduce silent serial/model errors.
- A provider outage degrades to manual Intake rather than blocking receiving.
- Fully autonomous Machine creation remains intentionally disallowed; one human Batch Commit preserves approval and audit.
