/** Minimal async SQL access. `?` placeholders; the Postgres executor rewrites them to $1, $2, ... */
export interface SqlExecutor {
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  all(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Runs `fn` in one transaction (commit on success, rollback on error). Nested calls join. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** Runs one task at a time (a single connection cannot interleave transactions). */
function serialQueue() {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = chain.then(task, task);
    chain = result.catch(() => undefined);
    return result;
  };
}

/** Structural type satisfied by `node:sqlite` DatabaseSync and by better-sqlite3. */
export interface SqliteDatabaseLike {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    all(...params: unknown[]): unknown[];
  };
}

export function sqliteExecutor(db: SqliteDatabaseLike): SqlExecutor {
  const exclusive = serialQueue();
  const direct: SqlExecutor = {
    run: async (sql, params = []) => ({ changes: Number(db.prepare(sql).run(...params).changes) }),
    all: async (sql, params = []) => db.prepare(sql).all(...params) as Record<string, unknown>[],
    transaction: (fn) => fn(direct), // already inside a transaction: join it
  };
  return {
    run: (sql, params) => exclusive(() => direct.run(sql, params)),
    all: (sql, params) => exclusive(() => direct.all(sql, params)),
    transaction: (fn) =>
      exclusive(async () => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(direct);
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }),
  };
}

/** Structural type satisfied by `pg` Pool/Client and by PGlite (with a small wrapper for `connect`). */
export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null; affectedRows?: number }>;
}
export interface PgPoolLike extends PgQueryable {
  connect(): Promise<PgQueryable & { release(): void }>;
}

const toPgPlaceholders = (sql: string): string => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};

export function postgresExecutor(pool: PgPoolLike): SqlExecutor {
  const on = (q: PgQueryable): Omit<SqlExecutor, "transaction"> => ({
    run: async (sql, params = []) => {
      const r = await q.query(toPgPlaceholders(sql), params);
      return { changes: r.rowCount ?? r.affectedRows ?? 0 };
    },
    all: async (sql, params = []) => (await q.query(toPgPlaceholders(sql), params)).rows,
  });
  return {
    ...on(pool),
    transaction: async (fn) => {
      const client = await pool.connect();
      const inner: SqlExecutor = { ...on(client), transaction: (f) => f(inner) };
      try {
        await client.query("BEGIN");
        const result = await fn(inner);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* connection already broken: nothing more to do */
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
