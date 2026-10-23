import type { ModCaseView, QuorumClient, SubmissionView, Verdict, VoteChoice } from "./types.js";

export class QuorumUiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "QuorumUiError";
  }
}

export interface HttpClientOptions {
  /** Where the host mounted the routes. Default "/api/quorum". */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Extra headers, e.g. a CSRF token. */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Default "same-origin": the host's session cookie identifies the user. */
  credentials?: RequestCredentials;
}

const codeFromStatus = (s: number): string =>
  s === 401 ? "unauthenticated" : s === 403 ? "forbidden" : s === 404 ? "not_found" : s === 409 ? "conflict" : s === 400 ? "invalid" : "error";

/**
 * Route contract the host implements (JSON in/out; errors as `{ code, message }` with a 4xx status):
 *   GET  {base}/submissions/:id             -> SubmissionView
 *   POST {base}/submissions/:id/vote        {choice}   -> 204
 *   GET  {base}/mod/queue                   -> ModCaseView[]
 *   POST {base}/mod/cases/:id/decision      {verdict}  -> 204
 * The user is identified by the host's own session, never by anything the client sends.
 */
export function createHttpClient(options: HttpClientOptions = {}): QuorumClient {
  const base = (options.baseUrl ?? "/api/quorum").replace(/\/+$/, "");
  const credentials = options.credentials ?? "same-origin";

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const f = options.fetch ?? globalThis.fetch.bind(globalThis);
    const extra = typeof options.headers === "function" ? options.headers() : (options.headers ?? {});
    const res = await f(`${base}${path}`, {
      method,
      credentials,
      headers: { accept: "application/json", ...(body !== undefined && { "content-type": "application/json" }), ...extra },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      let code = codeFromStatus(res.status);
      let message = res.statusText || `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { code?: string; message?: string };
        code = j.code ?? code;
        message = j.message ?? message;
      } catch {
        /* body was not JSON: keep the status-based values */
      }
      throw new QuorumUiError(code, message, res.status);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const id = encodeURIComponent;
  return {
    getSubmission: (sid: string) => call<SubmissionView>("GET", `/submissions/${id(sid)}`),
    vote: (sid: string, choice: VoteChoice) => call<void>("POST", `/submissions/${id(sid)}/vote`, { choice }),
    getQueue: () => call<ModCaseView[]>("GET", "/mod/queue"),
    decide: (cid: string, verdict: Verdict) => call<void>("POST", `/mod/cases/${id(cid)}/decision`, { verdict }),
  };
}
