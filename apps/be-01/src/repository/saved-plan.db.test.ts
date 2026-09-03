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

    expect(await plans.write(plan, admit)).toBeNull();

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

    expect(await plans.write(plan, admit)).toBeNull();

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
      limit: 'plan_count',
      asked: 1,
      allowed: 0,
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
    let seen: { plans: number; bytes: number } | null = null;

    await plans.write(bothSides({ id: 'sp-2' }), (holding) => {
      seen = holding;
      return Promise.resolve(null);
    });

    expect(seen).toEqual({
      plans: 1,
      bytes: bodyByteLength('{"input":true}') + bodyByteLength('{"schedule":true}'),
    });
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
});
