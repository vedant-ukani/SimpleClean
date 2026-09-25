# ADR 0020 — Laundrorama technical identity migration

## Status

Accepted

## Context

Laundrorama is the used-equipment operation; Simple Clean is William's separate new-equipment business. Earlier application work used Simple Clean in visible surfaces and `@simply-clean/*` in the npm workspace. The naming decision reserved a consistent technical migration rather than piecemeal package changes.

## Decision

Name the used-equipment application Laundrorama throughout its active UI, PWA metadata, individual and batch QR outputs, current documentation, and TypeScript workspace. The root npm package is `laundrorama-core-platform`; local packages use `@laundrorama/*`. Individual equipment label SVG responses use the filename `laundrorama-equipment-<code>.svg`; the current web flow previews and prints the SVG in app.

New public PWA caches use `laundrorama-public-*`. On activation and shared-device cache clearing, remove only this prefix and the known legacy `simply-clean-public-*` prefix. The public-asset allowlist and generic offline fallback behavior remain unchanged.

## Compatibility and boundaries

- Preserve routes, authorization roles, database schema objects, environment-variable keys, secrets, QR token identity, and external persistent identifiers. This naming change does not migrate operational data or alter lifecycle behavior.
- Preserve historical specifications, reviews, source transcripts, source-material provenance, and generated communication artifacts as records of past work. Their old names do not govern current application identity.
- Keep Simple Clean references when they identify the separate new-equipment business.
- The saved project label and `/Users/vedant/Desktop/Simple Clean` directory are outside this repository. Rename them separately through the app or manually after worktrees and uncommitted work are reconciled.

## Consequences

Workspace dependencies and commands resolve under one package scope, current outputs identify Laundrorama, and upgrades clear the former public PWA caches without touching unrelated caches. Future features use the new identity without reviving the old scope.
