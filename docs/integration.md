# Integration

## Architecture

There is no central service. Everything runs in your backend, against your database:

```
browser                     your backend                               your database
<quorum-vote>  ──fetch──▶  createRouteHandler ─▶ createQuorum ─▶ storage adapter ─▶ SQLite / Postgres
<quorum-moderation>                                   └─ createModeration (optional)
```

| Package | Role |
| --- | --- |
| `quorum-core` | The logic and the orchestration (`createQuorum`). Pure functions, no I/O of its own. |
| `quorum-mod` | Optional moderation. The core never imports it. |
| `quorum-adapters` | SQL storage for SQLite and Postgres, plus the schema. |
| `quorum-http` | Route handler on web-standard `Request`/`Response`, and a Node adapter. |
| `quorum-ui` | The web components. No runtime dependencies. |

## Identity and the trust boundary

Rules the module enforces, and what remains your job:

- **Identity comes only from your session.** `currentUser(ctx)` is the single source. No method
  accepts a user ID from the client. By default `ctx` is the `Request`, so you can read cookies or
  headers; set `context` on `createRouteHandler` to pass something else.
- **Weights are computed on the server** from stored reputation. The browser cannot send a weight.
- **Checked on every call:** one vote per member, the author cannot vote, the window must be open.
- **Public data is limited:** the view contains weights only, never head counts or voters. The
  moderation view contains no votes, voters or authors.
- **Your job:** CSRF protection for the POST routes (`csrfCheck`), rate limits, and an account hurdle,
  see [Protecting against abuse](#protecting-against-abuse).

Errors carry a `code`: `unauthenticated` (401), `forbidden` (403), `not_found` (404), `conflict` and
`closed` (409), `invalid` (400). Unexpected errors become a plain 500; pass `onError` to log them.

## Storage

Adapters implement `CoreStorage` (and `ModStorage` for moderation) on one object, so a moderator
decision and its reputation changes are written in one transaction.

- **SQLite:** `createSqliteStorage(db)` takes a `node:sqlite` `DatabaseSync` or a `better-sqlite3` database.
- **Postgres:** `createPostgresStorage(pool)` takes a `pg` Pool (anything with `query` and `connect`).
- **Schema:** `migrateSqlite` / `migratePostgres` create the tables (`quorum_submissions`,
  `quorum_votes`, `quorum_reputation`, and with `{ moderation: true }` also `quorum_mod_cases`).
  They are idempotent. `schemaSql()` returns the same statements as a script for your own migrations.
  A site without moderation never gets the moderation table.
- **Other databases:** implement the interfaces in `storage.ts`. Two requirements matter:
  `updateSubmission` / `updateCase` must be *conditional* writes that report whether they matched,
  and `transaction` must be atomic. That is what makes it safe to run several servers at once.

## Processing results

A result is decided when the window ends. Two triggers, both safe to combine and safe on several
servers (a decision is booked exactly once):

- **Lazy:** reading a submission through `getView` or `getInterimResult` advances it if its window ended.
- **Periodic:** `await quorum.processDue()` handles everything whose window ended. Call it from a
  timer or cron job. It returns how many it processed and which failed.

## Routes

`createRouteHandler({ quorum, moderation? })` serves these (default base `/api/quorum`, change with
`basePath`). `quorum-ui` talks exactly to them.

| Route | Purpose |
| --- | --- |
| `GET /submissions/:id` | The view for the current visitor: status, window end, weights, own vote, whether voting is possible. |
| `POST /submissions` | Create a submission (`{ subjectId, payload? }`), answers `201 { submissionId }`. |
| `POST /submissions/:id/vote` | `{ choice: "approve" \| "reject" }`, answers 204. |
| `GET /mod/queue` | Open cases for the current moderator. Only with `moderation`. |
| `POST /mod/cases/:id/decision` | `{ verdict: "approved" \| "rejected" }`, answers 204. Decides a pending case or revises a decided one. |

The handler returns `null` for URLs outside its base so you can keep routing. Examples:

```js
// Node http
createServer(nodeListener(api, yourSite));

// Express (app.all keeps the full URL, unlike app.use with a mount path)
app.all("/api/quorum/*", nodeListener(api));

// Next.js route handler: app/api/quorum/[...path]/route.ts
const handle = async (req: Request) => (await api(req)) ?? new Response("Not found", { status: 404 });
export { handle as GET, handle as POST };

// Hono
app.all("/api/quorum/*", async (c) => (await api(c.req.raw)) ?? c.notFound());
```

You can also skip the handler and call `quorum.getView`, `quorum.vote`, `quorum.submit` and
`mod.queueView`, `mod.decide` from your own routes; they take the same `ctx` that `currentUser` receives.

## Showing the interim result

Whether visitors see the interim result immediately or only after voting is a **display** setting of
`<quorum-vote>` (`show-interim`, default `after-vote`). It is not a secret: anyone can still request
the route directly. Early visibility matters because a visitor who sees the leading side before
voting can copy it. In the simulation, such followers earned about 2.3 times as much reputation per
vote as people who judge independently.

If you must hold it back on the server as well, wrap `getView`:

```js
const guarded = {
  ...quorum,
  async getView(ctx, id) {
    const v = await quorum.getView(ctx, id);
    return v.myVote || v.status !== "open" ? v : { ...v, approveWeight: 0, rejectWeight: 0 };
  },
};
const api = createRouteHandler({ quorum: guarded });
```

## Protecting against abuse

The module cannot tell a real person from a fake account. In the simulation, ten fresh fake
accounts got practically every submission of their operator approved, in every parameter variant.
Protection has to come from you:

- a hurdle at sign-up (verified e-mail, invitation, membership, a waiting period),
- rate limits on the routes,
- moderators (without them about a quarter of bad submissions were approved even in an honest
  community, with them about a tenth),
- `sampling.seed` set to a private value (see [configuration.md](configuration.md)).

## Moderation in your site

- Roles are yours: `isModerator(userId)` and `countModerators()`.
- Show `<quorum-moderation>` only to moderators. The queue route answers 403 for everyone else
  anyway.
- Moderators who have a conflict of interest simply do not see that case, and cannot decide it
  by calling the route directly.
- `auditEntries(cases)` (from `quorum-mod`) turns the stored cases into a log of every decision.

## Data and privacy

Reputation is stored per user ID of your site, together with all votes. The module has no function
to delete a member yet: to remove one, delete or anonymise their rows by user ID in
`quorum_votes`, `quorum_reputation` and `author_id` in `quorum_submissions`. Past decisions stay as
they are.
