import type { CoreStorage, Reputation, StoredSubmission, Submission, Timestamp, UserId, Vote } from "quorum-core";
import type { ModCase, ModStorage } from "quorum-mod"; // types only: quorum-mod is not needed at runtime
import type { SqlExecutor } from "./executor.js";

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v);
const num = (v: unknown): number => Number(v); // Postgres returns BIGINT as string

/** Mirrors `caseRevision` in quorum-mod (kept local so this package does not import quorum-mod at runtime). */
const revisionOf = (c: ModCase): number => (c.status === "pending" ? 0 : 1 + (c.previous?.length ?? 0));

function submissionFromRow(r: Row): StoredSubmission {
  const base = {
    id: str(r.id),
    authorId: str(r.author_id),
    subjectId: str(r.subject_id),
    ...(r.payload != null && { payload: JSON.parse(str(r.payload)) as unknown }),
    createdAt: num(r.created_at),
    windowEndsAt: num(r.window_ends_at),
    extensions: num(r.extensions),
  };
  const status = str(r.status);
  let submission: Submission;
  if (status === "open") submission = { ...base, status: "open" };
  else if (status === "needs_review") submission = { ...base, status: "needs_review", reason: str(r.review_reason) as never };
  else submission = { ...base, status: "resolved", outcome: JSON.parse(str(r.outcome)) };
  return { submission, authorWeight: num(r.author_weight) };
}

const statusColumns = (s: Submission) => ({
  reason: s.status === "needs_review" ? s.reason : null,
  outcome: s.status === "resolved" ? JSON.stringify(s.outcome) : null,
});

/** One class for both interfaces, so a decision and its reputation changes can share a transaction. */
export class SqlStorage implements CoreStorage, ModStorage {
  constructor(private readonly db: SqlExecutor) {}

  transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new SqlStorage(tx) as this));
  }

  async insertSubmission({ submission: s, authorWeight }: StoredSubmission): Promise<void> {
    const { reason, outcome } = statusColumns(s);
    await this.db.run(
      `INSERT INTO quorum_submissions
        (id, author_id, subject_id, payload, author_weight, created_at, window_ends_at, extensions, status, review_reason, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.authorId, s.subjectId, s.payload === undefined ? null : JSON.stringify(s.payload), authorWeight, s.createdAt, s.windowEndsAt, s.extensions, s.status, reason, outcome],
    );
  }

  async getSubmission(id: string): Promise<StoredSubmission | null> {
    const rows = await this.db.all(`SELECT * FROM quorum_submissions WHERE id = ?`, [id]);
    return rows[0] ? submissionFromRow(rows[0]) : null;
  }

  async updateSubmission(expected: Submission, next: Submission): Promise<boolean> {
    if (expected.id !== next.id) throw new Error("updateSubmission: IDs differ");
    const { reason, outcome } = statusColumns(next);
    const r = await this.db.run(
      `UPDATE quorum_submissions
          SET window_ends_at = ?, extensions = ?, status = ?, review_reason = ?, outcome = ?
        WHERE id = ? AND status = ? AND extensions = ? AND window_ends_at = ?`,
      [next.windowEndsAt, next.extensions, next.status, reason, outcome, expected.id, expected.status, expected.extensions, expected.windowEndsAt],
    );
    return r.changes === 1;
  }

  async listDueSubmissions(now: Timestamp, limit: number): Promise<StoredSubmission[]> {
    const rows = await this.db.all(
      `SELECT * FROM quorum_submissions WHERE status = 'open' AND window_ends_at <= ? ORDER BY window_ends_at, id LIMIT ?`,
      [now, limit],
    );
    return rows.map(submissionFromRow);
  }

  async insertVote(v: Vote): Promise<boolean> {
    const r = await this.db.run(
      `INSERT INTO quorum_votes (submission_id, voter_id, choice, weight, cast_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (submission_id, voter_id) DO NOTHING`,
      [v.submissionId, v.voterId, v.choice, v.weight, v.castAt],
    );
    return r.changes === 1;
  }

  async listVotes(submissionId: string): Promise<Vote[]> {
    const rows = await this.db.all(`SELECT * FROM quorum_votes WHERE submission_id = ? ORDER BY cast_at, voter_id`, [submissionId]);
    return rows.map((r) => ({ submissionId: str(r.submission_id), voterId: str(r.voter_id), choice: str(r.choice) as Vote["choice"], weight: num(r.weight), castAt: num(r.cast_at) }));
  }

  async hasVoted(userId: UserId, submissionId: string): Promise<boolean> {
    return (await this.db.all(`SELECT 1 AS x FROM quorum_votes WHERE voter_id = ? AND submission_id = ? LIMIT 1`, [userId, submissionId])).length > 0;
  }

  async getReputation(userId: UserId): Promise<Reputation | null> {
    const rows = await this.db.all(`SELECT * FROM quorum_reputation WHERE user_id = ?`, [userId]);
    const r = rows[0];
    return r ? { userId: str(r.user_id), value: num(r.value), updatedAt: num(r.updated_at) } : null;
  }

  async addReputation(userId: UserId, delta: number, startValue: number, now: Timestamp): Promise<void> {
    await this.db.run(
      `INSERT INTO quorum_reputation (user_id, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET value = quorum_reputation.value + ?, updated_at = ?`,
      [userId, startValue + delta, now, delta, now],
    );
  }

  // --- quorum-mod ---

  async insertCase(c: ModCase): Promise<boolean> {
    const r = await this.db.run(
      `INSERT INTO quorum_mod_cases (id, status, mode, author_id, requested_at, revision, data) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [c.id, c.status, c.request.mode, c.request.authorId, c.request.requestedAt, revisionOf(c), JSON.stringify(c)],
    );
    return r.changes === 1;
  }

  async getCase(id: string): Promise<ModCase | null> {
    const rows = await this.db.all(`SELECT data FROM quorum_mod_cases WHERE id = ?`, [id]);
    return rows[0] ? (JSON.parse(str(rows[0].data)) as ModCase) : null;
  }

  async updateCase(expected: ModCase, next: ModCase): Promise<boolean> {
    const r = await this.db.run(
      `UPDATE quorum_mod_cases SET status = ?, revision = ?, data = ? WHERE id = ? AND revision = ?`,
      [next.status, revisionOf(next), JSON.stringify(next), expected.id, revisionOf(expected)],
    );
    return r.changes === 1;
  }

  async listCases(filter: { status?: ModCase["status"] } = {}): Promise<ModCase[]> {
    const rows = filter.status
      ? await this.db.all(`SELECT data FROM quorum_mod_cases WHERE status = ? ORDER BY requested_at, id`, [filter.status])
      : await this.db.all(`SELECT data FROM quorum_mod_cases ORDER BY requested_at, id`);
    return rows.map((r) => JSON.parse(str(r.data)) as ModCase);
  }
}
