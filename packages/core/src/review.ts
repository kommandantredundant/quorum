import type { Evaluation } from "./evaluate.js";
import type { Transition } from "./lifecycle.js";
import type { ReviewReason, SubjectId, SubmissionId, Timestamp, UserId, Verdict } from "./types.js";

/**
 * Hand-off from quorum-core to whoever handles review (quorum-mod, the host, or
 * the default handler). This is plain data: the core never imports a moderation
 * package, it only emits requests.
 *
 * - `decision`: no verdict yet (status `needs_review`). A decision is required.
 * - `audit`: already decided by weight; `herdVerdict` stands unless overridden.
 */
export interface ReviewRequest {
  mode: "decision" | "audit";
  submissionId: SubmissionId;
  subjectId: SubjectId;
  authorId: UserId;
  reason: ReviewReason;
  requestedAt: Timestamp;
  /** Weighted approval ratio at the time, or null if no weight was cast. */
  approvalRatio: number | null;
  /** Only for `audit`. */
  herdVerdict?: Verdict;
}

function ratioOf(e: Evaluation): number | null {
  return e.kind === "insufficient" ? null : e.approvalRatio;
}

/** Review request for a submission that needs a decision (from `advance`). */
export function reviewRequest(t: Extract<Transition, { kind: "review" }>, now: Timestamp): ReviewRequest {
  const s = t.submission;
  return {
    mode: "decision",
    submissionId: s.id,
    subjectId: s.subjectId,
    authorId: s.authorId,
    reason: s.reason,
    requestedAt: now,
    approvalRatio: ratioOf(t.evaluation),
  };
}

/**
 * Review request for an already decided submission picked for a spot check.
 * Who gets picked (sample bands, large gaps, edge cases) is decided by the
 * caller, e.g. quorum-mod; `evaluation.band` is available for that.
 */
export function auditRequest(t: Extract<Transition, { kind: "resolved" }>, now: Timestamp): ReviewRequest {
  const s = t.submission;
  return {
    mode: "audit",
    submissionId: s.id,
    subjectId: s.subjectId,
    authorId: s.authorId,
    reason: "sample",
    requestedAt: now,
    approvalRatio: s.outcome.approvalRatio,
    herdVerdict: s.outcome.verdict,
  };
}
