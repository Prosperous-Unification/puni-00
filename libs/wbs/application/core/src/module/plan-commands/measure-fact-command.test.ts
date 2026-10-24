import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { PlanTree } from '../../ports/plan-tree';
import type { Scope } from '../../ports/unit-of-work';
import type { PlanCommand } from '../../service/command-normalizers';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { createPlanCommandRunner } from './composition';

const F = 'account-f';
const ORG = 'org-a';
const MINUTE = 60_000;

/**
 * A project owned by the legacy organization `org-a`, which defines
 * `gpu_minutes` beside the five seeds, holding parent `P` over leaves `A` and
 * `B` (`wbs-measure-budgets` task 1.3).
 */
async function seeded() {
  const fixture = openMemorySourceFixture();
  const source = fixture.source;
  fixture.addOrganization(ORG, { legacy: true });
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  const created = await graph.projects.create('Measures', F);
  const projectId = created.project.id;
  fixture.ownProjectInOrganization(projectId, ORG);
  for (const step of created.steps) {
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: F },
    );
  }
  const [dev] = created.steps.map(({ id }) => id);
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: options.broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, { ...options, broadcast: announcements }),
  });
  const defined = await runner.runDirectory(F, [
    {
      kind: 'createMeasure',
      key: 'gpu_minutes',
      name: 'GPU minutes',
      unit: 'min',
      measureKind: 'duration',
      scale: 'integer',
    },
  ]);
  if (!defined.ok) throw new Error(`gpu_minutes was refused: ${JSON.stringify(defined)}`);
  const built = await runner.run(projectId, F, [
    { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
    { kind: 'createWorkItem', ref: 'A', name: 'A', parentId: null, parentRef: 'P', afterId: null },
    {
      kind: 'createWorkItem',
      ref: 'B',
      name: 'B',
      parentId: null,
      parentRef: 'P',
      afterId: null,
      afterRef: 'A',
    },
  ]);
  if (!built.ok) throw new Error(`the tree was refused: ${JSON.stringify(built)}`);
  const idOf = (ref: string): string => {
    const found = built.results.find((each) => 'ref' in each && each.ref === ref);
    if (found === undefined || !('id' in found) || typeof found.id !== 'string')
      throw new Error(`no work item ${ref}`);
    return found.id;
  };
  const run = (commands: readonly PlanCommand[]) => runner.run(projectId, F, commands);
  const facts = async () =>
    (await source.stores.measures.listByProject(projectId)).map(
      ({ workItemId, metric, value }) => ({ workItemId, metric, value }),
    );
  const gpuId = async () => {
    const held = await source.stores.directory.listMeasures(ORG);
    const found = held.find((each) => each.key === 'gpu_minutes');
    if (found === undefined) throw new Error('no gpu_minutes');
    return found.id;
  };
  const tree = async (): Promise<PlanTree> => {
    const read = await graph.workItems.tree(projectId);
    if (read === null || 'kind' in read) throw new Error('the plan read was unavailable');
    return read;
  };
  return { source, runner, projectId, dev, idOf, run, facts, gpuId, tree };
}

describe('facts keyed by measure definition', () => {
  it('records a fact in a defined measure and under either name of tokens and hours, undoably', async () => {
    const { source, runner, projectId, dev, idOf, run, facts } = await seeded();
    try {
      const A = idOf('A');
      expect(
        await run([
          { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'gpu_minutes', value: 3 },
          { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'tokens', value: 12 },
          { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'hours_actual', value: 1.5 },
        ]),
      ).toMatchObject({ ok: true });
      expect(await facts()).toEqual([
        { workItemId: A, metric: 'gpu_minutes', value: 3 },
        { workItemId: A, metric: 'hours_actual', value: 1.5 },
        { workItemId: A, metric: 'token_actual', value: 12 },
      ]);
      expect(
        await run([{ kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'hours', value: 2 }]),
      ).toMatchObject({ ok: true });
      expect(await facts()).toContainEqual({ workItemId: A, metric: 'hours_actual', value: 2 });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await facts()).toEqual([]);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect(await facts()).toEqual([
        { workItemId: A, metric: 'gpu_minutes', value: 3 },
        { workItemId: A, metric: 'hours_actual', value: 1.5 },
        { workItemId: A, metric: 'token_actual', value: 12 },
      ]);
      expect(
        await run([{ kind: 'clearMeasure', workItemId: A, stepId: dev, metric: 'gpu_minutes' }]),
      ).toMatchObject({ ok: true });
      expect(await facts()).not.toContainEqual(expect.objectContaining({ metric: 'gpu_minutes' }));
    } finally {
      await source.close();
    }
  });

  it('refuses a fact in a measure the organization does not define, in a derived measure or in the wrong scale', async () => {
    const { source, dev, idOf, run, facts } = await seeded();
    try {
      const A = idOf('A');
      const set = (metric: string, value: number) =>
        run([{ kind: 'setMeasure', workItemId: A, stepId: dev, metric, value }]);
      expect(await set('story_points', 3)).toMatchObject({
        ok: false,
        reason: 'unknown_measure',
      });
      expect(await set('agent_minutes', 30)).toMatchObject({
        ok: false,
        reason: 'derived_measure',
      });
      expect(await set('gpu_minutes', 0.5)).toMatchObject({
        ok: false,
        reason: 'scale_mismatch',
      });
      expect(await set('tokens', 1.5)).toMatchObject({ ok: false, reason: 'scale_mismatch' });
      // The scheduling measure's fact is the actual days, recorded with setActual.
      expect(await set('time', 2)).toMatchObject({ ok: false, reason: 'scheduling_measure_fact' });
      expect(
        await run([{ kind: 'clearMeasure', workItemId: A, stepId: dev, metric: 'agent_minutes' }]),
      ).toMatchObject({ ok: false, reason: 'derived_measure' });
      expect(await facts()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses deleting a definition that holds a fact, and deletes it once the fact is cleared', async () => {
    const { source, runner, dev, idOf, run, gpuId } = await seeded();
    try {
      const A = idOf('A');
      await run([
        { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'gpu_minutes', value: 3 },
      ]);
      const measureId = await gpuId();
      expect(await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId }])).toMatchObject({
        ok: false,
        reason: 'measure_in_use',
      });
      await run([{ kind: 'clearMeasure', workItemId: A, stepId: dev, metric: 'gpu_minutes' }]);
      expect(await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId }])).toMatchObject({
        ok: true,
      });
    } finally {
      await source.close();
    }
  });

  it('refuses an undo that would put a fact back in a measure deleted since', async () => {
    const { source, runner, projectId, dev, idOf, run, facts, gpuId } = await seeded();
    try {
      const A = idOf('A');
      await run([
        { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'gpu_minutes', value: 3 },
      ]);
      await run([{ kind: 'clearMeasure', workItemId: A, stepId: dev, metric: 'gpu_minutes' }]);
      const deleted = await runner.runDirectory(F, [
        { kind: 'deleteMeasure', measureId: await gpuId() },
      ]);
      expect(deleted).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(await facts()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses an undo of a delete whose fact is in a measure deleted since', async () => {
    const { source, runner, projectId, dev, idOf, run, facts, gpuId } = await seeded();
    try {
      const A = idOf('A');
      await run([
        { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'gpu_minutes', value: 3 },
      ]);
      expect(await run([{ kind: 'deleteWorkItem', workItemId: A }])).toMatchObject({ ok: true });
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId: await gpuId() }]),
      ).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(await facts()).toEqual([]);
    } finally {
      await source.close();
    }
  });
});

describe('replays across a deleted definition', () => {
  it('refuses an undo of a first-child create whose handed-down fact is in a measure deleted since', async () => {
    const { source, runner, projectId, dev, idOf, run, gpuId } = await seeded();
    try {
      const A = idOf('A');
      await run([
        { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'gpu_minutes', value: 3 },
      ]);
      // A gains its first child, which takes A's facts; the create's undo
      // hands them back up to A.
      const created = await run([
        { kind: 'createWorkItem', ref: 'C', name: 'C', parentId: A, afterId: null },
      ]);
      if (!created.ok) throw new Error('the child was refused');
      const child = created.results.find((each) => 'ref' in each && each.ref === 'C');
      if (child === undefined || !('id' in child) || typeof child.id !== 'string')
        throw new Error('no child C');
      await run([
        { kind: 'clearMeasure', workItemId: child.id, stepId: dev, metric: 'gpu_minutes' },
      ]);
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId: await gpuId() }]),
      ).toMatchObject({ ok: true });
      // The clear's undo refuses first (set_measure guard), then the create's.
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
    } finally {
      await source.close();
    }
  });
});

describe('agent minutes, derived on read', () => {
  it('reads agent minutes from ended attempts and rolls them up; a running attempt adds nothing', async () => {
    const { source, dev, idOf, run, facts, tree } = await seeded();
    try {
      const [A, B, P] = [idOf('A'), idOf('B'), idOf('P')];
      const start = Date.now() - 120 * MINUTE;
      expect(
        await run([
          { kind: 'startAttempt', workItemId: A, stepId: dev, at: start },
          {
            kind: 'endAttempt',
            workItemId: A,
            stepId: dev,
            outcome: 'failed',
            at: start + 10 * MINUTE,
          },
          { kind: 'startAttempt', workItemId: A, stepId: dev, at: start + 20 * MINUTE },
          {
            kind: 'endAttempt',
            workItemId: A,
            stepId: dev,
            outcome: 'succeeded',
            at: start + 45 * MINUTE,
          },
          { kind: 'startAttempt', workItemId: B, stepId: dev, at: start },
        ]),
      ).toMatchObject({ ok: true });
      const measuresOf = (read: PlanTree, id: string) =>
        read.workItems.find((row) => row.id === id)?.measures;
      // Hand sum: A's two ended attempts, 10 + 25 minutes; B's runs and adds nothing.
      const read = await tree();
      expect(measuresOf(read, A)).toEqual({ agent_minutes: { [dev]: 35 } });
      expect(measuresOf(read, B)).toEqual({});
      expect(measuresOf(read, P)).toEqual({ agent_minutes: { [dev]: 35 } });
      // Never stored.
      expect(await facts()).toEqual([]);
    } finally {
      await source.close();
    }
  });
});
