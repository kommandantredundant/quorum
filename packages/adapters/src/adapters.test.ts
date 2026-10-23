import { PGlite } from "@electric-sql/pglite";
import { createQuorum, QuorumError, type ReviewHandler } from "quorum-core";
import { createModeration, ModerationError } from "quorum-mod";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createPostgresStorage, createSqliteStorage, migratePostgres, migrateSqlite, type PgPoolLike } from "./index.js";
import type { SqlStorage } from "./sql-storage.js";

// Vite cannot resolve the "node:sqlite" built-in in imports, so load it through require.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

// The same end-to-end suite runs against real SQLite and real Postgres (PGlite), so the shared SQL is proven on both.

/** PGlite is one connection: serialise "connections" like a pool of size 1 would. */
function pgliteAsPool(db: PGlite): PgPoolLike {
  let chain: Promise<void> = Promise.resolve();
  const turn = <T>(task: () => Promise<T>): Promise<T> => {
    const r = chain.then(task, task);
    chain = r.then(() => undefined, () => undefined);
    return r;
  };
  return {
    query: (text, values) => turn(() => db.query(text, values) as never),
    connect: async () => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      await new Promise<void>((ready) => void turn(() => (ready(), held)));
      return { query: (text, values) => db.query(text, values) as never, release };
    },
  };
}

const backends: [string, () => Promise<SqlStorage>][] = [
  ["sqlite", async () => {
    const db = new DatabaseSync(":memory:");
    await migrateSqlite(db, { moderation: true });
    return createSqliteStorage(db);
  }],
  ["postgres", async () => {
    const pool = pgliteAsPool(new PGlite());
    await migratePostgres(pool, { moderation: true });
    return createPostgresStorage(pool);
  }],
];

type Ctx = { user: string | null };
const H = 3_600_000;

async function setup(make: () => Promise<SqlStorage>, withMod = false) {
  const storage = await make();
  let t = 0;
  const hooks = { currentUser: (c: Ctx) => c.user, isModerator: (u: string) => u.startsWith("mod"), countModerators: () => 2 };
  const mod = createModeration({ storage, hooks, now: () => t });
  const quorum = createQuorum({
    storage, hooks, now: () => t,
    ...(withMod && { reviewHandler: mod.reviewHandler as ReviewHandler, onDeferred: mod.onDeferred, onResolved: mod.onResolved }),
  });
  return { storage, quorum, mod, as: (user: string | null): Ctx => ({ user }), at: (hours: number) => (t = hours * H) };
}

describe.each(backends)("%s", (_name, make) => {
  it("runs the full flow and books reputation", async () => {
    const { storage, quorum, as, at } = await setup(make);
    const s = await quorum.submit(as("au"), { subjectId: "poi-1", payload: { name: "Cafe" } });
    for (const [u, c] of [["a", "approve"], ["b", "approve"], ["c", "approve"], ["d", "reject"]] as const) await quorum.vote(as(u), s.id, c);

    const interim = await quorum.getInterimResult(s.id);
    expect(interim).toMatchObject({ status: "open", approveWeight: 4, rejectWeight: 1 }); // author start weight 1 + a,b,c
    expect(Object.keys(interim).sort()).toEqual(["approveWeight", "rejectWeight", "status", "submissionId", "windowEndsAt"]);

    at(72);
    expect((await quorum.processDue()).processed).toBe(1);
    expect(await quorum.getInterimResult(s.id)).toMatchObject({ status: "resolved", verdict: "approved" });
    expect(await storage.getSubmission(s.id)).toMatchObject({ submission: { payload: { name: "Cafe" } } });
    expect((await storage.getReputation("au"))?.value).toBe(1);
    expect((await storage.getReputation("a"))?.value).toBe(1);
    expect((await storage.getReputation("d"))?.value).toBe(-1.5);
  });

  it("enforces identity, one vote, no self-vote and the window on the server", async () => {
    const { quorum, as, at } = await setup(make);
    const s = await quorum.submit(as("au"), { subjectId: "p" });
    const code = (p: Promise<unknown>) => p.then(() => "ok", (e: QuorumError) => e.code);
    expect(await code(quorum.vote(as(null), s.id, "approve"))).toBe("unauthenticated");
    expect(await code(quorum.vote(as("au"), s.id, "approve"))).toBe("forbidden");
    expect(await code(quorum.vote(as("a"), s.id, "approve"))).toBe("ok");
    expect(await code(quorum.vote(as("a"), s.id, "reject"))).toBe("conflict");
    expect(await code(quorum.vote(as("a"), "nope", "reject"))).toBe("not_found");
    at(72);
    expect(await code(quorum.vote(as("b"), s.id, "approve"))).toBe("closed");
  });

  it("getView reflects the visitor: anonymous, author, voter before and after voting", async () => {
    const { quorum, as } = await setup(make);
    const s = await quorum.submit(as("au"), { subjectId: "p" });
    expect(await quorum.getView(as(null), s.id)).toMatchObject({ myVote: null, canVote: false });
    expect(await quorum.getView(as("au"), s.id)).toMatchObject({ myVote: null, canVote: false });
    expect(await quorum.getView(as("a"), s.id)).toMatchObject({ myVote: null, canVote: true });
    await quorum.vote(as("a"), s.id, "reject");
    expect(await quorum.getView(as("a"), s.id)).toMatchObject({ myVote: "reject", canVote: false });
    expect(await quorum.getView(as("b"), s.id)).toMatchObject({ myVote: null, canVote: true });
  });

  it("books a decision only once when processed concurrently", async () => {
    const { storage, quorum, as, at } = await setup(make);
    const s = await quorum.submit(as("au"), { subjectId: "p" });
    for (const u of ["a", "b", "c"]) await quorum.vote(as(u), s.id, "approve");
    at(72);
    const results = await Promise.all([quorum.processSubmission(s.id), quorum.processSubmission(s.id)]);
    expect(results.sort()).toEqual(["resolved", "skipped"]);
    expect((await storage.getReputation("a"))?.value).toBe(1);
  });

  it("moderation: defers a grey-zone case, a moderator decides it, reputation follows", async () => {
    const { storage, quorum, mod, as, at } = await setup(make, true);
    const s = await quorum.submit(as("au"), { subjectId: "p" });
    await quorum.vote(as("a"), s.id, "approve");
    await quorum.vote(as("b"), s.id, "reject");
    await quorum.vote(as("c"), s.id, "reject"); // author weight 1 + a = 2 vs 2 -> grey zone
    at(72);
    expect(await quorum.processSubmission(s.id)).toBe("deferred");
    expect((await storage.getSubmission(s.id))?.submission.status).toBe("needs_review");

    expect(await mod.queue(as("mod1"))).toHaveLength(1);
    await expect(mod.decide(as("a"), s.id, "approved")).rejects.toMatchObject({ code: "forbidden" });
    const r = await mod.decide(as("mod1"), s.id, "approved");
    expect(r.change).toBe("decided");
    expect((await storage.getSubmission(s.id))?.submission).toMatchObject({ status: "resolved", outcome: { verdict: "approved", decidedBy: "review" } });
    expect((await storage.getReputation("a"))?.value).toBe(1);
    expect((await storage.getReputation("b"))?.value).toBe(-1.5);
    expect(await mod.queue(as("mod1"))).toHaveLength(0);

    // later intervention flips it back: revised, undo and redo
    const back = await mod.decide(as("mod2"), s.id, "rejected");
    expect(back.change).toBe("revised");
    expect((await storage.getReputation("b"))?.value).toBe(1);
    await expect(mod.decide(as("mod2"), "nope", "rejected")).rejects.toBeInstanceOf(QuorumError);
    expect(ModerationError).toBeDefined();
  });
});
