import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { WorkItem } from '../../ports/work-item-store';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';

const OWNER = 'account-f';
const LEGACY = { kind: 'legacy' } as const;
const READ_AT = 777_000;

/**
 * A project with its starting steps Dev and QA over the memory source, its
 * clock stopped at {@link READ_AT}, and the writes the scenarios need.
 */
async function seeded() {
  const fixture = openMemorySourceFixture();
  const { source } = fixture;
  const graph = servicesOver(source.stores, {
    admission: CREATOR_ADMISSION,
    clock: clockOf({ now: () => READ_AT, newId: () => crypto.randomUUID() }),
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  await source.stores.users.create(
    { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: OWNER },
  );
  const created = await graph.projects.create('Claims', OWNER);
  const projectId = created.project.id;
  // The memory source keeps a project's steps apart from the step table its progress reads.
  for (const step of created.steps) {
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: OWNER },
    );
  }
  const stepIds = (await source.stores.projects.stepsOf(projectId)).map(({ id }) => id);
  const dev = stepIds.at(0);
  const qa = stepIds.at(1);
  if (dev === undefined || qa === undefined) throw new Error('the project has no Dev and QA');
  for (const id of ['claire', 'claire-worker', 'codex-fleet', 'ada']) {
    await source.stores.directory.addPerson({ id, name: `${id} name`, kind: 'agent' }, [], {
      at: 1,
      by: OWNER,
    });
  }
  const insert = async (row: Partial<WorkItem> & { id: string }) => {
    await source.stores.workItems.insert(workItemRow({ projectId, ...row }), [], {
      at: 1,
      by: OWNER,
    });
  };
  const claim = async (
    id: string,
    workItemId: string,
    stepId: string | null,
    personId: string,
    options: { at?: number; parentClaimId?: string; leaseExpiresAt?: number } = {},
  ) => {
    const { at = 100, parentClaimId = null, leaseExpiresAt } = options;
    expect(
      await source.stores.claims.add(
        [{ id, workItemId, stepId, personId, runId: `run-${id}`, parentClaimId, accountId: OWNER }],
        [],
        { at, by: OWNER },
        [],
        leaseExpiresAt === undefined ? [] : [{ claimId: id, expiresAt: leaseExpiresAt }],
      ),
    ).toBe('written');
  };
  const read = () => graph.workItems.claimsWithin(projectId, LEGACY);
  return { fixture, source, graph, projectId, dev, qa, insert, claim, read };
}

/**
 * `080` (frozen) over a blocked leaf and an on-hold leaf, then a done leaf and
 * a free one; claims written in neither tree nor id order.
 */
async function swarm() {
  const seed = await seeded();
  const { source, dev, qa, insert, claim } = seed;
  await insert({ id: 'w-080', position: 1, frozenNumber: '080', name: 'Billing' });
  await insert({ id: 'w-blocked', parentId: 'w-080', position: 1, hold: 'blocked', name: 'A' });
  await insert({ id: 'w-on-hold', parentId: 'w-080', position: 2, hold: 'on_hold', name: 'B' });
  await insert({ id: 'w-done', position: 2, name: 'Done' });
  await insert({ id: 'w-free', position: 3, name: 'Free' });
  for (const stepId of [dev, qa]) {
    await source.stores.progress.set(
      { workItemId: 'w-done', stepId, state: 'done', statedAt: 1 },
      { at: 1, by: OWNER },
    );
  }
  await claim('c-0', 'w-done', qa, 'ada', { at: 150, leaseExpiresAt: 900_000 });
  await claim('c-9', 'w-080', null, 'claire', { at: 110 });
  await claim('c-1', 'w-on-hold', qa, 'claire-worker', { at: 120, parentClaimId: 'c-9' });
  await claim('c-2', 'w-on-hold', dev, 'codex-fleet', { at: 130, parentClaimId: 'c-9' });
  await claim('c-3', 'w-blocked', dev, 'codex-fleet', { at: 140, leaseExpiresAt: 900_000 });
  return seed;
}

describe('the claims read', () => {
  it('lists every claim whatever its leaf status, the subtree claim first, in tree then step order', async () => {
    const { read } = await swarm();
    const answer = await read();
    if (answer === null) throw new Error('the read answered not found');
    expect(answer.claims.map(({ claimId }) => claimId)).toEqual([
      'c-9',
      'c-3',
      'c-2',
      'c-1',
      'c-0',
    ]);
  });

  it('answers each claim with its address, holder, run, parent and lease, and the read instant', async () => {
    const { dev, read } = await swarm();
    const answer = await read();
    if (answer === null) throw new Error('the read answered not found');
    expect(answer.readAt).toBe(READ_AT);
    expect(answer.claims.slice(0, 3)).toEqual([
      {
        workItemId: 'w-080',
        number: '080',
        numberIsFrozen: true,
        name: 'Billing',
        stepId: null,
        claimId: 'c-9',
        holder: { personId: 'claire', name: 'claire name' },
        runId: 'run-c-9',
        parentClaimId: null,
        claimedAt: 110,
        leaseExpiresAt: null,
        leaseRevokedAt: null,
      },
      {
        workItemId: 'w-blocked',
        number: '080.1',
        numberIsFrozen: false,
        name: 'A',
        stepId: dev,
        claimId: 'c-3',
        holder: { personId: 'codex-fleet', name: 'codex-fleet name' },
        runId: 'run-c-3',
        parentClaimId: null,
        claimedAt: 140,
        leaseExpiresAt: 900_000,
        leaseRevokedAt: null,
      },
      {
        workItemId: 'w-on-hold',
        number: '080.2',
        numberIsFrozen: false,
        name: 'B',
        stepId: dev,
        claimId: 'c-2',
        holder: { personId: 'codex-fleet', name: 'codex-fleet name' },
        runId: 'run-c-2',
        parentClaimId: 'c-9',
        claimedAt: 130,
        leaseExpiresAt: null,
        leaseRevokedAt: null,
      },
    ]);
  });

  it('reads a revoked lease with its revocation instant beside the moved expiry', async () => {
    const { fixture, read } = await swarm();
    expect(fixture.endLeasesOf('codex-fleet', 600_000)).toBe(1);
    const answer = await read();
    if (answer === null) throw new Error('the read answered not found');
    const leases = answer.claims.map(({ claimId, leaseExpiresAt, leaseRevokedAt }) => ({
      claimId,
      leaseExpiresAt,
      leaseRevokedAt,
    }));
    expect(leases).toEqual([
      { claimId: 'c-9', leaseExpiresAt: null, leaseRevokedAt: null },
      { claimId: 'c-3', leaseExpiresAt: 600_000, leaseRevokedAt: 600_000 },
      { claimId: 'c-2', leaseExpiresAt: null, leaseRevokedAt: null },
      { claimId: 'c-1', leaseExpiresAt: null, leaseRevokedAt: null },
      { claimId: 'c-0', leaseExpiresAt: 900_000, leaseRevokedAt: null },
    ]);
  });

  it('answers an unclaimed project with no claims, and an absent one as not found', async () => {
    const { graph, read } = await seeded();
    expect(await read()).toEqual({ readAt: READ_AT, claims: [] });
    expect(await graph.workItems.claimsWithin('missing', LEGACY)).toBeNull();
  });

  it('throws for a holder the read cannot name', async () => {
    const { insert, claim, dev, read } = await seeded();
    await insert({ id: 'w-1', position: 1 });
    await claim('c-ghost', 'w-1', dev, 'nobody');
    const failure = await read().then(
      () => 'answered',
      (error: unknown) => String(error),
    );
    expect(failure).toContain('person nobody has no name in this read');
  });
});
