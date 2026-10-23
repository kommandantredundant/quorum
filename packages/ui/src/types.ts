export type VoteChoice = "approve" | "reject";
export type Verdict = "approved" | "rejected";
export type SubmissionStatus = "open" | "needs_review" | "resolved";

/**
 * When the interim result is shown. This is a display setting only: a page that must keep
 * the interim result secret has to enforce it in its own endpoint as well.
 * - always:      as soon as the page loads
 * - after-vote:  once the visitor has voted (default; keeps followers from copying the leader)
 * - after-close: only when the voting window has ended
 */
export type InterimMode = "always" | "after-vote" | "after-close";

/** Shape returned by quorum-core's `getView`. Weights only, never head counts or voters. */
export interface SubmissionView {
  submissionId: string;
  status: SubmissionStatus;
  windowEndsAt: number;
  approveWeight: number;
  rejectWeight: number;
  verdict?: Verdict;
  myVote: VoteChoice | null;
  canVote: boolean;
}

/** Shape returned by quorum-mod's `queueView`. */
export interface ModCaseView {
  id: string;
  mode: "decision" | "audit";
  reason: "grey_zone" | "weight_conflict" | "sample" | "extension_limit";
  requestedAt: number;
  approvalRatio: number | null;
  herdVerdict?: Verdict;
  triggers?: string[];
}

/** What the components need from the host. `createHttpClient` is the ready-made implementation. */
export interface QuorumClient {
  getSubmission(id: string): Promise<SubmissionView>;
  vote(id: string, choice: VoteChoice): Promise<void>;
  getQueue?(): Promise<ModCaseView[]>;
  decide?(id: string, verdict: Verdict): Promise<void>;
}
