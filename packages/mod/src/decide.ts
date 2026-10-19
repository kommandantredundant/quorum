import {
  applyDecision,
  type DecisionResult,
  type QuorumConfig,
  type ReputationDelta,
  type ResolvedSubmission,
  type Submission,
  type Timestamp,
  type UserId,
  type Verdict,
  type Vote,
} from "quorum-core";
import { defaultModConfig, type ModConfig } from "./config.js";
import { isEligible } from "./eligibility.js";
import type { ModHooks } from "./hooks.js";
import type { DecidedCase, ModCase } from "./types.js";

export class ModerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModerationError";
  }
}

export interface DecideCaseInput {
  case: ModCase;
  moderatorId: UserId;
  verdict: Verdict;
  /** Current state of the submission the case is about. */
  submission: Submission;
  votes: readonly Pick<Vote, "voterId" | "choice" | "weight">[];
  /** Same author start weight that was used when the vote was evaluated. */
  authorWeight?: number;
  now: Timestamp;
}

export interface DecideCaseResult {
  /** Persist: the closed case, the resolved submission, and the reputation deltas. */
  case: DecidedCase;
  submission: ResolvedSubmission;
  deltas: ReputationDelta[];
  change: DecisionResult["change"];
}

/**
 * A moderator decides a case. Checks the role through the host hook, then hands
 * the verdict to quorum-core's `applyDecision`, so all reputation maths (including
 * the voter-only double penalty on overrides) stays in the core.
 */
export async function decideCase(
  input: DecideCaseInput,
  deps: { hooks: ModHooks; config: Pick<QuorumConfig, "reputation">; mod?: ModConfig },
): Promise<DecideCaseResult> {
  const { case: c, moderatorId, submission } = input;

  if (!(await deps.hooks.isModerator(moderatorId))) {
    throw new ModerationError(`User ${moderatorId} is not a moderator`);
  }
  if (!(await isEligible(c, moderatorId, deps.hooks, deps.mod ?? defaultModConfig))) {
    throw new ModerationError(`Moderator ${moderatorId} has a conflict of interest with case ${c.id}`);
  }
  if (c.status !== "pending") throw new ModerationError(`Case ${c.id} is already decided`);
  if (submission.id !== c.id) throw new ModerationError(`Submission ${submission.id} does not belong to case ${c.id}`);

  const expected = c.request.mode === "decision" ? "needs_review" : "resolved";
  if (submission.status !== expected) {
    throw new ModerationError(`Case ${c.id} is a ${c.request.mode} case but the submission is ${submission.status}`);
  }

  const result = applyDecision(
    { submission, votes: input.votes, decision: { verdict: input.verdict }, now: input.now, ...(input.authorWeight !== undefined && { authorWeight: input.authorWeight }) },
    deps.config,
  );

  const decided: DecidedCase = {
    id: c.id,
    request: c.request,
    createdAt: c.createdAt,
    status: "decided",
    resolution: { moderatorId, verdict: input.verdict, change: result.change, decidedAt: input.now },
  };
  return { case: decided, submission: result.submission, deltas: result.deltas, change: result.change };
}
