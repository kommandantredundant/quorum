# Getting started

This gets a vote box and, optionally, a moderation queue into your own site. You need:

- a backend you control (Node 20+ in the examples; the core itself is plain TypeScript),
- a SQL database (SQLite or Postgres; others work through the storage interface),
- your own login, so the module knows who is calling.

There is no central service: everything runs inside your backend and your database.

> **Install:** the packages are on npm (version 0.1.0):
> `npm install quorum-core quorum-mod quorum-adapters quorum-http quorum-ui` (take only what you
> need; `quorum-mod` is optional). The two runnable examples below use the workspace packages of
> this repository instead.

## The five steps

The complete file is [`examples/minimal/server.mjs`](../examples/minimal/server.mjs). In short:

**1. Storage.** Create the tables and wrap your database.

```js
import { DatabaseSync } from "node:sqlite";
import { createSqliteStorage, migrateSqlite } from "quorum-adapters";

const db = new DatabaseSync("quorum.db");
await migrateSqlite(db);               // idempotent, safe on every start
const storage = createSqliteStorage(db);
```

Postgres: `createPostgresStorage(pool)` and `migratePostgres(pool)` with a `pg` Pool. If you run your
own migrations, `schemaSql()` returns the schema as one script.

**2. Identity.** Tell the module who the current user is, from your own session.

```js
const hooks = { currentUser: (req) => mySession(req)?.userId ?? null };
```

The user never comes from anything the browser sends in the request body.

**3. The module.**

```js
import { createQuorum } from "quorum-core";

const quorum = createQuorum({ storage, hooks });   // defaults, see configuration.md
```

**4. Routes.** The UI components talk to four routes. `createRouteHandler` serves them on web-standard
`Request`/`Response`; `nodeListener` connects it to Node's `http` server or Express.

```js
import { createRouteHandler, nodeListener } from "quorum-http";

const api = createRouteHandler({ quorum });        // mounted at /api/quorum
createServer(nodeListener(api, yourOwnSite)).listen(3000);
```

Anything the handler does not own (it returns `null`) goes to your site. Frameworks that use
`Request`/`Response` directly (Next.js route handlers, Hono, Deno, Bun, Cloudflare) can call the
handler as it is, see [integration.md](integration.md).

**5. The page.** Load the single-file UI bundle and place the component where the submission is shown.

```html
<script type="module" src="/quorum-ui.min.js"></script>
<quorum-vote submission-id="…" lang="en"></quorum-vote>
```

Build the bundle with `npm run bundle`. To create a submission from your own code:
`await quorum.submit(request, { subjectId: "poi-42", payload: { … } })`.

Results are decided when the voting window ends. This happens lazily whenever the submission is read,
and you should additionally call `quorum.processDue()` from a timer or cron job.

## With moderation

Moderation is a separate, optional package. Leave it out and the core decides by weight on its own.
With it, add a role check and wire three hooks (full file:
[`examples/with-moderation/server.mjs`](../examples/with-moderation/server.mjs)):

```js
import { createModeration } from "quorum-mod";

await migrateSqlite(db, { moderation: true });     // also creates the moderation table
const hooks = {
  currentUser: (req) => …,
  isModerator: (userId) => …,                      // your roles
  countModerators: () => …,                        // drives the conflict-of-interest rules
};
const mod = createModeration({ storage, hooks });
const quorum = createQuorum({
  storage, hooks,
  reviewHandler: mod.reviewHandler,                // review cases go to the queue
  onDeferred: mod.onDeferred,
  onResolved: mod.onResolved,                      // spot checks
});
const api = createRouteHandler({ quorum, moderation: mod });
```

On a page for moderators: `<quorum-moderation></quorum-moderation>`.

## Try it

```sh
npm install
npm run build && npm run bundle
npm run example:minimal          # or: npm run example:moderation
```

Open http://localhost:3000 and switch between the demo users. The windows are shortened to about a
minute so you can see a result quickly. The moderation example explains in its first lines how to
produce a case for the moderators.

![Vote box before voting](screenshots/01-vote-before.png)

## Next

- [How it works](concepts.md): weights, windows, bands, reputation, moderation.
- [Configuration](configuration.md): every parameter with its default.
- [Integration](integration.md): trust boundary, storage, routes, interim result, abuse protection.
- [UI components](ui.md): attributes, events, theming.
