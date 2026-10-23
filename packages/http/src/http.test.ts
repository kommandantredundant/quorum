import { createQuorum } from "quorum-core";
import { createModeration } from "quorum-mod";
import { createSqliteStorage, migrateSqlite } from "quorum-adapters";
import { createHttpClient } from "quorum-ui/client";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createRouteHandler } from "./handler.js";

// Contract test: the real quorum-ui HTTP client talks to the real route handler, on a real SQLite database.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const H = 3_600_000;

async function setup(options: { csrf?: boolean } = {}) {
  const db = new DatabaseSync(":memory:");
  await migrateSqlite(db, { moderation: true });
  const storage = createSqliteStorage(db);
  let t = 0;
  const hooks = {
    currentUser: (req: Request) => req.headers.get("x-user"),
    isModerator: (u: string) => u.startsWith("mod"),
    countModerators: () => 2,
  };
  const mod = createModeration({ storage, hooks, now: () => t });
  const quorum = createQuorum({ storage, hooks, now: () => t, reviewHandler: mod.reviewHandler, onDeferred: mod.onDeferred, onResolved: mod.onResolved });
  const handler = createRouteHandler({
    quorum, moderation: mod,
    ...(options.csrf && { csrfCheck: (req: Request) => req.headers.get("x-csrf") === "ok" }),
  });
  /** A fetch that goes straight into the handler, acting as `user`. */
  const fetchAs = (user: string | null): typeof fetch =>
    (async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      if (user) headers.set("x-user", user);
      headers.set("x-csrf", "ok");
      return (await handler(new Request(new URL(url, "http://site.test"), { ...init, headers }))) ?? new Response("outside", { status: 404 });
    }) as unknown as typeof fetch;
  const client = (user: string | null) => createHttpClient({ fetch: fetchAs(user) });
  const submit = async (user: string) => {
    const res = await fetchAs(user)("/api/quorum/submissions", { method: "POST", body: JSON.stringify({ subjectId: "poi-1", payload: { name: "Cafe" } }) });
    return ((await res.json()) as { submissionId: string }).submissionId;
  };
  return { handler, quorum, client, submit, at: (hours: number) => (t = hours * H) };
}

describe("quorum-http with quorum-ui client", () => {
  it("serves the view, takes votes and maps errors to codes", async () => {
    const { client, submit } = await setup();
    const id = await submit("au");

    expect(await client("bob").getSubmission(id)).toMatchObject({ status: "open", myVote: null, canVote: true });
    expect(await client(null).getSubmission(id)).toMatchObject({ canVote: false });
    await client("bob").vote(id, "approve");
    expect(await client("bob").getSubmission(id)).toMatchObject({ myVote: "approve", canVote: false });

    await expect(client("bob").vote(id, "reject")).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(client("au").vote(id, "approve")).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(client(null).vote(id, "approve")).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
    await expect(client("bob").getSubmission("nope")).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(client("carl").vote(id, "maybe" as never)).rejects.toMatchObject({ code: "invalid", status: 400 });
  });

  it("runs the moderation flow end to end", async () => {
    const { client, submit, quorum, at } = await setup();
    const id = await submit("au");
    await client("a").vote(id, "approve");
    await client("b").vote(id, "reject");
    await client("c").vote(id, "reject"); // author weight 1 + a = 2 vs 2: grey zone
    at(72);
    expect(await quorum.processSubmission(id)).toBe("deferred");

    await expect(client("a").getQueue!()).rejects.toMatchObject({ code: "forbidden" });
    const queue = await client("mod1").getQueue!();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id, mode: "decision", reason: "grey_zone" });
    expect(JSON.stringify(queue)).not.toMatch(/"au"|voter|authorId/); // no author or voters leak into the moderation view

    await client("mod1").decide!(id, "approved");
    expect(await client("mod1").getQueue!()).toHaveLength(0);
    expect(await client("a").getSubmission(id)).toMatchObject({ status: "resolved", verdict: "approved" });
    await expect(client("mod2").decide!(id, "rejected")).resolves.toBeUndefined(); // later intervention (revise)
    expect(await client("a").getSubmission(id)).toMatchObject({ verdict: "rejected" });
  });

  it("rejects POSTs that fail the CSRF check, ignores foreign URLs and bad bodies", async () => {
    const { handler } = await setup({ csrf: true });
    const post = (headers: Record<string, string>, body: string) =>
      handler(new Request("http://site.test/api/quorum/submissions", { method: "POST", headers: { "x-user": "au", ...headers }, body }));
    expect((await post({}, "{}"))!.status).toBe(403);
    expect((await post({ "x-csrf": "ok" }, "not json"))!.status).toBe(400);
    expect((await post({ "x-csrf": "ok" }, JSON.stringify({ subjectId: "x".repeat(70_000) })))!.status).toBe(400);
    expect(await handler(new Request("http://site.test/somewhere/else"))).toBeNull();
    expect((await handler(new Request("http://site.test/api/quorum/unknown")))!.status).toBe(404);
  });
});
