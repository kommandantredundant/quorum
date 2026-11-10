import type { InterimMode, ProfileActivity, SubmissionView } from "./types.js";

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

/** Number of trust levels in the default UI. */
export const LEVEL_COUNT = 5;

/**
 * Trust level 0..4 from the vote weight, relative to a new member's weight:
 * 0 new (no more than a new member), 1 below 2x, 2 below 5x, 3 below the cap, 4 at the cap.
 * Without a cap, level 4 is never reached. Shown instead of the raw reputation number.
 */
export function trustLevel(p: { weight: number; baseWeight: number; maxWeight: number | null }): number {
  const r = p.weight / (p.baseWeight > 0 ? p.baseWeight : 1);
  if (p.maxWeight !== null && p.weight >= p.maxWeight - 1e-9) return 4;
  if (r <= 1 + 1e-9) return 0;
  if (r < 2) return 1;
  if (r < 5) return 2;
  return 3;
}

/** A readable name for a history entry: payload.name or payload.title, else the subject ID. */
export function defaultSubjectLabel(a: ProfileActivity): string {
  const p = a.payload;
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    if (typeof o.name === "string" && o.name) return o.name;
    if (typeof o.title === "string" && o.title) return o.title;
  }
  return a.subjectId;
}
