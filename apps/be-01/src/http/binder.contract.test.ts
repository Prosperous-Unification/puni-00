import { describe, expect, it } from 'bun:test';

import type { AuthenticatedUser, AuthService } from '../service/auth.service';
import { callerGuard } from './caller';
import { bindElysia } from './elysia/bind';
import { bindInProcess } from './in-process/bind';
import { noContent, ok, respond, type Route } from './route';

/**
 * The proof obligation for Task 1 of the be-01 hexagonal refactor: one set of
 * assertions, run against **two** binders over the same route list — Elysia,
 * and a binder that uses no HTTP framework at all.
 *
 * A route module that had quietly kept a framework dependency — reading a
 * context field Elysia happens to provide, relying on Elysia's body parsing to
 * coerce something, answering through a mechanism only a plugin supplies —
 * passes under `bindElysia` and fails here. That is the whole reason the second
 * binder exists; it is a test fixture with a `Response` in it, not a server.
 *
 * What this suite does **not** claim: that the two binders agree on everything.
 * They deliberately differ where the framework owns the answer — Elysia's own
 * 404 body, its malformed-JSON refusal, plugin-level headers. Every clause
 * below is a property a *route module* is entitled to rely on, which is exactly
 * the set a second HTTP framework would have to reproduce.
 */

type Binder = (routes: readonly Route[]) => { handle: (request: Request) => Promise<Response> };

const BINDERS: readonly [name: string, bind: Binder][] = [
  ['elysia', (routes) => bindElysia(routes)],
  ['in-process', (routes) => bindInProcess(routes)],
];

const ALICE: AuthenticatedUser = {
  id: 'user-1',
  username: 'alice',
  scopes: ['read', 'write'],
};

const NO_SCOPES: AuthenticatedUser = { id: 'user-2', username: 'bob', scopes: [] };

/**
 * The smallest thing that satisfies the guard's one call. A real `AuthService`
 * would drag a database in and prove nothing extra: what is under test is the
 * route layer's behaviour given an answer, not how the answer is reached.
 */
function stubAuth(byToken: Record<string, AuthenticatedUser>): AuthService {
  return {
    authenticate: async (token: string | null) =>
      token === null ? null : (byToken[token] ?? null),
  } as unknown as AuthService;
}

function routes(auth: AuthService): Route[] {
  const guard = callerGuard(auth);
  return [
    { method: 'GET', path: '/probe/plain', handler: async () => ok({ hello: 'world' }) },
    {
      method: 'GET',
      path: '/probe/echo/:id',
      handler: async ({ params, query }) => ok({ id: params['id'], mode: query['mode'] ?? null }),
    },
    {
      method: 'POST',
      path: '/probe/body',
      handler: async ({ body }) => ok({ received: body }),
    },
    {
      method: 'DELETE',
      path: '/probe/gone/:id',
      handler: async () => noContent(),
    },
    {
      method: 'GET',
      path: '/probe/refuse',
      handler: async () => respond(409, { error: 'conflict' }),
    },
    {
      method: 'GET',
      path: '/probe/headers',
      handler: async () => ({ status: 200, body: { ok: true }, headers: { 'x-probe': 'set' } }),
    },
    {
      method: 'GET',
      path: '/probe/guarded',
      handler: guard('signed-in', async (_req, user) => ok({ id: user.id })),
    },
    {
      method: 'GET',
      path: '/probe/scoped',
      handler: guard('read-scope', async (_req, user) => ok({ id: user.id })),
    },
  ];
}

describe.each(BINDERS)('route contract under the %s binder', (_name, bind) => {
  const auth = stubAuth({ 'alice-token': ALICE, 'scopeless-token': NO_SCOPES });
  const app = bind(routes(auth));
  const get = (path: string, headers: Record<string, string> = {}) =>
    app.handle(new Request(`http://localhost${path}`, { headers }));

  it('answers a plain route with its body and a 200', async () => {
    const res = await get('/probe/plain');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: 'world' });
  });

  it('gives the handler its path parameters and query', async () => {
    const res = await get('/probe/echo/abc-123?mode=full');
    expect(await res.json()).toEqual({ id: 'abc-123', mode: 'full' });
  });

  it('reports an absent query parameter as absent rather than as the string undefined', async () => {
    const res = await get('/probe/echo/abc-123');
    expect(await res.json()).toEqual({ id: 'abc-123', mode: null });
  });

  it('decodes a JSON body before the handler runs', async () => {
    const res = await app.handle(
      new Request('http://localhost/probe/body', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Strip out' }),
      }),
    );
    expect(await res.json()).toEqual({ received: { name: 'Strip out' } });
  });

  it('answers a 204 with no body at all', async () => {
    const res = await app.handle(
      new Request('http://localhost/probe/gone/7', { method: 'DELETE' }),
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('carries a refusal status set by the handler', async () => {
    const res = await get('/probe/refuse');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'conflict' });
  });

  it('carries response headers a handler asked for', async () => {
    const res = await get('/probe/headers');
    expect(res.headers.get('x-probe')).toBe('set');
  });

  it('refuses an unauthenticated caller with 401', async () => {
    const res = await get('/probe/guarded');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('hands the resolved account to a guarded handler', async () => {
    const res = await get('/probe/guarded', { authorization: 'Bearer alice-token' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'user-1' });
  });

  it('reads the session cookie as well as the bearer header', async () => {
    const res = await get('/probe/guarded', { cookie: '__Host-wbs_access=alice-token' });
    expect(await res.json()).toEqual({ id: 'user-1' });
  });

  it('refuses a token without the read scope with 403 on a read-scope route', async () => {
    const res = await get('/probe/scoped', { authorization: 'Bearer scopeless-token' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'insufficient_scope' });
  });

  it('admits a token carrying the read scope', async () => {
    const res = await get('/probe/scoped', { authorization: 'Bearer alice-token' });
    expect(res.status).toBe(200);
  });

  it('does not answer a path no route declares', async () => {
    const res = await get('/probe/nothing-here');
    expect(res.status).toBe(404);
  });
});
