import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clockOf } from '@wbs/core';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { openDatabase, openDrizzle } from '../repository/db';
import { DrizzleEventLogStore } from '../repository/event-log';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { createOptimizationRepository } from '../repository/optimization';
import { beginOptimizationDrain } from '../repository/optimization-drain';
import { ProjectRepository } from '../repository/project';
import { scheduleInputHash } from '../repository/schedule-input-hash';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { OptimizationCoordinator, type ReservedSpawnRequest } from './optimization-coordinator';
import { ProjectService } from './project.service';
import { runSolverChildLifecycle } from './solver-child-lifecycle';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const CONTRACT = '7+0.1.0';
const BUDGET = 60_000;
function sampledScheduler() {
  return fc.sample(fc.scheduler(), 1)[0];
}
const reached = new Map<string, number>();
function resetReached(): void {
  reached.clear();
}
function note(command: string): void {
  reached.set(command, (reached.get(command) ?? 0) + 1);
}
type Owner = 'blue' | 'green';
type Objective = 'pri' | 'time';
interface Row {
  readonly project_id: string;
  readonly generation: number;
  readonly objective: string;
  readonly budget_ms: number;
  readonly attempt_token: string;
  readonly owner_id: string;
  readonly input_hash: string;
  readonly message: string;
}

function inputAt(revision: number): ScheduleInput {
  return {
    rows: [{ id: 'w-1', parentId: null, position: 10, frozenNumber: null, priority: null }],
    edges: [],
    slices: [
      { workItemId: 'w-1', stepId: 'step-dev', days: 2, personId: null, width: 1, poolIds: [] },
    ],
    notBefore: new Map([['w-1', revision]]),
    poolSizes: new Map(),
    reach: 'whole-item',
    deadlines: new Map(),
  };
}

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => {
    throw new Error('unarmed deferred');
  };
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

interface Attempt {
  readonly token: string;
  readonly owner: Owner;
  readonly project: string;
  readonly generation: number;
  readonly objective: Objective;
  readonly hash: string;
  readonly epoch: number;
  readonly exit: ReturnType<typeof deferred<number>>;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly closeOut: (source: string) => void;
  readonly closeErr: () => void;
  readonly terminal: ReturnType<
    typeof deferred<{ exitCode: number; deadlineKilled: boolean; oomKilled: boolean }>
  >;
  readonly verdicts: string[];
  killed: boolean;
  exited: boolean;
}

interface Model {
  now: number;
  revision: number;
  enabled: boolean;
  generation: number;
  hash: string | null;
  epoch: number;
  readonly attempts: Map<
    string,
    {
      generation: number;
      objective: Objective;
      owner: Owner;
      epoch: number;
      phase: 'held' | 'exited';
    }
  >;
  expectedEvents: number;
  expectedCache: number;
  draining: boolean;
  recoveryOnly: boolean;
  queuedGeneration: number | null;
}

interface World {
  readonly path: string;
  readonly dir: string;
  readonly connections: Record<Owner, ReturnType<typeof openDrizzle>>;
  readonly coordinators: Record<Owner, OptimizationCoordinator>;
  readonly ticks: Record<Owner, () => void>;
  readonly attempts: Attempt[];
  readonly errors: unknown[];
  readonly pushes: unknown[];
  readonly scheduler: ReturnType<typeof sampledScheduler>;
  now: number;
  revision: number;
  nextToken: number;
  nextPid: number;
  readonly heartbeat: Map<string, ReturnType<typeof deferred<undefined>>>;
}

function rows(world: World, table: string): Row[] {
  const sql = openDatabase(world.path);
  try {
    return sql.query(`SELECT * FROM ${table}`).all() as Row[];
  } finally {
    sql.close();
  }
}

function createWorld(scheduler: ReturnType<typeof sampledScheduler>): World {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-optimization-model-'));
  const path = join(dir, 'model.db');
  runMigrations(path, FOLDER);
  const sql = openDatabase(path);
  try {
    sql.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u-1', 'owner', 'hash', 1)",
    );
    for (const project of ['p-1', 'p-2', 'p-3']) {
      sql.run(
        "INSERT INTO project (id, name, owner_id, restricted, revision, created_at, optimization_enabled, schedule_engine, schedule_objective) VALUES (?, ?, 'u-1', 0, 0, 1, 1, 'optimized', 'pri')",
        [project, project],
      );
    }
  } finally {
    sql.close();
  }
  const world: World = {
    path,
    dir,
    connections: { blue: openDrizzle(path), green: openDrizzle(path) },
    coordinators: {} as Record<Owner, OptimizationCoordinator>,
    ticks: { blue: () => undefined, green: () => undefined },
    attempts: [],
    errors: [],
    pushes: [],
    scheduler,
    now: 10,
    revision: 0,
    nextToken: 0,
    nextPid: 100,
    heartbeat: new Map(),
  };
  for (const owner of ['blue', 'green'] as const)
    world.coordinators[owner] = coordinator(world, owner);
  return world;
}

function coordinator(world: World, owner: Owner): OptimizationCoordinator {
  const db = world.connections[owner];
  return new OptimizationCoordinator({
    repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN)),
    contractVersion: CONTRACT,
    solverVersion: '0.1.0',
    budgetMs: BUDGET,
    ownerId: owner,
    now: () => world.now,
    hashInput: scheduleInputHash,
    attemptToken: () => `${owner}-${String(world.nextToken++)}`,
    inputOf: () => Promise.resolve(inputAt(world.revision)),
    enabledOf: () => Promise.resolve(true),
    spawn: (request: ReservedSpawnRequest) => {
      const exit = deferred<number>();
      const terminal = deferred<{
        exitCode: number;
        deadlineKilled: boolean;
        oomKilled: boolean;
      }>();
      let closeOut: (source: string) => void = () => {
        throw new Error('stdout not armed');
      };
      let closeErr: () => void = () => {
        throw new Error('stderr not armed');
      };
      const stdout = new ReadableStream<Uint8Array>({
        start(controller) {
          closeOut = (source) => {
            controller.enqueue(new TextEncoder().encode(source));
            controller.close();
          };
        },
      });
      const stderr = new ReadableStream<Uint8Array>({
        start(controller) {
          closeErr = () => {
            controller.close();
          };
        },
      });
      const attempt: Attempt = {
        token: request.admission.attemptToken,
        owner,
        project: request.key.projectId,
        generation: request.generation,
        objective: request.objective,
        hash: request.key.inputHash,
        epoch: request.admission.admittedCancelEpoch,
        exit,
        terminal,
        stdout,
        stderr,
        closeOut,
        closeErr,
        verdicts: [],
        killed: false,
        exited: false,
      };
      world.attempts.push(attempt);
      return Promise.resolve({
        pid: world.nextPid++,
        stdout,
        stderr,
        exited: exit.promise,
        terminal: terminal.promise,
        verdict: (verdict: 'bound' | 'abort') => {
          attempt.verdicts.push(verdict);
        },
        kill: () => {
          attempt.killed = true;
        },
      });
    },
    runChild: (options) =>
      runSolverChildLifecycle({
        ...options,
        sleep: () => {
          const heartbeat = deferred<undefined>();
          world.heartbeat.set(options.slot.attemptToken, heartbeat);
          return heartbeat.promise;
        },
      }),
    onChildError: (error) => world.errors.push(error),
    pushRecorded: (...push) => {
      world.pushes.push(push);
      return Promise.resolve();
    },
    sleep: () => Promise.resolve(),
    setInterval: (callback) => {
      world.ticks[owner] = callback;
      return { unref: () => undefined };
    },
    clearInterval: () => undefined,
  });
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
}

function assertState(model: Model, world: World, context: string): void {
  const slots = rows(world, 'solver_slot');
  const queue = rows(world, 'solver_queue');
  const cache = rows(world, 'optimized_schedule_cache');
  const events = rows(world, 'event_log').filter((row) => row.message.includes('schedule_optim'));
  const generations = rows(world, 'optimization_generation');
  expect(slots.length, `${context}: I1 project capacity`).toBeLessThanOrEqual(4);
  expect(slots.length, `${context}: I1 global capacity`).toBeLessThanOrEqual(16);
  expect(
    new Set(
      slots.map(
        (row) =>
          `${row.project_id}/${String(row.generation)}/${row.objective}/${String(row.budget_ms)}`,
      ),
    ).size,
    `${context}: I1 duplicate slot`,
  ).toBe(slots.length);
  for (const row of slots) {
    const claim = model.attempts.get(row.attempt_token);
    expect(claim, `${context}: I2 unexpected token ${row.attempt_token}`).toBeDefined();
    if (claim === undefined)
      throw new Error(`${context}: I2 unexpected token ${row.attempt_token}`);
    expect(row.owner_id, `${context}: I2 owner`).toBe(claim.owner);
    expect(row.generation, `${context}: I2 generation`).toBe(claim.generation);
    expect(row.objective, `${context}: I2 objective`).toBe(claim.objective);
    if (!model.recoveryOnly)
      expect(claim.phase, `${context}: I4 exited child retains slot`).toBe('held');
  }
  for (const attempt of world.attempts) {
    const slot = slots.find((row) => row.attempt_token === attempt.token);
    if (!attempt.exited && world.now < 60_000)
      expect(slot, `${context}: I4 premature release ${attempt.token}`).toBeDefined();
    expect(
      attempt.verdicts.filter((verdict) => verdict === 'bound').length,
      `${context}: I1 bound once`,
    ).toBeLessThanOrEqual(1);
  }
  expect(cache.length, `${context}: I3 unexpected publication`).toBe(model.expectedCache);
  expect(events.length, `${context}: I7 durable event count`).toBe(model.expectedEvents);
  expect(world.pushes.length, `${context}: I7 push count`).toBe(model.expectedEvents);
  for (const row of cache) {
    expect(row.generation, `${context}: I3 stale cache generation`).toBe(model.generation);
    if (model.hash === null) throw new Error(`${context}: I3 cache without input`);
    expect(row.input_hash, `${context}: I3 stale cache hash`).toBe(model.hash);
  }
  if (model.hash !== null && !model.draining) {
    expect(
      generations.find((row) => row.project_id === 'p-1')?.generation,
      `${context}: generation`,
    ).toBe(model.generation);
  }
  expect(queue.length, `${context}: queue bounded`).toBeLessThanOrEqual(6);
  expect(world.errors, `${context}: child error`).toEqual([]);
}

function claimNewAttempts(model: Model, world: World, context: string): void {
  const objectiveOrder: Record<Objective, number> = { pri: 0, time: 0 };
  for (const claim of model.attempts.values()) objectiveOrder[claim.objective]++;
  for (const spawned of world.attempts) {
    if (model.attempts.has(spawned.token)) continue;
    const order = objectiveOrder[spawned.objective]++;
    expect(
      spawned.generation,
      `${context}: I2 ${spawned.objective} admission ${String(order)} generation`,
    ).toBe(model.generation);
    expect(
      spawned.epoch,
      `${context}: I2 ${spawned.objective} admission ${String(order)} epoch`,
    ).toBe(model.epoch);
    model.attempts.set(spawned.token, {
      generation: model.generation,
      objective: spawned.objective,
      owner: spawned.owner,
      epoch: model.epoch,
      phase: 'held',
    });
  }
}

type Command = fc.AsyncCommand<Model, World>;

class ReadPlan implements Command {
  constructor(readonly owner: Owner) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, world: World): Promise<void> {
    note('read');
    const input = inputAt(model.revision);
    const hash = scheduleInputHash(input);
    if (model.enabled && model.hash !== hash) {
      model.generation++;
      model.hash = hash;
      model.expectedCache = 0;
    }
    world.coordinators[this.owner].readPlan({
      projectId: 'p-1',
      objective: 'pri',
      input,
      enabled: model.enabled,
    });
    await settle();
    claimNewAttempts(model, world, this.toString());
    assertState(model, world, this.toString());
  }
  toString(): string {
    return `ReadPlan(${this.owner})`;
  }
}

class BumpGeneration implements Command {
  constructor(readonly revision: number) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, world: World): Promise<void> {
    note('edit');
    model.revision = this.revision;
    world.revision = this.revision;
    await new ReadPlan('green').run(model, world);
  }
  toString(): string {
    return `BumpGeneration(${String(this.revision)})`;
  }
}

class ExitChild implements Command {
  constructor(
    readonly ordinal: number,
    readonly disposition: 'failed' | 'feasible' = 'failed',
  ) {}
  check(model: Readonly<Model>): boolean {
    return [...model.attempts.values()].some((attempt) => attempt.phase === 'held');
  }
  async run(model: Model, world: World): Promise<void> {
    note('exit');
    const open = world.attempts.filter((attempt) => !attempt.exited);
    const attempt = open[this.ordinal % open.length];
    const current =
      attempt.generation === model.generation && attempt.epoch === model.epoch && model.enabled;
    if (attempt.generation !== model.generation && attempt.hash === model.hash) note('abaExit');
    if (attempt.epoch !== model.epoch && model.enabled) note('cancelledExit');
    attempt.exited = true;
    const delivery = world.scheduler.schedule(Promise.resolve(), `exit ${attempt.token}`);
    await world.scheduler.waitNext(1);
    await delivery;
    attempt.closeOut(
      this.disposition === 'failed'
        ? ''
        : JSON.stringify({
            wireVersion: 1,
            status: 'feasible',
            offsets: { 'w-1\u0000step-dev': 0 },
            objectiveValues: {
              makespan: { value: 96, stageValue: 96, bound: 96, status: 'optimal' },
              priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
              movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
            },
          }),
    );
    attempt.closeErr();
    attempt.exit.resolve(this.disposition === 'failed' ? 1 : 0);
    attempt.terminal.resolve({
      exitCode: this.disposition === 'failed' ? 1 : 0,
      deadlineKilled: false,
      oomKilled: false,
    });
    await settle();
    // Stream EOF and terminal evidence cross Bun's stream task queue; bounded
    // zero-delay turns let that queue run without making elapsed time the oracle.
    for (let turn = 0; turn < 80; turn++) {
      if (!rows(world, 'solver_slot').some((row) => row.attempt_token === attempt.token)) break;
      await Bun.sleep(0);
    }
    if (
      !model.recoveryOnly &&
      rows(world, 'solver_slot').some((row) => row.attempt_token === attempt.token)
    )
      throw new Error(`${this.toString()}: I4 exited child retains slot ${attempt.token}`);
    await settle();
    const claim = model.attempts.get(attempt.token);
    if (claim !== undefined) claim.phase = 'exited';
    if (current) {
      model.expectedEvents++;
      model.expectedCache++;
    }
    claimNewAttempts(model, world, this.toString());
    assertState(model, world, this.toString());
  }
  toString(): string {
    return `ExitChild(${String(this.ordinal)},${this.disposition})`;
  }
}

class Toggle implements Command {
  constructor(readonly enabled: boolean) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, world: World): Promise<void> {
    note(this.enabled ? 'enable' : 'cancel');
    const service = new ProjectService({
      projects: new ProjectRepository(world.connections.green, OPEN),
      broadcast: recordingBroadcaster(),
      optimizerAvailable: () => true,
      clock: clockOf({
        now: () => world.now,
        newId: () => `settings-${String(world.nextToken++)}`,
      }),
    });
    expect(await service.update('p-1', 'u-1', { optimizationEnabled: this.enabled })).toMatchObject(
      { ok: true },
    );
    if (!this.enabled && model.hash !== null) model.epoch++;
    model.enabled = this.enabled;
    assertState(model, world, this.toString());
  }
  toString(): string {
    return this.enabled ? 'Enable' : 'Cancel';
  }
}

class HeartbeatTick implements Command {
  check(): boolean {
    return true;
  }
  async run(model: Model, world: World): Promise<void> {
    note('heartbeat');
    for (const heartbeat of world.heartbeat.values()) heartbeat.resolve(undefined);
    world.heartbeat.clear();
    await settle();
    assertState(model, world, this.toString());
  }
  toString(): string {
    return 'HeartbeatTick';
  }
}

class Pump implements Command {
  constructor(readonly owner: Owner) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, world: World): Promise<void> {
    note('pump');
    world.coordinators[this.owner].start();
    world.ticks[this.owner]();
    await settle();
    claimNewAttempts(model, world, this.toString());
    assertState(model, world, this.toString());
  }
  toString(): string {
    return `Pump(${this.owner})`;
  }
}

class Restart implements Command {
  constructor(readonly owner: Owner) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, world: World): Promise<void> {
    note('restart');
    world.coordinators[this.owner] = coordinator(world, this.owner);
    world.coordinators[this.owner].start();
    await settle();
    if (model.draining && model.now >= 200_000) {
      expect(rows(world, 'solver_slot'), `${this.toString()}: I5 expired slots`).toEqual([]);
      expect(
        rows(world, 'optimization_generation'),
        `${this.toString()}: I5 unfinished drain`,
      ).toEqual([]);
    }
    assertState(model, world, this.toString());
  }
  toString(): string {
    return `Restart(${this.owner})`;
  }
}

class BeginDrain implements Command {
  check(model: Readonly<Model>): boolean {
    return model.hash !== null;
  }
  run(model: Model, world: World): Promise<void> {
    note('drain');
    const held = rows(world, 'solver_slot').length;
    expect(
      beginOptimizationDrain(
        world.connections.green,
        'p-1',
        { at: world.now, by: 'u-1' },
        CONTRACT,
      ),
    ).toBe(held);
    model.draining = true;
    model.epoch++;
    assertState(model, world, this.toString());
    return Promise.resolve();
  }
  toString(): string {
    return 'BeginDrain';
  }
}

class AdvanceClock implements Command {
  constructor(readonly delta: number) {}
  check(): boolean {
    return true;
  }
  run(model: Model, world: World): Promise<void> {
    note('clock');
    model.now += this.delta;
    world.now += this.delta;
    assertState(model, world, this.toString());
    return Promise.resolve();
  }
  toString(): string {
    return `AdvanceClock(${String(this.delta)})`;
  }
}

class Retry implements Command {
  constructor(readonly owner: Owner) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, world: World): Promise<void> {
    note('retry');
    world.coordinators[this.owner].retry({
      projectId: 'p-1',
      objective: 'pri',
      inputHash: scheduleInputHash(inputAt(model.revision)),
      input: inputAt(model.revision),
    });
    await settle();
    claimNewAttempts(model, world, this.toString());
    assertState(model, world, this.toString());
  }
  toString(): string {
    return `Retry(${this.owner})`;
  }
}

class ExpectRecovery implements Command {
  check(): boolean {
    return true;
  }
  run(model: Model, world: World): Promise<void> {
    const resumed = world.attempts.filter(
      (attempt) => attempt.generation === model.queuedGeneration,
    );
    note('queuedRecovery');
    expect(model.queuedGeneration, 'I5 missing queued generation claim').toBe(model.generation);
    expect(
      resumed.map((attempt) => attempt.objective).sort(),
      'I5 queued objectives did not start',
    ).toEqual(['pri', 'time']);
    expect(rows(world, 'solver_queue').length, 'I5 queued work did not drain').toBe(0);
    assertState(model, world, this.toString());
    return Promise.resolve();
  }
  toString(): string {
    return 'ExpectRecovery';
  }
}

class ExpectQueued implements Command {
  check(): boolean {
    return true;
  }
  run(model: Model, world: World): Promise<void> {
    model.recoveryOnly = true;
    model.queuedGeneration = model.generation;
    expect(
      rows(world, 'solver_queue')
        .map((row) => row.objective)
        .sort(),
      'I5 queued objectives',
    ).toEqual(['pri', 'time']);
    assertState(model, world, this.toString());
    return Promise.resolve();
  }
  toString(): string {
    return 'ExpectQueued';
  }
}

async function trace(commands: Iterable<Command>, scheduler = sampledScheduler()): Promise<void> {
  const world = createWorld(scheduler);
  const model: Model = {
    now: 10,
    revision: 0,
    enabled: true,
    generation: 0,
    hash: null,
    epoch: 0,
    attempts: new Map(),
    expectedEvents: 0,
    expectedCache: 0,
    draining: false,
    recoveryOnly: false,
    queuedGeneration: null,
  };
  let failure: Error | null = null;
  try {
    await fc.asyncModelRun(() => ({ model, real: world }), commands);
  } catch (caught) {
    failure = caught instanceof Error ? caught : new Error(String(caught));
  }
  try {
    rmSync(world.dir, { recursive: true, force: true });
  } catch (caught) {
    const cleanup = caught instanceof Error ? caught : new Error(String(caught));
    if (failure !== null)
      throw new Error(`model failed: ${failure.message}; cleanup failed: ${cleanup.message}`, {
        cause: caught,
      });
    throw cleanup;
  }
  if (failure !== null) throw failure;
}

describe('OptimizationCoordinator production SQLite model', () => {
  it('fences stale generation, duplicate acquisition, cancellation and normal release', async () => {
    resetReached();
    // Proof: dropping generation equality in admissionStillCurrent writes an old A outcome; ExitChild reports I3 unexpected publication (2026-09-27).
    await trace([
      new ReadPlan('blue'),
      new ReadPlan('green'),
      new BumpGeneration(1),
      new BumpGeneration(0),
      new ExitChild(0),
    ]);
    // Proof: replacing an occupied reservation with a fresh token makes ReadPlan(green) report I4 premature release blue-0 (2026-09-27).
    await trace([new ReadPlan('blue'), new ReadPlan('green')]);
    // Proof: dropping cancel-epoch equality writes after OFF/ON; ExitChild reports I3 unexpected publication (2026-09-27).
    await trace([new ReadPlan('blue'), new Toggle(false), new Toggle(true), new ExitChild(0)]);
    await trace([
      new ReadPlan('blue'),
      new Toggle(false),
      new Toggle(true),
      new HeartbeatTick(),
      new ExitChild(0),
    ]);
    // Proof: removing normal-exit release leaves the finished token in solver_slot; ExitChild reports I4 exited child retains slot (2026-09-27).
    await trace([new ReadPlan('blue'), new ExitChild(0)]);
    await trace([new ReadPlan('blue'), new ExitChild(0, 'feasible')]);
    // Proof: suppressing startup reconciliation leaves expired slots and a drain; Restart(green) reports I5 expired slots (2026-09-27).
    await trace([
      new ReadPlan('blue'),
      new BeginDrain(),
      new AdvanceClock(200_000),
      new Restart('green'),
    ]);
    for (const boundary of ['abaExit', 'cancelledExit']) {
      expect(reached.get(boundary) ?? 0, `model never reached ${boundary}`).toBeGreaterThan(0);
    }
  }, 120_000);

  it('starts queued objectives after old-generation slots exit', async () => {
    resetReached();
    // Proof: suppressing normal-exit release retains four older slots; after
    // both exits and a pump, ExpectRecovery reports I5 queued objectives did not start.
    await trace([
      new ReadPlan('blue'),
      new BumpGeneration(1),
      new BumpGeneration(2),
      new ExpectQueued(),
      new ExitChild(0),
      new ExitChild(0),
      new Pump('green'),
      new ExpectRecovery(),
    ]);
    expect(reached.get('queuedRecovery')).toBe(1);
  }, 120_000);

  it('explores bounded command histories', async () => {
    resetReached();
    expect(fc.__version).toBe('4.9.0');
    const commands = fc.commands<Model, World, false>(
      [
        fc.constantFrom(new ReadPlan('blue'), new ReadPlan('green')),
        fc.integer({ min: 0, max: 2 }).map((revision) => new BumpGeneration(revision)),
        fc.integer({ min: 0, max: 3 }).map((ordinal) => new ExitChild(ordinal)),
        fc.constantFrom(
          new Toggle(false),
          new Toggle(true),
          new HeartbeatTick(),
          new Pump('blue'),
          new Pump('green'),
          new Retry('blue'),
          new AdvanceClock(1),
        ),
      ],
      { maxCommands: 12 },
    );
    await fc.assert(
      fc.asyncProperty(fc.scheduler(), commands, async (scheduler, history) =>
        trace(history, scheduler),
      ),
      { seed: 20260927, numRuns: 100 },
    );
    for (const command of [
      'read',
      'edit',
      'exit',
      'cancel',
      'enable',
      'heartbeat',
      'pump',
      'retry',
      'clock',
    ]) {
      expect(reached.get(command) ?? 0, `model never reached ${command}`).toBeGreaterThan(0);
    }
  }, 60_000);
});
