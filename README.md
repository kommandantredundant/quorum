# quorum

Embeddable, service-free building block for reputation-weighted community voting
(e.g. rating points of interest). Runs inside the host website's own backend and
database. No central service.

## Packages

| Package | Purpose | Required |
| --- | --- | --- |
| `quorum-core` | Weights, evaluation, reputation updates, lifecycle. Pure logic, no I/O. | yes |
| `quorum-mod` | Moderation queue and decisions. | optional |

Dependency direction: `quorum-mod -> quorum-core`. The core never depends on `mod`,
so the core runs fully without it.

## Development

```sh
npm install
npm run build   # tsc -b across all packages
npm test        # vitest, resolves workspace packages from source
```

All tunable parameters live in `packages/core/src/config.ts`. Defaults are
provisional and meant to be tuned via simulation.
