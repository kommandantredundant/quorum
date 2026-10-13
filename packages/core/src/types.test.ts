import { describe, expect, expectTypeOf, it } from "vitest";
import { REVIEW_REASONS, type Outcome, type ReviewReason, type Submission } from "./types.js";

const base = { id: "s1", authorId: "u1", subjectId: "poi1", createdAt: 0, windowEndsAt: 1, extensions: 0 };

describe("types", () => {
  it("narrows Submission by status", () => {
    const s: Submission = { ...base, status: "resolved", outcome: { verdict: "approved", decidedBy: "weight", approvalRatio: 0.8, totalWeight: 10, resolvedAt: 2 } };
    if (s.status === "resolved") {
      expectTypeOf(s.outcome).toEqualTypeOf<Outcome>();
      expect(s.outcome.verdict).toBe("approved");
    }
  });

  it("requires a reason for needs_review and an outcome for resolved", () => {
    // @ts-expect-error needs_review without reason
    const a: Submission = { ...base, status: "needs_review" };
    // @ts-expect-error resolved without outcome
    const b: Submission = { ...base, status: "resolved" };
    expect([a, b]).toHaveLength(2);
  });

  it("derives ReviewReason from the runtime list", () => {
    expectTypeOf<ReviewReason>().toEqualTypeOf<"grey_zone" | "weight_conflict" | "sample" | "extension_limit">();
    expect(REVIEW_REASONS).toHaveLength(4);
  });
});
