import type { InterimMode, SubmissionView } from "./types.js";

/** Display logic without any DOM, so it can be tested and reused. */

export const DEFAULT_MODE: InterimMode = "after-vote";

export function parseMode(value: string | null | undefined): InterimMode {
  return value === "always" || value === "after-close" || value === "after-vote" ? value : DEFAULT_MODE;
}

export function isClosed(v: Pick<SubmissionView, "status" | "windowEndsAt">, now: number): boolean {
  return v.status !== "open" || now >= v.windowEndsAt;
}

export function interimVisible(mode: InterimMode, v: SubmissionView, now: number): boolean {
  switch (mode) {
    case "always": return true;
    case "after-vote": return v.myVote !== null || isClosed(v, now);
    case "after-close": return isClosed(v, now);
  }
}

/** Whole percentages that always add up to 100, or null if no weight was cast yet. */
export function shares(approve: number, reject: number): { yes: number; no: number } | null {
  const total = approve + reject;
  if (!(total > 0)) return null;
  const yes = Math.round((100 * approve) / total);
  return { yes, no: 100 - yes };
}

export type Phase = "voting" | "awaiting" | "review" | "resolved";

/** voting: window open. awaiting: window ended, result not processed yet. */
export function phaseOf(v: SubmissionView, now: number): Phase {
  if (v.status === "resolved") return "resolved";
  if (v.status === "needs_review") return "review";
  return now >= v.windowEndsAt ? "awaiting" : "voting";
}
