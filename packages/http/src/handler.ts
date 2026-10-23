import { QuorumError } from "quorum-core";

/**
 * The routes quorum-ui talks to, on web-standard Request/Response (Node 18+, Deno, Bun,
 * Cloudflare, Next.js route handlers, Hono, ...). Identity always comes from the host's own
 * session through `quorum`'s `currentUser` hook; nothing the client sends is trusted for that.
 *
 *   GET  {base}/submissions/:id            -> SubmissionView
 *   POST {base}/submissions                {subjectId, payload?} -> 201 {submissionId}
 *   POST {base}/submissions/:id/vote       {choice}   -> 204
 *   GET  {base}/mod/queue                  -> ModCaseView[]          (only if `moderation` is given)
 *   POST {base}/mod/cases/:id/decision     {verdict}  -> 204         (only if `moderation` is given)
 *
 * Errors are `{ code, message }` with 400/401/403/404/409; anything unexpected is a plain 500.
 */

export interface QuorumApi<Ctx> {
  getView(ctx: Ctx, id: string): Promise<object>;
  vote(ctx: Ctx, id: string, choice: "approve" | "reject"): Promise<void>;
  submit(ctx: Ctx, input: { subjectId: string; payload?: unknown }): Promise<{ id: string }>;
}

export interface ModerationApi<Ctx> {
  queueView(ctx: Ctx): Promise<object[]>;
  decide(ctx: Ctx, id: string, verdict: "approved" | "rejected"): Promise<unknown>;
}

export interface RouteHandlerOptions<Ctx> {
  quorum: QuorumApi<Ctx>;
  moderation?: ModerationApi<Ctx>;
  /** Default "/api/quorum". */
  basePath?: string;
  /** What `currentUser(ctx)` receives. Default: the Request itself (so it can read cookies or headers). */
  context?: (req: Request) => Ctx | Promise<Ctx>;
  /** Called for every POST. Return false to reject (403), e.g. to check a CSRF token or the Origin header. */
  csrfCheck?: (req: Request) => boolean | Promise<boolean>;
  /** Largest accepted request body. Default 64 KB. */
  maxBodyBytes?: number;
  /** Unexpected errors (the client only sees a generic 500). */
  onError?: (error: unknown, req: Request) => void;
}

const STATUS: Record<string, number> = { unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409, closed: 409, invalid: 400 };

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const noContent = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

/** QuorumError and ModerationError carry a code; DecisionError means "not in a state that allows this". */
function codeOf(e: unknown): string | null {
  if (e instanceof QuorumError) return e.code;
  if (!(e instanceof Error)) return null;
  const code = (e as unknown as { code?: unknown }).code;
  if (typeof code === "string") return code;
  return e.name === "DecisionError" ? "conflict" : null;
}

function errorResponse(e: unknown, req: Request, onError?: RouteHandlerOptions<never>["onError"]): Response {
  const code = codeOf(e);
  if (code && STATUS[code] && e instanceof Error) return json(STATUS[code], { code, message: e.message });
  onError?.(e, req);
  return json(500, { code: "error", message: "Internal error" });
}

async function readJson(req: Request, max: number): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > max) throw new QuorumError("invalid", "Request body too large");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new QuorumError("invalid", "Body must be JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new QuorumError("invalid", "Body must be a JSON object");
  return value as Record<string, unknown>;
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    throw new QuorumError("invalid", "Bad ID in URL");
  }
}

/** Returns a handler for `Request` that answers with a `Response`, or `null` for URLs outside `basePath` (so the host can keep routing). */
export function createRouteHandler<Ctx = Request>(options: RouteHandlerOptions<Ctx>): (req: Request) => Promise<Response | null> {
  const base = (options.basePath ?? "/api/quorum").replace(/\/+$/, "");
  const max = options.maxBodyBytes ?? 64 * 1024;

  return async (req) => {
    const url = new URL(req.url);
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return null;
    const parts = url.pathname.slice(base.length).split("/").filter(Boolean); // e.g. ["submissions", ":id", "vote"]
    const method = req.method.toUpperCase();

    try {
      if (method === "POST" && options.csrfCheck && !(await options.csrfCheck(req))) throw new QuorumError("forbidden", "Request rejected");
      const ctx = (options.context ? await options.context(req) : req) as Ctx;
      const [a, b, c] = parts;

      if (a === "submissions") {
        if (method === "GET" && parts.length === 2) return json(200, await options.quorum.getView(ctx, decode(b!)));
        if (method === "POST" && parts.length === 1) {
          const body = await readJson(req, max);
          const s = await options.quorum.submit(ctx, { subjectId: String(body.subjectId ?? ""), ...(body.payload !== undefined && { payload: body.payload }) });
          return json(201, { submissionId: s.id });
        }
        if (method === "POST" && parts.length === 3 && c === "vote") {
          const body = await readJson(req, max);
          await options.quorum.vote(ctx, decode(b!), body.choice as "approve" | "reject");
          return noContent();
        }
      }
      if (a === "mod" && options.moderation) {
        if (method === "GET" && b === "queue" && parts.length === 2) return json(200, await options.moderation.queueView(ctx));
        if (method === "POST" && b === "cases" && parts.length === 4 && parts[3] === "decision") {
          const body = await readJson(req, max);
          await options.moderation.decide(ctx, decode(c!), body.verdict as "approved" | "rejected");
          return noContent();
        }
      }
      return json(404, { code: "not_found", message: "Unknown route" });
    } catch (e) {
      return errorResponse(e, req, options.onError);
    }
  };
}
