import type { QuorumConfig } from "./config.js";

type WeightConfig = Pick<QuorumConfig, "weight">;

/**
 * Voting weight for a given reputation.
 *
 *   weight = min(cap, base * growth ^ max(reputation, 0))
 *
 * - Reputation below 0 is treated as 0: a penalised user still counts with the
 *   base weight, never less. (Provisional decision, revisit in simulation.)
 * - Pure and deterministic: same input, same output.
 */
export function voteWeight(reputation: number, config: WeightConfig): number {
  if (Number.isNaN(reputation)) throw new RangeError("reputation must not be NaN");
  const { base, growth, cap } = config.weight;
  const rep = Math.max(reputation, 0);
  // Infinity ** x is fine here: Math.min clamps it to cap.
  return Math.min(cap, base * Math.pow(growth, rep));
}

/**
 * Reputation at which the weight cap is reached (and growth stops).
 * Returns Infinity if the cap can never be reached (growth === 1 and cap > base),
 * and 0 if cap === base.
 */
export function capReputation(config: WeightConfig): number {
  const { base, growth, cap } = config.weight;
  if (cap === base) return 0;
  if (growth === 1) return Infinity;
  return Math.log(cap / base) / Math.log(growth);
}

/**
 * Smallest number of voters of weight `otherWeight` whose combined weight
 * strictly exceeds a single voter of weight `weight`. Answers
 * "how many base-weight users does it take to overrule one top voter?".
 */
export function votersToOutweigh(weight: number, otherWeight: number): number {
  if (!(weight > 0) || !(otherWeight > 0)) throw new RangeError("weights must be > 0");
  return Math.floor(weight / otherWeight) + 1;
}
