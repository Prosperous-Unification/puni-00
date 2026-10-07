import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  runSolverChildLifecycle,
  type SolverChildSlot,
} from '../module/optimization/solver-child-lifecycle';
import type { SpawnedSolverLauncher } from '../module/solver-launcher/solver-launcher.repository';
import { openDatabase, openDrizzle } from '../repository/db';
import { DrizzleEventLogStore } from '../repository/event-log';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { createOptimizationRepository } from '../repository/optimization';
import { bindSolverSlot, reserveSolverSlot } from '../repository/optimization-admission';
import { allocateGeneration } from '../repository/optimization-generation';
import { solverSlot } from '../repository/schema';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const CONTRACT = '7+0.1.0';
const BUDGET = 60_000;
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function database(): { path: string; db: ReturnType<typeof openDrizzle> } {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-solver-child-lifecycle-'));
  dirs.push(dir);
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const raw = openDatabase(path);
  try {
    raw.run(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ('u-1', 'owner', 'hash', 1)`,
    );
    raw.run(
      `INSERT INTO project (id, name, owner_id, restricted, revision, created_at,
                            optimization_enabled, schedule_engine, schedule_objective)
       VALUES ('p-1', 'Plan', 'u-1', 0, 0, 1, 1, 'optimized', 'pri')`,
    );
  } finally {
    raw.close();
  }
  return { path, db: openDrizzle(path) };
}

function reserve(db: ReturnType<typeof openDrizzle>, token = 'token-1', now = 10): SolverChildSlot {
  const generation = allocateGeneration(db, 'p-1', CONTRACT, 'hash-1', now);
  const admission = reserveSolverSlot(db, {
    projectId: 'p-1',
    contractVersion: CONTRACT,
    generation,
    objective: 'pri',
    budgetMs: BUDGET,
    ownerId: 'blue',
    attemptToken: token,
    now,
  });
  if (admission.kind !== 'reserved') throw new Error(`expected reservation, got ${admission.kind}`);
  expect(
    bindSolverSlot(db, {
      projectId: 'p-1',
      contractVersion: CONTRACT,
      generation,
      objective: 'pri',
      budgetMs: BUDGET,
      attemptToken: token,
      pid: 42,
    }),
  ).toBe(true);
  return {
    projectId: 'p-1',
    contractVersion: CONTRACT,
    generation,
    objective: 'pri',
    budgetMs: BUDGET,
    attemptToken: token,
    admittedCancelEpoch: admission.admittedCancelEpoch,
  };
}

function stream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function deferredChild(
  stdout = '',
  stderr = '',
): {
  child: SpawnedSolverLauncher;
  exit: (code: number) => void;
  killed: () => number;
} {
  let exit: (code: number) => void = () => undefined;
  let killed = 0;
  const exited = new Promise<number>((resolve) => {
    exit = resolve;
  });
  return {
    child: {
      pid: 42,
      stdout: stream(stdout),
      stderr: stream(stderr),
      exited,
      verdict: () => undefined,
      kill: () => {
        killed += 1;
      },
    },
    exit,
    killed: () => killed,
  };
}

describe('runSolverChildLifecycle', () => {
  it('waits for the durable heartbeat decision before killing a cancelled child', async () => {
    const { db } = database();
    const slot = reserve(db);
    db.update(solverSlot).set({ cancelRequestedAt: 15 }).run();
    const repository = createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const process = deferredChild();
    const running = runSolverChildLifecycle({
      slots: {
        ...repository,
        refreshSlot: async (request) => {
          entered.resolve(undefined);
          await release.promise;
          return await repository.refreshSlot(request);
        },
      },
      slot,
      child: process.child,
      now: () => 20,
      sleep: () => Promise.resolve(),
      onExit: () => {
        throw new Error('cancelled child cannot publish');
      },
    });
    try {
      await entered.promise;
      process.exit(143);
      await Promise.resolve();
      expect(process.killed()).toBe(0);
      expect(db.select().from(solverSlot).all()).toHaveLength(1);
    } finally {
      release.resolve(undefined);
    }
    expect(await running).toEqual({ kind: 'cancelled', reason: 'requested', code: 143 });
    expect(process.killed()).toBe(1);
  });

  it('waits for exact-token release before reporting normal child completion', async () => {
    const { db } = database();
    const slot = reserve(db);
    const repository = createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const process = deferredChild();
    process.exit(0);
    let settled = false;
    const running = runSolverChildLifecycle({
      slots: {
        ...repository,
        releaseSlot: async (request) => {
          entered.resolve(undefined);
          await release.promise;
          return await repository.releaseSlot(request);
        },
      },
      slot,
      child: process.child,
      now: () => 20,
      sleep: () => new Promise(() => undefined),
      onExit: () => undefined,
    }).then((outcome) => {
      settled = true;
      return outcome;
    });
    try {
      await entered.promise;
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(db.select().from(solverSlot).all()).toHaveLength(1);
    } finally {
      release.resolve(undefined);
    }
    expect(await running).toEqual({ kind: 'exited', code: 0 });
    expect(db.select().from(solverSlot).all()).toEqual([]);
  });

  it('waits for exact-token release before reporting durable cancellation', async () => {
    const { db } = database();
    const slot = reserve(db);
    db.update(solverSlot).set({ cancelRequestedAt: 15 }).run();
    const repository = createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const process = deferredChild();
    let settled = false;
    const running = runSolverChildLifecycle({
      slots: {
        ...repository,
        releaseSlot: async (request) => {
          entered.resolve(undefined);
          await release.promise;
          return await repository.releaseSlot(request);
        },
      },
      slot,
      child: {
        ...process.child,
        kill: () => {
          process.child.kill();
          process.exit(143);
        },
      },
      now: () => 20,
      sleep: () => Promise.resolve(),
      onExit: () => {
        throw new Error('cancelled child cannot publish');
      },
    }).then((outcome) => {
      settled = true;
      return outcome;
    });
    try {
      await entered.promise;
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(db.select().from(solverSlot).all()).toHaveLength(1);
    } finally {
      release.resolve(undefined);
    }
    expect(await running).toEqual({ kind: 'cancelled', reason: 'requested', code: 143 });
    expect(db.select().from(solverSlot).all()).toEqual([]);
  });

  it('drains both streams, handles the exit while the slot is held, then releases it', async () => {
    const { db } = database();
    const slot = reserve(db);
    const process = deferredChild('{"wireVersion":1}\n', 'diagnostic');
    let heldDuringExit = false;
    process.exit(0);

    const result = await runSolverChildLifecycle({
      slots: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
      slot,
      child: process.child,
      now: () => 20,
      sleep: () => new Promise(() => undefined),
      onExit: (exit) => {
        heldDuringExit = db
          .select()
          .from(solverSlot)
          .all()
          .some((row) => row.pid === 42);
        expect(exit).toEqual({ code: 0, stdout: '{"wireVersion":1}\n', stderr: 'diagnostic' });
      },
    });

    expect(result).toEqual({ kind: 'exited', code: 0 });
    expect(heldDuringExit).toBe(true);
    expect(db.select().from(solverSlot).all()).toEqual([]);
  });

  it('observes durable cancellation on the heartbeat, kills the child and releases the slot', async () => {
    const { db } = database();
    const slot = reserve(db);
    db.update(solverSlot).set({ cancelRequestedAt: 15 }).run();
    const process = deferredChild();
    let handled = 0;

    const running = runSolverChildLifecycle({
      slots: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
      slot,
      child: process.child,
      now: () => 20,
      sleep: () => Promise.resolve(),
      onExit: () => {
        handled += 1;
      },
    });
    await Promise.resolve();
    process.exit(143);

    expect(await running).toEqual({ kind: 'cancelled', reason: 'requested', code: 143 });
    expect(process.killed()).toBe(1);
    expect(handled).toBe(0);
    expect(db.select().from(solverSlot).all()).toEqual([]);
  });

  it('cannot heartbeat or release a replacement that reused the full key', async () => {
    const { db } = database();
    const slot = reserve(db);
    const first = db.select().from(solverSlot).get();
    if (first === undefined) throw new Error('missing first slot');
    expect(
      reserveSolverSlot(db, {
        projectId: slot.projectId,
        contractVersion: slot.contractVersion,
        generation: slot.generation,
        objective: slot.objective,
        budgetMs: slot.budgetMs,
        ownerId: 'green',
        attemptToken: 'replacement',
        now: first.admittedDeadlineAt + 1,
      }),
    ).toMatchObject({ kind: 'reserved' });
    const process = deferredChild();

    const running = runSolverChildLifecycle({
      slots: createOptimizationRepository(db, new DrizzleEventLogStore(db, OPEN), OPEN),
      slot,
      child: process.child,
      now: () => first.admittedDeadlineAt + 2,
      sleep: () => Promise.resolve(),
      onExit: () => {
        throw new Error('a lost child cannot publish');
      },
    });
    await Promise.resolve();
    process.exit(137);

    expect(await running).toEqual({ kind: 'cancelled', reason: 'lost', code: 137 });
    expect(process.killed()).toBe(1);
    expect(
      db
        .select({ token: solverSlot.attemptToken, lifecycle: solverSlot.lifecycle })
        .from(solverSlot)
        .all(),
    ).toEqual([{ token: 'replacement', lifecycle: 'starting' }]);
  });
});
