# Changelog

## 0.2.0

### Neu
- Komponente `<quorum-profile>`: zeigt angemeldeten Mitgliedern ihr eigenes Vertrauen als eine von fünf Stufen (nie als rohe Zahl), eine kurze Erklärung und ihre letzten Stimmen und Vorschläge mit dem Hinweis, ob sie zur endgültigen Entscheidung passten
- Kern: `getProfile(ctx, { limit })` liefert ausschließlich die eigenen Daten des angemeldeten Mitglieds
- Storage: optionale Methoden `listVotesByVoter` und `listSubmissionsByAuthor`, in den SQL-Adaptern für SQLite und Postgres umgesetzt
- HTTP: neue Route `GET /me` (401, wenn niemand angemeldet ist)
- Doku: neue Seite `docs/end-users.md` mit fertigen Erklärtexten für Endnutzer (Deutsch und Englisch)

### Geändert
- Migration legt zwei zusätzliche Indizes an (`quorum_submissions_author`, `quorum_votes_voter_time`); `migrateSqlite`/`migratePostgres` beim nächsten Start ergänzen sie automatisch
- Interne Abhängigkeiten der Pakete auf `^0.2.0` angehoben
- Doku: Node-Anforderungen und Versionsangaben korrigiert, Hinweis auf `processDue()` in Getting Started
- Entwicklungs-Abhängigkeiten: Vitest 5.1, Vite 8.3.7, PGlite 0.5.16

### Upgrade
- Keine inkompatiblen Änderungen. Alle Pakete gemeinsam auf 0.2.0 heben.
- Eigene Storage-Implementierungen funktionieren weiter; ohne die zwei neuen Methoden zeigt `<quorum-profile>` nur die Vertrauensstufe.
- Wer eigene Migrationen fährt: die zwei neuen Indizes aus `schemaSql()` übernehmen.

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
