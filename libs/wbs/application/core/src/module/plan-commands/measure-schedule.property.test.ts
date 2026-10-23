import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

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
/** The measures other than time the writes pick from; `hours` takes facts only. */
const ESTIMATED = ['tokens', 'cost', 'kwh'] as const;
const FACTS = ['tokens', 'cost', 'kwh', 'hours', 'token_estimate'] as const;

/**
 * The schedule a plan read draws, and nothing else: every row's scheduled
 * span, dates and charged days, and every slice. What D2 says no measure but
 * time may move (`wbs-measure-budgets` task 2.4).
 */
function scheduleDigest(tree: PlanTree): string {
  return JSON.stringify({
    rows: tree.workItems.map((row) => ({
      id: row.id,
      schedule: row.schedule,
      dates: row.dates,
      finalDays: row.finalDays,
      finalTotal: row.finalTotal,
      charged: row.charged,
    })),
    slices: tree.slices,
  });
}

const trio = fc
  .tuple(fc.nat({ max: 20 }), fc.nat({ max: 20 }), fc.nat({ max: 20 }))
  .map((points) => points.sort((a, b) => a - b))
  .map(([optimistic, realistic, pessimistic]) => ({ optimistic, realistic, pessimistic }));

/** A random plan: rows each under the root or an earlier row, time trios, edges. */
const plan = fc.record({
  parents: fc.array(fc.integer({ min: -1, max: 6 }), { minLength: 2, maxLength: 7 }),
  estimates: fc.array(fc.record({ row: fc.nat(6), step: fc.nat(1), days: trio }), {
    maxLength: 10,
  }),
  edges: fc.array(fc.tuple(fc.nat(6), fc.nat(6)), { maxLength: 5 }),
});

/** Random writes in measures other than time: trios, facts and their clears. */
const write = fc.oneof(
  fc.record({
    kind: fc.constant('setMeasureEstimate' as const),
    row: fc.nat(6),
    step: fc.nat(1),
    measure: fc.constantFrom(...ESTIMATED),
    estimate: trio,
  }),
  fc.record({
    kind: fc.constant('clearMeasureEstimate' as const),
    row: fc.nat(6),
    step: fc.nat(1),
    measure: fc.constantFrom(...ESTIMATED),
  }),
  fc.record({
    kind: fc.constant('setMeasure' as const),
    row: fc.nat(6),
    step: fc.nat(1),
    metric: fc.constantFrom(...FACTS),
    value: fc.nat({ max: 5000 }),
  }),
  fc.record({
    kind: fc.constant('clearMeasure' as const),
    row: fc.nat(6),
    step: fc.nat(1),
    metric: fc.constantFrom(...FACTS),
  }),
);

/** A fresh source holding the random plan, and a way to write and read it. */
async function seededPlan(shape: PlanShape) {
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
  const created = await graph.projects.create('Schedule', F);
  const projectId = created.project.id;
  fixture.ownProjectInOrganization(projectId, ORG);
  for (const step of created.steps) {
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: F },
    );
  }
  const stepIds = created.steps.map(({ id }) => id);
  const updated = await graph.projects.update(projectId, F, { startDate: '2026-01-05' });
  if (!updated.ok) throw new Error(`the start date was refused: ${JSON.stringify(updated)}`);
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
  const run = (commands: readonly PlanCommand[]) => runner.run(projectId, F, commands);
  const ids: string[] = [];
  for (const [index, parent] of shape.parents.entries()) {
    const parentId = parent >= 0 && parent < ids.length ? (ids[parent] ?? null) : null;
    const made = await run([
      { kind: 'createWorkItem', ref: 'row', name: `Row ${String(index)}`, parentId, afterId: null },
    ]);
    if (!made.ok) throw new Error(`row ${String(index)} was refused: ${JSON.stringify(made)}`);
    const found = made.results.find((each) => 'ref' in each && each.ref === 'row');
    if (found === undefined || !('id' in found) || typeof found.id !== 'string')
      throw new Error(`row ${String(index)} has no id`);
    ids.push(found.id);
  }
  const rowAt = (index: number): string => {
    const id = ids.at(index % ids.length);
    if (id === undefined) throw new Error(`no row at ${String(index)}`);
    return id;
  };
  const stepAt = (index: number): string => {
    const id = stepIds.at(index % stepIds.length);
    if (id === undefined) throw new Error(`no step at ${String(index)}`);
    return id;
  };
  // A refused time estimate (a parent) or edge (a cycle, an ancestor) leaves
  // the plan as it was; the property is over whatever plan results.
  for (const { row, step, days } of shape.estimates)
    await run([{ kind: 'setEstimate', workItemId: rowAt(row), stepId: stepAt(step), days }]);
  for (const [from, to] of shape.edges)
    if (rowAt(from) !== rowAt(to))
      await run([{ kind: 'addDependency', workItemId: rowAt(to), predecessorId: rowAt(from) }]);
  const tree = async (): Promise<PlanTree> => {
    const read = await graph.workItems.tree(projectId);
    if (read === null || 'kind' in read) throw new Error('the plan read was unavailable');
    return read;
  };
  return { source, run, rowAt, stepAt, tree };
}

type PlanShape = typeof plan extends fc.Arbitrary<infer Shape> ? Shape : never;

describe('measures other than time never move the schedule', () => {
  // Proof: with the tokens trios appended to the time estimates handed to
  // `canonicalScheduleParts` in `treeIsolated`, this property failed naming its
  // seed and the shrunk counterexample; watched 2026-10-23.
  it('keeps the schedule digest byte-identical over 200 random plans and measure writes', async () => {
    // Counted across runs so a generator that only ever produced refused
    // writes, which would prove nothing, fails here instead.
    let applied = 0;
    let estimated = 0;
    await fc.assert(
      fc.asyncProperty(
        plan,
        fc.array(write, { minLength: 1, maxLength: 12 }),
        async (shape, writes) => {
          const { source, run, rowAt, stepAt, tree } = await seededPlan(shape);
          try {
            const before = scheduleDigest(await tree());
            for (const each of writes) {
              const address = { workItemId: rowAt(each.row), stepId: stepAt(each.step) };
              const command: PlanCommand =
                each.kind === 'setMeasureEstimate'
                  ? { kind: each.kind, ...address, measure: each.measure, estimate: each.estimate }
                  : each.kind === 'clearMeasureEstimate'
                    ? { kind: each.kind, ...address, measure: each.measure }
                    : each.kind === 'setMeasure'
                      ? { kind: each.kind, ...address, metric: each.metric, value: each.value }
                      : { kind: each.kind, ...address, metric: each.metric };
              // A refusal (a parent, a scale) writes nothing; the rest must not move dates.
              if ((await run([command])).ok) {
                applied += 1;
                if (command.kind === 'setMeasureEstimate') estimated += 1;
              }
              expect(scheduleDigest(await tree())).toBe(before);
            }
          } finally {
            await source.close();
          }
        },
      ),
      { numRuns: 200 },
    );
    expect(applied).toBeGreaterThan(200);
    expect(estimated).toBeGreaterThan(50);
  }, 300_000);
});
