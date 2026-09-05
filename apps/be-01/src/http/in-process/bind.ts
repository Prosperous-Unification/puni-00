import { type HttpMethod, matchPath, type Route, type RouteRequest } from '../route';

/**
 * The second binder, and the reason Task 1 can *claim* framework independence
 * rather than assert it.
 *
 * It runs the same route list with no HTTP framework at all — no Elysia, no
 * server, no socket. It answers `Request` in and `Response` out because that is
 * the surface Elysia's own `app.handle()` presents, so
 * `binder.contract.test.ts` drives one set of assertions against both and a
 * route module that had quietly grown a framework dependency would fail here
 * rather than pass everywhere.
 *
 * It is **not** a production server and does not try to be. No `onRequest`
 * chain, no plugins, no OpenAPI document: those are app-level concerns that
 * `app.ts` still composes on Elysia, and the honest scope of this file is the
 * route list.
 */
export function bindInProcess(routes: readonly Route[]): {
  handle: (request: Request) => Promise<Response>;
} {
  return {
    handle: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const method = request.method.toUpperCase() as HttpMethod;

      // Path first, method second, so a known path reached with the wrong verb
      // answers 405 rather than 404 — the two are different bugs at the caller
      // and a single pass would report both as "no such route".
      let pathMatched = false;
      for (const route of routes) {
        const params = matchPath(route.path, url.pathname);
        if (params === null) continue;
        pathMatched = true;
        if (route.method !== method) continue;

        let body: unknown;
        try {
          body = await decodeBody(request);
        } catch {
          return json(400, { error: 'invalid_body' });
        }

        const req: RouteRequest = {
          method,
          path: url.pathname,
          params,
          // Last value wins on a repeated key, which is what Elysia's own query
          // parser does; asserting the same rule here keeps a handler reading a
          // duplicated parameter from answering two different things.
          query: Object.fromEntries(url.searchParams),
          headers: Object.fromEntries(request.headers),
          body,
          url: request.url,
        };
        const res = await route.handler(req);
        return json(res.status, res.body, res.headers);
      }
      return pathMatched
        ? json(405, { error: 'method_not_allowed' })
        : json(404, { error: 'not_found' });
    },
  };
}

/**
 * `undefined` for a request that carries no body, the parsed value for JSON,
 * and a throw for JSON that will not parse — the binder turns that throw into
 * the 400 the framework would have answered.
 *
 * A non-JSON content type reads as no body rather than as text: every route in
 * this app takes JSON or nothing, so a handler receiving a string it never
 * expects would be a worse failure than a field it finds absent.
 */
async function decodeBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') return undefined;
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) return undefined;
  const raw = await request.text();
  if (raw === '') return undefined;
  return JSON.parse(raw);
}

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  // 204 carries no body at all; `JSON.stringify(null)` would put the four bytes
  // `null` on the wire and make a no-content answer indistinguishable from a
  // route that answered with the JSON value null.
  if (status === 204 || body === null) {
    return new Response(null, { status, headers });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
