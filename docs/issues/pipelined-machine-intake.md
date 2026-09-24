# Pipelined Machine intake

## Problem

Receiving commonly brings eight or nine Machines in one Load. Today, recognition snapshots every photo and the single Intake Batch version. Adding the next Machine's photo changes both, so a recognition run already in progress becomes stale. The UI also has one batch-wide status and one final all-or-nothing approval, forcing the worker to wait or defer every Machine until the entire Load is ready.

The active screen exposes manual grouping and editable identity fields even though the accepted workflow is automatic nameplate recognition with targeted recapture. Machine type is the exception: most nameplates do not state Washer or Dryer unambiguously, while the worker can observe that directly.

## Required outcome

A worker chooses the destination once, then repeats:

1. Photograph one Machine's nameplate.
2. Tap Washer, Dryer, or Other.
3. Queue automatic recognition for that one Machine.
4. Immediately photograph the next Machine.
5. Review and approve each ready Machine individually.

OpenAI and Google Vision work in the background. A failed or uncertain item keeps its private evidence and offers retry or targeted recapture without blocking other items. The active workflow never falls back to free-form identity entry.

## Proposed design

Keep one Load-level Intake Batch as the receiving session, but introduce a Machine Intake Item for each linked nameplate/Candidate. Each item has an independently targeted Recognition Run. Appending item B must not stale item A because A's run validates only A's photo checksum, Candidate revision, and selected type.

Prepare an item atomically after upload: link the photo, create and assign its Candidate, record the worker-selected Machine type, and enqueue recognition. Recognition fills only the verified nameplate facts. The active UI shows per-item states rather than one global state.

Add an idempotent per-Candidate commit transaction. It reuses the existing destination, evidence checks, exact-identity lock, Machine creation, provenance mapping, audit, and outbox behavior. It creates exactly one Machine and keeps the receiving Batch open for other items. The final Finish Receiving action closes the Batch after every photo is resolved and every Candidate is mapped; it does not recreate already committed Machines.

## Acceptance scenarios

### Independent background work

Given item A is running, when the worker prepares item B, A remains running and can complete successfully. B has its own run and status. Completion of either item does not overwrite or stale the other.

### Individual approval

Given A and B are ready, approving A creates one provisional Machine and mapping while B remains open and reviewable. Replaying A's approval cannot create a second Machine.

### Worker-selected type

Given verified OCR has no usable Machine type, the Candidate retains the worker's Washer/Dryer/Other selection. Recognition cannot overwrite that selection. A later type change is attributable, versioned, and blocked after the Candidate is committed.

### Refresh and reconnect

Refreshing reconstructs all item states, results, recaptures, and committed Machine links from server data. No operational state depends only on browser memory.

### Failure isolation

If A times out or needs a clearer photo, B can still run and be approved. A's photo remains private and safe.

## Integrity constraints

- One active Recognition Run targets one photo/Candidate and reads only that bounded Files-owned evidence.
- Provider calls remain outside database transactions.
- A result is rejected if its target photo checksum, Candidate binding/revision, or selected type changed.
- A committed Candidate cannot be edited, reassigned, excluded, or recaptured.
- Per-Candidate commit is atomic with Machine creation, mapping, audit/outbox, and idempotency.
- Exact manufacturer/serial duplicate locking remains inside the commit transaction.
- Destination cannot change after the first Machine is committed in the receiving session.
- The final close skips existing mappings and is idempotent.
- Recognition never creates Inventory without a human approval.
- No secrets, image bytes, complete OCR/provider payloads, prompts, or storage keys enter logs or client responses.

## Out of scope

- Manufacturer-site or general web search.
- Free-form manual manufacturer/model/serial/electrical entry.
- Full-machine image classification.
- Offline writes.
- Rewriting historical Recognition Runs or committed Batches.

