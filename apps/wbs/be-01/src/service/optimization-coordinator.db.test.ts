import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  CommittedFanoutDelivery,
  CommittedProjectEvent,
} from '@wbs/core/service/committed-fanout';
import { schedule } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { afterEach, describe, expect, it } from 'bun:test';

import type {
  OptimizationRepository,
  ReservedSolverChild,
  ReservedSolverTerminal,
  ReservedSpawnRequest,
} from '../module/optimization/contract';
import { OptimizationCoordinator } from '../module/optimization/optimization.feature';
import { runSolverChildLifecycle } from '../module/optimization/solver-child-lifecycle';
import { openDatabase, openDrizzle } from '../repository/db';
import { DrizzleEventLogStore } from '../repository/event-log';
import { OPEN, WriteCoordinator } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { createOptimizationRepository } from '../repository/optimization';
import { reserveSolverSlot } from '../repository/optimization-admission';
import {
  beginOptimizationDrain,
  DRAIN_RECONCILE_INTERVAL_MS,
  releaseSolverSlot,
} from '../repository/optimization-drain';
import { allocateGeneration, readGeneration } from '../repository/optimization-generation';
import { enqueueSolverRequest } from '../repository/optimization-queue';
import { readOptimizedPair, storeOptimizedOutcome } from '../repository/optimized-schedule-cache';
import { scheduleInputHash } from '../repository/schedule-input-hash';
import { eventLog, optimizedScheduleCache, solverQueue, solverSlot } from '../repository/schema';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const CONTRACT = '7+0.2.0';
const BUDGET = 60_000;

const INPUT: ScheduleInput = {
  rows: [{ id: 'w-1', parentId: null, position: 10, frozenNumber: null, priority: null }],
  edges: [],
  slices: [
    {
      workItemId: 'w-1',
      stepId: 'step-dev',
      days: 2,
      personId: null,
      width: 1,
      poolIds: [],
    },
  ],
  notBefore: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  typed: [],
  deadlines: new Map(),
};
const FEASIBLE_RESPONSE = `${JSON.stringify({
  wireVersion: 3,
  status: 'feasible',
  offsets: { 'w-1\u0000step-dev': 0 },
  objectiveValues: {
    makespan: { value: 96, stageValue: 96, bound: 96, status: 'optimal' },
    priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
    movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
  },
})}\n`;
const dirs: string[] = [];

function stream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

const never = new Promise<number>(() => undefined);

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
} {
  let settle: ((value: T) => void) | undefined;
  let fail: ((error: Error) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return {
    promise,
    resolve: (value) => {
      if (settle === undefined) throw new Error('deferred promise has no resolver');
      settle(value);
    },
    reject: (error) => {
      if (fail === undefined) throw new Error('deferred promise has no rejecter');
      fail(error);
    },
  };
}

async function untilCalls(calls: readonly ReservedSpawnRequest[], count: number): Promise<void> {
  for (let turn = 0; turn < 50 && calls.length < count; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function database(): { path: string; db: ReturnType<typeof openDrizzle> } {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-optimization-coordinator-'));
  dirs.push(dir);
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  return { path, db: openDrizzle(path) };
}

function seedProject(path: string, projectId = 'p-1'): void {
  const db = openDatabase(path);
  try {
    db.run(
      `INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
       VALUES ('u-1', 'owner', 'hash', 1)`,
    );
    db.run(
      `INSERT INTO project (id, name, owner_id, restricted, revision, created_at,
                            optimization_enabled, schedule_engine, schedule_objective)
       VALUES (?, ?, 'u-1', 0, 0, 1, 1, 'optimized', 'pri')`,
      [projectId, `Plan ${projectId}`],
    );
  } finally {
    db.close();
  }
}

function coordinator(
  db: ReturnType<typeof openDrizzle>,
  calls: ReservedSpawnRequest[],
  ownerId = 'blue',
  childOf: (
    request: ReservedSpawnRequest,
  ) => ReservedSolverChild | Promise<ReservedSolverChild> = () => ({
    pid: 100 + calls.length,
    stdout: stream(''),
    stderr: stream(''),
    exited: never,
    verdict: () => undefined,
    kill: () => undefined,
  }),
  runChild: typeof runSolverChildLifecycle = () => Promise.resolve({ kind: 'exited', code: 0 }),
  onChildError: (error: unknown) => void = (error) => {
    throw error;
  },
  // A movable clock, defaulting to the fixed instant every other case here
  // relies on. Only the expiry cases below advance it.
  now: () => number = () => 10,
  beforeReserve?: () => void,
  repositoryOf?: (repository: OptimizationRepository) => OptimizationRepository,
  committedFanout?: CommittedFanoutDelivery,
): OptimizationCoordinator {
  let token = 0;
  const repository = createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN);
  const reservation =
    beforeReserve === undefined
      ? repository
      : {
          ...repository,
          reserveSlot: (request: Parameters<OptimizationRepository['reserveSlot']>[0]) => {
            beforeReserve();
            return repository.reserveSlot(request);
          },
        };
  return new OptimizationCoordinator({
    repository: repositoryOf?.(reservation) ?? reservation,
    hashInput: scheduleInputHash,
    contractVersion: CONTRACT,
    solverVersion: '0.2.0',
    budgetMs: BUDGET,
    ownerId,
    now,
    attemptToken: () => `${ownerId}-token-${String(token++)}`,
    inputOf: () => Promise.resolve(INPUT),
    enabledOf: () => Promise.resolve(true),
    spawn: async (request) => {
      calls.push(request);
      return await childOf(request);
    },
    runChild,
    onChildError,
    deliverCommitted: committedFanout
      ? (events) => committedFanout.deliverCommitted(events)
      : () => Promise.resolve(),
  });
}

function seedReadyVariant(
  db: ReturnType<typeof openDrizzle>,
  generation: number,
  objective: 'pri' | 'time',
): void {
  const admission = reserveSolverSlot(db, {
    projectId: 'p-1',
    contractVersion: CONTRACT,
    generation,
    objective,
    budgetMs: BUDGET,
    ownerId: 'seed',
    attemptToken: `seed-${objective}`,
    now: 3,
  });
  if (admission.kind !== 'reserved') throw new Error('ready variant fixture was not admitted');
  const claim = {
    projectId: 'p-1',
    contractVersion: CONTRACT,
    generation,
    objective,
    budgetMs: BUDGET,
    ownerId: 'seed',
    attemptToken: admission.attemptToken,
  };
  expect(
    storeOptimizedOutcome(db, {
      claim,
      inputHash: scheduleInputHash(INPUT),
      admittedCancelEpoch: admission.admittedCancelEpoch,
      outcome: {
        kind: 'ok',
        result: {
          publication: 'solver',
          schedule: schedule(
            INPUT.rows,
            INPUT.edges,
            INPUT.slices,
            INPUT.notBefore,
            INPUT.poolSizes,
          ),
          objectiveValues: {
            makespan: { value: 96, stageValue: 96, bound: 96, status: 'optimal' },
            priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
            movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
          },
        },
      },
      now: 4,
    }),
  ).toBe('stored');
  expect(releaseSolverSlot(db, claim).released).toBe(true);
}

describe('OptimizationCoordinator read', () => {
  it('hands off the stored outcome before downstream rows and releases its slot while delivery is held', async () => {
    const { path, db } = database();
    seedProject(path);
    const log = new DrizzleEventLogStore(db, OPEN);
    // The extra durable row is injected at the consumer boundary; 6k.b owns
    // the installed transactional producer proof.
    const downstream = {
      type: 'elsewhere_changed' as const,
      projectId: 'p-1',
      causeProjectId: 'p-2',
    };
    const recorded = await log.recordEvent('project:p-1', downstream, 3);
    const envelope = { projectId: 'p-1', event: downstream, recorded };
    const held = deferred<undefined>();
    const delivered: CommittedProjectEvent[][] = [];
    const errors: unknown[] = [];
    const instance = coordinator(
      db,
      [],
      'blue',
      () => ({
        pid: 42,
        stdout: stream(FEASIBLE_RESPONSE),
        stderr: stream(''),
        exited: Promise.resolve(0),
        verdict: () => undefined,
        kill: () => undefined,
      }),
      runSolverChildLifecycle,
      (error) => errors.push(error),
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        recordOutcome: async (write) => {
          const committed = await repository.recordOutcome(write);
          return write.claim.objective === 'pri' && committed.decision.kind === 'stored'
            ? { ...committed, envelopes: [envelope] }
            : committed;
        },
      }),
      {
        now: () => 3,
        deliverCommitted: async (events) => {
          delivered.push([...events]);
          if (events.some((entry) => entry.event.type === 'elsewhere_changed')) await held.promise;
        },
      },
    );
    await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT });
    for (let turn = 0; turn < 100 && db.select().from(solverSlot).all().length > 0; turn += 1)
      await new Promise((resolve) => setTimeout(resolve, 1));
    expect(db.select().from(solverSlot).all()).toEqual([]);
    const outcomeDelivery = delivered.find((events) =>
      events.some((entry) => entry.event.type === 'elsewhere_changed'),
    );
    expect(outcomeDelivery?.map(({ event }) => event.type)).toEqual([
      'schedule_optimized',
      'elsewhere_changed',
    ]);
    expect(outcomeDelivery?.[1]).toEqual(envelope);
    expect(outcomeDelivery?.map(({ recorded }) => recorded.seq)).toEqual([
      recorded.seq + 1,
      recorded.seq,
    ]);
    expect(delivered.flat()).toHaveLength(3);
    expect(new Set(delivered.flat().map(({ recorded }) => recorded.seq)).size).toBe(3);
    expect(db.select().from(eventLog).all()).toHaveLength(3);
    let stopped = false;
    const stopping = instance.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stopped).toBe(false);
    held.reject(new Error('outcome transport rejected after commit'));
    await stopping;
    expect(errors).toHaveLength(1);
    if (!(errors[0] instanceof Error)) throw new Error('outcome delivery error was not reported');
    expect(errors[0].message).toBe('outcome transport rejected after commit');
  });

  it('does not invoke committed delivery for empty adapter envelopes', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    let deliveries = 0;
    const instance = coordinator(
      db,
      calls,
      'blue',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        now: () => 3,
        deliverCommitted: () => {
          deliveries += 1;
          return Promise.resolve();
        },
      },
    );
    await instance.readPlan({ projectId: 'p-1', objective: 'pri', input: INPUT, enabled: true });
    await instance.drain();
    expect(deliveries).toBe(0);
  });

  it('hands off a committed reservation envelope without waiting for held delivery', async () => {
    const { path, db } = database();
    seedProject(path);
    const event = {
      type: 'elsewhere_changed' as const,
      projectId: 'p-1',
      causeProjectId: 'p-2',
    };
    const log = new DrizzleEventLogStore(db, OPEN);
    const recorded = await log.recordEvent('project:p-1', event, 3);
    const envelope = { projectId: 'p-1', event, recorded };
    const held = Promise.withResolvers<undefined>();
    const delivered: CommittedProjectEvent[] = [];
    const calls: ReservedSpawnRequest[] = [];
    let injected = false;
    const instance = coordinator(
      db,
      calls,
      'blue',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        reserveSlot: async (request) => {
          const committed = await repository.reserveSlot(request);
          const envelopes = injected ? [] : [envelope];
          injected = true;
          return { ...committed, envelopes };
        },
      }),
      {
        now: () => 3,
        deliverCommitted: async (events) => {
          delivered.push(...events);
          await held.promise;
        },
      },
    );
    const reading = instance.readPlan({
      projectId: 'p-1',
      objective: 'pri',
      input: INPUT,
      enabled: true,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const withheld = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('committed reservation waited for transport'));
      }, 500);
    });
    let answer: Awaited<typeof reading>;
    try {
      answer = await Promise.race([reading, withheld]);
    } catch (error) {
      held.resolve(undefined);
      throw error;
    } finally {
      clearTimeout(timer);
    }
    expect(answer.generation).not.toBeNull();
    expect(delivered).toEqual([envelope]);
    let stopped = false;
    const stopping = instance.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stopped).toBe(false);
    held.resolve(undefined);
    await stopping;
    expect(stopped).toBe(true);
  });

  it('delivers a committed project-full reservation answer before its early branch', async () => {
    const { path, db } = database();
    seedProject(path);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, scheduleInputHash(INPUT), 2);
    for (let budgetMs = 1; budgetMs <= 4; budgetMs += 1) {
      expect(
        reserveSolverSlot(db, {
          projectId: 'p-1',
          contractVersion: CONTRACT,
          generation,
          objective: 'pri',
          budgetMs,
          ownerId: 'other',
          attemptToken: `other-${String(budgetMs)}`,
          now: 3,
        }).kind,
      ).toBe('reserved');
    }
    const event = {
      type: 'elsewhere_changed' as const,
      projectId: 'p-1',
      causeProjectId: 'p-2',
    };
    const recorded = await new DrizzleEventLogStore(db, OPEN).recordEvent('project:p-1', event, 3);
    const envelope = { projectId: 'p-1', event, recorded };
    const delivered: CommittedProjectEvent[] = [];
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        reserveSlot: async (request) => {
          const committed = await repository.reserveSlot(request);
          expect(committed.decision.kind).toBe('project-full');
          return { ...committed, envelopes: [envelope] };
        },
      }),
      {
        now: () => 3,
        deliverCommitted: (events) => {
          delivered.push(...events);
          return Promise.resolve();
        },
      },
    );
    await instance.readPlan({ projectId: 'p-1', objective: 'pri', input: INPUT, enabled: true });
    await instance.drain();
    expect(delivered).toEqual([envelope, envelope]);
    expect(calls).toEqual([]);
  });

  it('delivers an empty-dequeue commit before the queue pump returns', async () => {
    const { path, db } = database();
    seedProject(path);
    const event = {
      type: 'elsewhere_changed' as const,
      projectId: 'p-1',
      causeProjectId: 'p-2',
    };
    const recorded = await new DrizzleEventLogStore(db, OPEN).recordEvent('project:p-1', event, 3);
    const envelope = { projectId: 'p-1', event, recorded };
    const delivered: CommittedProjectEvent[] = [];
    const entered = Promise.withResolvers<undefined>();
    const held = Promise.withResolvers<undefined>();
    const instance = coordinator(
      db,
      [],
      'blue',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        dequeueRequest: async (request) => ({
          ...(await repository.dequeueRequest(request)),
          envelopes: [envelope],
        }),
      }),
      {
        now: () => 3,
        deliverCommitted: async (events) => {
          delivered.push(...events);
          entered.resolve();
          await held.promise;
        },
      },
    );
    instance.start();
    await entered.promise;
    expect(delivered).toEqual([envelope]);
    let stopped = false;
    const stopping = instance.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stopped).toBe(false);
    held.resolve(undefined);
    await stopping;
    expect(stopped).toBe(true);
  });

  it('keeps a dequeued token while its committed delivery is held then rejected', async () => {
    const { path, db } = database();
    seedProject(path);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, scheduleInputHash(INPUT), 2);
    expect(
      enqueueSolverRequest(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET,
        enqueuedAt: 3,
      }),
    ).toEqual({ kind: 'queued' });
    const event = {
      type: 'elsewhere_changed' as const,
      projectId: 'p-1',
      causeProjectId: 'p-2',
    };
    const recorded = await new DrizzleEventLogStore(db, OPEN).recordEvent('project:p-1', event, 3);
    const envelope = { projectId: 'p-1', event, recorded };
    const held = Promise.withResolvers<undefined>();
    const delivered: CommittedProjectEvent[] = [];
    const errors: unknown[] = [];
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      undefined,
      undefined,
      (error) => errors.push(error),
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        dequeueRequest: async (request) => {
          const committed = await repository.dequeueRequest(request);
          return {
            ...committed,
            envelopes: committed.decision.kind === 'reserved' ? [envelope] : [],
          };
        },
      }),
      {
        now: () => 3,
        deliverCommitted: async (events) => {
          delivered.push(...events);
          await held.promise;
        },
      },
    );
    instance.start();
    await untilCalls(calls, 1);
    expect(calls).toHaveLength(1);
    expect(delivered).toEqual([envelope]);
    const secondWriter = openDatabase(path);
    try {
      secondWriter.run("UPDATE project SET name = 'writer-entered' WHERE id = 'p-1'");
    } finally {
      secondWriter.close();
    }
    let stopped = false;
    const stopping = instance.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    held.reject(new Error('transport refused after dequeue commit'));
    await stopping;
    expect(errors).toHaveLength(1);
    expect(stopped).toBe(true);
    expect(await new DrizzleEventLogStore(db, OPEN).rangeSince('project:p-1', -1)).toEqual([
      recorded,
    ]);
  });

  it('coalesces reconciliation ticks behind one unsettled source turn', async () => {
    const { path, db } = database();
    seedProject(path);
    const repository = createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    let interval: (() => void) | undefined;
    let reconciles = 0;
    const timed = new OptimizationCoordinator({
      repository: {
        ...repository,
        reconcileDrains: async (now) => {
          reconciles += 1;
          if (reconciles === 1) {
            entered.resolve(undefined);
            await release.promise;
          }
          return await repository.reconcileDrains(now);
        },
      },
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'blue',
      now: () => 10,
      attemptToken: () => 'reconcile-token',
      inputOf: () => Promise.resolve(null),
      enabledOf: () => Promise.resolve(true),
      spawn: () => Promise.reject(new Error('reconcile cannot launch')),
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => {
        throw error;
      },
      setInterval: (callback) => {
        interval = callback;
        return 'reconcile-timer';
      },
      clearInterval: () => undefined,
    });
    timed.start();
    await entered.promise;
    if (interval === undefined) throw new Error('reconciliation interval was not installed');
    interval();
    interval();
    await Bun.sleep(0);
    expect(reconciles).toBe(1);
    release.resolve(undefined);
    await timed.drain();
    await timed.stop();
    expect(reconciles).toBe(2);
    // Proof: clearing the in-flight guard starts overlapping reconciliation
    // calls on each tick instead of coalescing a single follow-up.
  });

  it('finishes unlaunched slot release before dequeuing the next project', async () => {
    const { path, db } = database();
    seedProject(path);
    seedProject(path, 'p-2');
    const inputHash = scheduleInputHash(INPUT);
    for (const projectId of ['p-1', 'p-2']) {
      const generation = allocateGeneration(db, projectId, CONTRACT, inputHash, 2);
      expect(
        enqueueSolverRequest(db, {
          projectId,
          contractVersion: CONTRACT,
          generation,
          objective: 'pri',
          budgetMs: BUDGET,
          enqueuedAt: 3,
        }),
      ).toEqual({ kind: 'queued' });
    }
    const repository = createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const calls: ReservedSpawnRequest[] = [];
    let dequeues = 0;
    let tokens = 0;
    const instance = new OptimizationCoordinator({
      repository: {
        ...repository,
        dequeueRequest: async (request) => {
          dequeues += 1;
          return await repository.dequeueRequest(request);
        },
        releaseSlot: async (slot) => {
          if (slot.projectId === 'p-1') {
            entered.resolve(undefined);
            await release.promise;
          }
          return await repository.releaseSlot(slot);
        },
      },
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'blue',
      now: () => 10,
      attemptToken: () => `pump-${String(tokens++)}`,
      inputOf: (projectId) => Promise.resolve(projectId === 'p-1' ? null : INPUT),
      enabledOf: () => Promise.resolve(true),
      spawn: (request) => {
        calls.push(request);
        return Promise.resolve({
          pid: 101,
          stdout: stream(''),
          stderr: stream(''),
          exited: never,
          verdict: () => undefined,
          kill: () => undefined,
        });
      },
      runChild: () => Promise.resolve({ kind: 'exited', code: 0 }),
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => {
        throw error;
      },
      setInterval: () => 'pump-timer',
      clearInterval: () => undefined,
    });
    instance.start();
    await entered.promise;
    try {
      await Bun.sleep(0);
      expect(dequeues).toBe(1);
      expect(calls).toEqual([]);
      expect(db.select().from(solverSlot).all()).toHaveLength(1);
    } finally {
      release.resolve(undefined);
    }
    await instance.drain();
    await instance.stop();
    expect(calls.map(({ key }) => key.projectId)).toEqual(['p-2']);
    expect(db.select().from(solverSlot).all()).toHaveLength(1);
    // Proof: dropping the awaited unlaunched release in pumpQueue lets the
    // second dequeue run while the first project's starting seat is held.
  });

  it('holds shutdown and the next queue step until durable dequeue settles', async () => {
    const { path, db } = database();
    seedProject(path);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, scheduleInputHash(INPUT), 10);
    expect(
      enqueueSolverRequest(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET,
        enqueuedAt: 10,
      }),
    ).toEqual({ kind: 'queued' });
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        dequeueRequest: async (request) => {
          entered.resolve(undefined);
          await release.promise;
          return await repository.dequeueRequest(request);
        },
      }),
    );
    instance.start();
    await entered.promise;
    let stopped = false;
    const stopping = instance.stop().then(() => {
      stopped = true;
    });
    try {
      await Bun.sleep(0);
      expect(stopped).toBe(false);
      expect(calls).toEqual([]);
      expect(db.select().from(solverQueue).all()).toHaveLength(1);
    } finally {
      release.resolve(undefined);
    }
    await stopping;
    expect(db.select().from(solverQueue).all()).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('tracks held reconciliation through stop and releases the draining generation', async () => {
    const { path, db } = database();
    seedProject(path);
    allocateGeneration(db, 'p-1', CONTRACT, 'draining-input', 10);
    expect(beginOptimizationDrain(db, 'p-1', { at: 11, by: 'u-1' }, CONTRACT)).toBe(0);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const instance = coordinator(
      db,
      [],
      'blue',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        reconcileDrains: async (now) => {
          entered.resolve(undefined);
          await release.promise;
          return await repository.reconcileDrains(now);
        },
      }),
    );
    instance.start();
    await entered.promise;
    let stopped = false;
    const stopping = instance.stop().then(() => {
      stopped = true;
    });
    try {
      await Bun.sleep(0);
      expect(stopped).toBe(false);
      expect(readGeneration(db, 'p-1', CONTRACT)).not.toBeNull();
    } finally {
      release.resolve(undefined);
    }
    await stopping;
    expect(readGeneration(db, 'p-1', CONTRACT)).toBeNull();
  });

  it.each(['superseded', 'disabled', 'draining'] as const)(
    'refuses a %s request after observation and before reservation',
    async (change) => {
      const { path, db } = database();
      seedProject(path);
      const calls: ReservedSpawnRequest[] = [];
      let changed = false;
      const instance = coordinator(
        db,
        calls,
        'blue',
        undefined,
        undefined,
        undefined,
        undefined,
        () => {
          if (changed) return;
          changed = true;
          if (change === 'superseded') allocateGeneration(db, 'p-1', CONTRACT, 'newer-input', 11);
          else if (change === 'disabled') {
            const write = openDatabase(path);
            try {
              write.run("UPDATE project SET optimization_enabled = 0 WHERE id = 'p-1'");
            } finally {
              write.close();
            }
          } else beginOptimizationDrain(db, 'p-1', { at: 11, by: 'u-1' }, CONTRACT);
        },
      );
      await instance.readPlan({ projectId: 'p-1', objective: 'pri', input: INPUT, enabled: true });
      await instance.drain();
      expect(changed).toBe(true);
      expect(calls).toEqual([]);
      expect(db.select().from(solverSlot).all()).toEqual([]);
      expect(db.select().from(solverQueue).all()).toEqual([]);
    },
  );
  it('reconciles abandoned drains at startup and on the owned interval without resuming work', async () => {
    const { path, db } = database();
    seedProject(path);
    const markDraining = (hash: string): void => {
      allocateGeneration(db, 'p-1', CONTRACT, hash, 2);
      const raw = openDatabase(path);
      try {
        raw.run(
          `UPDATE optimization_generation SET admission_state = 'draining'
           WHERE project_id = 'p-1' AND contract_version = '${CONTRACT}'`,
        );
      } finally {
        raw.close();
      }
    };
    markDraining('startup-hash');
    let tick = (): void => {
      throw new Error('drain reconciliation interval was not installed');
    };
    const scheduled: number[] = [];
    const cleared: unknown[] = [];
    const spawned: ReservedSpawnRequest[] = [];
    const errors: unknown[] = [];
    const instance = new OptimizationCoordinator({
      repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'restarted',
      now: () => 600,
      attemptToken: () => 'unused-token',
      inputOf: () => Promise.resolve(INPUT),
      enabledOf: () => Promise.resolve(true),
      spawn: (request) => {
        spawned.push(request);
        throw new Error('a drain reconciliation must not resume a solve');
      },
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => errors.push(error),
      setInterval: (callback, milliseconds) => {
        tick = callback;
        scheduled.push(milliseconds);
        return 'drain-timer';
      },
      clearInterval: (handle) => void cleared.push(handle),
    });

    instance.start();
    await instance.drain();
    expect(readGeneration(db, 'p-1', CONTRACT)).toBeNull();
    expect(scheduled).toEqual([DRAIN_RECONCILE_INTERVAL_MS]);
    expect(spawned).toEqual([]);

    markDraining('interval-hash');
    tick();
    await instance.drain();
    expect(readGeneration(db, 'p-1', CONTRACT)).toBeNull();
    await instance.stop();
    expect(cleared).toEqual(['drain-timer']);
    expect(errors).toEqual([]);

    // Proof: remove the startup call and `startup-hash` remains; remove the
    // interval callback and `interval-hash` remains; call spawn and this fails.
  });

  it('debounces edits and reads the newest enabled input once', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const sleeps: ReturnType<() => ReturnType<typeof deferred<undefined>>>[] = [];
    let inputReads = 0;
    let enabled = true;
    const instance = new OptimizationCoordinator({
      repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'blue',
      now: () => 10,
      attemptToken: () => crypto.randomUUID(),
      enabledOf: () => Promise.resolve(enabled),
      inputOf: () => {
        inputReads += 1;
        return Promise.resolve(INPUT);
      },
      sleep: () => {
        const wait = deferred<undefined>();
        sleeps.push(wait);
        return wait.promise;
      },
      spawn: (request) => {
        calls.push(request);
        return Promise.resolve({
          pid: 100 + calls.length,
          stdout: stream(''),
          stderr: stream(''),
          exited: never,
          verdict: () => undefined,
          kill: () => undefined,
        });
      },
      runChild: () => Promise.resolve({ kind: 'exited', code: 0 }),
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => {
        throw error;
      },
    });

    instance.inputChanged('p-1');
    instance.inputChanged('p-1');
    sleeps[0].resolve(undefined);
    await Promise.resolve();
    expect(inputReads).toBe(0);
    sleeps[1].resolve(undefined);
    await instance.drain();
    expect(inputReads).toBe(1);
    expect(calls.map(({ objective }) => objective)).toEqual(['pri', 'time']);

    enabled = false;
    instance.inputChanged('p-1');
    sleeps[2].resolve(undefined);
    await instance.drain();
    expect(inputReads).toBe(1);
    expect(calls).toHaveLength(2);

    // Proof: removing the epoch comparison reads the input twice; removing the
    // edit trigger leaves both `inputReads` and `calls` at zero; removing the
    // enabled check reads the input and attempts admission after the OFF event.
  });

  it('bypasses allocation and both solvers when the canonical plan has no work', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const empty: ScheduleInput = { ...INPUT, rows: [], slices: [] };
    const zeroDuration: ScheduleInput = {
      ...INPUT,
      slices: INPUT.slices.map((slice) => ({ ...slice, days: 0 })),
    };

    for (const input of [empty, zeroDuration]) {
      const read = await coordinator(db, calls).readPlan({
        projectId: 'p-1',
        objective: 'pri',
        input,
        enabled: true,
      });
      expect(read).toMatchObject({
        generation: null,
        variants: { pri: { state: 'idle' }, time: { state: 'idle' } },
        schedules: { pri: null, time: null },
      });
      expect(calls).toEqual([]);
      expect(db.select().from(solverSlot).all()).toEqual([]);
      expect(db.select().from(optimizedScheduleCache).all()).toEqual([]);
      expect(db.select().from(eventLog).all()).toEqual([]);
      expect(readGeneration(db, 'p-1', CONTRACT)).toBeNull();
    }

    // Proof: deleting the zero-work guard creates generation 1 and two slot
    // rows on the first cold read, despite there being nothing to optimize.
  });

  it('requests both absent objectives once while Fast remains the immediate answer', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];

    const read = await Promise.race([
      coordinator(db, calls, 'blue', undefined, undefined, undefined, undefined, undefined, () =>
        createOptimizationRepository(
          db,
          new DrizzleEventLogStore(db, OPEN),
          new WriteCoordinator(),
        ),
      ).readPlan({
        projectId: 'p-1',
        objective: 'pri',
        input: INPUT,
        enabled: true,
      }),
      Bun.sleep(1_000).then(() => {
        throw new Error('cold admission did not settle');
      }),
    ]);
    expect(read).toMatchObject({
      inputHash: scheduleInputHash(INPUT),
      generation: 1,
      variants: { pri: { state: 'pending' }, time: { state: 'pending' } },
      schedules: { pri: null, time: null },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.map(({ objective }) => objective)).toEqual(['pri', 'time']);
    expect(calls.every(({ key }) => key.inputHash === scheduleInputHash(INPUT))).toBe(true);
    expect(calls.map(({ request }) => request.objective)).toEqual(['pri', 'time']);
    expect(calls[0].request.baselineOffsets).toBe(calls[1].request.baselineOffsets);
    expect(
      db
        .select({
          ownerId: solverSlot.ownerId,
          attemptToken: solverSlot.attemptToken,
          lifecycle: solverSlot.lifecycle,
          pid: solverSlot.pid,
        })
        .from(solverSlot)
        .all(),
    ).toEqual([
      { ownerId: 'blue', attemptToken: 'blue-token-0', lifecycle: 'running', pid: 101 },
      { ownerId: 'blue', attemptToken: 'blue-token-1', lifecycle: 'running', pid: 102 },
    ]);

    expect(
      await coordinator(db, calls, 'green').read({
        projectId: 'p-1',
        objective: 'time',
        input: INPUT,
      }),
    ).toBeNull();
    expect(calls.map(({ objective }) => objective)).toEqual(['pri', 'time']);

    // Proof: bypassing SQLite leaves zero rows; removing the full-key conflict
    // check lets green call the spawner twice more for the same generation.
  });

  it('admits only a missing objective after a ready hit and none after a full hit', async () => {
    const { path, db } = database();
    seedProject(path);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, scheduleInputHash(INPUT), 2);
    seedReadyVariant(db, generation, 'pri');
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(db, calls);

    const oneMissing = await instance.readPlan({
      projectId: 'p-1',
      objective: 'pri',
      input: INPUT,
      enabled: true,
    });
    expect(oneMissing.generation).toBe(generation);
    expect(oneMissing.variants.pri.state).toBe('ready');
    expect(oneMissing.variants.time.state).toBe('pending');
    expect(calls.map(({ objective }) => objective)).toEqual(['time']);

    const { path: fullPath, db: fullDb } = database();
    seedProject(fullPath);
    const fullGeneration = allocateGeneration(fullDb, 'p-1', CONTRACT, scheduleInputHash(INPUT), 2);
    seedReadyVariant(fullDb, fullGeneration, 'pri');
    seedReadyVariant(fullDb, fullGeneration, 'time');
    const fullCalls: ReservedSpawnRequest[] = [];
    const fullHit = await coordinator(fullDb, fullCalls).readPlan({
      projectId: 'p-1',
      objective: 'time',
      input: INPUT,
      enabled: true,
    });
    expect(fullHit.generation).toBe(fullGeneration);
    expect(fullHit.variants.pri.state).toBe('ready');
    expect(fullHit.variants.time.state).toBe('ready');
    expect(fullCalls).toEqual([]);
    // Proof: broadening automatic selection to any non-idle row re-launches
    // a ready hit; the exact objective list must remain miss-only.
  });

  it('does not label a terminal row retrying from a different-budget slot', async () => {
    const { path, db } = database();
    seedProject(path);
    const inputHash = scheduleInputHash(INPUT);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, inputHash, 2);
    db.insert(optimizedScheduleCache)
      .values({
        projectId: 'p-1',
        inputHash,
        objective: 'pri',
        contractVersion: CONTRACT,
        budgetMs: BUDGET,
        generation,
        status: 'failed',
        resultJson: null,
        failureReason: 'timeout',
        createdAt: 3,
      })
      .run();
    expect(
      reserveSolverSlot(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET + 1,
        ownerId: 'other-budget',
        attemptToken: 'other-budget-token',
        now: 4,
      }),
    ).toMatchObject({ kind: 'reserved' });

    const read = await coordinator(db, []).readPlan({
      projectId: 'p-1',
      objective: 'pri',
      input: INPUT,
      enabled: true,
    });
    expect(read.variants).toEqual({
      pri: { state: 'failed', reason: 'timeout' },
      time: { state: 'pending' },
    });

    // Proof: dropping `budget_ms` from the live-slot predicate changes `pri`
    // to `retrying`, even though the only running solve cannot fill this row.
  });

  it('persists both absent objectives when project capacity is already full', async () => {
    const { path, db } = database();
    seedProject(path);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, scheduleInputHash(INPUT), 2);
    for (let index = 0; index < 4; index += 1) {
      expect(
        reserveSolverSlot(db, {
          projectId: 'p-1',
          contractVersion: CONTRACT,
          generation,
          objective: index % 2 === 0 ? 'pri' : 'time',
          budgetMs: BUDGET + index + 1,
          ownerId: `existing-${String(index)}`,
          attemptToken: `existing-token-${String(index)}`,
          now: 5,
        }),
      ).toMatchObject({ kind: 'reserved' });
    }
    const calls: ReservedSpawnRequest[] = [];

    expect(
      await coordinator(db, calls).read({ projectId: 'p-1', objective: 'pri', input: INPUT }),
    ).toBeNull();
    expect(calls).toEqual([]);
    expect(
      db
        .select({
          objective: solverQueue.objective,
          budgetMs: solverQueue.budgetMs,
          generation: solverQueue.generation,
          epoch: solverQueue.admittedCancelEpoch,
        })
        .from(solverQueue)
        .all(),
    ).toEqual([
      { objective: 'pri', budgetMs: BUDGET, generation, epoch: 0 },
      { objective: 'time', budgetMs: BUDGET, generation, epoch: 0 },
    ]);

    await coordinator(db, calls, 'green').read({
      projectId: 'p-1',
      objective: 'time',
      input: INPUT,
    });
    expect(db.select().from(solverQueue).all()).toHaveLength(2);

    // Proof: ignoring project-full/global-full leaves this FIFO empty; replacing
    // the full-key conflict policy changes the second read to four rows or throws.
  });

  it('launches two capacity-blocked projects in durable FIFO order as owned seats release', async () => {
    const { path, db } = database();
    for (const projectId of ['p-0', 'p-1', 'p-2', 'held-a', 'held-b', 'held-c', 'held-d']) {
      seedProject(path, projectId);
    }
    for (const [projectIndex, projectId] of ['held-a', 'held-b', 'held-c', 'held-d'].entries()) {
      const generation = allocateGeneration(db, projectId, CONTRACT, scheduleInputHash(INPUT), 1);
      const seats = projectId === 'held-d' ? 2 : 4;
      for (let seat = 0; seat < seats; seat += 1) {
        expect(
          reserveSolverSlot(db, {
            projectId,
            contractVersion: CONTRACT,
            generation,
            objective: seat % 2 === 0 ? 'pri' : 'time',
            budgetMs: BUDGET + projectIndex * 10 + seat + 1,
            ownerId: `held-${String(projectIndex)}-${String(seat)}`,
            attemptToken: `held-token-${String(projectIndex)}-${String(seat)}`,
            now: 1,
          }),
        ).toMatchObject({ kind: 'reserved' });
      }
    }
    const queuedGeneration = allocateGeneration(db, 'p-0', CONTRACT, scheduleInputHash(INPUT), 2);
    for (const objective of ['pri', 'time'] as const) {
      expect(
        enqueueSolverRequest(db, {
          projectId: 'p-0',
          contractVersion: CONTRACT,
          generation: queuedGeneration,
          objective,
          budgetMs: BUDGET,
          enqueuedAt: 2,
        }),
      ).toEqual({ kind: 'queued' });
    }

    const calls: ReservedSpawnRequest[] = [];
    const exits: ReturnType<typeof deferred<number>>[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => {
        const exit = deferred<number>();
        exits.push(exit);
        return {
          pid: 100 + calls.length,
          stdout: stream(''),
          stderr: stream(''),
          exited: exit.promise,
          verdict: () => undefined,
          kill: () => undefined,
        };
      },
      runSolverChildLifecycle,
    );

    instance.start();
    await untilCalls(calls, 2);
    await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT });
    await instance.read({ projectId: 'p-2', objective: 'pri', input: INPUT });
    expect(calls.map(({ key, objective }) => `${key.projectId}:${objective}`)).toEqual([
      'p-0:pri',
      'p-0:time',
    ]);
    expect(db.select().from(solverQueue).all()).toHaveLength(4);

    exits[0].resolve(1);
    exits[1].resolve(1);
    await untilCalls(calls, 4);
    expect(calls.map(({ key, objective }) => `${key.projectId}:${objective}`)).toEqual([
      'p-0:pri',
      'p-0:time',
      'p-1:pri',
      'p-1:time',
    ]);

    exits[2].resolve(1);
    exits[3].resolve(1);
    await untilCalls(calls, 6);
    expect(calls.map(({ key, objective }) => `${key.projectId}:${objective}`)).toEqual([
      'p-0:pri',
      'p-0:time',
      'p-1:pri',
      'p-1:time',
      'p-2:pri',
      'p-2:time',
    ]);

    exits[4].resolve(1);
    exits[5].resolve(1);
    await instance.drain();
    expect(db.select().from(solverQueue).all()).toEqual([]);

    // Proof: removing start leaves p-0 queued with zero calls; removing the
    // post-release pump leaves p-1 and p-2 queued after the p-0 children exit.
  });

  it('does not allocate a replacement generation when a stale queued project was switched off', async () => {
    const { path, db } = database();
    seedProject(path);
    const oldHash = scheduleInputHash(INPUT);
    const replacementInput: ScheduleInput = {
      ...INPUT,
      notBefore: new Map([['w-1', 1]]),
    };
    const generation = allocateGeneration(db, 'p-1', CONTRACT, oldHash, 2);
    expect(
      enqueueSolverRequest(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET,
        enqueuedAt: 3,
      }),
    ).toEqual({ kind: 'queued' });
    const calls: ReservedSpawnRequest[] = [];
    let enabledReads = 0;
    let inputReads = 0;
    const instance = new OptimizationCoordinator({
      repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'blue',
      now: () => 10,
      attemptToken: () => 'blue-token',
      inputOf: () => {
        inputReads += 1;
        return Promise.resolve(replacementInput);
      },
      enabledOf: () => {
        enabledReads += 1;
        return Promise.resolve(false);
      },
      spawn: (request) => {
        calls.push(request);
        throw new Error('an OFF project reached the launcher');
      },
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => {
        throw error;
      },
      setInterval: () => 'drain-timer',
      clearInterval: () => undefined,
    });

    instance.start();
    await instance.drain();
    await instance.stop();

    expect(inputReads).toBe(1);
    expect(enabledReads).toBe(1);
    expect(calls).toEqual([]);
    expect(readGeneration(db, 'p-1', CONTRACT)).toMatchObject({
      generation,
      inputHash: oldHash,
    });
    expect(db.select().from(solverQueue).all()).toEqual([]);
    expect(db.select().from(solverSlot).all()).toEqual([]);
    // Proof: removing the enabled recheck advances this row to generation 2
    // with `replacementInput`'s hash and launches both replacement objectives.
  });

  it('releases a stale queued seat before observing replacement enablement', async () => {
    const { path, db } = database();
    seedProject(path);
    const oldHash = scheduleInputHash(INPUT);
    const replacement: ScheduleInput = { ...INPUT, notBefore: new Map([['w-1', 1]]) };
    const generation = allocateGeneration(db, 'p-1', CONTRACT, oldHash, 2);
    expect(
      enqueueSolverRequest(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET,
        enqueuedAt: 3,
      }),
    ).toEqual({ kind: 'queued' });
    const repository = createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    let enabledReads = 0;
    const instance = new OptimizationCoordinator({
      repository: {
        ...repository,
        releaseSlot: async (slot) => {
          entered.resolve(undefined);
          await release.promise;
          return await repository.releaseSlot(slot);
        },
      },
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'blue',
      now: () => 10,
      attemptToken: () => 'stale-token',
      inputOf: () => Promise.resolve(replacement),
      enabledOf: () => {
        enabledReads += 1;
        return Promise.resolve(false);
      },
      spawn: () => {
        throw new Error('disabled replacement reached launcher');
      },
      runChild: () => Promise.resolve({ kind: 'exited', code: 0 }),
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => {
        throw error;
      },
      setInterval: () => 'stale-timer',
      clearInterval: () => undefined,
    });
    instance.start();
    try {
      await entered.promise;
      await Promise.resolve();
      expect(enabledReads).toBe(0);
      expect(db.select().from(solverSlot).all()).toHaveLength(1);
    } finally {
      release.resolve(undefined);
    }
    await instance.stop();
    expect(enabledReads).toBe(1);
    expect(db.select().from(solverSlot).all()).toEqual([]);
  });

  it('fences allocation when OFF commits as the stale-input enabled read returns', async () => {
    const { path, db } = database();
    seedProject(path);
    const oldHash = scheduleInputHash(INPUT);
    const replacementInput: ScheduleInput = {
      ...INPUT,
      notBefore: new Map([['w-1', 1]]),
    };
    const generation = allocateGeneration(db, 'p-1', CONTRACT, oldHash, 2);
    expect(
      enqueueSolverRequest(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET,
        enqueuedAt: 3,
      }),
    ).toEqual({ kind: 'queued' });
    const switcher = openDatabase(path);
    const calls: ReservedSpawnRequest[] = [];
    const instance = new OptimizationCoordinator({
      repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'blue',
      now: () => 10,
      attemptToken: () => 'blue-token',
      inputOf: () => Promise.resolve(replacementInput),
      enabledOf: () => {
        switcher.run("UPDATE project SET optimization_enabled = 0 WHERE id = 'p-1'");
        return Promise.resolve(true);
      },
      spawn: (request) => {
        calls.push(request);
        throw new Error('an OFF project reached the launcher');
      },
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => {
        throw error;
      },
      setInterval: () => 'drain-timer',
      clearInterval: () => undefined,
    });

    try {
      instance.start();
      await instance.drain();
      await instance.stop();
    } finally {
      switcher.close();
    }

    expect(calls).toEqual([]);
    // Proof: without the writer-owned enabled fence, this advances to generation 2.
    expect(readGeneration(db, 'p-1', CONTRACT)).toMatchObject({ generation, inputHash: oldHash });
    expect(db.select().from(solverQueue).all()).toEqual([]);
    expect(db.select().from(solverSlot).all()).toEqual([]);
  });

  it('stores both preflight refusals without creating a launcher', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const tooLate: ScheduleInput = {
      ...INPUT,
      notBefore: new Map([['w-1', 50_000_000]]),
    };

    const captured = await coordinator(db, calls).readPlan({
      projectId: 'p-1',
      objective: 'pri',
      input: tooLate,
      enabled: true,
    });
    expect(captured.inputHash).toBe(scheduleInputHash(tooLate));
    expect(captured.generation).toBe(1);
    expect(captured.variants).toEqual({ pri: { state: 'idle' }, time: { state: 'idle' } });
    expect(captured.schedules).toEqual({ pri: null, time: null });
    expect(calls).toEqual([]);
    expect(db.select().from(solverSlot).all()).toEqual([]);

    const pair = readOptimizedPair(db, {
      projectId: 'p-1',
      inputHash: scheduleInputHash(tooLate),
      contractVersion: CONTRACT,
      budgetMs: BUDGET,
    });
    expect(pair.pri).toMatchObject({ kind: 'failed', reason: 'horizon-overflow' });
    expect(pair.time).toMatchObject({ kind: 'failed', reason: 'horizon-overflow' });

    // Proof: rereading the cache after preflight replaces the captured idle
    // display with a failure that was written after the observation closed.

    // Proof: passing the refusal to spawn creates two launcher calls; skipping
    // the fenced store leaves both variants as misses and repeats on every read.
  });

  it('does not automatically request exact-key failed or corrupt objectives', async () => {
    const { path, db } = database();
    seedProject(path);
    const inputHash = scheduleInputHash(INPUT);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, inputHash, 2);
    const write = openDatabase(path);
    try {
      write.run(
        `INSERT INTO optimized_schedule_cache
           (project_id, input_hash, objective, contract_version, budget_ms,
            generation, status, result_json, failure_reason, created_at)
         VALUES ('p-1', '${inputHash}', 'pri', '${CONTRACT}', ${String(BUDGET)},
                 ${String(generation)}, 'failed', NULL, 'timeout', 3),
                ('p-1', '${inputHash}', 'time', '${CONTRACT}', ${String(BUDGET)},
                 ${String(generation)}, 'ok', '{', NULL, 3)`,
      );
    } finally {
      write.close();
    }
    const calls: ReservedSpawnRequest[] = [];

    expect(
      await coordinator(db, calls).read({ projectId: 'p-1', objective: 'pri', input: INPUT }),
    ).toBeNull();
    expect(calls).toEqual([]);

    // Proof: admitting every non-ok outcome fails here with two requests; a
    // failed or corrupt row is durable evidence and only explicit Retry spends it.
  });

  it('aborts and awaits a launcher whose reservation was reclaimed before its PID bind', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const verdicts: string[] = [];
    let killed = 0;
    const instance = coordinator(db, calls, 'blue', (request) => {
      expect(
        reserveSolverSlot(db, {
          projectId: request.key.projectId,
          contractVersion: request.key.contractVersion,
          generation: request.generation,
          objective: request.objective,
          budgetMs: request.key.budgetMs,
          ownerId: 'green',
          attemptToken: `replacement-${request.objective}`,
          now: request.admission.admittedDeadlineAt + 1,
        }),
      ).toMatchObject({ kind: 'reserved' });
      return {
        pid: 42,
        stdout: stream(''),
        stderr: stream(''),
        exited: Promise.resolve(0),
        verdict: (verdict) => {
          verdicts.push(verdict);
        },
        kill: () => {
          killed += 1;
        },
      };
    });

    expect(await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT })).toBeNull();
    await instance.drain();
    expect(verdicts).toEqual(['abort', 'abort']);
    expect(killed).toBe(0);
    expect(
      db
        .select({ token: solverSlot.attemptToken, lifecycle: solverSlot.lifecycle })
        .from(solverSlot)
        .all(),
    ).toEqual([
      { token: 'replacement-pri', lifecycle: 'starting' },
      { token: 'replacement-time', lifecycle: 'starting' },
    ]);

    // Proof: dropping the bind CAS or sending `bound` unconditionally lets
    // both delayed launchers exec against replacement-owned reservations.
    // Calling kill here would race the host's awaited abort cleanup.
  });

  it('waits for durable PID bind before sending the child bound verdict', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const verdicts: string[] = [];
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => ({
        pid: 42,
        stdout: stream(''),
        stderr: stream(''),
        exited: never,
        verdict: (verdict) => {
          verdicts.push(verdict);
        },
        kill: () => undefined,
      }),
      undefined,
      undefined,
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        bindSlot: async (request) => {
          entered.resolve(undefined);
          await release.promise;
          return await repository.bindSlot(request);
        },
      }),
    );
    await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT });
    try {
      await entered.promise;
      await Promise.resolve();
      expect(verdicts).toEqual([]);
      expect(db.select({ lifecycle: solverSlot.lifecycle }).from(solverSlot).all()).toEqual([
        { lifecycle: 'starting' },
        { lifecycle: 'starting' },
      ]);
    } finally {
      release.resolve(undefined);
    }
    await instance.drain();
    expect(verdicts).toEqual(['bound', 'bound']);
  });

  it('runs bound children through evaluation, the token-fenced store, and release', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => ({
        pid: 100 + calls.length,
        stdout: stream(FEASIBLE_RESPONSE),
        stderr: stream(''),
        exited: Promise.resolve(0),
        verdict: () => undefined,
        kill: () => undefined,
      }),
      runSolverChildLifecycle,
    );

    expect(await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT })).toBeNull();
    await instance.drain();

    const pair = readOptimizedPair(db, {
      projectId: 'p-1',
      inputHash: scheduleInputHash(INPUT),
      contractVersion: CONTRACT,
      budgetMs: BUDGET,
    });
    expect(pair.pri.kind).toBe('ok');
    expect(pair.time.kind).toBe('ok');
    expect(db.select().from(solverSlot).all()).toEqual([]);
    expect(
      await instance.read({ projectId: 'p-1', objective: 'time', input: INPUT }),
    ).not.toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('persists a terminal outcome before the lifecycle releases its seat', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    let released = 0;
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => ({
        pid: 42,
        stdout: stream(FEASIBLE_RESPONSE),
        stderr: stream(''),
        exited: Promise.resolve(0),
        verdict: () => undefined,
        kill: () => undefined,
      }),
      runSolverChildLifecycle,
      undefined,
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        recordOutcome: async (write) => {
          entered.resolve(undefined);
          await release.promise;
          return await repository.recordOutcome(write);
        },
        releaseSlot: async (slot) => {
          released += 1;
          return await repository.releaseSlot(slot);
        },
      }),
    );
    await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT });
    try {
      await entered.promise;
      await Promise.resolve();
      expect(released).toBe(0);
      expect(db.select().from(solverSlot).all()).toHaveLength(2);
    } finally {
      release.resolve(undefined);
    }
    await instance.drain();
    expect(db.select().from(solverSlot).all()).toEqual([]);
    expect(
      readOptimizedPair(db, {
        projectId: 'p-1',
        inputHash: scheduleInputHash(INPUT),
        contractVersion: CONTRACT,
        budgetMs: BUDGET,
      }).pri.kind,
    ).toBe('ok');
  });

  it('reports an admission-closed miss idle beside a ready incomplete result', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => ({
        pid: 100 + calls.length,
        stdout: stream(FEASIBLE_RESPONSE),
        stderr: stream(''),
        exited: Promise.resolve(0),
        verdict: () => undefined,
        kill: () => undefined,
      }),
      runSolverChildLifecycle,
    );
    const inputHash = scheduleInputHash(INPUT);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, inputHash, 2);
    const admission = reserveSolverSlot(db, {
      projectId: 'p-1',
      contractVersion: CONTRACT,
      generation,
      objective: 'pri',
      budgetMs: BUDGET,
      ownerId: 'blue',
      attemptToken: 'incomplete-pri',
      now: 3,
    });
    if (admission.kind !== 'reserved') throw new Error('broken fixture: Pri was not admitted');
    const claim = {
      projectId: 'p-1',
      contractVersion: CONTRACT,
      generation,
      objective: 'pri' as const,
      budgetMs: BUDGET,
      ownerId: 'blue',
      attemptToken: admission.attemptToken,
    };
    expect(
      storeOptimizedOutcome(db, {
        claim,
        inputHash,
        admittedCancelEpoch: admission.admittedCancelEpoch,
        outcome: {
          kind: 'ok',
          result: {
            publication: 'solver',
            schedule: schedule(
              INPUT.rows,
              INPUT.edges,
              INPUT.slices,
              INPUT.notBefore,
              INPUT.poolSizes,
            ),
            objectiveValues: {
              makespan: { value: 96, stageValue: 96, bound: 96, status: 'optimal' },
              priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
              movement: { value: 0, stageValue: null, bound: null, status: 'unknown' },
            },
          },
        },
        now: 4,
      }),
    ).toBe('stored');
    expect(releaseSolverSlot(db, claim).released).toBe(true);
    expect(
      enqueueSolverRequest(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'time',
        budgetMs: BUDGET,
        enqueuedAt: 4,
      }),
    ).toEqual({ kind: 'queued' });
    expect(db.select().from(solverQueue).all()).toHaveLength(1);

    expect(beginOptimizationDrain(db, 'p-1', { at: 5, by: 'u-1' }, CONTRACT)).toBe(0);
    expect(db.select().from(solverQueue).all()).toEqual([]);

    const plan = await instance.readPlan({
      projectId: 'p-1',
      objective: 'pri',
      input: INPUT,
      enabled: true,
    });
    expect(plan.generation).toBe(generation);
    expect(plan.variants).toEqual({
      pri: { state: 'ready', proof: 'incomplete' },
      time: { state: 'idle' },
    });
    expect(calls).toHaveLength(0);
    // Proof: skipping beginOptimizationDrain leaves Time queued and the read
    // reports it pending. The production drain both closes admission and
    // removes that unstarted work; no direct table mutation creates the state.
  });

  it('stores an internal failure but retains admission when creation has no terminal proof', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const errors: unknown[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => {
        throw new Error('launcher is absent');
      },
      () => new Promise(() => undefined),
      (error) => void errors.push(error),
    );

    expect(await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT })).toBeNull();
    await instance.drain();

    const pair = readOptimizedPair(db, {
      projectId: 'p-1',
      inputHash: scheduleInputHash(INPUT),
      contractVersion: CONTRACT,
      budgetMs: BUDGET,
    });
    expect(pair.pri).toMatchObject({ kind: 'failed', reason: 'internal-error' });
    expect(pair.time).toMatchObject({ kind: 'failed', reason: 'internal-error' });
    expect(
      db.select({ lifecycle: solverSlot.lifecycle, pid: solverSlot.pid }).from(solverSlot).all(),
    ).toEqual([
      { lifecycle: 'starting', pid: null },
      { lifecycle: 'starting', pid: null },
    ]);
    expect(errors).toHaveLength(2);

    expect(await instance.read({ projectId: 'p-1', objective: 'time', input: INPUT })).toBeNull();
    expect(calls).toHaveLength(2);
  });

  /**
   * The stale-seat deadlock, end to end.
   *
   * A spawn failure keeps its seat on purpose — without terminal evidence a
   * process may still be running — and for the seat's admitted lifetime the
   * variant honestly reads `retrying`. What was wrong is what happened AFTER
   * that lifetime: the reader never compared the deadline, so the seat stayed
   * "live" for ever, the stored `failed` kept reading as `retrying`, and the
   * explicit Retry that would have freed the project refused with
   * `already-running` because it consults the same predicate.
   *
   * Both instants are asserted rather than one: at `deadline - 1` the mask is
   * correct and must survive, and only at `deadline` — the exact boundary
   * `reclaimExpiredSolverSlotsIn` uses for `deadline <= now` — does it lift.
   * A test that only advanced "well past" would pass on an off-by-one that
   * freed a live child a millisecond early.
   *
   * Proof: deleting `gt(solverSlot.admittedDeadlineAt, now)` — the original
   * bug — failed this case on `Expected: "failed" · Received: "retrying"`, with
   * the `deadline - 1` assertion above it still green. Widening it to `gte`
   * failed the same assertion the same way, which is what pins the boundary to
   * reclaim's `deadline <= now` rather than to an adjacent millisecond.
   */
  it('frees a variant whose retained seat expired, for both the read and Retry', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    let clock = 10;
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => {
        throw new Error('launcher is absent');
      },
      () => new Promise(() => undefined),
      () => undefined,
      () => clock,
    );

    expect(await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT })).toBeNull();
    await instance.drain();

    const key = {
      projectId: 'p-1',
      inputHash: scheduleInputHash(INPUT),
      contractVersion: CONTRACT,
      budgetMs: BUDGET,
    };
    // The stored outcome never changes across this test; only the seat expires.
    expect(readOptimizedPair(db, key).pri).toMatchObject({
      kind: 'failed',
      reason: 'internal-error',
    });
    const seats = db
      .select({ deadline: solverSlot.admittedDeadlineAt })
      .from(solverSlot)
      .all()
      .map((row) => row.deadline);
    expect(seats).toHaveLength(2);
    const deadline = seats[0];

    const stateOf = async (): Promise<string> =>
      (await instance.readPlan({ projectId: 'p-1', objective: 'pri', input: INPUT, enabled: true }))
        .variants.pri.state;

    clock = deadline - 1;
    expect(await stateOf()).toBe('retrying');
    expect(
      await instance.retry({
        projectId: 'p-1',
        objective: 'pri',
        inputHash: key.inputHash,
        input: INPUT,
      }),
    ).toEqual({ kind: 'already-running' });

    clock = deadline;
    expect(await stateOf()).toBe('failed');
    // And the escape is reachable: Retry admits rather than refusing, which is
    // what puts a real solve back on the wire and sweeps the dead seat.
    expect(
      await instance.retry({
        projectId: 'p-1',
        objective: 'pri',
        inputHash: key.inputHash,
        input: INPUT,
      }),
    ).toMatchObject({ kind: 'accepted', state: 'retrying' });
    await instance.drain();
  });

  it('kills and stores failure without releasing when bind transport has no terminal proof', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const errors: unknown[] = [];
    let killed = 0;
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => ({
        pid: 100 + calls.length,
        stdout: stream(''),
        stderr: stream('broken pipe'),
        exited: Promise.resolve(137),
        verdict: () => {
          throw new Error('bind pipe closed');
        },
        kill: () => {
          killed += 1;
        },
      }),
      runSolverChildLifecycle,
      (error) => void errors.push(error),
    );

    expect(await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT })).toBeNull();
    await instance.drain();

    const pair = readOptimizedPair(db, {
      projectId: 'p-1',
      inputHash: scheduleInputHash(INPUT),
      contractVersion: CONTRACT,
      budgetMs: BUDGET,
    });
    expect(pair.pri).toMatchObject({ kind: 'failed', reason: 'internal-error' });
    expect(pair.time).toMatchObject({ kind: 'failed', reason: 'internal-error' });
    expect(
      db.select({ lifecycle: solverSlot.lifecycle, pid: solverSlot.pid }).from(solverSlot).all(),
    ).toEqual([
      { lifecycle: 'running', pid: 101 },
      { lifecycle: 'running', pid: 102 },
    ]);
    expect(killed).toBe(2);
    expect(errors).toHaveLength(2);
  });

  it('tracks asynchronous start through bind and child lifecycle in drain', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const starts: ReturnType<typeof deferred<ReservedSolverChild>>[] = [];
    const instance = coordinator(db, calls, 'blue', () => {
      const start = deferred<ReservedSolverChild>();
      starts.push(start);
      return start.promise;
    });

    expect(await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT })).toBeNull();
    expect(calls).toHaveLength(2);
    expect(starts).toHaveLength(2);
    expect(db.select({ lifecycle: solverSlot.lifecycle }).from(solverSlot).all()).toEqual([
      { lifecycle: 'starting' },
      { lifecycle: 'starting' },
    ]);

    let drained = false;
    const draining = instance.drain().then(() => {
      drained = true;
    });
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    expect(drained).toBe(false);

    for (const [index, start] of starts.entries()) {
      start.resolve({
        pid: 201 + index,
        stdout: stream(''),
        stderr: stream(''),
        exited: Promise.resolve(0),
        verdict: () => undefined,
        kill: () => undefined,
      });
    }
    await draining;
    expect(drained).toBe(true);
    expect(
      db.select({ lifecycle: solverSlot.lifecycle, pid: solverSlot.pid }).from(solverSlot).all(),
    ).toEqual([
      { lifecycle: 'running', pid: 201 },
      { lifecycle: 'running', pid: 202 },
    ]);
  });

  it('classifies authenticated terminal evidence before evaluating solver output', async () => {
    const cases = [
      {
        terminal: { exitCode: 0, deadlineKilled: true, oomKilled: true },
        expected: 'timeout',
      },
      {
        terminal: { exitCode: 0, deadlineKilled: false, oomKilled: true },
        expected: 'oom',
      },
      {
        terminal: { exitCode: 0, deadlineKilled: false, oomKilled: false },
        expected: 'ok',
      },
      {
        terminal: { exitCode: 1, deadlineKilled: false, oomKilled: false },
        expected: 'internal-error',
      },
      // 64 and 70 are cli.py's own two refusals and they land on different
      // reasons: 70 is the solver running and answering nothing, which is the
      // only way a later-stage INFEASIBLE can leave the process, and spec.md
      // requires that run to be recorded `invalid-output`. 64 is the request
      // refused before solving, and every request is ours.
      {
        terminal: { exitCode: 70, deadlineKilled: false, oomKilled: false },
        expected: 'invalid-output',
      },
      {
        terminal: { exitCode: 64, deadlineKilled: false, oomKilled: false },
        expected: 'internal-error',
      },
      // Kill evidence outranks the code. A child killed at its deadline exits
      // non-zero too, and reading 70 out of a SIGKILL would report a stage the
      // solver never reached.
      {
        terminal: { exitCode: 70, deadlineKilled: true, oomKilled: false },
        expected: 'timeout',
      },
    ] as const;

    for (const item of cases) {
      const { path, db } = database();
      seedProject(path);
      const calls: ReservedSpawnRequest[] = [];
      const terminal: Promise<ReservedSolverTerminal> = Promise.resolve(item.terminal);
      const instance = coordinator(
        db,
        calls,
        'blue',
        () => ({
          pid: 300 + calls.length,
          stdout: stream(FEASIBLE_RESPONSE),
          stderr: stream(''),
          exited: terminal.then((evidence) => evidence.exitCode),
          terminal,
          verdict: () => undefined,
          kill: () => undefined,
        }),
        runSolverChildLifecycle,
      );

      expect(await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT })).toBeNull();
      await instance.drain();
      const pair = readOptimizedPair(db, {
        projectId: 'p-1',
        inputHash: scheduleInputHash(INPUT),
        contractVersion: CONTRACT,
        budgetMs: BUDGET,
      });
      for (const outcome of [pair.pri, pair.time]) {
        if (item.expected === 'ok') expect(outcome.kind).toBe('ok');
        else expect(outcome).toMatchObject({ kind: 'failed', reason: item.expected });
      }
      expect(db.select().from(solverSlot).all()).toEqual([]);
    }
  });

  /**
   * The OTHER arm of `processOutcome`, and it needs its own case because the
   * table above cannot reach it: every row there supplies `child.terminal`, so
   * reverting the un-authenticated branch alone left both changed files green
   * (Sol r3 c1 Minor 1). A supervisor that never sent a terminal frame leaves
   * the raw exit as the only evidence there is, and `70` still has to mean the
   * solver answered nothing.
   */
  it('reads the raw exit code when no terminal frame authenticates it', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => ({
        pid: 500 + calls.length,
        stdout: stream(FEASIBLE_RESPONSE),
        stderr: stream(''),
        exited: Promise.resolve(70),
        verdict: () => undefined,
        kill: () => undefined,
      }),
      runSolverChildLifecycle,
    );

    expect(await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT })).toBeNull();
    await instance.drain();
    const pair = readOptimizedPair(db, {
      projectId: 'p-1',
      inputHash: scheduleInputHash(INPUT),
      contractVersion: CONTRACT,
      budgetMs: BUDGET,
    });
    for (const outcome of [pair.pri, pair.time]) {
      expect(outcome).toMatchObject({ kind: 'failed', reason: 'invalid-output' });
    }
  });

  it('stores internal-error and retains the slot when terminal evidence is lost after start', async () => {
    const { path, db } = database();
    seedProject(path);
    const calls: ReservedSpawnRequest[] = [];
    const terminals: ReturnType<typeof deferred<ReservedSolverTerminal>>[] = [];
    const errors: unknown[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      () => {
        const terminal = deferred<ReservedSolverTerminal>();
        terminals.push(terminal);
        return {
          pid: 400 + calls.length,
          stdout: stream(''),
          stderr: stream(''),
          exited: terminal.promise.then((evidence) => evidence.exitCode),
          terminal: terminal.promise,
          verdict: () => undefined,
          kill: () => undefined,
        };
      },
      runSolverChildLifecycle,
      (error) => void errors.push(error),
    );

    expect(await instance.read({ projectId: 'p-1', objective: 'pri', input: INPUT })).toBeNull();
    await Promise.resolve();
    for (const terminal of terminals) {
      terminal.reject(new Error('supervisor EOF before terminal'));
    }
    await instance.drain();

    const pair = readOptimizedPair(db, {
      projectId: 'p-1',
      inputHash: scheduleInputHash(INPUT),
      contractVersion: CONTRACT,
      budgetMs: BUDGET,
    });
    expect(pair.pri).toMatchObject({ kind: 'failed', reason: 'internal-error' });
    expect(pair.time).toMatchObject({ kind: 'failed', reason: 'internal-error' });
    expect(db.select({ lifecycle: solverSlot.lifecycle }).from(solverSlot).all()).toEqual([
      { lifecycle: 'running' },
      { lifecycle: 'running' },
    ]);
    expect(errors).toHaveLength(2);
  });
});

describe('OptimizationCoordinator Retry admission', () => {
  const inputHash = scheduleInputHash(INPUT);

  function generationWith(
    path: string,
    db: ReturnType<typeof openDrizzle>,
    marker: 'failed' | 'corrupt' | 'plan-infeasible' | 'none',
    input: ScheduleInput = INPUT,
    createdAt = 3,
  ): number {
    seedProject(path);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, scheduleInputHash(input), 2);
    if (marker !== 'none') {
      db.insert(optimizedScheduleCache)
        .values({
          projectId: 'p-1',
          inputHash: scheduleInputHash(input),
          objective: 'pri',
          contractVersion: CONTRACT,
          budgetMs: BUDGET,
          generation,
          status: marker === 'corrupt' ? 'ok' : marker,
          resultJson:
            marker === 'corrupt'
              ? '{"dtoVersion":'
              : marker === 'plan-infeasible'
                ? '{"dtoVersion":1,"items":[]}'
                : null,
          failureReason: marker === 'failed' ? 'timeout' : null,
          createdAt,
        })
        .run();
    }
    return generation;
  }

  const ask = (bodyHash = inputHash, input: ScheduleInput = INPUT) => ({
    projectId: 'p-1',
    objective: 'pri' as const,
    inputHash: bodyHash,
    input,
  });

  it('retains an accepted Retry while committed delivery is held then rejected', async () => {
    const { path, db } = database();
    const generation = generationWith(path, db, 'failed');
    const event = {
      type: 'elsewhere_changed' as const,
      projectId: 'p-1',
      causeProjectId: 'p-2',
    };
    const recorded = await new DrizzleEventLogStore(db, OPEN).recordEvent('project:p-1', event, 3);
    const envelope = { projectId: 'p-1', event, recorded };
    const held = Promise.withResolvers<undefined>();
    const delivered: CommittedProjectEvent[] = [];
    const errors: unknown[] = [];
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      undefined,
      undefined,
      (error) => errors.push(error),
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        admitRetry: async (request) => ({
          ...(await repository.admitRetry(request)),
          envelopes: [envelope],
        }),
      }),
      {
        now: () => 3,
        deliverCommitted: async (events) => {
          delivered.push(...events);
          await held.promise;
        },
      },
    );
    const answer = await instance.retry(ask());
    expect(answer).toMatchObject({ kind: 'accepted', generation });
    expect(delivered).toEqual([envelope]);
    await untilCalls(calls, 1);
    expect(calls).toHaveLength(1);
    const secondWriter = openDatabase(path);
    try {
      secondWriter.run("UPDATE project SET name = 'writer-entered' WHERE id = 'p-1'");
    } finally {
      secondWriter.close();
    }
    held.reject(new Error('transport refused after Retry commit'));
    await instance.drain();
    expect(errors).toHaveLength(1);
    expect(db.select().from(solverSlot).all()).toHaveLength(1);
    expect(await new DrizzleEventLogStore(db, OPEN).rangeSince('project:p-1', -1)).toEqual([
      recorded,
    ]);
  });

  it('returns an accepted Retry after a synchronous committed-delivery throw', async () => {
    const { path, db } = database();
    const generation = generationWith(path, db, 'failed');
    const event = {
      type: 'elsewhere_changed' as const,
      projectId: 'p-1',
      causeProjectId: 'p-2',
    };
    const recorded = await new DrizzleEventLogStore(db, OPEN).recordEvent('project:p-1', event, 3);
    const envelope = { projectId: 'p-1', event, recorded };
    const errors: unknown[] = [];
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      undefined,
      undefined,
      (error) => errors.push(error),
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        admitRetry: async (request) => ({
          ...(await repository.admitRetry(request)),
          envelopes: [envelope],
        }),
      }),
      {
        now: () => 3,
        deliverCommitted: () => {
          throw new Error('synchronous transport failure');
        },
      },
    );
    expect(await instance.retry(ask())).toMatchObject({ kind: 'accepted', generation });
    await untilCalls(calls, 1);
    await instance.drain();
    expect(calls).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('delivers a non-retryable committed answer before returning its refusal', async () => {
    const { path, db } = database();
    generationWith(path, db, 'none');
    const event = {
      type: 'elsewhere_changed' as const,
      projectId: 'p-1',
      causeProjectId: 'p-2',
    };
    const recorded = await new DrizzleEventLogStore(db, OPEN).recordEvent('project:p-1', event, 3);
    const envelope = { projectId: 'p-1', event, recorded };
    const delivered: CommittedProjectEvent[] = [];
    const calls: ReservedSpawnRequest[] = [];
    const instance = coordinator(
      db,
      calls,
      'blue',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (repository) => ({
        ...repository,
        admitRetry: async (request) => ({
          ...(await repository.admitRetry(request)),
          envelopes: [envelope],
        }),
      }),
      {
        now: () => 3,
        deliverCommitted: (events) => {
          delivered.push(...events);
          return Promise.resolve();
        },
      },
    );
    expect(await instance.retry(ask())).toEqual({ kind: 'not-retryable', state: 'idle' });
    await instance.drain();
    expect(delivered).toEqual([envelope]);
    expect(calls).toEqual([]);
  });

  it('refuses a stale body before retryability and carries the current hash', async () => {
    const { path, db } = database();
    generationWith(path, db, 'failed');
    const calls: ReservedSpawnRequest[] = [];

    expect(await coordinator(db, calls).retry(ask('stale-hash'))).toEqual({
      kind: 'stale-input-hash',
      currentInputHash: inputHash,
    });
    expect(calls).toEqual([]);
    expect(db.select().from(solverSlot).all()).toEqual([]);
  });

  it('names a live miss pending instead of reporting it already-running', async () => {
    const { path, db } = database();
    const generation = generationWith(path, db, 'none');
    expect(
      enqueueSolverRequest(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET,
        enqueuedAt: 4,
      }),
    ).toEqual({ kind: 'queued' });

    expect(await coordinator(db, []).retry(ask())).toEqual({
      kind: 'not-retryable',
      state: 'pending',
    });
    // Proof: checking liveness before retryability returns `already-running`
    // for this absent row; watched red on h2puni in TASK-268.
  });

  it.each([
    { marker: 'none', state: 'idle' },
    { marker: 'plan-infeasible', state: 'plan-infeasible' },
  ] as const)('names an unlaunchable $state variant not-retryable', async ({ marker, state }) => {
    const { path, db } = database();
    generationWith(path, db, marker);
    const calls: ReservedSpawnRequest[] = [];

    expect(await coordinator(db, calls).retry(ask())).toEqual({ kind: 'not-retryable', state });
    // Both, because neither alone is "no solver process starts": `spawn` runs
    // **before** `bindSolverSlot`, so a regression that starts a child and then
    // fails to bind leaves this table empty and the process real. The spawn
    // recorder is the assertion about the process; the empty table is the
    // assertion about the reservation.
    expect(calls).toEqual([]);
    expect(db.select().from(solverSlot).all()).toEqual([]);
  });

  it.each(['failed', 'corrupt'] as const)(
    'admits one %s Retry, coalesces the second, and retains the marker',
    async (marker) => {
      const { path, db } = database();
      const generation = generationWith(path, db, marker);
      const calls: ReservedSpawnRequest[] = [];
      const instance = coordinator(db, calls);

      expect(await instance.retry(ask())).toEqual({
        kind: 'accepted',
        state: 'retrying',
        generation,
        inputHash,
      });
      expect(await instance.retry(ask())).toEqual({ kind: 'already-running' });
      await untilCalls(calls, 1);

      expect(calls.map((call) => call.objective)).toEqual(['pri']);
      expect(db.select().from(solverSlot).all()).toHaveLength(1);
      expect(readOptimizedPair(db, calls[0].key).pri.kind).toBe(marker);
    },
  );

  it('matches already-running on budget and admits beside a different-budget slot', async () => {
    const { path, db } = database();
    const generation = generationWith(path, db, 'failed');
    expect(
      reserveSolverSlot(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET + 1,
        ownerId: 'other-budget',
        attemptToken: 'other-budget-token',
        now: 4,
      }),
    ).toMatchObject({ kind: 'reserved' });

    expect(await coordinator(db, []).retry(ask())).toMatchObject({
      kind: 'accepted',
      state: 'retrying',
    });
    expect(db.select().from(solverSlot).all()).toHaveLength(2);
  });

  it('queues a failed Retry behind project capacity without replacing its marker', async () => {
    const { path, db } = database();
    const generation = generationWith(path, db, 'failed');
    for (let index = 0; index < 4; index += 1) {
      expect(
        reserveSolverSlot(db, {
          projectId: 'p-1',
          contractVersion: CONTRACT,
          generation,
          objective: index % 2 === 0 ? 'pri' : 'time',
          budgetMs: BUDGET + index + 1,
          ownerId: `held-${String(index)}`,
          attemptToken: `held-token-${String(index)}`,
          now: 4,
        }),
      ).toMatchObject({ kind: 'reserved' });
    }
    const calls: ReservedSpawnRequest[] = [];

    expect(await coordinator(db, calls).retry(ask())).toEqual({
      kind: 'accepted',
      state: 'retrying',
      generation,
      inputHash,
    });
    expect(calls).toEqual([]);
    expect(db.select().from(solverQueue).all()).toHaveLength(1);
    expect(
      readOptimizedPair(db, {
        projectId: 'p-1',
        inputHash,
        contractVersion: CONTRACT,
        budgetMs: BUDGET,
      }).pri.kind,
    ).toBe('failed');

    // Proof: returning on project-full leaves the queue empty; replacing the
    // retained marker at admission changes its final kind away from `failed`.
  });

  it('takes SQLite writer ownership before reading Retry eligibility', async () => {
    const { path, db } = database();
    const generation = generationWith(path, db, 'failed');
    const contender = openDatabase(path);
    contender.run('PRAGMA busy_timeout = 0');
    const calls: ReservedSpawnRequest[] = [];
    let contention: unknown;
    const instance = new OptimizationCoordinator({
      repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'blue',
      now: () => 10,
      attemptToken: () => {
        try {
          contender.run("UPDATE project SET name = 'contender' WHERE id = 'p-1'");
        } catch (error) {
          contention = error;
        }
        return 'blue-token';
      },
      inputOf: () => Promise.resolve(INPUT),
      enabledOf: () => Promise.resolve(true),
      spawn: (request) => {
        calls.push(request);
        return Promise.resolve({
          pid: 100,
          stdout: stream(''),
          stderr: stream(''),
          exited: never,
          verdict: () => undefined,
          kill: () => undefined,
        });
      },
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => {
        throw error;
      },
    });

    try {
      expect(await instance.retry(ask())).toMatchObject({ kind: 'accepted', generation });
    } finally {
      contender.close();
    }
    // Proof: with Drizzle's default DEFERRED transaction, Retry throws database-is-locked here.
    expect((contention as { code?: string } | undefined)?.code).toBe('SQLITE_BUSY');
    expect(calls).toHaveLength(1);
  });

  it.each(['OFF', 'draining'] as const)(
    'refuses a failed Retry while the project is %s',
    async (condition) => {
      const { path, db } = database();
      generationWith(path, db, 'failed');
      const write = openDatabase(path);
      try {
        if (condition === 'OFF') {
          write.run("UPDATE project SET optimization_enabled = 0 WHERE id = 'p-1'");
        } else {
          write.run(
            "UPDATE optimization_generation SET admission_state = 'draining' WHERE project_id = 'p-1'",
          );
        }
      } finally {
        write.close();
      }

      expect(await coordinator(db, []).retry(ask())).toEqual({
        kind: 'not-retryable',
        state: 'failed',
      });
      expect(db.select().from(solverSlot).all()).toEqual([]);
      expect(db.select().from(solverQueue).all()).toEqual([]);

      // Proof: removing either closed-state check changes this refusal to an
      // accepted Retry with a slot or queue row.
    },
  );

  it('records a future-stamped Retry preflight failure and keeps pumping FIFO', async () => {
    const { path, db } = database();
    const refusedInput: ScheduleInput = {
      ...INPUT,
      notBefore: new Map([['w-1', 50_000_000]]),
    };
    const refusedHash = scheduleInputHash(refusedInput);
    const refusedGeneration = generationWith(path, db, 'failed', refusedInput, 20);
    for (let index = 0; index < 4; index += 1) {
      expect(
        reserveSolverSlot(db, {
          projectId: 'p-1',
          contractVersion: CONTRACT,
          generation: refusedGeneration,
          objective: index % 2 === 0 ? 'pri' : 'time',
          budgetMs: BUDGET + index + 1,
          ownerId: `held-${String(index)}`,
          attemptToken: `held-token-${String(index)}`,
          now: 4,
        }),
      ).toMatchObject({ kind: 'reserved' });
    }
    const calls: ReservedSpawnRequest[] = [];
    const errors: unknown[] = [];
    let token = 0;
    const instance = new OptimizationCoordinator({
      repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'blue',
      now: () => 10,
      attemptToken: () => `blue-token-${String(token++)}`,
      inputOf: (projectId) => Promise.resolve(projectId === 'p-1' ? refusedInput : INPUT),
      enabledOf: () => Promise.resolve(true),
      spawn: (request) => {
        calls.push(request);
        return Promise.resolve({
          pid: 100 + calls.length,
          stdout: stream(FEASIBLE_RESPONSE),
          stderr: stream(''),
          exited: Promise.resolve(0),
          verdict: () => undefined,
          kill: () => undefined,
        });
      },
      runChild: () => Promise.resolve({ kind: 'exited', code: 0 }),
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => errors.push(error),
      setInterval: () => 'drain-timer',
      clearInterval: () => undefined,
    });

    expect(await instance.retry(ask(refusedHash, refusedInput))).toMatchObject({
      kind: 'accepted',
      generation: refusedGeneration,
    });
    seedProject(path, 'p-2');
    const nextGeneration = allocateGeneration(db, 'p-2', CONTRACT, inputHash, 22);
    expect(
      enqueueSolverRequest(db, {
        projectId: 'p-2',
        contractVersion: CONTRACT,
        generation: nextGeneration,
        objective: 'pri',
        budgetMs: BUDGET,
        enqueuedAt: 22,
      }),
    ).toEqual({ kind: 'queued' });
    db.delete(solverSlot).run();

    instance.start();
    await instance.stop();

    expect(errors).toEqual([]);
    expect(calls.map((call) => call.key.projectId)).toEqual(['p-2']);
    expect(db.select().from(solverQueue).all()).toEqual([]);
    expect(
      readOptimizedPair(db, {
        projectId: 'p-1',
        inputHash: refusedHash,
        contractVersion: CONTRACT,
        budgetMs: BUDGET,
      }).pri,
    ).toMatchObject({ kind: 'failed', reason: 'horizon-overflow', createdAt: 21 });

    // Proof: timestamping the preflight failure from the lagging clock throws
    // before this row is stored and leaves p-2 queued with zero launcher calls.
  });
});

it('retires an old integer-infeasibility certificate under the current solver cache key', () => {
  const { path, db } = database();
  seedProject(path);
  const oldContract = '14+0.1.3';
  const currentRequest = JSON.parse(
    readFileSync(
      new URL(
        '../../../../../libs/wbs/domain/contracts/solver/fixtures/request/valid-two-slices.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { contractVersion: string };
  const inputHash = scheduleInputHash(INPUT);
  const generation = allocateGeneration(db, 'p-1', oldContract, inputHash, 2);
  db.insert(optimizedScheduleCache)
    .values({
      projectId: 'p-1',
      inputHash,
      objective: 'pri',
      contractVersion: oldContract,
      budgetMs: BUDGET,
      generation,
      status: 'plan-infeasible',
      resultJson: '{"dtoVersion":1,"items":[]}',
      failureReason: null,
      createdAt: 3,
    })
    .run();
  expect(
    readOptimizedPair(db, {
      projectId: 'p-1',
      inputHash,
      contractVersion: oldContract,
      budgetMs: BUDGET,
    }).pri.kind,
  ).toBe('plan-infeasible');
  expect(
    readOptimizedPair(db, {
      projectId: 'p-1',
      inputHash,
      contractVersion: currentRequest.contractVersion,
      budgetMs: BUDGET,
    }).pri.kind,
  ).toBe('miss');
});

describe('wire 3 preflight admission cleanup', () => {
  it.each(['initial', 'retry'] as const)(
    'finishes %s preflight release before requesting another queue dequeue',
    async (pathway) => {
      const { path, db } = database();
      seedProject(path);
      const input: ScheduleInput = {
        ...INPUT,
        slices: INPUT.slices.map((slice) => ({ ...slice, days: 2 ** 52 })),
      };
      const hash = scheduleInputHash(input);
      if (pathway === 'retry') {
        const generation = allocateGeneration(db, 'p-1', CONTRACT, hash, 2);
        db.insert(optimizedScheduleCache)
          .values({
            projectId: 'p-1',
            inputHash: hash,
            objective: 'pri',
            contractVersion: CONTRACT,
            budgetMs: BUDGET,
            generation,
            status: 'failed',
            resultJson: null,
            failureReason: 'timeout',
            createdAt: 3,
          })
          .run();
      }
      const repository = createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN);
      const entered = deferred<undefined>();
      const release = deferred<undefined>();
      let dequeues = 0;
      const instance = coordinator(
        db,
        [],
        'blue',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        () => ({
          ...repository,
          releaseSlot: async (slot) => {
            entered.resolve(undefined);
            await release.promise;
            return await repository.releaseSlot(slot);
          },
          dequeueRequest: async (request) => {
            dequeues += 1;
            return await repository.dequeueRequest(request);
          },
        }),
      );
      const reading =
        pathway === 'initial'
          ? instance.readPlan({ projectId: 'p-1', objective: 'pri', input, enabled: true })
          : instance.retry({ projectId: 'p-1', objective: 'pri', inputHash: hash, input });
      try {
        await entered.promise;
        await Promise.resolve();
        expect(dequeues).toBe(0);
        expect(db.select().from(solverSlot).all()).toHaveLength(1);
      } finally {
        release.resolve(undefined);
      }
      await reading;
      await instance.drain();
      expect(dequeues).toBeGreaterThan(0);
      expect(db.select().from(solverSlot).all()).toEqual([]);
    },
  );
  it('persists a queued preflight refusal before releasing its reserved seat', async () => {
    const { path, db } = database();
    seedProject(path);
    const input: ScheduleInput = {
      ...INPUT,
      slices: INPUT.slices.map((slice) => ({ ...slice, days: 2 ** 52 })),
    };
    const hash = scheduleInputHash(input);
    const generation = allocateGeneration(db, 'p-1', CONTRACT, hash, 2);
    expect(
      enqueueSolverRequest(db, {
        projectId: 'p-1',
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET,
        enqueuedAt: 3,
      }),
    ).toEqual({ kind: 'queued' });
    const repository = createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    let released = 0;
    const errors: unknown[] = [];
    const instance = new OptimizationCoordinator({
      repository: {
        ...repository,
        recordOutcome: async (write) => {
          entered.resolve(undefined);
          await release.promise;
          return await repository.recordOutcome(write);
        },
        releaseSlot: async (slot) => {
          released += 1;
          return await repository.releaseSlot(slot);
        },
      },
      hashInput: scheduleInputHash,
      contractVersion: CONTRACT,
      solverVersion: '0.2.0',
      budgetMs: BUDGET,
      ownerId: 'blue',
      now: () => 10,
      attemptToken: () => 'queued-token',
      inputOf: () => Promise.resolve(input),
      enabledOf: () => Promise.resolve(true),
      spawn: () => {
        throw new Error('preflight refusal reached launcher');
      },
      runChild: () => Promise.resolve({ kind: 'exited', code: 0 }),
      deliverCommitted: () => Promise.resolve(),
      onChildError: (error) => {
        errors.push(error);
      },
      setInterval: () => 'held-queue',
      clearInterval: () => undefined,
    });
    instance.start();
    try {
      await entered.promise;
      await Promise.resolve();
      expect(released).toBe(0);
      expect(db.select().from(solverSlot).all()).toHaveLength(1);
    } finally {
      release.resolve(undefined);
    }
    await instance.stop();
    expect(errors).toEqual([]);
    expect(db.select().from(solverSlot).all()).toEqual([]);
    expect(
      readOptimizedPair(db, {
        projectId: 'p-1',
        inputHash: hash,
        contractVersion: CONTRACT,
        budgetMs: BUDGET,
      }).pri,
    ).toMatchObject({ kind: 'failed', reason: 'horizon-overflow' });
  });
  it.each(['initial', 'retry'] as const)(
    'persists a %s preflight refusal before releasing its reserved seat',
    async (pathway) => {
      const { path, db } = database();
      seedProject(path);
      const input: ScheduleInput = {
        ...INPUT,
        slices: INPUT.slices.map((slice) => ({ ...slice, days: 2 ** 52 })),
      };
      const hash = scheduleInputHash(input);
      if (pathway === 'retry') {
        const generation = allocateGeneration(db, 'p-1', CONTRACT, hash, 2);
        db.insert(optimizedScheduleCache)
          .values({
            projectId: 'p-1',
            inputHash: hash,
            objective: 'pri',
            contractVersion: CONTRACT,
            budgetMs: BUDGET,
            generation,
            status: 'failed',
            resultJson: null,
            failureReason: 'timeout',
            createdAt: 3,
          })
          .run();
      }
      const entered = deferred<undefined>();
      const release = deferred<undefined>();
      let released = 0;
      const instance = coordinator(
        db,
        [],
        'blue',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        (repository) => ({
          ...repository,
          recordOutcome: async (write) => {
            entered.resolve(undefined);
            await release.promise;
            return await repository.recordOutcome(write);
          },
          releaseSlot: async (slot) => {
            released += 1;
            return await repository.releaseSlot(slot);
          },
        }),
      );
      const reading =
        pathway === 'initial'
          ? instance.readPlan({ projectId: 'p-1', objective: 'pri', input, enabled: true })
          : instance.retry({ projectId: 'p-1', objective: 'pri', inputHash: hash, input });
      try {
        await entered.promise;
        await Promise.resolve();
        expect(released).toBe(0);
        expect(db.select().from(solverSlot).all()).toHaveLength(1);
        expect(
          readOptimizedPair(db, {
            projectId: 'p-1',
            inputHash: hash,
            contractVersion: CONTRACT,
            budgetMs: BUDGET,
          }).pri.kind,
        ).toBe(pathway === 'retry' ? 'failed' : 'miss');
      } finally {
        release.resolve(undefined);
      }
      await reading;
      expect(db.select().from(solverSlot).all()).toEqual([]);
      expect(
        readOptimizedPair(db, {
          projectId: 'p-1',
          inputHash: hash,
          contractVersion: CONTRACT,
          budgetMs: BUDGET,
        }).pri,
      ).toMatchObject({ kind: 'failed', reason: 'horizon-overflow' });
    },
  );
  const refusals = [
    { name: 'compatibility', version: '0.1.4', reason: 'internal-error', input: INPUT },
    {
      name: 'arithmetic',
      version: '0.2.0',
      reason: 'horizon-overflow',
      input: { ...INPUT, slices: INPUT.slices.map((slice) => ({ ...slice, days: 2 ** 52 })) },
    },
    {
      name: 'booking arithmetic',
      version: '0.2.0',
      reason: 'horizon-overflow',
      input: {
        ...INPUT,
        elsewhere: new Map([
          ['ana', [{ start: 0, end: Number.MAX_VALUE, projectId: 'higher', workItemId: 'held' }]],
        ]),
      },
    },
  ] as const;
  for (const refusal of refusals) {
    it.each(['initial', 'queued', 'retry'] as const)(
      `releases ${refusal.name} refusal after %s admission`,
      async (pathway) => {
        const { path, db } = database();
        const hash = scheduleInputHash(refusal.input);
        seedProject(path);
        if (pathway === 'retry') {
          const generation = allocateGeneration(db, 'p-1', CONTRACT, hash, 2);
          db.insert(optimizedScheduleCache)
            .values({
              projectId: 'p-1',
              inputHash: hash,
              objective: 'pri',
              contractVersion: CONTRACT,
              budgetMs: BUDGET,
              generation,
              status: 'failed',
              resultJson: null,
              failureReason: 'timeout',
              createdAt: 3,
            })
            .run();
        }
        const calls: ReservedSpawnRequest[] = [];
        const errors: unknown[] = [];
        let token = 0;
        const instance = new OptimizationCoordinator({
          repository: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
          hashInput: scheduleInputHash,
          contractVersion: CONTRACT,
          solverVersion: refusal.version,
          budgetMs: BUDGET,
          ownerId: 'blue',
          now: () => 10,
          attemptToken: () => `preflight-${String(token++)}`,
          inputOf: () => Promise.resolve(refusal.input),
          enabledOf: () => Promise.resolve(true),
          spawn: (request) => {
            calls.push(request);
            throw new Error('a refused request reached spawn');
          },
          runChild: () => Promise.resolve({ kind: 'exited', code: 0 }),
          deliverCommitted: () => Promise.resolve(),
          onChildError: (error) => errors.push(error),
          setInterval: () => 'preflight-timer',
          clearInterval: () => undefined,
        });
        if (pathway === 'queued') {
          const generation = allocateGeneration(db, 'p-1', CONTRACT, hash, 1);
          enqueueSolverRequest(db, {
            projectId: 'p-1',
            contractVersion: CONTRACT,
            generation,
            objective: 'pri',
            budgetMs: BUDGET,
            enqueuedAt: 2,
          });
        } else if (pathway === 'retry') {
          expect(
            await instance.retry({
              projectId: 'p-1',
              objective: 'pri',
              inputHash: hash,
              input: refusal.input,
            }),
          ).toMatchObject({ kind: 'accepted' });
        } else {
          await instance.readPlan({
            projectId: 'p-1',
            objective: 'pri',
            input: refusal.input,
            enabled: true,
          });
        }
        instance.start();
        await instance.stop();
        expect(errors).toEqual([]);
        expect(calls).toEqual([]);
        expect(db.select().from(solverSlot).all()).toEqual([]);
        expect(db.select().from(solverQueue).all()).toEqual([]);
        expect(
          readOptimizedPair(db, {
            projectId: 'p-1',
            inputHash: hash,
            contractVersion: CONTRACT,
            budgetMs: BUDGET,
          }).pri,
        ).toMatchObject({ kind: 'failed', reason: refusal.reason });
      },
    );
  }
});
