import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { DeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
import type { Presence } from '@/modules/plan-feed/presence-store';
import { projectServicesOver } from '@/modules/project/composition';
import type {
  ProjectRuntime,
  ProjectServices,
  ProjectSource,
  ProjectStreamHandlers,
} from '@/modules/project/contract';
import { fakeProjectApi } from '@/testing/fake-project-api';

import { createProjectOwner, installProjectRuntime, type ProjectOwner } from './project-runtime';

/**
 * One runtime the owner built, and everything the world did to it.
 *
 * Each `open` is handed a source of its own — its own fake client, its own
 * stream — so every request, every stream and every feed close is attributed to
 * the runtime that made it, which a shared client could not say.
 */
interface Built {
  readonly name: string;
  readonly projectId: string;
  /** The source this runtime was installed from, by identity. */
  services: ProjectServices | null;
  runtime: ProjectRuntime | null;
  /** Requests this runtime's client received, reads and marker writes alike. */
  calls: number;
  feedCloses: number;
  streamsOpened: number;
  streamsClosed: number;
  handlers: ProjectStreamHandlers | null;
  /** What the runtime held when it was built, before anybody could see it. */
  initial: Held | null;
  /** What it held at the instant it was withdrawn, or `null` while it has not been. */
  frozen: Held | null;
}

/** What a runtime holds that a reader sees: its delivered plan and its presence. */
interface Held {
  readonly plan: DeliveredPlan;
  readonly presence: Presence;
}

/** What a runtime holds right now. */
function heldBy(runtime: ProjectRuntime): Held {
  return { plan: runtime.plan.snapshot(), presence: runtime.presence.snapshot() };
}

const ran: Record<string, number> = {};
function note(kind: string): void {
  ran[kind] = (ran[kind] ?? 0) + 1;
}
const COMMAND_KINDS: readonly string[] = [
  'open',
  'leave',
  'answer',
  'drain',
  'frame',
  'reread',
  'mark',
];
const reached = {
  answerLandedAfterWithdrawal: 0,
  frameToWithdrawn: 0,
  rereadByWithdrawn: 0,
  markByWithdrawn: 0,
  leftWhileNothingCurrent: 0,
  reopenedTheSameProject: 0,
  switchedWhileLive: 0,
  streamOpened: 0,
};

/** The reference: what the page last asked for. Nothing here is read back from the owner. */
interface OwnerModel {
  wanted: string | null;
}

interface OwnerWorld {
  readonly owner: ProjectOwner;
  readonly scheduler: fc.Scheduler;
  readonly built: Built[];
  readonly bySource: Map<ProjectServices, Built>;
  readonly inflight: Promise<unknown>[];
  next: number;
}

/** A fresh client for one runtime: every read answers when the scheduler says. */
function sourceFor(world: OwnerWorld, projectId: string): ProjectSource {
  world.next += 1;
  const base = fakeProjectApi();
  const record: Built = {
    name: `r${String(world.next)}`,
    projectId,
    services: null,
    runtime: null,
    calls: 0,
    feedCloses: 0,
    streamsOpened: 0,
    streamsClosed: 0,
    handlers: null,
    initial: null,
    frozen: null,
  };
  const gate = <T>(route: string, answer: () => Promise<T>): Promise<T> => {
    record.calls += 1;
    return world.scheduler.schedule(answer(), `${record.name} ${route}`).then((value) => {
      if (record.runtime !== null && !record.runtime.isCurrent()) {
        reached.answerLandedAfterWithdrawal += 1;
      }
      return value;
    });
  };
  const client: typeof base = {
    ...base,
    tree: (id) => gate('tree', () => base.tree(id)),
    steps: (id) => gate('steps', () => base.steps(id)),
    listTeams: () => gate('teams', () => base.listTeams()),
    listTags: () => gate('tags', () => base.listTags()),
    listServices: () => gate('services', () => base.listServices()),
    listWorkItemTypes: () => gate('types', () => base.listWorkItemTypes()),
    listExternalSystems: () => gate('systems', () => base.listExternalSystems()),
    listPeople: () => gate('people', () => base.listPeople()),
    listCalendarMarkers: (id) => gate('markers', () => base.listCalendarMarkers(id)),
    createCalendarMarker: (id, marker) => {
      record.calls += 1;
      return base.createCalendarMarker(id, marker);
    },
  };
  const composed = projectServicesOver(client);
  const services: ProjectServices = {
    ...composed,
    planFeedFor: (reader) => {
      const feed = composed.planFeedFor(reader);
      return {
        ...feed,
        close: () => {
          record.feedCloses += 1;
          feed.close();
        },
      };
    },
  };
  record.services = services;
  world.built.push(record);
  world.bySource.set(services, record);
  return {
    services,
    subscribe: (_projectId, handlers) => {
      record.streamsOpened += 1;
      reached.streamOpened += 1;
      record.handlers = handlers;
      return {
        seen: () => undefined,
        unsubscribe: () => {
          record.streamsClosed += 1;
        },
      };
    },
  };
}

/** Records, at the instant before a transition is asked for, what the current runtime held. */
function freezeTheCurrent(world: OwnerWorld): void {
  for (const record of world.built) {
    if (record.runtime?.isCurrent() === true) {
      record.frozen = heldBy(record.runtime);
      reached.switchedWhileLive += 1;
    }
  }
}

/** The invariants that hold at every observation point, whatever is still in flight. */
function assertOwnership(world: OwnerWorld, what: string): void {
  const current = world.built.filter((record) => record.runtime?.isCurrent() === true);
  expect(
    current.map((record) => record.name),
    `${what}: more than one runtime says it is current`,
  ).toHaveLength(Math.min(current.length, 1));
  const state = world.owner.snapshot();
  for (const record of current) {
    expect(
      state.status === 'live' && state.services === record.runtime,
      `${what}: ${record.name} says it is current but is not the one published`,
    ).toBe(true);
  }
  for (const record of world.built) {
    const runtime = record.runtime;
    if (runtime === null || runtime.isCurrent()) continue;
    const expected = record.frozen ?? record.initial;
    expect(
      runtime.plan.snapshot() === expected?.plan,
      `${what}: ${record.name}'s delivered plan changed after it was withdrawn`,
    ).toBe(true);
    expect(
      runtime.presence.snapshot() === expected?.presence,
      `${what}: ${record.name}'s presence changed after it was withdrawn`,
    ).toBe(true);
  }
}

type OwnerCommand = fc.AsyncCommand<OwnerModel, OwnerWorld>;

class Open implements OwnerCommand {
  constructor(readonly projectId: string) {}
  check(): boolean {
    return true;
  }
  async run(model: OwnerModel, world: OwnerWorld): Promise<void> {
    note('open');
    if (model.wanted === this.projectId) reached.reopenedTheSameProject += 1;
    freezeTheCurrent(world);
    world.inflight.push(world.owner.open(this.projectId, sourceFor(world, this.projectId)));
    model.wanted = this.projectId;
    assertOwnership(world, `open(${this.projectId})`);
    expect(
      world.built.filter((record) => record.runtime?.isCurrent() === true),
      `open(${this.projectId}): a runtime is still current after withdrawal`,
    ).toEqual([]);
    await Promise.resolve();
  }
  toString(): string {
    return `open(${this.projectId})`;
  }
}

class Leave implements OwnerCommand {
  check(): boolean {
    return true;
  }
  async run(model: OwnerModel, world: OwnerWorld): Promise<void> {
    note('leave');
    if (world.owner.snapshot().status !== 'live') reached.leftWhileNothingCurrent += 1;
    freezeTheCurrent(world);
    world.inflight.push(world.owner.leave());
    model.wanted = null;
    expect(
      world.built.filter((record) => record.runtime?.isCurrent() === true),
      'leave: a runtime is still current after withdrawal',
    ).toEqual([]);
    await Promise.resolve();
  }
  toString(): string {
    return 'leave';
  }
}

/** One scheduled answer or step, in the order fast-check chooses. */
class Answer implements OwnerCommand {
  check(): boolean {
    return true;
  }
  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
    note('answer');
    if (world.scheduler.count() > 0) await world.scheduler.waitNext(1);
    else await Promise.resolve();
    assertOwnership(world, 'answer');
  }
  toString(): string {
    return 'answer';
  }
}

/** Every answer still out, in the order fast-check chooses: a reader who waits. */
class Drain implements OwnerCommand {
  check(): boolean {
    return true;
  }
  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
    note('drain');
    await world.scheduler.waitIdle();
    assertOwnership(world, 'drain');
  }
  toString(): string {
    return 'drain';
  }
}

/** Picks one built runtime whatever its state: a captured reader does not know it was left. */
function pick(world: OwnerWorld, index: number): Built | null {
  const candidates = world.built.filter((record) => record.runtime !== null);
  if (candidates.length === 0) return null;
  return candidates[index % candidates.length] ?? null;
}

/** What one frame on a stream says. */
type FrameKind = 'change' | 'connect' | 'disconnect' | 'presence';

/** A frame on a runtime's stream: a change to read, the connection, or who is here. */
class Frame implements OwnerCommand {
  constructor(
    readonly index: number,
    readonly kind: FrameKind,
  ) {}
  check(): boolean {
    return true;
  }
  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
    note('frame');
    const record = pick(world, this.index);
    const handlers = record?.handlers ?? null;
    if (record === null || handlers === null) return;
    if (record.runtime?.isCurrent() !== true) reached.frameToWithdrawn += 1;
    if (this.kind === 'change') handlers.onChange(null);
    else if (this.kind === 'presence') handlers.onPresence(['kat']);
    else handlers.onConnectionChange(this.kind === 'connect');
    await Promise.resolve();
    assertOwnership(world, `frame(${record.name}, ${this.kind})`);
  }
  toString(): string {
    return `frame(${String(this.index)}, ${this.kind})`;
  }
}

/** A reader that kept a runtime's reread, and calls it now. */
class Reread implements OwnerCommand {
  constructor(readonly index: number) {}
  check(): boolean {
    return true;
  }
  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
    note('reread');
    const record = pick(world, this.index);
    const runtime = record?.runtime ?? null;
    if (record === null || runtime === null) return;
    const withdrawn = !runtime.isCurrent();
    const before = record.calls;
    world.inflight.push(runtime.reread(['tree']));
    if (withdrawn) {
      reached.rereadByWithdrawn += 1;
      expect(record.calls - before, `reread: withdrawn ${record.name} sent a request`).toBe(0);
    }
    await Promise.resolve();
    assertOwnership(world, `reread(${record.name})`);
  }
  toString(): string {
    return `reread(${String(this.index)})`;
  }
}

/** A reader that kept a runtime's marker gestures, and adds a marker now. */
class Mark implements OwnerCommand {
  constructor(readonly index: number) {}
  check(): boolean {
    return true;
  }
  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
    note('mark');
    const record = pick(world, this.index);
    const runtime = record?.runtime ?? null;
    if (record === null || runtime === null) return;
    const withdrawn = !runtime.isCurrent();
    const before = record.calls;
    world.inflight.push(runtime.markers.add({ date: '2026-09-24', name: 'Launch' }));
    if (withdrawn) {
      reached.markByWithdrawn += 1;
      expect(record.calls - before, `mark: withdrawn ${record.name} sent a request`).toBe(0);
    }
    await Promise.resolve();
    assertOwnership(world, `mark(${record.name})`);
  }
  toString(): string {
    return `mark(${String(this.index)})`;
  }
}

const commandsArb = fc.commands<OwnerModel, OwnerWorld, false>(
  [
    fc.constantFrom('p1', 'p2').map((projectId) => new Open(projectId)),
    fc.constant(new Leave()),
    fc.constant(new Answer()),
    fc.constant(new Answer()),
    fc.constant(new Drain()),
    fc
      .tuple(fc.nat(6), fc.constantFrom<FrameKind>('change', 'connect', 'disconnect', 'presence'))
      .map(([index, kind]) => new Frame(index, kind)),
    fc.nat(6).map((index) => new Reread(index)),
    fc.nat(6).map((index) => new Mark(index)),
  ],
  { maxCommands: 24, size: 'max' },
);

/**
 * The project owner, run against a reference model.
 *
 * The record this executes is section 3 of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-j-project-runtime.md`.
 */
describe('the project owner, against a reference model', () => {
  it('keeps one runtime current, and nothing of a withdrawn one reaches anybody', async () => {
    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');

    await fc.assert(
      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
        const model: OwnerModel = { wanted: null };
        const world: OwnerWorld = {
          owner: createProjectOwner({
            install: (dependencies) => {
              const record = world.bySource.get(dependencies.services);
              if (record === undefined) throw new Error('a runtime was installed from no source');
              const installed = installProjectRuntime(dependencies);
              record.runtime = installed.services;
              record.initial = heldBy(installed.services);
              // The real close, reached when the scheduler says: a retirement that takes
              // time is what opens the interval between withdrawal and disposal, in which
              // a late answer, a captured reread or a marker gesture can still arrive.
              return {
                services: installed.services,
                close: async (options) => {
                  await scheduler.schedule(Promise.resolve(), `${record.name} retires`);
                  await installed.close(options);
                },
              };
            },
          }),
          scheduler,
          built: [],
          bySource: new Map(),
          inflight: [],
          next: 0,
        };
        let failure: Error | null = null;
        try {
          await fc.asyncModelRun<OwnerModel, OwnerWorld, false, OwnerModel>(
            () => ({ model, real: world }),
            commands,
          );
        } catch (caught: unknown) {
          failure = caught instanceof Error ? caught : new Error(String(caught));
        }
        // Teardown: every answer still out lands, in the scheduler's order, and the
        // settled state is checked; its failure is reported beside the property's own.
        const unreported: string[] = [];
        try {
          while (scheduler.count() > 0 || world.inflight.length > 0) {
            await scheduler.waitIdle();
            for (const task of world.inflight.splice(0, world.inflight.length)) await task;
          }
          assertOwnership(world, 'teardown');
          const state = world.owner.snapshot();
          if (model.wanted === null) {
            expect(state.status, 'teardown: left, but something is still held').toBe('empty');
          } else {
            expect(
              state.status === 'live' ? state.services.projectId : state.status,
              'teardown: the last project asked for is not the one live',
            ).toBe(model.wanted);
          }
          const live = state.status === 'live' ? state.services : null;
          for (const record of world.built) {
            if (record.runtime === null) continue;
            const isLive = record.runtime === live;
            expect(
              record.feedCloses,
              `teardown: ${record.name}'s feed closed ${String(record.feedCloses)} times, live=${String(isLive)}`,
            ).toBe(isLive ? 0 : 1);
            expect(
              record.streamsOpened,
              `teardown: ${record.name} opened two streams`,
            ).toBeLessThanOrEqual(1);
            expect(
              record.streamsClosed,
              `teardown: ${record.name}'s stream closed ${String(record.streamsClosed)} of ${String(record.streamsOpened)}, live=${String(isLive)}`,
            ).toBe(isLive ? 0 : record.streamsOpened);
          }
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
  }, 120_000);
});
