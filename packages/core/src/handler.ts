import type { Decision } from "./decision.js";
import type { ReviewRequest } from "./review.js";

/**
 * Who answers a ReviewRequest. The host picks one; the core ships a default so it
 * is complete without quorum-mod.
 *
 * - return a `Decision` -> the caller settles it right away via `applyDecision`
 * - return "defer"      -> a moderation layer (quorum-mod) takes over asynchronously
 */
export type ReviewResolution = Decision | "defer";
export type ReviewHandler = (request: ReviewRequest) => ReviewResolution | Promise<ReviewResolution>;

/**
 * Default when no moderation is installed: decide by weight at the end of the window.
 *
 * - More than half of the weight approves -> approved, otherwise rejected (an exact tie rejects).
 * - Nobody voted (zero heads) -> rejected, so an author's start weight alone can never self-approve.
 * - Audit requests (already decided by weight) -> the weight verdict stands.
 */
export const decideByWeight: ReviewHandler = (request) => {
  if (request.mode === "audit" && request.herdVerdict) return { verdict: request.herdVerdict };
  const { tally } = request;
  if (tally.headCount === 0 || tally.totalWeight <= 0) return { verdict: "rejected" };
  return { verdict: tally.approveWeight / tally.totalWeight > 0.5 ? "approved" : "rejected" };
};

/** Hand every request to a moderation layer. Used together with quorum-mod. */
export const deferToModeration: ReviewHandler = () => "defer";
