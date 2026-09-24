import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type Channel, createChannel } from './channel';

/**
 * What one listener does each time it hears an event, chosen when it subscribes.
 *
 * Every re-entrant thing a listener can do to the channel it is being called
 * from: publish again, drop the newest other listener — usually one whose turn
 * in this very delivery has not come yet — add one, or fail.
 */
type Behaviour =
  | { readonly kind: 'record' }
  | { readonly kind: 'echo' }
  | { readonly kind: 'dropNewest' }
  | { readonly kind: 'join' }
  | { readonly kind: 'fail' };

/** Events published from outside are below this; an echo adds it, and is never echoed again. */
const ECHO = 1000;

/**
 * How many times each command actually ran, and how many times each
 * interleaving the rules are about was actually reached, across the whole
 * pinned run — a property whose commands were all skipped proves nothing.
 */
const ran: Record<string, number> = {};
function note(kind: string): void {
  ran[kind] = (ran[kind] ?? 0) + 1;
}
const COMMAND_KINDS: readonly string[] = [
  'subscribe',
  'publishNow',
  'publishLater',
  'unsubscribeLater',
  'unsubscribeTwice',
  'settle',
];
const reached = {
  echoQueued: 0,
  droppedBeforeTurn: 0,
  joinedDuringDelivery: 0,
  oneFailure: 0,
  severalFailures: 0,
};

/**
 * The reference: the subscribers the model believes are registered, in order,
 * and how each behaves. It shares nothing with the
 * channel — arrays instead of a set, and its own loop.
 */
interface ChannelModel {
  subscribed: number[];
  behaviours: Map<number, Behaviour>;
  nextId: number;
}

/** One hearing, as the real listener recorded it. */
interface Hearing {
  readonly listener: number;
  readonly event: number;
  /** How many listener calls were active, this one included. */
  readonly depth: number;
}

interface ChannelWorld {
  readonly channel: Channel<number>;
  readonly scheduler: fc.Scheduler;
  readonly unsubscribes: Map<number, () => void>;
  /** The ids this file believes are registered, in subscription order. */
  order: number[];
  /** The ids whose unsubscribe has returned; nothing may reach them afterwards. */
  readonly gone: Set<number>;
  readonly hearings: Hearing[];
  /** Every failure a listener threw, by `listener:event`, so identity can be asserted. */
  readonly thrown: Map<string, Error>;
  /** Scheduled publications and unsubscriptions, awaited by `settle` and by teardown. */
  readonly inflight: Promise<void>[];
  depth: number;
  nextId: number;
}

/** What the reference expects one outer publication to do. */
function expectedPublication(
  model: ChannelModel,
  event: number,
): { readonly hearings: { listener: number; event: number }[]; readonly failures: string[] } {
  const hearings: { listener: number; event: number }[] = [];
  const failures: string[] = [];
  const queue = [event];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const recipients = model.subscribed.slice();
    for (const listener of recipients) {
      if (!model.subscribed.includes(listener)) {
        reached.droppedBeforeTurn += 1;
        continue;
      }
      hearings.push({ listener, event: current });
      const behaviour = model.behaviours.get(listener);
      if (behaviour === undefined) throw new Error(`the model lost listener ${String(listener)}`);
      if (behaviour.kind === 'echo' && current < ECHO) {
        queue.push(current + ECHO);
        reached.echoQueued += 1;
      }
      if (behaviour.kind === 'dropNewest') {
        const newest = model.subscribed.filter((id) => id !== listener).at(-1);
        model.subscribed = model.subscribed.filter((id) => id !== newest);
      }
      if (behaviour.kind === 'join') {
        const joined = model.nextId;
        model.nextId += 1;
        model.subscribed.push(joined);
        model.behaviours.set(joined, { kind: 'record' });
        reached.joinedDuringDelivery += 1;
      }
      if (behaviour.kind === 'fail') failures.push(`${String(listener)}:${String(current)}`);
    }
  }
  return { hearings, failures };
}

/** Unsubscribes one listener for real and records that nothing may reach it now. */
function leave(world: ChannelWorld, id: number): void {
  const unsubscribe = world.unsubscribes.get(id);
  if (unsubscribe === undefined) throw new Error(`listener ${String(id)} was never registered`);
  unsubscribe();
  world.order = world.order.filter((listener) => listener !== id);
  world.gone.add(id);
}

/** Registers one real listener that behaves as `behaviour` says. */
function subscribeReal(world: ChannelWorld, id: number, behaviour: Behaviour): void {
  const unsubscribe = world.channel.subscribe((event) => {
    world.depth += 1;
    try {
      // Nothing may reach a listener after its unsubscribe returned.
      expect(
        world.gone.has(id),
        `listener ${String(id)} heard ${String(event)} after it left`,
      ).toBe(false);
      world.hearings.push({ listener: id, event, depth: world.depth });
      if (behaviour.kind === 'echo' && event < ECHO) world.channel.publish(event + ECHO);
      if (behaviour.kind === 'dropNewest') {
        // Chosen from the test's own record of who is registered, never from the
        // channel: `order` is kept by this file alone.
        const newest = world.order.filter((listener) => listener !== id).at(-1);
        if (newest !== undefined) leave(world, newest);
      }
      if (behaviour.kind === 'join') {
        const joined = world.nextId;
        world.nextId += 1;
        subscribeReal(world, joined, { kind: 'record' });
      }
      if (behaviour.kind === 'fail') {
        const failure = new Error(`listener ${String(id)} refused ${String(event)}`);
        world.thrown.set(`${String(id)}:${String(event)}`, failure);
        throw failure;
      }
    } finally {
      world.depth -= 1;
    }
  });
  world.unsubscribes.set(id, unsubscribe);
  world.order.push(id);
}

/** Publishes from outside and checks every hearing and the failure against the reference. */
function publishAndCheck(model: ChannelModel, world: ChannelWorld, event: number): void {
  const expected = expectedPublication(model, event);
  const before = world.hearings.length;
  let failure: unknown = null;
  try {
    world.channel.publish(event);
  } catch (caught: unknown) {
    failure = caught;
  }
  const heard = world.hearings.slice(before);
  expect(
    heard.map(({ listener, event: e }) => ({ listener, event: e })),
    `who heard ${String(event)}, in what order`,
  ).toEqual(expected.hearings);
  for (const hearing of heard) {
    expect(hearing.depth, `listener ${String(hearing.listener)} was entered re-entrantly`).toBe(1);
  }
  if (expected.failures.length === 0) {
    expect(failure, `publish(${String(event)}) threw with no failing listener`).toBeNull();
    return;
  }
  const errors = expected.failures.map((key) => world.thrown.get(key));
  if (expected.failures.length === 1) {
    reached.oneFailure += 1;
    expect(failure, `publish(${String(event)}) did not rethrow the one failure by identity`).toBe(
      errors[0],
    );
    return;
  }
  reached.severalFailures += 1;
  expect(failure, `publish(${String(event)}) did not aggregate its failures`).toBeInstanceOf(
    AggregateError,
  );
  if (!(failure instanceof AggregateError)) return;
  expect(failure.errors.length, 'aggregated failures').toBe(errors.length);
  failure.errors.forEach((error: unknown, index) => {
    expect(error, `aggregated failure ${String(index)}`).toBe(errors[index]);
  });
}

type ChannelCommand = fc.AsyncCommand<ChannelModel, ChannelWorld>;

class Subscribe implements ChannelCommand {
  constructor(readonly behaviour: Behaviour) {}
  check(): boolean {
    return true;
  }
  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
    note('subscribe');
    const id = model.nextId;
    model.nextId += 1;
    expect(world.nextId, 'the model and the world agree on the next listener').toBe(id);
    world.nextId += 1;
    model.subscribed.push(id);
    model.behaviours.set(id, this.behaviour);
    subscribeReal(world, id, this.behaviour);
    await Promise.resolve();
  }
  toString(): string {
    return `subscribe(${this.behaviour.kind})`;
  }
}

class PublishNow implements ChannelCommand {
  constructor(readonly event: number) {}
  check(): boolean {
    return true;
  }
  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
    note('publishNow');
    publishAndCheck(model, world, this.event);
    await Promise.resolve();
  }
  toString(): string {
    return `publish(${String(this.event)})`;
  }
}

/** A publication an asynchronous producer makes whenever the scheduler says. */
class PublishLater implements ChannelCommand {
  constructor(readonly event: number) {}
  check(): boolean {
    return true;
  }
  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
    note('publishLater');
    world.inflight.push(
      world.scheduler.schedule(Promise.resolve(), `publish ${String(this.event)}`).then(() => {
        publishAndCheck(model, world, this.event);
      }),
    );
    await Promise.resolve();
  }
  toString(): string {
    return `publishLater(${String(this.event)})`;
  }
}

/** A subscriber disposed whenever the scheduler says — an unmount racing a producer. */
class UnsubscribeLater implements ChannelCommand {
  constructor(readonly pick: number) {}
  check(model: ChannelModel): boolean {
    return model.subscribed.length > 0;
  }
  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
    note('unsubscribeLater');
    const id = model.subscribed.at(this.pick % model.subscribed.length);
    if (id === undefined) throw new Error('no subscriber to pick');
    world.inflight.push(
      world.scheduler.schedule(Promise.resolve(), `unsubscribe ${String(id)}`).then(() => {
        model.subscribed = model.subscribed.filter((listener) => listener !== id);
        leave(world, id);
      }),
    );
    await Promise.resolve();
  }
  toString(): string {
    return `unsubscribeLater(${String(this.pick)})`;
  }
}

class UnsubscribeTwice implements ChannelCommand {
  constructor(readonly pick: number) {}
  check(model: ChannelModel): boolean {
    return model.subscribed.length > 0;
  }
  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
    note('unsubscribeTwice');
    const id = model.subscribed.at(this.pick % model.subscribed.length);
    if (id === undefined) throw new Error('no subscriber to pick');
    const unsubscribe = world.unsubscribes.get(id);
    if (unsubscribe === undefined) throw new Error(`listener ${String(id)} was never registered`);
    model.subscribed = model.subscribed.filter((listener) => listener !== id);
    leave(world, id);
    unsubscribe();
    await Promise.resolve();
  }
  toString(): string {
    return `unsubscribeTwice(${String(this.pick)})`;
  }
}

/** Lets the scheduler run everything pending, in an order it chooses. */
class Settle implements ChannelCommand {
  check(): boolean {
    return true;
  }
  async run(_model: ChannelModel, world: ChannelWorld): Promise<void> {
    note('settle');
    await world.scheduler.waitIdle();
    const settled = world.inflight.splice(0, world.inflight.length);
    for (const task of settled) await task;
  }
  toString(): string {
    return 'settle';
  }
}

const behaviourArb: fc.Arbitrary<Behaviour> = fc.oneof(
  fc.constant<Behaviour>({ kind: 'record' }),
  fc.constant<Behaviour>({ kind: 'echo' }),
  fc.constant<Behaviour>({ kind: 'dropNewest' }),
  fc.constant<Behaviour>({ kind: 'join' }),
  fc.constant<Behaviour>({ kind: 'fail' }),
);
const eventArb = fc.integer({ min: 1, max: ECHO - 1 });

const commandsArb = fc.commands<ChannelModel, ChannelWorld, false>(
  [
    behaviourArb.map((behaviour) => new Subscribe(behaviour)),
    eventArb.map((event) => new PublishNow(event)),
    eventArb.map((event) => new PublishLater(event)),
    fc.nat(8).map((pick) => new UnsubscribeLater(pick)),
    fc.nat(8).map((pick) => new UnsubscribeTwice(pick)),
    fc.constant(new Settle()),
  ],
  { maxCommands: 16, size: 'max' },
);

/**
 * The channel, run against a reference model.
 *
 * The record this executes is section 3.1 of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md`.
 */
describe('the channel, against a reference model', () => {
  it('delivers exactly what the model says, under generated interleavings', async () => {
    // The counterexamples this file's own packet records were observed under the
    // frozen lockfile's fast-check; a different version reorders generation.
    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');

    await fc.assert(
      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
        const world: ChannelWorld = {
          channel: createChannel<number>(),
          scheduler,
          unsubscribes: new Map(),
          order: [],
          gone: new Set(),
          hearings: [],
          thrown: new Map(),
          inflight: [],
          depth: 0,
          nextId: 0,
        };
        const model: ChannelModel = { subscribed: [], behaviours: new Map(), nextId: 0 };
        let failure: Error | null = null;
        try {
          await fc.asyncModelRun<ChannelModel, ChannelWorld, false, ChannelModel>(
            () => ({ model, real: world }),
            commands,
          );
        } catch (caught: unknown) {
          failure = caught instanceof Error ? caught : new Error(String(caught));
        }
        // Teardown runs whatever happened: every scheduled producer and disposal
        // still runs and is still checked, so a failure there is reported beside
        // an assertion failure rather than lost behind it.
        const unreported: string[] = [];
        try {
          await scheduler.waitIdle();
          for (const task of world.inflight.splice(0, world.inflight.length)) await task;
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
