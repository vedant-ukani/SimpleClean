# ADR 0008 Pipelined Recognition and Individual Intake Commit

## Status

Accepted

The active type-before-recognition and Individual Intake Commit presentation is
superseded by ADR 0015. Targeted item recognition and historical compatibility
remain accepted.

## Context

A Load commonly contains eight or nine Machines. A worker should not wait for one nameplate recognition result before photographing the next Machine. The current Recognition Run snapshots the full Intake Batch, so appending another photo changes the version and fingerprint and makes an in-flight run stale. The current Batch Commit also creates all Candidates together, although workers need to review and add ready Machines individually.

Machine type is usually not explicit on a nameplate. The worker can directly observe whether the physical Machine is a Washer, Dryer, or Other, while manufacturer, model, serial, and electrical facts should remain automatically extracted and verified.

## Decision

Keep the Intake Batch as the Load-level receiving session. Within it, treat each nameplate/Candidate as an independent Machine Intake Item with its own targeted, idempotent Recognition Run. Preparing an item records the worker-selected Machine type, binds one photo to one Candidate, and queues recognition atomically.

Recognition validates only its target evidence and cannot overwrite the worker-selected type. Adding or completing another item does not stale it.

Add an idempotent, audited per-Candidate commit. It performs the existing destination, evidence, duplicate, identity, and Machine-creation checks in one transaction and inserts the existing Candidate-to-Machine mapping. The Batch remains open. A final Finish Receiving action closes the Batch only after every item is resolved and mapped; it skips mappings already created by individual commits.

## Consequences

- Workers can continuously capture nameplates while earlier items process.
- Each ready Machine can be approved in any order without creating other Machines.
- Destination remains a receiving-session fact and becomes immutable after the first individual commit.
- Candidate mappings remain the authoritative durable marker for committed Machines; Candidate state also exposes `committed` for clear behavior.
- Recognition status becomes a collection of item-scoped runs while retaining historical batch-wide rows as readable data.
- The selected type is constrained human observation, not a general manual-entry fallback.
- Recognition remains advisory and never commits Inventory automatically.
- This supersedes ADRs 0006 and 0007 only where they require one final all-or-nothing Batch Commit. Their privacy, provider replacement, deterministic verification, no-web-search, recapture, and human-approval boundaries remain accepted.
