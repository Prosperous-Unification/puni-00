import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The six directory lists under organization isolation (task 3.2), over real
 * SQLite and the production organization access; see {@link OrganizationHarness}.
 *
 * Catalog entries are seeded as SQL because no scoped directory write exists
 * before task 3.4. Each organization holds one entry per catalog, both shown as
 * `urgent`, over root names that are distinct opaque tokens: the legacy global
 * name indexes still hold the roots, and the side tables hold the names.
 */
let h: OrganizationHarness;

/** Each catalog's list route, root table, side table and response key. */
const CATALOGS = [
  ['/api/people', 'person', 'person_organization', 'people'],
  ['/api/teams', 'service_team', 'service_team_organization', 'teams'],
  ['/api/services', 'service', 'service_organization', 'services'],
  ['/api/tags', 'tag', 'tag_organization', 'tags'],
  ['/api/work-item-types', 'work_item_type', 'work_item_type_organization', 'workItemTypes'],
  ['/api/external-systems', 'external_system', 'external_system_organization', 'externalSystems'],
] as const;

beforeEach(async () => {
  h = OrganizationHarness.open();
  for (const username of ['ada', 'grace', 'nell']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  for (const [, root, side] of CATALOGS) {
    for (const organization of ['a', 'b']) {
      h.sqlite.run(`INSERT INTO ${root} (id, name) VALUES (?, ?)`, [
        `${organization}-${root}`,
        `token-${organization}-${root}`,
      ]);
      h.sqlite.run(`INSERT INTO ${side} (resource_id, organization_id, name) VALUES (?, ?, ?)`, [
        `${organization}-${root}`,
        `org-${organization}`,
        'urgent',
      ]);
    }
  }
  for (const organization of ['a', 'b']) {
    h.sqlite.run('INSERT INTO person_team (person_id, service_team_id) VALUES (?, ?)', [
      `${organization}-person`,
      `${organization}-service_team`,
    ]);
    h.sqlite.run('INSERT INTO team_service (team_id, service_id) VALUES (?, ?)', [
      `${organization}-service_team`,
      `${organization}-service`,
    ]);
  }
});

afterEach(() => {
  h.close();
});

/** What organization `organization` should see in one catalog: its one `urgent` entry. */
function ownEntry(organization: 'a' | 'b', root: string): Record<string, unknown> {
  const id = `${organization}-${root}`;
  if (root === 'person') {
    return { id, name: 'urgent', kind: 'person', teamIds: [`${organization}-service_team`] };
  }
  if (root === 'service_team') {
    return { id, name: 'urgent', serviceIds: [`${organization}-service`] };
  }
  return { id, name: 'urgent' };
}

describe('before activation', () => {
  it('lists every catalog deployment-wide under the legacy names', async () => {
    for (const [path, root, , key] of CATALOGS) {
      const answer = await h.call('ada', 'GET', path);
      expect(answer.status).toBe(200);
      const names = (answer.body as Record<string, { name: string }[]>)[key].map((e) => e.name);
      expect({ path, names: names.filter((name) => name.endsWith(root)) }).toEqual({
        path,
        names: [`token-a-${root}`, `token-b-${root}`],
      });
    }
  });
});

describe('after activation', () => {
  it("lists only the organization's own entries under their local names", async () => {
    h.activate();
    for (const [path, root, , key] of CATALOGS) {
      for (const [username, organization] of [
        ['ada', 'a'],
        ['grace', 'b'],
      ] as const) {
        expect({ path, username, ...(await h.call(username, 'GET', path)) }).toEqual({
          path,
          username,
          status: 200,
          body: { [key]: [ownEntry(organization, root)] },
        });
      }
    }
  });

  it('scopes the same running app once another connection activates isolation', async () => {
    expect(
      ((await h.call('ada', 'GET', '/api/tags')).body as { tags: unknown[] }).tags,
    ).toHaveLength(2);
    h.activate();
    expect(await h.call('ada', 'GET', '/api/tags')).toEqual({
      status: 200,
      body: { tags: [{ id: 'a-tag', name: 'urgent' }] },
    });
  });

  it('refuses a team-service link that crosses organizations', async () => {
    h.activate();
    h.sqlite.run(
      "INSERT INTO team_service (team_id, service_id) VALUES ('a-service_team', 'b-service')",
    );
    expect((await h.call('ada', 'GET', '/api/teams')).status).toBe(500);
  });

  it('refuses a team-service link whose service has no owner', async () => {
    h.activate();
    h.sqlite.run("DELETE FROM service_organization WHERE resource_id = 'a-service'");
    expect((await h.call('ada', 'GET', '/api/teams')).status).toBe(500);
  });

  it('refuses a membership whose team has no owner', async () => {
    h.activate();
    h.sqlite.run("DELETE FROM service_team_organization WHERE resource_id = 'a-service_team'");
    expect((await h.call('ada', 'GET', '/api/people')).status).toBe(500);
  });

  it('orders each list by the local name, not the root name, id or insertion', async () => {
    for (const [, root, side] of CATALOGS) {
      h.sqlite.run(`INSERT INTO ${root} (id, name) VALUES (?, ?)`, [`a0-${root}`, `zzz-${root}`]);
      h.sqlite.run(`INSERT INTO ${side} (resource_id, organization_id, name) VALUES (?, ?, ?)`, [
        `a0-${root}`,
        'org-a',
        'alpha',
      ]);
    }
    h.activate();
    for (const [path, root, , key] of CATALOGS) {
      const listed = (await h.call('ada', 'GET', path)).body as Record<
        string,
        { id: string; name: string }[]
      >;
      expect({ path, order: listed[key].map((entry) => [entry.id, entry.name]) }).toEqual({
        path,
        order: [
          [`a0-${root}`, 'alpha'],
          [`a-${root}`, 'urgent'],
        ],
      });
    }
  });

  it('refuses a membership that crosses organizations', async () => {
    h.activate();
    h.sqlite.run(
      "INSERT INTO person_team (person_id, service_team_id) VALUES ('a-person', 'b-service_team')",
    );
    expect((await h.call('ada', 'GET', '/api/people')).status).toBe(500);
  });

  it('refuses an unbound session and a removed member on every list', async () => {
    h.activate();
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('grace')]);
    for (const [path] of CATALOGS) {
      expect(await h.call('nell', 'GET', path)).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
      expect(await h.call('grace', 'GET', path)).toEqual({
        status: 403,
        body: { error: 'not_a_member' },
      });
      expect((await h.call('nobody', 'GET', path)).status).toBe(401);
    }
  });

  it('fails every list as a server error over a broken marker', async () => {
    h.sqlite.run('DROP TABLE organization_activation');
    for (const [path] of CATALOGS) {
      expect((await h.call('ada', 'GET', path)).status).toBe(500);
    }
  });
});
