import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config.js";
import { applyDecision } from "./decision.js";
import { decideByWeight } from "./handler.js";
import { advance, openSubmission } from "./lifecycle.js";
import { auditRequest, reviewRequest, type ReviewRequest } from "./review.js";
import type { Submission, VoteChoice } from "./types.js";

// Contract: the core is complete without quorum-mod. Every review case gets a verdict from the default handler.
const cfg = defaultConfig;
const H = 3_600_000;
const sub = openSubmission({ id: "s", authorId: "au", subjectId: "poi" }, 0, cfg);
const exhausted = { ...sub, extensions: cfg.voting.maxExtensions };
const v = (id: string, choice: VoteChoice, weight = 1) => ({ voterId: id, choice, weight });
const lights = (n: number, choice: VoteChoice) => Array.from({ length: n }, (_, i) => v(`l${i}`, choice));

type Vote = ReturnType<typeof v>;

/** Run the real flow up to the review hand-off. */
function flow(votes: Vote[], start = sub): { req: ReviewRequest; submission: Submission; votes: Vote[] } {
  const t = advance(start, votes, 0, 72 * H, cfg);
  if (t.kind === "review") return { req: reviewRequest(t, 72 * H), submission: t.submission, votes };
  if (t.kind === "resolved") return { req: auditRequest(t, 72 * H), submission: t.submission, votes };
  throw new Error(`unexpected transition ${t.kind}`);
}

const grey = [v("a", "approve", 5), v("b", "reject", 5), v("c", "approve", 0.5), v("d", "reject", 0.5)];
const conflict = [v("t1", "approve", 20), v("t2", "approve", 20), ...lights(5, "reject")];
const clear = [v("a", "approve", 3), v("b", "approve", 3), v("c", "approve", 3)];

const cases = {
  grey_zone: flow(grey),
  weight_conflict: flow(conflict),
  "extension_limit (few votes)": flow([v("a", "approve")], exhausted),
  "extension_limit (no votes)": flow([], exhausted),
  "sample (audit)": flow(clear),
};

describe("core without quorum-mod", () => {
  it.each(Object.entries(cases))("%s gets a verdict from the default handler and settles", async (_name, { req, submission, votes }) => {
    const resolution = await decideByWeight(req);
    expect(resolution).not.toBe("defer");
    if (resolution === "defer") return;
    const result = applyDecision({ submission, votes, decision: resolution, now: 73 * H }, cfg);
    expect(result.submission.status).toBe("resolved");
  });

  it("decides by weight, rejects ties and empty cases", () => {
    expect(decideByWeight(cases.weight_conflict.req)).toEqual({ verdict: "approved" });
    expect(decideByWeight(cases.grey_zone.req)).toEqual({ verdict: "rejected" }); // exact 50/50 tie
    expect(decideByWeight(cases["extension_limit (no votes)"].req)).toEqual({ verdict: "rejected" });
  });

  it("never imports quorum-mod", () => {
    const files = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const f of files) expect(readFileSync(new URL(f, import.meta.url), "utf8")).not.toMatch(/from\s+["']quorum-mod/);
  });
});
