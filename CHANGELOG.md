# Changelog

## Unreleased

- New component `<quorum-profile>`: a member's own trust level (five steps, never the raw number), a short explanation and recent votes and suggestions with whether they matched the final decision
- Core: `getProfile(ctx, { limit })`; optional storage methods `listVotesByVoter` and `listSubmissionsByAuthor` (implemented in the SQL adapters, with two new indexes created by the migration)
- HTTP: new route `GET /me`
- Docs: new page `docs/end-users.md` with ready-to-paste explanations for end users (English and German)
- Docs: Node requirements and version numbers updated, warning about `processDue()` in getting started

## 0.1.1

- CI auf Node 22 (Build, Typecheck, Bundle, Tests bei Push und PR)
- Entwicklungs-Abhängigkeiten aktualisiert: Vitest 5 (mit Vite 8), TypeScript 7, PGlite 0.5.11
- `tsconfig.base.json`: `types: ["node"]` ausdrücklich gesetzt (TypeScript 7 bindet `@types/*` nicht mehr automatisch ein)
- GitHub Actions auf v7 angehoben
- Entwicklung erfordert jetzt Node >= 22.12 (Tests nutzen `node:sqlite`, Vitest 5 braucht es)
- Neu im Repo: SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, Issue- und PR-Templates, Dependabot
- Keine Änderungen an der Funktionalität der Pakete

## 0.1.0

Erste Veröffentlichung der Pakete `quorum-core`, `quorum-mod`, `quorum-adapters`, `quorum-http` und `quorum-ui`.
