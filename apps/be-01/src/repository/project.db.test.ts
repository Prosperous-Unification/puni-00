import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { projectRow } from '../testing/project-fixture';
import { openDatabase, openDrizzle } from './db';
import type { Project, Step, WriteStamp } from './index';
import { STEP_POSITION_STEP } from './index';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { ProjectRepository } from './project';
import { UserRepository } from './user';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let repo: ProjectRepository;
let ownerId: string;

/**
 * The stamp every write here carries unless the case is about who wrote it. The
 * account is `ownerId`, which the `created_by` foreign key requires to exist;
 * its own signup carries it too, because a new account authors its own row.
 */
const wrote = (): WriteStamp => ({ at: 1, by: ownerId });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-project-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  repo = new ProjectRepository(db);
  ownerId = crypto.randomUUID();
  await new UserRepository(db).create(
    { id: ownerId, username: 'owner', passwordHash: 'x', createdAt: 1 },
    wrote(),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function project(name: string, createdAt: number): Project {
  return {
    id: crypto.randomUUID(),
    name,
    ownerId,
    restricted: false,
    estimateMethod: 'pert',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'ceil',
    depReach: 'whole-item',
    startDate: null,
    solutionRef: null,
    revision: 0,
    createdAt,
  };
}

function steps(projectId: string, ...names: string[]): Step[] {
  return names.map((name, place) => ({
    id: crypto.randomUUID(),
    projectId,
    name,
    position: (place + 1) * STEP_POSITION_STEP,
  }));
}

/**
 * The message a promise rejected with, or a marker when it resolved.
 *
 * Written out rather than using `.rejects.toThrow`, which returns void here and
 * so cannot be awaited — an assertion that is never awaited passes whatever
 * happens, which is the failure mode these two tests exist to rule out.
 */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return '(resolved without throwing)';
  } catch (err) {
    return String(err);
  }
}

describe('ProjectRepository', () => {
  it('migrates a nullable solution reference onto existing projects', () => {
    const db = openDatabase(join(dir, 'test.db'));
    try {
      const columns = db
        .query('PRAGMA table_info(project)')
        .all()
        .map((column) => (column as { name: string }).name);

      expect(columns).toContain('solution_slug');
      expect(columns).toContain('solution_url');
    } finally {
      db.close();
    }
  });

  it('rolls the solution reference back and forward without losing a project', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());

    expect(rollbackTo(join(dir, 'test.db'), FOLDER, '20260824010000_add_oidc_identity')).toEqual([
      '20260904140000_add_project_settings',
      '20260904100000_add_optimizer_tables',
      '20260902120000_add_lookup_indexes',
      '20260901120000_add_audit_columns',
      '20260831120000_rename_role_to_step',
      '20260830130000_add_estimate_weights_and_rounding',
      '20260830120000_add_dep_reach',
      '20260830020000_add_external_ref',
      '20260830010000_add_work_item_type',
      '20260824020000_add_solution_ref',
    ]);
    const rolledBack = openDatabase(join(dir, 'test.db'));
    try {
      const columns = rolledBack
        .query('PRAGMA table_info(project)')
        .all()
        .map((column) => (column as { name: string }).name);
      expect(columns).not.toContain('solution_slug');
      expect(columns).not.toContain('solution_url');
    } finally {
      rolledBack.close();
    }

    runMigrations(join(dir, 'test.db'), FOLDER);
    expect(await repo.findById(shed.id)).toMatchObject({
      name: 'Rewire the shed',
      solutionRef: null,
    });
  });

  it('refuses one solution slug naming two projects', async () => {
    const shed = project('Rewire the shed', 100);
    const fence = project('Paint the fence', 200);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());
    await repo.create(fence, steps(fence.id, 'Dev'), wrote());
    await repo.update(
      shed.id,
      { solutionRef: { slug: 'site-refresh', url: 'https://solutions.example/site-refresh' } },
      wrote(),
    );

    expect(
      await rejection(
        repo.update(
          fence.id,
          { solutionRef: { slug: 'site-refresh', url: 'https://solutions.example/other' } },
          wrote(),
        ),
      ),
    ).toMatch(/UNIQUE/);
  });

  it('writes a project and its starting steps together', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev', 'QA'), wrote());

    expect(await repo.findById(shed.id)).toMatchObject({
      name: 'Rewire the shed',
      ownerId,
      restricted: false,
      estimateMethod: 'pert',
      startDate: null,
    });
    expect((await repo.stepsOf(shed.id)).map((r) => r.name)).toEqual(['Dev', 'QA']);
  });

  it('lists projects newest first, whoever owns them', async () => {
    const older = project('Older', 100);
    const newer = project('Newer', 200);
    await repo.create(older, steps(older.id, 'Dev'), wrote());
    await repo.create(newer, steps(newer.id, 'Dev'), wrote());

    expect((await repo.list()).map((p) => p.name)).toEqual(['Newer', 'Older']);
  });

  it('patches name and restricted, leaving the rest alone', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());

    const updated = await repo.update(shed.id, { restricted: true }, wrote());

    expect(updated).toMatchObject({ name: 'Rewire the shed', restricted: true, ownerId });
  });

  it('returns null when patching a project that is not there', async () => {
    expect(await repo.update(crypto.randomUUID(), { name: 'Ghost' }, wrote())).toBeNull();
  });

  it('refuses two steps with one name in one project', async () => {
    // The uniqueness lives in the schema rather than the service because two
    // concurrent step additions both pass a check-then-insert.
    const shed = project('Rewire the shed', 100);
    expect(await rejection(repo.create(shed, steps(shed.id, 'Dev', 'Dev'), wrote()))).toMatch(
      /UNIQUE/,
    );
  });

  it('lists per account: opened first by recency, then never-opened by creation', async () => {
    const a = project('A', 100);
    const b = project('B', 200);
    const c = project('C', 300);
    for (const p of [a, b, c]) await repo.create(p, steps(p.id, 'Dev'), wrote());

    await repo.recordOpen(a.id, { at: 1000, by: ownerId });
    await repo.recordOpen(b.id, { at: 2000, by: ownerId });

    const listed = await repo.listFor(ownerId);
    expect(listed.map((p) => p.name)).toEqual(['B', 'A', 'C']);
    expect(listed.map((p) => p.lastOpenedAt)).toEqual([2000, 1000, null]);
  });

  it('gives another account its own order', async () => {
    const other = crypto.randomUUID();
    await new UserRepository(openDrizzle(join(dir, 'test.db'))).create(
      { id: other, username: 'other', passwordHash: 'x', createdAt: 1 },
      { at: 1, by: other },
    );
    const a = project('A', 100);
    const b = project('B', 200);
    const c = project('C', 300);
    for (const p of [a, b, c]) await repo.create(p, steps(p.id, 'Dev'), wrote());
    await repo.recordOpen(a.id, { at: 1000, by: ownerId });
    await repo.recordOpen(c.id, { at: 500, by: other });

    expect((await repo.listFor(other)).map((p) => p.name)).toEqual(['C', 'B', 'A']);
    expect((await repo.listFor(ownerId)).map((p) => p.name)).toEqual(['A', 'C', 'B']);
  });

  it('names each entry’s own owner, whoever is asking', async () => {
    // Two owners rather than one: an entry that took the *caller's* name would
    // pass with one account in the database and be wrong for every list that
    // holds somebody else's project — which is the whole reason for the field.
    const strip = crypto.randomUUID();
    await new UserRepository(openDrizzle(join(dir, 'test.db'))).create(
      { id: strip, username: 'strip', passwordHash: 'x', createdAt: 1 },
      { at: 1, by: strip },
    );
    const shed = project('Rewire the shed', 100);
    const fence: Project = projectRow({ ...project('Paint the fence', 200), ownerId: strip });
    // Each project's row is authored by the account that owns it, which is what
    // makes `ownerName` a claim about two accounts rather than about the caller.
    for (const p of [shed, fence])
      await repo.create(p, steps(p.id, 'Dev'), { at: 1, by: p.ownerId });
    await repo.recordOpen(shed.id, { at: 1000, by: ownerId });

    const listed = await repo.listFor(ownerId);

    // Opened first, then never-opened: the join for the owner's name must not
    // disturb the order, and the never-opened project must still be listed at
    // all — a `project_access` inner join would drop it entirely.
    expect(listed.map((p) => [p.name, p.ownerName, p.lastOpenedAt])).toEqual([
      ['Rewire the shed', 'owner', 1000],
      ['Paint the fence', 'strip', null],
    ]);
    expect(listed.map((p) => p.createdAt)).toEqual([100, 200]);
  });

  it('keeps one record per pair, holding the later moment', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());

    await repo.recordOpen(shed.id, { at: 1000, by: ownerId });
    await repo.recordOpen(shed.id, { at: 3000, by: ownerId });

    expect((await repo.listFor(ownerId)).map((p) => p.lastOpenedAt)).toEqual([3000]);
  });

  it('patches the estimate method', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());

    const updated = await repo.update(shed.id, { estimateMethod: 'pessimistic' }, wrote());

    expect(updated).toMatchObject({ estimateMethod: 'pessimistic', name: 'Rewire the shed' });
    expect(await repo.findById(shed.id)).toMatchObject({ estimateMethod: 'pessimistic' });
  });

  it('throws rather than planning with a method the database should not hold', async () => {
    // `estimate_method` is text and SQLite will hold anything. Reading one back
    // as PERT would plan a project by a method nobody chose, and say nothing.
    // Written past the repository on purpose: this is the case where the
    // *stored* value is wrong, which no amount of request validation prevents.
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());
    const db = openDatabase(join(dir, 'test.db'));
    try {
      db.run(`UPDATE project SET estimate_method = 'median' WHERE id = '${shed.id}'`);
    } finally {
      db.close();
    }

    expect(await rejection(repo.findById(shed.id))).toMatch(/unknown estimate method/);
  });

  it('patches the dependency reach', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());

    const updated = await repo.update(shed.id, { depReach: 'anchor-slice' }, wrote());

    expect(updated).toMatchObject({ depReach: 'anchor-slice', name: 'Rewire the shed' });
    expect(await repo.findById(shed.id)).toMatchObject({ depReach: 'anchor-slice' });
  });

  it('an unrecognised stored reach is refused', async () => {
    // `dep_reach` is text and SQLite will hold anything. Reading `first-role`
    // back as either value schedules the plan by a rule nobody chose — the two
    // answers differ by every date behind a multi-step predecessor — so this is
    // the R5 case: unknown is not OK, and the read throws.
    //
    // Written past the repository for the reason the estimate-method case above
    // is: the *stored* value is the wrong one, which no request validation
    // reaches. A value from a future release read by an older colour mid-swap
    // arrives exactly this way.
    //
    // Proof: the throw in `toProject` replaced by
    // `isDependencyReach(row.depReach) ? row.depReach : 'whole-item'` and this
    // failed on `Expected substring or pattern: /unknown dependency reach/`,
    // `Received: "(resolved without throwing)"` — the project came back read,
    // silently, under a rule nobody chose. Watched 2026-08-29.
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());
    const db = openDatabase(join(dir, 'test.db'));
    try {
      db.run(`UPDATE project SET dep_reach = 'first-role' WHERE id = '${shed.id}'`);
    } finally {
      db.close();
    }

    expect(await rejection(repo.findById(shed.id))).toMatch(/unknown dependency reach/);
  });

  it('gives a project the arithmetic it has said nothing about: 1/4/1, ceil', async () => {
    // The four column defaults, read back through the boundary. Every project
    // the migration reached lands here too — the same statement, one release
    // earlier — which is what makes `ceil` a change to every stored plan and
    // 1/4/1 a change to none.
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());

    expect(await repo.findById(shed.id)).toMatchObject({
      pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
      estimateRounding: 'ceil',
    });
  });

  it('patches the weights and the rounding, and moves the revision for each', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());

    const weighted = await repo.update(
      shed.id,
      { pertWeights: { optimistic: 1, realistic: 1, pessimistic: 1 } },
      wrote(),
    );
    const rounded = await repo.update(shed.id, { estimateRounding: 'floor' }, wrote());

    expect(weighted).toMatchObject({
      pertWeights: { optimistic: 1, realistic: 1, pessimistic: 1 },
      revision: 1,
    });
    expect(rounded).toMatchObject({ estimateRounding: 'floor', revision: 2 });
    expect(await repo.findById(shed.id)).toMatchObject({
      pertWeights: { optimistic: 1, realistic: 1, pessimistic: 1 },
      estimateRounding: 'floor',
      // Untouched by either patch: the three weights are written as a triple or
      // not at all, and neither patch named the method.
      estimateMethod: 'pert',
    });
  });

  it('refuses a stored rounding it does not know', async () => {
    // `estimate_rounding` is text and SQLite will hold anything. Reading
    // `nearest` back as `ceil` — which is what a `?? 'ceil'` would do, and what
    // `roundDays`' last branch would do if the value ever reached it — charges
    // every step of the plan by a rule nobody chose. R5's case exactly, and it
    // arrives for real when an older colour reads a value a newer release wrote
    // mid-swap.
    //
    // Proof: the `isEstimateRounding` throw in `toProject` replaced by
    // `isEstimateRounding(row.estimateRounding) ? row.estimateRounding : 'ceil'`
    // and this failed on `Expected substring or pattern: /unknown estimate
    // rounding/`, `Received: "(resolved without throwing)"`. Watched
    // 2026-08-30.
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());
    const db = openDatabase(join(dir, 'test.db'));
    try {
      db.run(`UPDATE project SET estimate_rounding = 'nearest' WHERE id = '${shed.id}'`);
    } finally {
      db.close();
    }

    expect(await rejection(repo.findById(shed.id))).toMatch(/unknown estimate rounding/);
  });

  it('refuses stored weights that cannot average a triple', async () => {
    // Three zeroes have no divisor: every PERT figure in the plan would be
    // `NaN`, which renders as a blank cell and reports itself as estimated.
    // Refused as a triple rather than a column at a time, because that is the
    // shape of the fault — see `PertWeights`.
    //
    // Proof: the `type.errors` branch in `toProject` replaced by a cast to the
    // triple, and this failed on `Expected substring or pattern: /unusable PERT
    // weights/`, `Received: "(resolved without throwing)"` — the project read
    // back happily and `tree` then answered `NaN` days. Watched 2026-08-30.
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, steps(shed.id, 'Dev'), wrote());
    const db = openDatabase(join(dir, 'test.db'));
    try {
      db.run(
        `UPDATE project SET pert_weight_optimistic = 0, pert_weight_realistic = 0, pert_weight_pessimistic = 0 WHERE id = '${shed.id}'`,
      );
    } finally {
      db.close();
    }

    expect(await rejection(repo.findById(shed.id))).toMatch(/unusable PERT weights/);
  });

  it('costs one statement however many projects there are', async () => {
    // Fifty rather than two: the fault this rules out is a per-project lookup,
    // and at two projects "one query" and "one per project" differ by one
    // statement — a difference a reader could argue was setup. At fifty it is
    // 1 against 51.
    for (let made = 0; made < 50; made += 1) {
      const p = project(`Project ${String(made)}`, 100 + made);
      await repo.create(p, steps(p.id, 'Dev'), wrote());
    }
    const statements: string[] = [];
    const counted = new ProjectRepository(
      openDrizzle(join(dir, 'test.db'), {
        logQuery(query) {
          statements.push(query);
        },
      }),
    );

    const listed = await counted.listFor(ownerId);

    // The precondition: a list that answered nothing would also issue one
    // statement, and the count would prove nothing about the join.
    expect(listed).toHaveLength(50);
    expect(statements).toHaveLength(1);
  });

  it('fails the list rather than answering a project whose owner is nobody', async () => {
    // Written past the repository, like the estimate-method test above and for
    // the same reason: the *stored* row is wrong, which no request validation
    // prevents. `foreign_keys=OFF` is the boundary — the pragma is per
    // connection, this connection is opened, used and closed here, and the
    // repository's own connection never has it off.
    const kept = project('Rewire the shed', 100);
    await repo.create(kept, steps(kept.id, 'Dev'), wrote());
    const orphan = project('Orphan', 200);
    const db = openDatabase(join(dir, 'test.db'));
    try {
      db.run('PRAGMA foreign_keys=OFF');
      db.run(
        `INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)
         VALUES ('${orphan.id}', 'Orphan', '${crypto.randomUUID()}', 0, 'pert', NULL, 0, 200)`,
      );
    } finally {
      db.close();
    }

    // Both halves are the claim. Not "the list is one project short", and not
    // "the orphan is listed with a blank owner" — the read fails.
    expect(await rejection(repo.listFor(ownerId))).toMatch(/owner/);
  });

  it('refuses a project whose owner does not exist', async () => {
    // Proof that foreign keys are enforced rather than merely declared: this
    // insert parses fine and is rejected only because the pragma is on.
    const orphan: Project = projectRow({ ...project('Orphan', 100), ownerId: crypto.randomUUID() });
    // Stamped by an account that does exist, so `owner_id` is the only reference
    // left dangling — a stamp naming nobody would satisfy the match through
    // `created_by` instead, and the case would stop being about the owner.
    expect(await rejection(repo.create(orphan, steps(orphan.id, 'Dev'), wrote()))).toMatch(
      /FOREIGN KEY/,
    );
  });
});

describe('what a project read publishes', () => {
  /**
   * The audit columns are recorded and not published (ADR 0012), and this is
   * the read that decides it for `GET /api/projects/{id}` and `PATCH` — neither
   * declares a response schema, so whatever the store hands back is the body.
   *
   * `toProject` spread the rest of the row until 2026-09-02, so `createdBy` — a
   * user id — and `updatedAt` were on the wire, while the JSDoc on `stepsOf`
   * cited this mapper as the reason they could not be. Asserted against the
   * declared type's own keys rather than a second hand-written list, so a
   * column added to `Project` is not a column this test forgets.
   *
   * Proof: with `withoutAuditColumns(rest)` in `toProject` put back to `...rest`,
   * watched failing on
   * `expect(received).toEqual(expected) · + "createdBy" · + "updatedAt"`
   * (2026-09-02).
   */
  it('carries the columns the Project type declares and no others', async () => {
    const made = await repo.create(project('Rewire', 10), [], wrote());
    const read = await repo.findById(made.id);

    expect(read).not.toBeNull();
    expect(Object.keys(read ?? {}).sort()).toEqual(Object.keys(made).sort());
    expect(Object.keys(read ?? {})).not.toContain('createdBy');
    expect(Object.keys(read ?? {})).not.toContain('updatedAt');
  });
});
