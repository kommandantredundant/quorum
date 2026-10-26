# Changelog

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
