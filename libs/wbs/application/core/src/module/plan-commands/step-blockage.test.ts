import { serializeSchedule } from '@wbs/domain';
import { canonicalScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it, spyOn } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { ScheduleRead } from '../../ports/scheduler';
import type { Scope } from '../../ports/unit-of-work';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { expectCreated } from '../../testing/expect-created';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from './composition';

const OWNER = 'blockage-owner';

async function seeded(fault?: 'refuse' | 'throw') {
  const source = openMemorySource();
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, {
    ...options,
    dependencyContext: createLocalDependencyContext(source.stores),
  });
  await source.stores.users.create(
    { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: OWNER },
  );
  const created = expectCreated(await graph.projects.create('Blockage authoring', OWNER));
  const projectId = created.project.id;
  await source.stores.projects.update(projectId, { restricted: true }, { at: 1, by: OWNER });
  const step = created.steps[0];
  await source.stores.steps.add(
    { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
    { at: 1, by: OWNER },
  );
  await source.stores.workItems.insert(workItemRow({ id: 'leaf', projectId, parentId: null }), [], {
    at: 1,
    by: OWNER,
  });
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(
        {
          ...scope.stores,
          blockages: {
            ...scope.stores.blockages,
            set: async (fact, stamp) => {
              if (fault === 'refuse') return 'unknown_step';
              if (fault === 'throw') throw new Error('injected blockage write failure');
              return scope.stores.blockages.set(fact, stamp);
            },
          },
        },
        {
          ...options,
          broadcast: announcements,
          dependencyContext: createLocalDependencyContext(scope.stores),
        },
      ),
  });
  const snapshot = () =>
    Promise.all([
      source.stores.workItems.listByProject(projectId),
      source.stores.projects.findById(projectId),
      source.stores.progress.listByProject(projectId),
      source.stores.blockages.listByProject(projectId),
      source.stores.journal.entriesFor(projectId, OWNER),
      source.stores.planEvents.listFor(projectId, {}),
    ]);
  const command = (isBlocked: boolean) => ({
    kind: 'setStepBlocked' as const,
    workItemId: 'leaf',
    stepId: step.id,
    isBlocked,
  });
  return { source, broadcast, graph, runner, projectId, stepId: step.id, snapshot, command };
}

describe('public blockage authoring over transactional memory', () => {
  it('collects one undo unit, refreshes retained facts, and emits committed readings', async () => {
    const { source, runner, projectId, stepId, command, broadcast } = await seeded();
    try {
      expect(
        await runner.run(projectId, OWNER, [command(true), command(false), command(true)]),
      ).toMatchObject({ ok: true });
      const facts = await source.stores.blockages.listByProject(projectId);
      expect(facts).toHaveLength(1);
      expect(await source.stores.journal.entriesFor(projectId, OWNER)).toHaveLength(1);
      const trees = broadcast.published.filter(({ event }) => event.type === 'tree_replaced');
      expect(trees.length).toBeGreaterThan(0);
      expect(JSON.stringify(trees)).toContain('blocked');
      expect(await runner.undo(projectId, OWNER)).toMatchObject({ ok: true });
      expect(await source.stores.blockages.listByProject(projectId)).toEqual([]);
      expect(await runner.redo(projectId, OWNER)).toMatchObject({ ok: true });
      expect(await source.stores.blockages.listByProject(projectId)).toEqual(facts);
      expect(facts[0]?.stepId).toBe(stepId);
    } finally {
      await source.close();
    }
  });

  it.each(['refuse', 'throw'] as const)(
    'rolls back a prior mutation and emits no fanout after a %s store write',
    async (fault) => {
      const { source, runner, projectId, command, snapshot, broadcast } = await seeded(fault);
      try {
        const before = await snapshot();
        const published = [...broadcast.published];
        const rejection = await runner
          .run(projectId, OWNER, [
            { kind: 'patchWorkItem', workItemId: 'leaf', patch: { name: 'Changed' } },
            command(true),
          ])
          .then(
            () => 'resolved',
            (error: unknown) => String(error),
          );
        expect(rejection).toContain(
          fault === 'refuse' ? 'cannot set step blockage' : 'injected blockage write failure',
        );
        expect(await snapshot()).toEqual(before);
        expect(broadcast.published).toEqual(published);
      } finally {
        await source.close();
      }
    },
  );

  it('rolls back an earlier fact when the later command is unknown', async () => {
    const { source, runner, projectId, command, snapshot, broadcast } = await seeded();
    try {
      const before = await snapshot();
      const published = [...broadcast.published];
      expect(
        await runner.run(projectId, OWNER, [
          command(true),
          { ...command(false), stepId: 'missing' },
        ]),
      ).toMatchObject({ ok: false, at: 1, reason: 'unknown_step' });
      expect(await snapshot()).toEqual(before);
      expect(broadcast.published).toEqual(published);
    } finally {
      await source.close();
    }
  });

  it('refuses direct service ownership before an equivalent clear', async () => {
    const { source, graph, stepId, snapshot } = await seeded();
    try {
      const before = await snapshot();
      expect(await graph.workItems.setStepBlocked('leaf', 'other-account', stepId, false)).toEqual({
        ok: false,
        reason: 'forbidden',
      });
      expect(await snapshot()).toEqual(before);
    } finally {
      await source.close();
    }
  });
  it.each(['undo', 'redo'] as const)(
    'refuses stale memory %s without accepting forged owner revisions',
    async (direction) => {
      const { source, runner, projectId, stepId, command, snapshot, broadcast } = await seeded();
      try {
        expect(await runner.run(projectId, OWNER, [command(true)])).toMatchObject({ ok: true });
        if (direction === 'redo')
          expect(await runner.undo(projectId, OWNER)).toMatchObject({ ok: true });
        await source.stores.blockages.set(
          { workItemId: 'leaf', stepId, blockedAt: -23 },
          { at: 2, by: OWNER },
        );
        for (const entry of await source.stores.journal.entriesFor(projectId, OWNER))
          await source.stores.journal.restamp(entry.id, {
            ...(entry.preconditions as object),
            expected: {},
          });
        const before = await snapshot();
        const published = [...broadcast.published];
        expect(await runner[direction](projectId, OWNER)).toMatchObject({ ok: false });
        expect((await snapshot()).slice(0, 4)).toEqual(before.slice(0, 4));
        expect(broadcast.published).toEqual(published);
      } finally {
        await source.close();
      }
    },
  );

  it('keeps progress, canonical input and full Fast schedule unchanged', async () => {
    const { source, runner, graph, projectId, stepId, command } = await seeded();
    const observed = spyOn(fastScheduler, 'read');
    try {
      const capture = async () => {
        const callCount = observed.mock.calls.length;
        const tree = await graph.workItems.tree(projectId);
        const call = observed.mock.calls.at(callCount);
        const schedule = (await Promise.resolve(observed.mock.results[callCount]?.value)) as
          ScheduleRead | undefined;
        if (call === undefined || schedule?.kind !== 'scheduled')
          throw new Error('Fast capture absent');
        return {
          tree,
          input: canonicalScheduleInput(call[0].input),
          fast: JSON.stringify(serializeSchedule(schedule.fast)),
        };
      };
      await graph.workItems.setEstimate('leaf', OWNER, stepId, {
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
      });
      await graph.workItems.setProgress('leaf', OWNER, stepId, 'in_progress');
      const baseline = await capture();
      const before = baseline.tree;
      const progress = await source.stores.progress.listByProject(projectId);
      expect(await runner.run(projectId, OWNER, [command(true)])).toMatchObject({ ok: true });
      const captured = await capture();
      const blocked = captured.tree;
      if (before === null || blocked === null || 'kind' in before || 'kind' in blocked)
        throw new Error('Fast schedule unavailable');
      expect(blocked.slices).toEqual(before.slices);
      expect(captured.input).toEqual(baseline.input);
      expect(captured.fast).toEqual(baseline.fast);
      expect(await source.stores.progress.listByProject(projectId)).toEqual(progress);
      expect(blocked.workItems[0]?.progress).toEqual(before.workItems[0]?.progress);
      expect(blocked.workItems[0]?.status).toEqual(before.workItems[0]?.status);
    } finally {
      observed.mockRestore();
      await source.close();
    }
  });

  it('refuses an unknown service step before an equivalent clear', async () => {
    const { source, graph, snapshot } = await seeded();
    try {
      const before = await snapshot();
      expect(await graph.workItems.setStepBlocked('leaf', OWNER, 'missing', false)).toEqual({
        ok: false,
        reason: 'unknown_step',
      });
      expect(await snapshot()).toEqual(before);
    } finally {
      await source.close();
    }
  });
});
