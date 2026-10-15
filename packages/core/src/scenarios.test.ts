import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config.js";
import { advance, openSubmission } from "./lifecycle.js";
import { overrideDeltas, settleDeltas, type ReputationDelta } from "./reputation.js";
import type { VoteChoice } from "./types.js";
import { voteWeight } from "./weight.js";

// End-to-end flow of the core without storage: submit -> vote -> advance -> reputation.
const cfg = defaultConfig;
const H = 3_600_000;

function world(reputations: Record<string, number>) {
  const rep = new Map(Object.entries(reputations));
  const votes: { voterId: string; choice: VoteChoice; weight: number }[] = [];
  const weightOf = (id: string) => voteWeight(rep.get(id) ?? 0, cfg);
  return {
    rep,
    votes,
    weightOf,
    vote: (voterId: string, choice: VoteChoice) => votes.push({ voterId, choice, weight: weightOf(voterId) }),
    apply: (deltas: ReputationDelta[]) => deltas.forEach((d) => rep.set(d.userId, (rep.get(d.userId) ?? 0) + d.delta)),
  };
}

describe("core scenarios", () => {
  it("approves a clear case and books reputation", () => {
    const w = world({ au: 0, a: 10, b: 5, c: 0, d: 0 });
    const s = openSubmission({ id: "s", authorId: "au", subjectId: "poi" }, 0, cfg);
    ["a", "b", "c"].forEach((id) => w.vote(id, "approve"));
    w.vote("d", "reject");

    const t = advance(s, w.votes, w.weightOf("au"), 72 * H, cfg);
    expect(t.kind).toBe("resolved");
    if (t.kind !== "resolved") return;
    expect(t.submission.outcome.verdict).toBe("approved");

    w.apply(settleDeltas({ authorId: "au", votes: w.votes }, "approved", cfg));
    expect([w.rep.get("au"), w.rep.get("a"), w.rep.get("d")]).toEqual([1, 11, -1.5]);
  });

  it("extends three times, then hands an unvoted case to review", () => {
    const w = world({ au: 0, a: 0 });
    let s = openSubmission({ id: "s", authorId: "au", subjectId: "poi" }, 0, cfg);
    w.vote("a", "approve");

    let steps = 0;
    for (;;) {
      steps += 1;
      const t = advance(s, w.votes, w.weightOf("au"), s.windowEndsAt, cfg);
      if (t.kind === "extended") { s = t.submission; continue; }
      expect(t.kind).toBe("review");
      if (t.kind === "review") expect(t.submission).toMatchObject({ status: "needs_review", reason: "extension_limit" });
      break;
    }
    expect(steps).toBe(cfg.voting.maxExtensions + 1);
  });

  it("moderator override leaves everyone at the final state, voters with the double penalty", () => {
    const w = world({ au: 0, y1: 0, y2: 0, n1: 0 });
    w.vote("y1", "approve");
    w.vote("y2", "approve");
    w.vote("n1", "reject");
    const input = { authorId: "au", votes: w.votes };

    w.apply(settleDeltas(input, "approved", cfg)); // herd verdict
    w.apply(overrideDeltas(input, "approved", cfg)); // moderator flips to rejected
    expect(Object.fromEntries(w.rep)).toEqual({ au: -1.5, y1: -3, y2: -3, n1: 1 });
  });
});
