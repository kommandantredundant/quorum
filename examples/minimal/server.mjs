// Minimal site with quorum, no moderation. Run:  npm run build && npm run bundle && node examples/minimal/server.mjs
// Then open http://localhost:3000 and log in as different demo users to vote.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createQuorum } from "quorum-core";
import { createSqliteStorage, migrateSqlite } from "quorum-adapters";
import { createRouteHandler, nodeListener } from "quorum-http";

// 1. Storage: your own database. In-memory here; pass a file path in real life.
const db = new DatabaseSync(":memory:");
await migrateSqlite(db);
const storage = createSqliteStorage(db);

// 2. Identity: your own session. Here a demo cookie "user=alice". The client never sends a user ID.
const cookie = (req, name) => req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1] ?? null;
const hooks = { currentUser: (req) => cookie(req, "user") };

// 3. The module. Short windows so the demo finishes within about a minute.
const quorum = createQuorum({ storage, hooks, config: { voting: { windowHours: 0.02, extensionHours: 0.01, minVoters: 2 } } });

// 4. Results are processed lazily when a page is read, and by this timer (use a cron job in real life).
setInterval(() => quorum.processDue().catch(console.error), 5000);

// Seed one submission so there is something to vote on.
const seed = await quorum.submit(new Request("http://localhost/", { headers: { cookie: "user=seed" } }), {
  subjectId: "poi-1",
  payload: { name: "Café Sonnenhof" },
});

// 5. Routes for the quorum-ui components, mounted at /api/quorum. Everything else is your own site.
const api = createRouteHandler({ quorum });
const bundle = readFileSync(new URL("../../packages/ui/dist/quorum-ui.min.js", import.meta.url));
const users = ["alice", "bob", "carol", "dave"];

function site(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/quorum-ui.min.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(bundle);
  if (url.pathname === "/login") {
    return void res.writeHead(302, { location: "/", "set-cookie": `user=${encodeURIComponent(url.searchParams.get("user") ?? "")}; Path=/; SameSite=Lax` }).end();
  }
  const me = /(?:^|; )user=([^;]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "nobody (anonymous)";
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>quorum example</title>
<body style="font-family:system-ui;max-width:34rem;margin:2rem auto;padding:0 1rem">
<p>Logged in as <b>${me}</b> · ${users.map((u) => `<a href="/login?user=${u}">${u}</a>`).join(" · ")}</p>
<h2>Café Sonnenhof</h2><p>Hauptstraße 12 · newly submitted</p>
<quorum-vote submission-id="${seed.id}" lang="en"></quorum-vote>
<p><small>Reload after about 70 seconds to see the decided result.</small></p>
<script type="module" src="/quorum-ui.min.js"></script>`);
}

createServer(nodeListener(api, site)).listen(3000, () => console.log("http://localhost:3000"));
