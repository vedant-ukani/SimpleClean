# ADR 0012 — Batch nameplate selection and capacity-optional QR sheets

## Status

Accepted

The photo-Intake duplicate-blocking portions are superseded by ADR 0013.
The type-before-upload and active per-Machine approval portions are superseded
by ADR 0015.

## Context

A Load commonly arrives with several Machines, and warehouse staff already have
one private nameplate photo for each physical Machine. Repeating the file chooser
and a global type selection for every Machine creates unnecessary tablet work and
makes it harder to review the Load as a group. Staff need to choose the Load's
nameplates together, identify each image as Washer, Dryer, or Other, and retain
the existing independent recognition and approval boundary for every Machine.

Capacity remains useful visible label information, but it is optional Inventory
data and may not be known during receiving. Blocking the entire whole-Intake QR
sheet when one Machine lacks capacity prevents staff from labeling the remaining
received Machines and contradicts the decision that unknown capacity does not
delay Intake.

## Decision

In the active Intake UI, let an authorized worker select several private
nameplate images in one action. Stage a compact preview for each selected file
and require a worker-observed Washer, Dryer, or Other value per image before
upload. Continue preparing every image through the existing single-item Intake
boundary, in sequence against the current optimistic Batch version. Recognition,
review, retry, duplicate checks, Individual Intake Commit, and Finish Receiving
remain independent per Machine.

After Finish Receiving, allow the private whole-Intake QR sheet when capacity is
unknown. Known capacity remains visible as `<capacity> LB - <type>`; an unknown
value is printed explicitly as `Capacity unknown - <type>`. The sheet continues
to reuse active opaque labels, record print activity, require authorization, use
`no-store`, and exclude price, customer, location, cost, and internal Machine ID.

Exact normalized manufacturer-plus-serial matches remain non-overridable
duplicate blockers. The UI presents them as blockers rather than acknowledgement
checkboxes. Weaker serial-only and manufacturer/model matches remain attributable
review warnings.

## Consequences

- One file-selection action can stage the nameplates for a Load while preserving
  one photo, Candidate, Recognition Run, and explicit approval per Machine.
- The browser may upload file bytes concurrently within existing limits, but it
  prepares items sequentially so Batch version conflicts cannot silently lose or
  duplicate work.
- Compact local and persisted previews make the queue usable on shared tablets;
  private evidence and provider boundaries are unchanged.
- Capacity can be enriched later without blocking physical QR labeling. The
  printed sheet never implies that an unknown value is zero or known.
- This ADR supplements ADR 0008's pipelined item model and supersedes ADR 0011
  only where ADR 0011 requires capacity on every mapped Machine before printing.
