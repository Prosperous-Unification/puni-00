import { JwksTokenVerifier } from '@wbs/auth';
import { openConnection, SqliteOrganizationSelection } from '@wbs/store-sqlite';
import { afterEach, expect, test } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

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

function cookieRequest(
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  selection?: string,
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      cookie: `__Host-wbs_access=${token}${selection === undefined ? '' : `; ${selection}`}`,
      ...(method === 'POST' ? { origin: 'http://localhost' } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
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
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('vary')).toBe('Cookie, Authorization');
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
  const duplicateSelection = await harness.app.handle(
    request(
      ada,
      'POST',
      '/api/organization/active',
      { organizationId: 'org-a' },
      `${pair}; __Host-wbs_organization=bad`,
    ),
  );
  expect(duplicateSelection.status).toBe(401);
  expect(await duplicateSelection.json()).toEqual({ error: 'unauthenticated' });
  const malformedDuplicate = await harness.app.handle(
    request(
      ada,
      'POST',
      '/api/organization/active',
      { organizationId: 'org-a' },
      `__Host-wbs_organization =bad; ${pair}`,
    ),
  );
  expect(malformedDuplicate.status).toBe(401);
  expect(await malformedDuplicate.json()).toEqual({ error: 'unauthenticated' });
});

test('requires the exact Origin for bearer-only selection and protects every selection response from caching', async () => {
  harness = OrganizationHarness.open({ sessionBinding: true });
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.activate();
  const token = harness.token('ada');
  const noOrigin = await harness.app.handle(
    new Request('http://localhost/api/organization/active', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-a' }),
    }),
  );
  expect(noOrigin.status).toBe(403);
  expect(await noOrigin.json()).toEqual({ error: 'invalid_origin' });
  for (const response of [
    noOrigin,
    await harness.app.handle(request(token, 'POST', '/api/organization/active', {})),
    await harness.app.handle(
      request(token, 'POST', '/api/organization/active', { organizationId: 'foreign' }),
    ),
    await harness.app.handle(request('invalid', 'GET', '/api/organization/memberships')),
    await harness.app.handle(request(token, 'GET', '/api/organization/memberships')),
  ]) {
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
  }
});

test('binds a real verified OIDC access cookie to its mapped local member and rejects invalid evidence', async () => {
  const issuer = 'https://idp.test';
  const audience = 'api://wbs';
  const signing = await generateKeyPair('RS256');
  const otherSigning = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(signing.publicKey);
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'selection-key', use: 'sig' }] }),
  });
  try {
    const verifier = new JwksTokenVerifier({
      audience,
      issuer,
      jwksUri: new URL(`http://127.0.0.1:${String(server.port)}/jwks`),
    });
    harness = OrganizationHarness.open({
      sessionBinding: true,
      upstreamCredential: { verifier, groupPrefix: 'dev', groupsClaim: 'wbs_groups' },
    });
    await harness.register('ada');
    await harness.register('bob');
    harness.organization('org-a');
    harness.member('org-a', 'ada', 'member');
    harness.member('org-a', 'bob', 'member');
    harness.activate();
    for (const [subject, userId] of [
      ['subject-ada', harness.userId('ada')],
      ['subject-bob', harness.userId('bob')],
    ]) {
      harness.sqlite.run(
        'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
        [crypto.randomUUID(), userId, issuer, subject],
      );
    }
    const seconds = Math.floor(Date.now() / 1000);
    const signed = (
      subject: string,
      overrides: { issuer?: string; audience?: string; expires?: boolean; otherKey?: boolean } = {},
    ) => {
      let token = new SignJWT({ wbs_groups: ['dev:wbs:read'] })
        .setProtectedHeader({ alg: 'RS256', kid: 'selection-key' })
        .setIssuer(overrides.issuer ?? issuer)
        .setAudience(overrides.audience ?? audience)
        .setSubject(subject)
        .setJti(crypto.randomUUID())
        .setIssuedAt(seconds);
      if (overrides.expires !== false) token = token.setExpirationTime(seconds + 300);
      return token.sign(overrides.otherKey === true ? otherSigning.privateKey : signing.privateKey);
    };
    const ada = await signed('subject-ada');
    const listed = await harness.app.handle(
      cookieRequest(ada, 'GET', '/api/organization/memberships'),
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      state: 'selection_required',
      memberships: [{ organizationId: 'org-a', name: 'org-a', role: 'member' }],
    });
    const selected = await harness.app.handle(
      cookieRequest(ada, 'POST', '/api/organization/active', { organizationId: 'org-a' }),
    );
    expect(selected.status).toBe(200);
    const pair = selected.headers.get('set-cookie')?.split(';')[0];
    if (pair === undefined) throw new Error('OIDC selection did not set a cookie');
    expect(
      (await harness.app.handle(cookieRequest(ada, 'GET', '/api/projects', undefined, pair)))
        .status,
    ).toBe(200);
    for (const replacement of [await signed('subject-ada'), await signed('subject-bob')]) {
      expect(
        (
          await harness.app.handle(
            cookieRequest(replacement, 'GET', '/api/projects', undefined, pair),
          )
        ).status,
      ).toBe(403);
    }
    for (const invalid of [
      await signed('subject-ada', { issuer: 'https://other.test' }),
      await signed('subject-ada', { audience: 'api://other' }),
      await signed('subject-ada', { otherKey: true }),
      await signed('subject-ada', { expires: false }),
    ]) {
      const response = await harness.app.handle(
        cookieRequest(invalid, 'POST', '/api/organization/active', { organizationId: 'org-a' }),
      );
      expect(response.status).toBe(401);
    }
  } finally {
    await server.stop(true);
  }
});
