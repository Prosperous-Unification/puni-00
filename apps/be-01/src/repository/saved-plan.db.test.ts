import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { projectRow } from '../testing/project-fixture';
import type { Connection } from './db';
import { openConnection } from './db';
import type { WriteStamp } from './index';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import type { SavedPlanWrite } from './saved-plan';
import { bodyByteLength, SavedPlanRepository } from './saved-plan';
import { UserRepository } from './user';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

const wrote: WriteStamp = { at: 1, by: 'owner' };

/** A save with both sides, whose bytes are distinguishable from each other. */
const bothSides = (overrides: Partial<SavedPlanWrite> = {}): SavedPlanWrite => ({
  id: 'sp-1',
  projectId: 'p1',
  name: 'before the rewire',
  createdBy: 'Ada Lovelace',
  createdAt: 1_756_000_000,
  input: { schemaVersion: 1, bytes: '{"input":true}', sha256: 'in-hash' },
  schedule: {
    present: true,
    body: { schemaVersion: 1, bytes: '{"schedule":true}', sha256: 'sc-hash' },
    inputSha256: 'in-hash',
    algorithmId: 'alg-1',
  },
  ...overrides,
});

describe('SavedPlanRepository', () => {
  let dir: string;
  let path: string;
  let reader: Connection;
  let plans: SavedPlanRepository;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-write-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const seed = openConnection(path);
    await new UserRepository(seed.db).create(
      { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    await new ProjectRepository(seed.db).create(
      projectRow({ id: 'p1', name: 'Rewire the shed', ownerId: 'owner' }),
      [{ id: 'st-1', projectId: 'p1', name: 'Build', position: 10 }],
      wrote,
    );
    seed.close();
    // A reader of this class's own writes, on a connection this class never
    // sees: what the assertions read is what another process would.
    reader = openConnection(path);
    plans = new SavedPlanRepository({ openConnection: () => openConnection(path) });
  });

  afterEach(() => {
    reader.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const admit = () => Promise.resolve(null);

  it('writes one header and both bodies, and the header carries the lengths', async () => {
    const plan = bothSides();

    expect(await plans.write(plan, admit)).toEqual({ outcome: 'written' });

    const holding = await plans.holdingOf(reader.db, 'p1');
    expect(holding.plans).toBe(1);
    expect(holding.bytes).toBe(
      bodyByteLength('{"input":true}') + bodyByteLength('{"schedule":true}'),
    );
    expect(await plans.bodyOf(reader.db, 'sp-1', 'input')).toBe('{"input":true}');
    expect(await plans.bodyOf(reader.db, 'sp-1', 'schedule')).toBe('{"schedule":true}');
  });

  /**
   * The all-or-nothing check is the schema's; what this asserts is that an
   * absent schedule writes **no body row** rather than an empty one, and that a
   * project holding it reads as holding the input's bytes rather than as
   * holding none — the `coalesce` inside the sum.
   */
  it('writes no schedule body when there is no schedule, and still counts the input', async () => {
    const plan = bothSides({
      schedule: { present: false, absentReason: 'pending' },
    });

    expect(await plans.write(plan, admit)).toEqual({ outcome: 'written' });

    expect(await plans.bodyOf(reader.db, 'sp-1', 'schedule')).toBeNull();
    expect(await plans.bodyOf(reader.db, 'sp-1', 'input')).toBe('{"input":true}');
    expect(await plans.holdingOf(reader.db, 'p1')).toEqual({
      plans: 1,
      bytes: bodyByteLength('{"input":true}'),
    });
  });

  it('reads an empty project as holding nothing rather than as null', async () => {
    expect(await plans.holdingOf(reader.db, 'p1')).toEqual({ plans: 0, bytes: 0 });
  });

  /**
   * The refusal is taken **inside** the transaction and leaves nothing behind —
   * not a header, not a body. The check is handed the holding and the incoming
   * bytes, which is the arithmetic `holdingRefusal` does.
   */
  it('writes nothing at all when the check refuses, and reports the refusal', async () => {
    let sawIncoming = -1;
    const refuse = (holding: { plans: number; bytes: number }, incoming: number) => {
      sawIncoming = incoming;
      return Promise.resolve({ limit: 'plan_count' as const, asked: holding.plans + 1, allowed: 0 });
    };

    expect(await plans.write(bothSides(), refuse)).toEqual({
      outcome: 'refused',
      refusal: { limit: 'plan_count', asked: 1, allowed: 0 },
    });

    expect(sawIncoming).toBe(
      bodyByteLength('{"input":true}') + bodyByteLength('{"schedule":true}'),
    );
    expect(await plans.holdingOf(reader.db, 'p1')).toEqual({ plans: 0, bytes: 0 });
    expect(await plans.bodyOf(reader.db, 'sp-1', 'input')).toBeNull();
  });

  /**
   * The check reads what the transaction can see, which is the point of taking
   * it in there: a second save is handed the first one's row.
   */
  it('hands the check what the project holds at that moment', async () => {
    await plans.write(bothSides(), admit);
    // Collected rather than assigned to a `let`: an assignment inside a
    // callback is invisible to the narrowing, so `let seen = null` stays
    // `null` to the compiler and the assertion does not typecheck. The array
    // also says how many times the check ran, which is once.
    const seen: { plans: number; bytes: number }[] = [];

    await plans.write(bothSides({ id: 'sp-2' }), (holding) => {
      seen.push(holding);
      return Promise.resolve(null);
    });

    expect(seen).toEqual([
      {
        plans: 1,
        bytes: bodyByteLength('{"input":true}') + bodyByteLength('{"schedule":true}'),
      },
    ]);
  });

  /**
   * `String.length` counts UTF-16 code units; the column counts bytes. One
   * emoji is two units and four bytes, so a body measured the wrong way is 2
   * bytes where the store holds 4 — a quota on a number nobody stores.
   */
  it('measures a body in bytes, not in UTF-16 units', async () => {
    expect(bodyByteLength('🔦')).toBe(4);
    expect('🔦'.length).toBe(2);

    await plans.write(bothSides({ input: { schemaVersion: 1, bytes: '🔦', sha256: 'h' } }), admit);

    expect((await plans.holdingOf(reader.db, 'p1')).bytes).toBe(
      4 + bodyByteLength('{"schedule":true}'),
    );
  });
  /**
   * The list is what a project's saved-plan page reads, and it reads headers.
   *
   * Both halves matter and neither implies the other: the rows come back
   * newest first, and the bodies are **not** in them. A list that joined the
   * body table would be green on the ordering alone while loading every stored
   * byte to render a column of names.
   */
  it('lists a project\'s headers newest first and reads no body', async () => {
    await plans.write(bothSides({ id: 'sp-old', createdAt: 1_756_000_000 }), admit);
    await plans.write(bothSides({ id: 'sp-new', createdAt: 1_756_000_900 }), admit);

    const rows = await plans.listOf('p1');

    expect(rows.map((row) => row.id)).toEqual(['sp-new', 'sp-old']);
    expect(rows[0].inputBytes).toBe(bodyByteLength('{"input":true}'));
    // The header is the whole row; a body would arrive as a property, and none
    // does. Stated as a key check rather than as a comment because the join
    // this forbids is the easy way to write `listOf`.
    expect(Object.keys(rows[0])).not.toContain('bytes');
  });

  /**
   * Two captures inside the same second are ordinary — `created_at` stamps the
   * instant the read snapshot opened — so the tie-break is the difference
   * between an order and SQLite's.
   */
  it('breaks a created_at tie by id rather than leaving it to the engine', async () => {
    await plans.write(bothSides({ id: 'sp-b', createdAt: 1_756_000_000 }), admit);
    await plans.write(bothSides({ id: 'sp-a', createdAt: 1_756_000_000 }), admit);

    expect((await plans.listOf('p1')).map((row) => row.id)).toEqual(['sp-a', 'sp-b']);
  });

  it('lists only the asked-for project', async () => {
    await plans.write(bothSides({ id: 'sp-1' }), admit);

    expect(await plans.listOf('p-absent')).toEqual([]);
  });

  /**
   * The rename writes `name` and nothing else. Asserting the new name alone
   * would pass for a statement that also rewrote a hash, so the rest of the
   * header is compared field by field against what the save wrote.
   */
  it('renames without touching any other header column', async () => {
    await plans.write(bothSides(), admit);
    const before = await plans.readOf('sp-1');

    expect(await plans.renameTo('sp-1', 'after the rewire')).toBe('touched');

    const after = await plans.readOf('sp-1');
    expect(after?.header.name).toBe('after the rewire');
    expect({ ...after?.header, name: '' }).toEqual({ ...before?.header, name: '' });
    // The bodies are untouched too: the rename is a header statement, and a
    // cascade or a second write here would be invisible to the header compare.
    expect(after?.bodies).toEqual(before?.bodies);
  });

  it('reports no_such_plan for a rename that matches nothing', async () => {
    await plans.write(bothSides(), admit);

    expect(await plans.renameTo('sp-absent', 'whatever')).toBe('no_such_plan');
    expect((await plans.readOf('sp-1'))?.header.name).toBe('before the rewire');
  });

  /**
   * Deleting the header takes both bodies with it, through the schema's
   * cascade rather than a second statement here.
   */
  it('deletes the header and both bodies cascade', async () => {
    await plans.write(bothSides(), admit);

    expect(await plans.deleteOf('sp-1')).toBe('touched');

    expect(await plans.readOf('sp-1')).toBeNull();
    expect(await plans.bodyOf(reader.db, 'sp-1', 'input')).toBeNull();
    expect(await plans.bodyOf(reader.db, 'sp-1', 'schedule')).toBeNull();
    expect(await plans.holdingOf(reader.db, 'p1')).toEqual({ plans: 0, bytes: 0 });
  });

  it('reports no_such_plan for a delete that matches nothing', async () => {
    await plans.write(bothSides(), admit);

    expect(await plans.deleteOf('sp-absent')).toBe('no_such_plan');
    expect((await plans.listOf('p1')).map((row) => row.id)).toEqual(['sp-1']);
  });
});
