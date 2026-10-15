import type { QuorumConfig } from "./config.js";
import type { ReviewReason, Verdict, Vote } from "./types.js";

/**
 * Evaluation of a vote: pure, no I/O, no clock, no randomness.
 * Sampling of decided cases is NOT done here (roadmap task 8); this module only
 * reports which band the result falls into so that step can reuse it.
 */

/** Position of the weighted approval ratio relative to the configured bands. */
export type Band = "reject" | "sample_low" | "grey_zone" | "sample_high" | "approve";

export interface Tally {
  approveWeight: number;
  rejectWeight: number;
  totalWeight: number;
  approveCount: number;
  rejectCount: number;
  /** Distinct voters. The author's start weight is not a head. */
  headCount: number;
}

export type EvaluationReason = Extract<ReviewReason, "grey_zone" | "weight_conflict">;

export type Evaluation =
  /** Fewer voters than `voting.minVoters`: no result yet (lifecycle extends the window). */
  | ({ kind: "insufficient"; required: number } & Tally)
  /** Decided by weight. `band` tells the caller whether this is a sample candidate. */
  | ({ kind: "decided"; verdict: Verdict; approvalRatio: number; band: Band } & Tally)
  /** Not decidable by weight alone; goes to review. */
  | ({ kind: "review"; reason: EvaluationReason; approvalRatio: number; band: Band } & Tally);

export interface EvaluateInput {
  votes: readonly Pick<Vote, "voterId" | "choice" | "weight">[];
  /**
   * The author brings their own weight into a submission as start weight.
   * Counted as approving weight, but not as a head. Default 0.
   */
  authorWeight?: number;
}

type EvalConfig = Pick<QuorumConfig, "voting" | "bands" | "weightConflict">;

/** Sum up weights and heads. Throws on duplicate voters or invalid weights. */
export function tally(input: EvaluateInput): Tally {
  const authorWeight = input.authorWeight ?? 0;
  if (!Number.isFinite(authorWeight) || authorWeight < 0) {
    throw new RangeError(`authorWeight must be a finite number >= 0 (got ${authorWeight})`);
  }
  const seen = new Set<string>();
  let approveWeight = authorWeight;
  let rejectWeight = 0;
  let approveCount = 0;
  let rejectCount = 0;
  for (const v of input.votes) {
    if (seen.has(v.voterId)) throw new Error(`Duplicate vote from voter ${v.voterId}`);
    seen.add(v.voterId);
    if (!Number.isFinite(v.weight) || v.weight <= 0) {
      throw new RangeError(`vote weight must be a finite number > 0 (voter ${v.voterId}, got ${v.weight})`);
    }
    if (v.choice === "approve") {
      approveWeight += v.weight;
      approveCount += 1;
    } else {
      rejectWeight += v.weight;
      rejectCount += 1;
    }
  }
  return {
    approveWeight,
    rejectWeight,
    totalWeight: approveWeight + rejectWeight,
    approveCount,
    rejectCount,
    headCount: approveCount + rejectCount,
  };
}

/**
 * Classify a ratio (0..1). Boundaries: the grey zone is inclusive on both ends;
 * sample bands are open towards the grey zone's outside edge, i.e.
 * reject < 0.35 <= sample_low < 0.45 <= grey_zone <= 0.55 < sample_high <= 0.65 < approve
 * (with the default config).
 */
export function classifyRatio(ratio: number, bands: QuorumConfig["bands"]): Band {
  if (ratio < bands.sampleLow[0]) return "reject";
  if (ratio < bands.greyZone[0]) return "sample_low";
  if (ratio <= bands.greyZone[1]) return "grey_zone";
  if (ratio <= bands.sampleHigh[1]) return "sample_high";
  return "approve";
}

/**
 * Evaluate a vote.
 *
 * Order of checks:
 * 1. Fewer than `minVoters` heads -> `insufficient`.
 * 2. Ratio inside the grey zone -> review (`grey_zone`).
 * 3. Weight conflict: the side that wins by weight has <= `maxDecisiveVoters`
 *    heads while the other side has >= `minOpposingVoters` -> review
 *    (`weight_conflict`). Checked only outside the grey zone, where a weight
 *    winner exists. If both apply, `grey_zone` is reported.
 * 4. Otherwise decided by weight (> 0.5 approves).
 */
export function evaluate(input: EvaluateInput, config: EvalConfig): Evaluation {
  const t = tally(input);

  if (t.headCount < config.voting.minVoters) {
    return { kind: "insufficient", required: config.voting.minVoters, ...t };
  }

  const approvalRatio = t.approveWeight / t.totalWeight;
  const band = classifyRatio(approvalRatio, config.bands);

  if (band === "grey_zone") {
    return { kind: "review", reason: "grey_zone", approvalRatio, band, ...t };
  }

  const approves = approvalRatio > 0.5;
  const decisiveCount = approves ? t.approveCount : t.rejectCount;
  const opposingCount = approves ? t.rejectCount : t.approveCount;
  const { maxDecisiveVoters, minOpposingVoters } = config.weightConflict;
  if (decisiveCount <= maxDecisiveVoters && opposingCount >= minOpposingVoters) {
    return { kind: "review", reason: "weight_conflict", approvalRatio, band, ...t };
  }

  return { kind: "decided", verdict: approves ? "approved" : "rejected", approvalRatio, band, ...t };
}
