/**
 * Schema, written to run unchanged on SQLite and Postgres:
 * TEXT, INTEGER, BIGINT (epoch milliseconds) and DOUBLE PRECISION only. JSON is stored as TEXT.
 * Core and moderation tables are separate: a site without quorum-mod never creates the mod table.
 * Statements are idempotent (IF NOT EXISTS), so they are safe to run on every start.
 */

export const coreSchema: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS quorum_submissions (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    payload TEXT,
    author_weight DOUBLE PRECISION NOT NULL,
    created_at BIGINT NOT NULL,
    window_ends_at BIGINT NOT NULL,
    extensions INTEGER NOT NULL,
    status TEXT NOT NULL,
    review_reason TEXT,
    outcome TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS quorum_submissions_due ON quorum_submissions (status, window_ends_at)`,
  `CREATE INDEX IF NOT EXISTS quorum_submissions_subject ON quorum_submissions (subject_id)`,
  `CREATE TABLE IF NOT EXISTS quorum_votes (
    submission_id TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    choice TEXT NOT NULL,
    weight DOUBLE PRECISION NOT NULL,
    cast_at BIGINT NOT NULL,
    PRIMARY KEY (submission_id, voter_id)
  )`,
  `CREATE INDEX IF NOT EXISTS quorum_votes_voter ON quorum_votes (voter_id)`,
  `CREATE TABLE IF NOT EXISTS quorum_reputation (
    user_id TEXT PRIMARY KEY,
    value DOUBLE PRECISION NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
];

export const modSchema: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS quorum_mod_cases (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    mode TEXT NOT NULL,
    author_id TEXT NOT NULL,
    requested_at BIGINT NOT NULL,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS quorum_mod_cases_queue ON quorum_mod_cases (status, mode, requested_at)`,
];

/** The schema as one SQL script, for hosts that run their own migrations. */
export function schemaSql(options: { moderation?: boolean } = {}): string {
  return [...coreSchema, ...(options.moderation ? modSchema : [])].map((s) => `${s};`).join("\n\n");
}
