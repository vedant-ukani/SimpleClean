# Catalog specification backfill

## Goal

Add a safe, resumable backfill workflow that researches missing approved Catalog
specifications for existing exact model variants. It must publish additive immutable
revisions on the existing variant, prioritize models present in the current Inventory
workbook, retain field-level official-source evidence, and make new facts visible through
the existing Catalog, Intake, and Machine read paths.

## Current gap

- The approved Catalog contains 299 variants across six manufacturers.
- 224 variants have none of the five scalar fields: width, depth, height, weight, or
  capacity. Many more have empty electrical, fuel, configuration, or production fields.
- AUT-392 can discover an unsupported exact model, but `requestDiscovery()` immediately
  returns an existing exact revision. It therefore cannot fill blanks on a known model.
- `publishDiscovery()` derives a new discovery variant ID. Reusing it for an existing
  model would risk a second model identity instead of a new revision of the original.
- The existing Catalog UI already shows the latest approved revision and renders unknown
  values. No new Catalog tab or editing UI is required.

## Expected outcome

- An operator can preview and execute a bounded backfill across `inventory` or `all`
  approved Catalog variants.
- `all` includes every manufacturer and variant; Inventory-resolved variants are ordered
  first, followed by manufacturer and canonical model.
- Only missing fields are requested and accepted: width, depth, height, weight, capacity,
  voltage, phase, fuel, configuration, production start year, and production end year.
- A verified result creates the next approved revision for the same variant and carries
  forward every existing fact and its evidence unchanged.
- Existing non-empty facts can never be overwritten by this workflow. A conflicting
  provider value is ignored, not averaged, merged, or treated as a correction.
- A model with no newly verified missing field records a reusable no-result run and does
  not publish an empty revision.
- Re-running the same base revision, missing-field set, and provider/policy version reuses
  its prior run. A later approved revision or policy version is independently eligible.
- Newly approved revisions appear automatically in Catalog list/detail. Existing Machine
  links stay pinned to their prior revision; future resolutions use the latest revision.

## Non-goals

- Do not scrape or crawl manufacturer sites, retain page/manual bodies, or bypass access
  controls.
- Do not infer a model from family similarity, dimensions, capacity, another model, OCR,
  serial number, or Inventory type.
- Do not correct or replace an already populated Catalog field automatically.
- Do not refresh existing Machine links, modify Machine actual measurements, or change
  Catalog-versus-actual precedence.
- Do not add a scheduler, unattended recurring job, admin web screen, approval queue, or
  bulk-edit API.
- Do not broaden trusted manufacturer hosts or accept distributors, resellers,
  marketplaces, search snippets, or family-only evidence.
- Do not add or change executable serial-year rules in this ticket.
- Do not promise that an unavailable official fact will become known.

## Operator contract

Add a root command:

`npm run catalog:backfill -- --scope <inventory|all> [--execute] --max-models <n>`

- Default mode is preview-only and performs no provider calls or writes.
- `--scope` and positive `--max-models` are required; there is no unbounded execution.
- `--execute` uses the configured Catalog discovery provider. Disabled or missing provider
  credentials fail before any run is reserved.
- The command is sequential so provider limits, cost, and output remain bounded.
- Preview and execution print only aggregate counts plus manufacturer/model identifiers;
  never prompts, raw responses, source bodies, secrets, or Inventory row contents.
- Exit non-zero for invalid arguments, unavailable provider, or an unexpected model
  failure. Already-published/no-result runs are normal resumable outcomes.
- The final summary reports selected, attempted, published, no-result, reused, failed,
  and estimated provider cost from persisted run pricing. It also reports field coverage
  before and after execution.

## Selection and priority rules

1. Read latest approved revisions through a Catalog repository query, not direct SQL in
   the command.
2. A scalar or production year is missing when it is `null`; a list field is missing when
   it is empty.
3. Exclude variants with no missing target fields.
4. For Inventory priority, parse the read-only workbook through the existing import parser
   and resolve only manufacturer/model values through existing exact/alias Catalog logic.
5. Never treat ambiguous, unsupported, family-only, or serial-derived matches as priority.
6. `inventory` selects only exact/alias resolved variants. `all` selects all incomplete
   variants with that same set first.
7. Stable order is Inventory priority, manufacturer name, model, then variant ID.

## Enrichment policy

- Add `requestSpecificationEnrichment(variantId, context)` to the Catalog application
  boundary. The command must not assemble persistence objects or call the provider itself.
- Resolve the latest approved revision and its missing fields before reserving a run.
- The dedupe key includes operation kind `specification_enrichment`, base revision ID,
  sorted missing-field names, provider, provider model, prompt, schema, and policy versions.
- Send only canonical manufacturer, canonical model, equipment class, and requested field
  names to the provider. Never send Inventory rows, Machine data, serials, OCR, images, or
  existing evidence content.
- Reuse the AUT-392 provider adapter, bounded HTTP transport, pricing, trusted-host lookup,
  structured response schema, and deterministic verification/conversion policy.
- Exact manufacturer/model and equipment-class evidence remain mandatory. The verified
  equipment class must equal the stored variant equipment class.
- Filter verified output to the requested missing fields. At least one field must remain.
- For list fields, accept the one conflict-free verified list as a whole; do not union it
  with an existing list.
- Production years use the same exact-model HTTPS official-source evidence and bounds as
  AUT-392. A start/end pair that becomes inverted after merge is rejected.

## Publication invariants

- Publish inside one database transaction after the provider call.
- Lock the base revision and confirm it is still the latest approved revision for the
  variant. If it is stale, complete the run as `superseded` without publishing; a later
  command run may evaluate the new base revision.
- Use the original variant ID, family, canonical model, aliases, and equipment class.
- Create a new discovery dataset and the next monotonically increasing revision number.
- Specs and production years equal the base revision plus newly verified missing facts.
- Copy base revision evidence rows for all carried-forward facts, reusing their immutable
  source rows. Insert new source/evidence rows only for newly accepted facts.
- Record publication mode `automatic_official_source_policy`, discovery run, usage,
  pricing snapshot, response fingerprint, audit mutation, and timestamps exactly as in
  AUT-392.
- Never mutate or supersede the prior revision row, delete prior evidence, or repoint
  existing Machine resolution rows.
- Concurrent attempts may publish at most one next revision for a base revision.

## Files to modify

| File | Required change |
|---|---|
| `packages/contracts/src/catalog.ts` | Add additive operation/no-result status needed for specification-enrichment runs. |
| `apps/api/src/modules/catalog/catalog.service.ts` | Add preview selection and `requestSpecificationEnrichment`; centralize shared discovery execution without changing unsupported-model behavior. |
| `apps/api/src/modules/catalog/catalog.repository.ts` | List incomplete latest revisions, load enrichment context, and atomically publish a merged revision on the existing variant with copied evidence and stale-base fencing. |
| `apps/api/src/modules/catalog/discovery/catalog-discovery.provider.ts` | Add requested fields and stored equipment class to the provider request. |
| `apps/api/src/modules/catalog/discovery/openai-catalog-discovery.adapter.ts` | Bound the prompt to requested fields while retaining strict schema and unrestricted search. |
| `apps/api/src/modules/catalog/discovery/fake-catalog-discovery.adapter.ts` | Support deterministic enrichment responses. |
| `apps/api/src/catalog-backfill.ts` (new) | Parse bounded CLI options, derive Inventory priority through existing parser/resolution, execute sequentially, and print safe summaries. |
| `apps/api/package.json`, `package.json` | Expose the workspace and root `catalog:backfill` commands. |
| Focused Catalog tests | Prove selection, additive merge, provenance, dedupe, stale fencing, safety, and command behavior. |

## Files to reference only

- `specs/AUT-352.md` — Catalog identity, revision, provenance, and effective-value rules.
- `specs/AUT-392.md` — automatic official-source discovery policy and provider behavior.
- `docs/adr/0017-automatic-official-source-catalog-discovery.md` — accepted automatic publication decision.
- `apps/api/src/modules/catalog/catalog.logic.ts` — exact/alias resolution and serial rules.
- `apps/api/src/modules/catalog/catalog.coverage.ts` — coverage semantics and conservative composition.
- `apps/api/src/modules/imports/import-parser.ts` — read-only Inventory workbook parsing.
- `apps/api/src/modules/inventory/actual-specs.ts` — actual/catalog/unknown precedence.

## Files not to touch

- Existing database migrations and schema; current discovery/revision tables are sufficient.
- Catalog web pages, Intake pages, Machine pages, and their clients.
- Machine resolution refresh behavior and Inventory persistence.
- Recognition/OCR providers, prompts, evidence, readiness, and Batch Commit.
- Static Catalog manifests, source workbook, artifact-generation code, and unrelated files.

## Reuse audit

Reuse:

- Catalog exact/alias normalization, approved-only reads, revision details, trusted hosts,
  immutable source/evidence tables, automatic publication metadata, discovery-run leases,
  audit recording, price estimation, OpenAI adapter, and deterministic fake provider.
- Import workbook parsing and existing Catalog resolution for Inventory prioritization.
- Existing UI because it already renders latest revisions, unknown fields, evidence,
  publication mode, and discovery metadata.

New code is justified because no current application operation selects incomplete known
variants, requests only their missing fields, or safely publishes an additive revision on
the existing variant. Do not duplicate normalization, provider transport, verification,
cost calculation, or rendering.

## Implementation order

1. Add repository projections for incomplete latest approved revisions and base context.
2. Extend the provider request with stored class and requested fields; keep AUT-392 calls
   behavior-compatible by requesting the full discovery set for unknown models.
3. Extract one shared private discovery executor in `CatalogService`, then add the exact
   known-variant enrichment operation with operation-specific dedupe.
4. Add transactional additive publication with evidence carry-forward and stale fencing.
5. Add the bounded preview/execute command and Inventory-first ordering.
6. Add unit and integration tests, run a fake-provider end-to-end backfill, and verify the
   existing Catalog UI read contract needs no changes.
7. Run all workspace quality gates. A live OpenAI execution is a deployment operation and
   requires configured credentials plus an explicit bounded command invocation.

## Tests required

- Unit: missing-field detection for scalars/lists/years and stable Inventory-first order.
- Unit: provider prompt contains only public canonical identity/class/requested fields.
- Unit: policy rejects class mismatch, non-official evidence, unrelated fields, conflicts,
  inverted years, and a result with no newly verified field.
- Integration: enrich an existing model onto the same variant with revision `n + 1`.
- Integration: retain all old facts and evidence; add only new official evidence.
- Integration: existing Machine remains pinned while a new resolution uses the new revision.
- Integration: same base/missing/version tuple is idempotent across retries and processes.
- Integration: concurrent/stale base cannot publish a second conflicting revision.
- Integration: no-result, provider failure, disabled configuration, and resume behavior.
- Command: preview makes zero provider calls/writes; limits and scope are mandatory.
- Command: deterministic fake-provider run processes multiple manufacturers and reports
  accurate counts/cost without sensitive output.
- Regression: unsupported-model AUT-392 discovery remains unchanged.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run build`

## Done criteria

- The backfill can address every incomplete approved model across all six manufacturers,
  with current Inventory matches processed first.
- Verified missing fields publish on the existing variant as an immutable additive revision
  with complete carried/new provenance and audit metadata.
- Existing facts, aliases, Machine pins, actual overrides, and unsupported-model discovery
  behavior do not change.
- Preview is safe by default; execution is explicit, bounded, resumable, and cost-reported.
- The existing Catalog UI automatically shows the latest enriched values and sources.
- Deterministic end-to-end tests and all required workspace gates pass.
