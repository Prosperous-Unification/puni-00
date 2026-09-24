import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type Busy, createBusy } from './busy-store';

/**
 * What one listener does each time it is told busy changed.
 *
 * `bounce` is the re-entrant one: the first time it is told the project is
 * idle, it raises and lowers again from inside that notification — two more
 * changes while the first is still being delivered. Once, because a listener
 * that did it every time would never let delivery end.
 */
type Behaviour = 'read' | 'bounce' | 'leave';

const ran: Record<string, number> = {};
function note(kind: string): void {
  ran[kind] = (ran[kind] ?? 0) + 1;
}
const COMMAND_KINDS: readonly string[] = [
  'raise',
  'lower',
  'gesture',
  'subscribe',
  'unsubscribeLater',
  'settle',
];
const reached = {
  raiseWhileRaised: 0,
  lowerWhileLowered: 0,
  gestureEndedOutOfOrder: 0,
  reentrantBounce: 0,
};

/**
 * The reference: the value, how many times it has changed, and who is
 * listening. Its own record, never read back out of the store.
 */
interface BusyModel {
  busy: boolean;
  /** Every change of the value so far; the listener that never leaves must have heard this many. */
  changes: number;
  subscribed: Set<number>;
  nextListener: number;
  nextGesture: number;
  ended: Set<number>;
}

interface BusyWorld {
  readonly busy: Busy;
  readonly scheduler: fc.Scheduler;
  readonly model: BusyModel;
  readonly unsubscribes: Map<number, () => void>;
  readonly gone: Set<number>;
  /** What the listener that never leaves has heard: how often, and the last value it read. */
  readonly sentinel: { heard: number; last: boolean | null };
  readonly listening: { depth: number };
  readonly inflight: Promise<void>[];
}

/** Sets the model's value, counting a change. */
function become(model: BusyModel, next: boolean): void {
  if (model.busy === next) {
    if (next) reached.raiseWhileRaised += 1;
    else reached.lowerWhileLowered += 1;
    return;
  }
  model.busy = next;
  model.changes += 1;
}

/** Asserts the store against the model, as of now. */
function assertBusy(world: BusyWorld, what: string): void {
  const { model } = world;
  expect(world.busy.snapshot(), `${what}: busy`).toBe(model.busy);
  // A change made from inside a listener is told after the delivery that
  // listener is part of, so the count is exact only once no listener is running.
  if (world.listening.depth > 0) return;
  expect(world.sentinel.heard, `${what}: changes heard by the listener that never leaves`).toBe(
    model.changes,
  );
  if (world.sentinel.heard > 0) {
    expect(world.sentinel.last, `${what}: the last value the sentinel read`).toBe(model.busy);
  }
}

function raise(world: BusyWorld, what: string): void {
  become(world.model, true);
  world.busy.raise();
  assertBusy(world, what);
}

function lower(world: BusyWorld, what: string): void {
  become(world.model, false);
  world.busy.lower();
  assertBusy(world, what);
}

function subscribeReal(world: BusyWorld, id: number, behaviour: Behaviour): void {
  let bounced = false;
  const unsubscribe = world.busy.subscribe(() => {
    world.listening.depth += 1;
    try {
      expect(world.gone.has(id), `listener ${String(id)} was told after it left`).toBe(false);
      // Told only after the change it is told about: what it reads is the
      // model's value at this very instant, re-entrant changes included.
      const now = world.busy.snapshot();
      expect(now, `listener ${String(id)} read busy`).toBe(world.model.busy);
      if (behaviour === 'bounce' && !now && !bounced) {
        bounced = true;
        reached.reentrantBounce += 1;
        raise(world, `bounce raise from listener ${String(id)}`);
        lower(world, `bounce lower from listener ${String(id)}`);
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

type BusyCommand = fc.AsyncCommand<BusyModel, BusyWorld>;

class Raise implements BusyCommand {
  check(): boolean {
    return true;
  }
  async run(_model: BusyModel, world: BusyWorld): Promise<void> {
    note('raise');
    raise(world, 'raise');
    await Promise.resolve();
  }
  toString(): string {
    return 'raise';
  }
}

class Lower implements BusyCommand {
  check(): boolean {
    return true;
  }
  async run(_model: BusyModel, world: BusyWorld): Promise<void> {
    note('lower');
    lower(world, 'lower');
    await Promise.resolve();
  }
  toString(): string {
    return 'lower';
  }
}

/**
 * A gesture: raises now and lowers when be-01 answers, which is whenever the
 * scheduler says — possibly after a gesture started later.
 */
class Gesture implements BusyCommand {
  check(): boolean {
    return true;
  }
  async run(model: BusyModel, world: BusyWorld): Promise<void> {
    note('gesture');
    const gesture = model.nextGesture;
    model.nextGesture += 1;
    raise(world, `gesture ${String(gesture)} starts`);
    world.inflight.push(
      world.scheduler.schedule(Promise.resolve(), `gesture ${String(gesture)} ends`).then(() => {
        if ([...model.ended].some((other) => other > gesture)) reached.gestureEndedOutOfOrder += 1;
        model.ended.add(gesture);
        lower(world, `gesture ${String(gesture)} ends`);
      }),
    );
    await Promise.resolve();
  }
  toString(): string {
    return 'gesture';
  }
}

class Subscribe implements BusyCommand {
  constructor(readonly behaviour: Behaviour) {}
  check(): boolean {
    return true;
  }
  async run(model: BusyModel, world: BusyWorld): Promise<void> {
    note('subscribe');
    const id = model.nextListener;
    model.nextListener += 1;
    model.subscribed.add(id);
    subscribeReal(world, id, this.behaviour);
    await Promise.resolve();
  }
  toString(): string {
    return `subscribe(${this.behaviour})`;
  }
}

/** A listener disposed whenever the scheduler says — a component unmounting. */
class UnsubscribeLater implements BusyCommand {
  constructor(readonly pick: number) {}
  check(model: BusyModel): boolean {
    return model.subscribed.size > 0;
  }
  async run(model: BusyModel, world: BusyWorld): Promise<void> {
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

class Settle implements BusyCommand {
  check(): boolean {
    return true;
  }
  async run(_model: BusyModel, world: BusyWorld): Promise<void> {
    note('settle');
    await world.scheduler.waitIdle();
    for (const task of world.inflight.splice(0, world.inflight.length)) await task;
    assertBusy(world, 'settle');
  }
  toString(): string {
    return 'settle';
  }
}

const commandsArb = fc.commands<BusyModel, BusyWorld, false>(
  [
    fc.constant(new Raise()),
    fc.constant(new Lower()),
    fc.constant(new Gesture()),
    fc.constantFrom<Behaviour>('read', 'bounce', 'leave').map((b) => new Subscribe(b)),
    fc.nat(8).map((pick) => new UnsubscribeLater(pick)),
    fc.constant(new Settle()),
  ],
  { maxCommands: 16, size: 'max' },
);

/**
 * The busy state, run against a reference model.
 *
 * The record this executes is section 3.2 of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md`.
 */
describe('the busy state, against a reference model', () => {
  it('holds the last value raised or lowered, and says so once per change', async () => {
    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');

    await fc.assert(
      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
        const model: BusyModel = {
          busy: false,
          changes: 0,
          subscribed: new Set(),
          nextListener: 0,
          nextGesture: 0,
          ended: new Set(),
        };
        const busy = createBusy();
        const world: BusyWorld = {
          busy,
          scheduler,
          model,
          unsubscribes: new Map(),
          gone: new Set(),
          sentinel: { heard: 0, last: null },
          listening: { depth: 0 },
          inflight: [],
        };
        busy.subscribe(() => {
          world.sentinel.heard += 1;
          world.sentinel.last = busy.snapshot();
        });
        let failure: Error | null = null;
        try {
          await fc.asyncModelRun<BusyModel, BusyWorld, false, BusyModel>(
            () => ({ model, real: world }),
            commands,
          );
        } catch (caught: unknown) {
          failure = caught instanceof Error ? caught : new Error(String(caught));
        }
        // Teardown: every gesture still out ends, in the scheduler's order, and is
        // still checked; its failure is reported beside the property's own.
        const unreported: string[] = [];
        try {
          await scheduler.waitIdle();
          for (const task of world.inflight.splice(0, world.inflight.length)) await task;
          assertBusy(world, 'teardown');
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
