import type { QuorumConfig } from "./config.js";
import type { Reputation, Timestamp, UserId, Verdict, Vote } from "./types.js";

/**
 * Reputation updates. Pure: they return deltas, the caller persists them.
 *
 * Rules:
 * - Voter: voted with the final verdict -> +reward, against it -> penalty (negative).
 * - Author: submission approved -> +reward, rejected -> penalty.
 * - Moderator override: users end up exactly where they would stand had the
 *   final verdict been the herd verdict, except that wrong voters get
 *   `overridePenaltyFactor` x penalty (authors never). The returned deltas are
 *   the difference to what the original herd verdict already applied.
 * - A moderator confirming the herd verdict changes nothing (no call needed).
 */

export interface ReputationDelta {
  userId: UserId;
  delta: number;
}

export interface SettleInput {
  authorId: UserId;
  votes: readonly Pick<Vote, "voterId" | "choice">[];
}

type RepConfig = Pick<QuorumConfig, "reputation">;

/** Where each user stands after `verdict`; wrong voters' penalty is multiplied by `voterPenaltyFactor`. */
function standing(input: SettleInput, verdict: Verdict, voterPenaltyFactor: number, config: RepConfig): Map<UserId, number> {
  const { reward, penalty } = config.reputation;
  const out = new Map<UserId, number>();
  const add = (id: UserId, n: number) => out.set(id, (out.get(id) ?? 0) + n);

  add(input.authorId, verdict === "approved" ? reward : penalty);
  for (const v of input.votes) {
    const correct = (v.choice === "approve") === (verdict === "approved");
    add(v.voterId, correct ? reward : penalty * voterPenaltyFactor);
  }
  return out;
}

function toDeltas(m: Map<UserId, number>): ReputationDelta[] {
  return [...m].filter(([, delta]) => delta !== 0).map(([userId, delta]) => ({ userId, delta }));
}

/** Deltas when a submission is decided with `verdict` (by herd, or by a moderator without a prior herd verdict). */
export function settleDeltas(input: SettleInput, verdict: Verdict, config: RepConfig): ReputationDelta[] {
  return toDeltas(standing(input, verdict, 1, config));
}

/**
 * Deltas to apply ON TOP of `settleDeltas(input, originalVerdict)` when a moderator
 * flips the herd verdict to the opposite one.
 */
export function overrideDeltas(input: SettleInput, originalVerdict: Verdict, config: RepConfig): ReputationDelta[] {
  const flipped: Verdict = originalVerdict === "approved" ? "rejected" : "approved";
  const finalState = standing(input, flipped, config.reputation.overridePenaltyFactor, config);
  const applied = standing(input, originalVerdict, 1, config);
  for (const [id, n] of applied) finalState.set(id, (finalState.get(id) ?? 0) - n);
  return toDeltas(finalState);
}

export function applyDelta(rep: Reputation, delta: number, now: Timestamp): Reputation {
  return { ...rep, value: rep.value + delta, updatedAt: now };
}

/** Reputation record for a user seen for the first time. */
export function newReputation(userId: UserId, now: Timestamp, config: RepConfig): Reputation {
  return { userId, value: config.reputation.startValue, updatedAt: now };
}
