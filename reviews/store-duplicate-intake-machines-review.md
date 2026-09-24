# store-duplicate-intake-machines — Review

## Status

Pass

## Outcome

Photo Intake now stores every supported and approved Candidate as its own
provisional Machine. Existing or same-batch manufacturer-and-serial matches no
longer warn, block recognition, require acknowledgement, disable approval, or
block individual or compatible batch commit. The Intake UI no longer displays
Inventory warning or serial-match controls, and no automatic merge path was
introduced.

## Implementation Review

- Targeted and historical recognition retain evidence validation but no longer
  query duplicate identity to change Candidate readiness.
- Candidate confirmation, Individual Intake Commit, and compatible Batch Commit
  retain their evidence, status, version, authorization, idempotency, audit,
  outbox, and transaction boundaries while omitting duplicate gates.
- Each successful Candidate commit still calls the canonical Inventory Machine
  creation path and produces a distinct provisional Machine, immutable evidence,
  Candidate mapping, audit record, and outbox event.
- The unique verified identity-claim boundary remains unchanged. Later explicit
  verification can mark a conflict while preserving both Machine records.
- Spreadsheet-import matching and duplicate review were not changed.
- Compatibility warning fields and finding enum values remain parseable, while
  current Intake detail returns no duplicate warnings.

## Verification

- API Intake integration: 8/8 passed.
- API recognition integration: 6/6 passed, including a supported targeted run
  that matches an existing Machine and still commits a distinct provisional
  Machine with its own mapping and evidence.
- Web tests: 79/79 passed.
- Browser Intake journey: desktop and tablet, 2/2 passed.
- Workspace lint passed.
- Workspace typecheck passed.
- Production build passed.
- Diff whitespace validation passed.

## Reuse Audit

No new domain abstraction or duplicate Machine-creation path was added. The
implementation reuses Inventory's existing provisional Machine creation,
evidence, mapping, idempotency, audit/outbox, and later verification/conflict
boundaries. Obsolete Intake matching helpers were removed instead of retained as
dead policy copies.

## Review Finding Resolved

The first pass lacked direct coverage of the active targeted recognition plus
Individual Intake Commit path against an existing exact identity. That test was
added, and unused Intake identity-matching repository helpers were removed before
this review passed.

## Durable Memory Updated

- `ARCHITECTURE.md`
- `CONTEXT.md`
- `DECISIONS.md`
- `PRODUCT.md`
- ADR 0013, with supersession notes in ADR 0010 and ADR 0012
