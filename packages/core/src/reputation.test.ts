import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config.js";
import { overrideDeltas, settleDeltas } from "./reputation.js";

const cfg = defaultConfig; // reward +1, penalty -1.5, override factor 2
const input = {
  authorId: "author",
  votes: [
    { voterId: "yes1", choice: "approve" as const },
    { voterId: "yes2", choice: "approve" as const },
    { voterId: "no1", choice: "reject" as const },
  ],
};
const byUser = (d: { userId: string; delta: number }[]) => Object.fromEntries(d.map((x) => [x.userId, x.delta]));

describe("reputation deltas", () => {
  it("rewards the right side and penalises the wrong side, author follows the verdict", () => {
    expect(byUser(settleDeltas(input, "approved", cfg))).toEqual({ author: 1, yes1: 1, yes2: 1, no1: -1.5 });
    expect(byUser(settleDeltas(input, "rejected", cfg))).toEqual({ author: -1.5, yes1: -1.5, yes2: -1.5, no1: 1 });
  });

  it("override: net deltas bring everyone to the final state; only voters get the double penalty", () => {
    // herd approved, moderator rejects: yes-voters end at -3 (was +1) -> -4; dissenter ends at +1 (was -1.5) -> +2.5; author -1.5 (was +1) -> -2.5
    expect(byUser(overrideDeltas(input, "approved", cfg))).toEqual({ author: -2.5, yes1: -4, yes2: -4, no1: 2.5 });
    // herd rejected, moderator approves: author +1 (was -1.5) -> +2.5
    expect(byUser(overrideDeltas(input, "rejected", cfg))).toEqual({ author: 2.5, yes1: 2.5, yes2: 2.5, no1: -4 });
  });

  it("merges deltas when the author also voted", () => {
    const d = settleDeltas({ authorId: "a", votes: [{ voterId: "a", choice: "approve" }] }, "approved", cfg);
    expect(d).toEqual([{ userId: "a", delta: 2 }]);
  });
});
