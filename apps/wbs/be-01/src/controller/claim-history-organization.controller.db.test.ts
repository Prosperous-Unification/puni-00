import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The claim history read (`GET /api/projects/:id/claim-history`,
 * `wbs-claim-display` task 8.2) under organization isolation, over real SQLite
 * and the production organization access; see {@link OrganizationHarness}.
 * Plan events are seeded as SQL in the shapes the claim, release and lease
 * sweep write: the core claim history test covers what those writes record.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;

beforeEach(async () => {
  h = OrganizationHarness.open();
  for (const username of ['ada', 'grace', 'vic', 'nell']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  own = await create('ada', 'A plan');
  foreign = await create('grace', 'B plan');
  h.sqlite.run('INSERT INTO person (id, name) VALUES (?, ?)', ['pe-codex', 'root-pe-codex']);
  h.sqlite.run(
    'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
    ['pe-codex', 'org-a', 'codex-fleet'],
  );
  for (const [id, parent, position, frozen] of [
    ['w-080', null, 0, '080'],
    ['w-080-1', 'w-080', 0, null],
  ] as const) {
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name, frozen_number) VALUES (?, ?, ?, ?, ?, ?)',
      [id, own, parent, position, `Item ${id}`, frozen],
    );
  }
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

/** A claim as a stored command carries it. */
function storedClaim(id: string, workItemId: string, personId: string) {
  return {
    id,
    workItemId,
    stepId: null,
    personId,
    runId: `run-${id}`,
    parentClaimId: null,
    accountId: h.userId('ada'),
  };
}

/** One plan event of `projectId`, written as `record` or the lease sweep writes it. */
function writeEvent(
  projectId: string,
  id: string,
  at: number,
  kind: 'claim' | 'release',
  after: unknown,
): void {
  h.sqlite.run(
    'INSERT INTO plan_event (id, project_id, user_id, kind, label, work_item_id, step_id, before, after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, projectId, h.userId('ada'), kind, kind, null, null, 'null', JSON.stringify(after), at],
  );
}

const read = (username: string, projectId: string, query = '') =>
  h.call(username, 'GET', `/api/projects/${projectId}/claim-history${query}`);

describe('the claim history read', () => {
  it('lists claims and releases newest first, with reasons, to a member and a viewer alike', async () => {
    const codexOn080 = storedClaim('c-1', 'w-080-1', 'pe-codex');
    writeEvent(own, 'e-claim', 100, 'claim', {
      do: 'add_claims',
      claims: [codexOn080],
      stated: [],
    });
    writeEvent(own, 'e-reap', 200, 'release', {
      do: 'remove_claims',
      claims: [codexOn080],
      cleared: [],
      reason: 'lease_expired',
    });
    // A holder and an item deleted since.
    const gone = storedClaim('c-2', 'w-gone', 'pe-gone');
    writeEvent(own, 'e-gone', 300, 'release', { do: 'remove_claims', claims: [gone], cleared: [] });
    writeEvent(foreign, 'e-foreign', 400, 'release', {
      do: 'remove_claims',
      claims: [gone],
      cleared: [],
    });
    const codex = {
      claimId: 'c-1',
      workItemId: 'w-080-1',
      stepId: null,
      runId: 'run-c-1',
      holder: { personId: 'pe-codex', name: 'codex-fleet' },
      item: { number: '080.1', numberIsFrozen: false, name: 'Item w-080-1' },
    };
    const forMember = await read('ada', own);
    expect(forMember).toEqual({
      status: 200,
      body: {
        events: [
          {
            eventId: 'e-gone',
            at: 300,
            kind: 'release',
            reason: 'released',
            claims: [
              {
                claimId: 'c-2',
                workItemId: 'w-gone',
                stepId: null,
                runId: 'run-c-2',
                holder: { personId: 'pe-gone', name: null },
                item: null,
              },
            ],
          },
          { eventId: 'e-reap', at: 200, kind: 'release', reason: 'lease_expired', claims: [codex] },
          { eventId: 'e-claim', at: 100, kind: 'claim', reason: 'claimed', claims: [codex] },
        ],
      },
    });
    expect(await read('vic', own)).toEqual(forMember);
  });

  it('answers the newest 50 by default and the newest limit when asked', async () => {
    for (let index = 0; index < 60; index += 1)
      writeEvent(own, `e-${String(index).padStart(2, '0')}`, 1_000 + index, 'release', {
        do: 'remove_claims',
        claims: [storedClaim(`c-${String(index)}`, 'w-080-1', 'pe-codex')],
        cleared: [],
      });
    const ids = (answer: { body: unknown }) =>
      (answer.body as { events: { eventId: string }[] }).events.map(({ eventId }) => eventId);
    const newest = (count: number) =>
      Array.from({ length: count }, (_, index) => `e-${String(59 - index).padStart(2, '0')}`);
    expect(ids(await read('ada', own))).toEqual(newest(50));
    expect(ids(await read('ada', own, '?limit=2'))).toEqual(newest(2));
    expect(ids(await read('ada', own, '?limit=100'))).toEqual(newest(60));
  });

  it('refuses a limit outside 1 to 100 and a repeated one', async () => {
    for (const query of ['?limit=0', '?limit=101', '?limit=ten', '?limit=', '?limit=5&limit=6']) {
      expect({ query, ...(await read('ada', own, query)) }).toEqual({
        query,
        status: 400,
        body: { error: 'invalid_query' },
      });
    }
  });

  it('refuses a stranger exactly as the tree read does', async () => {
    for (const tail of ['work-items', 'claim-history']) {
      const toForeign = await h.call('ada', 'GET', `/api/projects/${foreign}/${tail}`);
      expect({ tail, ...toForeign }).toEqual({ tail, status: 404, body: { error: 'not_found' } });
      const stranger = await h.call('grace', 'GET', `/api/projects/${own}/${tail}`);
      expect({ tail, ...stranger }).toEqual({ tail, status: 404, body: { error: 'not_found' } });
      const absent = await h.call('ada', 'GET', `/api/projects/no-such-project/${tail}`);
      expect({ tail, ...absent }).toEqual({ tail, status: 404, body: { error: 'not_found' } });
      expect(await h.call('nell', 'GET', `/api/projects/${own}/${tail}`)).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
    }
  });

  it('refuses a removed member alike with the tree read', async () => {
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('vic')]);
    const tree = await h.call('vic', 'GET', `/api/projects/${own}/work-items`);
    expect(tree).toEqual({ status: 403, body: { error: 'not_a_member' } });
    expect(await read('vic', own)).toEqual(tree);
  });

  it('fails with a server error on a stored command that does not decode', async () => {
    writeEvent(own, 'e-claim', 100, 'claim', {
      do: 'add_claims',
      claims: [storedClaim('c-1', 'w-080-1', 'pe-codex')],
      stated: [],
    });
    writeEvent(own, 'e-corrupt', 200, 'release', { do: 'no_such_command' });
    expect(await read('ada', own)).toEqual({ status: 500, body: 'Internal Server Error' });
  });
});
