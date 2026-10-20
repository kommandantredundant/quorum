import type { Reputation, Submission, SubmissionId, Timestamp, UserId, Vote } from "./types.js";

/** A submission plus the author's start weight, frozen when it was submitted. */
export interface StoredSubmission {
  submission: Submission;
  authorWeight: number;
}

/**
 * What quorum-core needs from a database. The host (or a reference adapter) implements it
 * on top of its own storage; the core itself never touches I/O.
 *
 * Contract notes for implementers:
 * - `transaction` runs `fn` atomically with a transaction-bound storage; nested calls join it.
 * - `updateSubmission` is a conditional write: it only succeeds if the stored row still
 *   matches `expected` (status, extensions, window end). That is how concurrent servers
 *   avoid booking the same decision twice.
 * - `insertVote` returns false (and writes nothing) if the voter already voted on it.
 * - `addReputation` is an atomic increment, creating the record with `startValue + delta`.
 */
export interface CoreStorage {
  transaction<T>(fn: (tx: this) => Promise<T>): Promise<T>;

  insertSubmission(s: StoredSubmission): Promise<void>;
  getSubmission(id: SubmissionId): Promise<StoredSubmission | null>;
  updateSubmission(expected: Submission, next: Submission): Promise<boolean>;
  /** Open submissions whose window has ended, oldest first. */
  listDueSubmissions(now: Timestamp, limit: number): Promise<StoredSubmission[]>;

  insertVote(vote: Vote): Promise<boolean>;
  listVotes(submissionId: SubmissionId): Promise<Vote[]>;
  hasVoted(userId: UserId, submissionId: SubmissionId): Promise<boolean>;

  getReputation(userId: UserId): Promise<Reputation | null>;
  addReputation(userId: UserId, delta: number, startValue: number, now: Timestamp): Promise<void>;
}
