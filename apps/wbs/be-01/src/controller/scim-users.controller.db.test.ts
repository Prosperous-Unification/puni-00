import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  issueToken,
  openScimWorld,
  replace,
  scim,
  scimUser,
  type ScimWorld,
  sha256Hex,
} from '../testing/scim-fixture';

/**
 * The SCIM Users subset (`organization-scim` task 4.3), mounted over real
 * SQLite: RFC 7644 resources, list responses, PATCH and errors; pending
 * memberships that grant nothing; another organization's user answered as
 * absent; `501` for what the subset does not do.
 */
const ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';
let world: ScimWorld;
let tokenA: { id: string; token: string };
let tokenB: { id: string; token: string };

beforeEach(async () => {
  world = await openScimWorld();
  tokenA = await issueToken(world.h, 'ada');
  tokenB = await issueToken(world.h, 'bob');
});

afterEach(() => {
  world.h.close();
});

const snapshot = () => ({
  users: world.h.sqlite.query('SELECT * FROM organization_scim_user ORDER BY id').all(),
  memberships: world.h.sqlite
    .query('SELECT * FROM organization_membership ORDER BY organization_id, user_id')
    .all(),
  audits: world.h.sqlite.query('SELECT * FROM organization_audit ORDER BY rowid').all(),
});

async function provision(
  token: string,
  userName: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string } & Record<string, unknown>> {
  // Distinct creation times, so a list's creation order is deterministic.
  world.clock.at += 1;
  const created = await scim(world.h, token, 'POST', '/scim/v2/Users', scimUser(userName, extra));
  if (created.status !== 201) throw new Error(`provision refused: ${created.text}`);
  return created.body as { id: string } & Record<string, unknown>;
}

describe('POST /scim/v2/Users', () => {
  it('creates a pending membership that grants nothing, with one audit row naming the token', async () => {
    const { h, clock } = world;
    await h.register('carol');
    h.bind('carol', 'org-a');
    const auditsBefore = snapshot().audits.length;

    const created = await scim(
      h,
      tokenA.token,
      'POST',
      '/scim/v2/Users',
      scimUser('Carol@ACME.test', { externalId: 'ext-carol', name: { givenName: 'Carol' } }),
    );

    expect(created.status).toBe(201);
    expect(created.headers.get('content-type')).toBe('application/scim+json');
    const body = created.body as { id: string };
    expect(created.headers.get('location')).toBe(`http://localhost/scim/v2/Users/${body.id}`);
    expect(created.body).toEqual({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: body.id,
      userName: 'carol@acme.test',
      externalId: 'ext-carol',
      active: true,
      meta: {
        resourceType: 'User',
        created: new Date(clock.at).toISOString(),
        lastModified: new Date(clock.at).toISOString(),
        location: `http://localhost/scim/v2/Users/${body.id}`,
      },
    });
    expect(
      h.sqlite.query('SELECT organization_id, active, user_id FROM organization_scim_user').all(),
    ).toEqual([{ organization_id: 'org-a', active: 1, user_id: null }]);
    expect(
      h.sqlite
        .query('SELECT * FROM organization_membership WHERE user_id = ?')
        .all(h.userId('carol')),
    ).toEqual([]);
    expect(await h.call('carol', 'GET', '/api/projects')).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    const audits = snapshot().audits as Record<string, unknown>[];
    expect(audits).toHaveLength(auditsBefore + 1);
    expect(audits.at(-1)).toMatchObject({
      action: 'scim_user_provisioned',
      actor_id: `scim:${tokenA.id}`,
      subject_kind: 'scim_user',
      subject_id: body.id,
    });
    const detail = String(audits.at(-1)?.['detail']);
    expect(detail).not.toContain(tokenA.token);
    expect(detail).not.toContain(await sha256Hex(tokenA.token));
  });

  it('treats an absent active as true and stores an inactive POST without a pending membership', async () => {
    expect((await provision(tokenA.token, 'dave@acme.test'))['active']).toBe(true);
    const inactive = await provision(tokenA.token, 'erin@acme.test', { active: false });
    expect(inactive['active']).toBe(false);
  });

  it('refuses an off-domain userName as invalidValue and a duplicate as uniqueness, storing nothing', async () => {
    const { h } = world;
    await provision(tokenA.token, 'carol@acme.test');
    const before = snapshot();

    const offDomain = await scim(
      h,
      tokenA.token,
      'POST',
      '/scim/v2/Users',
      scimUser('dave@other.test'),
    );
    expect(offDomain.status).toBe(400);
    expect(offDomain.body).toMatchObject({
      schemas: [ERROR],
      status: '400',
      scimType: 'invalidValue',
    });
    for (const userName of ['carol@acme.test', 'CAROL@Acme.Test']) {
      const duplicate = await scim(h, tokenA.token, 'POST', '/scim/v2/Users', scimUser(userName));
      expect(duplicate.status).toBe(409);
      expect(duplicate.body).toMatchObject({ status: '409', scimType: 'uniqueness' });
    }
    const notAnEmail = await scim(h, tokenA.token, 'POST', '/scim/v2/Users', scimUser('carol'));
    expect(notAnEmail.body).toMatchObject({ status: '400', scimType: 'invalidValue' });
    expect(snapshot()).toEqual(before);
  });

  it('refuses a malformed body as invalidSyntax, and accepts application/json', async () => {
    const { h } = world;
    const before = snapshot();
    for (const [body, contentType] of [
      ['{not json', 'application/scim+json'],
      [{ userName: 'carol@acme.test' }, 'application/scim+json'],
      [scimUser('carol@acme.test'), 'text/plain'],
      [[scimUser('carol@acme.test')], 'application/scim+json'],
    ] as const) {
      const refused = await scim(h, tokenA.token, 'POST', '/scim/v2/Users', body, contentType);
      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ scimType: 'invalidSyntax' });
    }
    expect(snapshot()).toEqual(before);
    const plain = await scim(
      h,
      tokenA.token,
      'POST',
      '/scim/v2/Users',
      scimUser('carol@acme.test'),
      'application/json; charset=utf-8',
    );
    expect(plain.status).toBe(201);
  });
});

describe('GET /scim/v2/Users', () => {
  it('lists this organization only, filtered by userName or externalId, as a ListResponse', async () => {
    const { h } = world;
    const carol = await provision(tokenA.token, 'carol@acme.test', { externalId: 'c-1' });
    const dave = await provision(tokenA.token, 'dave@acme.test');
    await provision(tokenB.token, 'erin@b.test');
    const ids = (answer: { body: unknown }) =>
      (answer.body as { Resources: { id: string }[] }).Resources.map((user) => user.id);

    const all = await scim(h, tokenA.token, 'GET', '/scim/v2/Users');
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
    });
    expect(ids(all)).toEqual([carol.id, dave.id]);
    const byName = await scim(
      h,
      tokenA.token,
      'GET',
      `/scim/v2/Users?filter=${encodeURIComponent('userName eq "Carol@ACME.test"')}`,
    );
    expect(ids(byName)).toEqual([carol.id]);
    const byExternal = await scim(
      h,
      tokenA.token,
      'GET',
      `/scim/v2/Users?filter=${encodeURIComponent('externalId eq "c-1"')}`,
    );
    expect(ids(byExternal)).toEqual([carol.id]);
    const foreignName = await scim(
      h,
      tokenA.token,
      'GET',
      `/scim/v2/Users?filter=${encodeURIComponent('userName eq "erin@b.test"')}`,
    );
    expect(foreignName.body).toMatchObject({ totalResults: 0, Resources: [] });
    const page = await scim(h, tokenA.token, 'GET', '/scim/v2/Users?startIndex=2&count=1');
    expect(page.body).toMatchObject({ totalResults: 2, startIndex: 2, itemsPerPage: 1 });
    expect(ids(page)).toEqual([dave.id]);
  });

  it('answers any other filter or query parameter 501', async () => {
    const { h } = world;
    for (const query of [
      `filter=${encodeURIComponent('emails co "x"')}`,
      `filter=${encodeURIComponent('userName sw "carol"')}`,
      'attributes=userName',
    ]) {
      const answer = await scim(h, tokenA.token, 'GET', `/scim/v2/Users?${query}`);
      expect(answer.status).toBe(501);
      expect(answer.body).toMatchObject({ schemas: [ERROR], status: '501' });
    }
  });
});

describe('/scim/v2/Users/:id', () => {
  it('reads one user and answers an absent identifier 404', async () => {
    const { h } = world;
    const carol = await provision(tokenA.token, 'carol@acme.test');
    expect((await scim(h, tokenA.token, 'GET', `/scim/v2/Users/${carol.id}`)).body).toEqual(carol);
    const absent = await scim(h, tokenA.token, 'GET', '/scim/v2/Users/absent');
    expect(absent.status).toBe(404);
    expect(absent.body).toEqual({ schemas: [ERROR], status: '404', detail: 'not_found' });
    const malformed = await scim(h, tokenA.token, 'GET', '/scim/v2/Users/%E0%A4%A');
    expect(malformed.status).toBe(404);
    expect(malformed.text).toBe(absent.text);
  });

  it('answers another organization’s user 404 exactly as an absent one, changing nothing', async () => {
    const { h } = world;
    await h.register('erin');
    h.member('org-b', 'erin', 'member');
    const erin = await provision(tokenB.token, 'erin@b.test');
    h.sqlite.run(
      "UPDATE organization_scim_user SET user_id = ?, issuer = 'https://idp.test', subject = 'samlp|b-saml|erin@b.test' WHERE id = ?",
      [h.userId('erin'), erin.id],
    );
    const before = snapshot();
    const absent = await scim(
      h,
      tokenA.token,
      'PATCH',
      '/scim/v2/Users/absent',
      replace({ path: 'active', value: false }),
    );

    const foreign = await scim(
      h,
      tokenA.token,
      'PATCH',
      `/scim/v2/Users/${erin.id}`,
      replace({ path: 'active', value: false }),
    );
    expect(foreign.status).toBe(404);
    expect(foreign.text).toBe(absent.text);
    for (const method of ['GET', 'DELETE'] as const) {
      const answer = await scim(h, tokenA.token, method, `/scim/v2/Users/${erin.id}`);
      expect(answer.status).toBe(404);
      expect(answer.text).toBe(absent.text);
    }
    expect(snapshot()).toEqual(before);
  });

  it('replaces active, externalId and an unbound userName, by path or pathless', async () => {
    const { h } = world;
    const carol = await provision(tokenA.token, 'carol@acme.test');
    const path = `/scim/v2/Users/${carol.id}`;

    const external = await scim(
      h,
      tokenA.token,
      'PATCH',
      path,
      replace({ path: 'externalId', value: 'x-1' }),
    );
    expect(external.status).toBe(200);
    expect(external.body).toMatchObject({ externalId: 'x-1', active: true });
    const renamed = await scim(h, tokenA.token, 'PATCH', path, {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'Replace', path: 'userName', value: 'Caroline@Acme.test' }],
    });
    expect(renamed.body).toMatchObject({ userName: 'caroline@acme.test' });
    // Okta's form: pathless, repeating the id; Entra's: "False" as a string.
    const okta = await scim(
      h,
      tokenA.token,
      'PATCH',
      path,
      replace({ value: { id: carol.id, active: false } }),
    );
    expect(okta.body).toMatchObject({ active: false });
    const entra = await scim(
      h,
      tokenA.token,
      'PATCH',
      path,
      replace({ path: 'active', value: 'True' }),
    );
    expect(entra.body).toMatchObject({ active: true });
  });

  it('refuses any other path, op or value, and a bound userName, changing nothing', async () => {
    const { h } = world;
    await h.register('carol');
    const carol = await provision(tokenA.token, 'carol@acme.test');
    const path = `/scim/v2/Users/${carol.id}`;
    const before = snapshot();
    for (const [body, scimType] of [
      [replace({ path: 'name.givenName', value: 'C' }), 'invalidPath'],
      [replace({ value: { displayName: 'C' } }), 'invalidPath'],
      [
        { ...replace(), Operations: [{ op: 'add', path: 'externalId', value: 'x' }] },
        'invalidSyntax',
      ],
      [replace({ path: 'active', value: 'maybe' }), 'invalidValue'],
      [replace({ path: 'userName', value: 'carol@other.test' }), 'invalidValue'],
      [replace({ value: { id: 'someone-else' } }), 'mutability'],
      [{ ...replace(), Operations: [] }, 'invalidSyntax'],
      [scimUser('carol@acme.test'), 'invalidSyntax'],
    ] as const) {
      const refused = await scim(h, tokenA.token, 'PATCH', path, body);
      expect({
        status: refused.status,
        scimType: (refused.body as { scimType?: string }).scimType,
      }).toEqual({
        status: 400,
        scimType,
      });
    }
    expect(snapshot()).toEqual(before);
    h.sqlite.run(
      "UPDATE organization_scim_user SET user_id = ?, issuer = 'https://idp.test', subject = 'samlp|acme-saml|carol@acme.test' WHERE id = ?",
      [h.userId('carol'), carol.id],
    );
    const bound = await scim(
      h,
      tokenA.token,
      'PATCH',
      path,
      replace({ path: 'userName', value: 'c2@acme.test' }),
    );
    expect(bound.status).toBe(400);
    expect(bound.body).toMatchObject({ scimType: 'mutability' });
  });

  it('deletes a pending user, after which GET answers 404', async () => {
    const { h } = world;
    const carol = await provision(tokenA.token, 'carol@acme.test');
    expect((await scim(h, tokenA.token, 'DELETE', `/scim/v2/Users/${carol.id}`)).status).toBe(204);
    expect((await scim(h, tokenA.token, 'GET', `/scim/v2/Users/${carol.id}`)).status).toBe(404);
    expect((await scim(h, tokenA.token, 'DELETE', `/scim/v2/Users/${carol.id}`)).status).toBe(404);
  });

  it('answers PUT, other methods and other resources 501, changing nothing', async () => {
    const { h } = world;
    const carol = await provision(tokenA.token, 'carol@acme.test');
    const before = snapshot();
    for (const [method, path] of [
      ['PUT', `/scim/v2/Users/${carol.id}`],
      ['PUT', '/scim/v2/Users'],
      ['POST', `/scim/v2/Users/${carol.id}`],
      ['DELETE', '/scim/v2/Users'],
      ['GET', '/scim/v2/Groups'],
      ['GET', '/scim/v2/ServiceProviderConfig'],
    ] as const) {
      const answer = await scim(
        h,
        tokenA.token,
        method,
        path,
        method === 'GET' || method === 'DELETE'
          ? undefined
          : scimUser('dave@acme.test', { active: false }),
      );
      expect({ method, path, status: answer.status }).toEqual({ method, path, status: 501 });
      expect(answer.body).toMatchObject({ schemas: [ERROR], status: '501' });
    }
    expect(snapshot()).toEqual(before);
  });
});
