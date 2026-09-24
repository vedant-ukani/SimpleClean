# ADR 0010 — Google OCR-authoritative Intake assignment

## Status

Accepted

The photo-Intake duplicate-blocking portions are superseded by ADR 0013. The
cited-line-exclusive support rule is superseded by ADR 0014.

## Context

Live tests on three representative nameplates showed that Google Cloud Vision
read exact model and serial characters more reliably than direct semantic image
interpretation. In the first and third tests, the semantic model's independent
visual reading conflicted with the more accurate OCR text. The active workflow
also converted confidence and image-quality warnings into Recapture Requests,
but receiving must proceed from the retained image without requiring another
capture.

The platform still needs structured Machine fields, strict evidence provenance,
duplicate protection, retryable failures, and a human-controlled boundary before
Inventory creates a Machine.

## Decision

Use Google Cloud Vision as the sole text reader for the active single-nameplate
Intake path. Run Google OCR first and send only bounded OCR lines, stable line
IDs, confidence, and boxes to the configured OpenAI semantic adapter. Do not send
image bytes to OpenAI. Use `gpt-6-luna` to map the supplied text into the strict
Machine-field schema and require it to copy exact supported values rather than
correct, reconstruct, or infer missing characters.

The versioned deterministic policy requires every non-null value to cite valid
same-photo OCR lines and requires supported manufacturer, model, and serial
values before confirming a Candidate. Provider confidence and image-quality
findings remain provenance, not readiness blockers. Inventory's existing exact
duplicate identity protection remains authoritative.

When critical evidence is missing or unsupported, provider output is malformed,
a provider fails, or Inventory detects an exact duplicate, retain the private
photo and finish the targeted run as failed without creating a Recapture Request.
The run remains retryable where existing retry rules permit. Historical
Recapture Requests and recognition states remain readable.

Recognition remains advisory. A person reviews the confirmed Candidate and
explicitly selects **Add to Inventory**; only the existing Individual Intake
Commit may create a Machine.

This decision supersedes ADR 0007 only for the active path's independent visual
reader and targeted-recapture behavior. ADR 0007's single-photo boundary,
evidence provenance, no-catalog-lookup rule, and human approval boundary remain
in force.

## Consequences

- OpenAI no longer receives image bytes, removing direct visual disagreement and
  image-token cost from semantic assignment.
- Exact text quality depends primarily on Google Vision; Luna's role is limited
  to structured mapping from that evidence.
- Confidence, glare, blur, and small-text warnings do not force recapture when
  the required values are supported by cited OCR lines.
- Unsupported or incomplete identities fail visibly and can be retried from the
  retained photo; they cannot silently enter Inventory.
- Existing duplicate, audit, outbox, private-file, and human approval invariants
  are unchanged.
