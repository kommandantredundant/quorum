import type { SubmissionId, UserId } from "quorum-core";

/** Provided by the host website; the moderation layer has no user management or vote storage of its own. */
export interface ModHooks {
  isModerator(userId: UserId): boolean | Promise<boolean>;
  /** Current number of moderators (drives the conflict-of-interest rules). */
  countModerators(): number | Promise<number>;
  /** Did this user cast a vote on the submission? */
  hasVoted(userId: UserId, submissionId: SubmissionId): boolean | Promise<boolean>;
}
