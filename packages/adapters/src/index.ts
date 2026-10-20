import { coreSchema, modSchema } from "./schema.js";
import { postgresExecutor, sqliteExecutor, type PgPoolLike, type SqlExecutor, type SqliteDatabaseLike } from "./executor.js";
import { SqlStorage } from "./sql-storage.js";

export * from "./schema.js";
export * from "./executor.js";
export * from "./sql-storage.js";

/** Storage on SQLite: pass a `node:sqlite` DatabaseSync or a better-sqlite3 Database. */
export const createSqliteStorage = (db: SqliteDatabaseLike): SqlStorage => new SqlStorage(sqliteExecutor(db));

/** Storage on Postgres: pass a `pg` Pool (or anything with query/connect). */
export const createPostgresStorage = (pool: PgPoolLike): SqlStorage => new SqlStorage(postgresExecutor(pool));

/** Create the tables if missing. Pass `moderation: true` only if quorum-mod is used. */
export async function migrate(db: SqlExecutor, options: { moderation?: boolean } = {}): Promise<void> {
  for (const statement of [...coreSchema, ...(options.moderation ? modSchema : [])]) await db.run(statement);
}

export const migrateSqlite = (db: SqliteDatabaseLike, options?: { moderation?: boolean }): Promise<void> => migrate(sqliteExecutor(db), options);
export const migratePostgres = (pool: PgPoolLike, options?: { moderation?: boolean }): Promise<void> => migrate(postgresExecutor(pool), options);
