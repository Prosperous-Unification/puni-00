import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import { LEGACY_ACCESS } from '../../ports/organization-access';
import type { PlanEvent } from '../../ports/plan-event-values';
import type { Scope } from '../../ports/unit-of-work';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { limitOf } from '../../service/list-query';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { expectCreated } from '../../testing/expect-created';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from '../plan-commands/composition';
import { CLAIM_HISTORY_LIMIT } from './claim-history';

const F = 'account-f';

/**
 * A project with its starting steps Dev and QA; root `080` (frozen) with leaf
 * `080.1`, and a free leaf `090`, over the memory source and the real batch
 * runner, its clock moved by hand so every act has its own instant.
 */
async function seeded() {
  const fixture = openMemorySourceFixture();
  const { source } = fixture;
  const broadcast = recordingBroadcaster();
  let now = 1_000;
  const options = {
    dependencyContext: createLocalDependencyContext(source.stores),
    admission: CREATOR_ADMISSION,
    clock: clockOf({ now: () => now, newId: () => crypto.randomUUID() }),
    broadcast,
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  const created = expectCreated(await graph.projects.create('Claims', F));
  const projectId = created.project.id;
  // The memory source keeps a project's steps apart from the step table its progress reads.
  for (const step of created.steps) {
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: F },
    );
  }
  const steps = (await source.stores.projects.stepsOf(projectId)).map(({ id }) => id);
  for (const row of [
    workItemRow({ id: '080', projectId, parentId: null, position: 1, frozenNumber: '080' }),
    workItemRow({ id: '080.1', projectId, parentId: '080', position: 1, name: 'Billing' }),
    // Named like a reap's label, so a reason read off the label reads it wrong.
    workItemRow({ id: '090', projectId, parentId: null, position: 2, name: 'x (lease expired)' }),
  ])
    await source.stores.workItems.insert(row, [], { at: 1, by: F });
  // Existing in-progress nodes let history retain both workflow steps while
  // the connected execution rules continue to govern new starts.
  for (const workItemId of ['080.1', '090'])
    for (const stepId of steps)
      expect(
        await source.stores.progress.set(
          { workItemId, stepId, state: 'in_progress', statedAt: 1 },
          { at: 1, by: F },
        ),
      ).toBe('written');
  for (const id of ['claire', 'codex-fleet']) {
    await source.stores.directory.addPerson({ id, name: `${id} name`, kind: 'agent' }, [], {
      at: 1,
      by: F,
    });
    const bound = await source.stores.directory.patchPerson(id, { accountId: F }, { at: 1, by: F });
    if (!bound.ok) throw new Error(`binding ${id} was refused: ${bound.reason}`);
  }
  const runner = createPlanCommandRunner({
    uow: source.uow,
    commandAccess: localCommandAccess,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, {
        ...options,
        dependencyContext: createLocalDependencyContext(scope.stores),
        broadcast: announcements,
      }),
  });
  /** Runs one batch at the next instant and answers the claim ids it wrote, if any. */
  const run = async (commands: Parameters<typeof runner.run>[2]): Promise<string[]> => {
    now += 1_000;
    const answer = await runner.run(projectId, F, commands);
    if (!answer.ok) throw new Error(`the batch was refused: ${JSON.stringify(answer)}`);
    return answer.results.flatMap((each) => ('claimIds' in each ? each.claimIds : []));
  };
  /** A leased claim written through the store, as an agent's claim for itself is. */
  const leased = async (id: string, workItemId: string, personId: string, expiresAt: number) => {
    now += 1_000;
    expect(
      await source.stores.claims.add(
        [
          {
            id,
            workItemId,
            stepId: steps[0] ?? null,
            personId,
            runId: `run-${id}`,
            parentClaimId: null,
            accountId: F,
          },
        ],
        [],
        { at: now, by: F },
        [],
        [{ claimId: id, expiresAt }],
      ),
    ).toBe('written');
  };
  /** Moves the clock to `at` and lets the sweep release what ran out. */
  const reap = async (at: number) => {
    now = at;
    return graph.workItems.releaseExpiredLeases(projectId);
  };
  const history = (limit: number = CLAIM_HISTORY_LIMIT.default) =>
    graph.workItems.claimHistoryWithin(projectId, LEGACY_ACCESS, limit);
  const appendEvent = (event: Partial<PlanEvent> & { id: string; createdAt: number }) =>
    source.stores.journal.appendEvent({
      projectId,
      userId: F,
      kind: 'release',
      label: 'release',
      workItemId: null,
      stepId: null,
      before: null,
      after: null,
      ...event,
    });
  return {
    fixture,
    source,
    graph,
    runner,
    projectId,
    steps,
    run,
    leased,
    reap,
    history,
    appendEvent,
  };
}

/** A claim as a stored command carries it. */
const storedClaim = {
  id: 'c-stored',
  workItemId: '090',
  stepId: null,
  personId: 'claire',
  runId: null,
  parentClaimId: null,
  accountId: F,
};

const item080 = { number: '080.1', numberIsFrozen: false, name: 'Billing' };

describe('the claim history read', () => {
  it('lists claims, releases and reaps newest first, each with its reason', async () => {
    const { fixture, source, projectId, steps, run, leased, reap, history } = await seeded();
    const [dev, qa] = steps;
    try {
      const claimed = await run([
        { kind: 'claimWorkItem', workItemId: '080.1', personId: 'claire', runId: 'r-1' },
      ]);
      await run([{ kind: 'releaseWorkItem', workItemId: '080.1', personId: 'claire' }]);
      await leased('c-lease', '080.1', 'codex-fleet', 10_000);
      expect(await reap(10_000)).toBe(1);
      await leased('c-revoked', '080.1', 'codex-fleet', 900_000);
      expect(fixture.endLeasesOf('codex-fleet', 20_000)).toBe(1);
      expect(await reap(20_000)).toBe(1);
      const holder = { personId: 'claire', name: 'claire name' };
      const codex = { personId: 'codex-fleet', name: 'codex-fleet name' };
      const claire = claimed.map((claimId, index) => ({
        claimId,
        workItemId: '080.1',
        stepId: [dev, qa][index],
        runId: 'r-1',
        holder,
        item: item080,
      }));
      const read = await history();
      // A release lists its claims in the order its command stored them, which
      // follows the store's id order; compared as sets here.
      const byClaim = <Claim extends { claimId: string }>(claims: readonly Claim[]) =>
        claims.toSorted((left, right) => left.claimId.localeCompare(right.claimId));
      expect(
        read?.map(({ eventId: _, claims, ...rest }) => ({ ...rest, claims: byClaim(claims) })),
      ).toEqual([
        {
          act: 0,
          at: 20_000,
          kind: 'release',
          reason: 'credential_revoked',
          claims: [
            {
              claimId: 'c-revoked',
              workItemId: '080.1',
              stepId: dev,
              runId: 'run-c-revoked',
              holder: codex,
              item: item080,
            },
          ],
        },
        {
          act: 0,
          at: 10_000,
          kind: 'release',
          reason: 'lease_expired',
          claims: [
            {
              claimId: 'c-lease',
              workItemId: '080.1',
              stepId: dev,
              runId: 'run-c-lease',
              holder: codex,
              item: item080,
            },
          ],
        },
        { act: 0, at: 3_000, kind: 'release', reason: 'released', claims: byClaim(claire) },
        { act: 0, at: 2_000, kind: 'claim', reason: 'claimed', claims: byClaim(claire) },
      ]);
      // Each event is the stored plan event, by id.
      const stored = await source.stores.planEvents.listFor(projectId, {
        kinds: ['claim', 'release'],
      });
      expect(read?.map(({ eventId }) => eventId)).toEqual(stored.map(({ id }) => id));
    } finally {
      await source.close();
    }
  });

  it('reads a release named like a reap by its stored reason, not its label', async () => {
    const { source, run, history } = await seeded();
    try {
      await run([{ kind: 'claimWorkItem', workItemId: '090', personId: 'claire' }]);
      await run([{ kind: 'releaseWorkItem', workItemId: '090', personId: 'claire' }]);
      expect((await history())?.map(({ kind, reason }) => [kind, reason])).toEqual([
        ['release', 'released'],
        ['claim', 'claimed'],
      ]);
    } finally {
      await source.close();
    }
  });

  it('names a holder and an item deleted since as null', async () => {
    const { source, run, history } = await seeded();
    try {
      await run([{ kind: 'claimWorkItem', workItemId: '090', personId: 'claire' }]);
      await run([{ kind: 'releaseWorkItem', workItemId: '090', personId: 'claire' }]);
      expect(
        await source.stores.directory.removePerson(
          'claire',
          true,
          { at: 9_000, by: F },
          { kind: 'every' },
        ),
      ).toMatchObject({ ok: true });
      await source.stores.workItems.remove(['090'], [], { at: 9_000, by: F });
      const claims = (await history())?.flatMap((each) => each.claims);
      expect(claims?.map(({ holder, item }) => ({ holder, item }))).toEqual(
        Array.from({ length: 4 }, () => ({
          holder: { personId: 'claire', name: null },
          item: null,
        })),
      );
    } finally {
      await source.close();
    }
  });

  it('lists no undo, redo or other command', async () => {
    const { source, projectId, steps, run, history, runner } = await seeded();
    const [dev] = steps;
    try {
      await run([{ kind: 'claimWorkItem', workItemId: '090', personId: 'claire' }]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      await run([
        {
          kind: 'setEstimate',
          workItemId: '080.1',
          stepId: dev,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
      ]);
      expect((await history())?.map(({ kind, reason }) => [kind, reason])).toEqual([
        ['claim', 'claimed'],
      ]);
    } finally {
      await source.close();
    }
  });

  it('answers the newest events up to the limit', async () => {
    const { source, history, appendEvent } = await seeded();
    try {
      for (let index = 0; index < 120; index += 1)
        await appendEvent({
          id: `e-${String(index).padStart(3, '0')}`,
          createdAt: 5_000 + index,
          after: { do: 'remove_claims', claims: [storedClaim], cleared: [] },
        });
      const newest = (count: number) =>
        Array.from({ length: count }, (_, index) => `e-${String(119 - index).padStart(3, '0')}`);
      expect((await history())?.map(({ eventId }) => eventId)).toEqual(newest(50));
      expect((await history(CLAIM_HISTORY_LIMIT.max))?.map(({ eventId }) => eventId)).toEqual(
        newest(100),
      );
    } finally {
      await source.close();
    }
  });

  it('reads a limit from 1 to 100, 50 when absent, and refuses anything else', () => {
    expect(limitOf(undefined, CLAIM_HISTORY_LIMIT)).toBe(50);
    expect(limitOf('1', CLAIM_HISTORY_LIMIT)).toBe(1);
    expect(limitOf('100', CLAIM_HISTORY_LIMIT)).toBe(100);
    expect(limitOf('007', CLAIM_HISTORY_LIMIT)).toBe(7);
    for (const raw of ['0', '101', '', '-1', '1.5', 'ten', '1e2', '99999999'])
      expect({ raw, limit: limitOf(raw, CLAIM_HISTORY_LIMIT) }).toEqual({ raw, limit: null });
  });

  it('lists a claim made beside other commands in one batch', async () => {
    const { source, projectId, steps, run, history } = await seeded();
    const [dev] = steps;
    try {
      const claimed = await run([
        { kind: 'claimWorkItem', workItemId: '090', personId: 'claire' },
        {
          kind: 'setEstimate',
          workItemId: '080.1',
          stepId: dev,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
      ]);
      const [batch] = await source.stores.planEvents.listFor(projectId, { kinds: ['batch'] });
      expect(
        (await history())?.map(({ eventId, act, kind, reason, claims }) => ({
          eventId,
          act,
          kind,
          reason,
          claimIds: claims.map(({ claimId }) => claimId),
        })),
      ).toEqual([
        { eventId: batch.id, act: 0, kind: 'claim', reason: 'claimed', claimIds: claimed },
      ]);
    } finally {
      await source.close();
    }
  });

  it('lists a batch that released one claim and took another as two acts', async () => {
    const { source, run, history } = await seeded();
    try {
      await run([{ kind: 'claimWorkItem', workItemId: '090', personId: 'claire' }]);
      await run([
        { kind: 'releaseWorkItem', workItemId: '090', personId: 'claire' },
        { kind: 'claimWorkItem', workItemId: '080.1', personId: 'codex-fleet' },
      ]);
      const acts = (read: Awaited<ReturnType<typeof history>>) =>
        read?.map(({ act, kind, reason, claims }) => ({
          act,
          kind,
          reason,
          items: [...new Set(claims.map(({ workItemId }) => workItemId))],
        }));
      const [newest, older] = (await history()) ?? [];
      expect(newest.eventId).toBe(older.eventId);
      expect(acts(await history())).toEqual([
        { act: 1, kind: 'claim', reason: 'claimed', items: ['080.1'] },
        { act: 0, kind: 'release', reason: 'released', items: ['090'] },
        { act: 0, kind: 'claim', reason: 'claimed', items: ['090'] },
      ]);
      expect(acts(await history(1))).toEqual([
        { act: 1, kind: 'claim', reason: 'claimed', items: ['080.1'] },
      ]);
    } finally {
      await source.close();
    }
  });

  it('finds a claim batch under newer batches that claim nothing', async () => {
    const { source, steps, run, history } = await seeded();
    const [dev, qa] = steps;
    const estimate = (workItemId: string, stepId: string, realistic: number) => ({
      kind: 'setEstimate' as const,
      workItemId,
      stepId,
      days: { optimistic: 1, realistic, pessimistic: 9 },
    });
    try {
      await run([
        { kind: 'claimWorkItem', workItemId: '090', personId: 'claire' },
        estimate('080.1', dev, 2),
      ]);
      for (const realistic of [3, 4, 5])
        await run([estimate('080.1', dev, realistic), estimate('080.1', qa, realistic)]);
      expect((await history(1))?.map(({ kind }) => kind)).toEqual(['claim']);
    } finally {
      await source.close();
    }
  });

  it('lists nothing for a batch that deleted a claimed item', async () => {
    const { source, projectId, steps, run, history } = await seeded();
    const [dev] = steps;
    try {
      await run([{ kind: 'claimWorkItem', workItemId: '090', personId: 'claire' }]);
      // A deletion's inverse puts the claims back; its forward claims nothing.
      await run([
        { kind: 'deleteWorkItem', workItemId: '090' },
        {
          kind: 'setEstimate',
          workItemId: '080.1',
          stepId: dev,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
      ]);
      const [deleted] = await source.stores.planEvents.listFor(projectId, { kinds: ['batch'] });
      expect(JSON.stringify(deleted.before)).toContain('add_claims');
      expect((await history())?.map(({ kind }) => kind)).toEqual(['claim']);
    } finally {
      await source.close();
    }
  });

  it('fails the read on a batch it cannot split into acts', async () => {
    const corrupt: [string, unknown][] = [
      [
        'e-both-in-one-step',
        {
          do: 'batch',
          steps: [
            {
              do: 'batch',
              steps: [
                { do: 'add_claims', claims: [storedClaim], stated: [] },
                { do: 'remove_claims', claims: [storedClaim], cleared: [] },
              ],
            },
            { do: 'set_frozen', updates: [] },
          ],
        },
      ],
      [
        'e-no-act',
        {
          do: 'batch',
          steps: [
            { do: 'set_frozen', updates: [], note: { do: 'add_claims' } },
            { do: 'set_frozen', updates: [] },
          ],
        },
      ],
    ];
    for (const [id, after] of corrupt) {
      const { source, run, history, appendEvent } = await seeded();
      try {
        await run([{ kind: 'claimWorkItem', workItemId: '090', personId: 'claire' }]);
        await appendEvent({ id, kind: 'batch', createdAt: 900_000, after });
        expect({ id, read: await history().then(String, (error: unknown) => error) }).toEqual({
          id,
          read: expect.objectContaining({
            message: expect.stringContaining(`claim history event ${id}`) as unknown,
          }) as unknown,
        });
      } finally {
        await source.close();
      }
    }
  });

  it('fails the read for a row the tree cannot number, never reading it as deleted', async () => {
    const { source, projectId, history, appendEvent } = await seeded();
    try {
      await source.stores.workItems.insert(
        workItemRow({ id: 'w-orphan', projectId, parentId: 'no-such-parent', position: 1 }),
        [],
        { at: 1, by: F },
      );
      await appendEvent({
        id: 'e-orphan',
        kind: 'claim',
        createdAt: 900_000,
        after: {
          do: 'add_claims',
          claims: [{ ...storedClaim, workItemId: 'w-orphan' }],
          stated: [],
        },
      });
      // `deriveNumbers` refuses the orphan before the read could name it `null`.
      expect(await history().then(String, (error: unknown) => error)).toEqual(
        expect.objectContaining({
          message: 'work items unreachable from any root: w-orphan',
        }),
      );
    } finally {
      await source.close();
    }
  });

  it('fails the read on a stored command it cannot decode, naming the event', async () => {
    const corrupt: [string, Partial<PlanEvent>][] = [
      ['e-unknown', { after: { do: 'no_such_command' } }],
      ['e-none', { after: null }],
      ['e-claim-without-claims', { kind: 'claim', after: { do: 'set_frozen', updates: [] } }],
      [
        'e-unknown-reason',
        { after: { do: 'remove_claims', claims: [storedClaim], cleared: [], reason: 'tired' } },
      ],
    ];
    for (const [id, event] of corrupt) {
      const { source, run, history, appendEvent } = await seeded();
      try {
        await run([{ kind: 'claimWorkItem', workItemId: '090', personId: 'claire' }]);
        await appendEvent({ id, createdAt: 900_000, ...event });
        expect({ id, read: await history().then(String, (error: unknown) => error) }).toEqual({
          id,
          read: expect.objectContaining({
            message: expect.stringContaining(`claim history event ${id}`) as unknown,
          }) as unknown,
        });
      } finally {
        await source.close();
      }
    }
  });

  it('answers null for a project nothing holds', async () => {
    const { source, graph } = await seeded();
    try {
      expect(await graph.workItems.claimHistoryWithin('no-such-project', LEGACY_ACCESS, 50)).toBe(
        null,
      );
    } finally {
      await source.close();
    }
  });
});
