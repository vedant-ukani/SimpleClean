# ADR 0018 — Vision-assisted Intake and documented base models

## Status

Accepted on 2026-09-23.

## Context

Some usable nameplate photos contain readable model and serial rows even when the printed field labels are cropped or Google OCR misses those labels. OCR-only semantic mapping can therefore fail to identify which exact OCR row is the model or serial despite having the correct characters.

Manufacturers also commonly publish specifications under a base model such as `EH020`, while a physical nameplate carries a longer configured variant such as `EH020XA1321121011`. Requiring the official page to contain the entire configured variant rejects valid manufacturer specifications; accepting arbitrary family similarity would be unsafe.

## Decision

Send each bounded, metadata-stripped Intake JPEG to the semantic provider together with only that photo's bounded Google OCR lines and boxes. The image may supply layout, adjacency, and visible-label semantics. Google OCR remains authoritative for exact characters: every non-null field must cite same-photo OCR, required identity values must occur as complete contiguous normalized token sequences, and the image cannot repair, complete, substitute, or invent characters. Capacity remains optional and requires explicit pound or kilogram unit evidence. The worker still selects Machine type and performs the final Intake commit.

For separate Catalog web discovery, the returned officially documented model may be either the full accepted model or a leading base model. The deterministic relationship passes only when the normalized documented model:

- equals the accepted full model; or
- is an anchored leading prefix of the accepted full model, has at least four characters, and contains at least one ASCII letter and digit.

The provider-returned evidence must contain that documented model exactly on a trusted official manufacturer HTTPS URL with a nonempty locator. Existing equipment-class, returned-source, unit-conversion, conflict, schema, immutable-revision, audit, and cost-provenance gates remain unchanged. Substring-only, suffix, edit-distance, too-short, unrelated, untrusted, and conflicting matches publish nothing.

Preserve the accepted full nameplate model as the Catalog variant and normalized Machine-resolution identity. Store the exact officially documented base model as the Catalog family and model evidence value.

## Consequences

- Cropped or missed field labels no longer prevent OpenAI from assigning otherwise exact OCR-backed model and serial rows.
- OpenAI vision still cannot make a character absent from Google OCR pass deterministic verification.
- A bare electrical frequency such as `60` cannot become capacity; visible explicit-unit values such as `20 LBS` may.
- Official `EH020` specifications can enrich `EH020XA1321121011` without shortening or overwriting the Machine's model.
- Prompt and policy versions advance so prior `no_result` deduplication does not suppress a new attempt.
- Intake images remain private provider inputs and are never sent to Catalog discovery or public web search.

## Supersedes

This ADR supersedes ADR 0010 and ADR 0014 only where they prohibit sending the bounded Intake image to OpenAI. Their Google-authoritative character, same-photo evidence, deterministic verification, and human Intake-commit requirements remain active.

This ADR refines ADR 0017's exact-model gate to permit the deterministic documented leading-base-model relationship above. All other ADR 0017 automatic-publication restrictions remain active.
