import { advance, defaultConfig, openSubmission, reviewRequest, type Submission } from "quorum-core";
import { describe, expect, it } from "vitest";
import { decideCase, ModerationError } from "./decide.js";
import { compareCases, openCase, pendingQueue } from "./queue.js";

const cfg = defaultConfig;
const H = 3_600_000;
const hooks = { isModerator: (id: string) => id === "mod" };
const votes = [
  { voterId: "y1", choice: "approve" as const, weight: 5 },
  { voterId: "n1", choice: "reject" as const, weight: 5 },
  { voterId: "y2", choice: "approve" as const, weight: 0.5 },
  { voterId: "n2", choice: "reject" as const, weight: 0.5 },
];

// A real grey-zone case produced by the core.
const sub = openSubmission({ id: "s1", authorId: "au", subjectId: "poi" }, 0, cfg);
const t = advance(sub, votes, 0, 72 * H, cfg);
if (t.kind !== "review") throw new Error("setup: expected review");
const review = t.submission;
const pending = openCase(reviewRequest(t, 72 * H), 72 * H);

describe("quorum-mod", () => {
  it("orders decisions before audits, then oldest first", () => {
    const audit = { ...pending, id: "a", request: { ...pending.request, mode: "audit" as const, requestedAt: 1 } };
    const late = { ...pending, id: "d2", request: { ...pending.request, requestedAt: 99 } };
    const early = { ...pending, id: "d1", request: { ...pending.request, requestedAt: 5 } };
    expect(pendingQueue([audit, late, early]).map((c) => c.id)).toEqual(["d1", "d2", "a"]);
    expect(compareCases(early, early)).toBe(0);
  });

  it("lets a moderator decide a case in review", async () => {
    const r = await decideCase({ case: pending, moderatorId: "mod", verdict: "approved", submission: review, votes, now: 80 * H }, { hooks, config: cfg });
    expect(r.change).toBe("decided");
    expect(r.case).toMatchObject({ status: "decided", resolution: { moderatorId: "mod", verdict: "approved", change: "decided" } });
    expect(r.submission.outcome.decidedBy).toBe("review");
    expect(r.deltas.length).toBeGreaterThan(0);
  });

  it("refuses non-moderators and already decided cases", async () => {
    const base = { case: pending, verdict: "approved" as const, submission: review, votes, now: 80 * H };
    await expect(decideCase({ ...base, moderatorId: "someone" }, { hooks, config: cfg })).rejects.toThrow(ModerationError);
    const done = await decideCase({ ...base, moderatorId: "mod" }, { hooks, config: cfg });
    await expect(decideCase({ ...base, case: done.case, moderatorId: "mod" }, { hooks, config: cfg })).rejects.toThrow(/already decided/);
  });

  it("refuses a submission that does not match the case", async () => {
    const other: Submission = { ...review, id: "other" };
    await expect(decideCase({ case: pending, moderatorId: "mod", verdict: "approved", submission: other, votes, now: 80 * H }, { hooks, config: cfg })).rejects.toThrow(/does not belong/);
  });
});
