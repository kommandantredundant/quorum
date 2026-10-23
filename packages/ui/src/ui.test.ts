// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  createHttpClient, interimVisible, parseMode, phaseOf, QuorumUiError, register, shares,
  type ModCaseView, type QuorumClient, type SubmissionView,
  type QuorumModerationElement, type QuorumVoteElement,
} from "./index.js";

register();
const HOUR = 3_600_000;
const open: SubmissionView = { submissionId: "s1", status: "open", windowEndsAt: Date.now() + HOUR, approveWeight: 3, rejectWeight: 1, myVote: null, canVote: true };
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

describe("display logic", () => {
  it("shows the interim result according to the mode", () => {
    const now = Date.now();
    const voted = { ...open, myVote: "approve" as const, canVote: false };
    const closed = { ...open, status: "resolved" as const, verdict: "approved" as const };
    expect(interimVisible("always", open, now)).toBe(true);
    expect(interimVisible("after-vote", open, now)).toBe(false);
    expect(interimVisible("after-vote", voted, now)).toBe(true);
    expect(interimVisible("after-vote", closed, now)).toBe(true);
    expect(interimVisible("after-close", voted, now)).toBe(false);
    expect(interimVisible("after-close", open, open.windowEndsAt)).toBe(true);
    expect(parseMode("nonsense")).toBe("after-vote");
    expect(parseMode(null)).toBe("after-vote");
    expect(phaseOf(open, open.windowEndsAt)).toBe("awaiting");
  });

  it("rounds shares to 100 and handles no votes", () => {
    expect(shares(1, 2)).toEqual({ yes: 33, no: 67 });
    expect(shares(0, 0)).toBeNull();
  });
});

describe("<quorum-vote>", () => {
  function fakeClient() {
    let view = { ...open };
    const calls: string[] = [];
    const client: QuorumClient = {
      getSubmission: async () => ({ ...view }),
      vote: async (_id, choice) => { calls.push(choice); view = { ...view, myVote: choice, canVote: false }; },
    };
    return { client, calls };
  }
  const mount = async (client: QuorumClient, attrs: Record<string, string> = {}) => {
    const el = document.createElement("quorum-vote") as QuorumVoteElement;
    el.setAttribute("submission-id", "s1");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.client = client;
    document.body.append(el);
    await settle();
    return el;
  };

  it("hides the interim result until the visitor voted, then shows it", async () => {
    const { client, calls } = fakeClient();
    const el = await mount(client, { lang: "en" });
    const root = el.shadowRoot!;
    expect(root.querySelector(".bar")).toBeNull();
    expect(root.textContent).toContain("shown after you have voted");

    (root.querySelector("button.approve") as HTMLButtonElement).click();
    await settle();
    expect(calls).toEqual(["approve"]);
    expect(root.querySelector(".bar")).not.toBeNull();
    expect(root.querySelector(".bar")!.getAttribute("aria-label")).toBe("Approval 75 %, rejection 25 %");
    expect(root.textContent).toContain("You approved this.");
    expect(root.querySelector("button.approve")).toBeNull();
    el.remove();
  });

  it("shows the bar right away with show-interim=always and uses German labels", async () => {
    const { client } = fakeClient();
    const el = await mount(client, { "show-interim": "always", lang: "de" });
    expect(el.shadowRoot!.querySelector(".bar")).not.toBeNull();
    expect(el.shadowRoot!.textContent).toContain("Zustimmen");
    el.remove();
  });

  it("reports errors from the server", async () => {
    const client: QuorumClient = { getSubmission: async () => { throw new QuorumUiError("forbidden", "Not allowed"); }, vote: async () => {} };
    const el = await mount(client);
    expect(el.shadowRoot!.querySelector(".error")?.textContent).toBe("Not allowed");
    el.remove();
  });
});

describe("<quorum-moderation>", () => {
  const cases: ModCaseView[] = [
    { id: "a", mode: "decision", reason: "grey_zone", requestedAt: 1, approvalRatio: 0.5 },
    { id: "b", mode: "audit", reason: "sample", requestedAt: 2, approvalRatio: 0.6, herdVerdict: "approved" },
  ];

  it("lists cases, decides one and removes it; subject text is never parsed as HTML", async () => {
    const decided: string[] = [];
    const client: QuorumClient = {
      getSubmission: async () => open, vote: async () => {},
      getQueue: async () => cases,
      decide: async (id, verdict) => { decided.push(`${id}:${verdict}`); },
    };
    const el = document.createElement("quorum-moderation") as QuorumModerationElement;
    el.setAttribute("lang", "en");
    el.client = client;
    el.subjectRenderer = (c) => `<img src=x onerror=alert('${c.id}')>`;
    document.body.append(el);
    await settle();
    const root = el.shadowRoot!;
    expect(root.querySelectorAll("li.case")).toHaveLength(2);
    expect(root.querySelector("li.case img")).toBeNull();
    expect(root.textContent).toContain("<img src=x");

    (root.querySelector("li.case button.approve") as HTMLButtonElement).click();
    await settle();
    expect(decided).toEqual(["a:approved"]);
    expect(root.querySelectorAll("li.case")).toHaveLength(1);
    el.remove();
  });
});

describe("createHttpClient", () => {
  it("calls the documented routes and maps errors", async () => {
    const seen: string[] = [];
    const fetchStub = (async (url: string, init: RequestInit) => {
      seen.push(`${init.method} ${url} ${init.body ?? ""}`);
      if (url.endsWith("/vote") && init.method === "POST" && String(init.body).includes("reject")) {
        return new Response(JSON.stringify({ code: "conflict", message: "You already voted" }), { status: 409 });
      }
      return url.endsWith("/vote") ? new Response(null, { status: 204 }) : new Response(JSON.stringify(open), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createHttpClient({ baseUrl: "/q/", fetch: fetchStub });
    await client.getSubmission("a b");
    await client.vote("a b", "approve");
    await expect(client.vote("x", "reject")).rejects.toMatchObject({ code: "conflict", message: "You already voted", status: 409 });
    expect(seen).toEqual(['GET /q/submissions/a%20b ', 'POST /q/submissions/a%20b/vote {"choice":"approve"}', 'POST /q/submissions/x/vote {"choice":"reject"}']);
  });
});
