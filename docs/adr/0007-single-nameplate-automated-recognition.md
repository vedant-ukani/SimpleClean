# ADR 0007 Single-Nameplate Automated Recognition

## Status

Accepted

## Context

The current Laundrorama intake workflow will receive exactly one nameplate photo for one physical Machine. It will not receive full-machine photos or mixed photo groups, so semantic photo grouping is unnecessary. Live testing showed that Google Cloud Vision could return nameplate OCR while the configured Gemini semantic provider was rate-limited. Plain OCR still cannot consistently decide which visible value is the manufacturer, model, serial, or equipment type, and it can confuse characters such as `O/0` and `I/1`.

The operator does not want a manual field-entry fallback. Ambiguous identity should produce a targeted request for a clearer nameplate photo. Public manufacturer-site or general web search is intentionally excluded because it cannot recover a physical Machine's serial and could turn a partial observation into an unsupported identity guess.

## Decision

Use Google Cloud Vision document-text OCR as the nameplate text source and OpenAI, behind the existing replaceable semantic-recognition port, to assign bounded OCR and image evidence to structured nameplate fields. Apply a versioned deterministic policy as the independent verifier before a proposal may populate a ready Candidate Machine draft.

Preserve original OCR separately from normalized values. Never make global confusable-character substitutions. A correction must identify its position, original character, proposed character, and supporting evidence; it is accepted only when field context and independent evidence produce one unambiguous resolution. Unknown or conflicting values remain null.

Do not use manufacturer-site or general internet search in this pipeline. Do not fall back to manual field entry. Insufficient, conflicting, or ambiguous evidence creates a targeted Recapture Request. Provider failures retain the private photo and use bounded retry behavior. Recognition remains advisory: a person still authorizes the final attributable Batch Commit, and Inventory remains the identity authority.

## Consequences

- The active intake path no longer performs multi-photo Machine grouping.
- Google Vision supplies bounded OCR evidence; OpenAI supplies semantic field assignment; deterministic application rules and current Inventory matching decide acceptance.
- The workflow can remain automatic without silently inventing model or serial characters.
- An unreadable nameplate may require another photo and can temporarily block that Candidate rather than degrading to manual typing.
- Provider/model/schema/policy provenance and character corrections remain reviewable and auditable.
- Deterministic product tests continue to use fake adapters. Live OpenAI verification is deferred until a deployment key is configured.
- This decision supersedes ADR 0006 only where ADR 0006 assumes mixed-photo grouping or a manual field-entry fallback. Its privacy, provider-replacement, advisory-evidence, independent-verification, and human Batch Commit boundaries remain accepted.
