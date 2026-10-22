import type { QuorumConfig } from "./config.js";

type WeightConfig = Pick<QuorumConfig, "weight">;

/**
 * Technical safety ceiling for any single weight. It is not a policy knob (use
 * `config.weight.cap` for that): it only keeps weights finite when no cap is
 * configured, so sums and ratios can never overflow to Infinity/NaN.
 */
export const WEIGHT_CEILING = 1e9;

/**
 * Voting weight for a given reputation.
 *
 *   weight = min(cap, WEIGHT_CEILING, base * growth ^ max(reputation, 0))
 *
 * - `cap` defaults to 20 (see config); `Infinity` disables it.
 * - Reputation below 0 is treated as 0: a penalised user still counts with the
 *   base weight, never less. (Provisional decision, revisit in simulation.)
 * - Pure and deterministic: same input, same output.
 */
export function voteWeight(reputation: number, config: WeightConfig): number {
  if (Number.isNaN(reputation)) throw new RangeError("reputation must not be NaN");
  const { base, growth, cap } = config.weight;
  const rep = Math.max(reputation, 0);
  return Math.min(cap, WEIGHT_CEILING, base * Math.pow(growth, rep));
}

/** Start weight an author brings into their own submission: their vote weight, limited by `weight.authorCap`. */
export function authorStartWeight(reputation: number, config: WeightConfig): number {
  return Math.min(voteWeight(reputation, config), config.weight.authorCap);
}

/**
 * Reputation at which the configured cap is reached (and growth stops).
 * Returns Infinity if the cap can never be reached (no cap, or growth === 1
 * with cap > base), and 0 if cap === base.
 */
export function capReputation(config: WeightConfig): number {
  const { base, growth, cap } = config.weight;
  if (cap === base) return 0;
  if (growth === 1 || cap === Infinity) return Infinity;
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
