# professional-ui-redesign — Professional operational application redesign

## Goal

Replace the current foundation-style presentation with a cohesive, professional Simple Clean operations interface. The redesign should feel like a calm industrial control workspace: clear hierarchy, compact decision-oriented navigation, strong responsive behavior, and polished forms/data surfaces without changing domain behavior or migrating the application to a new CSS framework.

## Ticket Summary

- Redesign the global visual system, authenticated shell, navigation, home dashboard, login experience, loading/error states, and shared page surfaces.
- Use a dark graphite/evergreen sidebar, neutral canvas, white work surfaces, restrained emerald accent, semantic status colors, consistent spacing/radii, and flatter shadows.
- Add a maintained React icon library for functional navigation/action icons; icons are `aria-hidden` when visible text provides the label.
- Keep the UI responsive from 320px shared tablets/phones through desktop. Desktop uses a persistent sidebar; narrow layouts use an accessible toggle/drawer and compact top bar.
- Preserve all existing workflows, server/client boundaries, permissions, safe error mapping, reconnect behavior, and validation.
- Use researched repositories as design references only. Do not copy AGPL code, wholesale templates, business logic, or incompatible component systems.

## Expected Output

- A visibly new application shell with a professional sidebar, branded workspace identity, clear current-page state, user/role area, and safe sign-out control.
- A decision-oriented dashboard that emphasizes the remaining core tasks for each role and presents not-yet-enabled assignments as a restrained status note rather than a prototype card.
- A polished split-layout staff sign-in experience that remains clear on small screens.
- Consistent cards, panels, forms, lists, detail grids, statuses, tables, buttons, empty states, and loading/error surfaces across existing pages.
- On Load detail, the next operational action is visually prioritized ahead of attachment maintenance and editing; the attachment chooser remains readable at tablet widths.
- No horizontal overflow at 320px, no serious/critical automated accessibility violations, visible keyboard focus, reduced-motion support, and touch targets at least 44px tall.

## Current-Experience Audit Findings

- Desktop navigation currently exposes nine destinations in a wrapping horizontal row and the dashboard repeats six of them. The reduced route set and new sidebar must eliminate this duplication and make core work easier to scan.
- Load detail currently presents read-only facts, attachments, Intake, and editing as one undifferentiated vertical stack. Treat Intake as the primary next action, attachments as evidence management, and editing as secondary maintenance without changing permissions or behavior.
- At tablet width, the native file chooser truncates and attachment actions create unnecessary vertical weight. Use responsive form sizing and the native `::file-selector-button` styling rather than replacing the accessible file input.
- Large display titles wrap awkwardly on operational records. Use a bounded, fluid heading scale with safe wrapping.
- The skip link must remain off-canvas until keyboard focused and must not persist over working content after activation.
- Do not fill current dashboard whitespace with invented counts or activity. Create stronger hierarchy using only truthful role destinations and the existing not-yet-enabled assignment state.

## Design References and Adopted Principles

| Reference | Adopted principle |
|---|---|
| `github.com/twentyhq/twenty` | Professional operational hierarchy, quiet chrome, clear record/task surfaces, and disciplined reusable design tokens. Its `SKILLS.md` also demonstrates routing agent guidance by audience instead of mixing every workflow together. |
| `github.com/shadcn-ui/ui` official dashboard example | Sidebar/inset composition, section-card rhythm, compact header, and data-first content organization. |
| `github.com/midday-ai/midday` | Restrained business-software density, neutral surfaces, and strong separation between navigation chrome and working content. |
| `github.com/mares29/dashboard-design-skill` | Every dashboard element must support a user decision; use semantic color and page-specific purpose rather than decorative analytics. |

The references inform composition only. Keep this repository's Next.js server components, plain CSS system, contracts, clients, and domain language.

## Non-Goals

- Do not add charts, metrics, notifications, command search, dark mode, workflows, or data that the backend does not provide.
- Do not migrate to Tailwind, shadcn/ui, Radix, CSS-in-JS, or a new component framework.
- Do not change API calls, permissions, lifecycle rules, route-state mapping, server-state synchronization, or offline caching.
- Do not reintroduce File Review, Operations, Imports, or standalone Locations.
- Do not copy source code or assets from reference repositories.
- Do not change repository/package branding scopes.

## Relevant Existing Code

| File/Symbol | Why it matters |
|---|---|
| `apps/web/src/app/styles.css` | Canonical global tokens and shared visual patterns for every web route. |
| `apps/web/src/app/(protected)/layout.tsx` | Authenticated shell, brand, account context, sign-out, and main-content boundary. |
| `apps/web/src/app/(protected)/active-navigation.tsx` | Permission-derived current-path navigation and mobile menu behavior. |
| `apps/web/src/lib/navigation.ts` | Pure role-aware navigation/dashboard model. |
| `apps/web/src/app/(protected)/page.tsx` | Role dashboard and unresolved assignment-workflow status. |
| `apps/web/src/app/login/page.tsx` and `login-form.tsx` | Public staff entry experience and accessible authentication errors. |
| `apps/web/src/app/(protected)/loads/[loadId]/load-detail-view.tsx` | Representative long operational page whose action priority needs improvement. |
| `apps/web/src/app/(protected)/attachments-panel.tsx` | Shared private-evidence upload/list surface that must remain usable on tablets. |
| `apps/web/src/app/(protected)/online-status.tsx` | Privacy-safe reconnect banner and refresh behavior. |
| `apps/web/src/app/(protected)/loading.tsx`, `error.tsx`, `not-found.tsx` | Shared operational states. |

## Files to Modify

| File | Required change |
|---|---|
| `apps/web/package.json` and `package-lock.json` | Add `lucide-react` (or one equivalently maintained, tree-shakeable icon dependency) and no broader UI framework. |
| `apps/web/src/app/styles.css` | Replace the visual system while preserving class contracts used by current screens; define semantic tokens and responsive/accessibility rules. Remove legacy decorative gradients and oversized foundation typography. |
| `apps/web/src/app/layout.tsx` | Align metadata/theme color with the redesigned shell without weakening PWA behavior. |
| `apps/web/src/app/manifest.ts` | Align manifest theme/background colors with the new visual system. |
| `apps/web/src/app/(protected)/layout.tsx` | Compose the new desktop/mobile shell while preserving identity lookup, redirect, skip link, online state, and main-content focus target. |
| `apps/web/src/app/(protected)/active-navigation.tsx` | Render grouped icon-and-label navigation, active state, and accessible narrow-screen drawer/toggle; keep `isCurrentPath` semantics. |
| `apps/web/src/app/(protected)/page.tsx` | Redesign the role dashboard hierarchy and truthful assignment status; use only destinations from `dashboardForRole`. |
| `apps/web/src/lib/navigation.ts` | Add presentation metadata only when it keeps icon/category decisions canonical; continue deriving visibility from permissions. |
| `apps/web/src/app/login/page.tsx` | Build the responsive split sign-in composition and professional brand/security copy. |
| `apps/web/src/app/login/login-form.tsx` | Add explicit field wrappers/placeholders or supporting markup needed by the visual system without changing auth behavior. |
| `apps/web/src/app/(protected)/logout-button.tsx` | Fit the safe sign-out action into the new account area without weakening its error handling. |
| `apps/web/src/app/(protected)/loads/[loadId]/load-detail-view.tsx` | Give the detail stack explicit semantic classes and move the existing Intake call-to-action ahead of attachment/edit maintenance. Do not change mutation behavior. |
| `apps/web/src/app/(protected)/attachments-panel.tsx` | Add only the structural class hooks needed for a responsive upload row and compact attachment actions. Preserve native file input semantics and private-file behavior. |
| `apps/web/test/identity-ui.test.tsx` | Cover the revised navigation/dashboard metadata and preserve role visibility/current-path checks. |
| `apps/web/test/tablet-shell.test.tsx` | Cover any new shell controls while preserving offline/reconnect assertions. |
| `tests/browser/foundation.spec.ts` | Update shell selectors only as needed and retain landmark, focus, 320px overflow, touch target, reduced motion, and axe assertions. |

## Files to Reference Only

| File | Why |
|---|---|
| `ARCHITECTURE.md` Reuse Map | Establishes the web visual system and permission-derived navigation as canonical decisions. |
| `apps/web/src/lib/server-route-state.ts` | Error/access outcomes must remain unchanged. |
| `apps/web/src/app/(protected)/use-server-state.ts` | Reconnect-safe data synchronization must remain unchanged. |
| `apps/web/src/lib/pwa-cache-policy.ts` | Protected data must remain online-only. |
| Remaining Load, Machine, Scan, Team, Intake, QR, and attachment components | Their class contracts prove the global visual system works across real workflows. |

## Files Not to Touch

- `apps/api/**`, `packages/database/**`, and domain contracts — no backend or lifecycle change.
- `source-materials/**` — immutable evidence.
- Removed workspace routes — do not recreate them as redesigned pages.
- User-owned Intake recognition provider/evaluation work — unrelated scope.

## Codegraph Findings (live, this ticket)

- Root `layout.tsx` imports the single global `styles.css`; shared classes already cover shell, panels, forms, dashboard cards, inventory rows, detail grids, status pills, QR, Scan, Intake, tables, skeletons, and responsive rules.
- `ProtectedLayout` is the only authenticated shell and dynamically renders `ActiveNavigation`.
- `navigationForRole` and `dashboardForRole` are the canonical sources for visible destinations and have unit coverage.
- Existing workflow components rely on semantic class names rather than page-local styles, so a global redesign can transform the application without invasive domain-component rewrites.
- Browser acceptance already checks landmarks, keyboard focus, 320px overflow, minimum touch size, reduced motion, and serious/critical axe findings.

## Reuse Audit

Reused:

- Existing semantic classes, server components, navigation model, identity flow, route-state mapping, online status, and PWA behavior.
- Existing page copy and domain terms where they reflect confirmed workflows.
- Existing status variants and form-state semantics, restyled through the canonical visual system.

New code justified because:

- A shared icon mapping/presentation helper is warranted to keep navigation and dashboard icon choices consistent.
- One icon dependency is warranted because professional, accessible interface icons must not be handcrafted SVGs, emoji, or text symbols.

Do not duplicate:

- Role/permission decisions, current-path logic, error mapping, reconnect behavior, form mutations, status meaning, or data formatting.

Escalated to human:

- None. The requested complete redesign and existing operational context support the documented direction without inventing business data.

## Implementation Plan

1. Add the icon dependency and establish semantic visual tokens for canvas, sidebar, surfaces, text, accent, border, statuses, focus, spacing, radii, and elevation.
2. Recompose the authenticated shell into desktop sidebar plus content inset, with an accessible narrow-screen navigation drawer/toggle.
3. Add consistent functional icons while retaining visible text and `aria-current` behavior.
4. Rework the dashboard into a compact overview and role-specific task grid; restyle the unresolved assignment area as an honest informational state.
5. Rebuild the login composition around the same brand system and preserve authentication/error semantics.
6. Restyle all shared panels, controls, lists, detail grids, tables, statuses, skeletons, empty states, QR/Scan, and Intake surfaces through the global CSS contract.
7. Update focused unit/browser assertions and run the complete quality suite.

## Constraints

- Follow `AGENTS.md` and preserve unrelated dirty-worktree changes.
- Use semantic HTML and visible labels; icon-only controls require accessible names.
- Maintain a visible `:focus-visible` treatment and at least 44px interactive targets.
- Ensure mobile navigation can be opened, closed, and understood from its accessible state.
- Preserve `prefers-reduced-motion` behavior and avoid decorative motion.
- Keep contrast suitable for WCAG AA targets; automated checks do not replace manual visual review.
- Do not add fake metrics, fabricated imagery, decorative emoji, handcrafted SVG icons, or remote runtime assets.

## Tests Required

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`
- `npm run test:browser`
- `npm run build`
- Manual browser inspection at desktop and 320px widths for login, dashboard, Loads, Machines, one detail screen, and navigation open/closed states.

## Done Criteria

- The interface is visibly and consistently redesigned across public, shell, dashboard, list, detail, form, and state surfaces.
- Remaining role navigation and workflows behave exactly as before the redesign.
- The app has no horizontal overflow at 320px and retains usable desktop/tablet density.
- Keyboard focus, landmarks, accessible labels, reduced motion, touch targets, and automated accessibility checks pass.
- No copied template/framework migration, invented business data, duplicate policy, or removed workspace is introduced.
- Required checks and manual visual inspection pass.
