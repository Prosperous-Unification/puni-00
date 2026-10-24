import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { PlanTree } from '../../ports/plan-tree';
import type { Scope } from '../../ports/unit-of-work';
import type { PlanCommand } from '../../service/command-normalizers';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { expectCreated } from '../../testing/expect-created';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { createPlanCommandRunner } from './composition';

const F = 'account-f';
const ORG = 'org-a';
/** The measures other than time the writes pick from; `hours` takes facts only. */
const ESTIMATED = ['tokens', 'cost', 'kwh'] as const;
const FACTS = ['tokens', 'cost', 'kwh', 'hours', 'token_estimate'] as const;
/** The measures budgets pick from (`wbs-measure-budgets` task 3.1); time refuses one. */
const BUDGETED = ['tokens', 'cost', 'kwh', 'hours', 'agent_minutes', 'time'] as const;
/**
 * The one rate card every money write names: a second card would let a
 * mixed-card refusal decide whether a structural write lands in one twin and
 * not the other (design D44), which is a refusal, not a schedule change.
 */
const CARD = 'card-a';

/**
 * The schedule a plan read draws, and nothing else: every row's scheduled
 * span, dates and charged days, every slice, the schedule error and the
 * waiting counts — what D2 says no measure but time may move
 * (`wbs-measure-budgets` task 2.4). Ids are replaced by their place in the
 * read (rows in tree order, steps in step order), so two sources holding the
 * same plan under different ids digest alike.
 */
function scheduleDigest(tree: PlanTree): string {
  let digest = JSON.stringify({
    rows: tree.workItems.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      schedule: row.schedule,
      dates: row.dates,
      finalDays: row.finalDays,
      finalTotal: row.finalTotal,
      charged: row.charged,
    })),
    slices: tree.slices,
    scheduleError: tree.scheduleError,
    waitingForPerson: tree.waitingForPerson,
    waitingForCapacity: tree.waitingForCapacity,
    waitingElsewhere: tree.waitingElsewhere ?? null,
  });
  for (const [index, row] of tree.workItems.entries())
    digest = digest.replaceAll(row.id, `row${String(index)}`);
  for (const [index, step] of tree.steps.entries())
    digest = digest.replaceAll(step.id, `step${String(index)}`);
  return digest;
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

/** Writes in measures other than time: trios, facts and their clears. */
const measureWrite = fc.oneof(
  fc.record({
    kind: fc.constant('setMeasureEstimate' as const),
    row: fc.nat(9),
    step: fc.nat(1),
    measure: fc.constantFrom(...ESTIMATED),
    estimate: trio,
  }),
  fc.record({
    kind: fc.constant('clearMeasureEstimate' as const),
    row: fc.nat(9),
    step: fc.nat(1),
    measure: fc.constantFrom(...ESTIMATED),
  }),
  fc.record({
    kind: fc.constant('setMeasure' as const),
    row: fc.nat(9),
    step: fc.nat(1),
    metric: fc.constantFrom(...FACTS),
    value: fc.nat({ max: 5000 }),
  }),
  fc.record({
    kind: fc.constant('clearMeasure' as const),
    row: fc.nat(9),
    step: fc.nat(1),
    metric: fc.constantFrom(...FACTS),
  }),
  fc.record({
    kind: fc.constant('setBudget' as const),
    row: fc.nat(9),
    measure: fc.constantFrom(...BUDGETED),
    cap: fc.nat({ max: 5000 }),
    policy: fc.constantFrom('strict' as const, 'advisory' as const),
    holdPerAttempt: fc.option(fc.nat({ max: 500 })),
  }),
  fc.record({
    kind: fc.constant('clearBudget' as const),
    row: fc.nat(9),
    measure: fc.constantFrom(...BUDGETED),
  }),
);

/**
 * Structural writes, which do move the schedule and which both twins take:
 * a child under a row (a leaf's first child takes its trios), a cascading
 * delete (a last child hands them up), and a duplicate (which copies them).
 */
const structuralWrite = fc.oneof(
  fc.record({ kind: fc.constant('createChild' as const), row: fc.nat(9) }),
  fc.record({ kind: fc.constant('delete' as const), row: fc.nat(9) }),
  fc.record({ kind: fc.constant('duplicate' as const), row: fc.nat(9) }),
);

const write = fc.oneof(
  { arbitrary: measureWrite, weight: 3 },
  { arbitrary: structuralWrite, weight: 1 },
);

type PlanShape = typeof plan extends fc.Arbitrary<infer Shape> ? Shape : never;
type Write = typeof write extends fc.Arbitrary<infer Each> ? Each : never;

/** A fresh source holding the random plan, and a way to write and read it. */
async function seededPlan(shape: PlanShape) {
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
  const created = expectCreated(await graph.projects.create('Schedule', F));
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
  const run = (commands: readonly PlanCommand[]) => runner.run(projectId, F, commands);
  const tree = async (): Promise<PlanTree> => {
    const read = await graph.workItems.tree(projectId);
    if (read === null || 'kind' in read) throw new Error('the plan read was unavailable');
    return read;
  };
  /** The row at `index` in the current tree order, the same place in either twin. */
  const rowAt = async (index: number): Promise<string> => {
    const rows = (await tree()).workItems;
    const row = rows.at(index % rows.length);
    if (row === undefined) throw new Error('the plan holds no rows');
    return row.id;
  };
  const stepAt = (index: number): string => {
    const id = stepIds.at(index % stepIds.length);
    if (id === undefined) throw new Error(`no step at ${String(index)}`);
    return id;
  };
  for (const [index, parent] of shape.parents.entries()) {
    const parentId = parent >= 0 && parent < index ? await rowAt(parent) : null;
    const made = await run([
      { kind: 'createWorkItem', name: `Row ${String(index)}`, parentId, afterId: null },
    ]);
    if (!made.ok) throw new Error(`row ${String(index)} was refused: ${JSON.stringify(made)}`);
  }
  // A refused time estimate (a parent) or edge (a cycle, an ancestor) leaves
  // the plan as it was, in both twins alike; the property is over whatever
  // plan results.
  for (const { row, step, days } of shape.estimates)
    await run([{ kind: 'setEstimate', workItemId: await rowAt(row), stepId: stepAt(step), days }]);
  for (const [from, to] of shape.edges) {
    const [predecessorId, workItemId] = [await rowAt(from), await rowAt(to)];
    if (predecessorId !== workItemId)
      await run([{ kind: 'addDependency', workItemId, predecessorId }]);
  }
  /** One random write as a command against this twin's ids; null once no row is left. */
  const commandOf = async (each: Write): Promise<PlanCommand | null> => {
    if ((await tree()).workItems.length === 0) return null;
    const workItemId = await rowAt(each.row);
    switch (each.kind) {
      case 'createChild':
        return { kind: 'createWorkItem', name: 'Child', parentId: workItemId, afterId: null };
      case 'delete':
        return { kind: 'deleteWorkItem', workItemId, strategy: 'cascade' };
      case 'duplicate':
        return { kind: 'duplicateWorkItem', workItemId };
      case 'setMeasureEstimate':
        return {
          kind: each.kind,
          workItemId,
          stepId: stepAt(each.step),
          measure: each.measure,
          estimate: each.estimate,
          ...(each.measure === 'cost' ? { rateCardDigest: CARD } : {}),
        };
      case 'clearMeasureEstimate':
        return { kind: each.kind, workItemId, stepId: stepAt(each.step), measure: each.measure };
      case 'setMeasure':
        return {
          kind: each.kind,
          workItemId,
          stepId: stepAt(each.step),
          metric: each.metric,
          value: each.value,
          ...(each.metric === 'cost' ? { rateCardDigest: CARD } : {}),
        };
      case 'clearMeasure':
        return { kind: each.kind, workItemId, stepId: stepAt(each.step), metric: each.metric };
      case 'setBudget':
        return {
          kind: each.kind,
          workItemId,
          measure: each.measure,
          cap: each.cap,
          policy: each.policy,
          holdPerAttempt: each.holdPerAttempt,
        };
      case 'clearBudget':
        return { kind: each.kind, workItemId, measure: each.measure };
    }
  };
  return { source, run, tree, commandOf };
}

const isStructural = (each: Write): boolean =>
  each.kind === 'createChild' || each.kind === 'delete' || each.kind === 'duplicate';

describe('measures other than time never move the schedule', () => {
  // Proof: with the tokens trios appended to the time estimates handed to
  // `canonicalScheduleParts` in `treeIsolated`, this property failed naming its
  // seed and the shrunk counterexample; watched 2026-10-23, before and after
  // the structural writes and the twin were added.
  // Budgets joined the writes with `wbs-measure-budgets` task 3.1 (spec "Schedule
  // digest under random measure writes": estimates, facts and budgets).
  // Proof: with each stated budget's cap added to the first time estimate's
  // pessimistic days in `treeIsolated`, this property failed naming its seed;
  // watched 2026-10-23.
  it('keeps the schedule digest byte-identical to a twin that never sees a measure write, over 200 random plans', async () => {
    // Counted across runs so a generator that only ever produced refused
    // writes, which would prove nothing, fails here instead.
    let applied = 0;
    let estimated = 0;
    let structural = 0;
    let budgeted = 0;
    await fc.assert(
      fc.asyncProperty(
        plan,
        fc.array(write, { minLength: 1, maxLength: 12 }),
        async (shape, writes) => {
          // `measured` takes every write; `twin` only the structural ones.
          const measured = await seededPlan(shape);
          const twin = await seededPlan(shape);
          try {
            expect(scheduleDigest(await measured.tree())).toBe(scheduleDigest(await twin.tree()));
            for (const each of writes) {
              const command = await measured.commandOf(each);
              const mirror = await twin.commandOf(each);
              // Both twins hold the same rows, so both run out of them together.
              expect(mirror === null).toBe(command === null);
              if (command === null || mirror === null) break;
              const outcome = await measured.run([command]);
              if (isStructural(each)) {
                const mirrored = await twin.run([mirror]);
                // A trio or fact never decides whether a structural write lands.
                expect(mirrored.ok).toBe(outcome.ok);
                if (outcome.ok) structural += 1;
              } else if (outcome.ok) {
                applied += 1;
                if (each.kind === 'setMeasureEstimate') estimated += 1;
                if (each.kind === 'setBudget') budgeted += 1;
              }
              expect(scheduleDigest(await measured.tree())).toBe(scheduleDigest(await twin.tree()));
            }
          } finally {
            await measured.source.close();
            await twin.source.close();
          }
        },
      ),
      { numRuns: 200 },
    );
    expect(applied).toBeGreaterThan(200);
    expect(estimated).toBeGreaterThan(50);
    expect(structural).toBeGreaterThan(50);
    expect(budgeted).toBeGreaterThan(50);
  }, 600_000);
});
