import type { AuthenticatedUser } from '@wbs/contracts';
import { expect, it } from 'bun:test';

import type { CommandCaller } from '../ports/command-access';
import type { ResourceAccess } from '../ports/organization-access';
import type { PlanEventFilter } from '../ports/plan-event-store';
import type { WorkPackageObservation } from '../ports/work-package-observation';
import { legacyOrganizationAccess } from '../testing/organization-access-fixture';
import { historyRoutes } from './history.routes';

it('returns the modeled missing-work-package refusal from a literal history request', async () => {
  const endpoint = historyRoutes(
    createHistoryObservation(() => Promise.resolve({ ok: true, value: null })),
    legacyOrganizationAccess,
  )[0];
  const reply = await endpoint.handle({
    params: { id: 'missing' },
    query: {},
    body: undefined,
    principal: { id: 'reader', username: 'reader', scopes: ['read'] },
    request: {
      method: 'GET',
      url: new URL('http://localhost/api/work-packages/missing/history'),
      headers: new Headers(),
      signal: new AbortController().signal,
    },
  });
  expect(reply).toEqual({ ok: false, status: 404, body: { error: 'not_found' } });
});

/** Protocol double only; unused ordinary read purposes refuse rather than model current authority. */
function createHistoryObservation(
  readHistory: WorkPackageObservation['readHistory'],
): WorkPackageObservation {
  return {
    checkRead: () => Promise.reject(new Error('unexpected history fixture admission')),
    captureSavedPlan: () =>
      Promise.reject(new Error('unused saved-plan capture in ordinary route fixture')),
    captureSavedCurrent: () =>
      Promise.reject(new Error('unused current comparison observation in this route model')),
    readSaved: () => Promise.reject(new Error('unused saved byte observation in this route model')),
    listSaved: () => Promise.reject(new Error('unexpected history fixture saved shelf')),
    list: () => Promise.reject(Error('Unexpected history fixture LIST')),
    read: () => Promise.reject(Error('Unexpected history fixture detail')),
    readSolution: () => Promise.reject(Error('Unexpected history fixture solution')),
    readHistory,
  };
}

const historyInput = {
  params: { id: 'history-package' },
  query: {},
  body: undefined,
  principal: { id: 'reader', username: 'Reader', scopes: ['read'] as const },
  request: {
    method: 'GET',
    url: new URL('http://localhost/api/work-packages/history-package/history'),
    headers: new Headers(),
    signal: new AbortController().signal,
  },
};

it('retains the nested history caller and parsed filter before initial organization resolution waits', async () => {
  const authentication = { kind: 'first_party' as const, issuedAt: 1 };
  const scopes: AuthenticatedUser['scopes'][number][] = ['read', 'write'];
  const organizationBinding = {
    credential: {
      kind: 'native' as const,
      userId: 'reader',
      digest: 'verified-digest',
      expiresAt: 1000,
    },
    cookie: 'selected-cookie',
  };
  const principal: AuthenticatedUser = {
    id: 'reader',
    username: 'Reader',
    scopes,
    authentication,
    organizationBinding,
  };
  const retained: AuthenticatedUser = {
    ...structuredClone(principal),
    organizationOperation: { kind: 'read', expected: { kind: 'absent' } },
  };
  const access: ResourceAccess = {
    kind: 'scoped',
    principal: { id: 'reader' },
    scope: { organizationId: 'route-org', userId: 'reader', cap: null },
  };
  const query = { workItemId: 'focus', kind: ' estimate, , clear_estimate ' };
  const entered = Promise.withResolvers<undefined>(),
    released = Promise.withResolvers<undefined>();
  let captured: { caller: CommandCaller; id: string; filter: PlanEventFilter } | undefined;
  const [endpoint] = historyRoutes(
    createHistoryObservation((caller, id, filter) => {
      captured = structuredClone({ caller, id, filter });
      return Promise.resolve({ ok: true, value: [] });
    }),
    {
      async resolve() {
        entered.resolve(undefined);
        await released.promise;
        return { ok: true, access };
      },
    },
  );
  const observed = endpoint.handle({ ...historyInput, principal, query }).then(
    (value) => ({ ok: true as const, value }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  let primary: { cause: unknown } | undefined;
  let primaryOwnsPending = false;
  try {
    const entry = await Promise.race([
      entered.promise.then(() => ({ entered: true as const })),
      observed.then((settled) => ({ entered: false as const, settled })),
    ]);
    if (!entry.entered) {
      if (!entry.settled.ok) {
        primaryOwnsPending = true;
        throw entry.settled.cause;
      }
      throw Error('History route settled before initial resolution entry');
    }
    principal.id = 'top-level-copy-is-not-the-witness';
    authentication.issuedAt = 99;
    scopes.splice(0, scopes.length, 'editor');
    organizationBinding.cookie = 'changed-cookie';
    organizationBinding.credential.expiresAt = 1;
    query.workItemId = 'changed';
    query.kind = 'rename';
  } catch (cause: unknown) {
    primary = { cause };
  }
  released.resolve(undefined);
  const settled = await observed;
  if (primary !== undefined) {
    if (!settled.ok && !primaryOwnsPending)
      throw new AggregateError(
        [primary.cause, settled.cause],
        'History route entry and settlement failed',
        { cause: primary.cause },
      );
    throw primary.cause;
  }
  if (!settled.ok) throw settled.cause;
  expect(settled.value).toEqual({ ok: true, status: 200, body: { events: [] } });
  expect(captured).toEqual({
    caller: { kind: 'human', principal: retained, expectedAccess: access },
    id: 'history-package',
    filter: { workItemId: 'focus', kinds: ['estimate', 'clear_estimate'] },
  });
});

it('forwards initial history refusal without observing and the later current refusal exactly', async () => {
  let calls = 0;
  const observation = createHistoryObservation(() => {
    calls++;
    return Promise.resolve({ ok: false, refusal: 'organization_context_changed' });
  });
  const [initial] = historyRoutes(observation, {
    resolve: () => Promise.resolve({ ok: false, refusal: 'not_a_member' }),
  });
  expect(await initial.handle(historyInput)).toEqual({
    ok: false,
    status: 403,
    body: { error: 'not_a_member' },
  });
  expect(calls).toBe(0);
  const [later] = historyRoutes(observation, legacyOrganizationAccess);
  expect(await later.handle(historyInput)).toEqual({
    ok: false,
    status: 409,
    body: { error: 'organization_context_changed' },
  });
  expect(calls).toBe(1);
});

it('returns empty readable history as200 and retains unknown or blank kind query semantics', async () => {
  const filters: PlanEventFilter[] = [];
  const [endpoint] = historyRoutes(
    createHistoryObservation((_caller, _id, filter) => {
      filters.push(structuredClone(filter));
      return Promise.resolve({ ok: true, value: [] });
    }),
    legacyOrganizationAccess,
  );
  for (const query of [
    { kind: 'unknown-future-kind', workItemId: '' },
    { kind: ' , ', workItemId: '' },
  ])
    expect(await endpoint.handle({ ...historyInput, query })).toEqual({
      ok: true,
      status: 200,
      body: { events: [] },
    });
  expect(filters).toEqual([{ kinds: ['unknown-future-kind'] }, {}]);
});

it('preserves unknown history initial and observed rejections including undefined and aggregate identity', async () => {
  for (const cause of [
    Error('history unavailable'),
    undefined,
    new AggregateError([Error('first'), Error('second')], 'paired history failure'),
  ]) {
    const rejectHistoryFailure = () =>
      Promise.resolve().then(() => {
        const failure: unknown = cause;
        throw failure;
      });
    const [later] = historyRoutes(
      createHistoryObservation(rejectHistoryFailure),
      legacyOrganizationAccess,
    );
    const [initial] = historyRoutes(
      createHistoryObservation(() => Promise.reject(Error('unexpected history observation'))),
      { resolve: rejectHistoryFailure },
    );
    for (const endpoint of [initial, later]) {
      const settled = await endpoint.handle(historyInput).then(
        () => ({ rejected: false as const }),
        (failure: unknown) => ({ rejected: true as const, failure }),
      );
      expect(settled.rejected).toBe(true);
      if (!settled.rejected) throw Error('History failure unexpectedly resolved');
      expect(settled.failure).toBe(cause);
    }
  }
});
