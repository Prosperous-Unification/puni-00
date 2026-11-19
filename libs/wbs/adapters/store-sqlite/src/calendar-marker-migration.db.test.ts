import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { Connection } from './db';
import { openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { duplicateMigrationStamps, readMigrationFolders, rollbackTo } from './migrate-down';
import { calendarMarker } from './schema';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';
import { seedLegacyPackageParent } from './testing/legacy-package-parent';
import { UserRepository } from './user';
import { WorkPackageRepository } from './work-package';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const CALENDAR_MARKER = '20260905090000_add_calendar_marker';
/** Immutable historical folder identity; later entity renames do not rename migrations. */
const PREVIOUS = '20260904140000_add_project_settings';
const wrote: WriteStamp = { at: 1, by: 'owner' };
/** Past the first weekend, for the reason `calendar-marker.db.test.ts` states. */
const PAST_THE_WEEKEND = '2026-08-24';
let directory: string | undefined;
let hasUnknownOwner = false;
const retainedOwners: unknown[] = [];

/** Owns only this native reader; retains primary and selected-close failures in order. */
function withinStore<T>(path: string, use: (sqlite: ReturnType<typeof openDatabase>) => T): T {
  let sqlite: ReturnType<typeof openDatabase>;
  try {
    sqlite = openDatabase(path);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) {
      hasUnknownOwner = true;
      retainedOwners.push(cause);
    }
    throw cause;
  }
  let outcome: { ok: true; value: T } | { ok: false; cause: unknown };
  try {
    outcome = { ok: true, value: use(sqlite) };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  let closeFailure: { cause: unknown } | undefined;
  try {
    sqlite.close(true);
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    retainedOwners.push(sqlite);
    closeFailure = { cause };
  }
  if (closeFailure !== undefined) {
    if (!outcome.ok)
      throw new AggregateError(
        [outcome.cause, closeFailure.cause],
        'Calendar operation and close failed',
        { cause: outcome.cause },
      );
    throw closeFailure.cause;
  }
  if (!outcome.ok) throw outcome.cause;
  return outcome.value;
}

/** Keeps the actual seed connection until its one selected close returns. */
async function withinConnection(
  path: string,
  use: (connection: Connection) => Promise<void>,
): Promise<void> {
  let connection: Connection;
  try {
    connection = openConnection(path);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) {
      hasUnknownOwner = true;
      retainedOwners.push(cause);
    }
    throw cause;
  }
  let primary: { cause: unknown } | undefined;
  try {
    await use(connection);
  } catch (cause: unknown) {
    primary = { cause };
  }
  let closeFailure: { cause: unknown } | undefined;
  try {
    connection.close();
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    retainedOwners.push(connection);
    closeFailure = { cause };
  }
  if (closeFailure !== undefined) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, closeFailure.cause],
        'Calendar seed and close failed',
        { cause: primary.cause },
      );
    throw closeFailure.cause;
  }
  if (primary !== undefined) throw primary.cause;
}

function migrate(path: string, folders: string): void {
  try {
    runMigrations(path, folders);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) {
      hasUnknownOwner = true;
      retainedOwners.push(cause);
    }
    throw cause;
  }
}

async function seedWorkPackageWithMarkers(path: string): Promise<void> {
  try {
    seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
  } catch (cause: unknown) {
    // This inherited helper has its own finally-close; an unexpected failure
    // cannot establish its custody, so preserve the original and retain the fixture.
    hasUnknownOwner = true;
    retainedOwners.push(cause);
    throw cause;
  }
  await withinConnection(path, async (seed) => {
    await new UserRepository(seed.db, OPEN).create(
      { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    // Keep the package without steps or graph rows so their independent foreign keys
    // cannot prevent the plain DELETE that observes normalized marker cleanup.
    await new WorkPackageRepository(seed.db, OPEN).create(
      workPackageRow({ id: 'p1', name: 'Rewire the shed', projectId: 'fixture-project' }),
      [],
      wrote,
    );
    await seed.db.insert(calendarMarker).values([
      {
        id: 'cm-demo',
        scopeKind: 'work_package',
        scopeId: 'p1',
        date: PAST_THE_WEEKEND,
        name: 'Client demo',
        color: null,
        createdAt: 1_756_000_000,
      },
      {
        id: 'cm-deadline',
        scopeKind: 'work_package',
        scopeId: 'p1',
        date: PAST_THE_WEEKEND,
        name: 'Grant deadline',
        color: '#3b82f6',
        createdAt: 1_756_000_001,
      },
    ]);
  });
}

/** Captures all persistent schema and table cells, including the complete migration ledger. */
function captureStore(path: string) {
  return withinStore(path, (sqlite) => {
    const schema = sqlite
      .query<
        { type: string; name: string; tbl_name: string; rootpage: number; sql: string | null },
        []
      >('SELECT type,name,tbl_name,rootpage,sql FROM sqlite_master ORDER BY type,name')
      .all();
    const tables = schema
      .filter(({ type }) => type === 'table')
      .map(({ name }) => {
        const quoted = '"' + name.replaceAll('"', '""') + '"';
        const rows = sqlite.query<Record<string, unknown>, []>('SELECT * FROM ' + quoted).all();
        rows.sort((left, right) => {
          const first = JSON.stringify(left),
            second = JSON.stringify(right);
          return first < second ? -1 : first > second ? 1 : 0;
        });
        return { name, rows };
      });
    return { schema, tables };
  });
}

function tableNames(path: string): string[] {
  return withinStore(path, (sqlite) =>
    sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map(({ name }) => name),
  );
}

/** Copies the actual forty-folder historical prefix; no later down is represented by it. */
function prepareCalendarPrefix(): string {
  if (directory === undefined) throw new Error('Calendar fixture directory was not acquired');
  const folders = join(directory, 'calendar-prefix');
  mkdirSync(folders);
  const selected = readMigrationFolders(FOLDER).filter(({ name }) => name <= CALENDAR_MARKER);
  expect(selected).toHaveLength(40);
  expect(selected.at(-2)?.name).toBe(PREVIOUS);
  expect(selected.at(-1)?.name).toBe(CALENDAR_MARKER);
  for (const folder of selected)
    cpSync(join(FOLDER, folder.name), join(folders, folder.name), { recursive: true });
  return folders;
}

describe('20260905090000_add_calendar_marker', () => {
  let path: string;

  beforeEach(() => {
    if (directory !== undefined || hasUnknownOwner || retainedOwners.length !== 0)
      throw new Error('Previous calendar migration fixture is unsettled');
    directory = mkdtempSync(join(tmpdir(), 'wbs-calendar-marker-migration-'));
    path = join(directory, 'test.db');
  });

  afterEach(() => {
    if (directory === undefined) return;
    if (hasUnknownOwner || retainedOwners.length !== 0)
      throw new Error('Unknown calendar migration cleanup; fixture retained at ' + directory);
    rmSync(directory, { recursive: true });
    directory = undefined;
  });

  it('lets a plain DELETE FROM work_package take its markers with it', async () => {
    // Current scope normalization replaces the former FK cascade with the package
    // cleanup trigger. This still observes an actual plain package DELETE without
    // manually deleting its markers. The fixture has no steps or private graph rows.
    //
    // Historical evidence below predates the normalized scope columns. The current
    // full-chain DELETE is owned by work_package_settings_delete; its own physical
    // negative is still pending and is not credited by this earlier cascade proof.
    // Proof: with `ON DELETE CASCADE` removed from the `FOREIGN KEY` clause in
    // `20260905090000_add_calendar_marker/migration.sql` (leaving the reference
    // in place), this fails on the `DELETE` with `FOREIGN KEY constraint
    // failed`, because `openDatabase` asserts `PRAGMA foreign_keys = ON` rather
    // than requesting it. Watched failing exactly that way on h2puni,
    // 2026-09-05, before the seed was narrowed — the fault reproduces, and the
    // narrowing is what makes the red mean this table.
    migrate(path, FOLDER);
    await seedWorkPackageWithMarkers(path);

    withinStore(path, (db) => {
      db.run("DELETE FROM work_package WHERE id = 'p1'");
      const left = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM calendar_marker').get();
      expect(left?.n).toBe(0);
    });
  });

  it('refuses latest full-chain rollback without changing schema, rows or migration identities', () => {
    migrate(path, FOLDER);
    const before = captureStore(path);
    const expected =
      'rolling back 20261110120100_space_holds_projects_people_teams failed: space project rollback requires restoring the verified window snapshot';
    let refusal: { cause: unknown } | undefined;
    try {
      rollbackTo(path, FOLDER, PREVIOUS);
    } catch (cause: unknown) {
      refusal = { cause };
      // The public wrapper still owns an untagged finally-close. Unexpected failures
      // retain this fixture; this case makes no independent paired-close assertion.
      if (!(cause instanceof Error) || cause.message !== expected) {
        hasUnknownOwner = true;
        retainedOwners.push(cause);
        throw cause;
      }
    }
    expect(refusal).toBeDefined();
    expect(captureStore(path)).toEqual(before);
  });

  it('reverses only the calendar migration on its actual historical prefix', () => {
    // Historical observations below are retained verbatim. Today readMigrationFolders
    // rejects both missing and empty down.sql before rollback; the old empty-script
    // ledger/table failure is not a claim about the current lint boundary.
    // Proof, two mutations, each watched separately:
    //   (a) `20260905090000_add_calendar_marker/down.sql` deleted — every test
    //       that calls `readMigrationFolders` or `rollbackTo` fails with
    //       `has no down.sql`, including this one and
    //       `pairs every migration on disk with a down script` in
    //       `migrate-down.db.test.ts`.
    //   (b) the same file emptied — the lint still passes, because a file
    //       exists, and *this* case fails instead: the rollback reports
    //       it reversed `CALENDAR_MARKER` while `calendar_marker` is still in
    //       `sqlite_master`. That gap between the two is why the empty file is
    //       a separate mutation and not a restatement of the first.
    const folders = prepareCalendarPrefix();
    migrate(path, folders);
    const before = tableNames(path);
    expect(before).toContain('calendar_marker');
    let reversed: string[];
    try {
      reversed = rollbackTo(path, folders, PREVIOUS);
    } catch (cause: unknown) {
      // Preserve the public caller, including its inherited finally-close limitation.
      // Its unexpected failure cannot establish cleanup, so retain the fixture.
      hasUnknownOwner = true;
      retainedOwners.push(cause);
      throw cause;
    }
    expect(reversed).toEqual([CALENDAR_MARKER]);
    // Table inventory only: this does not claim byte-for-byte preservation of schema.
    expect(tableNames(path)).toEqual(before.filter((name) => name !== 'calendar_marker'));
  });

  it('is stamped directly after its actual predecessor and collides with none', () => {
    // A colliding stamp is the failure with no error message: drizzle records
    // the folder's numeric prefix as `created_at`, `migrationsToRollback`
    // filters on a strict `created_at >`, and a rollback whose baseline names
    // either of a colliding pair reverses nothing and reports success.
    //
    // Proof: with this folder renamed to `20260904020000_add_calendar_marker`,
    // `duplicateMigrationStamps` returns `[20260904020000]` and this fails on
    // the first assertion.
    const names = readdirSync(FOLDER).sort();

    expect(names).toContain(CALENDAR_MARKER);
    expect(duplicateMigrationStamps(names)).toEqual([]);
    // Later than every folder that existed when this one was written, which is
    // every folder up to and including `PREVIOUS`. Not `at(-1)`: that was true
    // only while this was the newest folder on disk, and it would make every
    // migration landing after it a failure of this file — `read_order_index`
    // landed above it on 2026-09-06 and is the first to prove that.
    expect(names.indexOf(CALENDAR_MARKER)).toBe(names.indexOf(PREVIOUS) + 1);
  });
});
