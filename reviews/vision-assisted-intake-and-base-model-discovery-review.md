# Review — vision-assisted Intake and base-model discovery

## Outcome

Accepted. The implementation matches the reviewed ticket and preserves the full Machine/Catalog variant while allowing a strictly verified documented leading base model for official specifications.

## Standards review

- OpenAI receives bounded metadata-stripped JPEG data URIs at high detail, paired with bounded same-photo Google OCR.
- The semantic prompt limits vision to layout and field meaning; exact characters remain OCR-backed and deterministically verified.
- Image bytes, source checksums, dimensions, private URLs, credentials, and raw provider responses are not logged or added to persisted business payloads.
- Explicit-unit capacity behavior is preserved, so a bare `60` remains unsupported while `20 LBS` can pass.
- Catalog matching is exact or anchored-prefix only, requires at least four normalized characters plus a letter and digit, and retains all trusted-host, provider-returned-source, HTTPS, locator, equipment-class, unit, and conflict gates.
- Catalog persistence stores the documented model as the family and the complete accepted nameplate model as the variant.

## Specification review

- Request-shape tests cover paired images/OCR and privacy-sensitive omissions.
- Recognition-policy tests cover unlabeled stacked model/serial rows and explicit-unit capacity.
- Catalog policy tests cover exact and `EH020`-style leading-base acceptance plus unrelated, substring-only, too-short, inexact-evidence, non-returned, lookalike, and HTTP rejection.
- Integration coverage proves `EH020` family publication with full variant `EH020XA1321121011` and official model evidence retained.
- Recognition and Catalog prompt/policy provenance versions were advanced without changing the unchanged wire-schema or pricing versions.

## Verification

The architect independently inspected the provider request, deterministic policy, persistence split, versioning, and regression coverage. Final verification passed: 103 API unit tests, 106 web unit tests, 18 contract tests, 15 configuration tests, the database unit test, 58 API integration tests, three passing database integration tests with one intentional skip, workspace lint, workspace typecheck, production build, and diff whitespace validation.
