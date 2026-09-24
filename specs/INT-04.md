# INT-04 — Pipelined Machine intake and individual approval

## Goal

Allow a worker to photograph the next Machine while previous nameplate recognition continues, while keeping one Load-level receiving session and reviewing/adding Machines individually. Each photo/Candidate gets an isolated Recognition Run. Machine type is selected by the worker; remaining nameplate facts stay automatic and read-only.

## Expected output

- The worker chooses one active destination for the Intake Batch.
- Each capture requires one nameplate photo and Washer, Dryer, or Other.
- Preparing an item atomically links the photo, creates/assigns its Candidate, saves the type, and queues recognition.
- The capture controls reset when the run is queued, without waiting for provider completion.
- The screen displays independent queued, reading, ready, recapture, failed, and added states.
- Each ready Candidate has **Add this Machine to Inventory**.
- Approving one Candidate creates exactly one Machine and leaves the receiving Batch open.
- **Finish Receiving** closes the Batch only after all items are resolved and mapped.
- No manual Candidate creation, photo grouping, assignment, exclusion, or free-form identity editing is present in the active flow.

## Non-goals

- No web/catalog lookup or serial reconstruction.
- No manual manufacturer/model/serial/voltage/phase/fuel entry.
- No automatic Inventory commit.
- No full-machine photo classification.
- No offline mutation queue.
- No destructive migration of historical Intake data.

## Contracts

### Candidate and item states

- Extend Candidate state with `committed`.
- Add a bounded Machine Intake Item projection containing its Candidate, photo, selected type, latest targeted run, open recaptures, and optional Machine mapping.
- Keep historical batch-wide `latestRun` readable during rollout; add `runs` for targeted run status.
- Add stable findings for item conflicts, an already committed Candidate, a locked destination, and stale target evidence.

### Prepare item

Add an idempotent command under the open Intake Batch:

```json
{
  "fileId": "uuid",
  "machineType": "washer | dryer | other",
  "expectedVersion": 3
}
```

The command must, in one transaction:

1. lock and validate the open Batch/version;
2. validate the ready File belongs to the same Load and is not already linked;
3. insert the Intake Photo;
4. insert one Candidate with the selected type;
5. assign the photo to that Candidate;
6. create a photo/Candidate-targeted queued Recognition Run and fingerprint;
7. record audit/outbox and complete idempotency;
8. return the updated Batch/item status.

Do not expose a partially prepared item if any step fails.

### Targeted recognition

Add nullable `photo_id` and `candidate_id` targets to Recognition Runs so historical rows remain valid. New INT-04 runs require both.

The run fingerprint covers only the target File checksum plus target identity/revision and provider/schema/policy configuration. Claim returns only the target photo. Service orchestration sends only that bounded image to Google Vision and OpenAI.

Application validates:

- Batch remains open;
- target photo/Candidate still belong to the Batch and each other;
- File checksum is unchanged;
- Candidate is not committed;
- Candidate revision and selected type match the run snapshot.

It writes verified manufacturer, model, serial, voltage, phase, and fuel to the targeted Candidate, preserves machine type, persists evidence/provenance, and changes only that item's readiness. Appending or completing another item is not stale input.

### Type change

Add a constrained type-change command for an uncommitted Candidate. It accepts only Washer/Dryer/Other, updates attribution/revision, bumps the Batch version, and prevents an older in-flight run from overwriting the Candidate. It cannot change any recognized identity field.

### Individual commit

Add:

`POST /inventory/intake/:batchId/candidates/:candidateId/commit`

with `expectedVersion` and an idempotency key. In one transaction it must:

- lock Batch and Candidate;
- return the existing mapping for an idempotent replay;
- require confirmed/ready Candidate, active destination, assigned ready evidence, and no open blocking recapture;
- re-run exact identity locks/checks and warning requirements;
- create one provisional Machine through Inventory;
- insert the existing Intake Machine mapping;
- set Candidate state to `committed`;
- bump Batch version and record audit/outbox;
- leave Batch open.

A second request with another idempotency key must still return/conflict safely without creating a duplicate Machine.

### Finish Receiving

Adapt the existing Batch Commit endpoint into the final close behavior:

- never recreate mapped Candidates;
- optionally commit remaining confirmed/unmapped Candidates using the same internal helper, preserving legacy behavior;
- require every non-excluded photo to belong to a Candidate and every Candidate to have a mapping before closure succeeds;
- transition the Batch to `committed` idempotently.

Once any mapping exists, reject destination changes to a different location.

## Database changes

Create the next forward migration:

- recognition run nullable `photo_id` and `candidate_id` with indexes and same-Batch integrity enforced in repository/constraints where possible;
- Candidate state check extended to `committed`;
- Candidate revision integer for recognition target validation;
- Machine-type selection attribution (`selected_by_user_id`, `selected_at`) on Candidate or the item-owned record;
- partial uniqueness preventing more than one queued/running targeted run per photo/Candidate input;
- preserve historical nullable targets and states.

Do not backfill type from provider guesses.

## Active web workflow

Replace the current global recognition/manual review presentation with a queue of Machine cards.

- Destination appears once above the queue.
- Capture panel uses a single supported image input and mobile environment capture.
- Washer, Dryer, and Other are large one-tap controls.
- Submit prepares the item; after the server queues recognition, clear photo/type and keep capture available.
- Poll while any run is queued/running and merge by run id/update time without regressing state.
- Each card owns its preview, recognition status/result, retry or targeted recapture, constrained type change, and individual approval.
- Ready facts are read-only.
- Committed cards link to the created Inventory Machine.
- The image must stay within its card at desktop and tablet widths.
- Reconnect refreshes authoritative server state; protected data is never service-worker cached.

Remove from the active UI:

- multiple-photo bulk selector;
- Add Machine Candidate;
- manual photo assign/unassign/exclude;
- editable manufacturer/model/serial/voltage/phase/fuel;
- batch-wide recognition status as the only status;
- approval wording that implies all Candidates are created together.

Historical shapes may remain readable, but no new active workflow should create them.

## Reuse constraints

- Reuse Files upload/preview grants, validation, bounded analysis bytes, checksum, and HEIC conversion.
- Reuse Operations outbox, worker leases, retry, and idempotency.
- Reuse semantic/OCR provider ports and deterministic policy.
- Reuse Inventory normalization, duplicate locking, warning checks, Machine creation, audit/outbox, and mapping.
- Keep provider SDKs out of controllers, repositories, domain services, and React components.
- Do not duplicate cross-module tables or query them from controllers.

## Security and concurrency

- Require `intake.read` for reads and `intake.manage` plus idempotency for mutations.
- Keep provider calls outside database transactions.
- Mutations retain optimistic Batch versions; targeted run validity does not require equality with unrelated Batch changes.
- Candidate revision prevents stale recognition from overwriting a changed type/item.
- A committed Candidate is immutable through Intake.
- Exact duplicate protection stays in the same transaction as Machine creation.
- No raw OCR/provider payloads, prompts, image bytes, secrets, storage keys, or complete communication payloads in logs/audit/outbox/client status.

## Tests required

Implement test-first in vertical slices.

1. Contract tests for targeted runs, item status, committed Candidate, prepare, type-change, individual commit, and invalid values.
2. Integration: prepare A, start A, prepare B, complete A successfully, and prove B did not stale A or share evidence.
3. Integration: A and B can complete in either order with independent status/recapture.
4. Integration: recognition preserves selected type when provider type is null or conflicting.
5. Integration: stale photo checksum/Candidate revision rejects only the targeted run.
6. Integration: commit A creates one Machine, keeps Batch open, and leaves B unchanged.
7. Integration: same-key replay and concurrent different-key commit cannot duplicate a Machine.
8. Integration: destination becomes immutable after first mapping; final close skips mappings and is idempotent.
9. Web: capture remains enabled while A reads; cards poll and merge independently; refresh reconstructs state.
10. Web: facts are read-only; only type can change; retry/recapture and individual approval are scoped to one item.
11. Browser desktop/tablet: queue two fake-recognition Machines, approve one, observe the other stays open, and verify no image overflow.

Run focused tests during red-green-refactor, then:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- `git diff --check`

## Done criteria

- The worker can queue Machine B while Machine A is running.
- Adding/completing B cannot stale A.
- The queue and per-item status survive refresh.
- Worker-selected type is attributable and never overwritten by recognition.
- Recognized identity fields are automatic and read-only.
- Each approval creates exactly one Machine without affecting other items.
- Final close cannot duplicate already mapped Machines.
- Existing privacy, verification, authorization, audit/outbox, idempotency, and duplicate invariants remain intact.
- All deterministic project gates pass without live-provider credentials.

