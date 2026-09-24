# ADR 0015 — Post-recognition Machine type and one final Intake commit

## Status

Accepted

## Context

Warehouse staff commonly upload a Load's nameplates together. Requiring Washer,
Dryer, or Other on each local preview before upload delays recognition and makes
the worker repeatedly switch between photo selection and classification.
Creating each Inventory Machine through a separate card action, followed by a
second Finish Receiving action, also makes one Load-level task unnecessarily
fragmented.

Machine type remains a constrained physical observation that recognition must
not invent or overwrite. Manufacturer, model, serial, and other visible
nameplate facts still require the existing Google OCR, OpenAI assignment, and
deterministic evidence policy. Inventory creation remains consequential and
must be explicitly authorized by a person.

The whole-Intake QR endpoint already produces a valid private PDF, but a silent
browser download gives tablet users no visible print/share surface.

## Decision

Let an authorized worker select and upload several nameplate images without
choosing Machine type first. Preparing each image atomically binds one private
photo to one Candidate and queues its independent targeted Recognition Run with
no selected type.

After recognition succeeds, require the worker to choose Washer, Dryer, or
Other on each Candidate. Record the actor and time through the existing
candidate-type mutation. Recognition may not populate or overwrite that choice.

Expose one final **Add Machines to Inventory** action for the active Intake. It
is available only when every selected image has been prepared, every item is
recognition-ready and confirmed, and every Candidate has a human-selected type.
The action reuses the audited, idempotent Batch Commit transaction to revalidate
the evidence, create all unmapped provisional Machines and provenance mappings,
and close the Intake Batch atomically. The server independently rejects an
untyped Candidate. Existing Individual Intake Commit and Finish Receiving paths
remain available only for historical or already-partially-committed Intakes.

After the Batch is committed, reserve a browser tab synchronously and display
the private whole-Intake QR PDF there for tablet print/share controls. If the
browser blocks the preview tab, retain a direct-download fallback. QR rendering,
authorization, opaque tokens, active-label reuse, audit, and `no-store` behavior
do not change.

## Consequences

- Photo upload and recognition begin without a classification prerequisite.
- Each targeted Recognition Run remains independent, so adding another photo
  cannot stale unrelated evidence.
- Machine type remains an attributable human observation and does not become an
  OpenAI-derived fact.
- No Machine is created until one person authorizes the complete ready Intake.
- All new Machines from that action either commit together or none commit.
- Matching identities still create separate provisional Machines under ADR
  0013; request idempotency still prevents replay of the same business action.
- Old per-Candidate mappings remain readable and the compatible finalization
  path can close an older open Intake without duplicating Machines.
- Card-level status badges and per-card Inventory buttons are no longer part of
  the active tablet workflow; actionable failures retain retry/recapture paths.
- The QR PDF becomes visibly usable on tablets without creating another QR API
  or renderer.
- This supersedes ADR 0008 where it requires type during preparation,
  Individual Intake Commit in the active UI, and a separate Finish Receiving
  action. Its targeted recognition, evidence, privacy, audit, idempotency, and
  historical compatibility decisions remain accepted.
- This supersedes ADR 0012 where it requires type before upload and preserves
  per-Machine approval in the active UI. Its batch file selection, compact
  previews, sequential preparation, and capacity-optional QR decisions remain
  accepted.
