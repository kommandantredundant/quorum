import type { Evaluation, QuorumConfig, Timestamp, Transition, Vote } from "quorum-core";
import { auditRequest } from "quorum-core";
import type { ModConfig } from "./config.js";
import { openCase } from "./queue.js";
import type { PendingCase, SampleTrigger } from "./types.js";

/**
 * Spot checks: which cases decided by weight get a second look from a moderator.
 * Moderators intervene only occasionally and afterwards; the herd decides by default.
 *
 * Three families of cases are worth checking (each with its own rate):
 * - narrow:     the result lies in a sample band (55-65 % / 35-45 %), see quorum-core `bands`
 * - divergence: weight and heads disagree strongly or point to opposite sides, i.e. a few
 *               heavy voters overruled many light ones (below the review threshold)
 * - edge:       a single voter carries most of the weight, or exactly the minimum number of voters took part
 *
 * Selection is deterministic (hash of seed + submission ID, no randomness, no clock), so any
 * server instance reaches the same answer for the same submission.
 */

type Decided = Extract<Evaluation, { kind: "decided" }>;
type CoreSampling = Pick<QuorumConfig, "bands" | "voting">;

/** Stable pseudo-random number in [0, 1): FNV-1a with a final avalanche step. */
export function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Which rules apply to this decided case. */
export function sampleTriggers(
  evaluation: Decided,
  votes: readonly Pick<Vote, "weight">[],
  core: CoreSampling,
  mod: ModConfig,
): SampleTrigger[] {
  const out: SampleTrigger[] = [];

  if (evaluation.band === "sample_low" || evaluation.band === "sample_high") out.push("narrow");

  const headRatio = evaluation.approveCount / evaluation.headCount;
  const weightSide = evaluation.approvalRatio - 0.5;
  const headSide = headRatio - 0.5;
  const opposite = weightSide * headSide < 0;
  if (opposite || Math.abs(evaluation.approvalRatio - headRatio) >= mod.sampling.divergenceThreshold) out.push("divergence");

  const maxWeight = votes.reduce((m, v) => Math.max(m, v.weight), 0);
  const dominant = evaluation.totalWeight > 0 && maxWeight / evaluation.totalWeight >= mod.sampling.dominantShare;
  if (dominant || evaluation.headCount === core.voting.minVoters) out.push("edge");

  return out;
}

const rateOf = (t: SampleTrigger, core: CoreSampling, mod: ModConfig): number =>
  t === "narrow" ? core.bands.sampleRate : t === "divergence" ? mod.sampling.divergenceRate : mod.sampling.edgeRate;

/** Is this submission picked? The highest rate among the triggered rules applies. */
export function isSampled(submissionId: string, triggers: readonly SampleTrigger[], core: CoreSampling, mod: ModConfig): boolean {
  if (triggers.length === 0) return false;
  const rate = Math.max(...triggers.map((t) => rateOf(t, core, mod)));
  return hash01(`${mod.sampling.seed}:${submissionId}`) < rate;
}

/**
 * For a submission just resolved by weight: the spot-check case to enqueue, or null.
 * Call right after `advance` returned `resolved`.
 */
export function auditCase(
  t: Extract<Transition, { kind: "resolved" }>,
  votes: readonly Pick<Vote, "weight">[],
  now: Timestamp,
  core: CoreSampling,
  mod: ModConfig,
): PendingCase | null {
  const triggers = sampleTriggers(t.evaluation, votes, core, mod);
  if (!isSampled(t.submission.id, triggers, core, mod)) return null;
  return { ...openCase(auditRequest(t, now), now), triggers };
}
