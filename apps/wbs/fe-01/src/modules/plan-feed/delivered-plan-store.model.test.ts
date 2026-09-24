import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { DirectoryRead, RefreshResource } from '@/lib/plan-refresh';
import type { CalendarMarkerView, PlanRead, StepView } from '@/lib/wbs-api';
import { fakeProjectApi } from '@/testing/fake-project-api';

import type { PlanFeedDelivery } from './contract';
import {
  createDeliveredPlan,
  type DeliveredPlan,
  type DeliveredPlanStore,
} from './delivered-plan-store';

/**
 * The values a generated publication is drawn from.
 *
 * Small on purpose, so that the same tree, the same directory, an equal step
 * list in a new array and the same failure cause in a new wrapper all come
 * round again — the repeats are what the stability rule is about.
 */
interface Pool {
  readonly trees: readonly { readonly value: PlanRead; readonly generation: number }[];
  readonly directories: readonly DirectoryRead[];
  readonly markers: readonly (readonly CalendarMarkerView[])[];
  readonly causes: readonly Error[];
}

/** One generated publication, by index into the pool; `null` is "unchanged". */
interface DeliverySpec {
  readonly stale: readonly RefreshResource[];
  readonly failure: number | null;
  readonly directory: number | null;
  readonly tree: number | null;
  /** Step names, always ids `s0`, `s1`…; a fresh array every time it is delivered. */
  readonly steps: readonly string[] | null;
  readonly markers: number | null;
}

type Behaviour = 'read' | 'relay' | 'leave';

const ran: Record<string, number> = {};
function note(kind: string): void {
  ran[kind] = (ran[kind] ?? 0) + 1;
}
const COMMAND_KINDS: readonly string[] = [
  'deliverNow',
  'redeliver',
  'deliverLater',
  'reportConnection',
  'subscribe',
  'unsubscribeLater',
  'settle',
];
const reached = {
  unchangedDelivery: 0,
  equalStepsInNewArray: 0,
  sameCauseNewWrapper: 0,
  relayedFromListener: 0,
  outOfOrderLanding: 0,
};

/**
 * The reference fold, with its own record of every member. It never reads the
 * store: the steps are held as their names, the stale list as its content, the
 * failure as its cause.
 */
interface PlanModel {
  stale: RefreshResource[];
  cause: Error | null;
  directory: DirectoryRead | null;
  tree: Pool['trees'][number] | null;
  /** The model's own copy of the steps' ids and names. */
  steps: StepView[];
  markers: readonly CalendarMarkerView[] | null;
  connected: boolean;
  /** How many times the snapshot must have been replaced so far. */
  changes: number;
  /** How many times the step list must have been replaced so far. */
  stepChanges: number;
  subscribed: Set<number>;
  nextListener: number;
  nextDelivery: number;
}

interface PlanWorld {
  readonly store: DeliveredPlanStore;
  readonly pool: Pool;
  readonly scheduler: fc.Scheduler;
  readonly model: PlanModel;
  readonly unsubscribes: Map<number, () => void>;
  readonly gone: Set<number>;
  /** Every step array handed to the store; the store must keep its own copy, never one of these. */
  readonly deliveredStepArrays: Set<readonly StepView[]>;
  readonly sentinel: { heard: number };
  /** How many listener calls are running; a relayed write is told about only once they end. */
  readonly listening: { depth: number };
  readonly inflight: Promise<void>[];
  /** Which scheduled publications have landed, to count one landing before an earlier one. */
  readonly landed: Set<number>;
}

function toDelivery(world: PlanWorld, spec: DeliverySpec): PlanFeedDelivery {
  const at = <T>(list: readonly T[], index: number | null): T | null => {
    if (index === null) return null;
    const value = list.at(index % list.length);
    if (value === undefined) throw new Error(`the pool has no entry ${String(index)}`);
    return value;
  };
  const cause = at(world.pool.causes, spec.failure);
  const steps =
    spec.steps === null ? null : spec.steps.map((name, i) => ({ id: `s${String(i)}`, name }));
  if (steps !== null) world.deliveredStepArrays.add(steps);
  return {
    // A fresh array every time, as the owner's snapshot may give one.
    staleResources: [...spec.stale],
    // A fresh wrapper every time, as `nextDelivery` builds one.
    treeFailure: cause === null ? null : { cause },
    directory: at(world.pool.directories, spec.directory),
    tree: at(world.pool.trees, spec.tree),
    steps,
    markers: at(world.pool.markers, spec.markers),
  };
}

/** What a step list says, as one comparable string. */
function stepsKey(steps: readonly StepView[]): string {
  return JSON.stringify(steps.map(({ id, name }) => [id, name]));
}

/** Folds one publication into the model, counting whether the snapshot must change. */
function fold(model: PlanModel, delivery: PlanFeedDelivery): void {
  let changed = false;
  const stale = [...delivery.staleResources];
  if (stale.join() !== model.stale.join()) {
    model.stale = stale;
    changed = true;
  }
  const cause = delivery.treeFailure === null ? null : delivery.treeFailure.cause;
  if (!(cause === null || cause instanceof Error))
    throw new Error('the pool only has Error causes');
  if (cause !== model.cause) {
    model.cause = cause;
    changed = true;
  } else if (cause !== null) {
    reached.sameCauseNewWrapper += 1;
  }
  if (delivery.directory !== null && delivery.directory !== model.directory) {
    model.directory = delivery.directory;
    changed = true;
  }
  if (delivery.tree !== null && delivery.tree !== model.tree) {
    model.tree = delivery.tree;
    changed = true;
  }
  if (delivery.steps !== null) {
    if (stepsKey(delivery.steps) !== stepsKey(model.steps)) {
      model.steps = delivery.steps.map(({ id, name }) => ({ id, name }));
      model.stepChanges += 1;
      changed = true;
    } else {
      reached.equalStepsInNewArray += 1;
    }
  }
  if (delivery.markers !== null && delivery.markers !== model.markers) {
    model.markers = delivery.markers;
    changed = true;
  }
  if (changed) model.changes += 1;
  else reached.unchangedDelivery += 1;
}

/** Asserts one snapshot says what the model says, member by member. */
function assertSnapshot(model: PlanModel, world: PlanWorld, snapshot: DeliveredPlan, what: string) {
  expect([...snapshot.staleResources], `${what}: stale`).toEqual(model.stale);
  expect(snapshot.treeFailure?.cause ?? null, `${what}: failure cause`).toBe(model.cause);
  expect(snapshot.directory, `${what}: directory`).toBe(model.directory);
  expect(snapshot.tree, `${what}: tree`).toBe(model.tree);
  expect(stepsKey(snapshot.steps), `${what}: steps`).toBe(stepsKey(model.steps));
  expect(
    world.deliveredStepArrays.has(snapshot.steps),
    `${what}: steps are not the store’s own`,
  ).toBe(false);
  if (model.markers === null) expect(snapshot.markers, `${what}: markers`).toEqual([]);
  else expect(snapshot.markers, `${what}: markers`).toBe(model.markers);
  expect(snapshot.connected, `${what}: connected`).toBe(model.connected);
}

/**
 * Runs one write against the store and the model together, and checks the
 * stability rule around it: a new snapshot object exactly when the model says
 * something changed during the call — its own change or one a listener relayed
 * from inside it — and the same step array whenever the steps did not change.
 */
function write(world: PlanWorld, what: string, apply: () => void, perform: () => void): void {
  const { model, store } = world;
  const before = store.snapshot();
  const changesBefore = model.changes;
  const stepChangesBefore = model.stepChanges;
  apply();
  perform();
  const after = store.snapshot();
  expect(after !== before, `${what}: a new snapshot exactly when something changed`).toBe(
    model.changes > changesBefore,
  );
  if (model.stepChanges === stepChangesBefore) {
    expect(after.steps, `${what}: unchanged steps keep their array`).toBe(before.steps);
  }
  assertSnapshot(model, world, after, what);
  // A write relayed from inside a listener is queued behind the delivery that
  // listener is part of, so the count is exact only once no listener is running.
  if (world.listening.depth === 0) {
    expect(world.sentinel.heard, `${what}: changes heard by the listener that never leaves`).toBe(
      model.changes,
    );
  }
}

function deliver(world: PlanWorld, spec: DeliverySpec, what: string): void {
  const delivery = toDelivery(world, spec);
  write(
    world,
    what,
    () => {
      fold(world.model, delivery);
    },
    () => {
      world.store.deliver(delivery);
    },
  );
}

function subscribeReal(world: PlanWorld, id: number, behaviour: Behaviour, relay: DeliverySpec) {
  let relayed = false;
  const unsubscribe = world.store.subscribe(() => {
    world.listening.depth += 1;
    try {
      expect(world.gone.has(id), `listener ${String(id)} was told after it left`).toBe(false);
      assertSnapshot(world.model, world, world.store.snapshot(), `listener ${String(id)}`);
      if (behaviour === 'relay' && !relayed) {
        relayed = true;
        reached.relayedFromListener += 1;
        deliver(world, relay, `relay from listener ${String(id)}`);
      }
      if (behaviour === 'leave') {
        world.model.subscribed.delete(id);
        world.unsubscribes.get(id)?.();
        world.gone.add(id);
      }
    } finally {
      world.listening.depth -= 1;
    }
  });
  world.unsubscribes.set(id, unsubscribe);
}

type PlanCommand = fc.AsyncCommand<PlanModel, PlanWorld>;

class DeliverNow implements PlanCommand {
  constructor(readonly spec: DeliverySpec) {}
  check(): boolean {
    return true;
  }
  async run(_model: PlanModel, world: PlanWorld): Promise<void> {
    note('deliverNow');
    deliver(world, this.spec, 'deliverNow');
    await Promise.resolve();
  }
  toString(): string {
    return `deliverNow(${JSON.stringify(this.spec)})`;
  }
}

/**
 * A publication that says nothing new, built from the model's own record: the
 * same stale list in a new array, the same cause in a new wrapper, the same
 * steps in a new array, and the same tree, directory and markers objects — the
 * owner republishing because something else in its snapshot moved.
 */
class Redeliver implements PlanCommand {
  check(): boolean {
    return true;
  }
  async run(model: PlanModel, world: PlanWorld): Promise<void> {
    note('redeliver');
    const steps = model.steps.map(({ id, name }) => ({ id, name }));
    world.deliveredStepArrays.add(steps);
    const delivery: PlanFeedDelivery = {
      staleResources: [...model.stale],
      treeFailure: model.cause === null ? null : { cause: model.cause },
      directory: model.directory,
      tree: model.tree,
      steps,
      markers: model.markers,
    };
    write(
      world,
      'redeliver',
      () => {
        fold(model, delivery);
      },
      () => {
        world.store.deliver(delivery);
      },
    );
    await Promise.resolve();
  }
  toString(): string {
    return 'redeliver';
  }
}

/** A publication from a read that lands whenever the scheduler says — possibly after a later one. */
class DeliverLater implements PlanCommand {
  constructor(readonly spec: DeliverySpec) {}
  check(): boolean {
    return true;
  }
  async run(model: PlanModel, world: PlanWorld): Promise<void> {
    note('deliverLater');
    const ordinal = model.nextDelivery;
    model.nextDelivery += 1;
    world.inflight.push(
      world.scheduler.schedule(Promise.resolve(), `read ${String(ordinal)} lands`).then(() => {
        if ([...world.landed].some((other) => other > ordinal)) reached.outOfOrderLanding += 1;
        world.landed.add(ordinal);
        deliver(world, this.spec, `deliverLater #${String(ordinal)}`);
      }),
    );
    await Promise.resolve();
  }
  toString(): string {
    return `deliverLater(${JSON.stringify(this.spec)})`;
  }
}

class ReportConnection implements PlanCommand {
  constructor(readonly connected: boolean) {}
  check(): boolean {
    return true;
  }
  async run(model: PlanModel, world: PlanWorld): Promise<void> {
    note('reportConnection');
    write(
      world,
      `reportConnection(${String(this.connected)})`,
      () => {
        if (model.connected !== this.connected) {
          model.connected = this.connected;
          model.changes += 1;
        }
      },
      () => {
        world.store.reportConnection(this.connected);
      },
    );
    await Promise.resolve();
  }
  toString(): string {
    return `reportConnection(${String(this.connected)})`;
  }
}

class Subscribe implements PlanCommand {
  constructor(
    readonly behaviour: Behaviour,
    readonly relay: DeliverySpec,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: PlanModel, world: PlanWorld): Promise<void> {
    note('subscribe');
    const id = model.nextListener;
    model.nextListener += 1;
    model.subscribed.add(id);
    subscribeReal(world, id, this.behaviour, this.relay);
    await Promise.resolve();
  }
  toString(): string {
    return this.behaviour === 'relay'
      ? `subscribe(relay ${JSON.stringify(this.relay)})`
      : `subscribe(${this.behaviour})`;
  }
}

class UnsubscribeLater implements PlanCommand {
  constructor(readonly pick: number) {}
  check(model: PlanModel): boolean {
    return model.subscribed.size > 0;
  }
  async run(model: PlanModel, world: PlanWorld): Promise<void> {
    note('unsubscribeLater');
    const listeners = [...model.subscribed];
    const id = listeners.at(this.pick % listeners.length);
    if (id === undefined) throw new Error('no listener to pick');
    world.inflight.push(
      world.scheduler.schedule(Promise.resolve(), `listener ${String(id)} leaves`).then(() => {
        model.subscribed.delete(id);
        world.unsubscribes.get(id)?.();
        world.gone.add(id);
      }),
    );
    await Promise.resolve();
  }
  toString(): string {
    return `unsubscribeLater(${String(this.pick)})`;
  }
}

class Settle implements PlanCommand {
  check(): boolean {
    return true;
  }
  async run(_model: PlanModel, world: PlanWorld): Promise<void> {
    note('settle');
    await world.scheduler.waitIdle();
    for (const task of world.inflight.splice(0, world.inflight.length)) await task;
  }
  toString(): string {
    return 'settle';
  }
}

const indexArb = fc.option(fc.nat(2), { nil: null });
const specArb: fc.Arbitrary<DeliverySpec> = fc.record({
  stale: fc.constantFrom<readonly RefreshResource[]>([], ['tree'], ['tree', 'markers']),
  failure: indexArb,
  directory: indexArb,
  tree: indexArb,
  steps: fc.option(fc.constantFrom<readonly string[]>([], ['Dev'], ['Build'], ['Dev', 'Test']), {
    nil: null,
  }),
  markers: indexArb,
});

const commandsArb = fc.commands<PlanModel, PlanWorld, false>(
  [
    specArb.map((spec) => new DeliverNow(spec)),
    fc.constant(new Redeliver()),
    specArb.map((spec) => new DeliverLater(spec)),
    fc.boolean().map((connected) => new ReportConnection(connected)),
    fc
      .tuple(fc.constantFrom<Behaviour>('read', 'relay', 'leave'), specArb)
      .map(([behaviour, relay]) => new Subscribe(behaviour, relay)),
    fc.nat(8).map((pick) => new UnsubscribeLater(pick)),
    fc.constant(new Settle()),
  ],
  { maxCommands: 16, size: 'max' },
);

async function buildPool(): Promise<Pool> {
  const read = await fakeProjectApi().tree('p1');
  const directory = (): DirectoryRead => ({
    teams: [],
    tags: [],
    services: [],
    workItemTypes: [],
    externalSystems: [],
    people: [],
  });
  return {
    trees: [1, 2, 3].map((generation) => ({ value: { ...read }, generation })),
    directories: [directory(), directory(), directory()],
    markers: [[], [], []],
    causes: [new Error('forbidden'), new Error('unavailable'), new Error('gone')],
  };
}

/**
 * The delivered plan, run against a reference fold.
 *
 * The record this executes is section 3.3 of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md`.
 */
describe('the delivered plan, against a reference model', () => {
  it('folds every publication exactly as the model does, and changes only when it must', async () => {
    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
    const pool = await buildPool();

    await fc.assert(
      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
        const model: PlanModel = {
          stale: [],
          cause: null,
          directory: null,
          tree: null,
          steps: [],
          markers: null,
          connected: true,
          changes: 0,
          stepChanges: 0,
          subscribed: new Set(),
          nextListener: 0,
          nextDelivery: 0,
        };
        const store = createDeliveredPlan();
        const world: PlanWorld = {
          store,
          pool,
          scheduler,
          model,
          unsubscribes: new Map(),
          gone: new Set(),
          deliveredStepArrays: new Set(),
          sentinel: { heard: 0 },
          listening: { depth: 0 },
          inflight: [],
          landed: new Set(),
        };
        store.subscribe(() => {
          world.sentinel.heard += 1;
        });
        let failure: Error | null = null;
        try {
          await fc.asyncModelRun<PlanModel, PlanWorld, false, PlanModel>(
            () => ({ model, real: world }),
            commands,
          );
        } catch (caught: unknown) {
          failure = caught instanceof Error ? caught : new Error(String(caught));
        }
        const unreported: string[] = [];
        try {
          await scheduler.waitIdle();
          for (const task of world.inflight.splice(0, world.inflight.length)) await task;
          assertSnapshot(model, world, store.snapshot(), 'teardown');
        } catch (caught: unknown) {
          unreported.push(String(caught));
        }
        if (unreported.length === 0) {
          if (failure !== null) throw failure;
          return;
        }
        if (failure === null) throw new Error(`teardown refused: ${unreported.join(' | ')}`);
        throw new Error(`the property failed and its teardown refused: ${unreported.join(' | ')}`, {
          cause: failure,
        });
      }),
      { seed: 20260924, numRuns: 300 },
    );

    for (const kind of COMMAND_KINDS) {
      expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
    }
    for (const [what, count] of Object.entries(reached)) {
      expect(count, `the pinned run never reached ${what}`).toBeGreaterThan(0);
    }
  });
});
