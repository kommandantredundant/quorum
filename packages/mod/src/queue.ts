import type { ReviewRequest, Timestamp } from "quorum-core";
import type { ModCase, PendingCase } from "./types.js";

/** Create the case for a review request (call when the review handler returned "defer", or when sampling picked an audit). */
export function openCase(request: ReviewRequest, now: Timestamp): PendingCase {
  return { id: request.submissionId, request, status: "pending", createdAt: now };
}

/**
 * Work order: cases that block a verdict (`decision`) come before spot checks
 * (`audit`); within each group the oldest request first.
 */
export function compareCases(a: ModCase, b: ModCase): number {
  const rank = (c: ModCase) => (c.request.mode === "decision" ? 0 : 1);
  return rank(a) - rank(b) || a.request.requestedAt - b.request.requestedAt || a.id.localeCompare(b.id);
}

/** Pending cases in work order. Does not mutate the input. */
export function pendingQueue(cases: readonly ModCase[]): PendingCase[] {
  return cases.filter((c): c is PendingCase => c.status === "pending").sort(compareCases);
}
