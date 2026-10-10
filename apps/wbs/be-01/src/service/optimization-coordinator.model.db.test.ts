import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clockOf, type OptimizationVariantState } from '@wbs/core';
import { ProjectService } from '@wbs/core/module/project/project.resource';
import { compareSharedPeopleFanout } from '@wbs/core/service/shared-people-fanout';
import { contractVersionOf, schedule } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { createLogger } from '@wbs/observability';
import { openSqliteSource, type SqliteSource } from '@wbs/store-sqlite';
import type { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import type {
  OptimizationOutcomeWrite,
  ReservedSpawnRequest,
} from '../module/optimization/contract';
import { OptimizationCoordinator } from '../module/optimization/optimization.feature';
import { runSolverChildLifecycle } from '../module/optimization/solver-child-lifecycle';
import { openDatabase, openDrizzle } from '../repository/db';
import { DrizzleEventLogStore } from '../repository/event-log';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { createOptimizationRepository } from '../repository/optimization';
import { beginOptimizationDrain } from '../repository/optimization-drain';
import { ProjectRepository } from '../repository/project';
import { scheduleInputHash } from '../repository/schedule-input-hash';
import { buildServices } from '../services';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { sqliteDependencyGraph } from '../testing/dependency-graph-fixture';
import { optimizerWiring } from './optimizer-wiring';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const CONTRACT = '7+0.2.0';
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
type Owner = 'east' | 'west';
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
    typed: [],
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
    connections: { east: openDrizzle(path), west: openDrizzle(path) },
    coordinators: {} as Record<Owner, OptimizationCoordinator>,
    ticks: { east: () => undefined, west: () => undefined },
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
    incarnations: { east: 0, west: 0 },
  };
  for (const owner of ['east', 'west'] as const)
    world.coordinators[owner] = coordinator(world, owner);
  return world;
}

function coordinator(world: World, owner: Owner): OptimizationCoordinator {
  const db = world.connections[owner];
  const incarnation = world.incarnations[owner];
  return new OptimizationCoordinator({
    repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
    contractVersion: CONTRACT,
    solverVersion: '0.2.0',
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
    deliverCommitted: (events) => {
      if (incarnation === world.incarnations[owner]) world.pushes.push(...events);
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
    const read = await world.coordinators[this.owner].readPlan({
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
    await new ReadPlan('west').run(model, world);
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
              wireVersion: 3,
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
      dependencyGraph: sqliteDependencyGraph(
        world.connections.west,
        new ProjectRepository(world.connections.west, OPEN),
      ),
      projects: new ProjectRepository(world.connections.west, OPEN),
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
      beginOptimizationDrain(world.connections.west, 'p-1', { at: world.now, by: 'u-1' }, CONTRACT),
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
    const decision = await world.coordinators[this.owner].retry({
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
    ownerIncarnations: { east: 0, west: 0 },
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
      await world.coordinators.east.readPlan({
        projectId: 'p-1',
        objective: 'pri',
        input: inputAt(0),
        enabled: true,
      });
      expect(world.attempts).toHaveLength(2);
      expect(world.attempts.every((attempt) => attempt.verdicts.length === 0)).toBe(true);
      const service = new ProjectService({
        dependencyGraph: sqliteDependencyGraph(
          world.connections.west,
          new ProjectRepository(world.connections.west, OPEN),
        ),
        projects: new ProjectRepository(world.connections.west, OPEN),
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
          const token = `east-${String(world.nextToken + (objective === 'pri' ? 0 : 1))}`;
          if (admitted)
            expectedSlots.push({ project, generation: 1, objective, owner: 'east', token });
          else expectedQueue.push({ project, generation: 1, objective });
        }
        const read = await world.coordinators.east.readPlan({
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
      await world.coordinators.east.readPlan({
        projectId: 'p-1',
        objective: 'pri',
        input: inputAt(0),
        enabled: true,
      });
      await answerScheduled(world);
      const original = rows(world, 'solver_slot').find((row) => row.objective === 'pri');
      if (original === undefined) throw new Error('expected east admission');
      const repository = createOptimizationRepository(
        world.connections.west,
        new DrizzleEventLogStore(world.connections.west, OPEN),
        OPEN,
      );
      expect(
        await repository.enqueueRequest({
          projectId: 'p-1',
          contractVersion: CONTRACT,
          generation: original.generation,
          objective: 'pri',
          budgetMs: BUDGET,
          enqueuedAt: world.now,
        }),
      ).toEqual({ kind: 'queued' });
      // East's incarnation has crashed: none of its heartbeat, exit, pump or push
      // callbacks are delivered; its counted row remains durable.
      world.incarnations.east++;
      world.coordinators.west.start();
      await answerScheduled(world);
      // Proof: deleting the matching head on already-present made this
      // assertion receive [] instead of ['pri'] (2026-09-27).
      expect(rows(world, 'solver_queue').map((row) => row.objective)).toEqual(['pri']);
      expect(world.attempts.filter((attempt) => attempt.owner === 'west')).toEqual([]);
      const deadline = (original as Row & { admitted_deadline_at: number }).admitted_deadline_at;
      world.now = deadline;
      world.ticks.west();
      await settle();
      expect(
        rows(world, 'solver_slot').some(
          (row) => row.owner_id === 'west' && row.objective === 'pri',
        ),
      ).toBe(true);
      expect(world.attempts.filter((attempt) => attempt.owner === 'west')).toEqual([]);
      note('dequeueBeforeInput');
      await answerScheduled(world);
      expect(rows(world, 'solver_queue')).toEqual([]);
      const resumed = world.attempts.filter((attempt) => attempt.owner === 'west');
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
      new ReadPlan('east'),
      new ReadPlan('west'),
      new BumpGeneration(1),
      new BumpGeneration(0),
      new ExitChild(0, 'failed', 'exit-first'),
    ]);
    // Proof: deleting the occupied row and reserving afresh in reserveSolverSlotIn makes ReadPlan(west) report I2 unexpected token west-2 (2026-09-27).
    await trace([new ReadPlan('east'), new ReadPlan('west')]);
    // Proof: dropping cancel-epoch equality writes after OFF/ON; ExitChild reports I3 unexpected publication (2026-09-27).
    await trace([
      new ReadPlan('east'),
      new Toggle(false),
      new Toggle(true),
      new ExitChild(0, 'failed', 'exit-first'),
    ]);
    await trace([
      new ReadPlan('east'),
      new Toggle(false),
      new Toggle(true),
      new HeartbeatTick(),
      new ExitChild(0),
    ]);
    // Proof: removing normal-exit release leaves the finished token in solver_slot; ExitChild reports I4 exited child retains slot (2026-09-27).
    await trace([new ReadPlan('east'), new ExitChild(0)]);
    await trace([new ReadPlan('east'), new ExitChild(0, 'feasible')]);
    await trace([new ReadPlan('east'), new ExitChild(0), new Retry('west'), new ExitChild(1)]);
    await trace([new ReadPlan('east'), new Toggle(false), new Toggle(false), new Toggle(true)]);
    // OFF deletes queued requests: without clearing the model's queue on OFF this trace
    // failed its queue-identity assertion on correct production behaviour (2026-09-27).
    await trace([
      new ReadPlan('east'),
      new BumpGeneration(1),
      new BumpGeneration(2),
      new Toggle(false),
    ]);
    // A crashed owner's child exit is never delivered; its slot stays counted.
    await trace([new ReadPlan('east'), new Restart('east'), new ExitChild(0)]);
    // Proof: suppressing startup reconciliation leaves expired slots and a drain; Restart(east) reports I5 expired slots (2026-09-27).
    await trace([
      new ReadPlan('east'),
      new BeginDrain(),
      new AdvanceToDeadline(),
      new Restart('east'),
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
      new ReadPlan('east'),
      new BumpGeneration(1),
      new BumpGeneration(2),
      new ExpectQueued(),
      new ExitChild(0),
      new ExitChild(0),
      new Pump('west'),
      new ExpectRecovery(),
    ]);
    expect(reached.get('queuedRecovery')).toBe(1);
  }, 120_000);

  it('explores bounded command histories', async () => {
    resetReached();
    expect(fc.__version).toBe('4.9.0');
    const commands = fc.commands<Model, World, false>(
      [
        fc.constantFrom(new ReadPlan('east'), new ReadPlan('west')),
        fc.integer({ min: 0, max: 2 }).map((revision) => new BumpGeneration(revision)),
        fc.integer({ min: 0, max: 3 }).map((ordinal) => new ExitChild(ordinal)),
        fc.constantFrom(
          new Toggle(false),
          new Toggle(true),
          new HeartbeatTick(),
          new Pump('east'),
          new Pump('west'),
          new Retry('east'),
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

/**
 * The installed shared-person owners under arbitrary command interleavings.
 *
 * The world above drives the coordinator over a bare repository; this one
 * goes through `buildServices`, so readPlan observation, outcome storage,
 * Retry and the FIFO pump run inside the source-bound owners that capture
 * the organization's display and record `elsewhere_changed` before commit.
 * Projects A and B share one person in an activated shared organization.
 */
type SharedVariant = 'live' | 'shifted';

interface SharedModel {
  /** Hash of A's committed optimization generation, null before the first read. */
  generationHash: string | null;
  /** A ready selected (pri) row at the live hash whose schedule differs from Fast. */
  displayedSelected: boolean;
  /** Number of B events the model expects to be durable. */
  expectedB: number;
}

interface SharedChild {
  readonly request: ReservedSpawnRequest;
  readonly kill: () => void;
  alive: boolean;
}

interface SharedWorld {
  readonly dir: string;
  readonly path: string;
  readonly source: SqliteSource;
  readonly services: ReturnType<typeof buildServices>;
  readonly optimizer: OptimizationCoordinator;
  readonly inputs: Record<SharedVariant, ScheduleInput>;
  readonly hashes: Record<SharedVariant, string>;
  readonly pushes: { subscription: string; seq: number; message: unknown }[];
  readonly held: (() => void)[];
  readonly children: SharedChild[];
  holdB: boolean;
  omitCapture: boolean;
}

const SHARED_CONTRACT = contractVersionOf('0.2.0');
const SHARED_BUDGET = 60_000;
const ELSEWHERE_B = { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' } as const;

/** A promise that must settle within one bound; the label names the boundary it proves. */
async function within<T>(work: Promise<T>, label: string, ms = 1500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(label));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function seedSharedOrganization(path: string): void {
  const seed = openDatabase(path);
  try {
    seed.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('ada', 'ada', 'x', 1)",
    );
    seed.run(
      "INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-a', 'A', 1, 1)",
    );
    seed.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
    seed.run(
      "INSERT INTO organization_membership (organization_id, user_id, role, created_at, updated_at, created_by) VALUES ('org-a', 'ada', 'admin', 1, 1, 'ada')",
    );
    seed.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
    seed.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
    );
    for (const [index, projectId] of ['A', 'B'].entries()) {
      seed.run(
        `INSERT INTO project (id, name, owner_id, restricted, revision, created_at, start_date, estimate_rounding)
         VALUES (?, ?, 'ada', 0, 0, 1, '2026-10-05', 'exact')`,
        [projectId, projectId],
      );
      seed.run(
        "INSERT INTO project_organization (resource_id, organization_id) VALUES (?, 'org-a')",
        [projectId],
      );
      seed.run(
        "INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES (?, 'org-a', ?, 1, 'ada')",
        [projectId, index * 10],
      );
      seed.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 10)', [
        `${projectId}-step`,
        projectId,
        `${projectId}-step`,
      ]);
      seed.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
        projectId,
        projectId,
        projectId,
      ]);
      seed.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        [projectId, `${projectId}-step`],
      );
      seed.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
        projectId,
        `${projectId}-step`,
        'ana',
      ]);
    }
    seed.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = 'A'",
    );
  } finally {
    seed.close();
  }
}

async function createSharedWorld(): Promise<SharedWorld> {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-shared-owner-model-'));
  const path = join(dir, 'model.db');
  runMigrations(path, FOLDER);
  seedSharedOrganization(path);
  const source = openSqliteSource({ dbPath: path });
  const pushes: SharedWorld['pushes'] = [];
  const held: (() => void)[] = [];
  const children: SharedChild[] = [];
  const flags = { holdB: false, omitCapture: false };
  // The capture omission is the installed missing-capability case: the
  // owner must refuse with its modeled message before any generation write.
  const installed = {
    ...source,
    bindLivePlans(options: Parameters<typeof source.bindLivePlans>[0]) {
      const bound = source.bindLivePlans(options);
      return {
        ...bound,
        uow: {
          run: <T>(act: Parameters<typeof bound.uow.run<T>>[0]) =>
            bound.uow.run((scope) =>
              act(flags.omitCapture ? { ...scope, fanoutCapture: undefined } : scope),
            ),
        },
      };
    },
  };
  let pid = 9000;
  const services = buildServices({
    source: installed,
    logger: createLogger({ service: 'be-01', destination: { write: () => undefined } }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    pushFetch: (_url, init) => {
      if (typeof init?.body !== 'string') throw new Error('push body must be JSON text');
      const body = JSON.parse(init.body) as SharedWorld['pushes'][number];
      pushes.push(body);
      const answer = Response.json({ delivered_to_sockets: 0 });
      if (!flags.holdB || body.subscription !== 'project:B') return Promise.resolve(answer);
      return new Promise((resolve) => {
        held.push(() => {
          resolve(answer);
        });
      });
    },
    optimizer: {
      solverVersion: '0.2.0',
      budgetMs: SHARED_BUDGET,
      spawn: (request) => {
        let closeOut = (): void => undefined;
        let exit = (_code: number): void => undefined;
        const exited = new Promise<number>((resolve) => {
          exit = resolve;
        });
        const child: SharedChild = {
          request,
          alive: true,
          kill: () => {
            if (!child.alive) return;
            child.alive = false;
            closeOut();
            exit(137);
          },
        };
        children.push(child);
        pid += 1;
        return Promise.resolve({
          pid,
          stdout: new ReadableStream<Uint8Array>({
            start(controller) {
              closeOut = () => {
                controller.close();
              };
            },
          }),
          stderr: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close();
            },
          }),
          exited,
          verdict: () => undefined,
          kill: child.kill,
        });
      },
    },
  });
  const optimizer = services.optimizer;
  if (optimizer === undefined) throw new Error('shared model optimizer was not installed');
  const captured = await services.workItems.optimizationInput('A');
  if (captured.kind !== 'scheduled') throw new Error('shared model input unavailable');
  const live = captured.input;
  const shifted = { ...live, notBefore: new Map([['A', 50_000_000]]) };
  return {
    dir,
    path,
    source,
    services,
    optimizer,
    inputs: { live, shifted },
    hashes: { live: scheduleInputHash(live), shifted: scheduleInputHash(shifted) },
    pushes,
    held,
    children,
    get holdB() {
      return flags.holdB;
    },
    set holdB(value: boolean) {
      flags.holdB = value;
    },
    get omitCapture() {
      return flags.omitCapture;
    },
    set omitCapture(value: boolean) {
      flags.omitCapture = value;
    },
  };
}

/** The source's own connection: the one its owners and readers share. */
function clientOf(world: SharedWorld): Database {
  // Test-only: drizzle's bun-sqlite handle exposes its client for this probe.
  return (world.source.db as unknown as { $client: Database }).$client;
}

function bRows(world: SharedWorld): { seq: number; message: unknown }[] {
  const sql = openDatabase(world.path);
  try {
    return sql
      .query<{ seq: number; message: string }, []>(
        "SELECT seq, message FROM event_log WHERE subscription = 'project:B' ORDER BY seq",
      )
      .all()
      .map(({ seq, message }) => ({ seq, message: JSON.parse(message) as unknown }));
  } finally {
    sql.close();
  }
}

function committedGeneration(
  world: SharedWorld,
): { generation: number; input_hash: string } | null {
  const sql = openDatabase(world.path);
  try {
    return (
      sql
        .query<{ generation: number; input_hash: string }, [string]>(
          "SELECT generation, input_hash FROM optimization_generation WHERE project_id = 'A' AND contract_version = ?",
        )
        .get(SHARED_CONTRACT) ?? null
    );
  } finally {
    sql.close();
  }
}

function liveSlots(world: SharedWorld) {
  const sql = openDatabase(world.path);
  try {
    return sql
      .query<
        {
          generation: number;
          objective: string;
          attempt_token: string;
          owner_id: string;
          lifecycle: string;
          cancel_requested_at: number | null;
        },
        []
      >(
        "SELECT generation, objective, attempt_token, owner_id, lifecycle, cancel_requested_at FROM solver_slot WHERE project_id = 'A'",
      )
      .all();
  } finally {
    sql.close();
  }
}

/** Waits until every spawned child is bound or gone, so the next command sees a quiet store. */
async function settleShared(world: SharedWorld): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    await Bun.sleep(5);
    const slots = liveSlots(world);
    const starting = slots.some(({ lifecycle }) => lifecycle === 'starting');
    const tokens = new Set(slots.map(({ attempt_token }) => attempt_token));
    const exiting = world.children.some(
      (child) => !child.alive && tokens.has(child.request.admission.attemptToken),
    );
    if (!starting && !exiting) return;
  }
}

function captureDisplay(world: SharedWorld) {
  const bound = world.source.bindLivePlans({
    schedulerOf: (readCaptured) =>
      optimizerWiring(
        readCaptured === undefined
          ? undefined
          : {
              readCaptured,
              readLive: () => {
                throw new Error('live read inside shared model capture');
              },
            },
      ).scheduler,
    optimization: { contractVersion: SHARED_CONTRACT, budgetMs: SHARED_BUDGET, now: Date.now },
  });
  return within(
    bound.uow.run(async (scope) => {
      if (scope.fanoutCapture === undefined) throw new Error('shared model capture unavailable');
      return { commit: false, value: await scope.fanoutCapture.capture('org-a') };
    }),
    'display capture waited for a held writer',
  );
}

/**
 * The invariants every command ends on.
 *
 * (I-a)/(I-b): the B rows this command added are exactly one A-cause event at
 * the next sequence when the model expects a display change and none
 * otherwise; an independent borrowed capture must agree with the model.
 * (I-c): B sequences are contiguous from zero and each is pushed at most once.
 * (I-d): no command leaves the source connection inside a transaction.
 */
async function assertShared(
  model: SharedModel,
  world: SharedWorld,
  before: Awaited<ReturnType<typeof captureDisplay>>,
  expectChange: boolean,
  context: string,
): Promise<void> {
  const after = await captureDisplay(world);
  const recipients = compareSharedPeopleFanout({
    before: before.observation,
    after: after.observation,
    directCauses: ['A'],
  }).recipients;
  expect(
    recipients.some(({ projectId }) => projectId === 'B'),
    `${context}: independent capture disagrees with the model`,
  ).toBe(expectChange);
  if (expectChange) model.expectedB += 1;
  const rows = bRows(world);
  expect(rows, `${context}: durable B rows`).toEqual(
    Array.from({ length: model.expectedB }, (_, seq) => ({ seq, message: ELSEWHERE_B })),
  );
  const pushedB = world.pushes
    .filter(({ subscription }) => subscription === 'project:B')
    .map(({ seq }) => seq);
  expect(new Set(pushedB).size, `${context}: a B sequence pushed twice`).toBe(pushedB.length);
  expect(
    pushedB.every((seq) => seq < model.expectedB),
    `${context}: pushed a sequence with no row`,
  ).toBe(true);
  expect(clientOf(world).inTransaction, `${context}: source left inside a transaction`).toBe(false);
}

function variantOf(world: SharedWorld, hash: string): SharedVariant {
  if (hash === world.hashes.live) return 'live';
  if (hash === world.hashes.shifted) return 'shifted';
  throw new Error(`unknown model hash ${hash}`);
}

type SharedCommand = fc.AsyncCommand<SharedModel, SharedWorld>;

class SharedReadPlan implements SharedCommand {
  constructor(private readonly variant: SharedVariant) {}
  check(): boolean {
    return true;
  }
  async run(model: SharedModel, world: SharedWorld): Promise<void> {
    const before = await captureDisplay(world);
    const hash = world.hashes[this.variant];
    const advances = model.generationHash !== hash;
    const read = await within(
      world.optimizer.readPlan({
        projectId: 'A',
        objective: 'pri',
        input: world.inputs[this.variant],
        enabled: true,
      }),
      'observation decision waited for recipient transport',
    );
    await settleShared(world);
    const committed = committedGeneration(world);
    // (I-d) A read never answers a generation the store did not commit.
    expect(committed?.input_hash).toBe(hash);
    expect(read.generation).toBe(committed?.generation ?? null);
    // (I-a) Advancing past a displayed selected row evicts it: one B event.
    const expectChange = advances && model.displayedSelected;
    if (expectChange) note('sharedEvict');
    if (advances) model.displayedSelected = false;
    model.generationHash = hash;
    await assertShared(model, world, before, expectChange, this.toString());
  }
  toString(): string {
    return `ReadPlan(${this.variant})`;
  }
}

class SharedExitChild implements SharedCommand {
  constructor(
    private readonly ordinal: number,
    private readonly kind: 'ok' | 'failed' | 'kill',
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: SharedModel, world: SharedWorld): Promise<void> {
    const alive = world.children.filter((child) => child.alive);
    // An outcome is only an outcome for a current selected-objective seat, so
    // `ok` and `failed` pick among those first; `kill` takes any child.
    const current = committedGeneration(world)?.generation;
    const eligible = alive.filter(
      ({ request }) => request.objective === 'pri' && request.generation === current,
    );
    const pool = this.kind !== 'kill' && eligible.length > 0 ? eligible : alive;
    if (pool.length === 0) return;
    const child = pool[this.ordinal % pool.length];
    const before = await captureDisplay(world);
    const committed = committedGeneration(world);
    const slot = liveSlots(world).find(
      ({ attempt_token, cancel_requested_at }) =>
        attempt_token === child.request.admission.attemptToken && cancel_requested_at === null,
    );
    let expectChange = false;
    if (
      this.kind !== 'kill' &&
      slot?.objective === 'pri' &&
      committed !== null &&
      slot.generation === committed.generation
    ) {
      const input = world.inputs[variantOf(world, committed.input_hash)];
      const write: OptimizationOutcomeWrite = {
        claim: {
          projectId: 'A',
          contractVersion: SHARED_CONTRACT,
          generation: slot.generation,
          objective: 'pri',
          budgetMs: SHARED_BUDGET,
          attemptToken: slot.attempt_token,
          ownerId: slot.owner_id,
        },
        inputHash: committed.input_hash,
        admittedCancelEpoch: 0,
        outcome:
          this.kind === 'failed'
            ? { kind: 'failed', reason: 'timeout' }
            : {
                kind: 'ok',
                optimized: {
                  publication: 'solver',
                  objectiveValues: {
                    makespan: { value: 9, stageValue: 9, bound: 9, status: 'optimal' },
                    priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                    movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                  },
                  schedule: schedule(
                    input.rows,
                    input.edges,
                    input.slices,
                    new Map([['A', 3]]),
                    input.poolSizes,
                    input.reach,
                    input.deadlines,
                    input.typed,
                    undefined,
                    input.elsewhere,
                  ),
                },
              },
        now: Date.now(),
      };
      const installed = world.optimizer as unknown as {
        storeOutcome(write: OptimizationOutcomeWrite): Promise<string>;
      };
      const stored = await within(
        installed.storeOutcome(write),
        'stored outcome waited for recipient transport',
      );
      // An ok outcome at the live hash becomes A's selected display.
      if (
        stored === 'stored' &&
        this.kind === 'ok' &&
        committed.input_hash === world.hashes.live &&
        !model.displayedSelected
      ) {
        expectChange = true;
        model.displayedSelected = true;
        note('sharedStore');
      }
    }
    child.kill();
    await settleShared(world);
    await assertShared(model, world, before, expectChange, this.toString());
  }
  toString(): string {
    return `ExitChild(${String(this.ordinal)}, ${this.kind})`;
  }
}

class SharedRetry implements SharedCommand {
  check(): boolean {
    return true;
  }
  async run(model: SharedModel, world: SharedWorld): Promise<void> {
    const committed = committedGeneration(world);
    if (committed === null) return;
    const before = await captureDisplay(world);
    const retried = await within(
      world.optimizer.retry({
        projectId: 'A',
        objective: 'pri',
        inputHash: committed.input_hash,
        input: world.inputs[variantOf(world, committed.input_hash)],
        scoped: { organizationId: 'org-a', actorId: 'ada' },
      }),
      'Retry decision waited for recipient transport',
    );
    note(`sharedRetry:${retried.kind}`);
    await settleShared(world);
    // Retry replaces a failure marker: status only, never a display change.
    await assertShared(model, world, before, false, this.toString());
  }
  toString(): string {
    return 'Retry';
  }
}

class SharedPump implements SharedCommand {
  check(): boolean {
    return true;
  }
  async run(model: SharedModel, world: SharedWorld): Promise<void> {
    const before = await captureDisplay(world);
    const pump = world.optimizer as unknown as { pumpQueue(): Promise<void> };
    await within(pump.pumpQueue(), 'FIFO pump waited for recipient transport');
    await settleShared(world);
    // A dequeue reserves seats; with B never optimized it changes no display.
    await assertShared(model, world, before, false, this.toString());
  }
  toString(): string {
    return 'Pump';
  }
}

class HoldPush implements SharedCommand {
  check(): boolean {
    return true;
  }
  run(_model: SharedModel, world: SharedWorld): Promise<void> {
    world.holdB = true;
    return Promise.resolve();
  }
  toString(): string {
    return 'HoldPush';
  }
}

class ReleasePush implements SharedCommand {
  check(): boolean {
    return true;
  }
  async run(model: SharedModel, world: SharedWorld): Promise<void> {
    world.holdB = false;
    for (const release of world.held.splice(0)) release();
    await Bun.sleep(5);
    const before = await captureDisplay(world);
    await assertShared(model, world, before, false, this.toString());
  }
  toString(): string {
    return 'ReleasePush';
  }
}

class SecondWriter implements SharedCommand {
  check(): boolean {
    return true;
  }
  async run(model: SharedModel, world: SharedWorld): Promise<void> {
    const before = await captureDisplay(world);
    const second = openDatabase(world.path);
    try {
      second.run('PRAGMA busy_timeout = 50');
      // A rename changes no scheduling fact, so it is also a silent control.
      second.run("UPDATE project SET name = 'second writer' WHERE id = 'B'");
    } finally {
      second.close();
    }
    await assertShared(model, world, before, false, this.toString());
  }
  toString(): string {
    return 'SecondWriter';
  }
}

class HeldWriterRead implements SharedCommand {
  check(model: Readonly<SharedModel>): boolean {
    return model.generationHash !== null;
  }
  async run(model: SharedModel, world: SharedWorld): Promise<void> {
    const hash = model.generationHash;
    if (hash === null) return;
    const before = await captureDisplay(world);
    const staged = deferred<undefined>();
    const release = deferred<undefined>();
    const bound = world.source.bindLivePlans({
      schedulerOf: () => optimizerWiring(undefined).scheduler,
      optimization: { contractVersion: SHARED_CONTRACT, budgetMs: SHARED_BUDGET, now: Date.now },
    });
    // Another owner of the same source stages generation + 100 and rolls back.
    const holding = bound.uow.run(() => {
      clientOf(world).run(
        "UPDATE optimization_generation SET generation = generation + 100 WHERE project_id = 'A'",
      );
      staged.resolve(undefined);
      return release.promise.then(() => ({ commit: false, value: undefined }));
    });
    await staged.promise;
    note('sharedHeldWriter');
    const reading = world.optimizer.readPlan({
      projectId: 'A',
      objective: 'pri',
      input: world.inputs[variantOf(world, hash)],
      enabled: true,
    });
    await Bun.sleep(5);
    release.resolve(undefined);
    await holding;
    const read = await within(reading, 'held-writer read did not settle');
    await settleShared(world);
    const committed = committedGeneration(world);
    // (I-d) The staged generation rolled back; the read must not report it.
    expect(
      read.generation ?? -1,
      `read answered generation ${String(read.generation)} over committed ${String(committed?.generation)}`,
    ).toBeLessThanOrEqual(committed?.generation ?? -1);
    await assertShared(model, world, before, false, this.toString());
  }
  toString(): string {
    return 'HeldWriterRead';
  }
}

class DropCaptureRead implements SharedCommand {
  check(): boolean {
    return true;
  }
  async run(model: SharedModel, world: SharedWorld): Promise<void> {
    const before = await captureDisplay(world);
    const generation = committedGeneration(world);
    const variant: SharedVariant = model.generationHash === world.hashes.live ? 'shifted' : 'live';
    world.omitCapture = true;
    let refusal: unknown;
    try {
      await within(
        world.optimizer.readPlan({
          projectId: 'A',
          objective: 'pri',
          input: world.inputs[variant],
          enabled: true,
        }),
        'missing-capture read did not settle',
      );
    } catch (caught) {
      refusal = caught;
    } finally {
      world.omitCapture = false;
    }
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toBe(
      'optimization observation lacks borrowed ownership and capture',
    );
    expect(committedGeneration(world)).toEqual(generation);
    await assertShared(model, world, before, false, this.toString());
  }
  toString(): string {
    return 'DropCaptureRead';
  }
}

async function sharedTrace(commands: Iterable<SharedCommand>): Promise<void> {
  const world = await createSharedWorld();
  const model: SharedModel = { generationHash: null, displayedSelected: false, expectedB: 0 };
  let failure: Error | null = null;
  try {
    await fc.asyncModelRun(() => ({ model, real: world }), commands);
  } catch (caught) {
    failure =
      caught instanceof Error
        ? caught
        : new Error('shared model threw a non-Error', { cause: caught });
  }
  world.holdB = false;
  for (const release of world.held.splice(0)) release();
  for (const child of world.children) child.kill();
  try {
    await within(world.optimizer.stop(), 'shared model optimizer did not stop', 5000);
    await world.source.close();
  } finally {
    rmSync(world.dir, { recursive: true, force: true });
  }
  if (failure !== null) throw failure;
}

describe('installed shared-person owners model', () => {
  it('records one A-cause event when a stored selected display is evicted', async () => {
    // Proof (2026-10-11): reusing the observation owner's `before` capture as
    // `after` failed this trace at `ReadPlan(shifted): durable B rows` (the
    // eviction row absent); delivering inside either owner failed it at
    // `a B sequence pushed twice`.
    await sharedTrace([
      new SharedReadPlan('live'),
      new SharedExitChild(0, 'ok'),
      new SharedReadPlan('shifted'),
      new SharedReadPlan('live'),
    ]);
  }, 30_000);

  it('commits outcome and observation before held recipient transport', async () => {
    // Proof (2026-10-11): awaiting delivery inside the outcome owner failed at
    // `stored outcome waited for recipient transport`; inside the observation
    // owner, at `observation decision waited for recipient transport`.
    await sharedTrace([
      new HoldPush(),
      new SharedReadPlan('live'),
      new SharedExitChild(0, 'ok'),
      new SecondWriter(),
      new SharedReadPlan('shifted'),
      new SecondWriter(),
      new ReleasePush(),
    ]);
  }, 30_000);

  it('refuses a missing capture with its modeled message', async () => {
    // Proof (2026-10-11): removing the observation owner's capability guard
    // answered `undefined is not an object (evaluating
    // 'capture.resolveLifecycleOwner')` instead of the modeled refusal.
    await sharedTrace([new SharedReadPlan('live'), new DropCaptureRead()]);
  }, 30_000);

  it('never answers a generation a held writer staged and rolled back', async () => {
    // Proof (2026-10-11): observing before the owner's source turn read the
    // held writer's staged row: `read answered generation 101 over committed 1`.
    await sharedTrace([new SharedReadPlan('live'), new HeldWriterRead()]);
  }, 30_000);

  it('explores bounded shared command histories', async () => {
    // Proof (2026-10-11): under each of the five faults above, seed 20261011
    // shrank to a two- or three-command counterexample; verify.md records them.
    resetReached();
    const commands = fc.commands<SharedModel, SharedWorld, false>(
      [
        fc.constantFrom(new SharedReadPlan('live'), new SharedReadPlan('shifted')),
        fc.constantFrom(new SharedReadPlan('live'), new SharedReadPlan('shifted')),
        fc
          .tuple(
            fc.integer({ min: 0, max: 3 }),
            fc.constantFrom<'ok' | 'failed' | 'kill'>('ok', 'ok', 'failed', 'kill'),
          )
          .map(([ordinal, kind]) => new SharedExitChild(ordinal, kind)),
        fc.constantFrom<SharedCommand>(
          new SharedRetry(),
          new SharedPump(),
          new HoldPush(),
          new ReleasePush(),
          new SecondWriter(),
          new HeldWriterRead(),
          new DropCaptureRead(),
        ),
      ],
      { maxCommands: 12 },
    );
    await fc.assert(
      fc.asyncProperty(commands, (history) => sharedTrace(history)),
      { seed: 20261011, numRuns: 60 },
    );
    for (const reachedCommand of ['sharedStore', 'sharedEvict', 'sharedHeldWriter']) {
      expect(
        reached.get(reachedCommand) ?? 0,
        `model never reached ${reachedCommand}`,
      ).toBeGreaterThan(0);
    }
  }, 300_000);
});
