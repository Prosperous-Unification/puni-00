import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WorkPackage, WriteStamp } from '@wbs/core';
import { DEFAULT_PRIORITY_BANDS, type PriorityBand } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { PriorityBandRepository } from './priority-band';
import { seedLegacyPackageParent } from './testing/legacy-package-parent';
import { UserRepository } from './user';
import { WorkPackageRepository } from './work-package';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

/** The stamp every write here carries; `owner` is the account the setup creates first. */
const wrote: WriteStamp = { at: 1, by: 'owner' };

/** A ladder that is nothing like the default one, so "read it back" cannot pass by accident. */
const RECUT: readonly PriorityBand[] = [
  { startsAt: 1, label: 'Blocker', defaultValue: 5 },
  { startsAt: 16, label: 'Urgent', defaultValue: 20 },
  { startsAt: 31, label: 'Normal', defaultValue: 40 },
  { startsAt: 71, label: 'Someday', defaultValue: 75 },
  { startsAt: 200, label: 'Never', defaultValue: 900 },
];

/**
 * What one work package calls its priority numbers, against real SQLite.
 *
 * Two things here are the change rather than an implementation detail of it, and
 * both are the read: a work package holding **no rows** answers the default ladder,
 * and a work package holding rows answers **its own**. Either alone is a passing test
 * for a broken store — an unconditional default passes the first, and a store
 * with no fallback at all passes the second — so each is watched against the
 * other's injection.
 */
describe('a work package’s priority ladder', () => {
  let dir: string;
  /** The raw handle, for the two claims that are about rows rather than about the store. */
  let sqlite: Database;
  let bands: PriorityBandRepository;

  const workPackage = (id: string, name: string): WorkPackage =>
    workPackageRow({
      id,
      name,
      projectId: 'fixture-project',
    });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-priority-band-'));
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
    const db = openDrizzle(path);
    sqlite = openDatabase(path);
    bands = new PriorityBandRepository(db, OPEN);
    await new UserRepository(db, OPEN).create(
      { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    const workPackages = new WorkPackageRepository(db, OPEN);
    // Created **through the repository**, which is the release under test — so
    // neither work package is seeded by the migration and both are in the state every
    // work package made after the deploy is in. That is the state the read's default
    // arm exists for, and a fixture that hand-seeded rows would hide it.
    await workPackages.create(workPackage('p1', 'Rewire the shed'), [], wrote);
    await workPackages.create(workPackage('p2', 'Reroof the barn'), [], wrote);
  });

  afterEach(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers the default ladder for a work package holding no rows of its own', async () => {
    // The state every work package created after the migration is in — including one
    // created by the outgoing release during a blue/green swap, which is the
    // window this arm exists to close. `DEFAULT_PRIORITY_BANDS` is a constant in
    // the source and not a number anybody typed, which is why reading it back is
    // not the fallback `capacity-per-work-package` D1 refuses. design.md D2.
    //
    // Proof: the `rows.length === 0` arm deleted so the query's answer is
    // returned bare, and this failed on a `toEqual` diff of all five bands
    // (`Expected - 27 / Received + 1`) — a plan whose every priority resolves to
    // no label at all. 5 pass, 2 fail; watched 2026-08-14.
    expect(await bands.listFor('p1')).toEqual([...DEFAULT_PRIORITY_BANDS]);
    // No rows were written to get that answer: the read is a fallback, not a
    // lazy seeding, so two clients reading the same unconfigured work package do not
    // race to insert.
    expect(
      sqlite.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM work_package_priority_band').get()
        ?.n,
    ).toBe(0);
  });

  it('answers a work package’s own ladder rather than the default one', async () => {
    // Proof: the `length === 0` arm replaced by an unconditional
    // `DEFAULT_PRIORITY_BANDS`, and three cases here went red — this one and
    // `answers in rank order` on `toEqual` diffs, and `trims a name on the way in`
    // on `Expected: "Blocker" / Received: "Critical"`. A work package that had re-cut
    // its ladder handed back the five it replaced. 4 pass, 3 fail; watched
    // 2026-08-14.
    expect(await bands.replace('p1', RECUT, wrote)).toEqual({ ok: true });

    expect(await bands.listFor('p1')).toEqual([...RECUT]);
    // And the other work package is untouched, which is the whole of "per work package":
    // one plan's vocabulary is not another's.
    expect(await bands.listFor('p2')).toEqual([...DEFAULT_PRIORITY_BANDS]);
  });

  it('answers in rank order, whatever order the rows come back in', async () => {
    await bands.replace('p1', RECUT, wrote);
    // The rows written out of order behind the store's back, which is the one
    // way to tell an `ORDER BY` from a query planner that happens to agree with
    // it. Rank 0 is the most important rung on every face, and a list in
    // insertion order would colour a plan by whichever row SQLite reached first.
    sqlite.run('DELETE FROM work_package_priority_band WHERE work_package_id = ?', ['p1']);
    for (const rank of [3, 0, 4, 2, 1]) {
      const band = RECUT.at(rank);
      if (band === undefined) throw new Error(`no band at rank ${String(rank)}`);
      sqlite.run(
        'INSERT INTO work_package_priority_band (work_package_id, rank, starts_at, label, default_value) VALUES (?, ?, ?, ?, ?)',
        ['p1', rank, band.startsAt, band.label, band.defaultValue],
      );
    }

    expect((await bands.listFor('p1')).map((band) => band.label)).toEqual([
      'Blocker',
      'Urgent',
      'Normal',
      'Someday',
      'Never',
    ]);
  });

  it('replaces the whole ladder rather than merging into it', async () => {
    // Delete-then-insert, and the delete is load-bearing. Proof: the `tx.delete`
    // struck, and this failed with `UNIQUE constraint failed:
    // work_package_priority_band.work_package_id, work_package_priority_band.rank` — five rows
    // written over five that were never taken away. Watched 2026-08-14.
    await bands.replace('p1', RECUT, wrote);
    await bands.replace('p1', DEFAULT_PRIORITY_BANDS, wrote);

    expect(await bands.listFor('p1')).toEqual([...DEFAULT_PRIORITY_BANDS]);
    expect(
      sqlite
        .query<{ n: number }, [string]>(
          'SELECT COUNT(*) AS n FROM work_package_priority_band WHERE work_package_id = ?',
        )
        .get('p1')?.n,
    ).toBe(5);
  });

  it('trims a name on the way in, so two spellings of one word are one', async () => {
    await bands.replace('p1', [{ ...RECUT[0], label: '  Blocker  ' }, ...RECUT.slice(1)], wrote);
    expect((await bands.listFor('p1')).at(0)?.label).toBe('Blocker');
  });

  it('refuses a work package that is not there, and writes nothing', async () => {
    // Proof: the existence read deleted from the transaction, leaving the foreign
    // key as the only guard, and this failed with an uncaught `SQLiteError:
    // FOREIGN KEY constraint failed` where a modeled `not_found` was owed — an
    // unknown at the service boundary rather than the 404 a caller can act on.
    // Watched 2026-08-14.
    expect(await bands.replace('nobody-holds-this', RECUT, wrote)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(
      sqlite.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM work_package_priority_band').get()
        ?.n,
    ).toBe(0);
  });

  it('loses its ladder when the work package goes, by the cascade and nothing else', async () => {
    // The cascade is the only mechanism: no application code deletes these rows
    // on the way to deleting a work package, and the outgoing release's plain
    // `DELETE FROM workPackage` knows nothing about this table. Proof: with
    // `ON DELETE CASCADE` off the migration, `lets the outgoing release keep
    // writing work packages against the migrated schema` in `migrate.test.ts` fails on
    // `FOREIGN KEY constraint failed`. Watched 2026-08-14.
    await bands.replace('p1', RECUT, wrote);
    sqlite.run('DELETE FROM work_package WHERE id = ?', ['p1']);

    expect(
      sqlite
        .query<{ n: number }, [string]>(
          'SELECT COUNT(*) AS n FROM work_package_priority_band WHERE work_package_id = ?',
        )
        .get('p1')?.n,
    ).toBe(0);
  });
});
