# Contributing to Quorum

Thanks for your interest! Here is how to get started.

## Development

Requires Node 22.12 or newer.

```bash
npm install
npm run build
npm test
```

Also useful: `npm run typecheck`, `npm run sim` (simulation) and `npm run sweep` (parameter comparison).

## Workflow

1. Open an issue, or comment on an existing one, before starting larger changes.
2. Fork, create a branch, and implement the change with tests.
3. Open a pull request against `main`. CI must be green.

## Principles

- `quorum-core` stays free of dependencies on services, and `quorum-mod` must remain optional.
- Back changes to reputation behaviour (weights, reward, penalty) with `npm run sim`.
- Commit messages in the style `feat:`, `fix:`, `docs:`, `ci:`, `chore:`.

## License

By contributing, you agree that your contribution is published under the [MPL-2.0](LICENSE).
