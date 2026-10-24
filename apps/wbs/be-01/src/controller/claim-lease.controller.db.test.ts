import { CLAIM_LEASE_MS } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { type Answer, OrganizationHarness } from '../testing/organization-harness';

const T = 1_900_000_000_000;
let now = T;
let h: OrganizationHarness;
let projectId: string;
let leaf: string;
let stepId: string;
let key: string;
let credentialId: string;
let pushed: { subscription: string; seq?: number; message: { type: string } }[];

/**
 * Claim leases over HTTP (`wbs-claim-leases` L1, L4, L8, L12, L13) through
 * be-01's production composition and real SQLite, with the services clock
 * held at `now`: an agent's API-key claim carries a lease the reads show, its
 * heartbeat renews it, a session heartbeat is refused, and revoking its last
 * key releases its claims on the sweep tick the revoke asks for.
 */
beforeEach(async () => {
  now = T;
  pushed = [];
  h = OrganizationHarness.openComposedWith({
    now: () => now,
    pushFetch: (_url, init) => {
      // The push client's body is the JSON string it serialized; read it back.
      if (typeof init?.body !== 'string') throw new Error('a push carried no JSON body');
      pushed.push(JSON.parse(init.body) as (typeof pushed)[number]);
      return Promise.resolve(Response.json({ delivered_to_sockets: 1 }));
    },
  });
  await h.register('dany');
  h.organization('org-a');
  h.member('org-a', 'dany', 'super_admin');
  h.bind('dany', 'org-a');
  h.activate();
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Plan of A' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  const plan = created.body as { project: { id: string }; steps: { id: string }[] };
  projectId = plan.project.id;
  const firstStep = plan.steps.at(0);
  if (firstStep === undefined) throw new Error('project omitted its first workflow step');
  stepId = firstStep.id;
  const rows = await h.call('dany', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Leaf' }],
  });
  if (rows.status !== 200) throw new Error(`leaf refused: ${JSON.stringify(rows)}`);
  leaf = (rows.body as { results: { id: string }[] }).results[0]?.id ?? '';
  addAgentPerson(h.sqlite, 'codex', 'org-a', h.userId('dany'));
  const issued = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'codex',
    issuedBy: h.userId('dany'),
  });
  key = issued.key;
  credentialId = issued.id;
});

afterEach(async () => {
  await h.closeComposed();
});

function asAgent(method: string, path: string, body?: unknown): Promise<Answer> {
  return h.callWith(key, method, path, body);
}

async function claimAsAgent(): Promise<void> {
  const claimed = await asAgent('POST', `/api/projects/${projectId}/commands`, {
    commands: [
      {
        kind: 'claimWorkItem',
        workItemId: leaf,
        personId: 'codex',
        runId: 'run-1',
        steps: [stepId],
      },
    ],
  });
  if (claimed.status !== 200) throw new Error(`claim refused: ${JSON.stringify(claimed)}`);
}

function claims(): number {
  return h.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM claim').get()?.n ?? -1;
}

/**
 * The projects each pushed `claims_changed` was announced to, in push order.
 * Each is transient (C21): pushed with no sequence, and never in the event log.
 */
function claimsChangedProjects(): string[] {
  const recorded = h.sqlite
    .query<{ message: string }, []>('SELECT message FROM event_log')
    .all()
    .filter(({ message }) => (JSON.parse(message) as { type: string }).type === 'claims_changed');
  if (recorded.length > 0)
    throw new Error(`claims_changed recorded ${String(recorded.length)} times`);
  const announced = pushed.filter(({ message }) => message.type === 'claims_changed');
  const sequenced = announced.find(({ seq }) => seq !== undefined);
  if (sequenced !== undefined)
    throw new Error(`claims_changed pushed at seq ${String(sequenced.seq)}`);
  return announced.map(({ subscription }) => subscription.slice('project:'.length));
}

async function createLeaf(name: string): Promise<{ project: string; leaf: string; step: string }> {
  const created = await h.call('dany', 'POST', '/api/projects', { name });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  const plan = created.body as { project: { id: string }; steps: { id: string }[] };
  const project = plan.project.id;
  const step = plan.steps.at(0)?.id;
  if (step === undefined) throw new Error('project omitted its first workflow step');
  const rows = await h.call('dany', 'POST', `/api/projects/${project}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Leaf' }],
  });
  if (rows.status !== 200) throw new Error(`leaf refused: ${JSON.stringify(rows)}`);
  return { project, leaf: (rows.body as { results: { id: string }[] }).results[0]?.id ?? '', step };
}

/** Adds an independent eligible leaf so renewal must deduplicate two moved leases per project. */
async function claimAnother(project: string, step: string, runId: string): Promise<void> {
  const created = await h.call('dany', 'POST', `/api/projects/${project}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: runId }],
  });
  if (created.status !== 200) throw new Error(`second leaf refused: ${JSON.stringify(created)}`);
  const workItemId = (created.body as { results: { id: string }[] }).results.at(0)?.id;
  if (workItemId === undefined) throw new Error('second leaf absent');
  const claimed = await asAgent('POST', `/api/projects/${project}/commands`, {
    commands: [{ kind: 'claimWorkItem', workItemId, personId: 'codex', runId, steps: [step] }],
  });
  if (claimed.status !== 200) throw new Error(`second claim refused: ${JSON.stringify(claimed)}`);
}

describe('a claim lease over HTTP', () => {
  it("shows an agent's lease on the person-work and startable reads", async () => {
    await claimAsAgent();
    const work = await asAgent('GET', `/api/projects/${projectId}/people/codex/work`);
    expect(work.status).toBe(200);
    const held = (work.body as { claims: { leaseExpiresAt: number | null }[] }).claims;
    expect(held.map(({ leaseExpiresAt }) => leaseExpiresAt)).toEqual([T + CLAIM_LEASE_MS]);
    const startable = await asAgent('GET', `/api/projects/${projectId}/startable`);
    expect(startable.status).toBe(200);
    const claimed = (startable.body as { claimed: { leaseExpiresAt: number | null }[] }).claimed;
    expect(claimed.map(({ leaseExpiresAt }) => leaseExpiresAt)).toEqual([T + CLAIM_LEASE_MS]);
  });

  it('renews on an agent heartbeat and refuses a session heartbeat not_pinned', async () => {
    await claimAsAgent();
    now = T + 2 * 60_000;
    expect(await asAgent('POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leases: 1, leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
    expect(await h.call('dany', 'POST', '/api/claims/renew')).toMatchObject({
      status: 403,
      body: { error: 'not_pinned' },
    });
  });

  // Proof: with the revoke route's `afterRevoke()` call removed, and again
  // with app.ts handing the route a no-op in place of `requestSweep`, the
  // claims were still held once the sweep settled (2 pass, 1 fail each);
  // watched 2026-10-23.
  it('releases a revoked agent’s claims on the tick the revoke asks for', async () => {
    await claimAsAgent();
    const sweep = h.claimLeaseSweep();
    sweep.start();
    await sweep.settled();
    expect(claims()).toBe(1);
    now = T + 60_000;
    expect(
      await h.call('dany', 'DELETE', `/api/organization/machine-credentials/${credentialId}`),
    ).toMatchObject({ status: 204 });
    await sweep.settled();
    expect(claims()).toBe(0);
    const history = await h.call('dany', 'GET', `/api/projects/${projectId}/history`);
    expect(JSON.stringify(history.body)).toContain('(credential revoked)');
  });
});

/**
 * The heartbeat's announcement (`wbs-claim-display` C4): one type-only
 * `claims_changed` per project in which the renewal moved a lease, recorded
 * after the renewal commits, and nothing when nothing moved.
 */
describe('a heartbeat announcing claims_changed', () => {
  it('announces once to each project whose lease moved', async () => {
    await claimAsAgent();
    const other = await createLeaf('Plan of A, second');
    const claimed = await asAgent('POST', `/api/projects/${other.project}/commands`, {
      commands: [
        {
          kind: 'claimWorkItem',
          workItemId: other.leaf,
          personId: 'codex',
          runId: 'run-2',
          steps: [other.step],
        },
      ],
    });
    expect(claimed.status).toBe(200);
    await claimAnother(projectId, stepId, 'run-3');
    await claimAnother(other.project, other.step, 'run-4');
    expect(claims()).toBe(4);
    expect(claimsChangedProjects()).toEqual([]);
    now = T + 2 * 60_000;
    expect(await asAgent('POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leases: 4, leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
    // Proof: omitting SQLite's moved-project Set made this actual composed
    // heartbeat announce [A,A,B,B] instead of [A,B] (1 fail), then restored.
    expect(claimsChangedProjects().sort()).toEqual([projectId, other.project].sort());
  });

  it('announces nothing for a heartbeat within the minute, nor a refused one', async () => {
    await claimAsAgent();
    await claimAnother(projectId, stepId, 'run-2');
    expect(claims()).toBe(2);
    now = T + 2 * 60_000;
    expect((await asAgent('POST', '/api/claims/renew')).status).toBe(200);
    expect(claimsChangedProjects()).toEqual([projectId]);
    now = T + 2 * 60_000 + 30_000;
    expect(await asAgent('POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leases: 2, leaseExpiresAt: T + 2 * 60_000 + CLAIM_LEASE_MS },
    });
    now = T + 4 * 60_000;
    expect(await h.call('dany', 'POST', '/api/claims/renew')).toMatchObject({
      status: 403,
      body: { error: 'not_pinned' },
    });
    expect(claimsChangedProjects()).toEqual([projectId]);
  });

  it('announces nothing when the renewal rolls back', async () => {
    await claimAsAgent();
    h.sqlite.run(
      `CREATE TRIGGER refuse_renewal BEFORE UPDATE OF lease_expires_at ON claim
       BEGIN SELECT RAISE(ABORT, 'renewal refused'); END`,
    );
    now = T + 2 * 60_000;
    const refused = await asAgent('POST', '/api/claims/renew');
    h.sqlite.run('DROP TRIGGER refuse_renewal');
    expect(claimsChangedProjects()).toEqual([]);
    expect(refused.status).toBe(500);
    expect(
      h.sqlite.query<{ at: number }, []>('SELECT min(lease_expires_at) AS at FROM claim').get()?.at,
    ).toBe(T + CLAIM_LEASE_MS);
  });
});

/**
 * A batch's own renewal (`wbs-claim-display` C19): the agent's leases in other
 * projects move with it, so each such project hears one `claims_changed` after
 * the batch commits; the batch's own project hears its `tree_replaced` alone.
 */
describe('a batch renewal announcing claims_changed elsewhere', () => {
  let other: { project: string; leaf: string; step: string };

  beforeEach(async () => {
    await claimAsAgent();
    other = await createLeaf('Plan of A, second');
    const claimed = await asAgent('POST', `/api/projects/${other.project}/commands`, {
      commands: [
        {
          kind: 'claimWorkItem',
          workItemId: other.leaf,
          personId: 'codex',
          runId: 'run-2',
          steps: [other.step],
        },
      ],
    });
    if (claimed.status !== 200) throw new Error(`claim refused: ${JSON.stringify(claimed)}`);
    await claimAnother(projectId, stepId, 'run-3');
    await claimAnother(other.project, other.step, 'run-4');
    expect(claims()).toBe(4);
  });

  function renameAsAgent(workItemId: string, name: string): Promise<Answer> {
    return asAgent('POST', `/api/projects/${projectId}/commands`, {
      commands: [{ kind: 'patchWorkItem', workItemId, patch: { name } }],
    });
  }

  it('announces once to each other project, none extra to its own', async () => {
    expect(claimsChangedProjects()).toEqual([]);
    now = T + 2 * 60_000;
    expect((await renameAsAgent(leaf, 'Leaf, renamed')).status).toBe(200);
    expect(claimsChangedProjects()).toEqual([other.project]);
    expect(
      h.sqlite.query<{ at: number }, []>('SELECT min(lease_expires_at) AS at FROM claim').get()?.at,
    ).toBe(now + CLAIM_LEASE_MS);
  });

  it('announces its own project for a batch that changed no row', async () => {
    now = T + 2 * 60_000;
    const empty = await asAgent('POST', `/api/projects/${projectId}/commands`, { commands: [] });
    expect(empty.status).toBe(200);
    expect(claimsChangedProjects().sort()).toEqual([projectId, other.project].sort());
    now = T + 4 * 60_000;
    const tagged = await asAgent('POST', `/api/projects/${projectId}/commands`, {
      commands: [{ kind: 'createTag', name: 'swarm' }],
    });
    expect(tagged.status).toBe(200);
    expect(claimsChangedProjects().filter((each) => each === projectId)).toHaveLength(2);
  });

  it('announces nothing within the minute', async () => {
    now = T + 2 * 60_000;
    expect((await renameAsAgent(leaf, 'Leaf, renamed')).status).toBe(200);
    now = T + 2 * 60_000 + 30_000;
    expect((await renameAsAgent(leaf, 'Leaf, again')).status).toBe(200);
    expect(claimsChangedProjects()).toEqual([other.project]);
  });

  it('announces nothing for a refused batch', async () => {
    now = T + 2 * 60_000;
    expect((await renameAsAgent('no-such-item', 'Ghost')).status).not.toBe(200);
    expect(claimsChangedProjects()).toEqual([]);
  });

  it('announces nothing when the batch rolls back', async () => {
    h.sqlite.run(
      `CREATE TRIGGER refuse_renewal BEFORE UPDATE OF lease_expires_at ON claim
       BEGIN SELECT RAISE(ABORT, 'renewal refused'); END`,
    );
    now = T + 2 * 60_000;
    const refused = await renameAsAgent(leaf, 'Leaf, renamed');
    h.sqlite.run('DROP TRIGGER refuse_renewal');
    expect(claimsChangedProjects()).toEqual([]);
    expect(refused.status).toBe(500);
    expect(
      h.sqlite
        .query<{ name: string }, [string]>('SELECT name FROM work_item WHERE id = ?')
        .get(leaf)?.name,
    ).toBe('Leaf');
  });
});
