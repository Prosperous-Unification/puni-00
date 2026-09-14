import { mkdtempSync, rmSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type Broadcaster,
  clockOf,
  type Decision,
  type PlanCommand,
  PlanCommandRunner,
  type PlanCommandRunnerOptions,
  type PlanTransactionalStores,
  type Scope,
  servicesOver,
  type UnitOfWork,
  type WriteStamp,
} from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { expect, it } from 'bun:test';
import type { Logger } from 'drizzle-orm';

import { runMigrations } from './migrate';
import { openSqliteSource } from './source';

const MIGRATIONS = new URL('../../../apps/be-01/drizzle', import.meta.url).pathname;
const OWNER = 'working-plan-performance-owner';
const PROJECT = 'working-plan-performance-project';
const STEP = 'working-plan-performance-step';
const STAMP: WriteStamp = { at: 1, by: OWNER };
const ROWS = 200;

const silentBroadcaster: Broadcaster = {
  publish: () => Promise.resolve(),
  latestSeq: () => Promise.resolve(-1),
};

interface FullReads {
  workItems: number;
  estimates: number;
  actuals: number;
  progress: number;
  measures: number;
  dependencies: number;
}

interface ReadCounts {
  readonly full: FullReads;
  targeted: number;
  placements: number;
  assignments: number;
  sqlWrites: number;
}

function emptyFullReads(): FullReads {
  return { workItems: 0, estimates: 0, actuals: 0, progress: 0, measures: 0, dependencies: 0 };
}

function emptyCounts(): ReadCounts {
  return { full: emptyFullReads(), targeted: 0, placements: 0, assignments: 0, sqlWrites: 0 };
}

function resetCounts(counts: ReadCounts): void {
  Object.assign(counts.full, emptyFullReads());
  counts.targeted = 0;
  counts.placements = 0;
  counts.assignments = 0;
  counts.sqlWrites = 0;
}

function sqlCounter(counts: ReadCounts): Logger {
  return {
    logQuery(query) {
      if (/^\s*(?:insert|update|delete)\b/iu.test(query)) counts.sqlWrites += 1;
    },
  };
}

function countedPort<Port extends object>(
  source: Port,
  methods: Readonly<Record<string, () => void>>,
): Port {
  return new Proxy(source, {
    get(target, property) {
      const member = Reflect.get(target, property, target);
      if (typeof member !== 'function') return member;
      return (...parameters: readonly unknown[]) => {
        const observe = typeof property === 'string' ? methods[property] : undefined;
        if (observe !== undefined) observe();
        return Reflect.apply(member, target, parameters) as unknown;
      };
    },
  });
}

function countStoreCalls(
  stores: PlanTransactionalStores,
  counts: ReadCounts,
): PlanTransactionalStores {
  const count = (collection: keyof FullReads) => () => {
    counts.full[collection] += 1;
  };
  const targeted = () => {
    counts.targeted += 1;
  };
  const placement = () => {
    counts.placements += 1;
  };
  const assignment = () => {
    counts.assignments += 1;
  };
  return {
    ...stores,
    workItems: countedPort(stores.workItems, {
      listByProject: count('workItems'),
      listByIds: targeted,
      listPlacements: placement,
    }),
    estimates: countedPort(stores.estimates, {
      listByProject: count('estimates'),
      listByWorkItems: targeted,
      listPlacements: placement,
    }),
    actuals: countedPort(stores.actuals, {
      listByProject: count('actuals'),
      listByWorkItems: targeted,
      listPlacements: placement,
    }),
    progress: countedPort(stores.progress, {
      listByProject: count('progress'),
      listByWorkItems: targeted,
      listPlacements: placement,
    }),
    measures: countedPort(stores.measures, {
      listByProject: count('measures'),
      listByWorkItems: targeted,
      listPlacements: placement,
    }),
    dependencies: countedPort(stores.dependencies, {
      listByProject: count('dependencies'),
      listByWorkItems: targeted,
    }),
    directory: countedPort(stores.directory, {
      assignmentsInProject: assignment,
      assignmentsFor: assignment,
      assignmentsOf: assignment,
    }),
  };
}

function countedUnitOfWork(
  source: UnitOfWork,
  counts: ReadCounts,
): { readonly uow: UnitOfWork; readonly current: () => PlanTransactionalStores } {
  let admitted: PlanTransactionalStores | undefined;
  return {
    uow: {
      run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
        return source.run((scope) => {
          admitted = countStoreCalls(scope.stores, counts);
          return act({ stores: admitted });
        });
      },
    },
    current: () => {
      if (admitted === undefined) throw new Error('batch services requested before admission');
      return admitted;
    },
  };
}

type RunnerMode = 'cached' | 'uncached';

interface PerformanceFixture {
  readonly source: ReturnType<typeof openSqliteSource>;
  readonly counts: ReadCounts;
  readonly runner: (mode: RunnerMode) => PlanCommandRunner;
  readonly close: () => Promise<void>;
}

function rowId(index: number): string {
  return `row-${String(index).padStart(3, '0')}`;
}

function originalDays(index: number) {
  return { optimistic: index + 1, realistic: index + 2, pessimistic: index + 3 };
}

function changedDays(index: number) {
  return { optimistic: index + 201, realistic: index + 202, pessimistic: index + 203 };
}

async function performanceFixture(name: string): Promise<PerformanceFixture> {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-working-plan-performance-'));
  const dbPath = join(directory, 'source.db');
  runMigrations(dbPath, MIGRATIONS);
  const counts = emptyCounts();
  const source = openSqliteSource({ dbPath, logger: sqlCounter(counts) });
  await source.stores.users.create(
    { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: STAMP.at },
    STAMP,
  );
  await source.stores.projects.create(
    projectRow({ id: PROJECT, ownerId: OWNER, name }),
    [{ id: STEP, projectId: PROJECT, name: 'Step', position: 10 }],
    STAMP,
  );
  const firstPerson = await source.stores.directory.addPerson(
    { id: 'person-a', name: 'Person A' },
    [],
    STAMP,
  );
  const secondPerson = await source.stores.directory.addPerson(
    { id: 'person-b', name: 'Person B' },
    [],
    STAMP,
  );
  if (!firstPerson.ok || !secondPerson.ok) throw new Error('performance people were refused');
  for (let index = 0; index < ROWS; index += 1) {
    const id = rowId(index);
    await source.stores.workItems.insert(
      workItemRow({ id, projectId: PROJECT, name: `Row ${String(index)}` }),
      [],
      STAMP,
    );
    await source.stores.estimates.set(
      { workItemId: id, stepId: STEP, ...originalDays(index) },
      STAMP,
    );
    await source.stores.actuals.set(
      { workItemId: id, stepId: STEP, days: index + 1, recordedAt: 1 },
      STAMP,
    );
    await source.stores.progress.set(
      { workItemId: id, stepId: STEP, state: 'in_progress', statedAt: 1 },
      STAMP,
    );
    await source.stores.measures.set(
      { workItemId: id, stepId: STEP, metric: 'token_estimate', value: index + 1, recordedAt: 1 },
      STAMP,
    );
    const assigned = await source.stores.directory.assign(id, STEP, 'person-b', STAMP);
    if (!assigned.ok) throw new Error(`performance assignment ${id} was refused`);
  }
  resetCounts(counts);

  const clock = clockOf({ now: () => 2, newId: () => crypto.randomUUID() });
  const compose = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
    servicesOver(stores, { clock, broadcast, scheduler: fastScheduler });
  return {
    source,
    counts,
    runner(mode) {
      const admitted = countedUnitOfWork(source.uow, counts);
      const options: PlanCommandRunnerOptions = {
        uow: admitted.uow,
        announcements: silentBroadcaster,
        publicServices: compose(source.stores, silentBroadcaster),
        // The uncached baseline consumes the raw admitted SQLite ports captured
        // by the real UOW. The cached mode consumes the runner-created plan.
        batchServices: (scope, broadcast) =>
          compose(mode === 'cached' ? scope.stores : admitted.current(), broadcast),
      };
      return new PlanCommandRunner(options);
    },
    close: async () => {
      await source.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function homogeneousCommands(): PlanCommand[] {
  return Array.from({ length: ROWS }, (_, index) => ({
    kind: 'setEstimate' as const,
    workItemId: rowId(index),
    stepId: STEP,
    days: changedDays(index),
  }));
}

function mixedCommands(): PlanCommand[] {
  return Array.from({ length: ROWS }, (_, index): PlanCommand => {
    const id = rowId(index);
    switch (index % 5) {
      case 0:
        return { kind: 'setEstimate', workItemId: id, stepId: STEP, days: changedDays(index) };
      case 1:
        return { kind: 'setActual', workItemId: id, stepId: STEP, days: index + 201 };
      case 2:
        return { kind: 'setProgress', workItemId: id, stepId: STEP, state: 'done' };
      case 3:
        return {
          kind: 'setMeasure',
          workItemId: id,
          stepId: STEP,
          metric: 'token_estimate',
          value: index + 201,
        };
      default:
        return {
          kind: 'setAssignee',
          workItemId: id,
          stepId: STEP,
          personId: index % 10 === 4 ? 'person-a' : 'person-b',
        };
    }
  });
}

function expectBoundedFullReads(counts: ReadCounts): void {
  for (const [collection, reads] of Object.entries(counts.full)) {
    // Proof: delegating WorkingPlan value listByProject reads to the SQLite
    // source made this report 201 estimate full reads for 200 commands.
    expect(reads, `${collection} full-project reads`).toBeLessThanOrEqual(1);
  }
}

async function authoredState(fixture: PerformanceFixture): Promise<string> {
  const stores = fixture.source.stores;
  const [estimates, actuals, progress, measures, assignments] = await Promise.all([
    stores.estimates.listByProject(PROJECT),
    stores.actuals.listByProject(PROJECT),
    stores.progress.listByProject(PROJECT),
    stores.measures.listByProject(PROJECT),
    stores.directory.assignmentsInProject(PROJECT),
  ]);
  return JSON.stringify([
    estimates,
    actuals.map(({ workItemId, stepId, days }) => ({ workItemId, stepId, days })),
    progress.map(({ workItemId, stepId, state }) => ({ workItemId, stepId, state })),
    measures.map(({ workItemId, stepId, metric, value }) => ({
      workItemId,
      stepId,
      metric,
      value,
    })),
    assignments,
  ]);
}

function repositoryObservation(arguments_: readonly string[]): string {
  const repository = new URL('../../..', import.meta.url).pathname;
  const execution = Bun.spawnSync(['git', ...arguments_], { cwd: repository });
  if (execution.exitCode !== 0) {
    throw new Error(`git ${arguments_.join(' ')} failed: ${execution.stderr.toString()}`);
  }
  return execution.stdout.toString().trim();
}

function median(samples: readonly number[]): number {
  const ordered = [...samples].sort((left, right) => left - right);
  const upper = ordered.at(ordered.length / 2);
  const lower = ordered.at(ordered.length / 2 - 1);
  if (upper === undefined || lower === undefined) throw new Error('median requires paired samples');
  return (lower + upper) / 2;
}

function sampleRange(samples: readonly number[]): readonly [number, number] {
  const lowest = Math.min(...samples);
  const highest = Math.max(...samples);
  if (!Number.isFinite(lowest) || !Number.isFinite(highest)) {
    throw new Error('sample range requires finite samples');
  }
  return [lowest, highest];
}

it('bounds retained reads for 200 estimates and undo restores every distinct original', async () => {
  const fixture = await performanceFixture('Homogeneous correctness');
  try {
    const outcome = await fixture.runner('cached').run(PROJECT, OWNER, homogeneousCommands());
    expect(outcome).toMatchObject({ ok: true });
    expectBoundedFullReads(fixture.counts);
    expect(fixture.counts.targeted).toBeGreaterThan(0);
    // Proof: dropping OpenSqliteSourceOptions.logger plumbing left this at zero
    // while the same admitted runner had committed all 200 writes.
    expect(fixture.counts.sqlWrites).toBeGreaterThan(0);
    process.stdout.write(`homogeneous counts ${JSON.stringify(fixture.counts)}\n`);

    const changed = await fixture.source.stores.estimates.listByProject(PROJECT);
    expect(changed).toEqual(
      Array.from({ length: ROWS }, (_, index) => ({
        workItemId: rowId(index),
        stepId: STEP,
        ...changedDays(index),
      })),
    );
    expect(await fixture.runner('cached').undo(PROJECT, OWNER)).toMatchObject({ ok: true });
    const restored = await fixture.source.stores.estimates.listByProject(PROJECT);
    expect(restored).toEqual(
      Array.from({ length: ROWS }, (_, index) => ({
        workItemId: rowId(index),
        stepId: STEP,
        ...originalDays(index),
      })),
    );
  } finally {
    await fixture.close();
  }
}, 120_000);

it('keeps repeated existing-person assignments inside the plan-only full-read bound', async () => {
  const fixture = await performanceFixture('Mixed correctness');
  try {
    const outcome = await fixture.runner('cached').run(PROJECT, OWNER, mixedCommands());
    expect(outcome).toMatchObject({ ok: true });
    // Proof: routing successful DirectoryStore.assign calls through the global
    // reload barrier made 40 assignments produce 41 full work-item reads.
    expectBoundedFullReads(fixture.counts);
    expect(fixture.counts.assignments).toBeGreaterThan(0);
    expect(fixture.counts.targeted).toBeGreaterThan(0);
    expect(fixture.counts.sqlWrites).toBeGreaterThan(0);
    process.stdout.write(`mixed counts ${JSON.stringify(fixture.counts)}\n`);
  } finally {
    await fixture.close();
  }
}, 120_000);

it('can run the real SQLite command runner over uncached admitted stores', async () => {
  const fixture = await performanceFixture('Uncached runner seam');
  try {
    resetCounts(fixture.counts);
    const outcome = await fixture.runner('uncached').run(PROJECT, OWNER, [
      {
        kind: 'setEstimate',
        workItemId: rowId(0),
        stepId: STEP,
        days: changedDays(0),
      },
      {
        kind: 'setEstimate',
        workItemId: rowId(1),
        stepId: STEP,
        days: changedDays(1),
      },
    ]);

    expect(outcome).toMatchObject({ ok: true });
    expect(fixture.counts.full.workItems).toBeGreaterThan(1);
    expect(fixture.counts.full.estimates).toBeGreaterThan(1);
    expect(fixture.counts.sqlWrites).toBeGreaterThan(0);
  } finally {
    await fixture.close();
  }
}, 120_000);

it('keeps cached medians within ten percent on homogeneous and mixed paired workloads', async () => {
  const checkout = repositoryObservation(['rev-parse', 'HEAD']);
  const worktreeBefore = repositoryObservation(['status', '--short']);
  const reports: Record<
    'homogeneous' | 'mixed',
    Record<RunnerMode, { samples: number[]; median: number; range: readonly [number, number] }>
  > = {
    homogeneous: {
      cached: { samples: [], median: 0, range: [0, 0] },
      uncached: { samples: [], median: 0, range: [0, 0] },
    },
    mixed: {
      cached: { samples: [], median: 0, range: [0, 0] },
      uncached: { samples: [], median: 0, range: [0, 0] },
    },
  };
  const workloads = [
    { name: 'homogeneous' as const, commands: homogeneousCommands() },
    { name: 'mixed' as const, commands: mixedCommands() },
  ];

  for (const workload of workloads) {
    const fixture = await performanceFixture(`Timing ${workload.name}`);
    try {
      const baseline = await authoredState(fixture);
      for (const mode of ['uncached', 'cached'] as const) {
        expect(await fixture.runner(mode).run(PROJECT, OWNER, workload.commands)).toMatchObject({
          ok: true,
        });
        expect(await fixture.runner(mode).undo(PROJECT, OWNER)).toMatchObject({ ok: true });
        expect(await authoredState(fixture)).toBe(baseline);
      }

      for (let pair = 0; pair < 20; pair += 1) {
        const order: readonly RunnerMode[] =
          pair % 2 === 0 ? ['uncached', 'cached'] : ['cached', 'uncached'];
        for (const mode of order) {
          expect(await authoredState(fixture)).toBe(baseline);
          resetCounts(fixture.counts);
          const started = performance.now();
          const outcome = await fixture.runner(mode).run(PROJECT, OWNER, workload.commands);
          const elapsed = performance.now() - started;
          expect(outcome).toMatchObject({ ok: true });
          reports[workload.name][mode].samples.push(elapsed);
          expect(await fixture.runner(mode).undo(PROJECT, OWNER)).toMatchObject({ ok: true });
          expect(await authoredState(fixture)).toBe(baseline);
        }
      }
    } finally {
      await fixture.close();
    }

    for (const mode of ['uncached', 'cached'] as const) {
      const report = reports[workload.name][mode];
      report.median = median(report.samples);
      report.range = sampleRange(report.samples);
    }
    expect(reports[workload.name].cached.samples).toHaveLength(20);
    expect(reports[workload.name].uncached.samples).toHaveLength(20);
    expect(reports[workload.name].cached.median).toBeLessThanOrEqual(
      1.1 * reports[workload.name].uncached.median,
    );
  }

  expect(repositoryObservation(['status', '--short'])).toBe(worktreeBefore);
  process.stdout.write(
    `${JSON.stringify({
      checkout,
      workload: {
        rows: ROWS,
        commands: ROWS,
        pairs: 20,
        order: 'alternating by pair index',
        fixtures: workloads.map(({ name }) => name),
      },
      host: {
        platform: platform(),
        release: release(),
        arch: arch(),
        cpu: cpus().at(0)?.model ?? 'unknown',
        logicalCpus: cpus().length,
        bun: Bun.version,
      },
      reports,
    })}\n`,
  );
}, 600_000);
