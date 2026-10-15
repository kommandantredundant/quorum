import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config.js";
import { advance, canVote, openSubmission } from "./lifecycle.js";

const cfg = defaultConfig; // 72h window, minVoters 3, 3 extensions of 24h
const H = 3_600_000;
const sub = openSubmission({ id: "s1", authorId: "au", subjectId: "poi" }, 0, cfg);
const yes = (id: string, weight = 1) => ({ voterId: id, choice: "approve" as const, weight });

describe("lifecycle", () => {
  it("keeps the window open until its end, even with plenty of votes", () => {
    const votes = [yes("a"), yes("b"), yes("c"), yes("d")];
    expect(advance(sub, votes, 0, 72 * H - 1, cfg).kind).toBe("pending");
    expect(canVote(sub, 72 * H - 1)).toBe(true);
    expect(canVote(sub, 72 * H)).toBe(false);
  });

  it("extends from max(windowEnd, now) when too few voters, so late processing keeps a full window", () => {
    const t = advance(sub, [yes("a")], 0, 100 * H, cfg);
    expect(t.kind).toBe("extended");
    if (t.kind === "extended") {
      expect(t.submission.extensions).toBe(1);
      expect(t.submission.windowEndsAt).toBe(124 * H);
    }
  });

  it("goes to review with extension_limit after the last extension", () => {
    const exhausted = { ...sub, extensions: cfg.voting.maxExtensions };
    const t = advance(exhausted, [yes("a")], 0, 72 * H, cfg);
    expect(t.kind).toBe("review");
    if (t.kind === "review") expect(t.submission).toMatchObject({ status: "needs_review", reason: "extension_limit" });
  });

  it("resolves by weight at window end, and routes review cases", () => {
    const ok = advance(sub, [yes("a", 3), yes("b", 3), yes("c", 3)], 0, 72 * H, cfg);
    expect(ok.kind).toBe("resolved");
    if (ok.kind === "resolved") expect(ok.submission.outcome).toMatchObject({ verdict: "approved", decidedBy: "weight", resolvedAt: 72 * H });

    const grey = advance(sub, [yes("a"), { voterId: "b", choice: "reject" as const, weight: 1 }, yes("c", 0.5), { voterId: "d", choice: "reject" as const, weight: 0.5 }], 0, 72 * H, cfg);
    expect(grey.kind === "review" && grey.submission.status === "needs_review" && grey.submission.reason).toBe("grey_zone");
  });

  it("leaves non-open submissions untouched", () => {
    const done = { ...sub, status: "needs_review" as const, reason: "sample" as const };
    expect(advance(done, [], 0, 1e12, cfg).kind).toBe("none");
  });
});
