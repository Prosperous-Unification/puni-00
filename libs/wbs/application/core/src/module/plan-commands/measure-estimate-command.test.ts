import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { PlanTree } from '../../ports/plan-tree';
import type { Scope } from '../../ports/unit-of-work';
import { normalizeCommand, type PlanCommand } from '../../service/command-normalizers';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { expectCreated } from '../../testing/expect-created';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { createPlanCommandRunner } from './composition';

const F = 'account-f';
const ORG = 'org-a';
const TRIO = { optimistic: 100, realistic: 200, pessimistic: 600 };

/**
 * A project owned by the legacy organization `org-a`, which defines the
 * three-point `kwh` (real) beside the five seeds, holding parent `P` over
 * leaves `A` and `B` (`wbs-measure-budgets` tasks 2.1–2.3).
 */
async function seeded() {
  const fixture = openMemorySourceFixture();
  const source = fixture.source;
  fixture.addOrganization(ORG, { legacy: true });
  const options = {
    dependencyContext: createLocalDependencyContext(source.stores),
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
  const created = expectCreated(await graph.projects.create('Estimates', F));
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
    commandAccess: localCommandAccess,
    announcements: options.broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, {
        ...options,
        dependencyContext: createLocalDependencyContext(scope.stores),
        broadcast: announcements,
      }),
  });
  const defined = await runner.runDirectory(F, [
    {
      kind: 'createMeasure',
      key: 'kwh',
      name: 'Energy',
      unit: 'kWh',
      measureKind: 'count',
      scale: 'real',
      threePoint: true,
    },
  ]);
  if (!defined.ok) throw new Error(`kwh was refused: ${JSON.stringify(defined)}`);
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
  const trios = async () =>
    (await source.stores.measureEstimates.listByProject(projectId)).map(
      ({ workItemId, key, optimistic, realistic, pessimistic, singlePoint }) => ({
        workItemId,
        key,
        optimistic,
        realistic,
        pessimistic,
        singlePoint,
      }),
    );
  const facts = async () =>
    (await source.stores.measures.listByProject(projectId)).map(
      ({ workItemId, metric, value }) => ({ workItemId, metric, value }),
    );
  const kwhId = async () => {
    const held = await source.stores.directory.listMeasures(ORG);
    const found = held.find((each) => each.key === 'kwh');
    if (found === undefined) throw new Error('no kwh');
    return found.id;
  };
  const tree = async (): Promise<PlanTree> => {
    const read = await graph.workItems.tree(projectId);
    if (read === null || 'kind' in read) throw new Error('the plan read was unavailable');
    return read;
  };
  const rowOf = async (id: string) => {
    const row = (await tree()).workItems.find((each) => each.id === id);
    if (row === undefined) throw new Error(`no row ${id}`);
    return row;
  };
  const childOf = (outcome: Awaited<ReturnType<typeof run>>, ref: string): string => {
    if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome)}`);
    const found = outcome.results.find((each) => 'ref' in each && each.ref === ref);
    if (found === undefined || !('id' in found) || typeof found.id !== 'string')
      throw new Error(`no work item ${ref}`);
    return found.id;
  };
  return {
    source,
    graph,
    runner,
    projectId,
    dev,
    idOf,
    run,
    trios,
    facts,
    kwhId,
    tree,
    rowOf,
    childOf,
  };
}

const setTrio = (workItemId: string, stepId: string, measure: string, estimate = TRIO) =>
  ({ kind: 'setMeasureEstimate', workItemId, stepId, measure, estimate }) as const;

describe('measure estimates as plan commands', () => {
  it('records, re-estimates and clears a trio in tokens, cost and a defined measure, undoably', async () => {
    const { source, runner, projectId, dev, idOf, run, trios } = await seeded();
    try {
      const A = idOf('A');
      expect(
        await run([
          setTrio(A, dev, 'tokens'),
          {
            ...setTrio(A, dev, 'cost', { optimistic: 5, realistic: 5, pessimistic: 9 }),
            rateCardDigest: 'card-a',
          },
          setTrio(A, dev, 'kwh', { optimistic: 0.5, realistic: 1.25, pessimistic: 2 }),
        ]),
      ).toMatchObject({ ok: true });
      expect(await trios()).toEqual([
        {
          workItemId: A,
          key: 'cost',
          optimistic: 5,
          realistic: 5,
          pessimistic: 9,
          singlePoint: false,
        },
        {
          workItemId: A,
          key: 'kwh',
          optimistic: 0.5,
          realistic: 1.25,
          pessimistic: 2,
          singlePoint: false,
        },
        { workItemId: A, key: 'tokens', ...TRIO, singlePoint: false },
      ]);
      expect(
        await run([setTrio(A, dev, 'tokens', { optimistic: 1, realistic: 2, pessimistic: 3 })]),
      ).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await trios()).toContainEqual({
        workItemId: A,
        key: 'tokens',
        ...TRIO,
        singlePoint: false,
      });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await trios()).toEqual([]);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect(await trios()).toHaveLength(3);
      expect(
        await run([{ kind: 'clearMeasureEstimate', workItemId: A, stepId: dev, measure: 'kwh' }]),
      ).toMatchObject({ ok: true });
      expect((await trios()).map(({ key }) => key)).toEqual(['cost', 'tokens']);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect((await trios()).map(({ key }) => key)).toEqual(['cost', 'kwh', 'tokens']);
    } finally {
      await source.close();
    }
  });

  it('refuses an unknown, scheduling, two-point-only or fractional measure estimate and stores nothing', async () => {
    const { source, dev, idOf, run, trios } = await seeded();
    try {
      const A = idOf('A');
      expect(await run([setTrio(A, dev, 'story_points')])).toMatchObject({
        ok: false,
        reason: 'unknown_measure',
      });
      expect(await run([setTrio(A, dev, 'token_estimate')])).toMatchObject({
        ok: false,
        reason: 'unknown_measure',
      });
      expect(await run([setTrio(A, dev, 'time')])).toMatchObject({
        ok: false,
        reason: 'scheduling_measure_estimate',
      });
      expect(await run([setTrio(A, dev, 'hours')])).toMatchObject({
        ok: false,
        reason: 'three_point_forbidden',
      });
      expect(await run([setTrio(A, dev, 'agent_minutes')])).toMatchObject({
        ok: false,
        reason: 'three_point_forbidden',
      });
      expect(
        await run([setTrio(A, dev, 'tokens', { optimistic: 1, realistic: 1.5, pessimistic: 2 })]),
      ).toMatchObject({ ok: false, reason: 'scale_mismatch' });
      expect(
        await run([{ kind: 'clearMeasureEstimate', workItemId: A, stepId: dev, measure: 'time' }]),
      ).toMatchObject({ ok: false, reason: 'scheduling_measure_estimate' });
      // A refused command takes the batch's earlier writes with it.
      expect(await run([setTrio(A, dev, 'tokens'), setTrio(A, dev, 'hours')])).toMatchObject({
        ok: false,
        reason: 'three_point_forbidden',
      });
      expect(await trios()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses an unordered trio and stores nothing', async () => {
    const { source, dev, idOf, trios } = await seeded();
    try {
      const raw = {
        kind: 'setMeasureEstimate',
        workItemId: idOf('A'),
        stepId: dev,
        measure: 'tokens',
      };
      // The time trio's parse at the command boundary: HTTP answers `invalid_estimate`.
      expect(() =>
        normalizeCommand('setMeasureEstimate', {
          ...raw,
          estimate: { optimistic: 5, realistic: 2, pessimistic: 9 },
        }),
      ).toThrow();
      expect(() =>
        normalizeCommand('setMeasureEstimate', {
          ...raw,
          estimate: { optimistic: -1, realistic: 2, pessimistic: 9 },
        }),
      ).toThrow();
      expect(normalizeCommand('setMeasureEstimate', { ...raw, estimate: TRIO })).toMatchObject({
        kind: 'setMeasureEstimate',
        measure: 'tokens',
        estimate: TRIO,
      });
      expect(await trios()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses a trio on a parent as rolled_up', async () => {
    const { source, dev, idOf, run, trios } = await seeded();
    try {
      expect(await run([setTrio(idOf('P'), dev, 'tokens')])).toMatchObject({
        ok: false,
        reason: 'rolled_up',
      });
      expect(await trios()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses deleting a definition that holds a trio, and deletes it once the trio is cleared', async () => {
    const { source, runner, dev, idOf, run, kwhId } = await seeded();
    try {
      const A = idOf('A');
      await run([setTrio(A, dev, 'kwh')]);
      const measureId = await kwhId();
      expect(await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId }])).toMatchObject({
        ok: false,
        reason: 'measure_in_use',
      });
      await run([{ kind: 'clearMeasureEstimate', workItemId: A, stepId: dev, measure: 'kwh' }]);
      expect(await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId }])).toMatchObject({
        ok: true,
      });
    } finally {
      await source.close();
    }
  });
});

describe('expected measure and variance on the row read', () => {
  it('reads expected and variance per step node and rolled up', async () => {
    const { source, dev, idOf, run, rowOf } = await seeded();
    try {
      const [A, B, P] = [idOf('A'), idOf('B'), idOf('P')];
      expect(
        await run([
          setTrio(A, dev, 'tokens'),
          { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'tokens', value: 300 },
          setTrio(B, dev, 'tokens', { optimistic: 1, realistic: 2, pessimistic: 6 }),
          setTrio(B, dev, 'kwh', { optimistic: 1, realistic: 1, pessimistic: 2 }),
        ]),
      ).toMatchObject({ ok: true });
      // The spec scenario: 100/200/600 under 1/4/1 expects 250; 300 spent is 50 over.
      expect((await rowOf(A)).measureEstimates).toEqual({
        tokens: { [dev]: { ...TRIO, singlePoint: false, expected: 250, variance: 50 } },
      });
      // No fact beside it, so no variance; a real measure keeps its fraction.
      const atB = (await rowOf(B)).measureEstimates;
      expect(atB?.['tokens']).toEqual({
        [dev]: { optimistic: 1, realistic: 2, pessimistic: 6, singlePoint: false, expected: 3 },
      });
      expect(atB?.['kwh']?.[dev]?.expected).toBeCloseTo(7 / 6, 12);
      // The parent sums trios and rounded expected measures, and its variance
      // is its summed facts minus its summed expected measures.
      expect((await rowOf(P)).measureEstimates?.['tokens']).toEqual({
        [dev]: {
          optimistic: 101,
          realistic: 202,
          pessimistic: 606,
          singlePoint: false,
          expected: 253,
          variance: 47,
        },
      });
    } finally {
      await source.close();
    }
  });

  it("weighs the trio by the project's own PERT weights", async () => {
    const { source, graph, projectId, dev, idOf, run, rowOf } = await seeded();
    try {
      const A = idOf('A');
      const updated = await graph.projects.update(projectId, F, {
        pertWeights: { optimistic: 1, realistic: 1, pessimistic: 1 },
      });
      expect(updated).toMatchObject({ ok: true });
      await run([setTrio(A, dev, 'tokens')]);
      expect((await rowOf(A)).measureEstimates?.['tokens']?.[dev]?.expected).toBe(300);
    } finally {
      await source.close();
    }
  });

  it('keeps a row holding no measure estimate free of the field, every other field unchanged', async () => {
    const { source, dev, idOf, run, tree } = await seeded();
    try {
      const A = idOf('A');
      await run([{ kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'tokens', value: 3 }]);
      const before = await tree();
      expect(before.workItems.some((row) => 'measureEstimates' in row)).toBe(false);
      await run([setTrio(A, dev, 'kwh')]);
      await run([{ kind: 'clearMeasureEstimate', workItemId: A, stepId: dev, measure: 'kwh' }]);
      const after = await tree();
      expect(JSON.stringify(after.workItems)).toBe(JSON.stringify(before.workItems));
    } finally {
      await source.close();
    }
  });
});

describe('the legacy token estimate as a single-point trio', () => {
  it('reads a legacy token estimate as a single-point trio and clears the flag on a three-point write', async () => {
    const { source, runner, projectId, dev, idOf, run, trios, facts, rowOf } = await seeded();
    try {
      const A = idOf('A');
      await run([
        { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'token_estimate', value: 40 },
      ]);
      expect(await trios()).toEqual([
        {
          workItemId: A,
          key: 'tokens',
          optimistic: 40,
          realistic: 40,
          pessimistic: 40,
          singlePoint: true,
        },
      ]);
      expect((await rowOf(A)).measures).toEqual({ token_estimate: { [dev]: 40 } });
      expect((await rowOf(A)).measureEstimates?.['tokens']?.[dev]).toEqual({
        optimistic: 40,
        realistic: 40,
        pessimistic: 40,
        singlePoint: true,
        expected: 40,
      });
      await run([setTrio(A, dev, 'tokens', { optimistic: 30, realistic: 40, pessimistic: 80 })]);
      expect(await trios()).toEqual([
        {
          workItemId: A,
          key: 'tokens',
          optimistic: 30,
          realistic: 40,
          pessimistic: 80,
          singlePoint: false,
        },
      ]);
      // The single figure is retired: the old release reads no token estimate.
      expect(await facts()).toEqual([]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await trios()).toEqual([
        {
          workItemId: A,
          key: 'tokens',
          optimistic: 40,
          realistic: 40,
          pessimistic: 40,
          singlePoint: true,
        },
      ]);
      expect(await facts()).toEqual([{ workItemId: A, metric: 'token_estimate', value: 40 }]);
    } finally {
      await source.close();
    }
  });

  it('undoes a legacy token estimate written over a three-point trio by putting the trio back', async () => {
    const { source, runner, projectId, dev, idOf, run, trios, facts } = await seeded();
    try {
      const A = idOf('A');
      await run([setTrio(A, dev, 'tokens')]);
      await run([
        { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'token_estimate', value: 40 },
      ]);
      expect(await trios()).toEqual([
        {
          workItemId: A,
          key: 'tokens',
          optimistic: 40,
          realistic: 40,
          pessimistic: 40,
          singlePoint: true,
        },
      ]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await trios()).toEqual([
        { workItemId: A, key: 'tokens', ...TRIO, singlePoint: false },
      ]);
      expect(await facts()).toEqual([]);
    } finally {
      await source.close();
    }
  });
});

describe('measure estimates follow their work item', () => {
  it("hands a leaf's trios down to its first child and back up on undo", async () => {
    const { source, runner, projectId, dev, idOf, run, trios, childOf } = await seeded();
    try {
      const A = idOf('A');
      await run([
        setTrio(A, dev, 'kwh'),
        { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'token_estimate', value: 40 },
      ]);
      const C = childOf(
        await run([{ kind: 'createWorkItem', ref: 'C', name: 'C', parentId: A, afterId: null }]),
        'C',
      );
      expect((await trios()).map(({ workItemId, key }) => [workItemId, key])).toEqual([
        [C, 'kwh'],
        [C, 'tokens'],
      ]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect((await trios()).map(({ workItemId, key }) => [workItemId, key])).toEqual([
        [A, 'kwh'],
        [A, 'tokens'],
      ]);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect((await trios()).map(({ workItemId, key }) => [workItemId, key])).toEqual([
        [C, 'kwh'],
        [C, 'tokens'],
      ]);
    } finally {
      await source.close();
    }
  });

  it("hands a deleted last child's trios up to the parent and takes them off again on undo", async () => {
    const { source, runner, projectId, dev, idOf, run, trios, childOf } = await seeded();
    try {
      const B = idOf('B');
      const C = childOf(
        await run([{ kind: 'createWorkItem', ref: 'C', name: 'C', parentId: B, afterId: null }]),
        'C',
      );
      const D = childOf(
        await run([{ kind: 'createWorkItem', ref: 'D', name: 'D', parentId: B, afterId: C }]),
        'D',
      );
      await run([
        setTrio(C, dev, 'tokens', { optimistic: 1, realistic: 2, pessimistic: 3 }),
        { kind: 'setMeasure', workItemId: D, stepId: dev, metric: 'token_estimate', value: 10 },
      ]);
      await run([{ kind: 'deleteWorkItem', workItemId: D }]);
      // C alone is left; deleting it makes B a leaf holding the branch's sum.
      await run([
        { kind: 'setMeasure', workItemId: C, stepId: dev, metric: 'token_estimate', value: 5 },
      ]);
      await run([setTrio(C, dev, 'tokens', { optimistic: 1, realistic: 2, pessimistic: 3 })]);
      expect(await run([{ kind: 'deleteWorkItem', workItemId: C }])).toMatchObject({ ok: true });
      expect(await trios()).toEqual([
        {
          workItemId: B,
          key: 'tokens',
          optimistic: 1,
          realistic: 2,
          pessimistic: 3,
          singlePoint: false,
        },
      ]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await trios()).toEqual([
        {
          workItemId: C,
          key: 'tokens',
          optimistic: 1,
          realistic: 2,
          pessimistic: 3,
          singlePoint: false,
        },
      ]);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect((await trios()).map(({ workItemId }) => workItemId)).toEqual([B]);
    } finally {
      await source.close();
    }
  });

  it("puts a deleted branch's trios back on undo", async () => {
    const { source, runner, projectId, dev, idOf, run, trios } = await seeded();
    try {
      const [A, B] = [idOf('A'), idOf('B')];
      await run([setTrio(A, dev, 'kwh'), setTrio(B, dev, 'tokens')]);
      expect(
        await run([{ kind: 'deleteWorkItem', workItemId: idOf('P'), strategy: 'cascade' }]),
      ).toMatchObject({ ok: true });
      expect(await trios()).toEqual([]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect((await trios()).map(({ workItemId, key }) => [workItemId, key])).toEqual(
        [
          [A, 'kwh'],
          [B, 'tokens'],
        ].sort(([left], [right]) => left.localeCompare(right)),
      );
    } finally {
      await source.close();
    }
  });

  it("copies a duplicated branch's trios and takes them with the copy on undo", async () => {
    const { source, runner, projectId, dev, idOf, run, trios, childOf } = await seeded();
    try {
      const A = idOf('A');
      await run([setTrio(A, dev, 'kwh')]);
      const copy = childOf(
        await run([{ kind: 'duplicateWorkItem', workItemId: A, ref: 'copy' }]),
        'copy',
      );
      expect((await trios()).filter(({ workItemId }) => workItemId === copy)).toEqual([
        { workItemId: copy, key: 'kwh', ...TRIO, singlePoint: false },
      ]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect((await trios()).map(({ workItemId }) => workItemId)).toEqual([A]);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect((await trios()).filter(({ workItemId }) => workItemId === copy)).toHaveLength(1);
    } finally {
      await source.close();
    }
  });
});

describe('a definition that stops allowing three points', () => {
  const patchThreePoint = async (
    runner: Awaited<ReturnType<typeof seeded>>['runner'],
    source: Awaited<ReturnType<typeof seeded>>['source'],
    key: string,
  ) => {
    const found = (await source.stores.directory.listMeasures(ORG)).find(
      (each) => each.key === key,
    );
    if (found === undefined) throw new Error(`no ${key}`);
    const patched = await runner.runDirectory(F, [
      { kind: 'patchMeasure', measureId: found.id, patch: { threePoint: false } },
    ]);
    if (!patched.ok) throw new Error(`the patch was refused: ${JSON.stringify(patched)}`);
  };

  it('undoes a delete and a first-child create after tokens stops allowing three points', async () => {
    const { source, runner, projectId, dev, idOf, run, facts, childOf } = await seeded();
    try {
      const [A, B] = [idOf('A'), idOf('B')];
      await patchThreePoint(runner, source, 'tokens');
      await run([
        { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'token_estimate', value: 500 },
        { kind: 'setMeasure', workItemId: B, stepId: dev, metric: 'token_estimate', value: 70 },
      ]);
      expect(await run([{ kind: 'deleteWorkItem', workItemId: A }])).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await facts()).toContainEqual({ workItemId: A, metric: 'token_estimate', value: 500 });
      const C = childOf(
        await run([{ kind: 'createWorkItem', ref: 'C', name: 'C', parentId: B, afterId: null }]),
        'C',
      );
      expect(await facts()).toContainEqual({ workItemId: C, metric: 'token_estimate', value: 70 });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await facts()).toContainEqual({ workItemId: B, metric: 'token_estimate', value: 70 });
    } finally {
      await source.close();
    }
  });

  it('clears a trio stored before its measure stopped allowing three points', async () => {
    const { source, runner, dev, idOf, run, trios } = await seeded();
    try {
      const A = idOf('A');
      await run([setTrio(A, dev, 'kwh')]);
      await patchThreePoint(runner, source, 'kwh');
      expect(await run([setTrio(A, dev, 'kwh')])).toMatchObject({
        ok: false,
        reason: 'three_point_forbidden',
      });
      expect(
        await run([{ kind: 'clearMeasureEstimate', workItemId: A, stepId: dev, measure: 'kwh' }]),
      ).toMatchObject({ ok: true });
      expect(await trios()).toEqual([]);
    } finally {
      await source.close();
    }
  });
});

describe('the legacy token estimate through a restore', () => {
  it("restores a deleted leaf's legacy token estimate with its recordedAt verbatim", async () => {
    const { source, runner, projectId, dev, idOf, run } = await seeded();
    try {
      const A = idOf('A');
      await run([
        { kind: 'setMeasure', workItemId: A, stepId: dev, metric: 'token_estimate', value: 40 },
      ]);
      const recorded = async () =>
        (await source.stores.measures.listByProject(projectId)).find(
          (each) => each.workItemId === A && each.metric === 'token_estimate',
        )?.recordedAt;
      const before = await recorded();
      expect(before).toBeNumber();
      await Bun.sleep(5);
      await run([{ kind: 'deleteWorkItem', workItemId: A }]);
      await Bun.sleep(5);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await recorded()).toBe(before);
    } finally {
      await source.close();
    }
  });
});

describe('replays across a deleted definition', () => {
  it('refuses an undo that would put a trio back in a measure deleted since', async () => {
    const { source, runner, projectId, dev, idOf, run, trios, kwhId } = await seeded();
    try {
      const A = idOf('A');
      await run([setTrio(A, dev, 'kwh')]);
      await run([{ kind: 'clearMeasureEstimate', workItemId: A, stepId: dev, measure: 'kwh' }]);
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId: await kwhId() }]),
      ).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(await trios()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses an undo of a delete whose trio is in a measure deleted since', async () => {
    const { source, runner, projectId, dev, idOf, run, trios, kwhId } = await seeded();
    try {
      const A = idOf('A');
      await run([setTrio(A, dev, 'kwh')]);
      expect(await run([{ kind: 'deleteWorkItem', workItemId: A }])).toMatchObject({ ok: true });
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId: await kwhId() }]),
      ).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(await trios()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses an undo of a first-child create whose handed-down trio is in a measure deleted since', async () => {
    const { source, runner, projectId, dev, idOf, run, kwhId, childOf } = await seeded();
    try {
      const A = idOf('A');
      await run([setTrio(A, dev, 'kwh')]);
      const C = childOf(
        await run([{ kind: 'createWorkItem', ref: 'C', name: 'C', parentId: A, afterId: null }]),
        'C',
      );
      await run([{ kind: 'clearMeasureEstimate', workItemId: C, stepId: dev, measure: 'kwh' }]);
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId: await kwhId() }]),
      ).toMatchObject({ ok: true });
      // The clear's undo refuses first, then the create's.
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
    } finally {
      await source.close();
    }
  });
});
