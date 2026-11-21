import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../../ports/edit-admission';
import type { AccessRefused } from '../../ports/shared-people-values';
import type { WorkItem } from '../../ports/work-item-store';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { seedLegacyPackageParent } from '../../testing/legacy-package-source-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import type { WorkPackageClaims } from './work-package-claims';

const OWNER = 'account-f';
const LEGACY = { kind: 'legacy' } as const;
const READ_AT = 777_000;
const fixtures: ReturnType<typeof openMemorySourceFixture>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.source.close();
});

/**
 * A work package inheriting authored catalogue steps Dev and QA over the memory source, its
 * clock stopped at {@link READ_AT}, and the writes the scenarios need.
 */
async function seeded() {
  const fixture = openMemorySourceFixture();
  fixtures.push(fixture);
  const { source } = fixture;
  const graph = servicesOver(source.stores, {
    admission: LEGACY_EDIT_ADMISSION,
    dependencyContext: createLocalDependencyContext(source.stores),
    clock: clockOf({ now: () => READ_AT, newId: () => crypto.randomUUID() }),
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  await source.stores.users.create(
    { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: OWNER },
  );
  seedLegacyPackageParent(fixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: OWNER,
  });
  // Step ids whose lexical order is the reverse of work package step order, so a
  // read ordered by step id (as both stores answer claims) reads the wrong way.
  const dev = 'step-z-dev';
  const qa = 'step-a-qa';
  for (const [id, name, position] of [
    [dev, 'Dev', 10],
    [qa, 'QA', 20],
  ] as const)
    expect(
      (
        await source.stores.stepCatalogue.defineAndBindStep(
          'fixture-legacy-org',
          {
            id,
            name,
            code: id,
            position,
            defaultAllowancePercent: 0,
            defaultEstimateUnit: 'workdays',
          },
          {
            bindingId: id + ':binding',
            scopeKind: 'project',
            scopeId: 'fixture-project',
            workItemTypeId: null,
            position,
          },
          { at: 1, by: OWNER },
        )
      ).ok,
    ).toBe(true);
  const created = await source.stores.workPackages.create(
    workPackageRow({
      id: 'p-claims',
      projectId: 'fixture-project',
      name: 'Claims',
    }),
    [],
    { at: 1, by: OWNER },
  );
  if (typeof created === 'string') throw new Error(`seed work package refused: ${created}`);
  const workPackageId = created.id;
  expect((await source.stores.workPackages.stepsOf(workPackageId)).map(({ id }) => id)).toEqual([
    dev,
    qa,
  ]);
  for (const id of ['claire', 'claire-worker', 'codex-fleet', 'ada']) {
    await source.stores.directory.addPerson({ id, name: `${id} name`, kind: 'agent' }, [], {
      at: 1,
      by: OWNER,
    });
  }
  const insert = async (row: Partial<WorkItem> & { id: string }) => {
    await source.stores.workItems.insert(workItemRow({ workPackageId, ...row }), [], {
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
  const read = () => graph.workItems.claimsWithin(workPackageId, LEGACY);
  return { fixture, source, graph, workPackageId, dev, qa, insert, claim, read };
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

/** The read's answer, refusing the two outcomes a scenario does not expect. */
function answered(answer: WorkPackageClaims | AccessRefused | null): WorkPackageClaims {
  if (answer === null) throw new Error('the read answered not found');
  if ('kind' in answer) throw new Error(`the read refused ${answer.refusal}`);
  return answer;
}

describe('the claims read', () => {
  it('lists every claim whatever its leaf status, the subtree claim first, in tree then step order', async () => {
    const { read } = await swarm();
    const answer = answered(await read());
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
    const answer = answered(await read());
    expect(answer.readAt).toBe(READ_AT);
    expect(answer.claims.filter(({ claimId }) => ['c-9', 'c-3', 'c-2'].includes(claimId))).toEqual([
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
    const answer = answered(await read());
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

  it('answers an unclaimed work package with no claims, and an absent one as not found', async () => {
    const { graph, source, workPackageId, read } = await seeded();
    expect(await read()).toEqual({ readAt: READ_AT, claims: [] });
    // The memory source holds no organization membership to recheck.
    const scoped = {
      principal: { id: OWNER },
      kind: 'scoped',
      scope: { cap: null, organizationId: 'org', userId: OWNER, role: 'admin' },
    } as const;
    const misuse = await source.stores.claims.observeWorkPackage(workPackageId, scoped).then(
      () => 'answered',
      (error: unknown) => String(error),
    );
    expect(misuse).toContain('no organization reads');
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
