import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clockOf, type OptimizationVariantState } from '@wbs/core';
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
  return fc.sample(fc.scheduler(), { seed: 20260927, numRuns: 1 })[0];
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
  readonly contract_version: string;
  readonly generation: number;
  readonly objective: string;
  readonly budget_ms: number;
  readonly attempt_token: string;
  readonly owner_id: string;
  readonly admitted_cancel_epoch: number;
  readonly enqueued_at: number;
  readonly input_hash: string;
  readonly status: string;
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
  readonly incarnation: number;
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
      project: string;
      hash: string;
      generation: number;
      objective: Objective;
      owner: Owner;
      incarnation: number;
      epoch: number;
      startedAt: number;
      phase: 'held' | 'exited';
    }
  >;
  expectedEvents: number;
  readonly cache: Map<
    string,
    {
      project: string;
      generation: number;
      objective: Objective;
      hash: string;
      status: 'failed' | 'ready';
      createdAt: number;
    }
  >;
  readonly queue: Map<
    Objective,
    { generation: number; hash: string; epoch: number; enqueuedAt: number }
  >;
  draining: boolean;
  recoveryOnly: boolean;
  queuedGeneration: number | null;
  readonly ownerIncarnations: Record<Owner, number>;
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
  readonly completed: Map<string, ReturnType<typeof deferred<undefined>>>;
  readonly incarnations: Record<Owner, number>;
}

function scheduledAnswer<T>(world: World, label: string, answer: T): Promise<T> {
  const pending = deferred<T>();
  void world.scheduler
    .schedule(Promise.resolve(), label, undefined, async (trigger) => {
      pending.resolve(answer);
      await trigger();
    })
    .catch((error: unknown) => world.errors.push(error));
  return pending.promise;
}

function scheduleRelease(world: World, label: string, release: () => void): void {
  void world.scheduler
    .schedule(Promise.resolve(), label, undefined, async (trigger) => {
      release();
      await trigger();
    })
    .catch((error: unknown) => world.errors.push(error));
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
    for (const project of Array.from({ length: 9 }, (_, index) => `p-${String(index + 1)}`)) {
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
    completed: new Map(),
    incarnations: { blue: 0, green: 0 },
  };
  for (const owner of ['blue', 'green'] as const)
    world.coordinators[owner] = coordinator(world, owner);
  return world;
}

function coordinator(world: World, owner: Owner): OptimizationCoordinator {
  const db = world.connections[owner];
  const incarnation = world.incarnations[owner];
  return new OptimizationCoordinator({
    repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN)),
    contractVersion: CONTRACT,
    solverVersion: '0.1.0',
    budgetMs: BUDGET,
    ownerId: owner,
    now: () => world.now,
    hashInput: scheduleInputHash,
    attemptToken: () => `${owner}-${String(world.nextToken++)}`,
    inputOf: (project) =>
      scheduledAnswer(world, `input ${owner}/${project}`, inputAt(world.revision)),
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
        incarnation,
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
      return scheduledAnswer(world, `spawn ${attempt.token}`, {
        pid: world.nextPid++,
        stdout,
        stderr,
        exited: exit.promise,
        terminal: terminal.promise,
        verdict: (verdict: 'bound' | 'abort') =>
          scheduledAnswer(world, `verdict ${attempt.token}/${verdict}`, verdict).then(
            (accepted) => {
              attempt.verdicts.push(accepted);
            },
          ),
        kill: () => {
          attempt.killed = true;
        },
      });
    },
    runChild: (options) => {
      const completed = deferred<undefined>();
      world.completed.set(options.slot.attemptToken, completed);
      return runSolverChildLifecycle({
        ...options,
        sleep: () => {
          const heartbeat = deferred<undefined>();
          world.heartbeat.set(options.slot.attemptToken, heartbeat);
          return heartbeat.promise;
        },
      }).finally(() => {
        completed.resolve(undefined);
      });
    },
    onChildError: (error) => world.errors.push(error),
    pushRecorded: (...push) => {
      if (incarnation === world.incarnations[owner]) world.pushes.push(push);
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

async function answerScheduled(world: World): Promise<void> {
  await world.scheduler.waitIdle();
  await settle();
}

function assertState(model: Model, world: World, context: string): void {
  expect(world.incarnations, `${context}: owner incarnations`).toEqual(model.ownerIncarnations);
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
    expect(row.project_id, `${context}: I2 project`).toBe(claim.project);
    expect(row.contract_version, `${context}: I2 contract`).toBe(CONTRACT);
    expect(row.budget_ms, `${context}: I2 budget`).toBe(BUDGET);
    expect(row.generation, `${context}: I2 generation`).toBe(claim.generation);
    expect(row.objective, `${context}: I2 objective`).toBe(claim.objective);
    if (!model.recoveryOnly)
      expect(claim.phase, `${context}: I4 exited child retains slot`).toBe('held');
  }
  expect(
    world.attempts.map((attempt) => ({
      token: attempt.token,
      owner: attempt.owner,
      incarnation: attempt.incarnation,
      project: attempt.project,
      generation: attempt.generation,
      objective: attempt.objective,
      hash: attempt.hash,
    })),
    `${context}: I2 launch identities`,
  ).toEqual(
    [...model.attempts].map(([token, claim]) => ({
      token,
      owner: claim.owner,
      incarnation: claim.incarnation,
      project: claim.project,
      generation: claim.generation,
      objective: claim.objective,
      hash: claim.hash,
    })),
  );
  for (const attempt of world.attempts) {
    const slot = slots.find((row) => row.attempt_token === attempt.token);
    if (!attempt.exited && world.now < 60_000)
      expect(slot, `${context}: I4 premature release ${attempt.token}`).toBeDefined();
    expect(
      attempt.verdicts.filter((verdict) => verdict === 'bound').length,
      `${context}: I1 bound once`,
    ).toBeLessThanOrEqual(1);
  }
  expect(cache.length, `${context}: I3 unexpected publication`).toBe(model.cache.size);
  expect(
    cache
      .map((row) => ({
        project: row.project_id,
        generation: row.generation,
        objective: row.objective,
        hash: row.input_hash,
        status: row.status === 'ok' ? 'ready' : 'failed',
        createdAt: (row as Row & { created_at: number }).created_at,
      }))
      .sort((left, right) => left.objective.localeCompare(right.objective)),
    `${context}: I3 cache identities`,
  ).toEqual(
    [...model.cache.values()].sort((left, right) => left.objective.localeCompare(right.objective)),
  );
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
  expect(
    queue
      .map((row) => ({
        project: row.project_id,
        contract: row.contract_version,
        generation: row.generation,
        objective: row.objective,
        budget: row.budget_ms,
        epoch: row.admitted_cancel_epoch,
        enqueuedAt: row.enqueued_at,
      }))
      .sort((left, right) => left.objective.localeCompare(right.objective)),
    `${context}: queue identities`,
  ).toEqual(
    [...model.queue]
      .map(([objective, entry]) => ({
        project: 'p-1',
        contract: CONTRACT,
        generation: entry.generation,
        objective,
        budget: BUDGET,
        epoch: entry.epoch,
        enqueuedAt: entry.enqueuedAt,
      }))
      .sort((left, right) => left.objective.localeCompare(right.objective)),
  );
  expect(world.errors, `${context}: child error`).toEqual([]);
}

function predictRead(model: Model, world: World, owner: Owner, hash: string): void {
  let tokenOrdinal = world.nextToken;
  for (const objective of ['pri', 'time'] as const) {
    if (
      [...model.cache.values()].some(
        (cached) =>
          cached.generation === model.generation &&
          cached.objective === objective &&
          cached.hash === hash,
      )
    )
      continue;
    const token = `${owner}-${String(tokenOrdinal++)}`;
    if (
      [...model.attempts.values()].some(
        (attempt) =>
          attempt.phase === 'held' &&
          attempt.generation === model.generation &&
          attempt.objective === objective,
      )
    )
      continue;
    if ([...model.attempts.values()].filter((attempt) => attempt.phase === 'held').length >= 4) {
      if (!model.queue.has(objective))
        model.queue.set(objective, {
          generation: model.generation,
          hash,
          epoch: model.epoch,
          enqueuedAt: model.now,
        });
      continue;
    }
    model.attempts.set(token, {
      project: 'p-1',
      hash,
      generation: model.generation,
      objective,
      owner,
      incarnation: model.ownerIncarnations[owner],
      epoch: model.epoch,
      startedAt: model.now,
      phase: 'held',
    });
  }
}

function predictPump(model: Model, world: World, owner: Owner): void {
  let tokenOrdinal = world.nextToken;
  for (const [objective, entry] of model.queue) {
    const token = `${owner}-${String(tokenOrdinal++)}`;
    if (
      entry.generation !== model.generation ||
      entry.epoch !== model.epoch ||
      entry.hash !== model.hash
    ) {
      model.queue.delete(objective);
      continue;
    }
    if (
      [...model.attempts.values()].some(
        (attempt) =>
          attempt.phase === 'held' &&
          attempt.generation === entry.generation &&
          attempt.objective === objective,
      )
    )
      break;
    if ([...model.attempts.values()].filter((attempt) => attempt.phase === 'held').length >= 4)
      break;
    model.queue.delete(objective);
    model.attempts.set(token, {
      project: 'p-1',
      hash: entry.hash,
      generation: entry.generation,
      objective,
      owner,
      incarnation: model.ownerIncarnations[owner],
      epoch: entry.epoch,
      startedAt: Math.max(model.now, entry.enqueuedAt),
      phase: 'held',
    });
  }
}

function predictRetry(
  model: Model,
  world: World,
  owner: Owner,
): 'accepted' | 'already-running' | 'not-retryable' {
  const marker = [...model.cache.values()].find(
    (cached) =>
      cached.generation === model.generation &&
      cached.objective === 'pri' &&
      cached.hash === model.hash,
  );
  if (marker?.status !== 'failed') return 'not-retryable';
  const occupied = [...model.attempts.values()].some(
    (attempt) =>
      attempt.phase === 'held' &&
      attempt.generation === model.generation &&
      attempt.objective === 'pri',
  );
  if (occupied || model.queue.has('pri')) return 'already-running';
  if (!model.enabled || model.draining) return 'not-retryable';
  const token = `${owner}-${String(world.nextToken)}`;
  if ([...model.attempts.values()].filter((attempt) => attempt.phase === 'held').length >= 4) {
    model.queue.set('pri', {
      generation: model.generation,
      hash: marker.hash,
      epoch: model.epoch,
      enqueuedAt: Math.max(model.now, marker.createdAt + 1),
    });
  } else {
    model.attempts.set(token, {
      project: marker.project,
      hash: marker.hash,
      generation: marker.generation,
      objective: 'pri',
      owner,
      incarnation: model.ownerIncarnations[owner],
      epoch: model.epoch,
      startedAt: Math.max(model.now, marker.createdAt + 1),
      phase: 'held',
    });
  }
  return 'accepted';
}

function expectedVariant(model: Model, objective: Objective): OptimizationVariantState {
  const cached = [...model.cache.values()].find(
    (entry) =>
      entry.generation === model.generation &&
      entry.objective === objective &&
      entry.hash === model.hash,
  );
  const live =
    [...model.attempts.values()].some(
      (attempt) =>
        attempt.phase === 'held' &&
        attempt.generation === model.generation &&
        attempt.objective === objective,
    ) || model.queue.has(objective);
  if (cached?.status === 'ready') return { state: 'ready', proof: 'proven' };
  if (cached?.status === 'failed')
    return live ? { state: 'retrying' } : { state: 'failed', reason: 'internal-error' };
  return { state: live ? 'pending' : 'idle' };
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
      model.cache.clear();
      model.queue.clear();
    }
    if (model.enabled) predictRead(model, world, this.owner, hash);
    const read = world.coordinators[this.owner].readPlan({
      projectId: 'p-1',
      objective: 'pri',
      input,
      enabled: model.enabled,
    });
    await answerScheduled(world);
    expect(read.generation, `${this.toString()}: returned generation`).toBe(
      model.enabled ? model.generation : null,
    );
    expect(read.variants, `${this.toString()}: returned variants`).toEqual(
      model.enabled
        ? { pri: expectedVariant(model, 'pri'), time: expectedVariant(model, 'time') }
        : { pri: { state: 'idle' }, time: { state: 'idle' } },
    );
    if (read.variants.pri.state !== 'ready' && read.variants.time.state !== 'ready')
      expect(read.schedules, `${this.toString()}: returned schedules`).toEqual({
        pri: null,
        time: null,
      });
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
    readonly order: 'scheduled' | 'exit-first' | 'heartbeat-first' = 'scheduled',
  ) {}
  check(model: Readonly<Model>): boolean {
    return [...model.attempts.values()].some((attempt) => attempt.phase === 'held');
  }
  async run(model: Model, world: World): Promise<void> {
    note('exit');
    // A crashed incarnation's process is gone: nothing delivers its child's exit to a
    // lifecycle any more, so its slot stays counted until reclamation.
    const open = world.attempts.filter(
      (candidate) =>
        !candidate.exited && candidate.incarnation === world.incarnations[candidate.owner],
    );
    if (open.length === 0) {
      note('exitOfCrashedOwnerOnly');
      assertState(model, world, this.toString());
      return;
    }
    const attempt = open[this.ordinal % open.length];
    const current =
      attempt.generation === model.generation && attempt.epoch === model.epoch && model.enabled;
    if (attempt.generation !== model.generation && attempt.hash === model.hash) note('abaExit');
    if (attempt.epoch !== model.epoch && model.enabled) note('cancelledExit');
    attempt.exited = true;
    const claim = model.attempts.get(attempt.token);
    if (claim !== undefined) claim.phase = 'exited';
    predictPump(model, world, attempt.owner);
    let exitDelivered = false;
    let heartbeatDelivered = false;
    const heartbeat = world.heartbeat.get(attempt.token);
    const releaseHeartbeat = () => {
      if (heartbeat === undefined || attempt.incarnation !== world.incarnations[attempt.owner])
        return;
      scheduleRelease(world, `heartbeat ${attempt.token}`, () => {
        heartbeatDelivered = true;
        if (!exitDelivered) note('heartbeatBeforeExit');
        heartbeat.resolve(undefined);
        if (this.order === 'heartbeat-first') releaseExit();
      });
    };
    world.heartbeat.delete(attempt.token);
    const releaseExit = (): void => {
      scheduleRelease(world, `exit ${attempt.token}`, () => {
        exitDelivered = true;
        if (!heartbeatDelivered) note('exitBeforeHeartbeat');
        attempt.exit.resolve(this.disposition === 'failed' ? 1 : 0);
      });
    };
    scheduleRelease(world, `stdout EOF ${attempt.token}`, () => {
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
    });
    scheduleRelease(world, `stderr EOF ${attempt.token}`, attempt.closeErr);
    if (this.order === 'exit-first' || heartbeat === undefined) releaseExit();
    else if (this.order === 'heartbeat-first') releaseHeartbeat();
    else {
      releaseExit();
      releaseHeartbeat();
    }
    scheduleRelease(world, `terminal ${attempt.token}`, () => {
      attempt.terminal.resolve({
        exitCode: this.disposition === 'failed' ? 1 : 0,
        deadlineKilled: false,
        oomKilled: false,
      });
    });
    await answerScheduled(world);
    const completed = world.completed.get(attempt.token);
    if (completed === undefined) throw new Error(`${this.toString()}: lifecycle never started`);
    await completed.promise;
    await answerScheduled(world);
    if (
      !model.recoveryOnly &&
      rows(world, 'solver_slot').some((row) => row.attempt_token === attempt.token)
    )
      throw new Error(`${this.toString()}: I4 exited child retains slot ${attempt.token}`);
    if (current) {
      model.expectedEvents++;
      model.cache.set(
        `${attempt.project}/${String(attempt.generation)}/${attempt.objective}/${attempt.hash}`,
        {
          project: attempt.project,
          generation: attempt.generation,
          objective: attempt.objective,
          hash: attempt.hash,
          status: this.disposition === 'failed' ? 'failed' : 'ready',
          createdAt: Math.max(model.now, claim?.startedAt ?? model.now),
        },
      );
    }
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
    if (!this.enabled && model.enabled && model.hash !== null) model.epoch++;
    // Switching optimization OFF deletes the project's queued requests in the same
    // project-update transaction (`libs/wbs/adapters/store-sqlite/src/project.ts`).
    if (!this.enabled) model.queue.clear();
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
    for (const [token, heartbeat] of world.heartbeat) {
      const attempt = world.attempts.find((candidate) => candidate.token === token);
      if (attempt === undefined) continue;
      if (attempt.incarnation === world.incarnations[attempt.owner])
        scheduleRelease(world, `heartbeat ${token}`, () => {
          heartbeat.resolve(undefined);
        });
    }
    world.heartbeat.clear();
    await answerScheduled(world);
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
    await answerScheduled(world);
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
    const admittedDeadlines = rows(world, 'solver_slot').map(
      (row) => (row as Row & { admitted_deadline_at: number }).admitted_deadline_at,
    );
    model.ownerIncarnations[this.owner]++;
    world.incarnations[this.owner]++;
    world.coordinators[this.owner] = coordinator(world, this.owner);
    world.coordinators[this.owner].start();
    await answerScheduled(world);
    if (model.draining && admittedDeadlines.every((deadline) => model.now >= deadline)) {
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

class AdvanceToDeadline implements Command {
  check(): boolean {
    return true;
  }
  run(model: Model, world: World): Promise<void> {
    const deadlines = rows(world, 'solver_slot').map(
      (row) => (row as Row & { admitted_deadline_at: number }).admitted_deadline_at,
    );
    if (deadlines.length === 0) throw new Error('no stored admission deadline');
    const deadline = Math.max(...deadlines);
    model.now = deadline;
    world.now = deadline;
    assertState(model, world, this.toString());
    return Promise.resolve();
  }
  toString(): string {
    return 'AdvanceToDeadline';
  }
}

class Retry implements Command {
  constructor(readonly owner: Owner) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, world: World): Promise<void> {
    note('retry');
    const expected = predictRetry(model, world, this.owner);
    const decision = world.coordinators[this.owner].retry({
      projectId: 'p-1',
      objective: 'pri',
      inputHash: scheduleInputHash(inputAt(model.revision)),
      input: inputAt(model.revision),
    });
    expect(decision, `${this.toString()}: returned Retry state`).toEqual(
      expected === 'accepted'
        ? {
            kind: 'accepted',
            state: 'retrying',
            generation: model.generation,
            inputHash: scheduleInputHash(inputAt(model.revision)),
          }
        : expected === 'already-running'
          ? { kind: 'already-running' }
          : { kind: 'not-retryable', state: expectedVariant(model, 'pri').state },
    );
    await answerScheduled(world);
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
    queue: new Map(),
    expectedEvents: 0,
    cache: new Map(),
    draining: false,
    recoveryOnly: false,
    queuedGeneration: null,
    ownerIncarnations: { blue: 0, green: 0 },
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
  it('holds counted admissions while cancellation arrives before scheduled spawn answers', async () => {
    const world = createWorld(sampledScheduler());
    try {
      world.coordinators.blue.readPlan({
        projectId: 'p-1',
        objective: 'pri',
        input: inputAt(0),
        enabled: true,
      });
      expect(world.attempts).toHaveLength(2);
      expect(world.attempts.every((attempt) => attempt.verdicts.length === 0)).toBe(true);
      const service = new ProjectService({
        projects: new ProjectRepository(world.connections.green, OPEN),
        broadcast: recordingBroadcaster(),
        optimizerAvailable: () => true,
        clock: clockOf({
          now: () => world.now,
          newId: () => `settings-${String(world.nextToken++)}`,
        }),
      });
      expect(await service.update('p-1', 'u-1', { optimizationEnabled: false })).toMatchObject({
        ok: true,
      });
      note('cancellationDuringSpawn');
      await answerScheduled(world);
      expect(rows(world, 'solver_slot')).toHaveLength(2);
      expect(world.attempts.map((attempt) => attempt.verdicts)).toEqual([['bound'], ['bound']]);
      expect(reached.get('cancellationDuringSpawn') ?? 0).toBeGreaterThan(0);
    } finally {
      rmSync(world.dir, { recursive: true, force: true });
    }
  });

  it('predicts the global ceiling across nine projects before each production read', async () => {
    const world = createWorld(sampledScheduler());
    const expectedSlots: {
      project: string;
      generation: number;
      objective: Objective;
      owner: Owner;
      token: string;
    }[] = [];
    const expectedQueue: { project: string; generation: number; objective: Objective }[] = [];
    try {
      for (let index = 1; index <= 9; index++) {
        const project = `p-${String(index)}`;
        const admitted = index <= 8;
        for (const objective of ['pri', 'time'] as const) {
          const token = `blue-${String(world.nextToken + (objective === 'pri' ? 0 : 1))}`;
          if (admitted)
            expectedSlots.push({ project, generation: 1, objective, owner: 'blue', token });
          else expectedQueue.push({ project, generation: 1, objective });
        }
        const read = world.coordinators.blue.readPlan({
          projectId: project,
          objective: 'pri',
          input: inputAt(0),
          enabled: true,
        });
        expect(read.generation).toBe(1);
        expect(read.variants).toEqual({ pri: { state: 'pending' }, time: { state: 'pending' } });
        expect(read.schedules).toEqual({ pri: null, time: null });
        await answerScheduled(world);
        expect(
          rows(world, 'solver_slot').map((row) => ({
            project: row.project_id,
            generation: row.generation,
            objective: row.objective,
            owner: row.owner_id,
            token: row.attempt_token,
          })),
        ).toEqual(expectedSlots);
        expect(
          rows(world, 'solver_queue').map((row) => ({
            project: row.project_id,
            generation: row.generation,
            objective: row.objective,
          })),
        ).toEqual(expectedQueue);
        expect(
          world.attempts.map((attempt) => ({
            project: attempt.project,
            generation: attempt.generation,
            objective: attempt.objective,
            owner: attempt.owner,
            token: attempt.token,
          })),
        ).toEqual(expectedSlots);
      }
      expect(expectedSlots).toHaveLength(16);
      expect(expectedQueue).toHaveLength(2);
    } finally {
      rmSync(world.dir, { recursive: true, force: true });
    }
  });

  it('keeps a matching queue head behind a crashed owner until its stored deadline', async () => {
    const world = createWorld(sampledScheduler());
    try {
      world.coordinators.blue.readPlan({
        projectId: 'p-1',
        objective: 'pri',
        input: inputAt(0),
        enabled: true,
      });
      await answerScheduled(world);
      const original = rows(world, 'solver_slot').find((row) => row.objective === 'pri');
      if (original === undefined) throw new Error('expected blue admission');
      const repository = createOptimizationRepository(
        world.connections.green,
        new DrizzleEventLogStore(world.connections.green, OPEN),
      );
      expect(
        repository.enqueueRequest({
          projectId: 'p-1',
          contractVersion: CONTRACT,
          generation: original.generation,
          objective: 'pri',
          budgetMs: BUDGET,
          enqueuedAt: world.now,
        }),
      ).toEqual({ kind: 'queued' });
      // Blue's incarnation has crashed: none of its heartbeat, exit, pump or push
      // callbacks are delivered; its counted row remains durable.
      world.incarnations.blue++;
      world.coordinators.green.start();
      await answerScheduled(world);
      // Proof: deleting the matching head on already-present made this
      // assertion receive [] instead of ['pri'] (2026-09-27).
      expect(rows(world, 'solver_queue').map((row) => row.objective)).toEqual(['pri']);
      expect(world.attempts.filter((attempt) => attempt.owner === 'green')).toEqual([]);
      const deadline = (original as Row & { admitted_deadline_at: number }).admitted_deadline_at;
      world.now = deadline;
      world.ticks.green();
      expect(
        rows(world, 'solver_slot').some(
          (row) => row.owner_id === 'green' && row.objective === 'pri',
        ),
      ).toBe(true);
      expect(world.attempts.filter((attempt) => attempt.owner === 'green')).toEqual([]);
      note('dequeueBeforeInput');
      await answerScheduled(world);
      expect(rows(world, 'solver_queue')).toEqual([]);
      const resumed = world.attempts.filter((attempt) => attempt.owner === 'green');
      expect(resumed).toHaveLength(1);
      expect(resumed[0].token).not.toBe(original.attempt_token);
      expect(resumed[0]).toMatchObject({
        project: 'p-1',
        generation: original.generation,
        objective: 'pri',
      });
      expect(reached.get('dequeueBeforeInput') ?? 0).toBeGreaterThan(0);
    } finally {
      rmSync(world.dir, { recursive: true, force: true });
    }
  });

  it('fences stale generation, duplicate acquisition, cancellation and normal release', async () => {
    resetReached();
    // Proof: dropping generation equality in admissionStillCurrent writes an old A outcome; ExitChild reports I3 unexpected publication (2026-09-27).
    await trace([
      new ReadPlan('blue'),
      new ReadPlan('green'),
      new BumpGeneration(1),
      new BumpGeneration(0),
      new ExitChild(0, 'failed', 'exit-first'),
    ]);
    // Proof: deleting the occupied row and reserving afresh in reserveSolverSlotIn makes ReadPlan(green) report I2 unexpected token green-2 (2026-09-27).
    await trace([new ReadPlan('blue'), new ReadPlan('green')]);
    // Proof: dropping cancel-epoch equality writes after OFF/ON; ExitChild reports I3 unexpected publication (2026-09-27).
    await trace([
      new ReadPlan('blue'),
      new Toggle(false),
      new Toggle(true),
      new ExitChild(0, 'failed', 'exit-first'),
    ]);
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
    await trace([new ReadPlan('blue'), new ExitChild(0), new Retry('green'), new ExitChild(1)]);
    await trace([new ReadPlan('blue'), new Toggle(false), new Toggle(false), new Toggle(true)]);
    // OFF deletes queued requests: without clearing the model's queue on OFF this trace
    // failed its queue-identity assertion on correct production behaviour (2026-09-27).
    await trace([
      new ReadPlan('blue'),
      new BumpGeneration(1),
      new BumpGeneration(2),
      new Toggle(false),
    ]);
    // A crashed owner's child exit is never delivered; its slot stays counted.
    await trace([new ReadPlan('blue'), new Restart('blue'), new ExitChild(0)]);
    // Proof: suppressing startup reconciliation leaves expired slots and a drain; Restart(blue) reports I5 expired slots (2026-09-27).
    await trace([
      new ReadPlan('blue'),
      new BeginDrain(),
      new AdvanceToDeadline(),
      new Restart('blue'),
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
    for (const ordering of ['exitBeforeHeartbeat', 'heartbeatBeforeExit']) {
      expect(reached.get(ordering) ?? 0, `scheduler never reached ${ordering}`).toBeGreaterThan(0);
    }
  }, 60_000);
});
