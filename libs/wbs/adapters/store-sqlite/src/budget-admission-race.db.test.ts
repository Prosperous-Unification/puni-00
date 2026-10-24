import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PlanCommand, Scope, ScopedBatchOutcome, StepNodeAttemptStore } from '@wbs/core';
import { CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { expectCreated } from '@wbs/core/testing/expect-created';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import fc from 'fast-check';

import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const DEFAULTS = {
  maxAgentPersons: 50,
  maxConcurrentClaims: 200,
  maxCapacityUnitsPerResource: 10_000,
};
const SEED = 20261024;
const LEAVES = 6;
const CAP = 1000;
const HOLD = 300;

/**
 * Where the start's admission reads the running attempts. `turn` is
 * production: the batch's own stores, inside its unit of work. `stale` is the
 * sabotage the proof below injects: the attempts as they stood before the
 * racing batches queued, as a coordinator deciding from the headroom read
 * would see them.
 */
type AttemptSource = 'turn' | 'stale';

interface World {
  readonly source: SqliteSource;
  readonly run: (commands: PlanCommand[]) => Promise<ScopedBatchOutcome>;
  readonly parentId: string;
  readonly leafIds: readonly string[];
  readonly spenderId: string;
  readonly stepId: string;
  /** Freezes what a `stale` read answers at the attempts stored now. */
  readonly readBeforeQueueing: () => Promise<void>;
  /** The running attempts the store holds, by leaf id. */
  readonly running: () => Set<string>;
}

/** What the store should hold: the running leaves and the spender's fact. */
interface Model {
  running: Set<number>;
  spent: number;
}

/** The starts a strict 1000 holding 300 has room for, as D69 decides them. */
const roomOf = (model: Readonly<Model>): number =>
  Math.max(0, Math.floor((CAP - model.spent) / HOLD) - model.running.size);

/**
 * A project P with `LEAVES` leaves that start attempts and one spender leaf
 * that only records facts (so no fact ever lands on a node whose attempt it
 * could release), a strict tokens budget of 1000 holding 300 per attempt on P,
 * and a runner whose batches read attempts from `attempts.source`.
 */
async function openWorld(attempts: {
  source: AttemptSource;
}): Promise<World & { close: () => Promise<void> }> {
  const directory = mkdtempSync(join(tmpdir(), 'budget-admission-race-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  const source = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath,
    organizationDefaultLimits: DEFAULTS,
  });
  source.db.run(sql`INSERT INTO users (id, username, created_at) VALUES ('dany', 'dany', 1)`);
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
    dependencyContext: createLocalDependencyContext(source.stores),
  };
  const graph = servicesOver(source.stores, options);
  const created = expectCreated(await graph.projects.create('Race', 'dany'));
  const projectId = created.project.id;
  let stale: Awaited<ReturnType<StepNodeAttemptStore['listByProject']>> = [];
  const sourced = (store: StepNodeAttemptStore): StepNodeAttemptStore => {
    const listByProject = store.listByProject.bind(store);
    // Every other method is the store's own, through the prototype.
    return Object.assign(Object.create(store) as StepNodeAttemptStore, {
      listByProject: (id: string) =>
        attempts.source === 'stale' ? Promise.resolve(stale) : listByProject(id),
    });
  };
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(
        { ...scope.stores, attempts: sourced(scope.stores.attempts) },
        {
          ...options,
          broadcast: announcements,
          dependencyContext: createLocalDependencyContext(scope.stores),
        },
      ),
  });
  const run = (commands: PlanCommand[]) => runner.run(projectId, 'dany', commands);
  const built = await run([
    { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
    { kind: 'createWorkItem', ref: 'S', name: 'S', parentRef: 'P', parentId: null, afterId: null },
    ...Array.from({ length: LEAVES }, (_, n): PlanCommand => ({
      kind: 'createWorkItem',
      ref: `L${String(n)}`,
      name: `L${String(n)}`,
      parentRef: 'P',
      parentId: null,
      afterId: null,
    })),
  ]);
  if (!built.ok) throw new Error(`the tree was refused: ${JSON.stringify(built)}`);
  const idOf = (ref: string): string => {
    const id = built.results.find((each) => each.ref === ref)?.id;
    if (id === undefined) throw new Error(`no ${ref}`);
    return id;
  };
  const parentId = idOf('P');
  const stepId = source.db.get<{ id: string }>(
    sql`SELECT id FROM step WHERE project_id = ${projectId} ORDER BY position LIMIT 1`,
  ).id;
  const budget = await run([
    {
      kind: 'setBudget',
      workItemId: parentId,
      measure: 'tokens',
      cap: CAP,
      policy: 'strict',
      holdPerAttempt: HOLD,
    },
  ]);
  if (!budget.ok) throw new Error(`the budget was refused: ${JSON.stringify(budget)}`);
  return {
    source,
    run,
    parentId,
    leafIds: Array.from({ length: LEAVES }, (_, n) => idOf(`L${String(n)}`)),
    spenderId: idOf('S'),
    stepId,
    readBeforeQueueing: async () => {
      stale = await source.stores.attempts.listByProject(projectId);
    },
    running: () =>
      new Set(
        source.db
          .all<{ w: string }>(
            sql`SELECT work_item_id AS w FROM step_node_attempt WHERE ended_at IS NULL`,
          )
          .map(({ w }) => w),
      ),
    close: async () => {
      await source.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

const leafOf = (world: World, n: number): string => {
  const id = world.leafIds.at(n);
  if (id === undefined) throw new Error(`no leaf ${String(n)}`);
  return id;
};

/** Every model leaf running in the model is running in the store, and nothing else. */
function expectRunningAgree(model: Readonly<Model>, world: World): void {
  expect([...world.running()].sort()).toEqual(
    [...model.running].map((n) => leafOf(world, n)).sort(),
  );
}

/**
 * Starts at `leaves` (indices of idle leaves), each its own batch, all at
 * once: they queue at the write coordinator and race for the budget's room.
 */
class RacingStarts implements fc.AsyncCommand<Model, World> {
  constructor(readonly picks: readonly number[]) {}
  private leaves(model: Readonly<Model>): number[] {
    const idle = Array.from({ length: LEAVES }, (_, n) => n).filter((n) => !model.running.has(n));
    return [...new Set(this.picks.map((pick) => idle[pick % idle.length] ?? -1))].filter(
      (n) => n >= 0,
    );
  }
  check = (model: Readonly<Model>) => model.running.size < LEAVES;
  async run(model: Model, world: World): Promise<void> {
    const leaves = this.leaves(model);
    const room = roomOf(model);
    await world.readBeforeQueueing();
    const answers = await Promise.all(
      leaves.map((n) =>
        world.run([{ kind: 'startAttempt', workItemId: leafOf(world, n), stepId: world.stepId }]),
      ),
    );
    const admitted = leaves.filter((_, at) => answers[at]?.ok);
    // The invariant: never more starts than the budget has room for, and
    // exactly that many when enough race (a refusal only where room ran out).
    expect(admitted.length).toBeLessThanOrEqual(room);
    expect(admitted.length).toBe(Math.min(leaves.length, room));
    for (const n of admitted) model.running.add(n);
    const remaining = CAP - model.spent - HOLD * model.running.size;
    for (const answer of answers.filter((each) => !each.ok))
      expect(answer).toEqual({
        ok: false,
        at: 0,
        kind: 'startAttempt',
        reason: 'budget_exhausted',
        detail: {
          workItemId: world.parentId,
          measure: 'tokens',
          remaining,
          hold: HOLD,
          blocked: false,
        },
      });
    expectRunningAgree(model, world);
  }
  toString = () => `RacingStarts(${this.picks.join(', ')})`;
}

/** Ends one running attempt with no fact: it holds nothing from then on. */
class End implements fc.AsyncCommand<Model, World> {
  constructor(readonly pick: number) {}
  check = (model: Readonly<Model>) => model.running.size > 0;
  async run(model: Model, world: World): Promise<void> {
    const running = [...model.running].sort((left, right) => left - right);
    const n = running.at(this.pick % running.length);
    if (n === undefined) throw new Error('nothing to end');
    const answer = await world.run([
      {
        kind: 'endAttempt',
        workItemId: leafOf(world, n),
        stepId: world.stepId,
        outcome: 'succeeded',
      },
    ]);
    expect(answer).toMatchObject({ ok: true });
    model.running = new Set([...model.running].filter((each) => each !== n));
    expectRunningAgree(model, world);
  }
  toString = () => `End(${String(this.pick)})`;
}

/** States the spender's tokens fact: spend is never refused, past the cap included. */
class Spend implements fc.AsyncCommand<Model, World> {
  constructor(readonly value: number) {}
  check = () => true;
  async run(model: Model, world: World): Promise<void> {
    const answer = await world.run([
      {
        kind: 'setMeasure',
        workItemId: world.spenderId,
        stepId: world.stepId,
        metric: 'tokens',
        value: this.value,
      },
    ]);
    expect(answer).toMatchObject({ ok: true });
    model.spent = this.value;
  }
  toString = () => `Spend(${String(this.value)})`;
}

const commands = fc.commands<Model, World, false>(
  [
    fc
      .array(fc.nat(LEAVES - 1), { minLength: 1, maxLength: LEAVES })
      .map((picks) => new RacingStarts(picks)),
    fc.nat(LEAVES - 1).map((pick) => new End(pick)),
    fc.constantFrom(0, 250, 400, 700, 1000, 1200).map((value) => new Spend(value)),
  ],
  { maxCommands: 8 },
);

/**
 * Racing starts, ends and spend against one strict tokens budget of 1000
 * holding 300 per attempt (`wbs-measure-budgets` D69): after every step the
 * store's running attempts agree with the model, a race admits exactly
 * min(racers, floor((cap − spent) / hold) − running) and never more, and
 * every refusal is `budget_exhausted` naming what remained.
 *
 * Proof: with `attempts.source` 'stale' (the admission reading the attempts
 * as they stood before the race queued, as a coordinator deciding from the
 * headroom read would), fast-check failed seed 20261024 (path
 * "2:5:5:4:7:10:3:2:1:2:2:5") shrunk to `[RacingStarts(0), RacingStarts(1,
 * 2, 0)]`: three of three racers admitted where the room was 2 ("Expected:
 * <= 2, Received: 3"). With the in-transaction refusal removed from
 * `startAttempt` (work-item.resource.ts), it failed seed 20261024 with the
 * same shrunk counterexample and numbers; both watched 2026-10-24.
 */
describe('budget admission as a model invariant', () => {
  it('never admits more racing starts than a strict budget holds room for', async () => {
    let refusals = 0;
    await fc.assert(
      fc.asyncProperty(commands, async (history) => {
        const world = await openWorld({ source: 'turn' });
        try {
          const counted: World = {
            ...world,
            run: async (batch) => {
              const answer = await world.run(batch);
              if (!answer.ok && 'reason' in answer && answer.reason === 'budget_exhausted')
                refusals += 1;
              return answer;
            },
          };
          await fc.asyncModelRun(
            () => ({ model: { running: new Set<number>(), spent: 0 }, real: counted }),
            history,
          );
        } finally {
          await world.close();
        }
      }),
      { numRuns: 40, seed: SEED },
    );
    // The runs reached the budget's edge, so the invariant was tested where it bites.
    expect(refusals).toBeGreaterThan(0);
  }, 180_000);

  it('fails under the stale read, the coordinator deciding outside the write', async () => {
    // The sabotage, kept as a standing negative: a race decided from the
    // attempts read before it queued admits past the room.
    const world = await openWorld({ source: 'stale' });
    try {
      await world.readBeforeQueueing();
      const answers = await Promise.all(
        world.leafIds
          .slice(0, 4)
          .map((workItemId) =>
            world.run([{ kind: 'startAttempt', workItemId, stepId: world.stepId }]),
          ),
      );
      expect(answers.filter((each) => each.ok).length).toBe(4);
    } finally {
      await world.close();
    }
  }, 60_000);
});
