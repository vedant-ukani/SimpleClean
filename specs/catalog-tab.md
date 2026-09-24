# catalog-tab — Browse the verified Catalog in the web app

## Goal

Expose the approved manufacturer/model Catalog as a permission-derived `Catalog` tab in the protected Laundrorama web app. Staff can search and page through approved model revisions, open a model, and inspect its specifications and official-source provenance without changing Catalog data.

## Ticket Summary

- Add a `Catalog` workspace navigation destination for roles with `catalog.read`.
- Add a protected `/catalog` route with model/family search, manufacturer filtering, result count, and pagination over the existing Catalog list API.
- Add a protected `/catalog/[revisionId]` route showing the pinned revision's model facts, specifications, aliases, production range, source documents, checksum availability, and field evidence.
- Reuse the existing read-only Catalog API and contracts. Do not add a Catalog mutation or browser-side source retrieval.
- Preserve the existing protected-route error mapping, no-store reads, permission policy, shared visual system, and responsive navigation.

## Expected Output

- The sidebar/mobile menu contains a `Catalog` tab for every current role because every current role has `catalog.read`.
- `/catalog` displays the reviewed Catalog and supports `query`, `manufacturer`, and `page` URL parameters.
- Each row links to `/catalog/{revisionId}`, where staff can inspect approved specs and their official evidence.
- Browser acceptance proves a warehouse user can navigate from the Catalog tab to a sourced model revision.

## Non-Goals

- Do not edit, approve, import, or refresh Catalog data from the UI.
- Do not add fuzzy resolution, serial decoding, runtime scraping, or source monitoring.
- Do not change Catalog API/database contracts or Machine enrichment behavior.
- Do not add dashboard cards or redesign unrelated navigation.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/web/src/lib/navigation.ts` / `navigationForRole` | Canonical permission-derived navigation metadata. |
| `apps/web/src/app/(protected)/active-navigation.tsx` | Shared desktop/mobile navigation and Lucide icon mapping. |
| `apps/web/src/lib/server-route-state.ts` | Canonical protected-page mapping for sign-in, forbidden/not-found, and unavailable states. |
| `apps/web/src/app/(protected)/machines/page.tsx` | Existing server-side search-param and protected data-loading pattern. |
| `apps/web/src/app/(protected)/machines/machines-view.tsx` | Existing search/list presentation pattern. |
| `apps/web/src/lib/api-client.ts` | Existing generic-named web API boundary; extend it with one reusable server JSON read rather than copying another request implementation. |
| `packages/contracts/src/catalog.ts` | Existing list/detail response schemas and Catalog model/source/evidence types. |
| `apps/api/src/modules/catalog/catalog.controller.ts` | Existing authenticated list/detail endpoints; reference only. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/web/src/lib/api-client.ts` | Add a bounded reusable server JSON GET with no-store behavior, cookie forwarding, API-base resolution, and a status-bearing error compatible with the route-state mapper; retain health behavior. |
| `apps/web/src/lib/catalog-client.ts` (new) | Build typed list/detail Catalog reads on the shared server JSON helper and existing response schemas. |
| `apps/web/src/lib/navigation.ts` | Add permission-derived `/catalog` navigation metadata and a Catalog icon name. |
| `apps/web/src/app/(protected)/active-navigation.tsx` | Map the Catalog icon name to the shared Lucide set. |
| `apps/web/src/app/(protected)/catalog/page.tsx` (new) | Parse URL search/filter/page inputs, load through the protected route-state mapper, and render the Catalog list. |
| `apps/web/src/app/(protected)/catalog/catalog-view.tsx` (new) | Render the accessible search/filter form, responsive result table/list, detail links, empty state, and previous/next links that preserve filters. |
| `apps/web/src/app/(protected)/catalog/[revisionId]/page.tsx` (new) | Load one approved revision through the protected route-state mapper. |
| `apps/web/src/app/(protected)/catalog/[revisionId]/catalog-detail-view.tsx` (new) | Render facts, specs, utilities, aliases, production range, official source links/checksum status, and field evidence. |
| `apps/web/test/api-client.test.ts` | Cover the shared server read's cookie/no-store behavior and status-bearing failure. |
| `apps/web/test/catalog-client.test.ts` (new) | Cover query encoding plus list/detail schema parsing. |
| `apps/web/test/catalog-ui.test.tsx` | Cover Catalog list, preserved pagination/filter links, empty state, detail specs, and provenance rendering. |
| `apps/web/test/identity-ui.test.tsx` | Assert Catalog tab visibility, ordering, icon, category, and nested-route active state. |
| `tests/browser/catalog.spec.ts` | Add the full navigation/search/detail/provenance journey. |

## Files to Reference Only

| File | Why |
|---|---|
| `apps/api/src/modules/catalog/**` | The read API and service authorization already exist. |
| `apps/web/src/app/styles.css` | Reuse existing panels, forms, tables, lists, and pagination styles. |
| `apps/web/src/lib/inventory-client.ts` | Reference server request calling conventions without coupling Catalog to Inventory. |
| `specs/AUT-352.md` | Catalog authority, provenance, exact-resolution, and read-only UI boundaries. |

## Files Not to Touch

- Catalog manifest, schema, import, resolution, Intake, Machine enrichment, and actual-measurement code.
- Service-worker cache policy; Catalog remains a protected network-only route.
- Source materials and recognition providers.

## Codegraph Findings (live, this ticket)

- `navigationForRole` is consumed by the shared desktop/mobile navigation and dashboard filtering; its existing test is `apps/web/test/identity-ui.test.tsx`.
- `isCurrentPath` already marks nested routes active, so `/catalog/{revisionId}` will keep the Catalog tab selected.
- The Catalog list response contains summaries only; the existing detail endpoint supplies specifications and provenance.
- The codegraph index reports pending workspace changes, so live source reads and repository search were used to confirm current paths and callers without refreshing the index before approval.

## Reuse Audit

Reused:

- Existing `catalog.read` permission, Catalog list/detail endpoints, response schemas, route-state mapper, navigation derivation, Lucide presentation metadata, and shared form/table/pagination styles.

New code justified because:

- No Catalog web route or typed web Catalog client exists.
- The generic API client can own the reusable protected server-read mechanics, avoiding another copy of request/error/cookie policy.

Do not duplicate:

- Permission checks, API query validation, Catalog facts, status-to-route mapping, responsive shell behavior, or specification business rules.

Escalated to human:

- None.

## Implementation Plan

1. Add the shared protected server JSON read and typed Catalog client with focused tests.
2. Add the permission-derived navigation item and icon; update navigation tests.
3. Build the server-rendered list and detail routes using existing Catalog contracts and protected route-state handling.
4. Render search/filter/pagination and complete source-backed detail facts with accessible labels and links.
5. Add component and browser acceptance coverage, then run all workspace gates.

## Constraints

- Keep the UI read-only and network-authoritative.
- Never fetch manufacturer websites from the browser or application runtime.
- Preserve query/filter values in pagination and URL-encode all parameters and revision IDs.
- Render unknown values explicitly; never infer missing specifications or dates.
- Keep source links external and safe; do not render source HTML.
- Follow `AGENTS.md`, preserve unrelated dirty-worktree changes, and use the existing shared visual system.

## Tests Required

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`

## Done Criteria

- Every role with `catalog.read` sees a working Catalog tab on desktop and mobile navigation.
- Staff can search, filter, page, open a revision, and inspect labeled specs and official evidence.
- Direct unauthenticated/forbidden/unavailable states continue through the shared protected-route behavior.
- No Catalog mutation or runtime external-source request is introduced.
- Focused tests and every required workspace gate pass with no duplicated request or permission decision.
