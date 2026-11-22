import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NewWorkPackage, WorkPackage, WriteStamp } from '@wbs/core';
import { STEP_POSITION_STEP } from '@wbs/core';
import { suggestStepCode } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { messagesOf } from './constraint';
import { type Connection, openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { optimizationGeneration, solverQueue, solverSlot } from './schema';
import { StepCatalogueRepository } from './step-catalogue';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { seedLegacyPackageParent, seedPackageParent } from './testing/legacy-package-parent';
import { UserRepository } from './user';
import { WorkPackageRepository } from './work-package';

let dir: string;
let repo: WorkPackageRepository;
let catalogue: StepCatalogueRepository;
let ownerId: string;
let suiteOwner:
  { connection: Connection; closeAttempted: boolean; closeReturned: boolean } | undefined;
let suiteAcquisitionFailure: { cause: unknown } | undefined;
let suiteDirectory: string | undefined;
/** Successful OPEN-helper acquisitions stay reachable until their actual close returns. */
let openingOwners = new Set<object>();
const openingAcquisitionFailures: { readonly cause: unknown }[] = [];
interface FixtureConnectionOwner {
  readonly connection: Connection;
  closeAttempted: boolean;
  closeReturned: boolean;
  closeFailure: { readonly cause: unknown } | undefined;
}
const extraFixtureOwners: FixtureConnectionOwner[] = [];
const extraFixtureAcquisitionFailures: { readonly cause: unknown }[] = [];

/** Retains the five historical explicitly opened source owners until one selected close actually returns. */
function openFixtureDatabase(
  path: string,
  logger?: Parameters<typeof openConnection>[1],
): Connection['db'] {
  let connection: Connection;
  try {
    connection = openConnection(path, logger);
  } catch (cause) {
    extraFixtureAcquisitionFailures.push({ cause });
    throw cause;
  }
  extraFixtureOwners.push({
    connection,
    closeAttempted: false,
    closeReturned: false,
    closeFailure: undefined,
  });
  return connection.db;
}

/**
 * The stamp every write here carries unless the case is about who wrote it. The
 * account is `ownerId`, which the `created_by` foreign key requires to exist;
 * its own signup carries it too, because a new account authors its own row.
 */
const wrote = (): WriteStamp => ({ at: 1, by: ownerId });

/** Creates as a distinct real member so the tested human cannot inherit birth authority. */
async function createForScopedChecks(
  requested: NewWorkPackage,
  organizationId: string,
): Promise<WorkPackage> {
  const raw = openDatabase(join(dir, 'test.db')),
    creator = 'fixture-creator-' + organizationId;
  try {
    raw.run('INSERT INTO users(id,username,created_at) VALUES(?,?,1) ON CONFLICT(id) DO NOTHING', [
      creator,
      creator,
    ]);
    raw.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES(?,?,'member',1) ON CONFLICT(organization_id,user_id) DO NOTHING",
      [organizationId, creator],
    );
  } finally {
    raw.close();
  }
  const created = await repo.createInOrganization(
    requested,
    [],
    { ...wrote(), by: creator },
    organizationId,
    { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
  );
  if (typeof created === 'string') throw new Error('scoped fixture creation refused: ' + created);
  return created;
}

beforeEach(async () => {
  if (
    suiteOwner !== undefined ||
    suiteAcquisitionFailure !== undefined ||
    suiteDirectory !== undefined ||
    openingOwners.size !== 0 ||
    openingAcquisitionFailures.length !== 0 ||
    extraFixtureOwners.length !== 0 ||
    extraFixtureAcquisitionFailures.length !== 0
  )
    throw Error('Previous work-package fixture ownership remains unsettled');
  dir = mkdtempSync(join(tmpdir(), 'wbs-work-package-'));
  suiteDirectory = dir;
  const path = join(dir, 'test.db');
  const custody = { hasUnknownOwner: false };
  try {
    migrateEmptyCatalogueFixture({ path, directory: dir, reportedAt: 1 }, custody);
  } catch (cause) {
    if (custody.hasUnknownOwner) suiteAcquisitionFailure = { cause };
    throw cause;
  }
  seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
  try {
    const connection = openConnection(path);
    suiteOwner = { connection, closeAttempted: false, closeReturned: false };
  } catch (cause) {
    suiteAcquisitionFailure = { cause };
    throw cause;
  }
  const db = suiteOwner.connection.db;
  repo = new WorkPackageRepository(db, OPEN);
  catalogue = new StepCatalogueRepository(db, OPEN, 'owned');
  ownerId = crypto.randomUUID();
  await new UserRepository(db, OPEN).create(
    { id: ownerId, username: 'owner', passwordHash: 'x', createdAt: 1 },
    wrote(),
  );
});

afterEach(() => {
  const failures: unknown[] = [];
  const selected = suiteOwner;
  if (selected !== undefined) {
    if (!selected.closeAttempted) {
      selected.closeAttempted = true;
      try {
        selected.connection.close();
        selected.closeReturned = true;
        suiteOwner = undefined;
      } catch (cause) {
        failures.push(cause);
      }
    } else if (!selected.closeReturned)
      failures.push(Error('Baseline work-package connection close is still unknown'));
  }
  if (suiteAcquisitionFailure !== undefined) failures.push(suiteAcquisitionFailure.cause);
  for (const owner of extraFixtureOwners) {
    if (!owner.closeAttempted) {
      owner.closeAttempted = true;
      try {
        owner.connection.close();
        owner.closeReturned = true;
      } catch (cause) {
        owner.closeFailure = { cause };
        failures.push(cause);
      }
    } else if (!owner.closeReturned)
      failures.push(
        Error('Extra work-package fixture close is still unknown', {
          cause: owner.closeFailure?.cause,
        }),
      );
  }
  if (extraFixtureOwners.every((owner) => owner.closeReturned)) extraFixtureOwners.length = 0;
  for (const failure of extraFixtureAcquisitionFailures) failures.push(failure.cause);
  if (openingOwners.size !== 0 || openingAcquisitionFailures.length !== 0)
    failures.push(
      new AggregateError(
        openingAcquisitionFailures.map((failure) => failure.cause),
        'OPEN helper ownership remains unknown; fixture directory retained',
      ),
    );
  if (failures.length === 0 && suiteDirectory !== undefined) {
    try {
      rmSync(suiteDirectory, { recursive: true, force: true });
      suiteDirectory = undefined;
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length !== 0)
    throw new AggregateError(failures, 'Work-package fixture close failed; directory retained', {
      cause: failures[0],
    });
});

function workPackage(name: string, createdAt: number): NewWorkPackage {
  return {
    id: crypto.randomUUID(),
    name,
    projectId: 'fixture-project',
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

/** Authors project bindings before package birth so the repository must materialize their values. */
async function bindSteps(organizationId: string, projectId: string, ...names: string[]) {
  const taken = new Set<string>();
  for (const [place, name] of names.entries()) {
    const code = suggestStepCode(name, taken);
    taken.add(code);
    const position = (place + 1) * STEP_POSITION_STEP;
    const bound = await catalogue.defineAndBindStep(
      organizationId,
      {
        id: crypto.randomUUID(),
        name,
        code,
        position,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: crypto.randomUUID(),
        scopeKind: 'project',
        scopeId: projectId,
        workItemTypeId: null,
        position,
      },
      wrote(),
    );
    expect(bound.ok).toBe(true);
  }
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
    // The whole `cause` chain, because drizzle 1.0.0-rc.4 wraps SQLite's
    // refusal in a `DrizzleQueryError` whose own message names the statement
    // and not the constraint; see `messagesOf`.
    return messagesOf(err).join('\n') || String(err);
  }
}

describe('WorkPackageRepository', () => {
  it('migrates a nullable solution reference onto existing work packages', () => {
    const db = openDatabase(join(dir, 'test.db'));
    try {
      const columns = db
        .query('PRAGMA table_info(work_package)')
        .all()
        .map((column) => (column as { name: string }).name);

      expect(columns).toContain('solution_slug');
      expect(columns).toContain('solution_url');
    } finally {
      db.close();
    }
  });

  it('refuses one solution slug naming two work packages', async () => {
    const shed = workPackage('Rewire the shed', 100);
    const fence = workPackage('Paint the fence', 200);
    await repo.create(shed, [], wrote());
    await repo.create(fence, [], wrote());
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

  it('writes a work package and its inherited step values together', async () => {
    const shed = workPackage('Rewire the shed', 100);
    await bindSteps('fixture-legacy-org', shed.projectId, 'Dev', 'QA');
    await repo.create(shed, [], wrote());

    expect(await repo.findById(shed.id)).toMatchObject({
      name: 'Rewire the shed',
      projectId: 'fixture-project',
      restricted: false,
      estimateMethod: 'pert',
      startDate: null,
    });
    expect((await repo.stepsOf(shed.id)).map((r) => r.name)).toEqual(['Dev', 'QA']);

    const failed = workPackage('Refused package', 101);
    const raw = openDatabase(join(dir, 'test.db'));
    try {
      raw.run(`CREATE TRIGGER refuse_package_step BEFORE INSERT ON work_package_step
        WHEN NEW.step_id=(SELECT id FROM step_definition WHERE organization_id='fixture-legacy-org' AND name='QA')
        BEGIN SELECT RAISE(ABORT,'injected QA materialization failure'); END`);
      expect(await rejection(repo.create(failed, [], wrote()))).toContain(
        'injected QA materialization failure',
      );
      expect(await repo.findById(failed.id)).toBeNull();
      expect(
        raw.query('SELECT step_id FROM work_package_step WHERE work_package_id=?').all(failed.id),
      ).toEqual([]);
    } finally {
      raw.close();
    }
  });

  it('lists work packages newest first, whoever owns them', async () => {
    const older = workPackage('Older', 100);
    const newer = workPackage('Newer', 200);
    await repo.create(older, [], wrote());
    await repo.create(newer, [], wrote());

    expect((await repo.list()).map((p) => p.name)).toEqual(['Newer', 'Older']);
  });

  it('patches name and restricted, leaving the rest alone', async () => {
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());

    const updated = await repo.update(shed.id, { restricted: true }, wrote());
    if (typeof updated === 'string') throw new Error(`work package write refused: ${updated}`);

    expect(updated).toMatchObject({
      name: 'Rewire the shed',
      restricted: true,
      projectId: 'fixture-project',
    });
  });

  it('returns null when patching a work package that is not there', async () => {
    expect(await repo.update(crypto.randomUUID(), { name: 'Ghost' }, wrote())).toBeNull();
  });

  it('refuses two catalogue steps with one name in a work package', async () => {
    const shed = workPackage('Rewire the shed', 100);
    await bindSteps('fixture-legacy-org', shed.projectId, 'Dev', 'QA');
    await repo.create(shed, [], wrote());
    const published = await repo.stepsOf(shed.id);
    expect(published.map(({ name }) => name)).toEqual(['Dev', 'QA']);
    const qa = published.find(({ name }) => name === 'QA');
    if (qa === undefined) throw new Error('expected bound QA definition');
    const raw = openDatabase(join(dir, 'test.db'));
    try {
      // Exercise the physical uniqueness constraint independently of catalogue write admission.
      expect(() => raw.run('UPDATE step_definition SET name=? WHERE id=?', ['Dev', qa.id])).toThrow(
        /UNIQUE constraint failed: step_definition.organization_id, step_definition.name/,
      );
    } finally {
      raw.close();
    }
    expect((await repo.stepsOf(shed.id)).map(({ name }) => name)).toEqual(['Dev', 'QA']);
  });

  it('lists per account: opened first by recency, then never-opened by creation', async () => {
    const a = workPackage('A', 100);
    const b = workPackage('B', 200);
    const c = workPackage('C', 300);
    for (const p of [a, b, c]) await repo.create(p, [], wrote());

    await repo.recordOpen(a.id, { at: 1000, by: ownerId });
    await repo.recordOpen(b.id, { at: 2000, by: ownerId });

    const listed = await repo.listFor(ownerId);
    expect(listed.map((p) => p.name)).toEqual(['B', 'A', 'C']);
    expect(listed.map((p) => p.lastOpenedAt)).toEqual([2000, 1000, null]);
  });

  it('answers the update instant as the newest of its row, its work items and its plan events', async () => {
    const db = openDatabase(join(dir, 'test.db'));
    const a = workPackage('A', 100);
    await repo.create(a, [], wrote());
    const instant = async () => (await repo.listFor(ownerId))[0]?.updatedAt;
    const workItem = db.prepare(
      'INSERT INTO work_item (id, work_package_id, position, updated_at) VALUES (?, ?, ?, ?)',
    );
    const planEvent = db.prepare(
      `INSERT INTO plan_event (id, work_package_id, user_id, kind, label, before, after, created_at)
       VALUES (?, ?, ?, 'rename', 'rename', '{}', '{}', ?)`,
    );
    try {
      db.run('UPDATE work_package SET updated_at = NULL');
      expect(await instant()).toBeNull();
      workItem.run('w0', a.id, 0, null);
      expect(await instant()).toBeNull();
      db.run('UPDATE work_package SET updated_at = 10');
      expect(await instant()).toBe(10);
      workItem.run('w1', a.id, 1, 20);
      expect(await instant()).toBe(20);
      planEvent.run('e1', a.id, ownerId, 30);
      expect(await instant()).toBe(30);
      db.run('UPDATE work_package SET updated_at = 40');
      expect(await instant()).toBe(40);
    } finally {
      db.close();
    }
  });

  it('gives another account its own order', async () => {
    const other = crypto.randomUUID();
    await new UserRepository(openFixtureDatabase(join(dir, 'test.db')), OPEN).create(
      { id: other, username: 'other', passwordHash: 'x', createdAt: 1 },
      { at: 1, by: other },
    );
    const a = workPackage('A', 100);
    const b = workPackage('B', 200);
    const c = workPackage('C', 300);
    for (const p of [a, b, c]) await repo.create(p, [], wrote());
    await repo.recordOpen(a.id, { at: 1000, by: ownerId });
    await repo.recordOpen(c.id, { at: 500, by: other });

    expect((await repo.listFor(other)).map((p) => p.name)).toEqual(['C', 'B', 'A']);
    expect((await repo.listFor(ownerId)).map((p) => p.name)).toEqual(['A', 'C', 'B']);
  });

  it('names each entry’s creation actor, whoever is asking', async () => {
    // Distinct creation actors distinguish row metadata from the listing caller;
    // neither identity grants authority over the package.
    const strip = crypto.randomUUID();
    await new UserRepository(openFixtureDatabase(join(dir, 'test.db')), OPEN).create(
      { id: strip, username: 'strip', passwordHash: 'x', createdAt: 1 },
      { at: 1, by: strip },
    );
    const shed = workPackage('Rewire the shed', 100);
    const fence: WorkPackage = workPackageRow({
      ...workPackage('Paint the fence', 200),
      projectId: 'fixture-project',
    });
    // Each birth retains its real stamp actor, independently of the listing caller.
    for (const [p, actorId] of [
      [shed, ownerId],
      [fence, strip],
    ] as const)
      await repo.create(p, [], { at: 1, by: actorId });
    await repo.recordOpen(shed.id, { at: 1000, by: ownerId });

    const listed = await repo.listFor(ownerId);

    // Opened first, then never-opened: the creation-actor name join must not
    // disturb the order, and the never-opened work package must still be listed at
    // all — a `work_package_access` inner join would drop it entirely.
    expect(listed.map((p) => [p.name, p.createdByName, p.lastOpenedAt])).toEqual([
      ['Rewire the shed', 'owner', 1000],
      ['Paint the fence', 'strip', null],
    ]);
    expect(listed.map((p) => p.createdAt)).toEqual([100, 200]);
  });

  it('keeps one record per pair, holding the later moment', async () => {
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());

    await repo.recordOpen(shed.id, { at: 1000, by: ownerId });
    await repo.recordOpen(shed.id, { at: 3000, by: ownerId });

    expect((await repo.listFor(ownerId)).map((p) => p.lastOpenedAt)).toEqual([3000]);
  });

  it('patches the estimate method', async () => {
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());

    const updated = await repo.update(shed.id, { estimateMethod: 'pessimistic' }, wrote());
    if (typeof updated === 'string') throw new Error(`work package write refused: ${updated}`);

    expect(updated).toMatchObject({ estimateMethod: 'pessimistic', name: 'Rewire the shed' });
    expect(await repo.findById(shed.id)).toMatchObject({ estimateMethod: 'pessimistic' });
  });

  it('throws rather than planning with a method the database should not hold', async () => {
    // `estimate_method` is text and SQLite will hold anything. Reading one back
    // as PERT would plan a work package by a method nobody chose, and say nothing.
    // Written past the repository on purpose: this is the case where the
    // *stored* value is wrong, which no amount of request validation prevents.
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());
    const db = openDatabase(join(dir, 'test.db'));
    try {
      db.run(`UPDATE work_package SET estimate_method = 'median' WHERE id = '${shed.id}'`);
    } finally {
      db.close();
    }

    expect(await rejection(repo.findById(shed.id))).toMatch(/unknown estimate method/);
  });

  it('patches the dependency reach', async () => {
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());

    const updated = await repo.update(shed.id, { depReach: 'anchor-slice' }, wrote());
    if (typeof updated === 'string') throw new Error(`work package write refused: ${updated}`);

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
    // Proof: the throw in `toWorkPackage` replaced by
    // `isDependencyReach(row.depReach) ? row.depReach : 'whole-item'` and this
    // failed on `Expected substring or pattern: /unknown dependency reach/`,
    // `Received: "(resolved without throwing)"` — the work package came back read,
    // silently, under a rule nobody chose. Watched 2026-08-29.
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());
    const db = openDatabase(join(dir, 'test.db'));
    try {
      db.run(`UPDATE work_package SET dep_reach = 'first-role' WHERE id = '${shed.id}'`);
    } finally {
      db.close();
    }

    expect(await rejection(repo.findById(shed.id))).toMatch(/unknown dependency reach/);
  });

  it('gives a work package the arithmetic it has said nothing about: 1/4/1, ceil', async () => {
    // The four column defaults, read back through the boundary. Every work package
    // the migration reached lands here too — the same statement, one release
    // earlier — which is what makes `ceil` a change to every stored plan and
    // 1/4/1 a change to none.
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());

    expect(await repo.findById(shed.id)).toMatchObject({
      pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
      estimateRounding: 'ceil',
    });
  });

  it('patches the weights and the rounding, and moves the revision for each', async () => {
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());

    const weighted = await repo.update(
      shed.id,
      { pertWeights: { optimistic: 1, realistic: 1, pessimistic: 1 } },
      wrote(),
    );
    if (typeof weighted === 'string') throw new Error(`work package write refused: ${weighted}`);
    const rounded = await repo.update(shed.id, { estimateRounding: 'floor' }, wrote());
    if (typeof rounded === 'string') throw new Error(`work package write refused: ${rounded}`);

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
    // Proof: the `isEstimateRounding` throw in `toWorkPackage` replaced by
    // `isEstimateRounding(row.estimateRounding) ? row.estimateRounding : 'ceil'`
    // and this failed on `Expected substring or pattern: /unknown estimate
    // rounding/`, `Received: "(resolved without throwing)"`. Watched
    // 2026-08-30.
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());
    const db = openDatabase(join(dir, 'test.db'));
    try {
      db.run(`UPDATE work_package SET estimate_rounding = 'nearest' WHERE id = '${shed.id}'`);
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
    const shed = workPackage('Rewire the shed', 100);
    await repo.create(shed, [], wrote());
    const db = openDatabase(join(dir, 'test.db'));
    try {
      expect(
        db.run(
          "UPDATE setting_value SET value_json=? WHERE scope_kind='work_package' AND scope_id=? AND key='pertWeights'",
          [JSON.stringify({ optimistic: 0, realistic: 0, pessimistic: 0 }), shed.id],
        ).changes,
      ).toBe(1);
    } finally {
      db.close();
    }

    const refused = await rejection(repo.findById(shed.id));
    expect(refused).toContain('invalid stored setting pertWeights at work_package/' + shed.id);
    expect(refused).toContain('weights that sum to a finite number above zero');
  });

  it('costs one statement however many work packages there are', async () => {
    // Fifty rather than two: the fault this rules out is a per-work-package lookup,
    // and at two work packages "one query" and "one per work package" differ by one
    // statement — a difference a reader could argue was setup. At fifty it is
    // 1 against 51.
    for (let made = 0; made < 50; made += 1) {
      const p = workPackage(`Work package ${String(made)}`, 100 + made);
      await repo.create(p, [], wrote());
    }
    const statements: string[] = [];
    const counted = new WorkPackageRepository(
      openFixtureDatabase(join(dir, 'test.db'), {
        logQuery(query) {
          statements.push(query);
        },
      }),
      OPEN,
    );

    const listed = await counted.listFor(ownerId);

    // The precondition: a list that answered nothing would also issue one
    // statement, and the count would prove nothing about the join.
    expect(listed).toHaveLength(50);
    expect(statements).toHaveLength(1);
  });

  it('fails the list rather than answering a work package whose creation actor is missing', async () => {
    // Written past the repository, like the estimate-method test above and for
    // the same reason: the *stored* row is wrong, which no request validation
    // prevents. `foreign_keys=OFF` is the boundary — the pragma is per
    // connection, this connection is opened, used and closed here, and the
    // repository's own connection never has it off.
    const kept = workPackage('Rewire the shed', 100);
    await repo.create(kept, [], wrote());
    const orphan = workPackage('Orphan', 200);
    await repo.create(orphan, [], wrote());
    const db = openDatabase(join(dir, 'test.db'));
    try {
      expect(db.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
      const failures: unknown[] = [];
      try {
        db.run('PRAGMA foreign_keys=OFF');
        db.run('UPDATE work_package SET created_by = ? WHERE id = ?', [
          crypto.randomUUID(),
          orphan.id,
        ]);
      } catch (failure: unknown) {
        failures.push(failure);
      }
      try {
        db.run('PRAGMA foreign_keys=ON');
        expect(db.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
      } catch (failure: unknown) {
        failures.push(failure);
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(
          failures,
          'fixture corruption and foreign-key restoration failed',
          { cause: failures[0] },
        );
    } finally {
      db.close();
    }

    // Both halves are the claim. Not "the list is one work package short", and not
    // "the orphan is listed with a blank owner" — the read fails.
    expect(await rejection(repo.listFor(ownerId))).toMatch(/creation actor naming no account/);
  });

  it('refuses a work package whose creation actor does not exist', async () => {
    // Historical owner-column account retained below; the current counterpart
    // exercises the real creation-actor foreign key with an otherwise valid parent.
    // Proof that foreign keys are enforced rather than merely declared: this
    // insert parses fine and is rejected only because the pragma is on.
    const orphan: WorkPackage = workPackageRow({
      ...workPackage('Orphan', 100),
      projectId: 'fixture-project',
    });
    // Earlier owner-column fixture stamp description, preserved as history:
    // Stamped by an account that does exist, so `owner_id` is the only reference
    // left dangling — a stamp naming nobody would satisfy the match through
    // `created_by` instead, and the case would stop being about the owner.
    // The current counterpart names an absent account only in its real creation stamp.
    expect(await rejection(repo.create(orphan, [], { at: 1, by: crypto.randomUUID() }))).toMatch(
      /FOREIGN KEY/,
    );
  });
});

describe('what a work package read publishes', () => {
  /**
   * The audit columns are recorded and not published (ADR 0012), and this is
   * the read that decides it for `GET /api/work-packages/{id}` and `PATCH` — neither
   * declares a response schema, so whatever the store hands back is the body.
   *
   * `toWorkPackage` spread the rest of the row until 2026-09-02, so `createdBy` — a
   * user id — and `updatedAt` were on the wire, while the JSDoc on `stepsOf`
   * cited this mapper as the reason they could not be. Asserted against the
   * declared type's own keys rather than a second hand-written list, so a
   * column added to `WorkPackage` is not a column this test forgets.
   *
   * Proof: with `withoutAuditColumns(rest)` in `toWorkPackage` put back to `...rest`,
   * watched failing on
   * `expect(received).toEqual(expected) · + "createdBy" · + "updatedAt"`
   * (2026-09-02).
   */
  it('carries the columns the Work package type declares and no others', async () => {
    const made = await repo.create(workPackage('Rewire', 10), [], wrote());
    if (typeof made === 'string') throw new Error(`work package write refused: ${made}`);
    const read = await repo.findById(made.id);

    expect(read).not.toBeNull();
    expect(Object.keys(read ?? {}).sort()).toEqual(Object.keys(made).sort());
    expect(Object.keys(read ?? {})).not.toContain('createdBy');
    expect(Object.keys(read ?? {})).not.toContain('updatedAt');
  });

  /**
   * The three settings, published by name (tasks.md 3b.2).
   *
   * This case replaces `withholds the optimizer settings until the read payload
   * declares them`, which run 33 wrote to hold the columns off the payload
   * until this item mapped them; 3b.2 deletes it rather than lets it pass,
   * because a `not.toContain` that has become true by accident is a test that
   * cannot fail. The assertion is inverted rather than dropped: the case above
   * says only "the same keys as the created work package", and would go quiet if the
   * mapper and `create` both stopped carrying all three at once.
   *
   * Proof: with the three names put back into `INTERNAL_WORK_PACKAGE_COLUMNS`, this
   * fails on the first expectation.
   */
  it('publishes the three work package settings in the read payload', async () => {
    const made = await repo.create(workPackage('Rewire', 10), [], wrote());
    if (typeof made === 'string') throw new Error(`work package write refused: ${made}`);
    const read = await repo.findById(made.id);
    const published = Object.keys(read ?? {});

    expect(published).toContain('optimizationEnabled');
    expect(published).toContain('scheduleEngine');
    expect(published).toContain('scheduleObjective');
    // Never published: the drain's cross-process fence is internal state and no
    // boundary returns it (tasks.md 3.1b).
    expect(published).not.toContain('optimizationDeletePendingAt');
  });

  /**
   * The values a work package gets when nobody states them, read back through the
   * production path (tasks.md 3b.2, 3b.4).
   *
   * `create` writes the three explicitly rather than omitting the columns, so
   * this case is the one that proves its constant and the migration's
   * `ADD COLUMN` defaults still agree: the second work package is inserted with raw
   * SQL naming neither settings column, which is the only way to read what the
   * database itself defaults to, and the two reads must match.
   *
   * Proof: with `DEFAULT_WORK_PACKAGE_SETTINGS.engine` changed to `optimized`, the
   * two reads disagree and this fails on `scheduleEngine`.
   */
  /**
   * Each setting patched on its own, and read back off the database rather than
   * off `update`'s own answer (tasks.md 3b.2, 3b.4).
   *
   * Three separate patches rather than one carrying all three, because the
   * columns are independent by design: a work package switched off must keep the
   * engine and objective it was on, so it comes back to them rather than to a
   * default when it is switched on again. One combined patch would pass against
   * an `update` that wrote all three from whichever key it saw first.
   *
   * The reload is the point. `update` returns its own `RETURNING` row, so a
   * patch that never reached the column would still be answered correctly by
   * the same statement that failed to write it.
   *
   * Proof: with `optimizationEnabled` dropped from the `SET` — spread as
   * `...fields` — this fails on the first reload.
   */
  it('patches each work package setting on its own, and each survives a reload', async () => {
    const made = await repo.create(workPackage('Rewire', 10), [], wrote());
    if (typeof made === 'string') throw new Error(`work package write refused: ${made}`);

    await repo.update(made.id, { optimizationEnabled: true }, wrote());
    expect(await repo.findById(made.id)).toMatchObject({
      optimizationEnabled: true,
      scheduleEngine: 'fast',
      scheduleObjective: 'pri',
    });

    await repo.update(made.id, { scheduleEngine: 'optimized' }, wrote());
    expect(await repo.findById(made.id)).toMatchObject({
      optimizationEnabled: true,
      scheduleEngine: 'optimized',
      scheduleObjective: 'pri',
    });

    const settled = await repo.update(made.id, { scheduleObjective: 'time' }, wrote());
    if (typeof settled === 'string') throw new Error(`work package write refused: ${settled}`);
    expect(await repo.findById(made.id)).toMatchObject({
      optimizationEnabled: true,
      scheduleEngine: 'optimized',
      scheduleObjective: 'time',
    });
    // Three writes, three bumps: a settings patch is a write to the work package
    // like any other, and a reader holding revision 1 must not be able to
    // overwrite it blind.
    expect(settled?.revision).toBe(made.revision + 3);
  });

  it('turns optimization off as an idempotent work-package-scoped cancellation', async () => {
    const made = await repo.create(
      {
        ...workPackage('Rewire', 10),
        optimizationEnabled: true,
        scheduleEngine: 'optimized',
      },
      [],
      wrote(),
    );
    if (typeof made === 'string') throw new Error(`work package write refused: ${made}`);
    const bystander = await repo.create(
      {
        ...workPackage('Roof', 11),
        optimizationEnabled: true,
        scheduleEngine: 'optimized',
      },
      [],
      wrote(),
    );
    if (typeof bystander === 'string') throw new Error(`work package write refused: ${bystander}`);
    const db = openFixtureDatabase(join(dir, 'test.db'));
    for (const [workPackageId, contractVersion, cancelEpoch] of [
      [made.id, '7+1.0.0', 2],
      [made.id, '8+1.0.0', 4],
      [bystander.id, '7+1.0.0', 6],
    ] as const) {
      db.insert(optimizationGeneration)
        .values({
          workPackageId,
          contractVersion,
          generation: 1,
          inputHash: 'hash',
          cancelEpoch,
          admissionState: 'open',
          updatedAt: 1,
        })
        .run();
      db.insert(solverQueue)
        .values({
          workPackageId,
          contractVersion,
          objective: 'pri',
          budgetMs: 60_000,
          generation: 1,
          admittedCancelEpoch: cancelEpoch,
          enqueuedAt: 1,
        })
        .run();
      db.insert(solverSlot)
        .values({
          workPackageId,
          contractVersion,
          generation: 1,
          objective: 'time',
          budgetMs: 60_000,
          ownerId: 'blue',
          attemptToken: `${workPackageId}-${contractVersion}`,
          lifecycle: 'running',
          pid: 42,
          startedAt: 1,
          heartbeatAt: 1,
          cancelRequestedAt: null,
          admittedDeadlineAt: 80_000,
        })
        .run();
    }

    await repo.update(made.id, { optimizationEnabled: false }, { at: 50, by: ownerId });
    await repo.update(made.id, { optimizationEnabled: false }, { at: 60, by: ownerId });

    const generations = db.select().from(optimizationGeneration).all();
    expect(
      new Set(
        generations.map(
          (row) =>
            `${row.workPackageId}/${row.contractVersion}/${String(row.cancelEpoch)}/${String(row.updatedAt)}`,
        ),
      ),
    ).toEqual(
      new Set([
        `${made.id}/7+1.0.0/3/50`,
        `${made.id}/8+1.0.0/5/50`,
        `${bystander.id}/7+1.0.0/6/1`,
      ]),
    );
    const slots = db.select().from(solverSlot).all();
    expect(slots.filter((row) => row.workPackageId === made.id)).toHaveLength(2);
    expect(
      slots
        .filter((row) => row.workPackageId === made.id)
        .every((row) => row.cancelRequestedAt === 50),
    ).toBe(true);
    expect(slots.find((row) => row.workPackageId === bystander.id)?.cancelRequestedAt).toBeNull();
    expect(
      db
        .select()
        .from(solverQueue)
        .all()
        .map((row) => row.workPackageId),
    ).toEqual([bystander.id]);
    expect(await repo.findById(made.id)).toMatchObject({ optimizationEnabled: false });

    // 6.9c-c: the ON→OFF edge's epoch increment authorizes cleanup; no child
    // token is involved. Without that cleanup, the first generation tuple
    // stays at 2/1, both owned slots stay null, and both queue rows survive.
  });

  /**
   * A patch that says nothing reads instead of writing (tasks.md 3b.2).
   *
   * The guard used to be one `=== undefined` line per `WorkPackagePatch` key, which
   * this item would have grown by three; a key added without its line is a
   * patch that silently reads. It is now `Object.values(...).every(...)`, and
   * this case is what says so: the empty patch must leave the revision where it
   * was, and the settings patch beside it must not.
   *
   * Proof: with the guard deleted, the empty patch reaches drizzle and the case
   * fails on `SET` with no assignments rather than on the revision.
   */
  it('reads rather than writes when the patch names nothing, settings included', async () => {
    const made = await repo.create(workPackage('Rewire', 10), [], wrote());
    if (typeof made === 'string') throw new Error(`work package write refused: ${made}`);

    const untouched = await repo.update(made.id, {}, wrote());
    if (typeof untouched === 'string') throw new Error(`work package write refused: ${untouched}`);
    expect(untouched?.revision).toBe(made.revision);

    const explicitlyAbsent = await repo.update(
      made.id,
      { optimizationEnabled: undefined, scheduleEngine: undefined },
      wrote(),
    );
    if (typeof explicitlyAbsent === 'string')
      throw new Error(`work package write refused: ${explicitlyAbsent}`);
    expect(explicitlyAbsent?.revision).toBe(made.revision);

    const written = await repo.update(made.id, { optimizationEnabled: true }, wrote());
    if (typeof written === 'string') throw new Error(`work package write refused: ${written}`);
    expect(written?.revision).toBe(made.revision + 1);
  });

  it('creates a work package without settings agreeing with the columns own defaults', async () => {
    const made = await repo.create(workPackage('Rewire', 10), [], wrote());
    if (typeof made === 'string') throw new Error(`work package write refused: ${made}`);
    const throughCreate = await repo.findById(made.id);

    const raw = openDatabase(join(dir, 'test.db'));
    const defaulted = crypto.randomUUID();
    try {
      raw.run(
        `INSERT INTO work_package (id, name, project_id, created_by, restricted, revision, created_at)
         VALUES ('${defaulted}', 'Defaulted', 'fixture-project', '${ownerId}', 0, 0, 1)`,
      );
    } finally {
      raw.close();
    }
    const throughDefaults = await repo.findById(defaulted);

    expect(throughCreate).toMatchObject({
      optimizationEnabled: false,
      scheduleEngine: 'fast',
      scheduleObjective: 'pri',
    });
    expect(throughDefaults).toMatchObject({
      optimizationEnabled: throughCreate?.optimizationEnabled ?? true,
      scheduleEngine: throughCreate?.scheduleEngine ?? 'optimized',
      scheduleObjective: throughCreate?.scheduleObjective ?? 'time',
    });
  });

  /**
   * A stored settings value outside its vocabulary, refused on the way out
   * (tasks.md 3b.8).
   *
   * The `CHECK`s refuse the write, so the row has to be injected with
   * `PRAGMA ignore_check_constraints = ON` — which is what a row written by a
   * release before the constraint, or restored from an older backup, looks
   * like. That is the only state a read validator exists for, and the refusal
   * names the column and the value so the log line alone is diagnosable.
   *
   * Proof: with either guard removed from `toWorkPackage`, the matching case fails
   * on `expected [Function] to throw`.
   */
  it.each([
    [
      'schedule_engine',
      'shcedule_engine_typo',
      'unknown work_package.schedule_engine in the database',
    ],
    ['schedule_objective', 'priority', 'unknown work_package.schedule_objective in the database'],
  ])('refuses a stored %s it does not know', async (column, stored, message) => {
    const made = await repo.create(workPackage('Rewire', 10), [], wrote());
    if (typeof made === 'string') throw new Error(`work package write refused: ${made}`);

    const refused = openDatabase(join(dir, 'test.db'));
    let enforced: string | null = null;
    try {
      refused.run(`UPDATE work_package SET ${column} = '${stored}' WHERE id = '${made.id}'`);
    } catch (error) {
      enforced = error instanceof Error ? error.message : String(error);
    } finally {
      refused.close();
    }
    // Half the case: the injection below would prove nothing about a `CHECK`
    // that was never declared.
    expect(enforced).toContain('CHECK');

    const injected = openDatabase(join(dir, 'test.db'));
    try {
      injected.run('PRAGMA ignore_check_constraints = ON;');
      injected.run(`UPDATE work_package SET ${column} = '${stored}' WHERE id = '${made.id}'`);
    } finally {
      injected.close();
    }

    let refusedOnRead: string | null = null;
    try {
      await repo.findById(made.id);
    } catch (error) {
      refusedOnRead = error instanceof Error ? error.message : String(error);
    }
    expect(refusedOnRead).toBe(`${message}: ${stored}`);
  });
});

describe('organization-scoped writes', () => {
  async function scopedWriter(grantRoleId: 'package-viewer' | null) {
    const raw = openDatabase(join(dir, 'test.db'));
    raw.run("INSERT INTO organization (id,name,created_at) VALUES ('org-a','A',1)");
    seedPackageParent(join(dir, 'test.db'), 'org-a', 'org-a-parent');
    raw.run(
      "UPDATE organization_activation SET state='activated',activated_at=5 WHERE singleton=1",
    );
    raw.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a',?,'member',1)",
      [ownerId],
    );
    const requested = { ...workPackage('Scoped target', 1), projectId: 'org-a-parent' };
    await bindSteps('org-a', requested.projectId, 'Dev');
    const target = await createForScopedChecks(requested, 'org-a');
    if (grantRoleId !== null)
      raw.run(
        "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,'org-a','work_package',?,'user',?,?,'route',1)",
        [crypto.randomUUID(), target.id, ownerId, grantRoleId],
      );
    const editor = {
      principal: { id: ownerId },
      actorId: ownerId,
      auditId: crypto.randomUUID(),
      role: 'super_admin' as const,
    };
    const capture = () =>
      [
        'work_package',
        'work_package_organization',
        'step_definition',
        'step_binding',
        'work_package_step',
        'organization_audit',
        'command_journal',
        'event_log',
        'event_sequencer',
      ].map((table) => raw.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
    return { raw, target, editor, capture };
  }

  it('conceals an owned hidden work package exactly like an absent target in the independent writer', async () => {
    const fixture = await scopedWriter(null);
    try {
      const before = fixture.capture();
      for (const patch of [{ name: 'Must stay hidden' }, {}]) {
        expect(
          await repo.editInOrganization(fixture.target.id, patch, wrote(), 'org-a', fixture.editor),
        ).toBeNull();
        expect(
          await repo.editInOrganization('missing', patch, wrote(), 'org-a', fixture.editor),
        ).toBeNull();
        expect(fixture.capture()).toEqual(before);
      }
    } finally {
      fixture.raw.close();
    }
  });

  it('refuses a readable work package without settings permission in the independent writer', async () => {
    const fixture = await scopedWriter('package-viewer');
    try {
      const before = fixture.capture();
      for (const patch of [{ name: 'Must stay unchanged' }, {}]) {
        expect(
          await repo.editInOrganization(fixture.target.id, patch, wrote(), 'org-a', fixture.editor),
        ).toBe('forbidden');
        expect(fixture.capture()).toEqual(before);
      }
    } finally {
      fixture.raw.close();
    }
  });

  it('records an open and a write only while the organization owns the work package', async () => {
    const raw = openDatabase(join(dir, 'test.db'));
    try {
      raw.run(
        "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
      );
      seedPackageParent(join(dir, 'test.db'), 'org-a', 'org-a-parent');
      seedPackageParent(join(dir, 'test.db'), 'org-b', 'org-b-parent');
      raw.run(
        "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
      );
      const owned = { ...workPackage('Owned', 1), projectId: 'org-a-parent' };
      const foreign = { ...workPackage('Foreign', 2), projectId: 'org-b-parent' };
      await createForScopedChecks(owned, 'org-a');
      await createForScopedChecks(foreign, 'org-b');
      raw.run(
        "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', ?, 'member', 1)",
        [ownerId],
      );
      raw.run(
        "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('scoped-owned','org-a','work_package',?,'user',?,'package-manager','route',1)",
        [owned.id, ownerId],
      );
      const editor = {
        principal: { id: ownerId },
        actorId: ownerId,
        auditId: 'audit-1',
        role: 'super_admin' as const,
      };

      expect(
        await repo.editInOrganization(foreign.id, { name: 'Taken' }, wrote(), 'org-a', editor),
      ).toBe(null);
      expect(await repo.editInOrganization(foreign.id, {}, wrote(), 'org-a', editor)).toBe(null);
      expect(await repo.recordOpenInOrganization(foreign.id, wrote(), 'org-a')).toBe(false);
      expect((await repo.findById(foreign.id))?.name).toBe('Foreign');
      expect(raw.query('SELECT COUNT(*) AS n FROM work_package_access').get()).toEqual({ n: 0 });

      expect(
        await repo.editInOrganization(owned.id, { name: 'Renamed' }, wrote(), 'org-a', editor),
      ).toMatchObject({ name: 'Renamed' });
      expect(await repo.recordOpenInOrganization(owned.id, wrote(), 'org-a')).toBe(true);
      expect(raw.query('SELECT work_package_id FROM work_package_access').all()).toEqual([
        { work_package_id: owned.id },
      ]);
    } finally {
      raw.close();
    }
  });
});

describe('findCrossReferences', () => {
  it('searches every arm through an index and scans no table', async () => {
    const path = join(dir, 'test.db');
    const queries: { sql: string; params: unknown[] }[] = [];
    const logged = new WorkPackageRepository(
      openFixtureDatabase(path, { logQuery: (sql, params) => queries.push({ sql, params }) }),
      OPEN,
    );
    await logged.findCrossReferences('p', 'o');
    const query = queries.at(-1);
    if (query === undefined) throw new Error('findCrossReferences issued no statement');
    const raw = openDatabase(path);
    try {
      // Parameters arrive as drizzle logged them: the work package and organization ids.
      const plan = raw
        .query<{ detail: string }, string[]>(`EXPLAIN QUERY PLAN ${query.sql}`)
        .all(...(query.params as string[]));
      expect(plan.length).toBeGreaterThan(0);
      // Every alias the arms give `work_item` or `dependency`. A scan of the
      // small `workPackage` table, through its covering index, is allowed: the
      // parent arm probes `work_item_siblings` once per other work package.
      // Proof, observed 2026-09-29: with the `incoming_parent` arm restored to
      // its join on `parent.id = w.parent_id`, this listed `SCAN w`; with the
      // `incoming_dependency` arm restored, `SCAN d`. Each scan ran the whole
      // `work_item` or `dependency` table on every scoped work package read.
      const scans = plan
        .map(({ detail }) => detail)
        .filter((detail) => /^SCAN (w|d|l|pre|suc|parent|work_item|dependency)\b/.test(detail));
      expect(scans).toEqual([]);
    } finally {
      raw.close();
    }
  });

  // Proof: with the two resource arms removed from `findCrossReferences`, this
  // answered []; watched 2026-10-20.
  it('reports a demand, a capacity and an occupancy naming another organization’s resource', async () => {
    const raw = openDatabase(join(dir, 'test.db'));
    try {
      raw.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
      seedPackageParent(join(dir, 'test.db'), 'org-a', 'org-a-parent');
      raw.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
      seedPackageParent(join(dir, 'test.db'), 'org-b', 'org-b-parent');
      raw.run(
        "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
      );
      const mine = { ...workPackage('Mine', 1), projectId: 'org-a-parent' };
      await bindSteps('org-a', mine.projectId, 'Dev');
      await createForScopedChecks(mine, 'org-a');
      raw.run(
        "INSERT INTO work_item (id, work_package_id, parent_id, position, name) VALUES ('w-m', ?, NULL, 0, 'Root')",
        [mine.id],
      );
      raw.run(
        "INSERT INTO resource (id, name, kind, unit_label) VALUES ('ram-a', 'ram-a', 'divisible', 'GB'), ('ram-b', 'ram-b', 'divisible', 'GB')",
      );
      raw.run(
        "INSERT INTO resource_organization (resource_id, organization_id, name) VALUES ('ram-a', 'org-a', 'RAM'), ('ram-b', 'org-b', 'RAM')",
      );
      raw.run(
        "INSERT INTO work_item_resource_demand (work_item_id, resource_id, units) VALUES ('w-m', 'ram-a', 1), ('w-m', 'ram-b', 2)",
      );
      raw.run(
        "INSERT INTO work_package_resource_capacity (work_package_id, resource_id, units) VALUES (?, 'ram-a', 4), (?, 'ram-b', 8)",
        [mine.id, mine.id],
      );
      const stepId = raw
        .query<{ id: string }, [string]>(
          'SELECT step_id AS id FROM work_package_step WHERE work_package_id = ?',
        )
        .get(mine.id)?.id;
      if (stepId === undefined) throw new Error('the work package has no step');
      raw.run("INSERT INTO person (id, name) VALUES ('pe-m', 'Mine')");
      raw.run(
        "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('pe-m', 'org-a', 'Mine')",
      );
      raw.run(
        "INSERT INTO claim (id, work_item_id, step_id, person_id) VALUES ('c-m', 'w-m', ?, 'pe-m')",
        [stepId],
      );
      raw.run(
        "INSERT INTO claim_occupancy (claim_id, resource_id, units) VALUES ('c-m', 'ram-a', 1), ('c-m', 'ram-b', 2)",
      );

      expect(await repo.findCrossReferences(mine.id, 'org-a')).toEqual([
        { kind: 'work_package_resource_capacity', id: 'ram-b' },
        { kind: 'work_item_resource_demand', id: 'w-m/ram-b' },
        { kind: 'claim_occupancy_resource', id: 'c-m/ram-b' },
      ]);
    } finally {
      raw.close();
    }
  });

  it('reports a work item whose parent lies in another work package', async () => {
    const raw = openDatabase(join(dir, 'test.db'));
    try {
      raw.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
      seedPackageParent(join(dir, 'test.db'), 'org-a', 'org-a-parent');
      raw.run(
        "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
      );
      const mine = { ...workPackage('Mine', 1), projectId: 'org-a-parent' };
      const theirs = { ...workPackage('Theirs', 2), projectId: 'org-a-parent' };
      await createForScopedChecks(mine, 'org-a');
      await createForScopedChecks(theirs, 'org-a');
      raw.run(
        "INSERT INTO work_item (id, work_package_id, parent_id, position, name) VALUES ('w-t', ?, NULL, 0, 'Root')",
        [theirs.id],
      );
      raw.run(
        "INSERT INTO work_item (id, work_package_id, parent_id, position, name) VALUES ('w-m', ?, 'w-t', 0, 'Child')",
        [mine.id],
      );

      expect(await repo.findCrossReferences(mine.id, 'org-a')).toEqual([
        { kind: 'work_item_parent', id: 'w-m' },
      ]);
    } finally {
      raw.close();
    }
  });
});

/** Owns the two acquired connections used by current OPEN controls; old suite cleanup remains unchanged. */
async function runOpeningStoreCase(
  exercise: (scope: {
    raw: ReturnType<typeof openDatabase>;
    connection: Connection;
    target: WorkPackage;
    snapshot: () => { name: string; rows: Record<string, unknown>[] }[];
    nativeTransactions: { count: number };
  }) => Promise<void>,
): Promise<void> {
  const { openConnection } = await import('./db');
  let raw: ReturnType<typeof openDatabase> | undefined;
  let connection: Connection | undefined;
  let acquisition: 'raw' | 'source' | undefined;
  let primary: { cause: unknown } | undefined;
  const cleanup: unknown[] = [];
  try {
    acquisition = 'raw';
    raw = openDatabase(join(dir, 'test.db'));
    openingOwners.add(raw);
    acquisition = undefined;
    const nativeTransactions = { count: 0 };
    acquisition = 'source';
    connection = openConnection(join(dir, 'test.db'), undefined, () => {
      nativeTransactions.count++;
    });
    openingOwners.add(connection);
    acquisition = undefined;
    raw.run(
      "INSERT INTO organization(id,name,created_at) VALUES('opening-org','Opening',1),('opening-foreign','Foreign',1)",
    );
    seedPackageParent(join(dir, 'test.db'), 'opening-org', 'opening-parent');
    seedPackageParent(join(dir, 'test.db'), 'opening-org', 'opening-next-parent');
    seedPackageParent(join(dir, 'test.db'), 'opening-foreign', 'opening-foreign-parent');
    raw.run(
      "UPDATE organization_activation SET state='activated',activated_at=5 WHERE singleton=1",
    );
    raw.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('opening-org',?,'member',1)",
      [ownerId],
    );
    const draft = { ...workPackage('Opening target', 1), projectId: 'opening-parent' };
    const target = await createForScopedChecks(draft, 'opening-org');
    raw.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('opening-viewer','opening-org','work_package',?,'user',?,'package-viewer','route',1)",
      [target.id, ownerId],
    );
    const selected = raw;
    const snapshot = () =>
      selected
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map(({ name }) => ({
          name,
          rows: selected
            .query<Record<string, unknown>, []>(
              'SELECT * FROM "' + name.replaceAll('"', '""') + '"',
            )
            .all()
            .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
        }));
    await exercise({ raw, connection, target, snapshot, nativeTransactions });
  } catch (cause) {
    primary = { cause };
    if (acquisition !== undefined) openingAcquisitionFailures.push({ cause });
  }
  if (connection !== undefined) {
    try {
      connection.close();
      openingOwners = new Set([...openingOwners].filter((owner) => owner !== connection));
    } catch (cause) {
      cleanup.push(cause);
    }
  }
  if (raw !== undefined) {
    try {
      raw.close(true);
      openingOwners = new Set([...openingOwners].filter((owner) => owner !== raw));
    } catch (cause) {
      cleanup.push(cause);
    }
  }
  if (primary !== undefined) {
    if (cleanup.length !== 0)
      throw new AggregateError(
        [primary.cause, ...cleanup],
        'Opening store control and cleanup failed',
        { cause: primary.cause },
      );
    throw primary.cause;
  }
  if (cleanup.length !== 0)
    throw new AggregateError(cleanup, 'Opening store cleanup failed', { cause: cleanup[0] });
}

it('records and restamps only navigation access for a real current package viewer without edit permission', async () =>
  runOpeningStoreCase(async ({ raw, connection, target, snapshot }) => {
    const store = new WorkPackageRepository(connection.db, OPEN);
    const before = snapshot();
    expect(
      raw
        .query(
          "SELECT permission FROM access_role_permission WHERE role_id='package-viewer' ORDER BY permission",
        )
        .all(),
    ).toEqual([{ permission: 'organization.navigate' }, { permission: 'package.read' }]);
    expect(
      await store.recordReadableOpenInOrganization(
        target.id,
        { by: ownerId, at: 7 },
        'opening-org',
        { id: ownerId },
      ),
    ).toBe(true);
    expect(raw.query('SELECT * FROM work_package_access').all()).toEqual([
      {
        user_id: ownerId,
        work_package_id: target.id,
        last_opened_at: 7,
        created_at: 7,
        updated_at: 7,
        created_by: ownerId,
      },
    ]);
    expect(
      await store.recordReadableOpenInOrganization(
        target.id,
        { by: ownerId, at: 9 },
        'opening-org',
        { id: ownerId },
      ),
    ).toBe(true);
    expect(raw.query('SELECT * FROM work_package_access').all()).toEqual([
      {
        user_id: ownerId,
        work_package_id: target.id,
        last_opened_at: 9,
        created_at: 7,
        updated_at: 9,
        created_by: ownerId,
      },
    ]);
    expect(snapshot().filter((table) => table.name !== 'work_package_access')).toEqual(
      before.filter((table) => table.name !== 'work_package_access'),
    );
  }));

it('conceals absent, foreign and owned unreadable OPEN targets without any physical write', async () =>
  runOpeningStoreCase(async ({ raw, connection, target, snapshot }) => {
    const store = new WorkPackageRepository(connection.db, OPEN);
    raw.run('DELETE FROM access_grant WHERE id=?', ['opening-viewer']);
    raw.run('UPDATE work_package SET restricted=1 WHERE id=?', [target.id]);
    const before = snapshot();
    for (const [id, organizationId] of [
      ['absent-opening', 'opening-org'],
      [target.id, 'opening-foreign'],
      [target.id, 'opening-org'],
    ] as const) {
      expect(
        await store.recordReadableOpenInOrganization(id, { by: ownerId, at: 7 }, organizationId, {
          id: ownerId,
        }),
      ).toBe(false);
      expect(snapshot()).toEqual(before);
    }
  }));

it('uses the actual current parent read grant and never requires package.write for OPEN', async () =>
  runOpeningStoreCase(async ({ raw, connection, target, snapshot }) => {
    const store = new WorkPackageRepository(connection.db, OPEN);
    raw.run(
      "UPDATE access_grant SET scope_kind='project',scope_id='opening-parent',role_id='project-viewer' WHERE id='opening-viewer'",
    );
    raw.run('UPDATE work_package SET restricted=1 WHERE id=?', [target.id]);
    expect(
      await store.recordReadableOpenInOrganization(
        target.id,
        { by: ownerId, at: 7 },
        'opening-org',
        { id: ownerId },
      ),
    ).toBe(true);
    raw.run("UPDATE work_package SET project_id='opening-next-parent' WHERE id=?", [target.id]);
    const before = snapshot();
    expect(
      await store.recordReadableOpenInOrganization(
        target.id,
        { by: ownerId, at: 9 },
        'opening-org',
        { id: ownerId },
      ),
    ).toBe(false);
    expect(snapshot()).toEqual(before);
  }));

it('rejects a mismatched opening stamp before entering its real owned Gate', async () =>
  runOpeningStoreCase(async ({ connection, target, snapshot }) => {
    let acquired = 0;
    const store = new WorkPackageRepository(connection.db, {
      enter: async (work) => {
        acquired++;
        return await work();
      },
    });
    const before = snapshot();
    expect(
      await rejection(
        store.recordReadableOpenInOrganization(
          target.id,
          { by: 'another-account', at: 7 },
          'opening-org',
          { id: ownerId },
        ),
      ),
    ).toBe('opening stamp differs from the permission principal');
    expect(acquired).toBe(0);
    expect(snapshot()).toEqual(before);
  }));

it('keeps a borrowed OPEN inside the existing transaction without another Gate or native transaction', async () =>
  runOpeningStoreCase(async ({ connection, target, snapshot, nativeTransactions }) => {
    const { drizzleOuterTransaction } = await import('./db');
    const transaction = drizzleOuterTransaction(connection.db);
    const store = new WorkPackageRepository(
      connection.db,
      {
        enter: () => {
          throw Error('Borrowed OPEN reacquired its Gate');
        },
      },
      'borrowed',
    );
    const before = snapshot();
    transaction.begin();
    let primary: { cause: unknown } | undefined;
    try {
      expect(
        await store.recordReadableOpenInOrganization(
          target.id,
          { by: ownerId, at: 7 },
          'opening-org',
          { id: ownerId },
        ),
      ).toBe(true);
    } catch (cause) {
      primary = { cause };
    }
    let cleanup: { cause: unknown } | undefined;
    try {
      transaction.rollback();
    } catch (cause) {
      cleanup = { cause };
    }
    if (primary !== undefined) {
      if (cleanup !== undefined)
        throw new AggregateError(
          [primary.cause, cleanup.cause],
          'Borrowed OPEN control rollback failed',
          { cause: primary.cause },
        );
      throw primary.cause;
    }
    if (cleanup !== undefined) throw cleanup.cause;
    expect(nativeTransactions.count).toBe(0);
    expect(snapshot()).toEqual(before);
  }));

it('retains the selected principal and stamp while an owned OPEN waits for its Gate', async () =>
  runOpeningStoreCase(async ({ raw, connection, target }) => {
    const released = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const store = new WorkPackageRepository(connection.db, {
      enter: async (work) => {
        entered.resolve(undefined);
        await released.promise;
        return await work();
      },
    });
    const principal = {
      id: ownerId,
      authentication: { kind: 'first_party' as const, issuedAt: 1 },
    };
    const stamp = { by: ownerId, at: 7 };
    const observed = store
      .recordReadableOpenInOrganization(target.id, stamp, 'opening-org', principal)
      .then(
        (value) => ({ ok: true as const, value }),
        (cause: unknown) => ({ ok: false as const, cause }),
      );
    let primary: { cause: unknown } | undefined;
    let primaryOwnsPending = false;
    try {
      const entry = await Promise.race([
        entered.promise.then(() => ({ entered: true as const })),
        observed.then((settled) => ({ entered: false as const, settled })),
      ]);
      if (!entry.entered) {
        if (!entry.settled.ok) {
          primaryOwnsPending = true;
          throw entry.settled.cause;
        }
        throw Error('Owned OPEN settled before its Gate entry');
      }
      principal.id = 'changed-account';
      principal.authentication.issuedAt = 99;
      stamp.by = 'changed-account';
      stamp.at = 99;
    } catch (cause) {
      primary = { cause };
    }
    released.resolve(undefined);
    const settled = await observed;
    if (primary !== undefined) {
      if (!settled.ok && !primaryOwnsPending)
        throw new AggregateError(
          [primary.cause, settled.cause],
          'Owned OPEN entry and settlement failed',
          { cause: primary.cause },
        );
      throw primary.cause;
    }
    if (!settled.ok) throw settled.cause;
    expect(settled.value).toBe(true);
    expect(raw.query('SELECT * FROM work_package_access').all()).toEqual([
      {
        user_id: ownerId,
        work_package_id: target.id,
        last_opened_at: 7,
        created_at: 7,
        updated_at: 7,
        created_by: ownerId,
      },
    ]);
  }));

it.each(['INSERT', 'UPDATE'] as const)(
  'rolls back an actual access %s trigger abort without changing any table',
  async (operation) =>
    runOpeningStoreCase(async ({ raw, connection, target, snapshot }) => {
      const store = new WorkPackageRepository(connection.db, OPEN);
      if (operation === 'UPDATE')
        expect(
          await store.recordReadableOpenInOrganization(
            target.id,
            { by: ownerId, at: 3 },
            'opening-org',
            { id: ownerId },
          ),
        ).toBe(true);
      raw.run(
        'CREATE TRIGGER opening_access_abort BEFORE ' +
          operation +
          " ON work_package_access BEGIN SELECT RAISE(ABORT,'opening-access-sentinel'); END",
      );
      const before = snapshot();
      expect(
        await rejection(
          store.recordReadableOpenInOrganization(target.id, { by: ownerId, at: 7 }, 'opening-org', {
            id: ownerId,
          }),
        ),
      ).toContain('opening-access-sentinel');
      expect(snapshot()).toEqual(before);
    }),
);

it('does not project private package settings when recording readable or hidden navigation', async () =>
  runOpeningStoreCase(async ({ raw, connection, target, snapshot }) => {
    const store = new WorkPackageRepository(connection.db, OPEN);
    raw.run('PRAGMA ignore_check_constraints=ON');
    expect(raw.query('PRAGMA ignore_check_constraints').get()).toEqual({
      ignore_check_constraints: 1,
    });
    raw.run("UPDATE work_package SET estimate_method='malformed-private-estimate' WHERE id=?", [
      target.id,
    ]);
    raw.run('PRAGMA ignore_check_constraints=OFF');
    expect(raw.query('PRAGMA ignore_check_constraints').get()).toEqual({
      ignore_check_constraints: 0,
    });
    expect(raw.query('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(
      await store.recordReadableOpenInOrganization(
        target.id,
        { by: ownerId, at: 7 },
        'opening-org',
        { id: ownerId },
      ),
    ).toBe(true);
    raw.run("DELETE FROM access_grant WHERE id='opening-viewer'");
    const before = snapshot();
    expect(
      await store.recordReadableOpenInOrganization(
        target.id,
        { by: ownerId, at: 9 },
        'opening-org',
        { id: ownerId },
      ),
    ).toBe(false);
    expect(snapshot()).toEqual(before);
  }));

/** Restores exact declared triggers before any production OPEN read, retaining mutation and restore failures. */
function changeOpeningState(
  raw: ReturnType<typeof openDatabase>,
  names: readonly string[],
  mutate: () => void,
): void {
  const originals = names.map((name) => {
    const row = raw
      .query<{ sql: unknown }, [string]>(
        "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?",
      )
      .get(name);
    if (row === null || typeof row.sql !== 'string')
      throw Error('Opening corruptor trigger absent: ' + name);
    return { name, sql: row.sql };
  });
  const removed: typeof originals = [];
  const failures: unknown[] = [];
  try {
    for (const trigger of originals) {
      raw.run('DROP TRIGGER "' + trigger.name + '"');
      removed.push(trigger);
    }
    mutate();
  } catch (cause) {
    failures.push(cause);
  }
  for (const trigger of removed) {
    try {
      raw.run(trigger.sql);
      expect(
        raw
          .query("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?")
          .get(trigger.name),
      ).toEqual({ sql: trigger.sql });
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length !== 0)
    throw new AggregateError(failures, 'Opening mutation or exact trigger restoration failed', {
      cause: failures[0],
    });
}

it.each(['mapping', 'parent', 'restricted'] as const)(
  'throws on owned malformed %s before OPEN even without a grant, with full state unchanged',
  async (column) =>
    runOpeningStoreCase(async ({ raw, connection, target, snapshot }) => {
      raw.run("DELETE FROM access_grant WHERE id='opening-viewer'");
      if (column === 'mapping')
        changeOpeningState(raw, ['work_package_organization_frozen_delete'], () => {
          raw.run('DELETE FROM work_package_organization WHERE resource_id=?', [target.id]);
        });
      if (column === 'parent') {
        const failures: unknown[] = [];
        try {
          raw.run('PRAGMA foreign_keys=OFF');
          expect(raw.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 0 });
          raw.run("DELETE FROM project WHERE id='opening-parent'");
        } catch (cause) {
          failures.push(cause);
        }
        try {
          raw.run('PRAGMA foreign_keys=ON');
          expect(raw.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
        } catch (cause) {
          failures.push(cause);
        }
        if (failures.length !== 0)
          throw new AggregateError(failures, 'Opening missing-parent fixture failed', {
            cause: failures[0],
          });
        expect(raw.query("SELECT id FROM project WHERE id='opening-parent'").get()).toBeNull();
      }
      if (column === 'restricted') {
        const failures: unknown[] = [];
        try {
          raw.run('PRAGMA ignore_check_constraints=ON');
          expect(raw.query('PRAGMA ignore_check_constraints').get()).toEqual({
            ignore_check_constraints: 1,
          });
          raw.run('UPDATE work_package SET restricted=2 WHERE id=?', [target.id]);
        } catch (cause) {
          failures.push(cause);
        }
        try {
          raw.run('PRAGMA ignore_check_constraints=OFF');
          expect(raw.query('PRAGMA ignore_check_constraints').get()).toEqual({
            ignore_check_constraints: 0,
          });
        } catch (cause) {
          failures.push(cause);
        }
        if (failures.length !== 0)
          throw new AggregateError(failures, 'Opening restriction fixture failed', {
            cause: failures[0],
          });
      }
      const before = snapshot();
      const expected =
        column === 'mapping'
          ? 'package ' + target.id + ' has an absent or malformed organization mapping'
          : column === 'parent'
            ? 'package ' + target.id + ' has an absent, malformed or foreign parent'
            : 'restricted of package ' + target.id + ' is 2';
      expect(
        await rejection(
          new WorkPackageRepository(connection.db, OPEN).recordReadableOpenInOrganization(
            target.id,
            { by: ownerId, at: 7 },
            'opening-org',
            { id: ownerId },
          ),
        ),
      ).toBe(expected);
      expect(snapshot()).toEqual(before);
    }),
);

it('keeps a valid foreign mapping opaque before malformed parent and restriction decoding', async () =>
  runOpeningStoreCase(async ({ raw, connection, target, snapshot }) => {
    raw.run('PRAGMA ignore_check_constraints=ON');
    expect(raw.query('PRAGMA ignore_check_constraints').get()).toEqual({
      ignore_check_constraints: 1,
    });
    raw.run('UPDATE work_package SET restricted=2 WHERE id=?', [target.id]);
    raw.run('PRAGMA ignore_check_constraints=OFF');
    expect(raw.query('PRAGMA ignore_check_constraints').get()).toEqual({
      ignore_check_constraints: 0,
    });
    changeOpeningState(
      raw,
      ['work_package_organization_frozen_delete', 'work_package_project_ownership_insert'],
      () => {
        raw.run('DELETE FROM work_package_organization WHERE resource_id=?', [target.id]);
        raw.run(
          "INSERT INTO work_package_organization(resource_id,organization_id) VALUES(?,'opening-foreign')",
          [target.id],
        );
      },
    );
    expect(raw.query('PRAGMA foreign_key_check').all()).toEqual([]);
    const before = snapshot();
    expect(
      await new WorkPackageRepository(connection.db, OPEN).recordReadableOpenInOrganization(
        target.id,
        { by: ownerId, at: 7 },
        'opening-org',
        { id: ownerId },
      ),
    ).toBe(false);
    expect(snapshot()).toEqual(before);
  }));

it('retains the actual access error and an independently failed owned rollback before manual repair', async () =>
  runOpeningStoreCase(async ({ raw, connection, target, snapshot }) => {
    const { spyOn } = await import('bun:test');
    raw.run(
      "CREATE TRIGGER opening_paired_abort BEFORE INSERT ON work_package_access BEGIN SELECT RAISE(ABORT,'opening-primary-sentinel'); END",
    );
    const before = snapshot();
    const original = connection.db.run.bind(connection.db);
    const rollbackFailure = Error('opening-rollback-sentinel');
    let controls = 0;
    const run = spyOn(connection.db, 'run').mockImplementation((query) => {
      controls++;
      if (controls === 2) throw rollbackFailure;
      return original(query);
    });
    let primary: { cause: unknown } | undefined;
    try {
      const observed = await new WorkPackageRepository(connection.db, OPEN)
        .recordReadableOpenInOrganization(target.id, { by: ownerId, at: 7 }, 'opening-org', {
          id: ownerId,
        })
        .then(
          () => ({ rejected: false as const }),
          (cause: unknown) => ({ rejected: true as const, cause }),
        );
      expect(observed.rejected).toBe(true);
      if (!observed.rejected || !(observed.cause instanceof AggregateError))
        throw Error('Opening paired failure was not retained');
      expect(observed.cause.errors).toHaveLength(2);
      expect(messagesOf(observed.cause.errors[0]).join('\n')).toContain('opening-primary-sentinel');
      expect(observed.cause.errors[1]).toBe(rollbackFailure);
      expect(observed.cause.cause).toBe(observed.cause.errors[0]);
      expect(controls).toBe(2);
    } catch (cause) {
      primary = { cause };
    }
    run.mockRestore();
    let cleanup: { cause: unknown } | undefined;
    try {
      connection.db.run('ROLLBACK');
    } catch (cause) {
      cleanup = { cause };
    }
    if (primary !== undefined) {
      if (cleanup !== undefined)
        throw new AggregateError(
          [primary.cause, cleanup.cause],
          'Opening paired control and owner repair failed',
          { cause: primary.cause },
        );
      throw primary.cause;
    }
    if (cleanup !== undefined) throw cleanup.cause;
    expect(snapshot()).toEqual(before);
  }));
