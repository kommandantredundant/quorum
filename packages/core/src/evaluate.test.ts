import { describe, expect, it } from "vitest";
import { defaultConfig, defineConfig } from "./config.js";
import { classifyRatio, evaluate, tally } from "./evaluate.js";
import type { VoteChoice } from "./types.js";

const cfg = defaultConfig;
const v = (id: string, choice: VoteChoice, weight = 1) => ({ voterId: id, choice, weight });
/** n voters with the same choice and weight. */
const many = (prefix: string, n: number, choice: VoteChoice, weight = 1) =>
  Array.from({ length: n }, (_, i) => v(`${prefix}${i}`, choice, weight));

describe("tally", () => {
  it("sums weights and heads per side", () => {
    const t = tally({ votes: [v("a", "approve", 2), v("b", "reject", 3), v("c", "approve", 1)] });
    expect(t).toEqual({ approveWeight: 3, rejectWeight: 3, totalWeight: 6, approveCount: 2, rejectCount: 1, headCount: 3 });
  });

  it("counts author weight as approving weight but not as a head", () => {
    const t = tally({ votes: [v("a", "reject", 2)], authorWeight: 5 });
    expect(t.approveWeight).toBe(5);
    expect(t.approveCount).toBe(0);
    expect(t.headCount).toBe(1);
  });

  it("rejects duplicate voters and invalid weights", () => {
    expect(() => tally({ votes: [v("a", "approve"), v("a", "reject")] })).toThrow(/Duplicate/);
    expect(() => tally({ votes: [v("a", "approve", 0)] })).toThrow(RangeError);
    expect(() => tally({ votes: [v("a", "approve", NaN)] })).toThrow(RangeError);
    expect(() => tally({ votes: [], authorWeight: -1 })).toThrow(RangeError);
  });
});

describe("classifyRatio (default bands)", () => {
  it.each([
    [0.0, "reject"],
    [0.349, "reject"],
    [0.35, "sample_low"],
    [0.449, "sample_low"],
    [0.45, "grey_zone"],
    [0.5, "grey_zone"],
    [0.55, "grey_zone"],
    [0.551, "sample_high"],
    [0.65, "sample_high"],
    [0.651, "approve"],
    [1, "approve"],
  ] as const)("%s -> %s", (ratio, band) => {
    expect(classifyRatio(ratio, cfg.bands)).toBe(band);
  });
});

describe("evaluate", () => {
  it("is insufficient below minVoters, regardless of weights", () => {
    const e = evaluate({ votes: [v("a", "approve", 100), v("b", "approve", 100)] }, cfg);
    expect(e.kind).toBe("insufficient");
    if (e.kind === "insufficient") expect(e.required).toBe(cfg.voting.minVoters);
  });

  it("is insufficient with no votes at all (no NaN ratio)", () => {
    expect(evaluate({ votes: [] }, cfg).kind).toBe("insufficient");
  });

  it("approves clearly by weight", () => {
    const e = evaluate({ votes: [v("a", "approve", 3), v("b", "approve", 3), v("c", "reject", 1)] }, cfg);
    expect(e).toMatchObject({ kind: "decided", verdict: "approved", band: "approve" });
  });

  it("rejects clearly by weight", () => {
    const e = evaluate({ votes: [v("a", "reject", 3), v("b", "reject", 3), v("c", "approve", 1)] }, cfg);
    expect(e).toMatchObject({ kind: "decided", verdict: "rejected", band: "reject" });
  });

  it("decides by weight, not heads: two heavy voters beat three light ones", () => {
    const e = evaluate({ votes: [v("a", "approve", 5), v("b", "approve", 5), ...many("r", 3, "reject")] }, cfg);
    expect(e).toMatchObject({ kind: "decided", verdict: "approved" });
  });

  it("sends the grey zone to review", () => {
    const e = evaluate({ votes: [v("a", "approve", 5), v("b", "reject", 5), v("c", "approve", 0.5), v("d", "reject", 0.5)] }, cfg);
    expect(e).toMatchObject({ kind: "review", reason: "grey_zone", band: "grey_zone" });
  });

  it("flags sample bands but still decides", () => {
    // 60 : 40 -> sample_high, approved
    const hi = evaluate({ votes: [v("a", "approve", 30), v("b", "approve", 30), v("c", "reject", 40)] }, cfg);
    expect(hi).toMatchObject({ kind: "decided", verdict: "approved", band: "sample_high" });
    // 40 : 60 -> sample_low, rejected
    const lo = evaluate({ votes: [v("a", "approve", 20), v("b", "approve", 20), v("c", "reject", 60)] }, cfg);
    expect(lo).toMatchObject({ kind: "decided", verdict: "rejected", band: "sample_low" });
  });

  it("detects weight conflict: 2 top voters vs many light voters", () => {
    const e = evaluate({ votes: [v("t1", "approve", 20), v("t2", "approve", 20), ...many("r", 5, "reject")] }, cfg);
    expect(e).toMatchObject({ kind: "review", reason: "weight_conflict", approveCount: 2, rejectCount: 5 });
  });

  it("detects weight conflict in the reject direction too", () => {
    const e = evaluate({ votes: [v("t1", "reject", 30), ...many("a", 6, "approve")] }, cfg);
    expect(e).toMatchObject({ kind: "review", reason: "weight_conflict" });
  });

  it("does not flag conflict below the opposing-voter threshold or above the decisive-voter limit", () => {
    const fewOpposing = evaluate({ votes: [v("t1", "approve", 20), v("t2", "approve", 20), ...many("r", 4, "reject")] }, cfg);
    expect(fewOpposing.kind).toBe("decided");
    const threeDecisive = evaluate({ votes: [v("t1", "approve", 20), v("t2", "approve", 20), v("t3", "approve", 20), ...many("r", 6, "reject")] }, cfg);
    expect(threeDecisive.kind).toBe("decided");
  });

  it("reports grey_zone when grey zone and weight conflict both apply", () => {
    const e = evaluate({ votes: [v("t1", "approve", 5), ...many("r", 5, "reject")] }, cfg);
    expect(e).toMatchObject({ kind: "review", reason: "grey_zone" });
  });

  it("counts author start weight toward approval (not as a head)", () => {
    const votes = [v("a", "reject", 3), v("b", "reject", 3), v("c", "reject", 3)];
    expect(evaluate({ votes }, cfg)).toMatchObject({ kind: "decided", verdict: "rejected" });
    // author weight 9 -> 9 : 9 -> grey zone
    expect(evaluate({ votes, authorWeight: 9 }, cfg)).toMatchObject({ kind: "review", reason: "grey_zone" });
  });

  it("respects a custom config", () => {
    const c = defineConfig({ voting: { minVoters: 1 }, weightConflict: { maxDecisiveVoters: 1, minOpposingVoters: 2 } });
    expect(evaluate({ votes: [v("a", "approve", 4)] }, c).kind).toBe("decided");
    expect(evaluate({ votes: [v("a", "approve", 4), v("b", "reject"), v("c", "reject")] }, c)).toMatchObject({ kind: "review", reason: "weight_conflict" });
  });
});
