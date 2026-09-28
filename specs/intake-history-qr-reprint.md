# intake-history-qr-reprint — Intake history and recoverable whole-Intake QR printing

## Goal

Let Owner Admin and Warehouse users find prior Intake work after an Acquisition
Load has been received, reopen each Intake Batch as durable read-only history,
and print or reprint every QR label for one completed Intake without locating
Machines individually. Preserve Expected Loads as Warehouse's focused active
queue while making completed work deliberately discoverable.

## Ticket Summary

- Keep Warehouse's current date-grouped **Expected Loads** queue for unreceived
  Loads.
- Add a separate **Intake History** section to the Warehouse Loads page. It
  contains received Loads newest-first and supports filtering by Load name and
  received date.
- Warehouse history cards show operational facts only: Load display name,
  received date, and a link to the Load. They do not show source name or source
  reference.
- Owner Admin retains the existing all-Loads view and can open the same Load
  detail and Intake history actions.
- Add an authenticated Intake read endpoint that lists every Intake Batch for
  exactly one Load, newest-first. Each summary includes Batch identity/state,
  timestamps, Candidate count, and mapped Machine count.
- Authorize the history endpoint with the existing `intake.read` permission;
  do not add a role special case or a new permission.
- A missing Load returns not found rather than an indistinguishable empty list.
- Add an **Intake history** panel to Load detail for Owner Admin and Warehouse.
  Each Batch shows Open or Completed, its relevant timestamp, item/Machine
  count, and a link to the existing Intake review route.
- Label an open Batch action **Resume Intake**. Label a committed Batch action
  **View Intake**; the committed Intake page remains terminal/read-only.
- For every committed Batch with mapped Machines, show **Print all QR labels
  (n)** directly in Load detail. It calls the existing whole-Intake PDF client.
- Reprinting must continue to reuse each active Machine QR label, create one
  only when absent, record print activity, remain authenticated/private/
  `no-store`, and use the current popup-preview/download-fallback behavior.
- Do not show **Start Laundrorama intake** after a Load has `receivedAt`.
  Preserve current multi-Batch server behavior for unreceived Loads.
- Empty history and no-match search results use clear, non-error states.
- All history and print controls respect online state and give an accessible
  status message for success or failure.

## Expected Output

- Warehouse `/loads` shows both the active Expected Loads queue and a searchable
  received-Load Intake History without commercial source fields.
- Owner Admin and Warehouse Load detail pages list all Intake Batches and link
  to the existing Intake review.
- A completed Intake can be reprinted from Load detail long after the automatic
  post-commit print opportunity is gone.
- Browser acceptance proves a Warehouse user can finish an Intake, rediscover
  it from history, and reprint the same whole-Intake PDF.
- The committed Git revision passes every local repository gate before release,
  then receives a production health and authenticated workflow smoke test.

## Non-Goals

- Do not combine several Intake Batches into one PDF; the print boundary remains
  exactly one completed Intake Batch.
- Do not change QR payloads, signing, revocation, reissue, fallback lookup,
  label layout, active-label reuse, or print activity semantics.
- Do not add unattended printing, printer configuration, or label templates.
- Do not let Technician/Cleaner browse Loads, Intake history, or manage labels.
- Do not expose source name/reference on Warehouse history cards.
- Do not edit committed Intake evidence or Machine identity through history.
- Do not add pagination or server-side search in this pilot-sized list.
- Do not create or rename a production environment as part of this product
  ticket; release only to an explicitly identified existing production target.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `ARCHITECTURE.md` Reuse Map | Intake owns Batch history; QR owns label lifecycle/rendering; Warehouse date presentation stays in the Loads UI. |
| `packages/contracts/src/intake.ts` / `IntakeBatchSchema` | Canonical cross-app Batch fields and response validation. |
| `packages/contracts/src/authorization.ts` | Owner Admin and Warehouse already have `intake.read` and `inventory.qr_labels.manage`. |
| `apps/api/src/modules/inventory/intake/intake.{controller,service,repository}.ts` | Existing Intake authorization, ID validation, persistence, and Batch-detail boundaries. |
| `apps/api/src/modules/inventory/qr/qr-label.service.ts` / `printIntakeSheet` | Existing committed-Batch validation, active-label reuse/create, rendering, and print recording. |
| `apps/web/src/lib/intake-client.ts` | Existing no-store authenticated Intake read transport and parsing. |
| `apps/web/src/lib/qr-client.ts` / `downloadIntakeQrLabelSheet` | Existing private PDF preview with download fallback. |
| `apps/web/src/app/(protected)/loads/load-dates.ts` | Canonical pure Warehouse Load grouping/date presentation. |
| `apps/web/src/app/(protected)/loads/loads-view.tsx` | Current role-shaped Expected Loads and Owner all-Loads presentation. |
| `apps/web/src/app/(protected)/loads/[loadId]/load-detail-view.tsx` | Current Intake start action and Load detail composition. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Existing terminal Intake view and post-commit QR action; reuse rather than redesign. |

## Files to Modify

| File | Required change |
|---|---|
| `packages/contracts/src/intake.ts` | Add `IntakeBatchSummary` and list-response schemas/types with bounded nonnegative Candidate/Machine counts. |
| `packages/contracts/test/intake.test.ts` | Prove valid summary parsing and reject invalid counts/state. |
| `apps/api/src/modules/inventory/intake/intake.controller.ts` | Add `GET /inventory/loads/:loadId/intake` under `intake.read`. |
| `apps/api/src/modules/inventory/intake/intake.service.ts` | Validate identity/load ID, authorize read, map missing Load to 404, and return summaries. |
| `apps/api/src/modules/inventory/intake/intake.repository.ts` | List Batches for one existing Load using Intake-owned tables and aggregate counts in a bounded query. |
| `apps/api/test/intake.integration.test.ts` | Cover ordering/counts, empty existing Load, missing Load, Warehouse/Owner access, and Technician denial. |
| `apps/web/src/lib/intake-client.ts` | Add validated server-side Batch-summary list read using the existing request policy. |
| `apps/web/test/intake-client.test.ts` | Cover URL, cookie forwarding, parsing, and malformed response rejection. |
| `apps/web/src/app/(protected)/loads/load-dates.ts` | Add pure received-Load newest-first sorting/filter support without changing Expected grouping. |
| `apps/web/src/app/(protected)/loads/loads-view.tsx` | Add Warehouse Intake History, name/date filters, operational-only cards, and empty states. |
| `apps/web/src/app/(protected)/loads/[loadId]/page.tsx` | Fetch Intake summaries with current identity/load/files and pass permission-derived actions. |
| `apps/web/src/app/(protected)/loads/[loadId]/load-detail-view.tsx` | Render Batch history, resume/view links, bulk reprint, status feedback, and hide Start after receipt. |
| `apps/web/test/load-ui.test.tsx` | Cover Warehouse history/search/privacy, Admin behavior, Batch actions, reprint, offline state, and received-Load start suppression. |
| `apps/web/test/inventory-ui.test.tsx` | Update the intentional Warehouse visibility assertion to distinguish Expected from Intake History. |
| `apps/web/src/app/styles.css` | Add only small responsive styles required by the history/filter layout, reusing tokens/components. |
| `tests/browser/intake.spec.ts` | Extend the current real-session desktop/tablet journey through history rediscovery and reprint. |

## Files to Reference Only

| File | Why |
|---|---|
| `docs/adr/0011-intake-capacity-and-whole-load-qr-sheets.md` | Owner/Warehouse whole-Intake print permission, active-label reuse, privacy, and audit decision. |
| `docs/adr/0012-batch-nameplates-and-capacity-optional-qr-sheets.md` | Unknown capacity remains printable. |
| `specs/INT-06.md` | Original whole-Intake QR contract and existing verification coverage. |
| `specs/tablet-intake-finalize-and-print.md` | Visible PDF preview/download fallback and one final Intake commit. |
| `specs/warehouse-expected-loads-reset.md` | Expected queue grouping and Warehouse-safe card content. |
| `apps/api/test/qr-label.integration.test.ts` | Existing proof that reprints reuse labels and append print activity. |
| `apps/web/test/qr-client.test.ts` | Existing preview/download browser behavior. |

## Files Not to Touch

- `apps/api/src/modules/inventory/qr/**` — the required safe reprint behavior
  already exists and is covered.
- `packages/database/**` — existing Batch/mapping indexes support this read; no
  schema or migration is required.
- `packages/contracts/src/authorization.ts` — required permissions already
  exist for both intended roles.
- Recognition providers/policy, Catalog, Production, Files, Imports, Sales,
  Logistics, and service-worker code — unrelated.
- `source-materials/**`, generated artifacts, and unrelated worktree changes.

## Codegraph Findings (live, this ticket)

- The clean `dev` index at `1603e1b` is current: 257 files, 3,967 symbols, and
  no pending indexed changes before specification creation.
- `IntakeController` has create-by-Load and get-by-Batch routes but no list by
  Load. `IntakeService.get` and `IntakeRepository.find/detail` are the reusable
  authorization/validation/mapping path.
- `LoadDetailView` is called only by its server page and focused UI tests, so
  adding initial Batch summaries has a contained caller/test blast radius.
- `getIntakeBatch` has twelve affected symbols, but the new list read can be
  additive and must not alter current Batch-detail behavior.
- The Load API already returns received Loads to Warehouse; only the web view
  filters them out. No new Load-list backend state or lifecycle is needed.
- `printIntakeSheet` is already called by the Intake review client and has API,
  web-client, and browser coverage. History must call that same client.

## Reuse Audit

Reused:

- Existing role permission policy and protected route-state mapping.
- Existing Intake Batch schema fields, UUID parsing, repository/service layers,
  and Machine mappings.
- Existing Load read, Expected grouping, server-state, online-state, visual
  tokens, QR sheet client, and accessible status message patterns.
- Existing deterministic integration fixtures and full-boundary Intake journey.

New code justified because:

- No API contract/query lists Intake Batches by Load, so old Batch IDs cannot be
  discovered from the product.
- No Warehouse history presentation or Load-detail Batch summary exists.

Do not duplicate:

- QR authorization/rendering/signing, active-label creation, print auditing,
  Load receipt rules, permission decisions, or Intake-detail rendering.

Escalated to human:

- Deployment inspection found staging Cloud Run services but no identified
  production services. Implementation and local/GitHub work can proceed; an
  existing production target must be identified before release.

## Implementation Plan

1. Add the additive Batch-summary/list contracts and focused contract tests.
2. Add the permission-guarded Load-scoped Intake list through controller,
   service, and repository, returning newest-first aggregate summaries.
3. Add API integration coverage for authorization, absence, ordering, and
   counts.
4. Add the validated web read and fetch summaries in Load detail's existing
   protected server read.
5. Render Intake history with resume/view links and reuse the existing QR PDF
   client for committed Batch reprints; suppress new Intake on received Loads.
6. Extend Warehouse Loads with a separate name/date-filtered received history
   while leaving Expected grouping and source privacy intact.
7. Add component/client tests and extend the browser Intake journey to leave the
   completed page, rediscover it through history, and reprint.
8. Run focused tests, then every repository gate and `git diff --check` locally.
9. Review the diff against this spec, write the architecture review, commit the
   exact reviewed files, push the feature branch, and re-index codegraph.
10. Deploy only that committed revision to the identified production target,
    then verify health, authenticated Admin/Warehouse history, and PDF reprint.

## Constraints

- Follow `AGENTS.md`, preserve module ownership, and keep changes scoped.
- Use the existing private, `no-store`, authenticated QR request; never place a
  QR token, serial, PDF bytes, source reference, or sensitive payload in logs.
- Count mappings for the printable Machine total; do not infer it from
  Candidates in the browser.
- Keep committed Intake Batches immutable and existing multi-Batch Load behavior
  intact.
- Do not turn the history query into another lifecycle state or copy Batch data
  onto Loads.
- Local full verification must pass before commit/push/deployment.
- Deploy and production-test the exact pushed commit, never the dirty original
  workspace or an uncommitted build context.

## Tests Required

- Focused contract, Intake API integration, Intake client, Load UI, Inventory
  UI, and browser Intake tests during implementation.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- `git diff --check`
- Post-deploy: API live/ready health, web login, Warehouse history discovery,
  Admin Load-detail history, and authenticated whole-Intake PDF reprint.

## Done Criteria

- Warehouse can find a received Load by name/date without losing the Expected
  queue or seeing commercial source fields in history cards.
- Owner Admin and Warehouse can see every Batch on Load detail; open Batches are
  resumable and committed Batches are read-only/viewable.
- A committed Batch with mapped Machines can be reprinted from Load detail and
  uses the exact existing active-label/audited PDF path.
- Received Loads cannot present a misleading Start Intake action.
- Technician/Cleaner cannot list Load Intake history or print the sheet.
- Focused and full local gates pass before commit; the exact commit is pushed.
- Production health and authenticated role journeys pass against the deployed
  revision, with the production target recorded in the final report.
- No QR, schema, permission, or unrelated workflow logic is duplicated.
