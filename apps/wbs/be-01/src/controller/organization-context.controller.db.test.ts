import { createHash } from 'node:crypto';

import { httpShapes } from '@wbs/contracts';
import { afterEach, expect, test } from 'bun:test';
import { decodeJwt } from 'jose';

import { OrganizationHarness } from '../testing/organization-harness';
import { ORGANIZATION_ROUTE_INVENTORY } from '../testing/organization-route-inventory';
import { REQUEST_BODIES, REQUEST_QUERIES } from '../testing/route-requests';

let harness: OrganizationHarness;
afterEach(() => harness.closeComposed());

async function open(activate = true) {
  harness = OrganizationHarness.openComposedWith({ sessionBinding: true });
  await harness.register('ada');
  for (const organizationId of ['org-a', 'org-b']) {
    harness.organization(organizationId);
    harness.member(organizationId, 'ada', 'super_admin');
  }
  if (activate) harness.activate();
}

async function select(organizationId: string) {
  const response = await harness.request('/api/organization/active', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      authorization: `Bearer ${harness.token('ada')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('selection cookie is absent');
  return cookie;
}

function write(cookie: string, expectation: readonly string[], cookieAuthentication = false) {
  const headers = new Headers({
    cookie: cookieAuthentication ? `__Host-wbs_access=${harness.token('ada')}; ${cookie}` : cookie,
    origin: 'http://localhost',
    'content-type': 'application/json',
  });
  if (!cookieAuthentication) headers.set('authorization', `Bearer ${harness.token('ada')}`);
  for (const value of expectation) headers.append('X-WBS-Expected-Organization', value);
  return harness.request('/api/directory/commands', {
    method: 'POST',
    headers,
    body: JSON.stringify({ commands: [{ kind: 'createTeam', name: 'stale team' }] }),
  });
}

function effects() {
  const tables = harness.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return tables.map(({ name }) => ({
    name,
    rows: harness.sqlite
      .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
      .all()
      .map((row) => JSON.stringify(row))
      .sort(),
  }));
}

test('refuses a stale directory write after the shared cookie selects B', async () => {
  await open();
  await select('org-a');
  const cookie = await select('org-b');
  const before = effects();
  for (const cookieAuthentication of [false, true]) {
    const response = await write(cookie, ['org-a'], cookieAuthentication);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'organization_context_changed' });
    expect(effects()).toEqual(before);
  }
  expect((await write(cookie, ['org-b'])).status).toBe(200);
});

test('requires exactly one expected organization on browser mutations', async () => {
  await open();
  const cookie = await select('org-a');
  for (const cookieAuthentication of [false, true]) {
    for (const expectation of [[], [''], ['org-a', 'org-a'], ['org-a, org-b']]) {
      const before = effects();
      const response = await write(cookie, expectation, cookieAuthentication);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'organization_context_changed' });
      expect(effects()).toEqual(before);
    }
    expect((await write(cookie, [' org-a '], cookieAuthentication)).status).toBe(200);
  }
});

test('covers every mounted organization mutation', async () => {
  await open();
  const cookie = await select('org-b');
  expect(ORGANIZATION_ROUTE_INVENTORY.map((route) => route.operationId).sort()).toEqual(
    httpShapes.map((shape) => shape.operationId).sort(),
  );
  for (const route of ORGANIZATION_ROUTE_INVENTORY) {
    const shape = httpShapes.find((candidate) => candidate.operationId === route.operationId);
    if (shape === undefined) throw new Error(`missing route ${route.operationId}`);
    if (route.kind !== 'mutation') {
      expect(shape.policies.filter((policy) => policy.kind.startsWith('organization-'))).toEqual([
        route.kind === 'control'
          ? { kind: 'organization-control' }
          : { kind: 'organization-resource', operation: route.kind },
      ]);
      continue;
    }
    const before = effects();
    const response = await resourceRequest(route, cookie, 'org-a');
    expect({
      operationId: route.operationId,
      status: response.status,
      body: (await response.json()) as unknown,
    }).toEqual({
      operationId: route.operationId,
      status: 409,
      body: { error: 'organization_context_changed' },
    });
    expect(effects()).toEqual(before);
    expect(shape.policies.filter((policy) => policy.kind.startsWith('organization-'))).toEqual([
      { kind: 'organization-resource', operation: route.kind },
    ]);
  }
});

function resourceRequest(
  route: (typeof ORGANIZATION_ROUTE_INVENTORY)[number],
  cookie: string,
  expected?: string,
) {
  const path = route.path.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000001');
  const query = REQUEST_QUERIES[route.operationId];
  const body = REQUEST_BODIES[route.operationId];
  return harness.request(path + (query === undefined ? '' : `?${new URLSearchParams(query)}`), {
    method: route.method,
    headers: {
      authorization: `Bearer ${harness.token('ada')}`,
      cookie,
      origin: 'http://localhost',
      ...(expected === undefined ? {} : { 'X-WBS-Expected-Organization': expected }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('refuses a stale expected organization before returning resource content', async () => {
  await open();
  const cookie = await select('org-b');
  expect((await write(cookie, ['org-b'])).status).toBe(200);
  const teams = ORGANIZATION_ROUTE_INVENTORY.find((route) => route.operationId === 'getApiTeams');
  if (teams === undefined) throw new Error('team route is absent');
  const content = await resourceRequest(teams, cookie, 'org-b');
  expect(content.status).toBe(200);
  expect(await content.json()).toMatchObject({ teams: [{ name: 'stale team' }] });
  const stale = await resourceRequest(teams, cookie, 'org-a');
  expect({ status: stale.status, body: (await stale.json()) as unknown }).toEqual({
    status: 409,
    body: { error: 'organization_context_changed' },
  });
  for (const route of ORGANIZATION_ROUTE_INVENTORY.filter((route) => route.kind === 'read')) {
    const response = await resourceRequest(route, cookie, 'org-a');
    expect({
      operationId: route.operationId,
      status: response.status,
      body: (await response.json()) as unknown,
    }).toEqual({
      operationId: route.operationId,
      status: 409,
      body: { error: 'organization_context_changed' },
    });
  }
  expect((await resourceRequest(teams, cookie)).status).toBe(200);
  for (const expectation of ['', 'org-b, org-b'])
    expect((await resourceRequest(teams, cookie, expectation)).status).toBe(409);
});

async function discover(cookie?: string, token = harness.token('ada')) {
  return harness.request('/api/organization/active', {
    headers: { authorization: `Bearer ${token}`, ...(cookie === undefined ? {} : { cookie }) },
  });
}

function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('vary')).toBe('Cookie, Authorization');
  expect(response.headers.get('set-cookie')).toBeNull();
}

test('discovers only the currently bound organization without selecting', async () => {
  await open();
  const before = effects();
  const unbound = await discover();
  expect(unbound.status).toBe(403);
  expect(await unbound.json()).toEqual({ error: 'no_active_organization' });
  expectPrivate(unbound);
  for (const organizationId of ['org-a', 'org-b']) {
    const cookie = await select(organizationId);
    const response = await discover(cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      organizationId,
      name: organizationId,
      role: 'super_admin',
    });
    expectPrivate(response);
  }
  expect(effects()).toEqual(before);
});

test('refuses removed or revoked context discovery', async () => {
  await open();
  const cookie = await select('org-a');
  harness.sqlite.run(
    'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
    ['org-a', harness.userId('ada')],
  );
  const removed = await discover(cookie);
  expect(removed.status).toBe(403);
  expect(await removed.json()).toEqual({ error: 'not_a_member' });
  expectPrivate(removed);
  const revokedCookie = await select('org-b');
  const token = harness.token('ada');
  const claims = decodeJwt(token);
  if (claims.exp === undefined) throw new Error('native expiry is absent');
  harness.sqlite.run(
    'INSERT INTO browser_credential_revocations (kind, user_id, credential_digest, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)',
    [
      'native',
      harness.userId('ada'),
      createHash('sha256').update(token).digest('hex'),
      claims.exp * 1000,
      Date.now(),
    ],
  );
  const revoked = await discover(revokedCookie);
  expect(revoked.status).toBe(401);
  expectPrivate(revoked);
  const replaced = await discover(cookie, harness.token('ada') + 'invalid');
  expect(replaced.status).toBe(401);
  expectPrivate(replaced);
});

test('discovers current roles and refuses inactive, replaced and corrupt context', async () => {
  await open();
  const cookie = await select('org-a');
  harness.sqlite.run(
    "UPDATE organization_membership SET role = 'viewer' WHERE organization_id = 'org-a'",
  );
  expect(await (await discover(cookie)).json()).toEqual({
    organizationId: 'org-a',
    name: 'org-a',
    role: 'viewer',
  });
  const login = await harness.request('/api/auth/login', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'ada', password: 'correct-horse' }),
  });
  const issued = (await login.json()) as { token: string };
  const replaced = await discover(cookie, issued.token);
  expect(replaced.status).toBe(403);
  expect(await replaced.json()).toEqual({ error: 'no_active_organization' });
  expectPrivate(replaced);
  await harness.closeComposed();
  await open(false);
  const inactive = await discover(cookie);
  expect(inactive.status).toBe(403);
  expect(await inactive.json()).toEqual({ error: 'onboarding_inactive' });
  expectPrivate(inactive);
  harness.sqlite.run('DROP TABLE organization_activation');
  const corrupt = await discover(cookie);
  expect(corrupt.status).toBe(500);
  expectPrivate(corrupt);
});

test('discovery keeps zero and one membership unselected', async () => {
  await open();
  await harness.register('grace');
  for (const hasMembership of [false, true]) {
    if (hasMembership) harness.member('org-a', 'grace', 'member');
    const response = await discover(undefined, harness.token('grace'));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'no_active_organization' });
    expectPrivate(response);
  }
});
