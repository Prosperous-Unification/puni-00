import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import fc from 'fast-check';

import { type Connection, openConnection, openReadOnlyConnection, poolReadConnections } from './db';

/**
 * {@link poolReadConnections} against a model of its ownership: random sequences of acquire,
 * a read transaction on a lent connection, release, a second release, a failing `open` and the
 * pool's close, at idle limits 0 to 3, over a real WAL file with a writer beside it.
 *
 * Invariants after every command: connections open equal the model's idle plus lent; no two
 * lent handles share a connection; nothing is idle once the pool closed; and while no lent
 * connection is inside a transaction, a full checkpoint is not blocked.
 *
 * Proof (each watched failing 2026-10-28; counterexamples in verify.md, slice 12): the
 * released guard dropped (a connection lent twice); the `closed` test dropped (idle after
 * close); the idle limit dropped; the in-transaction test dropped.
 */

interface Lent {
  readonly handle: Connection;
  /** The Bun client under the handle, read before its release. */
  readonly client: unknown;
  inTransaction: boolean;
  released: boolean;
}

interface Model {
  idle: number;
  closed: boolean;
  openFails: boolean;
}

interface Real {
  readonly pool: ReturnType<typeof poolReadConnections>;
  readonly opened: { now: number };
  readonly lent: Lent[];
  readonly writer: Connection;
  fail: boolean;
  inserted: number;
}

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-db-pool-model-'));
  path = join(dir, 'test.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function clientOf(handle: Connection): unknown {
  return (handle.db as unknown as { $client: unknown }).$client;
}

function check(model: Model, real: Real): void {
  const unreleased = real.lent.filter((each) => !each.released);
  expect(real.opened.now).toBe(model.idle + unreleased.length);
  expect(new Set(unreleased.map((each) => each.client)).size).toBe(unreleased.length);
  if (model.closed) expect(model.idle).toBe(0);
  if (!unreleased.some((each) => each.inTransaction)) {
    real.inserted += 1;
    real.writer.db.run(sql`INSERT INTO t VALUES (${real.inserted})`);
    const busy = real.writer.db
      .all<{ busy: number }>(sql.raw('PRAGMA wal_checkpoint(TRUNCATE)'))
      .map((row) => row.busy);
    expect(busy).toEqual([0]);
  }
}

class Acquire implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real): void {
    if (model.closed) {
      expect(() => real.pool.acquire()).toThrow('the read connection pool is closed');
    } else if (model.idle === 0 && model.openFails) {
      expect(() => real.pool.acquire()).toThrow('open failed');
    } else {
      const handle = real.pool.acquire();
      real.lent.push({ handle, client: clientOf(handle), inTransaction: false, released: false });
      if (model.idle > 0) model.idle -= 1;
    }
    check(model, real);
  }
  toString = () => 'acquire';
}

class Read implements fc.Command<Model, Real> {
  constructor(readonly pick: number) {}
  check = (_: Readonly<Model>) => true;
  run(model: Model, real: Real): void {
    const live = real.lent.filter((each) => !each.released && !each.inTransaction);
    const chosen = live.at(this.pick % Math.max(live.length, 1));
    if (chosen !== undefined) {
      chosen.handle.db.run(sql.raw('BEGIN DEFERRED'));
      chosen.handle.db.all(sql`SELECT count(*) FROM t`);
      chosen.inTransaction = true;
    }
    check(model, real);
  }
  toString = () => `read(${String(this.pick)})`;
}

class Release implements fc.Command<Model, Real> {
  constructor(
    readonly pick: number,
    readonly commit: boolean,
    readonly idleLimit: number,
  ) {}
  check = () => true;
  run(model: Model, real: Real): void {
    const live = real.lent.filter((each) => !each.released);
    const chosen = live.at(this.pick % Math.max(live.length, 1));
    if (chosen !== undefined) {
      if (chosen.inTransaction && this.commit) {
        chosen.handle.db.run(sql.raw('COMMIT'));
        chosen.inTransaction = false;
      }
      const pooled = !model.closed && model.idle < this.idleLimit && !chosen.inTransaction;
      chosen.handle.close();
      chosen.released = true;
      if (pooled) model.idle += 1;
    }
    check(model, real);
  }
  toString = () => `release(${String(this.pick)}, ${this.commit ? 'commit first' : 'as is'})`;
}

class ReleaseAgain implements fc.Command<Model, Real> {
  constructor(readonly pick: number) {}
  check = () => true;
  run(model: Model, real: Real): void {
    const released = real.lent.filter((each) => each.released);
    released.at(this.pick % Math.max(released.length, 1))?.handle.close();
    check(model, real);
  }
  toString = () => `releaseAgain(${String(this.pick)})`;
}

class FailOpen implements fc.Command<Model, Real> {
  constructor(readonly fails: boolean) {}
  check = () => true;
  run(model: Model, real: Real): void {
    model.openFails = this.fails;
    real.fail = this.fails;
    check(model, real);
  }
  toString = () => `openFails(${String(this.fails)})`;
}

class ClosePool implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real): void {
    real.pool.close();
    model.closed = true;
    model.idle = 0;
    check(model, real);
  }
  toString = () => 'closePool';
}

describe('poolReadConnections, model-based', () => {
  it('keeps its ownership invariants under any sequence of uses', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 0, max: 3 })
          .chain((idleLimit) =>
            fc.tuple(
              fc.constant(idleLimit),
              fc.commands(
                [
                  fc.constant(new Acquire()),
                  fc.nat(7).map((pick) => new Read(pick)),
                  fc
                    .tuple(fc.nat(7), fc.boolean())
                    .map(([pick, commit]) => new Release(pick, commit, idleLimit)),
                  fc.nat(7).map((pick) => new ReleaseAgain(pick)),
                  fc.boolean().map((fails) => new FailOpen(fails)),
                  fc.constant(new ClosePool()),
                ],
                { maxCommands: 40 },
              ),
            ),
          ),
        ([idleLimit, commands]) => {
          rmSync(path, { force: true });
          rmSync(`${path}-wal`, { force: true });
          rmSync(`${path}-shm`, { force: true });
          const writer = openConnection(path);
          writer.db.run(sql.raw('CREATE TABLE IF NOT EXISTS t (a INTEGER)'));
          const opened = { now: 0 };
          const real: Real = {
            opened,
            lent: [],
            writer,
            fail: false,
            inserted: 0,
            pool: poolReadConnections(() => {
              if (real.fail) throw new Error('open failed');
              const connection = openReadOnlyConnection(path);
              opened.now += 1;
              return {
                db: connection.db,
                close: () => {
                  connection.close();
                  opened.now -= 1;
                },
              };
            }, idleLimit),
          };
          try {
            fc.modelRun(
              () => ({ model: { idle: 0, closed: false, openFails: false }, real }),
              commands,
            );
          } finally {
            for (const each of real.lent) each.handle.close();
            real.pool.close();
            writer.close();
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
