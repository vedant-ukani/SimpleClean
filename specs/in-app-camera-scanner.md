# in-app-camera-scanner — Scan Machine QR labels with the device camera

## Goal

Let an authenticated worker open the existing Scan workspace, deliberately start the tablet or phone camera, point it at a printed Laundrorama Machine QR label, and retrieve the same authorized Machine summary already returned by signed-token or fallback-code lookup. Camera frames stay in the browser, and the existing signed QR, active-label, session, permission, and Inventory boundaries remain authoritative.

## Ticket Summary

- Add an in-app live camera scanner to `/scan`; do not require the worker to leave the application and use the operating-system camera.
- Camera access starts only after the worker presses **Scan QR code**. Do not prompt for camera permission on page load.
- Prefer the rear/environment camera and show a touch-friendly live preview with clear scanning, stop, permission, unavailable, invalid-content, resolving, and result states.
- Decode frames locally in the browser with the existing `jsqr` package promoted to an explicit web runtime dependency. Do not upload, persist, log, or attach camera frames.
- Accept only the platform's printed QR shape: an absolute same-origin `/scan#<valid signed-token syntax>` URL. Unrelated QR content must never be sent to the resolve API.
- Submit an accepted token through the existing `resolveQrLabel({ token })` client. The API remains responsible for signature verification, active-label lookup, current-session permission, and Machine retrieval.
- Stop every camera track immediately after a valid platform QR is captured, when the worker presses Stop, when the page is hidden, and when the component unmounts or errors.
- Preserve manual fallback-code entry and the existing externally scanned fragment flow, including token preservation through sign-in.
- Preserve the current Machine summary and **Open Machine details** action. Camera scanning does not automatically perform a Machine mutation or relocation.
- Keep scanning online-only. When offline, camera lookup actions remain unavailable and the existing offline message remains authoritative.

## Expected Output

- The protected Scan page shows a primary **Scan QR code** action above the existing fallback-code form.
- Starting the scanner requests the environment-facing camera, displays an inline preview and **Stop camera**, and searches for a printed Machine QR without capturing a stored photo.
- A valid label stops the camera, resolves through the existing protected API, and shows the correct Machine summary and link to its detail page.
- Permission denial, missing/occupied camera, unsupported media APIs, invalid QR content, revoked labels, offline state, and API failures produce actionable text while fallback entry remains usable.
- Camera resources are released on every exit path; backgrounding the page cannot leave the camera running.
- Desktop and tablet layouts retain accessible controls, no serious accessibility violations, and no horizontal overflow.

## UI Follow-up — Camera compatibility and printable viewer

- If the preferred environment-camera request fails because its constraints are unsupported, retry once with generic video constraints before reporting failure.
- Distinguish unsupported/insecure browser access, permission denial, no camera, and busy/unreadable camera states with actionable text. Never expose or log the raw browser error.
- Embedded preview browsers that do not expose `getUserMedia` cannot be made camera-capable by application code; tell the worker to open the same localhost/HTTPS page in Chrome or Safari while preserving fallback-code entry.
- Replace the individual Machine label's automatic SVG download with an accessible in-app label viewer. **View / Print** fetches the same protected printable SVG, shows it without creating a download, and provides explicit **Print label** and **Close** actions.
- Printing invokes the browser print dialog for the label preview only. Closing or replacing the viewer revokes its object URL; QR bytes remain protected and memory-only.

## Non-Goals

- Do not change QR payloads, signatures, label lifecycle, print rendering, fallback codes, permissions, API contracts, database schema, or audit behavior.
- Do not add anonymous/public Machine lookup, native applications, service workers for camera work, offline resolution, scan queues, analytics, geolocation, or captured-image storage.
- Do not add flashlight, zoom, front/rear camera selection, continuous multi-Machine batch scanning, automatic relocation, or workflow mutations.
- Do not use OCR, AI, a provider API, a public URL shortener, or server-side image decoding.
- Do not remove or subordinate the fallback-code path.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/web/src/app/(protected)/scan/scan-view.tsx` `ScanView` / `ScanResult` | Canonical Scan UI, resolver state, fragment flow, login handoff, fallback lookup, and Machine result. |
| `apps/web/src/lib/qr-client.ts` | Canonical QR token parsing and protected `resolveQrLabel` client. |
| `apps/api/src/modules/inventory/qr/qr-label.service.ts` | Existing signed `/scan#token` creation and authoritative resolution behavior. |
| `apps/web/src/app/(protected)/online-status.tsx` `useOnlineStatus` | Shared online/offline decision for protected operational UI. |
| `apps/web/src/app/styles.css` | Canonical visual, touch-target, responsive, and Scan page styles. |
| `apps/web/test/qr-interactions.test.tsx` | Existing fragment, fallback, login-return, and result UI coverage. |
| `apps/web/test/qr-ui.test.tsx` | Existing QR token/fallback parsing and presentational coverage. |
| `apps/api/test/qr-label.test.ts` | Existing `jsqr` use proving printed labels encode the intended URL. |
| `tests/browser/start-api.ts` | Seeds a real active label and Machine for deterministic browser acceptance. |
| `tests/browser/foundation.spec.ts` | Existing authenticated Scan/fallback journey and shared accessibility helpers. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/web/package.json` | Add `jsqr` as an explicit runtime dependency of the web workspace. |
| `package-lock.json` | Record the web workspace dependency without changing the installed version unnecessarily. |
| `apps/web/src/lib/qr-client.ts` | Add one reusable parser for a decoded printed QR URL that reuses `tokenFromFragment` and accepts only same-origin `/scan` payloads. |
| `apps/web/src/app/(protected)/scan/qr-camera-scanner.tsx` (new) | Own explicit camera permission, stream/track lifecycle, bounded frame sampling, local decoding, preview, and camera-specific status UI. |
| `apps/web/src/app/(protected)/scan/scan-view.tsx` | Compose the scanner with the existing resolver/result state; stop scanning before token resolution; preserve fragment and fallback behavior. |
| `apps/web/src/app/(protected)/machines/[machineId]/machine-qr-panel.tsx` | Open the protected printable label in an in-app preview instead of triggering an automatic download. |
| `apps/web/src/app/styles.css` | Add only the preview/frame/status/responsive rules not covered by existing panel, button, and Scan styles. |
| `apps/web/test/qr-client.test.ts` or `qr-ui.test.tsx` | Cover decoded-value validation for correct origin/path/token and rejection of unrelated/malformed QR data. |
| `apps/web/test/qr-interactions.test.tsx` | Cover camera success handoff, invalid content, permission/unavailable states, retry, and unchanged fragment/fallback behavior. |
| `apps/web/test/qr-camera-scanner.test.tsx` (new if clearer) | Cover media constraints, bounded decode loop, track cleanup, page visibility, unmount, and duplicate-result fencing with mocked browser media/canvas APIs. |
| `tests/browser/scan-camera.spec.ts` (new) | Exercise a deterministic synthetic camera frame containing the real seeded label's signed URL through the real web client and API at desktop/tablet sizes. |

## Files to Reference Only

| File | Why |
|---|---|
| `specs/SF-07.md` | Canonical QR privacy, authorization, payload, resolution, and UI decisions. |
| `packages/contracts/src/inventory.ts` | Existing token/request/response schemas; no contract expansion is needed. |
| `apps/api/src/modules/inventory/qr/qr-label.signer.ts` | Test-only signed-token construction reference; never move signing to the browser. |
| `apps/api/src/modules/inventory/qr/qr-label.renderer.ts` | Printed URL format and QR encoding remain unchanged. |
| `apps/api/src/modules/inventory/qr/qr-label.controller.ts` | Existing protected resolution endpoint remains unchanged. |
| `apps/web/src/app/(protected)/loads/[loadId]/intake/[batchId]/review-view.tsx` | Reference the existing environment-camera intent wording only; file capture is not a live scanner abstraction. |
| `playwright.config.ts` | Existing desktop/tablet projects and disposable full-boundary harness. |

## Files Not to Touch

- `apps/api/src/modules/inventory/qr/**` — the signed QR, resolver, authorization, and lifecycle are already correct.
- `packages/contracts/**` and `packages/database/**` — no API or persistence change is required.
- `apps/web/src/app/sw.js/**` and PWA cache policy — camera frames and QR responses must never be cached or queued.
- Inventory, Intake, Production, Catalog, Files, and Operations domain behavior — scanning is a read-only web input method.
- `.codex-build/**`, `source-materials/**`, `Deliverables/**`, and artifact-generation tools.

## Codegraph Findings (live, this ticket)

- `ScanView` is called only by the protected Scan page and is directly covered by `qr-interactions.test.tsx` and `qr-ui.test.tsx`; its resolver calls `resolveQrLabel` and already owns success/error/login handling.
- `tokenFromFragment` has four current callers and is the canonical syntax parser; decoded camera content should adapt into it instead of introducing another token regex.
- `resolveQrLabel` is the sole web client caller of `POST /inventory/qr-labels/resolve`; no second request path is justified.
- `useOnlineStatus` is shared across protected views and already gates Scan lookup.
- No web `getUserMedia`, `MediaStream`, video-preview, frame decoder, `BarcodeDetector`, or QR camera abstraction exists.
- `jsqr@1.4.0` is already installed for API QR-renderer verification, but only the API workspace declares it. The web must declare its runtime use explicitly.
- Changing `ScanView` directly affects only its page and focused QR UI tests; the existing protected navigation and API boundaries remain outside the implementation blast radius.

## Reuse Audit

Reused:

- Existing signed printed URL, `tokenFromFragment`, `resolveQrLabel`, authenticated resolver, Machine result card, login-return flow, fallback lookup, online state, shared styles, seeded browser Machine/label, and QR decoder package/version.

New code justified because:

- The web application has no live camera lifecycle or frame-decoding boundary. A small scanner component is necessary to isolate resource cleanup and keep `ScanView` focused on resolution/results.

Do not duplicate:

- Token syntax, HMAC verification, label activity, Machine lookup, authorization, API error mapping, result rendering, online detection, or QR generation.

Escalated to human:

- None. Explicit user-started rear-camera scanning with fallback preservation is the conservative scope; camera-selection and batch-scan features remain non-goals.

## Implementation Plan

1. Promote the already-installed `jsqr` version to the web runtime workspace and add a decoded-value parser that accepts only the platform's same-origin `/scan#token` URL.
2. Implement a client-only scanner component that requests `{ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } }`, uses `playsInline`, and starts only from an explicit user action.
3. Sample frames no more than ten times per second, downscale the longest frame edge to at most 1280 pixels, decode locally, and continue scanning after unrelated or malformed QR content.
4. Fence the first valid result, stop all tracks and animation work, clear the video source, then pass the token into `ScanView`'s existing resolver.
5. Stop and clean up on Stop, permission/media/decode error, page hidden, unmount, and successful capture; surface actionable camera states without exposing raw browser errors.
6. Extend unit/component tests for parsing, constraints, lifecycle cleanup, errors, accessibility state, and existing fragment/fallback regression.
7. Add a deterministic Playwright journey that supplies a synthetic camera frame encoding the real seeded signed label, then verifies the exact Machine summary through the real protected API at configured desktop/tablet projects.
8. Run the focused QR tests and all workspace gates.

## Constraints

- Preserve all existing API and database contracts.
- Camera permission requires a deliberate button press. Never request it while rendering or hydrating the route.
- Camera frames and decoded raw values stay memory-only. Never log them, send frames to the server, persist them, add them to analytics, or include them in error text.
- Validate decoded text locally before any request. Only a same-origin `/scan` URL with a valid token fragment may call `resolveQrLabel`.
- A decoded token remains a lookup reference, not authorization; do not move signature verification or Machine lookup into the browser.
- Stop every track, cancel scheduled work, clear `srcObject`, and prevent late decode promises/results from mutating unmounted or restarted scanner state.
- Do not run more than one camera stream or resolution request at a time.
- Prefer the rear camera but allow browser fallback when the exact environment-facing constraint is unavailable.
- If camera APIs, permission, or hardware are unavailable, retain a fully functional fallback-code form.
- The preview must have accessible instructions/status, visible Start/Stop actions, `playsInline`, and no essential information conveyed only by video or color.
- Operational scanning remains online-only and uncached.
- Follow `AGENTS.md`, preserve unrelated dirty-worktree changes, and keep new comments limited to non-obvious lifecycle/race reasoning.

## Tests Required

- `npx vitest run test/qr-client.test.ts test/qr-ui.test.tsx test/qr-interactions.test.tsx test/qr-camera-scanner.test.tsx` from `apps/web` (omit a split file if tests remain coherently grouped).
- `npx vitest run test/qr-label.test.ts` from `apps/api` to prove printed payload compatibility.
- `npx vitest run --no-file-parallelism --maxWorkers=1 --testTimeout=10000 --hookTimeout=10000 test/qr-label.integration.test.ts` from `apps/api` to preserve real resolution/security.
- `npx playwright test tests/browser/scan-camera.spec.ts` for the real signed-label browser journey across configured projects.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- `git diff --check`

## Done Criteria

- From `/scan`, an authenticated worker can press **Scan QR code**, point the rear camera at an active printed Machine label, and see the correct Machine summary without typing the fallback code.
- The existing external-camera deep link and fallback-code flows still work unchanged.
- Invalid/unrelated QR content makes no API call; forged, revoked, or unknown signed labels still receive the existing generic failure.
- Camera denial/unavailability never blocks fallback lookup, and camera tracks stop on every success, failure, stop, hide, and unmount path.
- Constraint-limited browsers receive one generic-camera retry; unsupported preview browsers receive a precise external-browser instruction rather than an ambiguous camera-in-use message.
- **View / Print** opens the active individual label in an in-app preview and its explicit print action opens the browser print dialog without first downloading the SVG.
- No frame, snapshot, decoded raw QR, token, fallback code, or Machine data is logged or newly persisted.
- Focused and full unit, integration, browser, accessibility, responsive, typecheck, lint, and build gates pass with no duplicate QR resolution or authorization logic.
