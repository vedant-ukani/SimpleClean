# ADR 0013 — Store duplicate photo-Intake Machines separately

## Status

Accepted

## Context

Receiving may capture the same visible manufacturer and serial more than once
because a physical Machine was photographed again, previously entered data was
incomplete, or two photos happen to produce the same normalized identity. During
photo Intake, blocking that evidence can discard a real receiving record. Merging
automatically is also unsafe because a matching serial does not prove that two
Intake items represent the same physical Machine.

## Decision

The active photo-Intake workflow does not warn about or block duplicate identity
matches. Every supported, approved Candidate Machine creates its own provisional
Machine with a new immutable Machine ID and its own Intake mapping, evidence, and
audit provenance, even when normalized manufacturer and serial values match an
existing Machine or another Candidate.

The Intake UI has no serial-match warning button or acknowledgement step. Intake
never automatically merges Machines. Request idempotency still prevents a retry
of the same commit request from creating a second business result.

Later explicit identity verification remains conflict-aware: only one Machine can
own a verified normalized manufacturer-and-serial claim, and a competing attempt
keeps both Machines while recording a conflict. Spreadsheet migration retains its
separate staged duplicate-review rules.

## Consequences

- Photo Intake preserves every approved nameplate as a separate provisional
  Machine instead of silently dropping or combining records.
- Matching manufacturer and serial values do not change recognition readiness or
  block Individual Intake Commit or compatible historical Batch Commit.
- Operators can search and review provisional duplicates later; the platform does
  not assert that they are the same physical asset.
- Verified identity remains unique and conflict-aware without rewriting Intake
  provenance.
- This decision supersedes the photo-Intake duplicate-blocking portions of ADR
  0010 and ADR 0012. It does not change spreadsheet-import duplicate handling.
