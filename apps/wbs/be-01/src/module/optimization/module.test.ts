import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { installOptimization } from './check';
import { OPTIMIZATION_LABEL, type OptimizationRequirements } from './contract';
import { optimizationModule } from './module';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const CONTRACT = '7+0.1.0';
const BUDGET_MS = 60_000;

const INPUT: ScheduleInput = {
  rows: [{ id: 'w-1', parentId: null, position: 10, frozenNumber: null, priority: null }],
  edges: [],
  slices: [
    {
      workItemId: 'w-1',
      stepId: 's-1',
      days: 1,
      personId: null,
      width: 1,
      poolIds: [],
    },
  ],
  notBefore: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  deadlines: new Map(),
};

/**
 * Requirements whose SQLite handles are empty stand-ins.
 *
 * Every case below stops before the coordinator's first repository call — an
 * idle plan read, a Retry refused as stale, an edit whose enabled read
 * fails — so a real database would only make this a `*.db.test.ts` suite
 * without being read. A case that reached SQLite would fail on the stand-in.
 */
function requirements(): OptimizationRequirements {
  return {
    db: {} as unknown as OptimizationRequirements['db'],
    contractVersion: CONTRACT,
    solverVersion: '0.1.0',
    budgetMs: BUDGET_MS,
    ownerId: 'owner',
    now: () => 10,
    attemptToken: () => 'attempt-1',
    inputOf: () => Promise.resolve(INPUT),
    enabledOf: () => Promise.resolve(true),
    spawn: () => Promise.reject(new Error('the module test launches no solver')),
    onChildError: (error) => {
      throw error;
    },
    eventLog: {} as unknown as OptimizationRequirements['eventLog'],
    pushRecorded: () => Promise.resolve(),
  };
}

const hostRequirements = () => {
  const supplied = requirements();
  return {
    db: DiBag.fromSyncFactory(() => supplied.db),
    contractVersion: DiBag.fromSyncFactory(() => supplied.contractVersion),
    solverVersion: DiBag.fromSyncFactory(() => supplied.solverVersion),
    budgetMs: DiBag.fromSyncFactory(() => supplied.budgetMs),
    ownerId: DiBag.fromSyncFactory(() => supplied.ownerId),
    now: DiBag.fromSyncFactory(() => supplied.now),
    attemptToken: DiBag.fromSyncFactory(() => supplied.attemptToken),
    inputOf: DiBag.fromSyncFactory(() => supplied.inputOf),
    enabledOf: DiBag.fromSyncFactory(() => supplied.enabledOf),
    spawn: DiBag.fromSyncFactory(() => supplied.spawn),
    runChild: DiBag.fromSyncFactory(() => supplied.runChild),
    eventLog: DiBag.fromSyncFactory(() => supplied.eventLog),
    pushRecorded: DiBag.fromSyncFactory(() => supplied.pushRecorded),
    editDebounceMs: DiBag.fromSyncFactory(() => supplied.editDebounceMs),
    sleep: DiBag.fromSyncFactory(() => supplied.sleep),
    setInterval: DiBag.fromSyncFactory(() => supplied.setInterval),
    clearInterval: DiBag.fromSyncFactory(() => supplied.clearInterval),
  };
};

/**
 * A complete host graph.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 every prior 040.6 module's own
 * `module.test.ts` records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(optimizationModule)
    .register({
      ...hostRequirements(),
      onChildError: DiBag.fromSyncFactory(() => requirements().onChildError),
    })
    .build();

describe('the Optimization module', () => {
  it('reads an idle plan under the identity installOptimization wires', () => {
    const { optimizer } = installOptimization(requirements());

    const read = optimizer.readPlan({
      projectId: PROJECT,
      objective: 'pri',
      input: INPUT,
      enabled: false,
    });

    expect(read).toMatchObject({
      projectId: PROJECT,
      contractVersion: CONTRACT,
      budgetMs: BUDGET_MS,
      generation: null,
      variants: { pri: { state: 'idle' }, time: { state: 'idle' } },
      schedules: { pri: null, time: null },
    });
  });

  it('reports a failed edit read to the error sink installOptimization wires', async () => {
    const refused = new Error('enabled read refused');
    const failures: unknown[] = [];
    const { optimizer } = installOptimization({
      ...requirements(),
      editDebounceMs: 0,
      sleep: () => Promise.resolve(),
      enabledOf: () => Promise.reject(refused),
      onChildError: (error) => {
        failures.push(error);
      },
    });

    optimizer.inputChanged(PROJECT);
    await optimizer.drain();

    expect(failures).toEqual([refused]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `OptimizationExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installOptimization(requirements());

    expect(Object.keys(exposed)).toEqual(['optimizer']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('optimizationOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "optimizationOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${OPTIMIZATION_LABEL}/optimizationOptions`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(optimizationModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('optimizer')).toThrow(
      `Cannot resolve "${OPTIMIZATION_LABEL}/optimizationOptions": dependency "onChildError" is not registered. Resolution path: optimizer -> ${OPTIMIZATION_LABEL}/optimizationOptions -> onChildError.`,
    );
  });
});
