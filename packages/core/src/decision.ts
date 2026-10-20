import type { QuorumConfig } from "./config.js";
import { tally } from "./evaluate.js";
import { overrideDeltas, reviseDeltas, settleDeltas, type ReputationDelta } from "./reputation.js";
import type { Outcome, ResolvedSubmission, Submission, Timestamp, Verdict, Vote } from "./types.js";

/**
 * Entry point for review decisions (from quorum-mod, the host, or the default handler).
 * Pure: returns the new submission state and the reputation deltas to persist.
 */

export interface Decision {
  verdict: Verdict;
}

export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionError";
  }
}

export interface ApplyDecisionInput {
  submission: Submission;
  votes: readonly Pick<Vote, "voterId" | "choice" | "weight">[];
  /** Same author start weight that was used when evaluating. Default 0. */
  authorWeight?: number;
  decision: Decision;
  now: Timestamp;
}

/**
 * - `decided`: submission was in review without a verdict; reputation is settled normally.
 * - `overridden`: an audit flipped the weight verdict; deltas are the difference to what
 *   `settleDeltas` already applied, with the voter-only double penalty.
 * - `revised`: a moderator changed an earlier moderator decision; deltas undo the old state
 *   and book the new one (an override reverted this way ends like a confirmed herd verdict).
 * - `confirmed`: the decision agrees with the current verdict; nothing changes.
 */
export type DecisionChange = "decided" | "overridden" | "revised" | "confirmed";

export interface DecisionResult {
  change: DecisionChange;
  submission: ResolvedSubmission;
  deltas: ReputationDelta[];
}

export function applyDecision(input: ApplyDecisionInput, config: Pick<QuorumConfig, "reputation">): DecisionResult {
  const { submission, votes, decision, now } = input;

  if (submission.status === "open") {
    throw new DecisionError("Cannot decide an open submission: its voting window has not been closed yet");
  }

  const settleInput = { authorId: submission.authorId, votes };

  if (submission.status === "needs_review") {
    const { status: _status, reason: _reason, ...base } = submission;
    const t = tally({ votes, authorWeight: input.authorWeight ?? 0 });
    const outcome: Outcome = {
      verdict: decision.verdict,
      decidedBy: "review",
      approvalRatio: t.totalWeight > 0 ? t.approveWeight / t.totalWeight : null,
      totalWeight: t.totalWeight,
      resolvedAt: now,
    };
    return {
      change: "decided",
      submission: { ...base, status: "resolved", outcome },
      deltas: settleDeltas(settleInput, decision.verdict, config),
    };
  }

  // resolved
  const { outcome } = submission;
  if (decision.verdict === outcome.verdict) {
    return { change: "confirmed", submission, deltas: [] };
  }
  if (outcome.decidedBy === "review") {
    const { herdVerdict: _herd, ...rest } = outcome;
    return {
      change: "revised",
      submission: { ...submission, outcome: { ...rest, verdict: decision.verdict, resolvedAt: now } },
      deltas: reviseDeltas(settleInput, outcome, decision.verdict, config),
    };
  }
  return {
    change: "overridden",
    submission: {
      ...submission,
      outcome: { ...outcome, verdict: decision.verdict, decidedBy: "review", herdVerdict: outcome.verdict, resolvedAt: now },
    },
    deltas: overrideDeltas(settleInput, outcome.verdict, config),
  };
}
