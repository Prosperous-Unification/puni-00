import type { EstimateMethod, EstimateRounding } from '@wbs/domain';
import { canonicalScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { openMemorySource } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../compose';
import { CREATOR_ADMISSION } from '../ports/edit-admission';
import type { Project } from '../ports/project-store';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testClock } from '../testing/clock-fixture';
import { fastScheduler } from '../testing/scheduler-fixture';
import { workItemRow } from '../testing/work-item-fixture';
import { prepareCapturedScheduleParts, prepareScheduleParts } from './schedule-parts';

const stamp = { at: 1, by: 'owner' };
const cases = (['optimistic', 'realistic', 'pessimistic', 'pert'] as const).flatMap((method) =>
  (['exact', 'ceil'] as const).flatMap((rounding) =>
    ([null, '2026-10-05'] as const).flatMap((anchor) =>
      [false, true].map((held) => ({ method, rounding, anchor, held })),
    ),
  ),
);

async function seedPreparation(
  method: EstimateMethod,
  rounding: EstimateRounding,
  anchor: '2026-10-05' | null,
  held: boolean,
) {
  const source = openMemorySource();
  const { stores } = source;
  const project: Project = projectRow({
    id: 'project',
    estimateMethod: method,
    estimateRounding: rounding,
    startDate: anchor,
  });
  await stores.projects.create(
    project,
    [
      {
        id: 'build',
        projectId: project.id,
        name: 'Build',
        position: 0,
        code: 'build',
        allowancePercent: 20,
        estimateUnit: 'workdays',
      },
    ],
    stamp,
  );
  await stores.directory.addTeam({ id: 'team', name: 'Team' }, stamp);
  await stores.directory.addResource(
    { id: 'resource', name: 'Machine', kind: 'divisible', unitLabel: 'units' },
    stamp,
  );
  for (const row of [
    workItemRow({
      id: 'parent',
      projectId: project.id,
      startNoEarlierThan: anchor === null ? null : '2026-10-07',
      deadline: anchor === null ? null : '2026-10-16',
    }),
    workItemRow({
      id: 'a',
      projectId: project.id,
      parentId: 'parent',
      maxParallel: 3,
      hold: held ? 'on_hold' : null,
    }),
    workItemRow({
      id: 'b',
      projectId: project.id,
      parentId: 'parent',
      position: 1,
      maxParallel: 1,
    }),
  ])
    await stores.workItems.insert(row, [], stamp);
  expect(await stores.workItems.patch('parent', { teamIds: ['team'] }, stamp)).toHaveProperty(
    'ok',
    true,
  );
  expect(await stores.capacity.set(project.id, 'team', 2, stamp)).toEqual({ ok: true });
  expect(await stores.resourceCapacity.set(project.id, 'resource', 2, stamp)).toEqual({ ok: true });
  expect(await stores.demands.set('a', 'resource', 1, stamp)).toBe('written');
  for (const workItemId of ['a', 'b'])
    expect(
      await stores.estimates.set(
        { workItemId, stepId: 'build', optimistic: 0.5, realistic: 1.25, pessimistic: 2.5 },
        stamp,
      ),
    ).toBe('written');
  await stores.dependencies.add(
    { id: 'ab', projectId: project.id, predecessorId: 'a', successorId: 'b' },
    stamp,
  );
  return { source, project };
}

describe('shared live and captured preparation', () => {
  it.each(cases)(
    'preserves canonical bytes with $method/$rounding, anchor=$anchor, held=$held',
    async ({ method, rounding, anchor, held }) => {
      const { source, project } = await seedPreparation(method, rounding, anchor, held);
      try {
        const graph = servicesOver(source.stores, {
          admission: CREATOR_ADMISSION,
          clock: testClock,
          broadcast: recordingBroadcaster(),
          scheduler: fastScheduler,
        });
        const live = await graph.workItems.scheduleInput(project.id);
        const capture = await source.history.savedPlanCapture.readPlanInput(project.id);
        if (live === null || capture === null)
          throw new Error('seeded project preparation disappeared');
        const captured = prepareCapturedScheduleParts(capture);
        expect(canonicalScheduleInput(live)).toBe(canonicalScheduleInput(captured.input));
        // This intentionally supplies only consumed settings: neither live projects
        // nor the reusable preparation boundary require captured timezone metadata.
        const settings = {
          estimateMethod: project.estimateMethod,
          pertWeights: project.pertWeights,
          estimateRounding: project.estimateRounding,
          startDate: project.startDate,
          depReach: project.depReach,
        };
        const direct = prepareScheduleParts(
          settings,
          await source.stores.workItems.listByProject(project.id),
          capture.estimates,
          capture.dependencies,
          capture.typedDependencies,
          capture.assignments,
          capture.steps,
          capture.capacity,
          capture.demands,
          capture.resourceCapacities,
        );
        expect(canonicalScheduleInput(direct.input)).toBe(canonicalScheduleInput(live));
        expect(direct.rule).toEqual({ method, rounding, pertWeights: project.pertWeights });
        expect([...direct.hasChildren]).toEqual(['parent']);
        expect([...direct.assigneesOf]).toEqual([]);
        expect(
          direct.unreducedInput.slices.map((slice) => [slice.workItemId, slice.width]),
        ).toEqual([
          ['a', 2],
          ['b', 1],
        ]);
        expect(live.slices.map((slice) => slice.workItemId).sort()).toEqual(
          held ? ['b'] : ['a', 'b'],
        );
        expect(live.notBefore.get('parent')).toBe(anchor === null ? undefined : 2);
        expect(live.deadlines.get('parent')).toBe(anchor === null ? undefined : 9);
        const effort = { optimistic: 0.6, realistic: 1.5, pessimistic: 3, pert: 1.6 }[method];
        for (const slice of live.slices)
          expect(slice.days).toBeCloseTo(rounding === 'ceil' ? Math.ceil(effort) : effort, 12);
        expect(captured.input.resourceCapacities).toEqual(new Map([['resource', 2]]));
        const leaf = live.slices.find((slice) => slice.workItemId === 'a');
        if (!held) expect(leaf?.demands).toEqual([{ resourceId: 'resource', units: 1 }]);
      } finally {
        await source.close();
      }
    },
  );
});
