# ADR 0016 — Immediate nameplate preparation and failed evidence exclusion

## Status

Accepted

## Context

After choosing nameplate photos, a separate Upload action added no review or
approval value and delayed recognition. When a targeted run failed, retrying the
same evidence was less useful than capturing or selecting a clearer photo.
Physically deleting a failed photo is unsafe because recognition history refers
to it and the platform must preserve evidence and auditability.

## Decision

Selecting nameplate files immediately starts the existing bounded upload and
sequential item-preparation flow. No separate Upload button is required.

For a failed or stale active item, offer a replacement camera/file input and a
failed-only remove action. Prepare a replacement as a new targeted item before
excluding the old photo. Removal means audited exclusion from active Intake,
not physical deletion. Candidates without currently assigned evidence are
retained with their failed runs but omitted from the active queue and final
Batch Commit scope. Unassigned photos and every remaining active Candidate
continue to satisfy the existing accounting, readiness, and type rules.

## Consequences

- Recognition begins from the worker's file-selection action.
- Failed evidence remains immutable and attributable.
- Replacement failure cannot erase the original recovery path.
- Excluded failed items neither appear as active work nor block valid remaining
  Machines from the final atomic commit.
- Failed-only removal is a presentation rule; historical/manual evidence tools
  retain their existing compatible endpoints.
- This extends ADR 0015 without changing provider policy, human type selection,
  duplicate behavior, or final approval.
