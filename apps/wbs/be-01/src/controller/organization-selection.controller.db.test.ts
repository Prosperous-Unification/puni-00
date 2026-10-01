import { openConnection, SqliteOrganizationSelection } from '@wbs/store-sqlite';
import { afterEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

function request(
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(method === 'POST' ? { origin: 'http://localhost' } : {}),
      ...(cookie === undefined ? {} : { cookie }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('lists zero, one and multiple current memberships without silently selecting one', async () => {
  harness = OrganizationHarness.open({ sessionBinding: true });
  await harness.register('ada');
  const token = harness.token('ada');
  const list = () => harness?.app.handle(request(token, 'GET', '/api/organization/memberships'));
  const inactive = await list();
  expect(inactive?.status).toBe(403);
  expect(await inactive?.json()).toEqual({ error: 'onboarding_inactive' });
  harness.activate();
  const none = await list();
  expect(none?.status).toBe(200);
  expect(await none?.json()).toEqual({ state: 'onboarding_required', memberships: [] });
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  const one = await list();
  expect(await one?.json()).toEqual({
    state: 'selection_required',
    memberships: [{ organizationId: 'org-a', name: 'org-a', role: 'member' }],
  });
  expect(one?.headers.get('set-cookie')).toBeNull();
  harness.organization('org-b');
  harness.member('org-b', 'ada', 'viewer');
  const many = await list();
  expect(await many?.json()).toEqual({
    state: 'selection_required',
    memberships: [
      { organizationId: 'org-a', name: 'org-a', role: 'member' },
      { organizationId: 'org-b', name: 'org-b', role: 'viewer' },
    ],
  });
});

test('throws on a malformed current membership role rather than advertising authority', async () => {
  harness = OrganizationHarness.open({ sessionBinding: true });
  await harness.register('ada');
  harness.organization('org-a');
  harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
  try {
    harness.member('org-a', 'ada', 'owner');
  } finally {
    harness.sqlite.run('PRAGMA ignore_check_constraints = OFF');
  }
  harness.activate();
  const userId = harness.userId('ada');
  const connection = openConnection(harness.databasePath());
  try {
    expect(() => new SqliteOrganizationSelection(connection.db).list(userId)).toThrow(
      'malformed role',
    );
  } finally {
    connection.close();
  }
  const response = await harness.app.handle(
    request(harness.token('ada'), 'GET', '/api/organization/memberships'),
  );
  expect(response.status).toBe(500);
});

test('selects only a current membership and scopes the mounted project route by the exact pair', async () => {
  harness = OrganizationHarness.open({ sessionBinding: true });
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.activate();
  const token = harness.token('ada');
  const unbound = await harness.app.handle(request(token, 'GET', '/api/projects'));
  expect(unbound.status).toBe(403);
  expect(await unbound.json()).toEqual({ error: 'no_active_organization' });
  const foreign = await harness.app.handle(
    request(token, 'POST', '/api/organization/active', { organizationId: 'org-b' }),
  );
  expect(foreign.status).toBe(403);
  const selected = await harness.app.handle(
    request(token, 'POST', '/api/organization/active', { organizationId: 'org-a' }),
  );
  expect(selected.status).toBe(200);
  const cookie = selected.headers.get('set-cookie');
  expect(cookie).toContain('__Host-wbs_organization=');
  const pair = cookie?.split(';')[0];
  if (pair === undefined) throw new Error('selection did not set its cookie');
  expect(
    (await harness.app.handle(request(token, 'GET', '/api/projects', undefined, pair))).status,
  ).toBe(200);
  expect(
    (
      await harness.app.handle(
        request(token, 'GET', '/api/projects', undefined, pair, {
          'x-wbs-organization': 'org-b',
        }),
      )
    ).status,
  ).toBe(200);
  harness.sqlite.run(
    'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
    ['org-a', harness.userId('ada')],
  );
  const removed = await harness.app.handle(request(token, 'GET', '/api/projects', undefined, pair));
  expect(removed.status).toBe(403);
  expect(await removed.json()).toEqual({ error: 'not_a_member' });
});

test('refuses substituted and ambiguous browser carriers on the mounted access route', async () => {
  harness = OrganizationHarness.open({ sessionBinding: true });
  await harness.register('ada');
  await harness.register('bob');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.member('org-a', 'bob', 'member');
  harness.activate();
  const ada = harness.token('ada');
  const bob = harness.token('bob');
  const selected = await harness.app.handle(
    request(ada, 'POST', '/api/organization/active', { organizationId: 'org-a' }),
  );
  expect(selected.status).toBe(200);
  const pair = selected.headers.get('set-cookie')?.split(';')[0];
  if (pair === undefined) throw new Error('selection did not set its cookie');
  const login = await harness.app.handle(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ada', password: 'correct-horse' }),
    }),
  );
  expect(login.status).toBe(200);
  const replacement = (await login.json()) as { token?: unknown };
  if (typeof replacement.token !== 'string') throw new Error('login did not return a credential');
  expect(replacement.token).not.toBe(ada);
  for (const [token, carrier, status, error] of [
    [bob, pair, 403, 'no_active_organization'],
    [replacement.token, pair, 403, 'no_active_organization'],
    [ada, `${pair}; __Host-wbs_organization=bad`, 403, 'no_active_organization'],
    [ada, '__Host-wbs_organization=%ZZ', 403, 'no_active_organization'],
    [ada, `__Host-wbs_access=bad; ${pair}`, 401, 'unauthenticated'],
  ] as const) {
    const response = await harness.app.handle(
      request(token, 'GET', '/api/projects', undefined, carrier),
    );
    expect({ carrier, status: response.status }).toEqual({ carrier, status });
    expect(await response.json()).toEqual({ error });
  }
  const foreignOrigin = await harness.app.handle(
    request(ada, 'POST', '/api/organization/active', { organizationId: 'org-a' }, pair, {
      origin: 'https://foreign.test',
    }),
  );
  expect(foreignOrigin.status).toBe(403);
  expect(await foreignOrigin.json()).toEqual({ error: 'invalid_origin' });
});
