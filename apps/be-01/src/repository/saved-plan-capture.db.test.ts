import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { projectRow } from '../testing/project-fixture';
import { CapacityRepository } from './capacity';
import type { Connection } from './db';
import { openConnection, openDatabase } from './db';
import { DirectoryRepository } from './directory';
import type { WriteStamp } from './index';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { SavedPlanCaptureRepository } from './saved-plan-capture';
import { UserRepository } from './user';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

const wrote: WriteStamp = { at: 1, by: 'owner' };

/**
 * A `sql.raw` statement in a form an assertion can match.
 *
 * Serialized rather than stringified: drizzle's `SQL` has no `toString` that
 * yields its text, so `String(statement)` is `[object Object]` — two of those
 * compare equal, and every assertion below would pass on any pair of raw
 * statements at all. The chunk shape is drizzle's, so the tests match on the
 * text they contain rather than pinning it.
 */
const rendered = (statement: unknown): string => JSON.stringify(statement) ?? '';

/**
 * A connection whose raw statements and reads are recorded in one sequence.
 *
 * `select` is recorded as the literal `read` rather than as SQL: the claim
 * these tests make is about *enclosure* — which statements fall between the
 * `BEGIN` and the `COMMIT` — and rendering seventeen queries would assert their
 * text instead, which is the store's business and not this class's.
 */
const tracing = (
  path: string,
  trace: { statements: string[]; closes: number },
  failReadNumber?: number,
): Connection => {
  const real = openConnection(path);
  let reads = 0;
  const db = new Proxy(real.db, {
    get(target, prop, receiver): unknown {
      if (prop === 'run') {
        return (...args: unknown[]): unknown => {
          trace.statements.push(rendered(args[0]));
          return (target.run as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (prop === 'select') {
        return (...args: unknown[]): unknown => {
          reads += 1;
          trace.statements.push('read');
          if (failReadNumber !== undefined && reads === failReadNumber) {
            throw new Error('the store fell over mid-capture');
          }
          return (target.select as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
  return {
    db,
    close: () => {
      trace.closes += 1;
      real.close();
    },
  };
};

/**
 * The read snapshot 3.1 is, proved on a real database file.
 *
 * Two separate claims live here and they fail for different reasons. The first
 * is *enclosure*: every read the capture makes falls inside one
 * `BEGIN DEFERRED` on a connection this class opened for itself. The second is
 * coverage: the capture-only reads exist because the live projection has two
 * holes, and both are seeded below rather than described.
 */
describe('capturing a project’s plan input', () => {
  let dir: string;
  let path: string;
  let sqlite: Database;
  let trace: { statements: string[]; closes: number };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-capture-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    sqlite = openDatabase(path);
    const seed = openConnection(path);
    const db = seed.db;
    await new UserRepository(db).create(
      { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    await new ProjectRepository(db).create(
      projectRow({ id: 'p1', name: 'Rewire the shed', ownerId: 'owner' }),
      [],
      wrote,
    );
    const directory = new DirectoryRepository(db);
    // The first hole: a team the capacity map names and no junction row does.
    await directory.addTeam({ id: 't-platform', name: 'Platform' }, wrote);
    // The second: a person on a team and on no work item.
    await directory.addPerson({ id: 'pp-unassigned', name: 'Ada' }, ['t-platform'], wrote);
    await directory.addTag({ id: 'tag-1', name: 'urgent' }, wrote);
    await directory.addService({ id: 'svc-1', name: 'Wiring' }, wrote);
    await directory.addWorkItemType({ id: 'wit-1', name: 'Task' }, wrote);
    await new CapacityRepository(db).set('p1', 't-platform', 4, wrote);
    seed.close();
    trace = { statements: [], closes: 0 };
  });

  afterEach(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const capture = (failReadNumber?: number): SavedPlanCaptureRepository =>
    new SavedPlanCaptureRepository({
      openConnection: () => tracing(path, trace, failReadNumber),
    });

  it('reads everything inside one deferred transaction and closes its connection', async () => {
    // Proof, watched 2026-09-03: with `tx.begin()` moved after the first read —
    // the shape a maintainer writes when the project probe feels like it
    // belongs outside the block — `statements[0]` is `read`, not
    // `BEGIN DEFERRED`, and this fails on the first assertion. With the
    // transaction dropped altogether the first and last assertions both fail.
    const read = await capture().readPlanInput('p1');

    expect(read).not.toBeNull();
    expect(trace.statements.at(0)).toContain('BEGIN DEFERRED');
    expect(trace.statements.at(-1)).toContain('COMMIT');
    // Seventeen reads, and no statement outside the block. Counted rather than
    // listed: which store issues which query is the store's business, but a read
    // that escaped the snapshot would land outside these bounds.
    expect(trace.statements.filter((each) => each === 'read').length).toBeGreaterThanOrEqual(17);
    expect(trace.closes).toBe(1);
  });

  it('captures the team the capacity map names and the person nobody is assigned to', async () => {
    // The whole reason the capture-only reads exist. `slotsFor` is keyed by team
    // id, and the projection's people read is filtered to assigned ids, so both
    // of these rows are named by the plan and captured by nothing the projection
    // does. Proof, watched 2026-09-03: with `listTeams`/`listPeople` dropped from
    // `readPlanInput` the project still captures, every other assertion in this
    // file still passes, and these two expectations go red.
    const read = await capture().readPlanInput('p1');

    expect(read?.capacity.get('t-platform')).toBe(4);
    expect(read?.teams.map((each) => each.id)).toContain('t-platform');
    expect(read?.assignments).toEqual([]);
    expect(read?.people.map((each) => each.id)).toContain('pp-unassigned');
    // The three registries, captured by value for the same reason.
    expect(read?.tags.map((each) => each.id)).toContain('tag-1');
    expect(read?.services.map((each) => each.id)).toContain('svc-1');
    expect(read?.workItemTypes.map((each) => each.id)).toContain('wit-1');
  });

  it('answers null for a project it cannot find, and still closes the connection', async () => {
    expect(await capture().readPlanInput('nope')).toBeNull();
    expect(trace.statements.at(0)).toContain('BEGIN DEFERRED');
    expect(trace.statements.at(-1)).toContain('COMMIT');
    expect(trace.closes).toBe(1);
  });

  it('rolls back and closes the connection when a read throws', async () => {
    // Proof, watched 2026-09-03: with the `finally` removed from
    // `readPlanInput`, `trace.closes` is 0 here and the connection is a leaked
    // WAL reader — which during a blue/green swap is the other colour's problem
    // and shows up nowhere near this test.
    let thrown: unknown;
    try {
      await capture(3).readPlanInput('p1');
    } catch (err) {
      thrown = err;
    }

    expect((thrown as Error | undefined)?.message).toContain('fell over mid-capture');
    expect(trace.statements.at(-1)).toContain('ROLLBACK');
    expect(trace.closes).toBe(1);
  });
});
