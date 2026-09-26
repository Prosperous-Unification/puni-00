import { DiBag, DiBagCloseCancelledError } from 'di-bag';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import type { DirectoryApi, PersonView } from '@/lib/wbs-api';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import type { DeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
import { projectServicesOver } from '@/modules/project/composition';
import type { ProjectRuntime, ProjectServices, ProjectSource } from '@/modules/project/contract';
import { fakeProjectApi } from '@/testing/fake-project-api';

import { PartialAcquisitionError } from './lifetime-slot';
import { installProjectRuntime } from './project-runtime';
import {
  createSessionOwner,
  installSessionRuntime,
  type SessionExit,
  type SessionOwner,
  type SessionRuntime,
} from './session-runtime';

/** The retirement budget the model's owner is built with, on the fake clock. */
const BUDGET_MS = 1_000;

/** How a project's close ends: it lets go, its socket refuses, or its socket never closes. */
type CloseMode = 'settles' | 'rejects' | 'hangs';

/** One project runtime a session built, and how its retirement went. */
interface ProjectRecord {
  readonly name: string;
  readonly mode: CloseMode;
  runtime: ProjectRuntime | null;
  /** What its delivered plan held when it was built. */
  initial: DeliveredPlan | null;
  /** What it held at the instant its session was withdrawn, or `null` while it has not been. */
  frozen: DeliveredPlan | null;
  closes: number;
  /** Its close resolved: everything it held was given back. */
  given: boolean;
  /** Its close rejected, or its bounded wait expired. */
  failed: boolean;
  /** The session that asked for it. */
  readonly session: SessionRecord;
}

/** One session runtime the owner built, and everything the world did to it. */
interface SessionRecord {
  readonly name: string;
  userId: string;
  runtime: SessionRuntime | null;
  /** Requests its directory's client received. */
  calls: number;
  closes: number;
  /** Its close resolved. */
  closed: boolean;
  /** Its close rejected or outran its wait. */
  failed: boolean;
  /** Whether a request the model made has withdrawn it: another user, a log out, a leave. */
  withdrawn: boolean;
  readonly projects: ProjectRecord[];
  readonly broken: boolean;
}

/** One log out, from the moment it was asked until it settled. */
interface ExitRecord {
  readonly name: string;
  /** Every session published before it was asked: the ones it has to see retired. */
  readonly before: readonly SessionRecord[];
  settled: boolean;
  outcome: SessionExit | null;
  /**
   * Whether a sign-in was asked for while this log out's retirement was still
   * running, with no log out or leave after it yet: the log out cannot have
   * decided before that sign-in, so it must not settle signed-out.
   */
  overtaken: boolean;
  /** Whether any sign-in was asked for after this log out, whenever. */
  signInAfter: boolean;
}

const ran: Record<string, number> = {};
function note(kind: string): void {
  ran[kind] = (ran[kind] ?? 0) + 1;
}
const COMMAND_KINDS: readonly string[] = [
  'signIn',
  'signInBroken',
  'logOut',
  'reenterLogOut',
  'leave',
  'openProject',
  'read',
  'answer',
  'drain',
  'elapse',
];
const reached = {
  loggedOutWithProjectOpen: 0,
  loggedOutWhileRetiring: 0,
  loggedOutDuringSignIn: 0,
  secondLogOut: 0,
  signInDuringLogOut: 0,
  lateProjectAnswer: 0,
  readAfterWithdrawal: 0,
  logOutFatal: 0,
  projectTimedOut: 0,
  projectRejected: 0,
  reenteredLogOut: 0,
  logOutOvertaken: 0,
  logOutSignedOut: 0,
  logOutAfterBroken: 0,
};

/** The reference: who the app last asked for. Nothing is read back from the owner. */
interface ExitModel {
  wanted: string | null;
}

interface ExitWorld {
  readonly owner: SessionOwner;
  readonly scheduler: fc.Scheduler;
  readonly sessions: SessionRecord[];
  readonly byClient: Map<DirectoryApi, SessionRecord>;
  readonly bySource: Map<ProjectServices, ProjectRecord>;
  readonly exits: ExitRecord[];
  /** Every open, leave and read still out, as flags: a hung one must not hang the teardown. */
  readonly tracked: { readonly what: string; settled: boolean }[];
  /** Every failure found inside a callback, reported by the teardown. */
  readonly faults: Error[];
  /** Every close that failed and every installation that was broken. */
  failures: number;
  next: number;
}

/** The credential the model hands a sign-in whose installation it makes fail. */
const BROKEN = 'broken';

/** Carries a failure found inside a callback to the teardown, which reports it. */
function fault(world: ExitWorld, what: unknown): void {
  world.faults.push(what instanceof Error ? what : new Error(String(what)));
}

/** Follows a promise by a flag, never by awaiting it: a hung log out must not hang the model. */
function track(world: ExitWorld, what: string, running: Promise<unknown>): void {
  const entry = { what, settled: false };
  world.tracked.push(entry);
  running.then(
    () => {
      entry.settled = true;
    },
    (refusal: unknown) => {
      entry.settled = true;
      fault(world, refusal);
    },
  );
}

/** A socket whose own disposal never settles, inside a graph with a bounded close. */
function socketThatNeverCloses() {
  const socket = DiBag.createBuilder()
    .withServices({
      socket: DiBag.providerWithDisposal({
        provider: DiBag.createProvider((): string => 'open', { factoryReturnKind: 'sync-value' }),
        disposeService: () => new Promise<void>(() => undefined),
      }),
    })
    .buildContainer();
  socket.resolve('socket');
  return socket;
}

/** A fresh client for one session: every read answered when the scheduler says. */
function clientFor(world: ExitWorld, credential: string): DirectoryApi {
  world.next += 1;
  const base = fakeDirectoryApi();
  const record: SessionRecord = {
    name: `s${String(world.next)}`,
    userId: '',
    runtime: null,
    calls: 0,
    closes: 0,
    closed: false,
    failed: false,
    withdrawn: false,
    projects: [],
    broken: credential === BROKEN,
  };
  const gate = <T>(route: string, answer: () => Promise<T>): Promise<T> => {
    record.calls += 1;
    return world.scheduler.schedule(answer(), `${record.name} ${route}`);
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
  };
  world.sessions.push(record);
  world.byClient.set(client, record);
  return client;
}

/** A project source over a fresh client whose plan read answers when the scheduler says. */
function projectSource(
  world: ExitWorld,
  session: SessionRecord,
  projectId: string,
  mode: CloseMode,
): ProjectSource {
  const base = fakeProjectApi();
  const record: ProjectRecord = {
    name: `${session.name}.${projectId}.${mode}`,
    mode,
    runtime: null,
    initial: null,
    frozen: null,
    closes: 0,
    given: false,
    failed: false,
    session,
  };
  const gate = <T>(route: string, answer: () => Promise<T>): Promise<T> =>
    world.scheduler.schedule(answer(), `${record.name} ${route}`).then((value) => {
      if (session.withdrawn) reached.lateProjectAnswer += 1;
      return value;
    });
  // Only the plan's own read waits for the scheduler: it is the answer that
  // delivers a plan, and one late answer is what a withdrawn project must drop.
  const client: typeof base = { ...base, tree: (id) => gate('tree', () => base.tree(id)) };
  const services = projectServicesOver(client);
  world.bySource.set(services, record);
  return { services, subscribe: undefined };
}

/**
 * Marks every session built so far withdrawn, as the request about to be made
 * will, and records what each of their projects held at this instant.
 */
function withdrawAll(world: ExitWorld): void {
  for (const session of world.sessions) {
    if (session.runtime === null || session.withdrawn) continue;
    session.withdrawn = true;
    for (const project of session.projects) {
      if (project.runtime === null) continue;
      if (project.runtime.isCurrent()) reached.loggedOutWithProjectOpen += 1;
      project.frozen = project.runtime.plan.snapshot();
    }
  }
}

/** Requests every session's directory client has received so far. */
function callsSoFar(world: ExitWorld): number {
  return world.sessions.reduce((sum, session) => sum + session.calls, 0);
}

/** The invariants that hold at every observation point, whatever is still in flight. */
function assertExit(world: ExitWorld, what: string): void {
  for (const session of world.sessions) {
    if (!session.withdrawn) continue;
    for (const project of session.projects) {
      if (project.runtime === null) continue;
      expect(
        project.runtime.plan.snapshot() === (project.frozen ?? project.initial),
        `${what}: ${project.name}'s plan changed after its session ${session.name} was withdrawn`,
      ).toBe(true);
    }
  }
  if (world.faults.length > 0) throw world.faults[0];
}

/** Judges one log out at the moment it settled. */
function judge(world: ExitWorld, exit: ExitRecord): void {
  const failedBefore = exit.before.some(
    (session) => session.failed || session.projects.some((project) => project.failed),
  );
  if (exit.outcome === 'signed-out') {
    reached.logOutSignedOut += 1;
    for (const session of exit.before) {
      expect(
        session.closed,
        `${exit.name} settled signed-out before ${session.name} was given back`,
      ).toBe(true);
      for (const project of session.projects) {
        if (project.runtime === null) continue;
        expect(
          project.given,
          `${exit.name} settled signed-out before ${project.name} was given back`,
        ).toBe(true);
      }
    }
    expect(
      exit.overtaken,
      `${exit.name} settled signed-out though a sign-in was asked for while it retired`,
    ).toBe(false);
  }
  if (failedBefore) {
    expect(exit.outcome, `${exit.name}: a session it retired failed, yet it settled`).toBe('fatal');
  }
  if (exit.outcome === 'fatal') {
    reached.logOutFatal += 1;
    expect(world.failures, `${exit.name} settled fatal though nothing failed`).toBeGreaterThan(0);
  }
  if (exit.outcome === 'overtaken') {
    reached.logOutOvertaken += 1;
    expect(exit.signInAfter, `${exit.name} settled overtaken though nobody signed in since`).toBe(
      true,
    );
  }
}

/** Whether a log out's retirement is still running: a session it has to see go has not gone. */
function isRetiring(exit: ExitRecord): boolean {
  return !exit.settled && exit.before.some((session) => !session.closed && !session.failed);
}

/** Asks for a log out, as the account menu does, and follows it to its settlement. */
function logOut(world: ExitWorld, model: ExitModel, name: string): void {
  if (world.owner.snapshot().status === 'retiring') reached.loggedOutWhileRetiring += 1;
  if (world.exits.some((exit) => !exit.settled)) reached.secondLogOut += 1;
  if (
    model.wanted !== null &&
    world.tracked.some((entry) => !entry.settled && entry.what.startsWith('open'))
  )
    reached.loggedOutDuringSignIn += 1;
  if (world.sessions.some((session) => session.broken)) reached.logOutAfterBroken += 1;
  for (const exit of world.exits) if (!exit.settled) exit.overtaken = false;
  const before = world.sessions.filter((session) => session.runtime !== null && !session.closed);
  withdrawAll(world);
  const calls = callsSoFar(world);
  const exit: ExitRecord = {
    name,
    before,
    settled: false,
    outcome: null,
    overtaken: false,
    signInAfter: false,
  };
  world.exits.push(exit);
  const exiting = world.owner.exit();
  expect(callsSoFar(world), `${name}: the log out itself sent a request`).toBe(calls);
  model.wanted = null;
  exiting.then(
    (outcome) => {
      exit.settled = true;
      exit.outcome = outcome;
      try {
        judge(world, exit);
      } catch (refusal: unknown) {
        fault(world, refusal);
      }
    },
    (refusal: unknown) => {
      exit.settled = true;
      fault(world, refusal);
    },
  );
}

type ExitCommand = fc.AsyncCommand<ExitModel, ExitWorld>;

class SignIn implements ExitCommand {
  constructor(
    readonly userId: string,
    readonly broken: boolean,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: ExitModel, world: ExitWorld): Promise<void> {
    note(this.broken ? 'signInBroken' : 'signIn');
    const another = model.wanted !== this.userId;
    if (another) {
      for (const exit of world.exits) {
        if (!exit.settled) {
          exit.signInAfter = true;
          reached.signInDuringLogOut += 1;
        }
        if (isRetiring(exit)) exit.overtaken = true;
      }
      withdrawAll(world);
    }
    track(
      world,
      `open(${this.userId})`,
      world.owner.open({ userId: this.userId, credential: this.broken ? BROKEN : '' }),
    );
    model.wanted = this.userId;
    assertExit(world, this.toString());
    await Promise.resolve();
  }
  toString(): string {
    return this.broken ? `signInBroken(${this.userId})` : `signIn(${this.userId})`;
  }
}

class LogOut implements ExitCommand {
  check(): boolean {
    return true;
  }
  async run(model: ExitModel, world: ExitWorld): Promise<void> {
    note('logOut');
    logOut(world, model, `logOut#${String(world.exits.length + 1)}`);
    assertExit(world, 'logOut');
    await Promise.resolve();
  }
  toString(): string {
    return 'logOut';
  }
}

/**
 * A log out asked from inside the owner's own notification, the next time it
 * says anything — as a component re-rendered by the owner's store would.
 */
class ReenterLogOut implements ExitCommand {
  check(): boolean {
    return true;
  }
  async run(model: ExitModel, world: ExitWorld): Promise<void> {
    note('reenterLogOut');
    let asked = false;
    const stop = world.owner.subscribe(() => {
      if (asked) return;
      asked = true;
      stop();
      reached.reenteredLogOut += 1;
      try {
        logOut(world, model, `reenterLogOut#${String(world.exits.length + 1)}`);
      } catch (refusal: unknown) {
        fault(world, refusal);
      }
    });
    await Promise.resolve();
  }
  toString(): string {
    return 'reenterLogOut';
  }
}

/** The signed-in region going by itself: its unmount gives the session back. */
class Leave implements ExitCommand {
  check(): boolean {
    return true;
  }
  async run(model: ExitModel, world: ExitWorld): Promise<void> {
    note('leave');
    for (const exit of world.exits) if (!exit.settled) exit.overtaken = false;
    withdrawAll(world);
    track(world, 'leave', world.owner.leave());
    model.wanted = null;
    assertExit(world, 'leave');
    await Promise.resolve();
  }
  toString(): string {
    return 'leave';
  }
}

/** Picks one built session whatever its state: a captured reader does not know it was left. */
function pick(world: ExitWorld, index: number): SessionRecord | null {
  const candidates = world.sessions.filter((session) => session.runtime !== null);
  if (candidates.length === 0) return null;
  return candidates[index % candidates.length] ?? null;
}

/** A project page that kept a session's project owner, and opens a project through it now. */
class OpenProject implements ExitCommand {
  constructor(
    readonly index: number,
    readonly projectId: string,
    readonly mode: CloseMode,
  ) {}
  check(): boolean {
    return true;
  }
  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
    note('openProject');
    const session = pick(world, this.index);
    const runtime = session?.runtime ?? null;
    if (session === null || runtime === null) return;
    track(
      world,
      `project(${session.name})`,
      runtime.projects.open(
        this.projectId,
        projectSource(world, session, this.projectId, this.mode),
      ),
    );
    assertExit(world, this.toString());
    await Promise.resolve();
  }
  toString(): string {
    return `openProject(${String(this.index)}, ${this.projectId}, ${this.mode})`;
  }
}

/** A page that kept a session's directory, and reads it now — an arrival, a focus. */
class Read implements ExitCommand {
  constructor(readonly index: number) {}
  check(): boolean {
    return true;
  }
  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
    note('read');
    const session = pick(world, this.index);
    const runtime = session?.runtime ?? null;
    if (session === null || runtime === null) return;
    const before = session.calls;
    track(
      world,
      `read(${session.name})`,
      runtime.directory.read().catch(runtime.directory.reportFailedRead),
    );
    if (session.withdrawn) {
      reached.readAfterWithdrawal += 1;
      expect(session.calls - before, `read: withdrawn ${session.name} sent a request`).toBe(0);
    }
    assertExit(world, `read(${session.name})`);
    await Promise.resolve();
  }
  toString(): string {
    return `read(${String(this.index)})`;
  }
}

/** One scheduled answer or step, in the order fast-check chooses. */
class Answer implements ExitCommand {
  check(): boolean {
    return true;
  }
  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
    note('answer');
    if (world.scheduler.count() > 0) await world.scheduler.waitNext(1);
    else await Promise.resolve();
    assertExit(world, 'answer');
  }
  toString(): string {
    return 'answer';
  }
}

/** Every answer and step still out, in the order fast-check chooses: a reader who waits. */
class Drain implements ExitCommand {
  check(): boolean {
    return true;
  }
  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
    note('drain');
    await world.scheduler.waitIdle();
    assertExit(world, 'drain');
  }
  toString(): string {
    return 'drain';
  }
}

/**
 * Lets every step run and the clock pass the retirement budget, more than
 * once: a session's wait and its project's inside it. Nothing may still be
 * retiring for a log out after that.
 */
async function letBudgetsPass(world: ExitWorld): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await world.scheduler.waitIdle();
    await vi.advanceTimersByTimeAsync(BUDGET_MS + 1);
  }
  await world.scheduler.waitIdle();
}

/** The retirement budget, passed: every log out asked before it has settled. */
class Elapse implements ExitCommand {
  check(): boolean {
    return true;
  }
  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
    note('elapse');
    const asked = [...world.exits];
    await letBudgetsPass(world);
    for (const exit of asked) {
      expect(exit.settled, `elapse: ${exit.name} had not settled after the budget passed`).toBe(
        true,
      );
    }
    assertExit(world, 'elapse');
  }
  toString(): string {
    return 'elapse';
  }
}

const commandsArb = fc.commands<ExitModel, ExitWorld, false>(
  [
    fc.constantFrom('u1', 'u2').map((userId) => new SignIn(userId, false)),
    fc.constantFrom('u1', 'u2').map((userId) => new SignIn(userId, true)),
    fc.constant(new LogOut()),
    fc.constant(new LogOut()),
    fc.constant(new ReenterLogOut()),
    fc.constant(new Leave()),
    fc
      .tuple(
        fc.nat(4),
        fc.constantFrom('p1', 'p2'),
        fc.constantFrom<CloseMode>('settles', 'settles', 'rejects', 'hangs'),
      )
      .map(([index, projectId, mode]) => new OpenProject(index, projectId, mode)),
    fc.nat(4).map((index) => new Read(index)),
    fc.constant(new Answer()),
    fc.constant(new Answer()),
    fc.constant(new Drain()),
    fc.constant(new Elapse()),
  ],
  { maxCommands: 20, size: 'max' },
);

/**
 * Log out, the session owner's local exit, run against a reference model.
 *
 * The record this executes is section 3 of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-k-log-out.md`.
 */
describe('log out, against a reference model', () => {
  it('retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go', async () => {
    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      await fc.assert(
        fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
          vi.clearAllTimers();
          const model: ExitModel = { wanted: null };
          const world: ExitWorld = {
            owner: createSessionOwner({
              budgetMs: BUDGET_MS,
              clientFor: (credential) => clientFor(world, credential),
              install: (dependencies) => {
                const record = world.byClient.get(dependencies.directoryApi);
                if (record === undefined) throw new Error('a session was installed from no client');
                record.userId = dependencies.userId;
                const installed = installSessionRuntime({
                  ...dependencies,
                  // The session's own wiring wraps this, so the project runtimes are
                  // the real ones, reached through the session's own guards.
                  installProject: (projectDependencies) => {
                    const project = world.bySource.get(projectDependencies.services);
                    if (project === undefined)
                      throw new Error('a project was installed from no source');
                    const built = installProjectRuntime(projectDependencies);
                    project.runtime = built.services;
                    project.initial = built.services.plan.snapshot();
                    record.projects.push(project);
                    return {
                      services: built.services,
                      close: async (options) => {
                        project.closes += 1;
                        await scheduler.schedule(Promise.resolve(), `${project.name} retires`);
                        try {
                          await built.close(options);
                          if (project.mode === 'rejects') {
                            reached.projectRejected += 1;
                            throw new Error(`${project.name}'s socket would not close`);
                          }
                          if (project.mode === 'hangs')
                            await socketThatNeverCloses().close({
                              waitTimeoutMs: options.timeoutMs,
                            });
                        } catch (refusal: unknown) {
                          if (refusal instanceof DiBagCloseCancelledError)
                            reached.projectTimedOut += 1;
                          project.failed = true;
                          world.failures += 1;
                          throw refusal;
                        }
                        project.given = true;
                      },
                    };
                  },
                });
                if (record.broken) {
                  world.failures += 1;
                  throw new PartialAcquisitionError(
                    new Error(`${record.name} could not be built`),
                    (options) => installed.close(options),
                  );
                }
                record.runtime = installed.services;
                return {
                  services: installed.services,
                  close: async (options) => {
                    record.closes += 1;
                    await scheduler.schedule(Promise.resolve(), `${record.name} retires`);
                    try {
                      await installed.close(options);
                    } catch (refusal: unknown) {
                      record.failed = true;
                      world.failures += 1;
                      throw refusal;
                    }
                    for (const project of record.projects) {
                      if (!project.given) {
                        fault(
                          world,
                          `${record.name} was given back before its project ${project.name}`,
                        );
                      }
                    }
                    record.closed = true;
                  },
                };
              },
            }),
            scheduler,
            sessions: [],
            byClient: new Map(),
            bySource: new Map(),
            exits: [],
            tracked: [],
            faults: [],
            failures: 0,
            next: 0,
          };
          let failure: Error | null = null;
          try {
            await fc.asyncModelRun<ExitModel, ExitWorld, false, ExitModel>(
              () => ({ model, real: world }),
              commands,
            );
          } catch (caught: unknown) {
            failure = caught instanceof Error ? caught : new Error(String(caught));
          }
          // Teardown: every step runs, the clock passes the budget, and nothing
          // may be left out; its failure is reported beside the property's own.
          const unreported: string[] = [];
          try {
            await letBudgetsPass(world);
            for (const exit of world.exits) {
              expect(exit.settled, `teardown: ${exit.name} never settled`).toBe(true);
            }
            for (const entry of world.tracked) {
              expect(entry.settled, `teardown: ${entry.what} never settled`).toBe(true);
            }
            assertExit(world, 'teardown');
            const state = world.owner.snapshot();
            for (const session of world.sessions) {
              if (session.runtime === null) continue;
              const isLive = state.status === 'live' && state.services === session.runtime;
              expect(
                session.closes,
                `teardown: ${session.name} was retired ${String(session.closes)} times, live=${String(isLive)}`,
              ).toBe(isLive ? 0 : 1);
            }
          } catch (caught: unknown) {
            unreported.push(String(caught));
          }
          if (unreported.length === 0) {
            if (failure !== null) throw failure;
            return;
          }
          if (failure === null) throw new Error(`teardown refused: ${unreported.join(' | ')}`);
          throw new Error(
            `the property failed and its teardown refused: ${unreported.join(' | ')}`,
            { cause: failure },
          );
        }),
        { seed: 20260924, numRuns: 300 },
      );
    } finally {
      vi.useRealTimers();
    }

    for (const kind of COMMAND_KINDS) {
      expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
    }
    for (const [what, count] of Object.entries(reached)) {
      expect(count, `the pinned run never reached ${what}`).toBeGreaterThan(0);
    }
  }, 120_000);
});
