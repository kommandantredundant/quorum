import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config.js";
import { applyDecision, DecisionError } from "./decision.js";
import type { Submission } from "./types.js";

const cfg = defaultConfig;
const base = { id: "s", authorId: "au", subjectId: "poi", createdAt: 0, windowEndsAt: 1, extensions: 0 };
const votes = [
  { voterId: "y1", choice: "approve" as const, weight: 1 },
  { voterId: "n1", choice: "reject" as const, weight: 1 },
];
const byUser = (d: { userId: string; delta: number }[]) => Object.fromEntries(d.map((x) => [x.userId, x.delta]));

describe("applyDecision", () => {
  it("decides a case in review: normal settlement, decidedBy review", () => {
    const sub: Submission = { ...base, status: "needs_review", reason: "grey_zone" };
    const r = applyDecision({ submission: sub, votes, decision: { verdict: "approved" }, now: 5 }, cfg);
    expect(r.change).toBe("decided");
    expect(r.submission.outcome).toMatchObject({ verdict: "approved", decidedBy: "review", approvalRatio: 0.5, resolvedAt: 5 });
    expect(byUser(r.deltas)).toEqual({ au: 1, y1: 1, n1: -1.5 });
  });

  it("has a null ratio when nobody voted", () => {
    const sub: Submission = { ...base, status: "needs_review", reason: "extension_limit" };
    const r = applyDecision({ submission: sub, votes: [], decision: { verdict: "rejected" }, now: 5 }, cfg);
    expect(r.submission.outcome.approvalRatio).toBeNull();
  });

  const audited: Submission = {
    ...base,
    status: "resolved",
    outcome: { verdict: "approved", decidedBy: "weight", approvalRatio: 0.6, totalWeight: 2, resolvedAt: 2 },
  };

  it("audit override flips the verdict with the voter-only double penalty", () => {
    const r = applyDecision({ submission: audited, votes, decision: { verdict: "rejected" }, now: 9 }, cfg);
    expect(r.change).toBe("overridden");
    expect(r.submission.outcome).toMatchObject({ verdict: "rejected", decidedBy: "review", approvalRatio: 0.6 });
    expect(byUser(r.deltas)).toEqual({ au: -2.5, y1: -4, n1: 2.5 });
  });

  it("audit confirmation changes nothing", () => {
    const r = applyDecision({ submission: audited, votes, decision: { verdict: "approved" }, now: 9 }, cfg);
    expect(r).toMatchObject({ change: "confirmed", deltas: [], submission: audited });
  });

  it("refuses open submissions and already moderated ones", () => {
    const open: Submission = { ...base, status: "open" };
    expect(() => applyDecision({ submission: open, votes, decision: { verdict: "approved" }, now: 1 }, cfg)).toThrow(DecisionError);
    const moderated: Submission = {
      ...base,
      status: "resolved",
      outcome: { verdict: "approved", decidedBy: "review", approvalRatio: 0.6, totalWeight: 2, resolvedAt: 2 },
    };
    expect(() => applyDecision({ submission: moderated, votes, decision: { verdict: "rejected" }, now: 1 }, cfg)).toThrow(DecisionError);
  });
});
