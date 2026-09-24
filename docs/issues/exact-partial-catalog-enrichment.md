# Exact Catalog matches can still be incomplete

## Status

Implemented, verified, and deployed to the public review environment on
2026-09-24. The detailed implementation contract is
[`specs/automatic-partial-catalog-enrichment.md`](../../specs/automatic-partial-catalog-enrichment.md).

## Observed production case

An Intake nameplate was correctly recognized as:

- Manufacturer: `THE DEXTER COMPANY`
- Model: `WCVD40KCS-12`
- Serial: `20401000466713`
- Equipment: 40 lb washer

Catalog resolution found the exact approved Dexter variant and returned capacity,
voltage, and phase. Height, width, depth, and weight remained unknown.

The recognition and exact model match were successful. The failure occurred after
resolution: runtime discovery stopped as soon as any exact approved revision was
found, even when that revision was incomplete. The existing missing-field
enrichment workflow was available only through the operator backfill command.

## Root cause

`CatalogService.requestDiscovery` treated these two states as the same:

1. exact model with a complete approved revision; and
2. exact model with an approved revision that still has unknown fields.

The first should stop. The second should keep the approved partial result usable
while asynchronously searching trusted official sources for only the missing
fields.

## Evidence finding for WCVD40KCS-12

Dexter's official V-Series manual explicitly includes `WCVD40KCS-12` and places a
T-600 mounting diagram in its Machine Specifications & Mounting section. Dexter's
official model-identification guide also maps historical `WCVD` to V-Series and
40 lb washers to T-600. These documents justify further exact-model research.

However, a separate T-600 C-Series specification sheet describes a newer C-Series
product and is not, by itself, exact evidence for the older WCVD V-Series model.
It lists a 558 lb net weight, while reviewed third-party WCVD material lists 631
lb. Because the weight evidence conflicts and the official WCVD material reviewed
so far does not provide an exact-model weight table, weight must remain unknown
unless the strict official-source workflow finds adequate evidence.

No related-series number may be copied into the approved Catalog merely because
capacity and product nickname appear similar.

## Required correction

- Exact approved partial revisions remain immediately usable.
- Runtime discovery checks whether their latest approved specifications are
  incomplete.
- When enabled, the existing additive enrichment path searches only for missing
  fields and applies the existing official-host, exact/full-model or safe
  documented-base-model, locator, conflict, and unit gates.
- Verified fields publish as an immutable next revision on the same variant.
- No-result and provider-unavailable outcomes preserve the partial revision.
- Provider failures remain retryable and cannot prevent the Machine from being
  linked to the already approved exact revision.
- Previously linked Machines remain pinned; future matching Machines use the
  newest approved revision.

## Safety boundary

This issue does not authorize fuzzy matching, capacity-based inference,
third-party automatic publication, mutation of an approved revision, or web
search inside recognition. Intake still accepts identity from private nameplate
evidence first; Catalog research remains a separate asynchronous process.

## Live verification result

The bounded live enrichment for `dexter-wcvd40kcs-12` completed as `no_result`
with reason `no_newly_verified_fields`. Catalog revision
`dexter-wcvd40kcs-12-r1` therefore remains the approved latest revision: 40 lb,
208–240V/60Hz, single/three phase, with height, width, depth, and weight still
unknown. This is the intended safe result until adequate exact official evidence
is available.
