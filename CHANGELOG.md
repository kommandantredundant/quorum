# Changelog

## 0.2.0

### Added
- `<quorum-profile>` component: shows logged-in members their own trust as one of five levels (never as a raw number), a short explanation, and their recent votes and suggestions with whether they matched the final decision
- Core: `getProfile(ctx, { limit })` returns only the logged-in member's own data
- Storage: optional methods `listVotesByVoter` and `listSubmissionsByAuthor`, implemented in the SQL adapters for SQLite and Postgres
- HTTP: new route `GET /me` (401 when not logged in)
- Docs: new page `docs/end-users.md` with ready-to-paste explanations for end users (English and German)

### Changed
- The migration creates two additional indexes (`quorum_submissions_author`, `quorum_votes_voter_time`); `migrateSqlite`/`migratePostgres` add them automatically on the next start
- Internal package dependencies raised to `^0.2.0`
- Docs: Node requirements and version numbers corrected, note on `processDue()` in getting started
- Dev dependencies: Vitest 5.1, Vite 8.3.7, PGlite 0.5.16

### Upgrading
- No breaking changes. Upgrade all packages to 0.2.0 together.
- Custom storage implementations keep working; without the two new methods, `<quorum-profile>` shows the trust level only.
- If you run your own migrations, add the two new indexes from `schemaSql()`.

## 0.1.1

- CI on Node 22 (build, typecheck, bundle, tests on push and pull request)
- Dev dependencies updated: Vitest 5 (with Vite 8), TypeScript 7, PGlite 0.5.11
- `tsconfig.base.json`: `types: ["node"]` set explicitly (TypeScript 7 no longer includes `@types/*` automatically)
- GitHub Actions raised to v7
- Development now requires Node >= 22.12 (tests use `node:sqlite`, Vitest 5 requires it)
- New in the repository: SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, issue and pull request templates, Dependabot
- No functional changes to the packages

## 0.1.0

First release of the packages `quorum-core`, `quorum-mod`, `quorum-adapters`, `quorum-http` and `quorum-ui`.
