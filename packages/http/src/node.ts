import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

/**
 * Connect a `createRouteHandler` handler to Node's `http` server (or Express, which passes the same objects).
 * Requests the handler does not own go to `fallback`, or get a plain 404.
 */
export function nodeListener(
  handler: (req: Request) => Promise<Response | null>,
  fallback?: (req: IncomingMessage, res: ServerResponse) => void,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const request = new Request(new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`), {
        method: req.method ?? "GET",
        headers: toHeaders(req.headers),
        ...(req.method !== "GET" && req.method !== "HEAD" && { body: await readBody(req), duplex: "half" as const }),
      } as RequestInit);
      const response = await handler(request);
      if (!response) {
        if (fallback) return fallback(req, res);
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
        return;
      }
      const out: Record<string, string> = {};
      response.headers.forEach((value, key) => (out[key] = value));
      res.writeHead(response.status, out);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end("Internal error");
    }
  };
}

function toHeaders(h: IncomingHttpHeaders): Headers {
  const out = new Headers();
  for (const [k, v] of Object.entries(h)) {
    if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
    else if (v !== undefined) out.set(k, v);
  }
  return out;
}

async function readBody(req: IncomingMessage, limit = 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
