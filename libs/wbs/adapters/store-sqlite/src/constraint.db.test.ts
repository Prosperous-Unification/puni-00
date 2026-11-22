import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  isForeignKeyViolation,
  isUniqueViolation,
  UNIQUE_INDEXES,
  type UniqueIndexColumns,
} from './constraint';
import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { copyRecoveryPrefix } from './testing/recovery-state';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-constraint-'));
  path = join(dir, 'test.db');
  // The retired step table must still classify duplicate writes in the rollback schema.
  runMigrations(path, copyRecoveryPrefix(dir, '20261115120000_add_step_migration_report'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * The one table an index's columns are on, refusing a list that spans two —
 * SQLite names a single table in the message and a mixed entry could never
 * match one.
 */
function tableOf(index: UniqueIndexColumns): string {
  const [first] = index;
  const table = first.slice(0, first.indexOf('.'));
  if (table === '' || index.some((column) => !column.startsWith(`${table}.`))) {
    throw new Error(`not one table: ${index.join(', ')}`);
  }
  return table;
}

/** Every unique index on `table`, as the `table.column` lists a message would name. */
function uniqueIndexesOn(table: string): string[][] {
  const db = openDatabase(path);
  try {
    const listed = db
      .query<{ name: string; unique: number }, []>(`PRAGMA index_list(${table})`)
      .all();
    // Partial unique indexes count: SQLite names their columns in the same
    // message, and `organization_domain_claim_owner` and `step_work_package_code` are two.
    return listed
      .filter((index) => index.unique === 1)
      .map((index) =>
        db
          .query<{ seqno: number; name: string | null }, []>(`PRAGMA index_info("${index.name}")`)
          .all()
          .sort((left, right) => left.seqno - right.seqno)
          // An expression index answers a null column name (`users_email_normalized`
          // is `lower(email)`). It can never be one of ours, which are plain
          // columns, so it stays in the list as an unmatchable entry.
          .map((column) => `${table}.${column.name ?? ''}`),
      );
  } finally {
    db.close();
  }
}

/** A user and a work package, which `step` needs before it can hold two rows at all. */
function seedWorkPackage(): void {
  const db = openDatabase(path);
  try {
    db.run(`INSERT INTO users (id, username, created_at) VALUES ('u1', 'u1', 1000)`);
    db.run(`INSERT INTO organization (id, name, created_at) VALUES ('o1', 'Org', 1000)`);
    db.run(
      `INSERT INTO project (id, organization_id, name, created_at, created_by) VALUES ('project', 'o1', 'Project', 1000, 'u1')`,
    );
    db.run(
      `INSERT INTO work_package (id, project_id, name, created_by, created_at) VALUES ('p1', 'project', 'P', 'u1', 1000)`,
    );
  } finally {
    db.close();
  }
}

/** The error SQLite throws for `write` run twice, which the second run must refuse. */
function refusalOf(write: string): unknown {
  const db = openDatabase(path);
  try {
    db.run(write);
    db.run(write);
  } catch (err) {
    return err;
  } finally {
    db.close();
  }
  throw new Error(`ran twice without refusing: ${write}`);
}

/**
 * {@link UNIQUE_INDEXES} against the database the migrations build, and against
 * the sentence SQLite actually writes.
 *
 * Both halves are needed and neither is the other. The pragma half catches a
 * spelling that no longer names a real index — the `role` → `step` rename broke
 * exactly that, silently, turning every duplicate step name from a 409 into an
 * uncaught 500. The live half catches the format: the columns are joined the way
 * SQLite joins them, and a comma without its space matches nothing while every
 * index still exists.
 *
 * Proof: `stepNameInWorkPackage` set back to the pre-rename `['role.work_package_id',
 * 'role.name']`, watched failing twice — `expect(received).toContainEqual(…) ·
 * Received: []` in the pragma case (`PRAGMA index_list` on a table SQLite does
 * not have answers an empty list rather than throwing, which is why the
 * assertion has to be `toContainEqual` and not a length) and `expected false to
 * be true` in the live case. Then the join changed from `', '` to `','`,
 * watched failing on `expected false to be true` for the two-column live case
 * with all four other cases green — the format fault the pragma half cannot
 * see. Observed 2026-09-02.
 */
describe('the unique indexes a refusal names', () => {
  it('names a real unique index for every refusal', () => {
    for (const [name, index] of Object.entries(UNIQUE_INDEXES)) {
      expect(uniqueIndexesOn(tableOf(index)), name).toContainEqual([...index]);
    }
  });

  it('is comparing real index lists, not an empty one against itself', () => {
    // Both sides could be empty for the same wrong reason — a pragma naming a
    // table SQLite does not have would throw, but a filter that dropped every
    // index would not, and an empty list contains nothing to disagree with.
    expect(Object.keys(UNIQUE_INDEXES).length).toBe(14);
    expect(uniqueIndexesOn('step').length).toBeGreaterThan(0);
    expect(UNIQUE_INDEXES.stepNameInWorkPackage.length).toBe(2);
  });

  it('matches the message a one-column index really produces', () => {
    const err = refusalOf(`INSERT INTO tag (id, name) VALUES (hex(randomblob(8)), 'same')`);
    expect(isUniqueViolation(err, UNIQUE_INDEXES.tagName)).toBe(true);
  });

  it('matches the message a two-column index really produces', () => {
    seedWorkPackage();
    const err = refusalOf(
      `INSERT INTO step (id, work_package_id, name) VALUES (hex(randomblob(8)), 'p1', 'same')`,
    );
    expect(isUniqueViolation(err, UNIQUE_INDEXES.stepNameInWorkPackage)).toBe(true);
  });

  it('matches the message the partial step code index really produces', () => {
    seedWorkPackage();
    const err = refusalOf(
      `INSERT INTO step (id, work_package_id, name, code) VALUES (hex(randomblob(8)), 'p1', hex(randomblob(8)), 'dev')`,
    );
    expect(isUniqueViolation(err, UNIQUE_INDEXES.stepCodeInWorkPackage)).toBe(true);
    expect(isUniqueViolation(err, UNIQUE_INDEXES.stepNameInWorkPackage)).toBe(false);
  });

  it('refuses to answer for an index the message does not name', () => {
    // The point of naming the columns: a different constraint failing at the
    // same call site stays an unknown, and the caller rethrows it.
    const err = refusalOf(`INSERT INTO tag (id, name) VALUES (hex(randomblob(8)), 'same')`);
    expect(isUniqueViolation(err, UNIQUE_INDEXES.personName)).toBe(false);
    expect(isUniqueViolation(err, UNIQUE_INDEXES.stepNameInWorkPackage)).toBe(false);
  });
});

/**
 * drizzle 1.0.0-rc.4 hands a repository `DrizzleQueryError` with SQLite's own
 * error as `cause`; the tests above hit SQLite directly and so never see the
 * wrapper. These do, with the wrapper built the way drizzle builds it — the
 * real SQLite refusal as `cause`, a `Failed query` message on top — so the
 * matcher is read through the exact shape the production path produces.
 *
 * Proof: with `messagesOf` reduced to the outer message, `finds the index name
 * one cause down` and `finds a foreign key one cause down` failed on `expected
 * false to be true`; `still refuses an index the chain does not name` stayed
 * green either way, which is why it is here — a walk that matched anything
 * on the chain would pass the first two and fail this one. Observed 2026-09-06.
 */
describe('a violation wrapped the way drizzle wraps it', () => {
  const wrapped = (inner: unknown): Error =>
    new Error('DrizzleQueryError: Failed query: insert into "tag" ("id", "name") values (?, ?)', {
      cause: inner,
    });

  it('finds the index name one cause down', () => {
    const inner = refusalOf(`INSERT INTO tag (id, name) VALUES (hex(randomblob(8)), 'same')`);
    expect(isUniqueViolation(wrapped(inner), UNIQUE_INDEXES.tagName)).toBe(true);
  });

  it('finds a foreign key one cause down', () => {
    seedWorkPackage();
    const inner = refusalOf(
      `INSERT INTO work_package (id, project_id, name, created_by, created_at) VALUES (hex(randomblob(8)), 'missing-project', 'orphan', 'u1', 1000)`,
    );
    expect(isForeignKeyViolation(wrapped(inner))).toBe(true);
  });

  it('still refuses an index the chain does not name', () => {
    const inner = refusalOf(`INSERT INTO tag (id, name) VALUES (hex(randomblob(8)), 'same')`);
    expect(isUniqueViolation(wrapped(inner), UNIQUE_INDEXES.personName)).toBe(false);
  });
});
