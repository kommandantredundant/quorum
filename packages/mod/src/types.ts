import type { DecisionChange, ReviewRequest, SubmissionId, Timestamp, UserId, Verdict } from "quorum-core";

/**
 * One moderation case per submission: a submission is either in review (needs a
 * decision) or already decided and sampled (audit), never both at once, so the
 * submission ID doubles as case ID. Plain, JSON-serializable data.
 */
/** Why a decided submission was picked for a spot check (see sampling.ts). */
export type SampleTrigger = "narrow" | "divergence" | "edge";

interface CaseBase {
  id: SubmissionId;
  request: ReviewRequest;
  createdAt: Timestamp;
  /** Only for spot checks: which rules picked the case. */
  triggers?: SampleTrigger[];
}

export interface PendingCase extends CaseBase {
  status: "pending";
}

/** Everything needed to later show who decided what, and when. */
export interface CaseResolution {
  moderatorId: UserId;
  verdict: Verdict;
  change: DecisionChange;
  decidedAt: Timestamp;
}

export interface DecidedCase extends CaseBase {
  status: "decided";
  /** The latest decision. */
  resolution: CaseResolution;
  /** Earlier decisions in order (oldest first), present once a decision was revised or re-confirmed. */
  previous?: CaseResolution[];
}

export type ModCase = PendingCase | DecidedCase;
