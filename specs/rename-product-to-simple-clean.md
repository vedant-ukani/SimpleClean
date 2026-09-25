# rename-product-to-simple-clean — Rename the visible product brand

> Historical ticket. Its visible-brand decision and technical-identifier exceptions were superseded by the repository-wide Laundrorama migration in [ADR 0020](../docs/adr/0020-laundrorama-technical-identity.md). The original scope and results below are retained as a record of past work.

## Goal

Rename the user-facing product brand from **Simply Clean** to **Simple Clean** throughout the running application and its generated QR labels, without renaming internal package scopes, cache namespaces, repository paths, or persistence identifiers.

## Ticket Summary

- Replace visible `Simply Clean` and `Simply Clean Operations` copy with `Simple Clean` and `Simple Clean Operations`.
- Update browser/PWA metadata so installed-app names and descriptions use the new brand.
- Update printable QR-label text, accessibility text, and the downloaded label filename.
- Update tests that intentionally assert branded output.
- Preserve technical identifiers whose rename would create migration or compatibility work.

## Expected Output

- Login, protected navigation, global error, protected error, and offline screens display `Simple Clean`.
- Browser metadata and the PWA manifest identify the app as `Simple Clean Operations` with short name `Simple Clean`.
- Generated equipment labels say `Simple Clean Equipment` and download as `simple-clean-equipment-<code>.svg`.
- The service worker's plain-text offline fallback names `Simple Clean Operations`.
- Relevant web and API tests pass.

## Non-Goals

- Do not rename the repository directory.
- Do not rename npm package scopes such as `@simply-clean/*`.
- Do not rename database objects, environment variables, routes, API contracts, or authorization roles.
- Do not rename the existing PWA cache prefix; changing it could strand old caches and is not visible branding.
- Do not redesign the interface, logo, icon artwork, colors, or typography.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/web/src/app/layout.tsx` / `metadata` | Browser and installed-app metadata. |
| `apps/web/src/app/manifest.ts` / `manifest` | PWA name, short name, and description. |
| `apps/web/src/app/(protected)/layout.tsx` | Persistent signed-in navigation brand. |
| `apps/web/src/lib/pwa-cache-policy.ts` | Plain-text offline fallback; internal cache namespace must remain unchanged. |
| `apps/api/src/modules/inventory/qr/qr-label.renderer.ts` / `QrLabelRenderer` | Printable/downloaded label branding and accessibility text. |
| `apps/web/test/pwa-cache-policy.test.ts` | PWA metadata expectation. |
| `apps/api/test/qr-label.test.ts` | QR text and filename expectations. |
| `apps/api/test/qr-label.integration.test.ts` | Full-boundary QR label branding expectation. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/web/src/app/layout.tsx` | Rename metadata strings. |
| `apps/web/src/app/manifest.ts` | Rename PWA name, short name, and description. |
| `apps/web/src/app/login/page.tsx` | Rename login-screen eyebrow. |
| `apps/web/src/app/(protected)/layout.tsx` | Rename signed-in navigation brand. |
| `apps/web/src/app/error.tsx` | Rename global error-screen eyebrow. |
| `apps/web/src/app/(protected)/error.tsx` | Rename protected error-screen eyebrow. |
| `apps/web/src/app/offline/page.tsx` | Rename offline-screen eyebrow. |
| `apps/web/public/icons/app-icon-v1.svg` | Rename the icon's accessible label. |
| `apps/web/public/icons/app-maskable-v1.svg` | Rename the maskable icon's accessible label. |
| `apps/web/src/lib/pwa-cache-policy.ts` | Rename only the visible offline fallback sentence. |
| `apps/web/src/lib/qr-client.ts` | Accept the new branded QR download filename and use it in the fallback filename. |
| `apps/api/src/modules/inventory/qr/qr-label.renderer.ts` | Rename visible/accessibility strings and generated download filename prefix. |
| `apps/web/test/pwa-cache-policy.test.ts` | Update PWA brand expectation. |
| `apps/web/test/qr-client.test.ts` | Update QR download filename expectations. |
| `apps/api/test/qr-label.test.ts` | Update rendered label and filename expectations. |
| `apps/api/test/qr-label.integration.test.ts` | Update integration expectation. |

## Files to Reference Only

| File | Why |
|---|---|
| `ARCHITECTURE.md` | Confirms UI ownership and PWA cache constraints. |
| `AGENTS.md` | Project implementation and testing rules. |
| `packages/contracts/src/authorization.ts` | Confirms that roles/permissions are unrelated to branding. |

## Files Not to Touch

- `package-lock.json` — npm package identity is unchanged.
- Workspace package names under `apps/*/package.json` and `packages/*/package.json` — internal scope remains `@simply-clean`.
- Database migrations and schemas — no stored identifier changes.
- `.env*` — no configuration change is required.
- `PWA_CACHE_PREFIX` in `apps/web/src/lib/pwa-cache-policy.ts` — compatibility namespace, not visible copy.
- Existing binary/generated communication artifacts and source inventory files.

## Codegraph Findings (live, this ticket)

- `manifest` is consumed by the PWA metadata test.
- `metadata` in the root layout is the browser-level branding source.
- `QrLabelRenderer` owns printable QR-label content; controller and repository behavior do not require changes.
- No shared branding constant currently exists. The strings occur in separate descriptive surfaces, and introducing a cross-application abstraction would be disproportionate for this rename.

## Reuse Audit

Reused:

- Existing Next.js metadata and manifest surfaces.
- Existing QR-label renderer and its unit/integration tests.
- Existing PWA offline fallback generation.

New code justified because:

- No new behavior or abstraction is needed; this is a direct copy replacement.

Do not duplicate:

- Authorization, route state, QR identity, or PWA cache policy decisions.

Escalated to human:

- None. The requested visible brand is unambiguous: `Simple Clean`.

## Implementation Plan

1. Replace visible application, icon accessibility, and PWA brand strings.
2. Replace printable QR-label visible/accessibility text and filename prefix, including the web download client.
3. Update the tests that assert those outputs.
4. Search application source again to ensure no old visible brand remains.
5. Run targeted tests, lint, and type checking.

## Constraints

- Preserve existing API contracts and all internal technical identifiers.
- Follow `AGENTS.md`, including the reuse-vs-inline rule.
- Match existing style in referenced files.
- Keep changes scoped to this ticket.
- Do not log secrets, tokens, PII, or sensitive payloads.

## Tests Required

- `npm test -w @simply-clean/web`
- `npm test -w @simply-clean/api`
- `npm run lint`
- `npm run typecheck`

## Done Criteria

- Every visible application surface listed above uses `Simple Clean`.
- PWA metadata and QR-label output use the new brand.
- Internal `simply-clean` technical identifiers remain unchanged.
- Targeted tests, lint, and type checking pass.
- No duplicate branding abstraction is introduced.
