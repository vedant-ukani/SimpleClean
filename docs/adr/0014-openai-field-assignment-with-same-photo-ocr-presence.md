# ADR 0014 — OpenAI field assignment with same-photo OCR presence

## Status

Accepted

## Context

Google Vision supplies bounded word evidence and a bounded full-nameplate text
block. OpenAI correctly assigned manufacturer, model, and serial for several
nameplates but cited the full block. The prior deterministic policy required the
complete cited text to equal a model or serial, so three supported Candidates
failed even though the exact returned values were present in the same photo's
Google OCR.

OpenAI is the semantic field mapper; Google OCR remains the character evidence.
The platform still must reject characters absent from the photo's OCR, prevent
cross-photo evidence use, and preserve human approval before Inventory creation.

## Decision

For active single-nameplate Intake, require every non-null OpenAI field to retain
valid OCR references belonging to the same photo. Determine character support
against all bounded Google OCR for that photo rather than treating the cited
lines as the exclusive support corpus.

Manufacturer, model, and serial are supported only when the normalized OpenAI
value occurs as a complete contiguous normalized token sequence in the
same-photo OCR. A shorter value cannot match inside a larger model, serial, or
part-number token. Field-aware equivalence remains canonical for Machine type,
voltage, phase, fuel, and explicit-unit capacity. Do not substitute confusable
characters or reconstruct missing text.

Only unsupported manufacturer, model, or serial blocks Candidate readiness.
Unsupported optional fields remain null and attributable without blocking the
Machine. A person must still review the result and select **Add this Machine to
Inventory**. Record new runs under `intake-nameplate-policy-v3`; historical runs
and evidence remain immutable.

## Consequences

- A full-nameplate citation can support exact model and serial values found
  within the same photo's Google OCR.
- OpenAI chooses the field meaning, while deterministic policy proves that its
  characters exist in the bounded OCR and belong to the same photo.
- `M1` does not match `M10`, and a serial does not match only as part of a larger
  part-number token.
- A one-character OpenAI/Google disagreement remains unsupported.
- Optional electrical or capacity uncertainty does not discard an otherwise
  supported Machine.
- Retained failed photos can be retried under policy v3 without re-uploading.
- This decision supersedes ADR 0010 only where it makes the cited OCR lines the
  exclusive text-support boundary. ADR 0010's Google-authoritative characters,
  bounded evidence, no-image-to-OpenAI, and human-approval decisions remain.
