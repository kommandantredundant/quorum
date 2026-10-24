# quorum-adapters

Reference SQL storage for `quorum-core` and `quorum-mod`: SQLite and Postgres.

Bring your own driver. The SQLite adapter accepts a `node:sqlite` `DatabaseSync` or a `better-sqlite3` database, the Postgres adapter accepts `pg` or `pglite`. No driver is installed for you.

## Install

```sh
npm install quorum-adapters
```

## Documentation

Part of [quorum](https://github.com/kommandantredundant/quorum), an embeddable, service-free building block for
reputation-weighted community voting. Start with the
[getting started guide](https://github.com/kommandantredundant/quorum/blob/main/docs/getting-started.md); concepts, configuration
and integration are covered in [docs/](https://github.com/kommandantredundant/quorum/tree/main/docs).

## License

[MPL-2.0](./LICENSE). You may use this package in any project, including commercial and
closed-source products. Changes to the files of this package must stay under MPL-2.0.
