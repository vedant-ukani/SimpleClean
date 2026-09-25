# Review — In-app Machine QR camera scanner

## Outcome

Accepted. The implementation matches the reviewed specification: an authenticated worker can deliberately start the device camera from `/scan`, decode an active printed Machine label locally, and retrieve the same authorized Machine summary as the existing external-scan and fallback-code paths.

## Findings

Accepted after UI follow-up fixes. An independent read-only review found no divergence from the original specification.

- The first camera error grouped unsupported browsers, missing hardware, incompatible constraints, and occupied cameras under one ambiguous message. These states now have distinct safe guidance, and only a constraint-incompatibility result receives one generic-video retry.
- The individual Machine **Download / Print** action forced an SVG download. It is now **View / Print** and opens the protected SVG in an in-app preview with explicit **Print label** and **Close** actions; no download starts.

## Specification and architecture review

- Camera permission is requested only after **Scan QR code**. The environment-facing camera is preferred and the existing fallback-code form remains available.
- Frames are sampled at no more than ten per second, downscaled to a 1280-pixel longest edge, decoded locally, and never uploaded, persisted, logged, or cached.
- Only an absolute same-origin `/scan#<valid signed-token syntax>` value reaches the existing `resolveQrLabel` client. Signature, active-label, session, permission, and Machine checks remain server-owned.
- Every camera track is released after a valid capture, explicit Stop, page hiding, unmount, media/decode failure, offline transition, and late stream delivery.
- Camera failures distinguish an unsupported/insecure browser, permission denial, absent camera, and busy/unreadable camera without exposing raw browser errors. Embedded browsers without camera APIs direct the worker to the same localhost/HTTPS page in Chrome or Safari.
- Individual printable labels remain protected, display in a memory-only iframe preview, print only that preview after an explicit action, and revoke object URLs on close, replacement, or unmount.
- The existing fragment/login-return flow, fallback lookup, Machine result card, service-worker cache policy, API contracts, and database schema are unchanged.

## Reuse and slop audit

- Reused the canonical token parser, authenticated QR resolver, online-state hook, Machine result UI, fallback path, shared visual system, existing QR decoder version, and seeded browser Machine/label.
- Added one justified web camera lifecycle component and one decoded printed-URL adapter. No duplicate authorization, signature, Machine lookup, QR generation, or API path was introduced.

## Verification

Independent final verification passed focused QR unit and integration coverage; workspace lint and typecheck; 278 unit tests; 75 API/database integration tests with 1 intentional PostgreSQL-only skip; production build; and 34 Playwright journeys with 2 intentional skips across desktop, tablet portrait, and tablet landscape. The browser coverage decodes the real seeded printable QR through a synthetic camera stream, resolves it through the protected API, checks the exact Machine result and track cleanup, then opens and explicitly prints the individual protected SVG preview without a download. It also checks serious/critical accessibility violations and horizontal overflow.
