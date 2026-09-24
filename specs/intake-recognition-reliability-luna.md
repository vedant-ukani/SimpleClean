# intake-recognition-reliability-luna — Recover retries, select Luna, normalize plate labels

## Goal

Make live single-nameplate recognition reliably recover when an outbox delivery is retried after a worker lease/deadline failure, run the application with the lower-cost `gpt-6-luna` semantic model, and avoid false recapture requests when Google Vision includes an explicit `NO.`/number label around a model or serial that Luna extracts without the label.

## Ticket Summary

- A Recognition Run left in `running` by an interrupted/expired first delivery must be reclaimable only when the same durable outbox job is redelivered (`attemptCount > 1`).
- First delivery must continue to claim only `queued` work. Terminal runs remain no-ops so duplicate delivered events cannot rerun completed recognition.
- A late first handler may still settle after the worker deadline. Each claim must persist a non-secret execution claim derived from the stable outbox job ID plus delivery attempt. Repository apply, failure, and requeue writes must require both `state = 'running'` and that exact claim; a late handler cannot disrupt the active retry, overwrite a terminal result, or create duplicate groups, recaptures, audit entries, or completion events.
- Preserve the existing transient-provider behavior that returns a run to `queued` before the worker retries it.
- Change the validated application default, OpenAI adapter fallback, live-evaluation fallback, checked-in example, and active local environment from `gpt-6-astra` to `gpt-6-luna`.
- Normalize explicit model/serial number labels such as `NO.`, `NO:`, `NUMBER`, `MODEL NO.`, `SERIAL NO.`, and `S/N`, while preserving genuine unseparated values such as `NO123`.
- Add regression tests for the exact `IMG_6128.HEIC` comparison: OCR `NO.1990300131068` and semantic `1990300131068` agree and do not create a recapture.
- Add an integration regression for a first attempt that leaves the run `running` before the outbox delivery is retried; the retry must execute recognition and reach a terminal recognition state instead of the outbox being delivered while the run remains `running`.

## Expected Output

- New recognition jobs use `gpt-6-luna` and persist that model in run provenance.
- A redelivered recognition job can recover its own abandoned `running` run.
- Explicit number labels do not create false OCR disagreements.
- Existing terminal-state and first-delivery idempotency behavior remains intact.
- The application is restarted after verification so the active process loads Luna configuration.

## Non-Goals

- Do not automatically rerun or charge for the two already-stuck production test photos.
- Do not rewrite the outbox architecture, introduce a new broker, or add a recognition-run lease schema in this slice.
- Do not weaken exact model/serial comparison after label removal.
- Do not add catalog/web lookup or manual identity entry.
- Do not change Google Vision selection or evidence/privacy limits.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.service.ts` / `handle` | Receives the stable outbox event and has its delivery `attemptCount`. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` / `claim` | Owns the transaction that transitions a Recognition Run into `running`. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` / `normalizeRecognitionValue` | Canonical deterministic recognition normalization and comparison. |
| `apps/api/src/modules/operations/operations.worker.ts` | Defines redelivery attempt semantics; reference only unless a failing regression proves a worker change is required. |
| `packages/config/src/environment.ts` | Canonical validated provider/model configuration. |
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | OpenAI adapter model fallback. |
| `apps/api/src/modules/inventory/intake/recognition/evaluation.ts` | Live evaluation settings fallback. |
| `apps/api/test/intake-recognition-policy.test.ts` | Deterministic policy regressions. |
| `apps/api/test/intake-recognition.integration.test.ts` | Full database/outbox/worker recognition journey. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/api/src/modules/inventory/intake/recognition.service.ts` | Pass a narrowly named recovery flag derived from `event.attemptCount > 1` into the repository claim. |
| `apps/api/src/modules/inventory/intake/recognition.repository.ts` | Permit `running` recovery only for a redelivery; lock and atomically replace the execution claim. Keep terminal states non-claimable and fence apply/fail/requeue writes against late handlers. |
| `apps/api/src/modules/inventory/intake/recognition.policy.ts` | Strip only explicit field-label syntax before exact identity comparison. |
| `apps/api/test/intake-recognition-policy.test.ts` | Cover `NO.` agreement, compound labels, and preservation of genuine `NO123`. |
| `apps/api/test/intake-recognition.integration.test.ts` | Cover abandoned-`running` redelivery recovery and ensure terminal completion. |
| `packages/config/src/environment.ts` | Make Luna the semantic-model default. |
| `packages/config/test/environment.test.ts` | Assert the Luna default. |
| `apps/api/src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.ts` | Make Luna the adapter fallback. |
| `apps/api/src/modules/inventory/intake/recognition/evaluation.ts` | Make Luna the evaluation fallback. |
| `.env.example` | Document Luna as the active example model. |
| `.env` | Select Luna for this local application without changing credentials. |

## Files to Reference Only

| File | Why |
|---|---|
| `ARCHITECTURE.md` | Recognition ownership, outbox, evidence, and retry invariants. |
| `docs/adr/0002-modular-monolith-and-evented-integrations.md` | Durable event boundary. |
| `docs/adr/0007-single-nameplate-automated-recognition.md` | Exact, deterministic identity verification and retry requirements. |
| `docs/adr/0008-pipelined-individual-intake-commit.md` | Independent item/run behavior. |
| `apps/api/src/modules/operations/operations.repository.ts` | Establishes that `attemptCount` increments when a delivery lease is claimed. |
| `apps/api/test/operations.integration.test.ts` | Existing outbox lease/redelivery behavior. |

## Files Not to Touch

- Database migrations and schemas — the recovery can use existing run/outbox state and attempt count.
- Web UI — the requested defects are backend/configuration decisions.
- Provider prompts or image/OCR payload shaping — no extraction behavior change beyond model selection.
- Existing live evidence or Recognition Run records — do not trigger paid retries or rewrite history.

## Codegraph Findings (live, this ticket)

- `IntakeRecognitionRepository.claim` has one caller: `IntakeRecognitionService.handle`.
- `handle` is registered only for `inventory.intake.recognition.requested`.
- `normalizeRecognitionValue` feeds both legacy evaluation and the active v2 nameplate policy; tests must protect both exact identity comparison and optional-field behavior.
- `settingsFromEnvironment` is used by the two live evaluation entry points.
- Model defaults currently appear in validated configuration, the OpenAI adapter, evaluation settings, `.env.example`, and the active `.env`.

## Reuse Audit

Reused:

- Durable delivery `attemptCount` from the existing Operations event contract as proof of redelivery.
- The existing repository transaction/row lock for recognition claiming.
- The existing deterministic recognition normalization function and policy tests.
- The existing validated configuration path for all provider/model selection.

New code justified because:

- The current claim decision has no representation for outbox redelivery recovery.
- Explicit `NO.`/number-label removal is a missing deterministic identity-normalization rule.

Do not duplicate:

- Outbox lease/attempt logic in Intake.
- Provider selection outside `packages/config` and adapter composition.
- Inventory duplicate identity matching.

Escalated to human:

- None; the observed database/outbox states and existing contracts identify the defect precisely.

## Implementation Plan

1. Add failing policy tests for the exact Dexter serial mismatch and explicit/safe label variants.
2. Implement a small field-aware label-stripping helper used by `normalizeRecognitionValue`; require punctuation or whitespace for bare `NO` so `NO123` remains data.
3. Add an integration test that simulates a redelivered outbox event against a run already left `running`.
4. Extend the recognition claim API with an explicit redelivery-recovery option derived only from `attemptCount > 1`; keep queued-only first claim and terminal no-op behavior.
5. Derive an execution claim from the durable outbox job ID and delivery attempt, persist it during claim, and fence repository apply/fail/requeue paths by both the currently `running` state and exact claim; late handlers become no-ops without rewriting history or disrupting the active retry.
6. Add a regression proving late duplicate completion/failure cannot overwrite the retry's terminal result or duplicate completion artifacts.
7. Change Luna defaults/configuration in every canonical fallback and assert the validated default.
8. Run focused tests, then lint, typecheck, integration tests, and build.
9. Restart the local development application so `.env` is re-read, then verify health and that new queued runs would persist `gpt-6-luna` without submitting a paid provider request.

## Constraints

- Preserve current public API contracts.
- Follow `AGENTS.md`, especially module ownership and transaction/outbox invariants.
- Do not log secrets, image bytes, raw OCR/provider payloads, or complete prompts.
- Recovery must be gated by durable redelivery attempt count; an ordinary duplicate first delivery must not race a live run.
- Terminal Recognition Runs must never be reopened.
- Exact serial/model equality remains required after safe label normalization.
- Preserve all unrelated working-tree changes.

## Tests Required

- `npm test -w @simply-clean/api -- intake-recognition-policy.test.ts`
- `npm test -w @simply-clean/api -- intake-recognition.integration.test.ts`
- `npm test -w @simply-clean/config -- environment.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run test:integration`
- `npm run build`

## Done Criteria

- The Dexter `NO.` serial case is accepted with no `ocr_disagreement`.
- `NO123` remains unchanged and exact comparison still rejects genuinely different identities.
- A redelivered abandoned `running` Recognition Run reaches `ready`, `needs_recapture`, `failed`, or `stale`; its outbox job cannot become delivered while the run stays abandoned in `running`.
- A late handler cannot requeue/fail the active retry, overwrite its terminal result, or add a second set of persisted recognition/completion artifacts.
- New/default live configuration identifies `gpt-6-luna` consistently.
- No live provider request is made during automated verification.
- Required checks pass and no unrelated user changes are overwritten.
