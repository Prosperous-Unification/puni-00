import { Elysia } from 'elysia';

import type { HttpMethod, Route, RouteRequest } from '../route';

/**
 * The Elysia binder: a route list in, a mountable Elysia instance out.
 *
 * This file and `app.ts` are the only two places under `src/` that import
 * `elysia`, and that is the whole claim of the refactor — everything a
 * controller does is now expressed against `../route`, and swapping the
 * framework means writing a sibling of this file.
 *
 * Routes are registered through the **method-specific** calls rather than a
 * generic `.route()`, because `@elysiajs/openapi` builds its document from the
 * route table of the instance it is mounted on and the method-specific
 * registrations are the shape it has always read. The document is committed and
 * diffed by `openapi/openapi-document.test.ts`, so a route that stops appearing
 * here is a red rather than a silent omission.
 *
 * The instance is deliberately **unnamed and fresh per call**, matching the
 * controllers it replaces: the test suite builds many apps in one process, each
 * with its own `AuthService`, and a named plugin would be deduped and reused
 * across them with the first app's services closed over inside it.
 */
export function bindElysia(routes: readonly Route[]): Elysia {
  let app = new Elysia();
  for (const route of routes) {
    const handle = async (ctx: {
      params: Record<string, string>;
      query: Record<string, string | undefined>;
      headers: Record<string, string | undefined>;
      body: unknown;
      request: Request;
      set: { status?: number | string; headers: Record<string, string> };
    }): Promise<unknown> => {
      const req: RouteRequest = {
        method: route.method,
        path: new URL(ctx.request.url).pathname,
        params: ctx.params,
        // Elysia types a query value as possibly undefined because a bare
        // `?flag` has none. Handlers compare against a string, so an absent
        // value is dropped rather than carried as `undefined` — `'cascade' in
        // query` would otherwise be true for a flag that was never given a
        // value, which is the opposite of what the DELETE route asks.
        query: Object.fromEntries(
          Object.entries(ctx.query).filter((entry): entry is [string, string] => {
            return entry[1] !== undefined;
          }),
        ),
        headers: ctx.headers,
        body: ctx.body,
        url: ctx.request.url,
      };
      const res = await route.handler(req);
      ctx.set.status = res.status;
      for (const [name, value] of Object.entries(res.headers ?? {})) {
        ctx.set.headers[name] = value;
      }
      return res.body;
    };

    // `detail` and `query` are the two hook keys `@elysiajs/openapi` reads. A
    // route with no documentation passes no hook at all, so the generated
    // document is byte-identical to the one the per-controller registrations
    // produced.
    app = register(app, route.method, route.path, handle, route.documentation);
  }
  return app;
}

function register(
  app: Elysia,
  method: HttpMethod,
  path: string,
  handle: (ctx: never) => Promise<unknown>,
  hook: Route['documentation'],
): Elysia {
  /* eslint-disable @typescript-eslint/no-explicit-any -- the binder is the one
     place that erases the route-level types Elysia would otherwise infer; every
     handler above it is typed against RouteRequest/RouteResponse instead. */
  const anyApp = app as any;
  switch (method) {
    case 'GET':
      return anyApp.get(path, handle, hook);
    case 'POST':
      return anyApp.post(path, handle, hook);
    case 'PUT':
      return anyApp.put(path, handle, hook);
    case 'PATCH':
      return anyApp.patch(path, handle, hook);
    case 'DELETE':
      return anyApp.delete(path, handle, hook);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
