import { openConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { expect, test } from 'bun:test';

import { admitDependencyClient } from '../runtime/dependency-client';
import { issueToken, openScimWorld, scimUser } from '../testing/scim-fixture';

const capable = {
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  semantics: ['cross-project-dependencies-v1'],
} as const;

test('SCIM resource requests require fresh dependency admission after provisioning authentication', async () => {
  let isCapable = true;
  const world = await openScimWorld(false, (claim) => {
    return admitDependencyClient(
      connection.db,
      isCapable ? capable : { ...capable, semantics: [] },
      claim,
    );
  });
  const connection = openConnection(world.h.databasePath());
  try {
    const token = await issueToken(world.h, 'ada');
    const request = (
      method: string,
      path = '/scim/v2/Users',
      claim?: string,
      secret: string | null = token.token,
      body?: string,
    ) =>
      world.h.app.handle(
        new Request(`http://localhost${path}`, {
          method,
          headers: {
            ...(secret === null ? {} : { authorization: `Bearer ${secret}` }),
            ...(claim === undefined ? {} : { 'X-WBS-Dependency-Semantics': claim }),
            ...(body === undefined ? {} : { 'content-type': 'application/scim+json' }),
          },
          ...(body === undefined ? {} : { body }),
        }),
      );
    const created = await request(
      'POST',
      undefined,
      undefined,
      undefined,
      JSON.stringify(scimUser('before@acme.test')),
    );
    expect(created.status).toBe(201);
    const user = (await created.json()) as { id: string };
    seedDependencyAuthority(world.h.databasePath());
    const authority = connection;
    const snapshot = () =>
      [
        'organization_scim_user',
        'organization_membership',
        'organization_audit',
        'project',
        'event_log',
        'command_journal',
      ].map((table) => authority.db.all(`SELECT * FROM ${table}`));
    const before = snapshot();
    for (const [method, path, body] of [
      ['GET', '/scim/v2/Users', undefined],
      ['GET', `/scim/v2/Users/${user.id}`, undefined],
      ['POST', '/scim/v2/Users', '{'],
      ['PATCH', `/scim/v2/Users/${user.id}`, '{'],
      ['DELETE', `/scim/v2/Users/${user.id}`, undefined],
    ] as const) {
      const response = await request(method, path, undefined, undefined, body);
      expect(response.status).toBe(409);
      expect(response.headers.get('content-type')).toContain('application/scim+json');
      expect(await response.json()).toMatchObject({
        status: '409',
        detail: 'client_dependency_incompatible',
        required: 'cross-project-dependencies-v1',
      });
    }
    const unread = new Request('http://localhost/scim/v2/Users', {
      method: 'POST',
      headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/scim+json' },
      body: '{',
    });
    expect((await world.h.app.handle(unread)).status).toBe(409);
    expect(unread.bodyUsed).toBe(false);
    expect(snapshot()).toEqual(before);
    expect((await request('GET', undefined, 'older-client')).status).toBe(409);
    expect((await request('GET', undefined, 'cross-project-dependencies-v1')).status).toBe(200);
    isCapable = false;
    expect((await request('GET', undefined, 'cross-project-dependencies-v1')).status).toBe(409);
    connection.db.run('PRAGMA ignore_check_constraints=ON');
    connection.db.run("UPDATE cross_project_dependency_activation SET state='UNKNOWN'");
    const malformed = await request('GET', undefined, 'cross-project-dependencies-v1');
    expect(malformed.status).toBe(500);
    expect(await malformed.json()).toMatchObject({ status: '500', detail: 'internal_error' });
    connection.close();
    expect((await request('GET', undefined, undefined, null)).status).toBe(401);
    expect((await request('GET', undefined, 'cross-project-dependencies-v1')).status).toBe(500);
  } finally {
    connection.close();
    world.h.close();
  }
});
