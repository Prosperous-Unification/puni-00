import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * `patchPerson.accountId` (`wbs-team-claims` D5, spec `fleet-credentials`) over
 * be-01's production composition and real SQLite: only an admin or a
 * super-admin of the active organization binds an account to a person; the
 * people read shows it.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['dany', 'sup', 'mem', 'vic', 'out']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'dany', 'admin');
  h.member('org-a', 'sup', 'super_admin');
  h.member('org-a', 'mem', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'out', 'admin');
  for (const username of ['dany', 'sup', 'mem', 'vic']) h.bind(username, 'org-a');
  h.bind('out', 'org-b');
  h.activate();
  for (const [id, kind] of [
    ['claire', 'agent'],
    ['claire-worker', 'agent'],
  ] as const) {
    h.sqlite.run('INSERT INTO person (id, name, kind) VALUES (?, ?, ?)', [id, `root-${id}`, kind]);
    h.sqlite.run(
      'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
      [id, 'org-a', id],
    );
  }
});

afterEach(() => {
  h.close();
});

function bind(username: string, personId: string, accountId: unknown): Promise<Answer> {
  return h.call(username, 'POST', '/api/directory/commands', {
    commands: [{ kind: 'patchPerson', personId, patch: { accountId } }],
  });
}

function bindings(): { id: string; account_id: string | null }[] {
  return h.sqlite
    .query<{ id: string; account_id: string | null }, []>(
      'SELECT id, account_id FROM person ORDER BY id',
    )
    .all();
}

describe('binding a person to an account', () => {
  it('lets an admin bind two agents to one account, shows it on the read, and unbinds', async () => {
    const dany = h.userId('dany');
    const first = await bind('dany', 'claire', dany);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      results: [{ entity: { id: 'claire', name: 'claire', kind: 'agent', accountId: dany } }],
    });
    expect((await bind('dany', 'claire-worker', dany)).status).toBe(200);

    const people = await h.call('mem', 'GET', '/api/people');
    expect(people.status).toBe(200);
    expect(people.body).toEqual({
      people: [
        { id: 'claire', name: 'claire', kind: 'agent', teamIds: [], accountId: dany },
        { id: 'claire-worker', name: 'claire-worker', kind: 'agent', teamIds: [], accountId: dany },
      ],
    });

    expect((await bind('dany', 'claire', null)).status).toBe(200);
    expect(bindings()).toEqual([
      { id: 'claire', account_id: null },
      { id: 'claire-worker', account_id: dany },
    ]);
  });

  it('lets a super-admin bind a person to another member of the organization', async () => {
    expect((await bind('sup', 'claire', h.userId('mem'))).status).toBe(200);
    expect(bindings()).toContainEqual({ id: 'claire', account_id: h.userId('mem') });
  });

  // Proof: `mayBindAccountInOrganization` answering `canWriteInOrganization`
  // made this answer 200 with the binding written (watched 2026-10-19).
  it('refuses a member binding a person to an account', async () => {
    expect(await bind('mem', 'claire', h.userId('mem'))).toEqual({
      status: 403,
      body: { error: 'forbidden', at: 0, kind: 'patchPerson' },
    });
    expect(bindings().every(({ account_id }) => account_id === null)).toBe(true);
  });

  it('refuses a viewer the whole batch', async () => {
    const answer = await bind('vic', 'claire', h.userId('vic'));
    expect(answer.status).toBe(403);
    expect(bindings().every(({ account_id }) => account_id === null)).toBe(true);
  });

  it('refuses an account outside the organization, or none, as unknown_account', async () => {
    for (const accountId of [h.userId('out'), 'no-such-account']) {
      expect(await bind('dany', 'claire', accountId)).toEqual({
        status: 404,
        body: { error: 'unknown_account', at: 0, kind: 'patchPerson' },
      });
    }
    expect(bindings().every(({ account_id }) => account_id === null)).toBe(true);
  });

  it('leaves a rename sent beside a refused account unapplied', async () => {
    const answer = await h.call('dany', 'POST', '/api/directory/commands', {
      commands: [
        {
          kind: 'patchPerson',
          personId: 'claire',
          patch: { name: 'Renamed', accountId: 'nobody' },
        },
      ],
    });
    expect(answer).toEqual({
      status: 404,
      body: { error: 'unknown_account', at: 0, kind: 'patchPerson' },
    });
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM person_organization WHERE resource_id = 'claire'",
        )
        .get(),
    ).toEqual({ name: 'claire' });
  });

  it('refuses an accountId that is neither an id nor null', async () => {
    const answer = await bind('dany', 'claire', 7);
    expect(answer.status).toBe(400);
    expect(answer.body).toMatchObject({ error: 'accountId_must_be_id_or_null' });
  });
});
