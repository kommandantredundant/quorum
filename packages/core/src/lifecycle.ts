import type { QuorumConfig } from "./config.js";
import { evaluate, type Evaluation } from "./evaluate.js";
import type {
  OpenSubmission,
  Outcome,
  ResolvedSubmission,
  ReviewSubmission,
  Submission,
  SubjectId,
  Timestamp,
  UserId,
  Vote,
} from "./types.js";

/**
 * Submission lifecycle: window, minimum voters, extensions, hand-off to review.
 * Pure: takes the clock as `now`, returns the next state, never touches storage.
 * The host calls `advance` lazily (on access) or from a cron job.
 */

type LifecycleConfig = Pick<QuorumConfig, "voting" | "bands" | "weightConflict">;

const HOUR_MS = 3_600_000;

export interface NewSubmission {
  id: string;
  authorId: UserId;
  subjectId: SubjectId;
  payload?: unknown;
}

/** A fresh submission with its voting window starting at `now`. */
export function openSubmission(input: NewSubmission, now: Timestamp, config: Pick<QuorumConfig, "voting">): OpenSubmission {
  const s: OpenSubmission = {
    id: input.id,
    authorId: input.authorId,
    subjectId: input.subjectId,
    createdAt: now,
    windowEndsAt: now + config.voting.windowHours * HOUR_MS,
    extensions: 0,
    status: "open",
  };
  if (input.payload !== undefined) s.payload = input.payload;
  return s;
}

/** Votes are accepted only while the submission is open and the window has not ended. */
export function canVote(submission: Submission, now: Timestamp): boolean {
  return submission.status === "open" && now < submission.windowEndsAt;
}

export type Transition =
  /** Submission is not open (already in review or resolved): nothing to do. */
  | { kind: "none"; submission: Submission }
  /** Window still running. Voting continues until it ends, even for popular items. */
  | { kind: "pending"; submission: OpenSubmission }
  /** Too few voters: window extended. */
  | { kind: "extended"; submission: OpenSubmission; evaluation: Evaluation }
  /** Needs a moderator (grey zone, weight conflict, or extension limit reached). */
  | { kind: "review"; submission: ReviewSubmission; evaluation: Evaluation }
  /** Decided by weight. The caller applies `settleDeltas` and may sample (see `evaluation.band`). */
  | { kind: "resolved"; submission: ResolvedSubmission; evaluation: Extract<Evaluation, { kind: "decided" }> };

/**
 * Move a submission forward if its window has ended.
 *
 * - Window running -> `pending`.
 * - Too few voters -> extend by `extensionHours`, up to `maxExtensions`; after
 *   that -> review with reason `extension_limit`.
 * - Extension starts at `max(windowEndsAt, now)`, so late (lazy) processing never
 *   hands out an already-expired window.
 * - Otherwise review or resolved according to `evaluate`.
 */
export function advance(
  submission: Submission,
  votes: readonly Pick<Vote, "voterId" | "choice" | "weight">[],
  authorWeight: number,
  now: Timestamp,
  config: LifecycleConfig,
): Transition {
  if (submission.status !== "open") return { kind: "none", submission };
  if (now < submission.windowEndsAt) return { kind: "pending", submission };

  const evaluation = evaluate({ votes, authorWeight }, config);
  const { status: _status, ...base } = submission;

  if (evaluation.kind === "insufficient") {
    if (submission.extensions < config.voting.maxExtensions) {
      const extended: OpenSubmission = {
        ...base,
        status: "open",
        extensions: submission.extensions + 1,
        windowEndsAt: Math.max(submission.windowEndsAt, now) + config.voting.extensionHours * HOUR_MS,
      };
      return { kind: "extended", submission: extended, evaluation };
    }
    return { kind: "review", submission: { ...base, status: "needs_review", reason: "extension_limit" }, evaluation };
  }

  if (evaluation.kind === "review") {
    return { kind: "review", submission: { ...base, status: "needs_review", reason: evaluation.reason }, evaluation };
  }

  const outcome: Outcome = {
    verdict: evaluation.verdict,
    decidedBy: "weight",
    approvalRatio: evaluation.approvalRatio,
    totalWeight: evaluation.totalWeight,
    resolvedAt: now,
  };
  return { kind: "resolved", submission: { ...base, status: "resolved", outcome }, evaluation };
}
