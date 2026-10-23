// Same site, with moderation. Run:  npm run build && npm run bundle && node examples/with-moderation/server.mjs
// Open http://localhost:3000. To see a moderation case: vote as bob (approve), carol (reject) and dave (reject);
// with the author's start weight that is a tie, so after about a minute the case shows up at /mod for mod1 or mod2.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createQuorum } from "quorum-core";
import { createModeration } from "quorum-mod";
import { createSqliteStorage, migrateSqlite } from "quorum-adapters";
import { createRouteHandler, nodeListener } from "quorum-http";

const db = new DatabaseSync(":memory:");
await migrateSqlite(db, { moderation: true }); // also creates the moderation table
const storage = createSqliteStorage(db);

const cookie = (req, name) => req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1] ?? null;
const config = { voting: { windowHours: 0.02, extensionHours: 0.01, minVoters: 3 } };

// Moderator roles are yours: here every user whose name starts with "mod".
const hooks = {
  currentUser: (req) => cookie(req, "user"),
  isModerator: (user) => user.startsWith("mod"),
  countModerators: () => 2,
};

// quorum-mod plugs into the core through three hooks. Leave it out and the core decides by weight on its own.
const mod = createModeration({ storage, hooks, config });
const quorum = createQuorum({
  storage, hooks, config,
  reviewHandler: mod.reviewHandler, // hand review cases to the moderation queue
  onDeferred: mod.onDeferred, //      ... and enqueue them in the same transaction
  onResolved: mod.onResolved, //      ... and pick spot checks among decided submissions
});
setInterval(() => quorum.processDue().catch(console.error), 5000);

const seed = await quorum.submit(new Request("http://localhost/", { headers: { cookie: "user=seed" } }), {
  subjectId: "poi-1",
  payload: { name: "Café Sonnenhof", address: "Hauptstraße 12" },
});

const api = createRouteHandler({ quorum, moderation: mod });
const bundle = readFileSync(new URL("../../packages/ui/dist/quorum-ui.min.js", import.meta.url));
const users = ["alice", "bob", "carol", "dave", "mod1", "mod2"];

function site(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/quorum-ui.min.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(bundle);
  if (url.pathname === "/login") {
    return void res.writeHead(302, { location: url.searchParams.get("next") ?? "/", "set-cookie": `user=${encodeURIComponent(url.searchParams.get("user") ?? "")}; Path=/; SameSite=Lax` }).end();
  }
  const me = /(?:^|; )user=([^;]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "nobody (anonymous)";
  const nav = `<p>Logged in as <b>${me}</b> · ${users.map((u) => `<a href="/login?user=${u}&next=${url.pathname}">${u}</a>`).join(" · ")} · <a href="/">vote</a> · <a href="/mod">moderation</a></p>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  const body = url.pathname === "/mod"
    ? `<quorum-moderation lang="en"></quorum-moderation>
       <script>customElements.whenDefined("quorum-moderation").then(() => {
         document.querySelector("quorum-moderation").subjectRenderer = () => "Café Sonnenhof · Hauptstraße 12";
       });</script>`
    : `<h2>Café Sonnenhof</h2><p>Hauptstraße 12 · newly submitted</p><quorum-vote submission-id="${seed.id}" lang="en"></quorum-vote>`;
  res.end(`<!doctype html><meta charset="utf-8"><title>quorum example</title>
<body style="font-family:system-ui;max-width:34rem;margin:2rem auto;padding:0 1rem">${nav}${body}
<script type="module" src="/quorum-ui.min.js"></script>`);
}

createServer(nodeListener(api, site)).listen(3000, () => console.log("http://localhost:3000"));
