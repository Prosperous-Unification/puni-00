import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createPresence, type Presence, type PresenceStore } from './presence-store';

/** One report the project's stream makes: a presence frame, by pool index, or a connection change. */
type Report =
  | { readonly kind: 'users'; readonly list: number }
  | { readonly kind: 'connection'; readonly connected: boolean };

type Behaviour = 'read' | 'relay' | 'leave';

const ran: Record<string, number> = {};
function note(kind: string): void {
  ran[kind] = (ran[kind] ?? 0) + 1;
}
const COMMAND_KINDS: readonly string[] = [
  'reportNow',
  'reportLater',
  'subscribe',
  'unsubscribeLater',
  'settle',
];
const reached = {
  sameListAgain: 0,
  sameConnectionAgain: 0,
  relayedFromListener: 0,
};

/**
 * The frames a generated run reports, by identity: gw-01 sends a new list with
 * every frame, and a repeated index here is the same list object reported twice.
 */
const LISTS: readonly (readonly string[])[] = [[], ['kat'], ['kat', 'lee'], ['lee']];

/** The reference: what the header must show, and how many times it must have changed. */
interface PresenceModel {
  users: readonly string[];
  connected: boolean;
  changes: number;
  subscribed: Set<number>;
  nextListener: number;
}

interface PresenceWorld {
  readonly store: PresenceStore;
  readonly scheduler: fc.Scheduler;
  readonly model: PresenceModel;
  readonly unsubscribes: Map<number, () => void>;
  readonly gone: Set<number>;
  readonly sentinel: { heard: number };
  readonly listening: { depth: number };
  readonly inflight: Promise<void>[];
}

function listAt(index: number): readonly string[] {
  const list = LISTS.at(index % LISTS.length);
  if (list === undefined) throw new Error(`no list ${String(index)}`);
  return list;
}

function assertPresence(model: PresenceModel, snapshot: Presence, what: string): void {
  expect(snapshot.users, `${what}: users`).toBe(model.users);
  expect(snapshot.connected, `${what}: connected`).toBe(model.connected);
}

/** Applies one report to the model and the store together, and checks the stability rule around it. */
function report(world: PresenceWorld, entry: Report, what: string): void {
  const { model, store } = world;
  const before = store.snapshot();
  const changesBefore = model.changes;
  if (entry.kind === 'users') {
    const users = listAt(entry.list);
    if (users === model.users) reached.sameListAgain += 1;
    else {
      model.users = users;
      model.changes += 1;
    }
    store.reportUsers(users);
  } else {
    if (entry.connected === model.connected) reached.sameConnectionAgain += 1;
    else {
      model.connected = entry.connected;
      model.changes += 1;
    }
    store.reportConnection(entry.connected);
  }
  const after = store.snapshot();
  expect(after !== before, `${what}: a new snapshot exactly when something changed`).toBe(
    model.changes > changesBefore,
  );
  assertPresence(model, after, what);
  if (world.listening.depth === 0) {
    expect(world.sentinel.heard, `${what}: changes heard by the listener that never leaves`).toBe(
      model.changes,
    );
  }
}

function describeReport(entry: Report): string {
  return entry.kind === 'users'
    ? `users(${JSON.stringify(listAt(entry.list))})`
    : `connection(${String(entry.connected)})`;
}

function subscribeReal(world: PresenceWorld, id: number, behaviour: Behaviour, relay: Report) {
  let relayed = false;
  const unsubscribe = world.store.subscribe(() => {
    world.listening.depth += 1;
    try {
      expect(world.gone.has(id), `listener ${String(id)} was told after it left`).toBe(false);
      assertPresence(world.model, world.store.snapshot(), `listener ${String(id)}`);
      if (behaviour === 'relay' && !relayed) {
        relayed = true;
        reached.relayedFromListener += 1;
        report(world, relay, `relay from listener ${String(id)}`);
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

type PresenceCommand = fc.AsyncCommand<PresenceModel, PresenceWorld>;

class ReportNow implements PresenceCommand {
  constructor(readonly entry: Report) {}
  check(): boolean {
    return true;
  }
  async run(_model: PresenceModel, world: PresenceWorld): Promise<void> {
    note('reportNow');
    report(world, this.entry, describeReport(this.entry));
    await Promise.resolve();
  }
  toString(): string {
    return describeReport(this.entry);
  }
}

/** A frame that arrives whenever the scheduler says, possibly after one sent later. */
class ReportLater implements PresenceCommand {
  constructor(readonly entry: Report) {}
  check(): boolean {
    return true;
  }
  async run(_model: PresenceModel, world: PresenceWorld): Promise<void> {
    note('reportLater');
    const what = describeReport(this.entry);
    world.inflight.push(
      world.scheduler.schedule(Promise.resolve(), what).then(() => {
        report(world, this.entry, `later ${what}`);
      }),
    );
    await Promise.resolve();
  }
  toString(): string {
    return `later ${describeReport(this.entry)}`;
  }
}

class Subscribe implements PresenceCommand {
  constructor(
    readonly behaviour: Behaviour,
    readonly relay: Report,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: PresenceModel, world: PresenceWorld): Promise<void> {
    note('subscribe');
    const id = model.nextListener;
    model.nextListener += 1;
    model.subscribed.add(id);
    subscribeReal(world, id, this.behaviour, this.relay);
    await Promise.resolve();
  }
  toString(): string {
    return this.behaviour === 'relay'
      ? `subscribe(relay ${describeReport(this.relay)})`
      : `subscribe(${this.behaviour})`;
  }
}

class UnsubscribeLater implements PresenceCommand {
  constructor(readonly pick: number) {}
  check(model: PresenceModel): boolean {
    return model.subscribed.size > 0;
  }
  async run(model: PresenceModel, world: PresenceWorld): Promise<void> {
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

class Settle implements PresenceCommand {
  check(): boolean {
    return true;
  }
  async run(_model: PresenceModel, world: PresenceWorld): Promise<void> {
    note('settle');
    await world.scheduler.waitIdle();
    for (const task of world.inflight.splice(0, world.inflight.length)) await task;
  }
  toString(): string {
    return 'settle';
  }
}

const reportArb: fc.Arbitrary<Report> = fc.oneof(
  fc.nat(LISTS.length - 1).map((list): Report => ({ kind: 'users', list })),
  fc.boolean().map((connected): Report => ({ kind: 'connection', connected })),
);

const commandsArb = fc.commands<PresenceModel, PresenceWorld, false>(
  [
    reportArb.map((entry) => new ReportNow(entry)),
    reportArb.map((entry) => new ReportLater(entry)),
    fc
      .tuple(fc.constantFrom<Behaviour>('read', 'relay', 'leave'), reportArb)
      .map(([behaviour, relay]) => new Subscribe(behaviour, relay)),
    fc.nat(8).map((pick) => new UnsubscribeLater(pick)),
    fc.constant(new Settle()),
  ],
  { maxCommands: 16, size: 'max' },
);

/**
 * One project's presence, run against a reference model.
 *
 * The record this executes is section 3.4 of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md`.
 */
describe('a project’s presence, against a reference model', () => {
  it('shows exactly the last frame and connection, and changes only when they do', async () => {
    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');

    await fc.assert(
      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
        const store = createPresence();
        const initial = store.snapshot();
        const model: PresenceModel = {
          // The store's own starting list, by identity: nothing has been reported yet.
          users: initial.users,
          connected: false,
          changes: 0,
          subscribed: new Set(),
          nextListener: 0,
        };
        expect(initial, 'a new project’s presence').toEqual({ users: [], connected: false });
        const world: PresenceWorld = {
          store,
          scheduler,
          model,
          unsubscribes: new Map(),
          gone: new Set(),
          sentinel: { heard: 0 },
          listening: { depth: 0 },
          inflight: [],
        };
        store.subscribe(() => {
          world.sentinel.heard += 1;
        });
        let failure: Error | null = null;
        try {
          await fc.asyncModelRun<PresenceModel, PresenceWorld, false, PresenceModel>(
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
          assertPresence(model, store.snapshot(), 'teardown');
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
