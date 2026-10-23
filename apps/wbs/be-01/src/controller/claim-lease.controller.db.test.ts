import { CLAIM_LEASE_MS } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { type Answer, OrganizationHarness } from '../testing/organization-harness';

const T = 1_900_000_000_000;
let now = T;
let h: OrganizationHarness;
let projectId: string;
let leaf: string;
let key: string;
let credentialId: string;

/**
 * Claim leases over HTTP (`wbs-claim-leases` L1, L4, L8, L12, L13) through
 * be-01's production composition and real SQLite, with the services clock
 * held at `now`: an agent's API-key claim carries a lease the reads show, its
 * heartbeat renews it, a session heartbeat is refused, and revoking its last
 * key releases its claims on the sweep tick the revoke asks for.
 */
beforeEach(async () => {
  now = T;
  h = OrganizationHarness.openComposedWith({ now: () => now });
  await h.register('dany');
  h.organization('org-a');
  h.member('org-a', 'dany', 'super_admin');
  h.bind('dany', 'org-a');
  h.activate();
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Plan of A' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  projectId = (created.body as { project: { id: string } }).project.id;
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
    commands: [{ kind: 'claimWorkItem', workItemId: leaf, personId: 'codex', runId: 'run-1' }],
  });
  if (claimed.status !== 200) throw new Error(`claim refused: ${JSON.stringify(claimed)}`);
}

function claims(): number {
  return h.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM claim').get()?.n ?? -1;
}

/** The projects each recorded `claims_changed` was announced to, in record order. */
function claimsChangedProjects(): string[] {
  return h.sqlite
    .query<{ subscription: string; message: string }, []>(
      'SELECT subscription, message FROM event_log ORDER BY id',
    )
    .all()
    .filter(({ message }) => (JSON.parse(message) as { type: string }).type === 'claims_changed')
    .map(({ subscription }) => subscription.slice('project:'.length));
}

async function createLeaf(name: string): Promise<{ project: string; leaf: string }> {
  const created = await h.call('dany', 'POST', '/api/projects', { name });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  const project = (created.body as { project: { id: string } }).project.id;
  const rows = await h.call('dany', 'POST', `/api/projects/${project}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Leaf' }],
  });
  if (rows.status !== 200) throw new Error(`leaf refused: ${JSON.stringify(rows)}`);
  return { project, leaf: (rows.body as { results: { id: string }[] }).results[0]?.id ?? '' };
}

describe('a claim lease over HTTP', () => {
  it("shows an agent's lease on the person-work and startable reads", async () => {
    await claimAsAgent();
    const work = await asAgent('GET', `/api/projects/${projectId}/people/codex/work`);
    expect(work.status).toBe(200);
    const held = (work.body as { claims: { leaseExpiresAt: number | null }[] }).claims;
    expect(held.map(({ leaseExpiresAt }) => leaseExpiresAt)).toEqual([
      T + CLAIM_LEASE_MS,
      T + CLAIM_LEASE_MS,
    ]);
    const startable = await asAgent('GET', `/api/projects/${projectId}/startable`);
    expect(startable.status).toBe(200);
    const claimed = (startable.body as { claimed: { leaseExpiresAt: number | null }[] }).claimed;
    expect(claimed.map(({ leaseExpiresAt }) => leaseExpiresAt)).toEqual([
      T + CLAIM_LEASE_MS,
      T + CLAIM_LEASE_MS,
    ]);
  });

  it('renews on an agent heartbeat and refuses a session heartbeat not_pinned', async () => {
    await claimAsAgent();
    now = T + 2 * 60_000;
    expect(await asAgent('POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leases: 2, leaseExpiresAt: now + CLAIM_LEASE_MS },
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
    expect(claims()).toBe(2);
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
        { kind: 'claimWorkItem', workItemId: other.leaf, personId: 'codex', runId: 'run-2' },
      ],
    });
    expect(claimed.status).toBe(200);
    expect(claimsChangedProjects()).toEqual([]);
    now = T + 2 * 60_000;
    expect(await asAgent('POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leases: 4, leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
    expect(claimsChangedProjects().sort()).toEqual([projectId, other.project].sort());
  });

  it('announces nothing for a heartbeat within the minute, nor a refused one', async () => {
    await claimAsAgent();
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
