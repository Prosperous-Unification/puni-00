import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Connection, openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { StepNodeAttemptRepository } from './step-node-attempt';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const wrote: WriteStamp = { at: 1, by: 'u' };

let dir: string;
let path: string;
let connection: Connection;
let attempts: StepNodeAttemptRepository;

function withDatabase<T>(read: (sqlite: Database) => T): T {
  const sqlite = openDatabase(path);
  try {
    return read(sqlite);
  } finally {
    sqlite.close();
  }
}

/**
 * Leaf `a` and its sibling `b` in project `p`, whose steps are `dev` then `qa`
 * with ids that sort against their positions, and person `kat`.
 */
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-step-node-attempt-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  withDatabase((sqlite) => {
    sqlite.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u','owner','x',1)",
    );
    sqlite.run(
      "INSERT INTO project (id, name, owner_id, restricted, estimate_method, revision, created_at) VALUES ('p','Project','u',0,'pert',0,1)",
    );
    sqlite.run(
      "INSERT INTO step (id, project_id, name, position) VALUES ('dev','p','Dev',10),('a-qa','p','QA',20)",
    );
    sqlite.run(
      "INSERT INTO work_item (id, project_id, position, name, revision) VALUES ('a','p',1,'A',0),('b','p',2,'B',0)",
    );
    sqlite.run("INSERT INTO person (id, name) VALUES ('kat','Kat')");
  });
  connection = openConnection(path);
  attempts = new StepNodeAttemptRepository(connection.db, OPEN);
});
afterEach(() => {
  connection.close();
  rmSync(dir, { recursive: true, force: true });
});

const start = (workItemId: string, stepId: string, startedAt: number) =>
  attempts.start(
    { workItemId, stepId, startedAt, executorPersonId: null, reference: null, note: null },
    { at: startedAt, by: 'u' },
  );

const revisionOf = (id: string) =>
  withDatabase(
    (sqlite) =>
      sqlite
        .query<{ revision: number }, [string]>('SELECT revision FROM work_item WHERE id = ?1')
        .get(id)?.revision,
  );

describe('StepNodeAttemptRepository', () => {
  it('numbers at max + 1, ends with the prior row, and reads ascending per step', async () => {
    expect(await start('a', 'dev', 100)).toEqual({
      ok: true,
      attempt: {
        workItemId: 'a',
        stepId: 'dev',
        attemptNumber: 1,
        startedAt: 100,
        endedAt: null,
        outcome: null,
        executorPersonId: null,
        reference: null,
        note: null,
      },
    });
    const ended = await attempts.end(
      { workItemId: 'a', stepId: 'dev', endedAt: 150, outcome: 'failed', reference: 'PR #11' },
      wrote,
    );
    expect(ended).toMatchObject({
      ok: true,
      prior: { attemptNumber: 1, endedAt: null, outcome: null, reference: null },
      attempt: { attemptNumber: 1, endedAt: 150, outcome: 'failed', reference: 'PR #11' },
    });
    await attempts.start(
      {
        workItemId: 'a',
        stepId: 'dev',
        startedAt: 160,
        executorPersonId: 'kat',
        reference: null,
        note: 'retry',
      },
      wrote,
    );
    await start('a', 'a-qa', 170);
    await start('b', 'dev', 90);
    expect(
      (await attempts.listByProject('p')).map(
        ({ workItemId, stepId, attemptNumber }) =>
          `${workItemId}/${stepId}#${String(attemptNumber)}`,
      ),
    ).toEqual(['a/dev#1', 'a/dev#2', 'a/a-qa#1', 'b/dev#1']);
    expect(
      (await attempts.listByWorkItems('p', ['b', 'elsewhere'])).map(({ workItemId }) => workItemId),
    ).toEqual(['b']);
    const ofA = await attempts.listOfWorkItem('a');
    expect([...ofA.keys()]).toEqual(['dev', 'a-qa']);
    expect(
      ofA.get('dev')?.map(({ attemptNumber, executorPersonId, note }) => ({
        attemptNumber,
        executorPersonId,
        note,
      })),
    ).toEqual([
      { attemptNumber: 1, executorPersonId: null, note: null },
      { attemptNumber: 2, executorPersonId: 'kat', note: 'retry' },
    ]);
    // Every write moved the leaf's revision: four on `a`, one on `b`.
    expect(revisionOf('a')).toBe(4);
    expect(revisionOf('b')).toBe(1);
  });

  it('refuses a second running start as attempt_running and an end with none running', async () => {
    await start('a', 'dev', 100);
    expect(await start('a', 'dev', 120)).toEqual({ ok: false, reason: 'attempt_running' });
    expect(
      await attempts.end(
        { workItemId: 'a', stepId: 'a-qa', endedAt: 150, outcome: 'succeeded' },
        wrote,
      ),
    ).toEqual({ ok: false, reason: 'no_running_attempt' });
    expect(await attempts.listByProject('p')).toHaveLength(1);
  });

  it('removes by number and restores verbatim, numbers included', async () => {
    await start('a', 'dev', 100);
    await attempts.end(
      { workItemId: 'a', stepId: 'dev', endedAt: 150, outcome: 'cancelled', note: 'wrong branch' },
      wrote,
    );
    await start('a', 'dev', 160);
    const removed = await attempts.remove('a', 'dev', 1, wrote);
    expect(removed).toMatchObject({ attemptNumber: 1, outcome: 'cancelled', note: 'wrong branch' });
    expect(await attempts.remove('a', 'dev', 1, wrote)).toBeNull();
    if (removed === null) throw new Error('nothing removed');
    await attempts.restore(removed, wrote);
    const prior = await attempts.end(
      { workItemId: 'a', stepId: 'dev', endedAt: 170, outcome: 'succeeded' },
      wrote,
    );
    if (!prior.ok) throw new Error('no attempt ended');
    // The end's inverse: the running row back over the ended one.
    await attempts.restore(prior.prior, wrote);
    expect(
      (await attempts.listByProject('p')).map(({ attemptNumber, outcome, note }) => ({
        attemptNumber,
        outcome,
        note,
      })),
    ).toEqual([
      { attemptNumber: 1, outcome: 'cancelled', note: 'wrong branch' },
      { attemptNumber: 2, outcome: null, note: null },
    ]);
  });

  it('cascades with its work item and lets a deleted executor go', async () => {
    await attempts.start(
      {
        workItemId: 'a',
        stepId: 'dev',
        startedAt: 100,
        executorPersonId: 'kat',
        reference: null,
        note: null,
      },
      wrote,
    );
    await start('b', 'dev', 100);
    withDatabase((sqlite) => {
      sqlite.run("DELETE FROM person WHERE id = 'kat'");
      expect(sqlite.query('SELECT executor_person_id FROM step_node_attempt').all()).toEqual([
        { executor_person_id: null },
        { executor_person_id: null },
      ]);
      sqlite.run("DELETE FROM work_item WHERE id = 'a'");
    });
    expect((await attempts.listByProject('p')).map(({ workItemId }) => workItemId)).toEqual(['b']);
  });

  it('hands every attempt down to a first child, numbers kept, moving both revisions', async () => {
    await start('a', 'dev', 100);
    await attempts.end({ workItemId: 'a', stepId: 'dev', endedAt: 120, outcome: 'failed' }, wrote);
    await start('a', 'dev', 130);
    withDatabase((sqlite) => {
      sqlite.run(
        "INSERT INTO work_item (id, project_id, parent_id, position, name, revision) VALUES ('c','p','a',1,'C',0)",
      );
    });
    const before = revisionOf('a') ?? 0;
    await attempts.moveAll('a', 'c', wrote);
    expect(
      (await attempts.listByProject('p')).map(
        ({ workItemId, attemptNumber, outcome }) =>
          `${workItemId}#${String(attemptNumber)}:${String(outcome)}`,
      ),
    ).toEqual(['c#1:failed', 'c#2:null']);
    expect(revisionOf('a')).toBe(before + 1);
    expect(revisionOf('c')).toBe(1);
    // Nothing to move: no revision moves.
    await attempts.moveAll('b', 'c', wrote);
    expect(revisionOf('c')).toBe(1);
  });

  const numbersOn = async (workItemId: string) =>
    (await attempts.listByProject('p'))
      .filter((each) => each.workItemId === workItemId)
      .map(({ attemptNumber }) => attemptNumber);

  const startEnded = async (workItemId: string, startedAt: number) => {
    await start(workItemId, 'dev', startedAt);
    await attempts.end(
      { workItemId, stepId: 'dev', endedAt: startedAt + 1, outcome: 'failed' },
      wrote,
    );
  };

  /**
   * The spec's "numbers count up and never reuse" (A42): the removed number
   * was the highest, so only the stored high-water mark knows it was issued.
   *
   * Proof, watched 2026-10-12: with `start` reading `max(attempt_number)` over
   * the rows alone (the `step_node_attempt_issued` read dropped) this case
   * started `"attemptNumber": 2` where 3 was owed.
   */
  it('numbers past a removed highest attempt: remove 2 of {1, 2}, the next is 3', async () => {
    await startEnded('a', 100);
    await startEnded('a', 110);
    await attempts.remove('a', 'dev', 2, wrote);

    expect(await start('a', 'dev', 120)).toMatchObject({ ok: true, attempt: { attemptNumber: 3 } });
    expect(await numbersOn('a')).toEqual([1, 3]);
  });

  it('numbers past a removed lower attempt: remove 1 of {1, 2}, the next is 3', async () => {
    await startEnded('a', 100);
    await startEnded('a', 110);
    await attempts.remove('a', 'dev', 1, wrote);

    expect(await start('a', 'dev', 120)).toMatchObject({ ok: true, attempt: { attemptNumber: 3 } });
  });

  it('restores a removed attempt under its own number, renumbering nothing', async () => {
    await startEnded('a', 100);
    await startEnded('a', 110);
    const removed = await attempts.remove('a', 'dev', 2, wrote);
    if (removed === null) throw new Error('nothing removed');
    await attempts.restore(removed, wrote);

    expect(await numbersOn('a')).toEqual([1, 2]);
    expect(await start('a', 'dev', 120)).toMatchObject({ ok: true, attempt: { attemptNumber: 3 } });
  });

  it('raises the mark with a restored number above it and never lowers it', async () => {
    await startEnded('a', 100);
    const first = (await attempts.listByProject('p')).at(0);
    if (first === undefined) throw new Error('nothing started');
    await attempts.restore({ ...first, attemptNumber: 5 }, wrote);
    await attempts.raiseIssued([{ workItemId: 'a', stepId: 'dev', issued: 2 }]);
    expect(await attempts.listIssued('p', ['a', 'b'])).toEqual([
      { workItemId: 'a', stepId: 'dev', issued: 5 },
    ]);

    await attempts.raiseIssued([{ workItemId: 'b', stepId: 'a-qa', issued: 4 }]);
    expect(await start('b', 'a-qa', 120)).toMatchObject({
      ok: true,
      attempt: { attemptNumber: 5 },
    });
  });

  it('copies the mark to a first child, past a highest removed before the child arrived', async () => {
    await startEnded('a', 100);
    await startEnded('a', 110);
    await attempts.remove('a', 'dev', 2, wrote);
    // Only a mark is left at the QA node: its one attempt was removed.
    await start('a', 'a-qa', 120);
    await attempts.remove('a', 'a-qa', 1, wrote);
    withDatabase((sqlite) => {
      sqlite.run(
        "INSERT INTO work_item (id, project_id, parent_id, position, name, revision) VALUES ('c','p','a',1,'C',0)",
      );
    });
    await attempts.moveAll('a', 'c', wrote);

    expect(await attempts.listIssued('p', ['a', 'c'])).toEqual([
      { workItemId: 'a', stepId: 'a-qa', issued: 1 },
      { workItemId: 'a', stepId: 'dev', issued: 2 },
      { workItemId: 'c', stepId: 'a-qa', issued: 1 },
      { workItemId: 'c', stepId: 'dev', issued: 2 },
    ]);
    expect(await start('c', 'dev', 130)).toMatchObject({ ok: true, attempt: { attemptNumber: 3 } });
    expect(await start('c', 'a-qa', 130)).toMatchObject({
      ok: true,
      attempt: { attemptNumber: 2 },
    });
  });

  it('cascades the mark with its work item and its step', async () => {
    await start('a', 'dev', 100);
    await start('b', 'a-qa', 100);
    withDatabase((sqlite) => {
      sqlite.run("DELETE FROM work_item WHERE id = 'a'");
      sqlite.run("DELETE FROM step_node_attempt WHERE step_id = 'a-qa'");
      sqlite.run("DELETE FROM step WHERE id = 'a-qa'");
      expect(sqlite.query('SELECT * FROM step_node_attempt_issued').all()).toEqual([]);
    });
  });

  /**
   * Proof, watched 2026-10-12: with `step_node_attempt_running` dropped from
   * `migration.sql` this case read `["started", "started"]` (two running rows,
   * numbered 1 and 2). With the `max + 1` read moved before the transaction
   * alone it still passed — the partial index refuses the loser's duplicate
   * as `attempt_running` — and with both faults together the loser read
   * `threw: Failed query: insert … params: a,dev,1,…`, its primary-key
   * violation on a reused number.
   * Proof, reobserved 2026-10-26: omitting only the running partial index
   * made these actual workers answer `["started", "started"]`; restoring the
   * migration's exact bytes restored `attempt_running` and one stored row.
   */
  it('lets one of two concurrent starts win and tells the other attempt_running', async () => {
    const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const state = new Int32Array(barrier);
    const first = new Worker(new URL('./step-node-attempt-race.worker.ts', import.meta.url));
    const second = new Worker(new URL('./step-node-attempt-race.worker.ts', import.meta.url));
    try {
      const outcome = (worker: Worker) =>
        new Promise<string>((resolve, reject) => {
          worker.onmessage = (message: MessageEvent<string>) => {
            resolve(message.data);
          };
          worker.onerror = reject;
        });
      const outcomes = Promise.all([outcome(first), outcome(second)]);
      // Worker imports precede database-open readiness; bounded CPU contention
      // spent 13.7s there, while opening the databases took only 6–11ms.
      // Proof: four CPU rivals on two CPUs made the former 5s check see 0;
      // this monotonic 20s allowance passed twice within the 30s test ceiling.
      const deadline = performance.now() + 20_000;
      first.postMessage({ path, barrier, startedAt: 100 });
      second.postMessage({ path, barrier, startedAt: 101 });
      while (Atomics.load(state, 0) < 2 && performance.now() < deadline) {
        await Bun.sleep(5);
      }
      expect(Atomics.load(state, 0)).toBe(2);
      // The write lock held while both are released, so each reaches its
      // `BEGIN IMMEDIATE` (or, with the read outside it, reads the node
      // first) before either can write; the hold is far below `busy_timeout`.
      const holder = openDatabase(path);
      try {
        holder.run('BEGIN IMMEDIATE');
        Atomics.store(state, 1, 1);
        Atomics.notify(state, 1, 2);
        await Bun.sleep(300);
        holder.run('COMMIT');
      } finally {
        holder.close();
      }
      expect((await outcomes).sort()).toEqual(['attempt_running', 'started']);
    } finally {
      Atomics.store(state, 1, 1);
      Atomics.notify(state, 1, 2);
      first.terminate();
      second.terminate();
    }
    expect(
      withDatabase((sqlite) =>
        sqlite.query('SELECT attempt_number, ended_at FROM step_node_attempt ORDER BY 1').all(),
      ),
    ).toEqual([{ attempt_number: 1, ended_at: null }]);
  });

  it('refuses node_done for a node stated done, writing nothing', async () => {
    withDatabase((sqlite) => {
      sqlite.run(
        "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES ('a','dev','done',1)",
      );
    });
    expect(await start('a', 'dev', 100)).toEqual({ ok: false, reason: 'node_done' });
    expect(await numbersOn('a')).toEqual([]);
    expect(await attempts.listIssued('p', ['a'])).toEqual([]);
  });

  /**
   * The blue/green overlap a service-side check cannot see: another process
   * states the node done while this start waits at `BEGIN IMMEDIATE`, after
   * any read the caller made before the store. The node's state is read inside
   * the start's own transaction, so the start refuses.
   *
   * Proof, watched 2026-10-12: with the in-transaction `step_progress` read
   * removed from `start`, this case read `started` and stored attempt 1 under
   * the done node.
   */
  it('refuses a start that waited while another process stated the node done', async () => {
    const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const state = new Int32Array(barrier);
    const starter = new Worker(new URL('./step-node-attempt-race.worker.ts', import.meta.url));
    let workerError: ErrorEvent | undefined;
    try {
      const outcome = new Promise<string>((resolve, reject) => {
        starter.onmessage = (message: MessageEvent<string>) => {
          resolve(message.data);
        };
        starter.onerror = (error) => {
          workerError = error;
          // Preserve the original Bun onerror rejection: its ErrorEvent is the existing worker boundary.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        };
      });
      starter.postMessage({ path, barrier, startedAt: 100 });
      const deadline = Date.now() + 5_000;
      while (Atomics.load(state, 0) < 1 && Date.now() < deadline) {
        await Bun.sleep(5);
      }
      const ready = Atomics.load(state, 0);
      expect(
        ready,
        `worker phase=before-release; ready=${String(ready)}; original worker error=${
          workerError === undefined
            ? 'none observed'
            : `${workerError.message} at ${workerError.filename}:${String(workerError.lineno)}:${String(workerError.colno)}`
        }`,
      ).toBe(1);
      const stater = openDatabase(path);
      try {
        stater.run('BEGIN IMMEDIATE');
        Atomics.store(state, 1, 1);
        Atomics.notify(state, 1, 1);
        // The starter reaches its `BEGIN IMMEDIATE` and waits behind this lock.
        await Bun.sleep(300);
        stater.run(
          "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES ('a','dev','done',1)",
        );
        stater.run('COMMIT');
      } finally {
        stater.close();
      }
      expect(await outcome).toBe('node_done');
    } finally {
      Atomics.store(state, 1, 1);
      Atomics.notify(state, 1, 1);
      starter.terminate();
    }
    expect(
      withDatabase((sqlite) => sqlite.query('SELECT attempt_number FROM step_node_attempt').all()),
    ).toEqual([]);
  });
});
