import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { DirectoryApi, PersonView } from '@/lib/wbs-api';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import type { DirectorySnapshot } from '@/modules/directory-management/contract';
import { projectServicesOver } from '@/modules/project/composition';
import type { ProjectRuntime, ProjectSource } from '@/modules/project/contract';
import { fakeProjectApi } from '@/testing/fake-project-api';

import { PartialAcquisitionError } from './lifetime-slot';
import { installProjectRuntime } from './project-runtime';
import {
  createSessionOwner,
  installSessionRuntime,
  type SessionOwner,
  type SessionRuntime,
} from './session-runtime';

/** One project runtime a session built, and how often it was given back. */
interface BuiltProject {
  readonly name: string;
  readonly runtime: ProjectRuntime;
  closes: number;
}

/**
 * One session runtime the owner built, and everything the world did to it.
 *
 * Each runtime gets a client of its own, so every request and every answer is
 * attributed to the session that made it, and its people are named after its
 * own user — a directory holding anybody else's is a read that crossed a
 * switch.
 */
interface Built {
  readonly name: string;
  userId: string;
  readonly client: DirectoryApi;
  runtime: SessionRuntime | null;
  /** Requests its client received, reads and writes alike. */
  calls: number;
  /** How often its close was asked for, and whether one has finished. */
  closes: number;
  closed: boolean;
  /** What its directory held when it was built, before anybody could see it. */
  initial: DirectorySnapshot | null;
  /** What it held at the instant it was withdrawn, or `null` while it has not been. */
  frozen: DirectorySnapshot | null;
  readonly projects: BuiltProject[];
  /** Whether its installation acquires everything and then fails as a partial acquisition. */
  readonly broken: boolean;
  /** How often it was installed, and how often a failed installation was released. */
  installs: number;
  releases: number;
}

const ran: Record<string, number> = {};
function note(kind: string): void {
  ran[kind] = (ran[kind] ?? 0) + 1;
}
const COMMAND_KINDS: readonly string[] = [
  'signIn',
  'signOut',
  'answer',
  'drain',
  'read',
  'gesture',
  'openProject',
  'leaveProject',
  'signInBroken',
  'reenter',
];
const reached = {
  answerLandedAfterWithdrawal: 0,
  readByWithdrawn: 0,
  gestureByWithdrawn: 0,
  projectOpenedUnderWithdrawn: 0,
  projectCurrentAtWithdrawal: 0,
  sameUserAgain: 0,
  switchedWhileLive: 0,
  leftWhileNothingCurrent: 0,
  reenteredFromListener: 0,
  brokenInstalled: 0,
  leftAfterBroken: 0,
};

/** The reference: who the app last asked for, and how often that changed. Nothing is read back from the owner. */
interface SessionModel {
  wanted: string | null;
  /** Requests that named a user other than the one already asked for. */
  userChanges: number;
  /** Whether the user last asked for arrived with an installation that fails. */
  broken: boolean;
  /** Whether any installation has failed so far. */
  anyBroken: boolean;
}

interface SessionWorld {
  readonly owner: SessionOwner;
  readonly scheduler: fc.Scheduler;
  readonly built: Built[];
  readonly byClient: Map<DirectoryApi, Built>;
  readonly inflight: Promise<unknown>[];
  next: number;
  projectsBuilt: number;
}

/** The credential the model hands a sign-in whose installation it makes fail. */
const BROKEN = 'broken';

/** A fresh client for one runtime: every call counted, every read answered when the scheduler says. */
function clientFor(world: SessionWorld, credential: string): DirectoryApi {
  world.next += 1;
  const base = fakeDirectoryApi();
  const record: Built = {
    name: `s${String(world.next)}`,
    userId: '',
    client: base,
    runtime: null,
    calls: 0,
    closes: 0,
    closed: false,
    initial: null,
    frozen: null,
    projects: [],
    broken: credential === BROKEN,
    installs: 0,
    releases: 0,
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
  const own = (): PersonView[] => [
    { id: record.userId, name: record.userId, kind: 'person', teamIds: [] },
  ];
  const client: DirectoryApi = {
    ...base,
    listPeople: () => gate('people', () => Promise.resolve(own())),
    listTeams: () => gate('teams', () => base.listTeams()),
    listTags: () => gate('tags', () => base.listTags()),
    listServices: () => gate('services', () => base.listServices()),
    listWorkItemTypes: () => gate('types', () => base.listWorkItemTypes()),
    addTag: (name) => {
      record.calls += 1;
      return base.addTag(name);
    },
  };
  world.built.push(record);
  world.byClient.set(client, record);
  return client;
}

/** A project source over a fresh client; project reads answer at once. */
function projectSource(): ProjectSource {
  return { services: projectServicesOver(fakeProjectApi()), subscribe: undefined };
}

/** Records, at the instant before a withdrawal is asked for, what the current session held. */
function freezeTheCurrent(world: SessionWorld): void {
  for (const record of world.built) {
    const runtime = record.runtime;
    if (runtime?.isCurrent() !== true) continue;
    record.frozen = runtime.directory.snapshot();
    if (record.projects.some((project) => project.runtime.isCurrent())) {
      reached.projectCurrentAtWithdrawal += 1;
    }
  }
}

/** Every session runtime that answers that it is current. */
function currentOf(world: SessionWorld): Built[] {
  return world.built.filter((record) => record.runtime?.isCurrent() === true);
}

/** The invariants that hold at every observation point, whatever is still in flight. */
function assertOwnership(world: SessionWorld, model: SessionModel, what: string): void {
  const current = currentOf(world);
  expect(
    current.map((record) => record.name),
    `${what}: more than one session says it is current`,
  ).toHaveLength(Math.min(current.length, 1));
  const state = world.owner.snapshot();
  for (const record of current) {
    expect(
      state.status === 'live' && state.services === record.runtime,
      `${what}: ${record.name} says it is current but is not the one published`,
    ).toBe(true);
  }
  if (state.status === 'live') {
    expect(
      state.services.userId,
      `${what}: the published session is not the user last asked for`,
    ).toBe(model.wanted);
  }
  for (const record of world.built) {
    const runtime = record.runtime;
    if (runtime === null) continue;
    for (const project of record.projects) {
      if (!project.runtime.isCurrent()) continue;
      expect(
        runtime.isCurrent(),
        `${what}: ${project.name} is current while its session ${record.name} is not`,
      ).toBe(true);
    }
    if (runtime.isCurrent()) continue;
    const expected = record.frozen ?? record.initial;
    expect(
      runtime.directory.snapshot() === expected,
      `${what}: ${record.name}'s directory changed after it was withdrawn`,
    ).toBe(true);
  }
}

/** After a withdrawal: nothing of any session, or of any of its projects, is current. */
function assertWithdrawn(world: SessionWorld, what: string): void {
  expect(
    currentOf(world).map((record) => record.name),
    `${what}: a session is still current after withdrawal`,
  ).toEqual([]);
  const projects = world.built.flatMap((record) =>
    record.projects.filter((project) => project.runtime.isCurrent()),
  );
  expect(
    projects.map((project) => project.name),
    `${what}: a project is still current after its session was withdrawn`,
  ).toEqual([]);
}

type SessionCommand = fc.AsyncCommand<SessionModel, SessionWorld>;

class SignIn implements SessionCommand {
  constructor(
    readonly userId: string,
    readonly credential: string,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('signIn');
    const another = model.wanted !== this.userId;
    if (!another) reached.sameUserAgain += 1;
    if (another && world.owner.snapshot().status === 'live') reached.switchedWhileLive += 1;
    if (another) {
      freezeTheCurrent(world);
      model.userChanges += 1;
    }
    world.inflight.push(world.owner.open({ userId: this.userId, credential: this.credential }));
    model.wanted = this.userId;
    if (another) model.broken = false;
    if (another) assertWithdrawn(world, `signIn(${this.userId})`);
    assertOwnership(world, model, `signIn(${this.userId}, '${this.credential}')`);
    await Promise.resolve();
  }
  toString(): string {
    return `signIn(${this.userId}, '${this.credential}')`;
  }
}

class SignOut implements SessionCommand {
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('signOut');
    if (world.owner.snapshot().status !== 'live') reached.leftWhileNothingCurrent += 1;
    freezeTheCurrent(world);
    const before = world.built.filter((record) => record.runtime !== null);
    const leaving = world.owner.leave();
    if (model.anyBroken) reached.leftAfterBroken += 1;
    model.wanted = null;
    model.broken = false;
    assertWithdrawn(world, 'signOut');
    // A leave settles only once the retirement it joined has run: every session
    // built before it has been given back by then, however many triggers asked.
    world.inflight.push(
      leaving.then(() => {
        for (const record of before) {
          expect(record.closed, `signOut settled before ${record.name}'s retirement had run`).toBe(
            true,
          );
        }
      }),
    );
    await Promise.resolve();
  }
  toString(): string {
    return 'signOut';
  }
}

/**
 * A sign-in whose runtime cannot be built: its installation acquires the whole
 * graph and then throws a partial acquisition, whose release is recorded.
 */
class SignInBroken implements SessionCommand {
  constructor(readonly userId: string) {}
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('signInBroken');
    const another = model.wanted !== this.userId;
    if (another) {
      freezeTheCurrent(world);
      model.userChanges += 1;
    }
    world.inflight.push(world.owner.open({ userId: this.userId, credential: BROKEN }));
    if (another) {
      model.wanted = this.userId;
      model.broken = true;
      model.anyBroken = true;
      assertWithdrawn(world, `signInBroken(${this.userId})`);
    }
    assertOwnership(world, model, `signInBroken(${this.userId})`);
    await Promise.resolve();
  }
  toString(): string {
    return `signInBroken(${this.userId})`;
  }
}

/**
 * A reader that signs a user in from inside the owner's own notification — as
 * a component re-rendered by the owner's store would — the next time the owner
 * says anything.
 */
class ReenterFromListener implements SessionCommand {
  constructor(readonly userId: string) {}
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('reenter');
    let asked = false;
    const stop = world.owner.subscribe(() => {
      if (asked) return;
      asked = true;
      stop();
      reached.reenteredFromListener += 1;
      const another = model.wanted !== this.userId;
      if (another) {
        freezeTheCurrent(world);
        model.userChanges += 1;
      }
      world.inflight.push(world.owner.open({ userId: this.userId, credential: '' }));
      if (!another) return;
      model.wanted = this.userId;
      model.broken = false;
      // A failure here is carried to the teardown, which awaits it: a listener's
      // own throw would reach nobody.
      try {
        assertWithdrawn(world, `reenter(${this.userId})`);
      } catch (refusal: unknown) {
        world.inflight.push(
          Promise.reject(refusal instanceof Error ? refusal : new Error(String(refusal))),
        );
      }
    });
    await Promise.resolve();
  }
  toString(): string {
    return `reenter(${this.userId})`;
  }
}

/** One scheduled answer or step, in the order fast-check chooses. */
class Answer implements SessionCommand {
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('answer');
    if (world.scheduler.count() > 0) await world.scheduler.waitNext(1);
    else await Promise.resolve();
    assertOwnership(world, model, 'answer');
  }
  toString(): string {
    return 'answer';
  }
}

/** Every answer still out, in the order fast-check chooses: a reader who waits. */
class Drain implements SessionCommand {
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('drain');
    await world.scheduler.waitIdle();
    assertOwnership(world, model, 'drain');
  }
  toString(): string {
    return 'drain';
  }
}

/** Picks one built session whatever its state: a captured reader does not know it was left. */
function pick(world: SessionWorld, index: number): Built | null {
  const candidates = world.built.filter((record) => record.runtime !== null);
  if (candidates.length === 0) return null;
  return candidates[index % candidates.length] ?? null;
}

/** A page that kept a session's directory, and reads it now — an arrival, a focus. */
class Read implements SessionCommand {
  constructor(readonly index: number) {}
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('read');
    const record = pick(world, this.index);
    const runtime = record?.runtime ?? null;
    if (record === null || runtime === null) return;
    const withdrawn = !runtime.isCurrent();
    const before = record.calls;
    world.inflight.push(runtime.directory.read().catch(runtime.directory.reportFailedRead));
    if (withdrawn) {
      reached.readByWithdrawn += 1;
      expect(record.calls - before, `read: withdrawn ${record.name} sent a request`).toBe(0);
    }
    await Promise.resolve();
    assertOwnership(world, model, `read(${record.name})`);
  }
  toString(): string {
    return `read(${String(this.index)})`;
  }
}

/** A page that kept a session's directory, and adds a tag through it now. */
class Gesture implements SessionCommand {
  constructor(readonly index: number) {}
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('gesture');
    const record = pick(world, this.index);
    const runtime = record?.runtime ?? null;
    if (record === null || runtime === null) return;
    const withdrawn = !runtime.isCurrent();
    const before = record.calls;
    runtime.directory.addTag('legal', () => undefined);
    world.inflight.push(runtime.directory.settled());
    if (withdrawn) {
      reached.gestureByWithdrawn += 1;
      expect(record.calls - before, `gesture: withdrawn ${record.name} sent a request`).toBe(0);
    }
    await Promise.resolve();
    assertOwnership(world, model, `gesture(${record.name})`);
  }
  toString(): string {
    return `gesture(${String(this.index)})`;
  }
}

/** A project page that kept a session's project owner, and opens a project through it now. */
class OpenProject implements SessionCommand {
  constructor(
    readonly index: number,
    readonly projectId: string,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('openProject');
    const record = pick(world, this.index);
    const runtime = record?.runtime ?? null;
    if (record === null || runtime === null) return;
    if (!runtime.isCurrent()) reached.projectOpenedUnderWithdrawn += 1;
    world.inflight.push(runtime.projects.open(this.projectId, projectSource()));
    await Promise.resolve();
    assertOwnership(world, model, `openProject(${record.name}, ${this.projectId})`);
  }
  toString(): string {
    return `openProject(${String(this.index)}, ${this.projectId})`;
  }
}

/** A project page that goes: its effect leaves the session's project. */
class LeaveProject implements SessionCommand {
  constructor(readonly index: number) {}
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, world: SessionWorld): Promise<void> {
    note('leaveProject');
    const record = pick(world, this.index);
    const runtime = record?.runtime ?? null;
    if (record === null || runtime === null) return;
    world.inflight.push(runtime.projects.leave());
    await Promise.resolve();
    assertOwnership(world, model, `leaveProject(${record.name})`);
  }
  toString(): string {
    return `leaveProject(${String(this.index)})`;
  }
}

const commandsArb = fc.commands<SessionModel, SessionWorld, false>(
  [
    fc
      .tuple(fc.constantFrom('u1', 'u2'), fc.constantFrom('', 't'))
      .map(([userId, credential]) => new SignIn(userId, credential)),
    fc.constant(new SignOut()),
    fc.constant(new Answer()),
    fc.constant(new Answer()),
    fc.constant(new Drain()),
    fc.nat(6).map((index) => new Read(index)),
    fc.nat(6).map((index) => new Gesture(index)),
    fc
      .tuple(fc.nat(6), fc.constantFrom('p1', 'p2'))
      .map(([index, projectId]) => new OpenProject(index, projectId)),
    fc.nat(6).map((index) => new LeaveProject(index)),
    fc.constantFrom('u1', 'u2').map((userId) => new SignInBroken(userId)),
    fc.constantFrom('u1', 'u2').map((userId) => new ReenterFromListener(userId)),
  ],
  { maxCommands: 24, size: 'max' },
);

/**
 * The session owner, run against a reference model.
 *
 * The record this executes is section 3 of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-i-session-runtime.md`.
 */
describe('the session owner, against a reference model', () => {
  it('keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody', async () => {
    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');

    await fc.assert(
      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
        const model: SessionModel = {
          wanted: null,
          userChanges: 0,
          broken: false,
          anyBroken: false,
        };
        const world: SessionWorld = {
          owner: createSessionOwner({
            clientFor: (credential) => clientFor(world, credential),
            install: (dependencies) => {
              const record = world.byClient.get(dependencies.directoryApi);
              if (record === undefined) throw new Error('a session was installed from no client');
              record.userId = dependencies.userId;
              record.installs += 1;
              const installed = installSessionRuntime({
                ...dependencies,
                // The session's own wiring wraps this, so the project runtimes it
                // builds are the real ones, attributed to the session that built them.
                installProject: (projectDependencies) => {
                  world.projectsBuilt += 1;
                  const project = installProjectRuntime(projectDependencies);
                  const built: BuiltProject = {
                    name: `${record.name}.p${String(world.projectsBuilt)}`,
                    runtime: project.services,
                    closes: 0,
                  };
                  record.projects.push(built);
                  return {
                    services: project.services,
                    close: async (options) => {
                      built.closes += 1;
                      await project.close(options);
                    },
                  };
                },
              });
              if (record.broken) {
                reached.brokenInstalled += 1;
                // Everything was acquired, and then the construction failed: the
                // release is the real close, counted, and nothing is published.
                throw new PartialAcquisitionError(
                  new Error(`${record.name} could not be built`),
                  async (options) => {
                    record.releases += 1;
                    await installed.close(options);
                  },
                );
              }
              record.runtime = installed.services;
              record.initial = installed.services.directory.snapshot();
              // The real close, reached when the scheduler says: a retirement that
              // takes time is what opens the interval between withdrawal and
              // disposal, in which a late answer, a captured read or a gesture, or a
              // page's late project, can still arrive.
              return {
                services: installed.services,
                close: async (options) => {
                  record.closes += 1;
                  await scheduler.schedule(Promise.resolve(), `${record.name} retires`);
                  await installed.close(options);
                  record.closed = true;
                },
              };
            },
          }),
          scheduler,
          built: [],
          byClient: new Map(),
          inflight: [],
          next: 0,
          projectsBuilt: 0,
        };
        let failure: Error | null = null;
        try {
          await fc.asyncModelRun<SessionModel, SessionWorld, false, SessionModel>(
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
          assertOwnership(world, model, 'teardown');
          const state = world.owner.snapshot();
          if (model.wanted === null && model.anyBroken) {
            // A retirement asked of a slot that a failed construction left fatal
            // holds nothing and changes nothing; which request was the last to
            // build is the scheduler's choice. Either way nothing is held.
            expect(
              state.status === 'empty' || (state.status === 'fatal' && !state.terminal),
              `teardown: left after an unbuildable session, but the owner is ${state.status}`,
            ).toBe(true);
          } else if (model.wanted === null) {
            expect(state.status, 'teardown: left, but a session is still held').toBe('empty');
          } else if (model.broken) {
            expect(
              state.status === 'fatal' && !state.terminal,
              `teardown: the last user asked for cannot be built, but the owner is ${state.status}`,
            ).toBe(true);
          } else {
            expect(
              state.status === 'live' ? state.services.userId : state.status,
              'teardown: the last user asked for is not the one live',
            ).toBe(model.wanted);
          }
          const installs = world.built.reduce((sum, record) => sum + record.installs, 0);
          expect(
            installs,
            'teardown: a session was built for a user already signed in',
          ).toBeLessThanOrEqual(model.userChanges);
          const live = state.status === 'live' ? state.services : null;
          for (const record of world.built) {
            if (record.broken) {
              // Acquired, then given back by the transaction, once per installation.
              expect(
                record.releases,
                `teardown: unbuildable ${record.name} was released ${String(record.releases)} times after ${String(record.installs)} installs`,
              ).toBe(record.installs);
              continue;
            }
            if (record.runtime === null) continue;
            const isLive = record.runtime === live;
            expect(
              record.closes,
              `teardown: ${record.name} was retired ${String(record.closes)} times, live=${String(isLive)}`,
            ).toBe(isLive ? 0 : 1);
            if (isLive) continue;
            expect(
              record.runtime.projects.snapshot().status,
              `teardown: ${record.name} was retired while its project owner still held one`,
            ).not.toBe('live');
            for (const project of record.projects) {
              expect(
                project.closes,
                `teardown: ${project.name} of retired ${record.name} was given back ${String(project.closes)} times`,
              ).toBe(1);
            }
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
