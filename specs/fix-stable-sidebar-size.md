# fix-stable-sidebar-size — Keep the protected sidebar viewport-sized

## Goal

Keep the persistent protected navigation sidebar visually stable while staff move
between Home, Loads, Machines, and other routes. Page content length must not
change the sidebar's rendered width or height.

## Ticket Summary

- Preserve the existing 16rem desktop/tablet-landscape sidebar width.
- Stop the sidebar grid item from stretching to the height of the current page.
- Keep the sidebar at least one viewport tall on routes whose content is shorter
  than the viewport.
- Preserve the existing compact header and Menu navigation at widths of 900px
  and below.
- Add browser regression coverage across routes with materially different content
  heights.

## Expected Output

- At widths above 900px, Home, Loads, and Machines render the same 256px-wide,
  viewport-height sidebar.
- Moving between those routes does not resize the dark sidebar.
- At portrait-tablet and phone widths, the sidebar remains hidden and the existing
  accessible Menu remains available.

## Non-Goals

- Do not redesign navigation, change the 900px breakpoint, or change page content.
- Do not change permissions, navigation destinations, API behavior, PWA caching,
  or signed-in identity controls.
- Do not refactor the duplicated legacy/new CSS sections in this focused fix.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/web/src/app/styles.css` / `.app-shell`, `.app-sidebar` | Canonical responsive-shell styling and the source of grid-item stretching. |
| `apps/web/src/app/(protected)/layout.tsx` / `ProtectedLayout` | One shared sidebar wraps every protected route. |
| `tests/browser/foundation.spec.ts` / shell journey | Existing full-boundary coverage for responsive navigation, touch targets, and overflow. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/web/src/app/styles.css` | Prevent `.app-sidebar` from stretching in the grid row while preserving its existing `min-height: 100vh`, sticky position, and fixed 16rem grid track. |
| `tests/browser/foundation.spec.ts` | Assert the visible sidebar keeps viewport height and the same width across Home, Loads, and Machines at a width above the mobile breakpoint. |

## Files to Reference Only

| File | Why |
|---|---|
| `ARCHITECTURE.md` Reuse Map | Makes `styles.css` the canonical web visual system and responsive-shell owner. |
| `apps/web/src/app/(protected)/active-navigation.tsx` | Confirms route changes reuse one navigation component and need no behavioral change. |
| `apps/web/src/app/(protected)/loads/page.tsx` | Representative medium-height route. |
| `apps/web/src/app/(protected)/machines/page.tsx` | Representative long route. |

## Files Not to Touch

- `apps/api/**` and `packages/**` — no backend or contract change.
- Protected route components — content length is valid and should not compensate
  for a shell layout bug.
- `source-materials/**` — unrelated immutable inputs.

## Codegraph Findings (live, this ticket)

- `ProtectedLayout` is the single authenticated shell for Home, Loads, and
  Machines; there are no route-specific sidebar copies.
- `.app-shell` uses `grid-template-columns: 16rem minmax(0, 1fr)`, so measured
  sidebar width is already stable at 256px.
- `.app-sidebar` has `min-height: 100vh` but retains the grid default
  `align-self: stretch`, causing its actual height to match the page's grid row.
- At 1024x768, measured sidebar heights are 864px on Home, 1,237px on Loads,
  and 3,715px on Machines while the width remains 256px.
- Applying `align-self: start` makes all three routes render a 768px-tall sidebar
  without changing the existing responsive breakpoint.

## Reuse Audit

Reused:

- The one protected shell, canonical global visual system, existing breakpoint,
  existing permission-derived navigation, and existing browser-test harness.

New code justified because:

- One CSS alignment declaration fixes the missing shell constraint.
- One focused browser assertion protects the cross-route visual invariant.

Do not duplicate:

- Sidebar markup, route-aware navigation, viewport breakpoints, or permission
  decisions.

Escalated to human:

- None. Runtime measurement identifies the grid stretch as the concrete cause.

## Implementation Plan

1. Opt the persistent sidebar out of grid cross-axis stretching in the canonical
   shell CSS.
2. Extend the existing browser shell coverage to measure the sidebar on Home,
   Loads, and Machines at 1024x768.
3. Run focused web tests and the relevant browser journey, then lint and typecheck.

## Constraints

- Preserve unrelated dirty-worktree changes.
- Keep the fix in the shared shell rather than route-local styles.
- Do not weaken accessibility, keyboard focus, minimum touch sizes, or mobile Menu
  behavior.
- Follow `AGENTS.md` and the existing plain-CSS conventions.

## Tests Required

- `npm run lint`
- `npm run typecheck`
- `npm test -w @simply-clean/web`
- Focused Playwright execution for the updated foundation shell journey at desktop
  and tablet projects.

## Done Criteria

- The sidebar remains 256px wide and one viewport tall across Home, Loads, and
  Machines at 1024x768.
- Route content can extend below the viewport without stretching the sidebar.
- At 900px and below, existing compact Menu navigation behavior remains intact.
- Focused tests, lint, and typecheck pass with no unrelated changes introduced.
