import { canonicalScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { PlanTree } from '../../ports/plan-tree';
import type { Scope } from '../../ports/unit-of-work';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { expectCreated } from '../../testing/expect-created';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from './composition';

/**
 * The live plan read levels demands (`wbs-resources` R2 and R5) through the
 * real command runner and the memory source: demands and capacities are stated
 * by commands, read by the service, charged on every step's block, and never
 * joined by a claim.
 */

const F = 'account-f';
const TWO_DAYS = { optimistic: 2, realistic: 2, pessimistic: 2 };

async function seeded() {
  const { source } = openMemorySourceFixture();
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
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  const created = expectCreated(await graph.projects.create('Levelling', F));
  const projectId = created.project.id;
  for (const step of created.steps) {
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: F },
    );
  }
  const steps = (await source.stores.projects.stepsOf(projectId)).map(({ id }) => id);
  for (const row of [
    workItemRow({ id: '080', projectId, parentId: null, position: 1 }),
    workItemRow({ id: '080.25', projectId, parentId: '080', position: 1 }),
    workItemRow({ id: '090', projectId, parentId: null, position: 2 }),
  ])
    await source.stores.workItems.insert(row, [], { at: 1, by: F });
  await source.stores.directory.addPerson(
    { id: 'claire-worker', name: 'claire-worker', kind: 'agent' },
    [],
    { at: 1, by: F },
  );
  const bound = await source.stores.directory.patchPerson(
    'claire-worker',
    { accountId: F },
    { at: 1, by: F },
  );
  if (!bound.ok) throw new Error(`binding was refused: ${bound.reason}`);
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, {
        dependencyContext: createLocalDependencyContext(scope.stores),
        ...options,
        broadcast: announcements,
      }),
  });
  const declared = await runner.runDirectory(F, [
    { kind: 'createResource', name: 'staging', resourceKind: 'exclusive', unitLabel: 'env' },
  ]);
  if (!declared.ok) throw new Error(`staging was refused: ${JSON.stringify(declared)}`);
  const [staging] = declared.results.map(({ id }) => id);
  if (staging === undefined) throw new Error('staging minted no id');
  // Both leaves carry two days on both steps, so each runs four days alone.
  const estimated = await runner.run(
    projectId,
    F,
    ['080.25', '090'].flatMap((workItemId) =>
      steps.map((stepId) => ({ kind: 'setEstimate' as const, workItemId, stepId, days: TWO_DAYS })),
    ),
  );
  if (!estimated.ok) throw new Error(`estimates were refused: ${JSON.stringify(estimated)}`);
  const tree = async (): Promise<PlanTree> => {
    const read = await graph.workItems.tree(projectId);
    if (read === null || 'kind' in read) throw new Error('the plan read was unavailable');
    return read;
  };
  const input = async () => {
    const read = await graph.workItems.scheduleInput(projectId);
    if (read === null) throw new Error('the schedule input was unavailable');
    return read;
  };
  return { source, runner, projectId, steps, staging, tree, input };
}

describe('the live plan read levels resource demands', () => {
  it('serialises two leaves on the one staging environment and names it', async () => {
    const { source, runner, projectId, staging, tree, input } = await seeded();
    try {
      const alone = await tree();
      expect(alone.slices.every(({ boundBy }) => boundBy !== 'capacity')).toBe(true);
      const applied = await runner.run(projectId, F, [
        { kind: 'setResourceCapacity', resourceId: staging, units: 1 },
        { kind: 'setDemand', workItemId: '080.25', resourceId: staging, units: 1 },
        { kind: 'setDemand', workItemId: '090', resourceId: staging, units: 1 },
      ]);
      expect(applied.ok).toBe(true);
      const { slices } = await tree();
      // No two demanding blocks share an instant: staging holds one at a time.
      for (const left of slices)
        for (const right of slices)
          if (left !== right)
            expect(
              left.earliestStart < right.earliestFinish &&
                right.earliestStart < left.earliestFinish,
            ).toBe(false);
      // R2 charges the demand per step's block, and each block acquires and
      // releases on its own, so the two leaves interleave step by step: a leaf
      // does not keep staging between its Dev and its QA.
      expect(
        slices
          .map(({ workItemId, earliestStart }) => [earliestStart, workItemId] as const)
          .sort(([left], [right]) => left - right)
          .map(([, workItemId]) => workItemId),
      ).toEqual(['080.25', '090', '080.25', '090']);
      const waited = slices.filter((slice) => slice.capacityResource !== undefined);
      expect(waited).toHaveLength(3);
      for (const slice of waited)
        expect(slice).toMatchObject({
          boundBy: 'capacity',
          capacityTeamId: null,
          capacityResource: { resourceId: staging, units: 1 },
        });
      // Charged on every step's block of each demanding leaf (R2).
      const charged = (await input()).slices.filter((slice) => slice.demands !== undefined);
      expect(charged.map(({ workItemId }) => workItemId).sort()).toEqual([
        '080.25',
        '080.25',
        '090',
        '090',
      ]);
    } finally {
      await source.close();
    }
  });

  it('constrains nothing while the capacity is unstated', async () => {
    const { source, runner, projectId, staging, tree, input } = await seeded();
    try {
      const before = await tree();
      const key = canonicalScheduleInput(await input());
      await runner.run(projectId, F, [
        { kind: 'setDemand', workItemId: '080.25', resourceId: staging, units: 1 },
        { kind: 'setDemand', workItemId: '090', resourceId: staging, units: 1 },
      ]);
      expect((await tree()).slices).toEqual(before.slices);
      expect(canonicalScheduleInput(await input())).toBe(key);
    } finally {
      await source.close();
    }
  });

  it('moves neither the schedule key nor a date when a leaf is claimed', async () => {
    // Design R5's falsifier: a schedule reads plan data only, never a claim or
    // an occupancy, so claiming a demanding leaf leaves the cache key and every
    // date where they were.
    const { source, runner, projectId, steps, staging, tree, input } = await seeded();
    try {
      const firstStep = steps.at(0);
      if (firstStep === undefined) throw new Error('seeded project has no first step');
      await runner.run(projectId, F, [
        { kind: 'setResourceCapacity', resourceId: staging, units: 1 },
        { kind: 'setDemand', workItemId: '080.25', resourceId: staging, units: 1 },
        { kind: 'setDemand', workItemId: '090', resourceId: staging, units: 1 },
      ]);
      const before = await tree();
      const key = canonicalScheduleInput(await input());
      const claimed = await runner.run(projectId, F, [
        {
          kind: 'claimWorkItem',
          workItemId: '090',
          personId: 'claire-worker',
          runId: 'run-1',
          steps: [firstStep],
        },
      ]);
      expect(claimed).toMatchObject({ ok: true, results: [{ index: 0, alreadyHeld: false }] });
      expect(await source.stores.claims.listByProject(projectId)).not.toEqual([]);
      expect(canonicalScheduleInput(await input())).toBe(key);
      const after = await tree();
      expect(after.slices).toEqual(before.slices);
      expect(after.workItems.map(({ id, dates }) => ({ id, dates }))).toEqual(
        before.workItems.map(({ id, dates }) => ({ id, dates })),
      );
    } finally {
      await source.close();
    }
  });
});
