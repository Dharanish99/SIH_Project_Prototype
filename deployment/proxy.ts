import type { IncomingMessage, ServerResponse } from "node:http";
type ProxyRequest = IncomingMessage & { body?: unknown };
const MAX_BODY = 600 * 1024, MAX_RESPONSE = 2 * 1024 * 1024;
export function createProxy(options: { backendOrigin?: string; allowLocal?: boolean } = {}) {
  return async (req: ProxyRequest, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    const fail = (status: number, message: string) => {
      res.statusCode = status; res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: message, code: "PROXY_ERROR" }));
    };
    try {
      let origin: URL;
      try {
        origin = new URL(options.backendOrigin ?? "");
        if (origin.origin !== options.backendOrigin || (origin.protocol !== "https:" && !(options.allowLocal && origin.hostname === "127.0.0.1"))) throw new Error();
      } catch { return fail(503, "Set RENDER_API_URL to the HTTPS origin of the Render service."); }
      if (!["GET", "HEAD", "POST"].includes(req.method ?? "")) return fail(405, "Method not supported.");
      const target = new URL(req.url ?? "/", origin);
      if (target.origin !== origin.origin || !target.pathname.startsWith("/api/")) return fail(404, "API route not found.");
      const headers = new Headers();
      for (const name of ["content-type", "cookie", "origin", "x-csrf-token"]) {
        const value = req.headers[name]; if (typeof value === "string") headers.set(name, value);
      }
      let body: Buffer | undefined;
      if (req.method === "POST") {
        if (req.body !== undefined) body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));
        else {
          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of req) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > MAX_BODY) return fail(413, "Request exceeds the demo upload limit."); chunks.push(buffer); }
          body = Buffer.concat(chunks);
        }
        if (body.length > MAX_BODY) return fail(413, "Request exceeds the demo upload limit.");
      }
      const upstream = await fetch(target, { method: req.method, headers, body: body ? new Uint8Array(body).buffer : undefined, redirect: "manual", signal: AbortSignal.timeout(20000) });
      if (upstream.status >= 300 && upstream.status < 400) return fail(502, "Unexpected upstream redirect. Check the backend origin.");
      const chunks: Uint8Array[] = []; let size = 0;
      if (upstream.body) for await (const chunk of upstream.body) { size += chunk.length; if (size > MAX_RESPONSE) throw new Error("Upstream response exceeds limit"); chunks.push(chunk); }
      res.statusCode = upstream.status;
      for (const name of ["content-type", "content-disposition", "retry-after", "x-request-id", "x-snapshot-status", "ratelimit", "ratelimit-policy"]) {
        const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
      }
      const cookies = upstream.headers.getSetCookie(); if (cookies.length) res.setHeader("Set-Cookie", cookies);
      res.end(req.method === "HEAD" ? undefined : Buffer.concat(chunks));
    } catch (error) { fail(error instanceof Error && error.name === "TimeoutError" ? 504 : 502, "The demo API is temporarily unavailable. Check the Render service and retry."); }
  };
}
