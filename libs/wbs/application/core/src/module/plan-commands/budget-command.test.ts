import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { PlanTree } from '../../ports/plan-tree';
import type { Scope } from '../../ports/unit-of-work';
import { normalizeCommand, type PlanCommand } from '../../service/command-normalizers';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { createPlanCommandRunner } from './composition';

const F = 'account-f';
const ORG = 'org-a';
const MINUTE = 60_000;
const LEGACY = { kind: 'legacy' } as const;

/**
 * A project owned by the legacy organization `org-a`, which defines the
 * three-point `kwh` (real) beside the five seeds, holding parent `P` over
 * leaves `A`, `B` and `C` (`wbs-measure-budgets` tasks 3.1–3.3).
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
  const created = await graph.projects.create('Budgets', F);
  const projectId = created.project.id;
  fixture.ownProjectInOrganization(projectId, ORG);
  for (const step of created.steps) {
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: F },
    );
  }
  const stepIds = created.steps.map(({ id }) => id);
  const [dev, qa] = [stepIds.at(0), stepIds.at(1)];
  if (dev === undefined || qa === undefined)
    throw new Error('the project has fewer than two steps');
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
    {
      kind: 'createWorkItem',
      ref: 'C',
      name: 'C',
      parentId: null,
      parentRef: 'P',
      afterId: null,
      afterRef: 'B',
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
  const budgets = async () =>
    (await source.stores.budgets.listByProject(projectId)).map(({ workItemId, key, cap }) => ({
      workItemId,
      key,
      cap,
    }));
  const kwhId = async () => {
    const found = (await source.stores.directory.listMeasures(ORG)).find((m) => m.key === 'kwh');
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
    qa,
    idOf,
    run,
    budgets,
    kwhId,
    tree,
    rowOf,
    childOf,
  };
}

const setBudget = (
  workItemId: string,
  measure: string,
  cap: number,
  policy: 'strict' | 'advisory' = 'strict',
  holdPerAttempt: number | null = null,
) => ({ kind: 'setBudget', workItemId, measure, cap, policy, holdPerAttempt }) as const;

const fact = (workItemId: string, stepId: string, metric: string, value: number) =>
  ({ kind: 'setMeasure', workItemId, stepId, metric, value }) as const;

const trio = (workItemId: string, stepId: string, measure: string, pessimistic: number) =>
  ({
    kind: 'setMeasureEstimate',
    workItemId,
    stepId,
    measure,
    estimate: { optimistic: 1, realistic: 2, pessimistic },
  }) as const;

describe('budgets as plan commands', () => {
  it('sets, replaces and clears a budget, undoably', async () => {
    const { source, runner, projectId, idOf, run, budgets, rowOf } = await seeded();
    try {
      const P = idOf('P');
      expect(await run([setBudget(P, 'tokens', 1000)])).toMatchObject({ ok: true });
      expect(await budgets()).toEqual([{ workItemId: P, key: 'tokens', cap: 1000 }]);
      expect((await rowOf(P)).budgets).toEqual({
        tokens: { cap: 1000, policy: 'strict', source: 'stated', remaining: 1000, exceeded: false },
      });
      expect(await run([setBudget(P, 'tokens', 800, 'advisory')])).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await budgets()).toEqual([{ workItemId: P, key: 'tokens', cap: 1000 }]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await budgets()).toEqual([]);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect(await run([{ kind: 'clearBudget', workItemId: P, measure: 'tokens' }])).toMatchObject({
        ok: true,
      });
      expect(await budgets()).toEqual([]);
      expect((await rowOf(P)).budgets).toBeUndefined();
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await budgets()).toEqual([{ workItemId: P, key: 'tokens', cap: 1000 }]);
      // A budget on a derived measure and on a defined one, a hold beside it.
      expect(
        await run([setBudget(P, 'agent_minutes', 90, 'strict', 30), setBudget(P, 'kwh', 2.5)]),
      ).toMatchObject({ ok: true });
      expect(await budgets()).toHaveLength(3);
    } finally {
      await source.close();
    }
  });

  it('refuses an unknown, scheduling, negative or fractional budget and stores nothing', async () => {
    const { source, idOf, run, budgets } = await seeded();
    try {
      const A = idOf('A');
      expect(await run([setBudget(A, 'story_points', 1)])).toMatchObject({
        ok: false,
        reason: 'unknown_measure',
      });
      expect(await run([setBudget(A, 'token_actual', 1)])).toMatchObject({
        ok: false,
        reason: 'unknown_measure',
      });
      expect(await run([setBudget(A, 'time', 5)])).toMatchObject({
        ok: false,
        reason: 'scheduling_measure_budget',
      });
      expect(await run([{ kind: 'clearBudget', workItemId: A, measure: 'time' }])).toMatchObject({
        ok: false,
        reason: 'scheduling_measure_budget',
      });
      expect(await run([setBudget(A, 'tokens', 1.5)])).toMatchObject({
        ok: false,
        reason: 'scale_mismatch',
      });
      // All or none: the first command's write goes with the refusal.
      expect(await run([setBudget(A, 'tokens', 5), setBudget(A, 'time', 5)])).toMatchObject({
        ok: false,
        reason: 'scheduling_measure_budget',
      });
      expect(await budgets()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses a negative cap or hold, or an unknown policy, before anything runs', () => {
    const raw = { kind: 'setBudget', workItemId: 'w', measure: 'tokens', policy: 'strict' };
    for (const body of [
      { ...raw, cap: -1 },
      { ...raw, cap: 10, holdPerAttempt: -1 },
      { ...raw, cap: 10, policy: 'firm' },
      { ...raw, cap: Number.NaN },
    ])
      expect(() => normalizeCommand('setBudget', body)).toThrow('invalid_budget');
    expect(normalizeCommand('setBudget', { ...raw, cap: 10 })).toEqual({
      kind: 'setBudget',
      workItemId: 'w',
      measure: 'tokens',
      cap: 10,
      policy: 'strict',
      holdPerAttempt: null,
    });
  });

  it('refuses deleting a definition that holds a budget, and deletes it once the budget is cleared', async () => {
    const { source, runner, idOf, run, kwhId } = await seeded();
    try {
      const A = idOf('A');
      await run([setBudget(A, 'kwh', 3)]);
      const measureId = await kwhId();
      expect(await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId }])).toMatchObject({
        ok: false,
        reason: 'measure_in_use',
      });
      await run([{ kind: 'clearBudget', workItemId: A, measure: 'kwh' }]);
      expect(await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId }])).toMatchObject({
        ok: true,
      });
    } finally {
      await source.close();
    }
  });

  it('refuses a budget factor of 0 and keeps the one it had', async () => {
    const { source, graph, projectId } = await seeded();
    try {
      expect(await graph.projects.updateWithin(projectId, F, { budgetFactor: 0 }, LEGACY)).toEqual({
        ok: false,
        reason: 'bad_budget_factor',
      });
      expect(
        await graph.projects.updateWithin(projectId, F, { budgetFactor: 1001 }, LEGACY),
      ).toEqual({ ok: false, reason: 'bad_budget_factor' });
      expect(
        await graph.projects.updateWithin(projectId, F, { budgetFactor: 1.5 }, LEGACY),
      ).toMatchObject({ ok: true, value: { budgetFactor: 1.5 } });
      expect((await source.stores.projects.findById(projectId))?.budgetFactor).toBe(1.5);
    } finally {
      await source.close();
    }
  });
});

describe('budgets on the row read', () => {
  it("reads a parent's strict budget against its three leaves' facts", async () => {
    // The spec scenario "A subtree budget".
    const { source, dev, idOf, run, rowOf } = await seeded();
    try {
      const [P, A, B, C] = ['P', 'A', 'B', 'C'].map(idOf);
      expect(
        await run([
          setBudget(P, 'tokens', 1000),
          fact(A, dev, 'tokens', 400),
          fact(B, dev, 'tokens', 400),
          fact(C, dev, 'tokens', 400),
        ]),
      ).toMatchObject({ ok: true });
      // Facts past a strict cap are still recorded.
      expect((await rowOf(P)).measures).toEqual({ token_actual: { [dev]: 1200 } });
      expect((await rowOf(P)).budgets).toEqual({
        tokens: { cap: 1000, policy: 'strict', source: 'stated', remaining: -200, exceeded: true },
      });
      // Each leaf reads its own share and holds no budget of its own.
      expect((await rowOf(A)).measures).toEqual({ token_actual: { [dev]: 400 } });
      expect((await rowOf(A)).budgets).toBeUndefined();
    } finally {
      await source.close();
    }
  });

  it("derives a budget from the pessimistic points times the project's budget factor", async () => {
    const { source, graph, projectId, dev, qa, idOf, run, rowOf } = await seeded();
    try {
      const [P, A, B] = ['P', 'A', 'B'].map(idOf);
      await run([
        trio(A, dev, 'tokens', 300),
        trio(A, qa, 'tokens', 100),
        trio(B, dev, 'tokens', 200),
      ]);
      await run([fact(A, dev, 'tokens', 50)]);
      expect((await rowOf(A)).budgets).toEqual({
        tokens: {
          cap: 400,
          policy: 'advisory',
          source: 'derived',
          remaining: 350,
          exceeded: false,
        },
      });
      expect((await rowOf(P)).budgets?.['tokens']?.cap).toBe(600);
      await graph.projects.updateWithin(projectId, F, { budgetFactor: 1.5 }, LEGACY);
      expect((await rowOf(P)).budgets?.['tokens']?.cap).toBe(900);
      // A stated budget overrides the derived one; clearing it brings it back.
      await run([setBudget(A, 'tokens', 100)]);
      expect((await rowOf(A)).budgets?.['tokens']).toMatchObject({ cap: 100, source: 'stated' });
      await run([{ kind: 'clearBudget', workItemId: A, measure: 'tokens' }]);
      expect((await rowOf(A)).budgets?.['tokens']).toMatchObject({ cap: 600, source: 'derived' });
    } finally {
      await source.close();
    }
  });

  it('keeps a row holding no budget free of the field, every other field unchanged', async () => {
    const { source, dev, idOf, run, rowOf } = await seeded();
    try {
      const A = idOf('A');
      await run([fact(A, dev, 'tokens', 5)]);
      const before = await rowOf(A);
      expect('budgets' in before).toBe(false);
      expect('mixedRateCards' in before).toBe(false);
      await run([setBudget(idOf('B'), 'tokens', 10)]);
      const { revision: _r1, ...after } = await rowOf(A);
      const { revision: _r0, ...was } = before;
      expect(after).toEqual(was);
    } finally {
      await source.close();
    }
  });

  it('holds the allowance of each running attempt of unknown usage, and releases it on its end', async () => {
    // The spec scenario "Unknown spend holds".
    const { source, dev, idOf, run, rowOf } = await seeded();
    try {
      const [P, A, B] = ['P', 'A', 'B'].map(idOf);
      const start = Date.now() - 60 * MINUTE;
      await run([
        setBudget(A, 'tokens', 500, 'strict', 300),
        setBudget(P, 'tokens', 500, 'strict', 300),
      ]);
      await run([{ kind: 'startAttempt', workItemId: A, stepId: dev, at: start }]);
      expect((await rowOf(A)).budgets?.['tokens']).toEqual({
        cap: 500,
        policy: 'strict',
        source: 'stated',
        remaining: 200,
        exceeded: false,
        held: 300,
      });
      // A second unknown attempt under the parent holds again: nothing remains.
      await run([{ kind: 'startAttempt', workItemId: B, stepId: dev, at: start }]);
      expect((await rowOf(P)).budgets?.['tokens']).toMatchObject({ remaining: -100, held: 600 });
      // A fact recorded since its start makes A's usage known.
      await run([fact(A, dev, 'tokens', 120)]);
      expect((await rowOf(A)).budgets?.['tokens']).toMatchObject({ remaining: 380, held: 0 });
      await run([
        {
          kind: 'endAttempt',
          workItemId: B,
          stepId: dev,
          outcome: 'succeeded',
          at: start + MINUTE,
        },
      ]);
      expect((await rowOf(P)).budgets?.['tokens']).toMatchObject({ remaining: 380, held: 0 });
    } finally {
      await source.close();
    }
  });

  it('reads agent minutes spent against an agent minutes budget', async () => {
    const { source, dev, idOf, run, rowOf } = await seeded();
    try {
      const A = idOf('A');
      const start = Date.now() - 60 * MINUTE;
      await run([
        setBudget(A, 'agent_minutes', 30),
        { kind: 'startAttempt', workItemId: A, stepId: dev, at: start },
        {
          kind: 'endAttempt',
          workItemId: A,
          stepId: dev,
          outcome: 'failed',
          at: start + 45 * MINUTE,
        },
      ]);
      expect((await rowOf(A)).budgets?.['agent_minutes']).toMatchObject({
        remaining: -15,
        exceeded: true,
      });
    } finally {
      await source.close();
    }
  });
});

describe('budgets stay on their work item', () => {
  it('keeps a leaf budget on the leaf when it gains a first child, and bounds the child', async () => {
    const { source, runner, projectId, dev, idOf, run, budgets, childOf, rowOf } = await seeded();
    try {
      const A = idOf('A');
      await run([setBudget(A, 'tokens', 100), fact(A, dev, 'tokens', 60)]);
      const D = childOf(
        await run([{ kind: 'createWorkItem', ref: 'D', name: 'D', parentId: A, afterId: null }]),
        'D',
      );
      expect(await budgets()).toEqual([{ workItemId: A, key: 'tokens', cap: 100 }]);
      // The fact went down to D; A's budget now bounds it.
      expect((await rowOf(A)).budgets?.['tokens']).toMatchObject({ remaining: 40 });
      expect((await rowOf(D)).budgets).toBeUndefined();
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await budgets()).toEqual([{ workItemId: A, key: 'tokens', cap: 100 }]);
    } finally {
      await source.close();
    }
  });

  it("does not hand a deleted last child's budget up, and puts it back on undo", async () => {
    const { source, runner, projectId, idOf, run, budgets, childOf } = await seeded();
    try {
      const A = idOf('A');
      const D = childOf(
        await run([{ kind: 'createWorkItem', ref: 'D', name: 'D', parentId: A, afterId: null }]),
        'D',
      );
      await run([setBudget(D, 'tokens', 7), setBudget(A, 'tokens', 9)]);
      expect(await run([{ kind: 'deleteWorkItem', workItemId: D }])).toMatchObject({ ok: true });
      expect(await budgets()).toEqual([{ workItemId: A, key: 'tokens', cap: 9 }]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await budgets()).toContainEqual({ workItemId: D, key: 'tokens', cap: 7 });
      expect(await budgets()).toHaveLength(2);
    } finally {
      await source.close();
    }
  });

  it("puts a deleted branch's budgets back on undo", async () => {
    const { source, runner, projectId, idOf, run, budgets } = await seeded();
    try {
      const [P, A] = [idOf('P'), idOf('A')];
      await run([setBudget(P, 'tokens', 10), setBudget(A, 'kwh', 2)]);
      expect(
        await run([{ kind: 'deleteWorkItem', workItemId: P, strategy: 'cascade' }]),
      ).toMatchObject({ ok: true });
      expect(await budgets()).toEqual([]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await budgets()).toHaveLength(2);
    } finally {
      await source.close();
    }
  });

  it("copies a duplicated branch's budgets and takes them with the copy on undo", async () => {
    const { source, runner, projectId, idOf, run, budgets, childOf } = await seeded();
    try {
      const A = idOf('A');
      await run([setBudget(A, 'tokens', 11)]);
      const copy = childOf(
        await run([{ kind: 'duplicateWorkItem', workItemId: A, ref: 'copy' }]),
        'copy',
      );
      expect(await budgets()).toContainEqual({ workItemId: copy, key: 'tokens', cap: 11 });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await budgets()).toEqual([{ workItemId: A, key: 'tokens', cap: 11 }]);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect(await budgets()).toHaveLength(2);
    } finally {
      await source.close();
    }
  });

  it('refuses an undo that would put a budget back in a measure deleted since', async () => {
    const { source, runner, projectId, idOf, run, budgets, kwhId } = await seeded();
    try {
      const A = idOf('A');
      await run([setBudget(A, 'kwh', 3)]);
      await run([{ kind: 'clearBudget', workItemId: A, measure: 'kwh' }]);
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId: await kwhId() }]),
      ).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(await budgets()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses an undo of a delete whose budget is in a measure deleted since', async () => {
    const { source, runner, projectId, idOf, run, budgets, kwhId } = await seeded();
    try {
      const A = idOf('A');
      await run([setBudget(A, 'kwh', 3)]);
      expect(await run([{ kind: 'deleteWorkItem', workItemId: A }])).toMatchObject({ ok: true });
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteMeasure', measureId: await kwhId() }]),
      ).toMatchObject({ ok: true });
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(await budgets()).toEqual([]);
    } finally {
      await source.close();
    }
  });
});

describe('the headroom read', () => {
  it('reports each startable and claimed step with its tightest budget, holds taken off', async () => {
    const { source, graph, projectId, dev, qa, idOf, run } = await seeded();
    try {
      const [P, A, B] = ['P', 'A', 'B'].map(idOf);
      const start = Date.now() - 60 * MINUTE;
      await run([
        setBudget(P, 'tokens', 500, 'strict', 300),
        setBudget(A, 'tokens', 1000),
        { kind: 'startAttempt', workItemId: A, stepId: dev, at: start },
      ]);
      const read = await graph.workItems.budgetHeadroomWithin(projectId, LEGACY);
      if (read === null) throw new Error('the project was not readable');
      const stepOf = (workItemId: string, stepId: string) =>
        read.steps.find((each) => each.workItemId === workItemId && each.stepId === stepId);
      // B's dev step: the parent's budget, less the hold of A's unknown attempt.
      expect(stepOf(B, dev)).toEqual({
        workItemId: B,
        stepId: dev,
        state: 'startable',
        budgets: {
          tokens: {
            strict: {
              workItemId: P,
              cap: 500,
              policy: 'strict',
              source: 'stated',
              remaining: 200,
              exceeded: false,
              held: 300,
            },
          },
        },
      });
      // A's own looser strict budget loses to the parent's tighter one.
      expect(stepOf(A, qa)?.budgets['tokens']?.strict?.workItemId).toBe(P);
      expect(read.steps.every(({ state }) => state === 'startable')).toBe(true);
    } finally {
      await source.close();
    }
  });

  it('names a mix on the blocked step and key only, the read itself never refused', async () => {
    // The reviewer's repro: sibling B mixes cost (unpriced and card x), leaf A
    // holds a tokens budget alone.
    const { source, graph, projectId, dev, qa, idOf, run } = await seeded();
    try {
      const [P, A, B] = ['P', 'A', 'B'].map(idOf);
      await run([
        setBudget(A, 'tokens', 100),
        setBudget(P, 'cost', 1_000_000),
        { ...fact(B, dev, 'cost', 10), rateCardDigest: 'x' },
      ]);
      // An unpriced figure written before bases existed.
      await source.stores.measures.set(
        { workItemId: B, stepId: qa, metric: 'cost', value: 4, recordedAt: 1 },
        { at: 1, by: F },
      );
      const read = await graph.workItems.budgetHeadroomWithin(projectId, LEGACY);
      if (read === null) throw new Error('the project was not readable');
      const onA = read.steps.find((each) => each.workItemId === A && each.stepId === dev);
      // Proof: with `findBudgetHeadroom` answering no steps whenever any budget
      // is blocked, this case read none for A; watched 2026-10-23.
      expect(onA?.budgets['tokens']?.strict).toMatchObject({ workItemId: A, remaining: 100 });
      // P's cost budget cannot be read: named on A's cost key, tokens untouched.
      expect(onA?.budgets['cost']).toEqual({
        mixedRateCards: [null, { currency: 'USD', rateCardDigest: 'x' }],
        mixedAt: P,
      });
    } finally {
      await source.close();
    }
  });

  it('keeps an exhausted strict budget beside a looser advisory one', async () => {
    // The reviewer's fixture: P strict tokens 1000 spent 1000, A derived 300 spent 500.
    const { source, graph, projectId, dev, qa, idOf, run } = await seeded();
    try {
      const [P, A, B] = ['P', 'A', 'B'].map(idOf);
      await run([
        setBudget(P, 'tokens', 1000),
        trio(A, dev, 'tokens', 300),
        fact(A, dev, 'tokens', 500),
        fact(B, dev, 'tokens', 500),
      ]);
      const read = await graph.workItems.budgetHeadroomWithin(projectId, LEGACY);
      if (read === null) throw new Error('the project was not readable');
      const onA = read.steps.find((each) => each.workItemId === A && each.stepId === qa);
      expect(onA?.budgets['tokens']).toMatchObject({
        strict: { workItemId: P, remaining: 0 },
        advisory: { workItemId: A, source: 'derived', remaining: -200 },
      });
    } finally {
      await source.close();
    }
  });
});

describe('money carries its basis', () => {
  it('requires a rate card on a cost fact and refuses one on tokens', async () => {
    const { source, projectId, dev, idOf, run } = await seeded();
    try {
      const A = idOf('A');
      expect(await run([fact(A, dev, 'cost', 10)])).toMatchObject({
        ok: false,
        reason: 'rate_card_required',
      });
      expect(
        await run([{ ...fact(A, dev, 'tokens', 10), rateCardDigest: 'card-a' }]),
      ).toMatchObject({ ok: false, reason: 'rate_card_forbidden' });
      expect(
        await run([{ ...fact(A, dev, 'token_estimate', 10), rateCardDigest: 'card-a' }]),
      ).toMatchObject({ ok: false, reason: 'rate_card_forbidden' });
      expect(await run([{ ...fact(A, dev, 'cost', 10), rateCardDigest: 'card-a' }])).toMatchObject({
        ok: true,
      });
      expect(
        (await source.stores.measures.listByProject(projectId)).map(({ metric, basis }) => ({
          metric,
          basis,
        })),
      ).toEqual([{ metric: 'cost', basis: { currency: 'USD', rateCardDigest: 'card-a' } }]);
    } finally {
      await source.close();
    }
  });

  it('requires a rate card on a cost trio and refuses one on tokens', async () => {
    const { source, projectId, dev, idOf, run } = await seeded();
    try {
      const A = idOf('A');
      expect(await run([trio(A, dev, 'cost', 9)])).toMatchObject({
        ok: false,
        reason: 'rate_card_required',
      });
      expect(await run([{ ...trio(A, dev, 'tokens', 9), rateCardDigest: 'card-a' }])).toMatchObject(
        { ok: false, reason: 'rate_card_forbidden' },
      );
      expect(await run([{ ...trio(A, dev, 'cost', 9), rateCardDigest: 'card-a' }])).toMatchObject({
        ok: true,
      });
      expect(
        (await source.stores.measureEstimates.listByProject(projectId)).map(({ key, basis }) => ({
          key,
          basis,
        })),
      ).toEqual([{ key: 'cost', basis: { currency: 'USD', rateCardDigest: 'card-a' } }]);
    } finally {
      await source.close();
    }
  });

  it('refuses an empty rate card digest', () => {
    expect(() =>
      normalizeCommand('setMeasure', {
        kind: 'setMeasure',
        workItemId: 'w',
        stepId: 's',
        metric: 'cost',
        value: 1,
        rateCardDigest: '',
      }),
    ).toThrow('rateCardDigest_must_be_1_to_128_characters');
  });

  it('undoes a cost fact back to the figure and rate card it replaced', async () => {
    const { source, runner, projectId, dev, idOf, run } = await seeded();
    try {
      const A = idOf('A');
      await run([{ ...fact(A, dev, 'cost', 10), rateCardDigest: 'card-a' }]);
      await run([{ ...fact(A, dev, 'cost', 20), rateCardDigest: 'card-b' }]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(
        (await source.stores.measures.listByProject(projectId)).map(({ value, basis }) => ({
          value,
          basis,
        })),
      ).toEqual([{ value: 10, basis: { currency: 'USD', rateCardDigest: 'card-a' } }]);
    } finally {
      await source.close();
    }
  });

  it('reads a parent whose leaves hold two rate cards as mixed, naming both, with no cost sum', async () => {
    // The spec scenario "Two cards in one subtree".
    const { source, dev, idOf, run, rowOf } = await seeded();
    try {
      const [P, A, B] = ['P', 'A', 'B'].map(idOf);
      await run([
        { ...fact(A, dev, 'cost', 10), rateCardDigest: 'card-b' },
        { ...fact(B, dev, 'cost', 20), rateCardDigest: 'card-a' },
        fact(A, dev, 'tokens', 5),
        setBudget(P, 'cost', 100),
      ]);
      const parent = await rowOf(P);
      expect(parent.mixedRateCards).toEqual({
        cost: {
          facts: [
            { currency: 'USD', rateCardDigest: 'card-a' },
            { currency: 'USD', rateCardDigest: 'card-b' },
          ],
        },
      });
      expect(parent.measures).toEqual({ token_actual: { [dev]: 5 } });
      expect(parent.budgets).toBeUndefined();
      // Each leaf has one card and reads as before.
      expect((await rowOf(A)).measures['cost']).toEqual({ [dev]: 10 });
      expect((await rowOf(A)).mixedRateCards).toBeUndefined();
    } finally {
      await source.close();
    }
  });

  it('refuses a last-child delete whose hand-up would add two rate cards, naming both', async () => {
    const { source, dev, idOf, run, childOf } = await seeded();
    try {
      const A = idOf('A');
      const D = childOf(
        await run([{ kind: 'createWorkItem', ref: 'D', name: 'D', parentId: A, afterId: null }]),
        'D',
      );
      const E = childOf(
        await run([{ kind: 'createWorkItem', ref: 'E', name: 'E', parentId: D, afterId: null }]),
        'E',
      );
      const G = childOf(
        await run([{ kind: 'createWorkItem', ref: 'G', name: 'G', parentId: D, afterId: E }]),
        'G',
      );
      // A fact on one card beside a trio on another adds nothing: allowed.
      await run([
        { ...fact(E, dev, 'cost', 1), rateCardDigest: 'card-a' },
        { ...trio(G, dev, 'cost', 3), rateCardDigest: 'card-b' },
        { ...fact(G, dev, 'cost', 2), rateCardDigest: 'card-b' },
      ]);
      // D is A's only child: deleting it hands its branch up to A, adding E's
      // and G's facts across two cards.
      expect(
        await run([{ kind: 'deleteWorkItem', workItemId: D, strategy: 'cascade' }]),
      ).toMatchObject({
        ok: false,
        reason: 'mixed_rate_cards',
        detail: {
          bases: [
            { currency: 'USD', rateCardDigest: 'card-a' },
            { currency: 'USD', rateCardDigest: 'card-b' },
          ],
        },
      });
    } finally {
      await source.close();
    }
  });

  it('hands up a fact on one card beside a trio on another', async () => {
    const { source, projectId, dev, idOf, run, childOf } = await seeded();
    try {
      const A = idOf('A');
      const D = childOf(
        await run([{ kind: 'createWorkItem', ref: 'D', name: 'D', parentId: A, afterId: null }]),
        'D',
      );
      await run([
        { ...fact(D, dev, 'cost', 4), rateCardDigest: 'card-a' },
        { ...trio(D, dev, 'cost', 6), rateCardDigest: 'card-b' },
      ]);
      expect(await run([{ kind: 'deleteWorkItem', workItemId: D }])).toMatchObject({ ok: true });
      expect(
        (await source.stores.measures.listByProject(projectId)).map((each) => each.basis),
      ).toEqual([{ currency: 'USD', rateCardDigest: 'card-a' }]);
    } finally {
      await source.close();
    }
  });

  it('reads a leaf whose trio and fact sit on two cards as unmixed, and strips a mix among trios from the estimates alone', async () => {
    const { source, dev, idOf, run, rowOf } = await seeded();
    try {
      const [P, A, B] = ['P', 'A', 'B'].map(idOf);
      await run([
        { ...trio(A, dev, 'cost', 6), rateCardDigest: 'card-a' },
        { ...fact(A, dev, 'cost', 4), rateCardDigest: 'card-b' },
        { ...trio(B, dev, 'cost', 6), rateCardDigest: 'card-b' },
        trio(A, dev, 'tokens', 9),
      ]);
      expect((await rowOf(A)).mixedRateCards).toBeUndefined();
      const parent = await rowOf(P);
      // Proof: with the facts' fold handed the trios too, this read P's facts
      // stripped as well; watched 2026-10-23.
      expect(parent.mixedRateCards).toEqual({
        cost: {
          estimates: [
            { currency: 'USD', rateCardDigest: 'card-a' },
            { currency: 'USD', rateCardDigest: 'card-b' },
          ],
        },
      });
      expect(parent.measures['cost']).toEqual({ [dev]: 4 });
      // The mixed cost trios go; the tokens trio stays.
      expect(Object.keys(parent.measureEstimates ?? {})).toEqual(['tokens']);
    } finally {
      await source.close();
    }
  });

  it('refuses an undo that would put an unpriced cost fact back', async () => {
    const { source, runner, projectId, dev, idOf, run } = await seeded();
    try {
      const A = idOf('A');
      await source.stores.measures.set(
        { workItemId: A, stepId: dev, metric: 'cost', value: 3, recordedAt: 1 },
        { at: 1, by: F },
      );
      await run([{ ...fact(A, dev, 'cost', 10), rateCardDigest: 'card-a' }]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect((await source.stores.measures.listByProject(projectId)).map((m) => m.value)).toEqual([
        10,
      ]);
    } finally {
      await source.close();
    }
  });

  it('refuses an undo that would put an unpriced cost trio back', async () => {
    const { source, runner, projectId, dev, idOf, run } = await seeded();
    try {
      const A = idOf('A');
      await source.stores.measureEstimates.set(
        {
          workItemId: A,
          stepId: dev,
          key: 'cost',
          optimistic: 1,
          realistic: 1,
          pessimistic: 1,
          singlePoint: false,
        },
        { at: 1, by: F },
      );
      await run([{ ...trio(A, dev, 'cost', 9), rateCardDigest: 'card-a' }]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(
        (await source.stores.measureEstimates.listByProject(projectId)).map((m) => m.pessimistic),
      ).toEqual([9]);
    } finally {
      await source.close();
    }
  });

  it('hands a branch’s priced figures up under their one rate card', async () => {
    const { source, projectId, dev, idOf, run, childOf } = await seeded();
    try {
      const A = idOf('A');
      const D = childOf(
        await run([{ kind: 'createWorkItem', ref: 'D', name: 'D', parentId: A, afterId: null }]),
        'D',
      );
      await run([
        { ...fact(D, dev, 'cost', 4), rateCardDigest: 'card-a' },
        { ...trio(D, dev, 'cost', 6), rateCardDigest: 'card-a' },
      ]);
      expect(await run([{ kind: 'deleteWorkItem', workItemId: D }])).toMatchObject({ ok: true });
      const basis = { currency: 'USD', rateCardDigest: 'card-a' };
      expect(
        (await source.stores.measures.listByProject(projectId)).map((each) => [
          each.workItemId,
          each.basis,
        ]),
      ).toEqual([[A, basis]]);
      expect(
        (await source.stores.measureEstimates.listByProject(projectId)).map((each) => [
          each.workItemId,
          each.basis,
        ]),
      ).toEqual([[A, basis]]);
    } finally {
      await source.close();
    }
  });
});
