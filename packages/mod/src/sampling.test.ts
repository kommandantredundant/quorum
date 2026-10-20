import { advance, defineConfig, openSubmission, type Transition } from "quorum-core";
import { describe, expect, it } from "vitest";
import { auditEntries } from "./audit.js";
import { defaultModConfig, defineModConfig } from "./config.js";
import { auditCase, hash01, sampleTriggers } from "./sampling.js";
import type { DecidedCase } from "./types.js";

const H = 3_600_000;
const core = defineConfig({ voting: { minVoters: 2 }, bands: { sampleRate: 1 } });
const mod = defineModConfig({ sampling: { divergenceRate: 1, edgeRate: 1 } });

const resolve = (cfg: typeof core, spec: [string, "approve" | "reject", number][]) => {
  const votes = spec.map(([voterId, choice, weight]) => ({ voterId, choice, weight }));
  const sub = openSubmission({ id: "s", authorId: "au", subjectId: "p" }, 0, cfg);
  const t = advance(sub, votes, 0, 72 * H, cfg) as Extract<Transition, { kind: "resolved" }>;
  if (t.kind !== "resolved") throw new Error(`setup: expected resolved, got ${t.kind}`);
  return { t, votes };
};
const triggers = (spec: [string, "approve" | "reject", number][]) => {
  const { t, votes } = resolve(core, spec);
  return sampleTriggers(t.evaluation, votes, core, mod);
};

describe("sampling", () => {
  it("finds narrow, divergent and edge cases, and leaves clear ones alone", () => {
    expect(triggers([["a", "approve", 3], ["b", "approve", 3], ["c", "reject", 2], ["d", "reject", 2]])).toEqual(["narrow"]);
    expect(triggers([["a", "approve", 30], ["b", "reject", 1], ["c", "reject", 1], ["d", "reject", 1], ["e", "reject", 1]])).toContain("divergence");
    expect(triggers([["a", "approve", 8], ["b", "approve", 1], ["c", "approve", 1]])).toEqual(["edge"]);
    expect(triggers([["a", "approve", 2], ["b", "approve", 2], ["c", "approve", 2]])).toEqual([]);
  });

  it("creates an audit case for picked submissions, none for clear ones or rate 0", () => {
    const narrow: [string, "approve" | "reject", number][] = [["a", "approve", 3], ["b", "approve", 3], ["c", "reject", 2], ["d", "reject", 2]];
    const { t, votes } = resolve(core, narrow);
    const c = auditCase(t, votes, 73 * H, core, mod);
    expect(c).toMatchObject({ status: "pending", triggers: ["narrow"], request: { mode: "audit", reason: "sample", herdVerdict: "approved" } });

    const never = defineConfig({ voting: { minVoters: 2 }, bands: { sampleRate: 0 } });
    const r = resolve(never, narrow);
    expect(auditCase(r.t, r.votes, 73 * H, never, mod)).toBeNull();
    const clear = resolve(core, [["a", "approve", 2], ["b", "approve", 2], ["c", "approve", 2]]);
    expect(auditCase(clear.t, clear.votes, 73 * H, core, mod)).toBeNull();
  });

  it("selects deterministically and spreads over the rate", () => {
    expect(hash01("x")).toBe(hash01("x"));
    const share = Array.from({ length: 2000 }, (_, i) => hash01(`s${i}`)).filter((h) => h < 0.2).length / 2000;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.25);
    expect(defaultModConfig.sampling.seed).toBe("");
  });
});

describe("audit log", () => {
  const request = { mode: "decision" as const, submissionId: "x", subjectId: "p", authorId: "au", reason: "grey_zone" as const, requestedAt: 1, approvalRatio: 0.5, tally: { approveWeight: 1, rejectWeight: 1, totalWeight: 2, approveCount: 1, rejectCount: 1, headCount: 2 } };
  const revised: DecidedCase = {
    id: "x", request, createdAt: 1, status: "decided",
    resolution: { moderatorId: "m2", verdict: "rejected", change: "revised", decidedAt: 30 },
    previous: [{ moderatorId: "m1", verdict: "approved", change: "decided", decidedAt: 10 }],
  };
  const other: DecidedCase = { ...revised, id: "y", resolution: { moderatorId: "m1", verdict: "approved", change: "confirmed", decidedAt: 20 }, previous: [] };

  it("lists every decision oldest first and filters", () => {
    expect(auditEntries([revised, other]).map((e) => [e.caseId, e.moderatorId, e.change])).toEqual([
      ["x", "m1", "decided"], ["y", "m1", "confirmed"], ["x", "m2", "revised"],
    ]);
    expect(auditEntries([revised, other], { moderatorId: "m1" })).toHaveLength(2);
    expect(auditEntries([revised, other], { caseId: "x", since: 20 })).toHaveLength(1);
  });
});
