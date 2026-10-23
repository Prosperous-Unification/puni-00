import { ProjectRepository } from '@wbs/store-sqlite/project';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The claims read (`GET /api/projects/:id/claims`, `wbs-claim-display` task
 * 1.3) under organization isolation, over real SQLite and the production
 * organization access; see {@link OrganizationHarness}. Rows and claims are
 * seeded as SQL: the command tests cover the writes.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
// Step ids whose lexical order is the reverse of project step order: both
// stores answer claims by step id, so only the read's own order is right.
const dev = 'step-z-dev';
const qa = 'step-a-qa';

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
  for (const [id, name, position] of [
    [dev, 'Build', -20],
    [qa, 'Check', -10],
  ] as const) {
    h.sqlite.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, ?)', [
      id,
      own,
      name,
      position,
    ]);
  }
  for (const [id, name] of [
    ['pe-claire', 'Claire'],
    ['pe-codex', 'codex-fleet'],
  ] as const) {
    h.sqlite.run('INSERT INTO person (id, name) VALUES (?, ?)', [id, `root-${id}`]);
    h.sqlite.run(
      'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
      [id, 'org-a', name],
    );
  }
  for (const [id, parent, position, frozen, hold] of [
    ['w-080', null, 0, '080', null],
    ['w-080-1', 'w-080', 0, null, 'blocked'],
    ['w-080-2', 'w-080', 1, null, null],
  ] as const) {
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name, frozen_number, hold) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, own, parent, position, `Item ${id}`, frozen, hold],
    );
  }
  // Written out of tree order (the parent claim first, for its foreign key): the read orders them.
  for (const [id, workItemId, stepId, personId, parent, at, expires, revoked] of [
    ['c-subtree', 'w-080', null, 'pe-claire', null, 100, null, null],
    ['c-qa', 'w-080-2', qa, 'pe-codex', 'c-subtree', 300, 900_000, null],
    ['c-dev', 'w-080-2', dev, 'pe-codex', 'c-subtree', 200, 800_000, 500_000],
    ['c-blocked', 'w-080-1', dev, 'pe-claire', null, 150, null, null],
  ] as const) {
    h.sqlite.run(
      'INSERT INTO claim (id, work_item_id, step_id, person_id, run_id, parent_claim_id, created_at, created_by, lease_expires_at, lease_revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        workItemId,
        stepId,
        personId,
        `run-${id}`,
        parent,
        at,
        h.userId('ada'),
        expires,
        revoked,
      ],
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

/** The answer with `readAt` checked to lie between `before` and now, then dropped. */
function withoutReadAt(
  answer: { status: number; body: unknown },
  before: number,
): { status: number; body: unknown } {
  const { readAt, ...rest } = answer.body as { readAt: number };
  expect(readAt).toBeGreaterThanOrEqual(before);
  expect(readAt).toBeLessThanOrEqual(Date.now());
  return { status: answer.status, body: rest };
}

describe('the claims read', () => {
  it('lists every claim in tree and step order to a member and a viewer alike', async () => {
    const before = Date.now();
    const forMember = withoutReadAt(
      await h.call('ada', 'GET', `/api/projects/${own}/claims`),
      before,
    );
    const address = (id: string, index: number) => ({
      workItemId: id,
      number: `080.${String(index)}`,
      numberIsFrozen: false,
      name: `Item ${id}`,
    });
    const claire = { personId: 'pe-claire', name: 'Claire' };
    const codex = { personId: 'pe-codex', name: 'codex-fleet' };
    expect(forMember).toEqual({
      status: 200,
      body: {
        claims: [
          {
            workItemId: 'w-080',
            number: '080',
            numberIsFrozen: true,
            name: 'Item w-080',
            stepId: null,
            claimId: 'c-subtree',
            holder: claire,
            runId: 'run-c-subtree',
            parentClaimId: null,
            claimedAt: 100,
            leaseExpiresAt: null,
            leaseRevokedAt: null,
          },
          {
            ...address('w-080-1', 1),
            stepId: dev,
            claimId: 'c-blocked',
            holder: claire,
            runId: 'run-c-blocked',
            parentClaimId: null,
            claimedAt: 150,
            leaseExpiresAt: null,
            leaseRevokedAt: null,
          },
          {
            ...address('w-080-2', 2),
            stepId: dev,
            claimId: 'c-dev',
            holder: codex,
            runId: 'run-c-dev',
            parentClaimId: 'c-subtree',
            claimedAt: 200,
            leaseExpiresAt: 800_000,
            leaseRevokedAt: 500_000,
          },
          {
            ...address('w-080-2', 2),
            stepId: qa,
            claimId: 'c-qa',
            holder: codex,
            runId: 'run-c-qa',
            parentClaimId: 'c-subtree',
            claimedAt: 300,
            leaseExpiresAt: 900_000,
            leaseRevokedAt: null,
          },
        ],
      },
    });
    expect(
      withoutReadAt(await h.call('vic', 'GET', `/api/projects/${own}/claims`), before),
    ).toEqual(forMember);
  });

  it('answers an unclaimed project with an empty list', async () => {
    const before = Date.now();
    const answer = await h.call('grace', 'GET', `/api/projects/${foreign}/claims`);
    expect(withoutReadAt(answer, before)).toEqual({ status: 200, body: { claims: [] } });
  });

  it('refuses a stranger exactly as the tree read does', async () => {
    for (const tail of ['work-items', 'claims']) {
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
    expect(await h.call('vic', 'GET', `/api/projects/${own}/claims`)).toEqual(tree);
  });

  it('refuses a member removed between admission and the observation, as the tree read does', async () => {
    // The admission reads the project's cross references after resolving
    // access; the membership goes there, before the claims observation.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the seam calls it with its own repository receiver.
    const original = ProjectRepository.prototype.findCrossReferences;
    let revoke = true;
    const seam = spyOn(ProjectRepository.prototype, 'findCrossReferences').mockImplementation(
      async function (this: ProjectRepository, projectId, organizationId) {
        const crossing = await original.call(this, projectId, organizationId);
        if (revoke) {
          revoke = false;
          h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
        }
        return crossing;
      },
    );
    try {
      expect(await h.call('ada', 'GET', `/api/projects/${own}/claims`)).toEqual({
        status: 403,
        body: { error: 'not_a_member' },
      });
      expect(revoke).toBe(false);
    } finally {
      seam.mockRestore();
    }
  });

  it('answers while the tree read is refused engine_unavailable', async () => {
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [own],
    );
    expect(await h.call('ada', 'GET', `/api/projects/${own}/work-items`)).toEqual({
      status: 409,
      body: { error: 'engine_unavailable', engine: 'optimized' },
    });
    const answer = await h.call('ada', 'GET', `/api/projects/${own}/claims`);
    expect(answer.status).toBe(200);
    expect((answer.body as { claims: { claimId: string }[] }).claims.map((c) => c.claimId)).toEqual(
      ['c-subtree', 'c-blocked', 'c-dev', 'c-qa'],
    );
  });
});
