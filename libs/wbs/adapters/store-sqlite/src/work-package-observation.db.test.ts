import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { captureConnectedHistory } from '@wbs/core/module/saved-plans/connected-history';
import { scheduleInputOfCaptured } from '@wbs/core/module/saved-plans/saved-plan-schedule';
import type { CommandCaller } from '@wbs/core/ports/command-access';
import type { OrganizationPrincipal } from '@wbs/core/ports/organization-access';
import type { StoredSavedPlan } from '@wbs/core/ports/saved-plan-values';
import type {
  CapturedScheduleAsk,
  LiveScheduleAsk,
  ScheduleAsk,
  ScheduleRead,
} from '@wbs/core/ports/scheduler';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import {
  CalendarRangeError,
  canonicalConnectedStageInput,
  schedule,
  ScheduleCycleError,
  scheduleResolved,
  serializeSavedConnectedScheduleBody,
} from '@wbs/domain';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import { createScheduler } from '@wbs/runtime-portable';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { captureConnectedQuestion } from './connected-question-identity';
import { type Drizzle, openDatabase, openReadOnlyConnection } from './db';
import { runMigrations } from './migrate';
import { allocateGeneration } from './optimization-generation';
import { scheduleInputHash } from './schedule-input-hash';
import { optimizedScheduleCache } from './schema';
import { openSqliteSource, type SqliteSource } from './source';
import { CAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

const migrations = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
interface FixtureCustody {
  readonly directory: string;
  readonly path: string;
  sqlite: ReturnType<typeof openDatabase> | null;
  source: SqliteSource | null;
  closing: Promise<unknown[]> | null;
}
let custody: FixtureCustody | null = null;
function fixtureSource(): SqliteSource {
  const source = custody?.source;
  if (source === undefined || source === null) throw Error('fixture source is not acquired');
  return source;
}
function fixtureDatabase(): ReturnType<typeof openDatabase> {
  const sqlite = custody?.sqlite;
  if (sqlite === undefined || sqlite === null) throw Error('fixture database is not acquired');
  return sqlite;
}
/** Attempts each successful local acquisition once; uncertain settlement retains its directory. */
async function closeFixture(): Promise<unknown[]> {
  const owned = custody;
  if (owned === null) return [];
  if (owned.closing !== null) return await owned.closing;
  owned.closing = (async () => {
    const failures: unknown[] = [];
    if (owned.source !== null) {
      try {
        await owned.source.close();
        owned.source = null;
      } catch (cause: unknown) {
        failures.push(cause);
      }
    }
    if (owned.sqlite !== null) {
      try {
        owned.sqlite.close(true);
        owned.sqlite = null;
      } catch (cause: unknown) {
        failures.push(cause);
      }
    }
    if (owned.source === null && owned.sqlite === null) {
      try {
        rmSync(owned.directory, { recursive: true });
        if (custody === owned) custody = null;
      } catch (cause: unknown) {
        failures.push(cause);
      }
    }
    return failures;
  })();
  return await owned.closing;
}
async function disposeFixture() {
  const failures = await closeFixture();
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'fixture resource cleanup failed', { cause: failures[0] });
}
let statements: { query: string; parameters: unknown[] }[];
let acquired: number;
let waitSelection: () => Promise<void>;
let selectedPrincipal: OrganizationPrincipal | undefined;

async function openFixture(isActivated = true) {
  if (custody !== null) throw Error('previous fixture settlement is still unknown');
  const directory = mkdtempSync(join(tmpdir(), 'wbs-package-observation-'));
  const path = join(directory, 'store.db');
  const owned: FixtureCustody = { directory, path, sqlite: null, source: null, closing: null };
  custody = owned;
  try {
    runMigrations(path, migrations);
    const sqlite = openDatabase(path);
    owned.sqlite = sqlite;
    sqlite.run(
      "INSERT INTO users(id,username,created_at) VALUES('creator','Creator',1),('reader','Reader',1),('other','Other',1)",
    );
    sqlite.run(
      "INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1),('org-b','B',1)",
    );
    sqlite.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','creator','member',1),('org-b','creator','member',1),('org-a','reader','member',1),('org-b','reader','member',1),('org-a','other','member',1)",
    );
    sqlite.run(
      "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('alpha','org-a','Alpha',1,'creator'),('beta','org-a','Beta',1,'creator'),('foreign','org-b','Foreign',1,'creator')",
    );
    sqlite.run(
      'CREATE TABLE fixture_package_selection(user_id TEXT PRIMARY KEY,organization_id TEXT)',
    );
    sqlite.run("INSERT INTO fixture_package_selection VALUES('reader','org-a')");
    statements = [];
    acquired = 0;
    waitSelection = () => Promise.resolve();
    selectedPrincipal = undefined;
    const source = openSqliteSource({
      dbPath: path,
      dependencyCapability: CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      openReadOnlyConnection(databasePath) {
        acquired++;
        return openReadOnlyConnection(databasePath, {
          logQuery(query, parameters) {
            statements.push({ query, parameters: [...parameters] });
          },
        });
      },
    });
    owned.source = source;
    for (const [id, projectId, organizationId, restricted, at] of [
      ['open', 'alpha', 'org-a', false, 1],
      ['secret', 'alpha', 'org-a', true, 2],
      ['second', 'beta', 'org-a', false, 3],
      ['abroad', 'foreign', 'org-b', false, 4],
    ] as const) {
      const created = await source.stores.workPackages.createInOrganization(
        workPackageRow({ id, projectId, name: id.toUpperCase(), restricted, createdAt: at }),
        [
          {
            id: id + '-dev',
            workPackageId: id,
            name: 'Dev',
            code: 'DEV',
            position: 10,
            allowancePercent: 0,
            estimateUnit: 'workdays',
          },
        ],
        { by: 'creator', at },
        organizationId,
        { id: id + '-grant', auditId: id + '-audit' },
      );
      if (typeof created === 'string') throw Error('fixture package birth refused ' + created);
    }
    if (isActivated)
      sqlite.run(
        "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
      );
  } catch (cause: unknown) {
    const failures = await closeFixture();
    if (failures.length === 0) throw cause;
    throw new AggregateError([cause, ...failures], 'fixture initialization and cleanup failed', {
      cause,
    });
  }
}
beforeEach(async () => {
  await openFixture();
});
afterEach(async () => {
  await disposeFixture();
});

function caller(): Extract<CommandCaller, { kind: 'human' }> {
  return {
    kind: 'human',
    principal: {
      id: 'reader',
      username: 'Reader',
      scopes: ['read', 'write'],
      authentication: { kind: 'first_party', issuedAt: 1 },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'reader' },
      scope: { organizationId: 'org-a', userId: 'reader', cap: null },
    },
  };
}
function activeOrganizationOf(snapshot: Drizzle) {
  return async (principal: OrganizationPrincipal): Promise<string | null> => {
    await waitSelection();
    selectedPrincipal = structuredClone(principal);
    const selected = snapshot
      .all<{ organizationId: unknown }>(
        sql`SELECT organization_id AS organizationId FROM fixture_package_selection WHERE user_id=${principal.id}`,
      )
      .at(0);
    if (selected === undefined || selected.organizationId === null) return null;
    if (typeof selected.organizationId !== 'string') throw Error('fixture selection is malformed');
    return selected.organizationId;
  };
}
function reader() {
  return fixtureSource().createWorkPackageObservation({ activeOrganizationOf, now: () => 100 });
}
function grant(
  role = 'org-viewer',
  kind: 'organization' | 'project' | 'work_package' = 'organization',
  id = 'org-a',
  subjectKind: 'user' | 'machine_credential' = 'user',
  subjectId = 'reader',
) {
  fixtureDatabase().run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,?,?,?,?,?,?,'route',1)",
    [crypto.randomUUID(), 'org-a', kind, id, subjectKind, subjectId, role],
  );
}
function holdSelection() {
  const entered = Promise.withResolvers<undefined>(),
    released = Promise.withResolvers<undefined>();
  waitSelection = () => {
    entered.resolve(undefined);
    return released.promise;
  };
  return {
    entered: entered.promise,
    release: () => {
      waitSelection = () => Promise.resolve();
      released.resolve(undefined);
    },
  };
}
/** Immediately observes rejection, then always releases and joins this exact held operation. */
async function withHeldSelection<T>(start: () => Promise<T>, mutate: () => void): Promise<T> {
  const held = holdSelection();
  let pending: Promise<T>;
  try {
    pending = start();
  } catch (cause: unknown) {
    pending = Promise.resolve().then(() => {
      throw cause;
    });
  }
  const observed = pending.then(
    (value) => ({ ok: true, value }) as const,
    (cause: unknown) => ({ ok: false, cause }) as const,
  );
  let primary: { cause: unknown } | null = null;
  let primaryIsPending = false;
  const failures: unknown[] = [];
  try {
    const first = await Promise.race([
      held.entered.then(() => ({ kind: 'entered' }) as const),
      observed.then((settled) => ({ kind: 'settled', settled }) as const),
    ]);
    if (first.kind === 'settled') {
      if (first.settled.ok) throw Error('fixture read completed before entering held selection');
      primaryIsPending = true;
      throw first.settled.cause;
    }
    mutate();
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    held.release();
  } catch (cause: unknown) {
    failures.push(cause);
  }
  const settled = await observed;
  if (!settled.ok && !primaryIsPending) failures.push(settled.cause);
  if (primary !== null) {
    if (failures.length === 0) throw primary.cause;
    throw new AggregateError(
      [primary.cause, ...failures],
      'held fixture operation and settlement failed',
      { cause: primary.cause },
    );
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'held fixture settlement failed', { cause: failures[0] });
  if (!settled.ok) throw settled.cause;
  return settled.value;
}
async function expectRejection(operation: Promise<unknown>, diagnostic: string) {
  let rejected = false;
  try {
    await operation;
  } catch (cause: unknown) {
    rejected = true;
    expect(() => {
      throw cause;
    }).toThrow(diagnostic);
  }
  expect(rejected).toBe(true);
}

/** Deliberate corruption in this disposable database; exact named guards are restored before production reads. */
function withoutTriggers(names: readonly string[], corrupt: () => void) {
  const originals = names.map((name) => {
    const selected: unknown = fixtureDatabase()
      .query<{ sql: unknown }, [string]>(
        "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?",
      )
      .get(name);
    if (
      typeof selected !== 'object' ||
      selected === null ||
      !('sql' in selected) ||
      typeof selected.sql !== 'string'
    )
      throw Error('fixture trigger missing ' + name);
    return { name, sql: selected.sql };
  });
  const removed: typeof originals = [],
    failures: unknown[] = [];
  try {
    for (const original of originals) {
      fixtureDatabase().run('DROP TRIGGER "' + original.name + '"');
      removed.push(original);
    }
    corrupt();
  } catch (cause: unknown) {
    failures.push(cause);
  }
  for (const original of removed) {
    try {
      fixtureDatabase().run(original.sql);
      expect(
        fixtureDatabase()
          .query("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?")
          .get(original.name),
      ).toEqual({ sql: original.sql });
    } catch (cause: unknown) {
      failures.push(cause);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'fixture mutation and trigger restoration failed', {
      cause: failures[0],
    });
}
function removeParent(id: 'alpha' | 'foreign') {
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  const failures: unknown[] = [];
  try {
    fixtureDatabase().run('PRAGMA foreign_keys=OFF');
    fixtureDatabase().run('DELETE FROM project WHERE id=?', [id]);
  } catch (cause: unknown) {
    failures.push(cause);
  }
  try {
    fixtureDatabase().run('PRAGMA foreign_keys=ON');
    expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  } catch (cause: unknown) {
    failures.push(cause);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'fixture mutation and FK restoration failed', {
      cause: failures[0],
    });
  expect(fixtureDatabase().query('SELECT id FROM project WHERE id=?').get(id)).toBeNull();
}

test('constructs without acquiring and lists only the current readable subset before private decoding', async () => {
  const packages = reader();
  expect(acquired).toBe(0);
  expect(await packages.list(caller())).toEqual({ ok: true, value: [] });
  grant();
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting' WHERE id='secret'",
  );
  const listed = await packages.list(caller());
  if (!listed.ok) throw Error('fixture list refused');
  expect(listed.value.map(({ id }) => id)).toEqual(['second', 'open']);
  expect(await packages.read(caller(), 'secret')).toEqual({ ok: true, value: null });
  expect(await packages.read(caller(), 'absent')).toEqual({ ok: true, value: null });
  expect(await packages.read(caller(), 'open')).toMatchObject({
    ok: true,
    value: {
      workPackage: { id: 'open', projectId: 'alpha', timezone: 'UTC' },
      steps: [{ id: 'open-dev' }],
    },
  });
});

test('uses one readable-ID batch and one constant-bind JSON projection across visible cardinalities', async () => {
  const packages = reader();
  grant('package-viewer', 'work_package', 'open');
  for (const expected of [['open'], ['second', 'open']] as const) {
    if (expected.length === 2) grant('package-viewer', 'work_package', 'second');
    statements = [];
    const listed = await packages.list(caller());
    if (!listed.ok) throw Error('fixture list refused');
    expect(listed.value.map(({ id }) => id)).toEqual([...expected]);
    expect(
      statements.filter(({ query }) => query.includes('readers AS MATERIALIZED')),
    ).toHaveLength(1);
    const projections = statements.filter(({ query }) => query.includes('json_each('));
    expect(projections).toHaveLength(1);
    const projection = projections.at(0);
    if (projection === undefined) throw Error('actual SQL projection absent');
    expect(projection.parameters).toHaveLength(3);
    const selectedIds = projection.parameters.at(-1);
    if (typeof selectedIds !== 'string') throw Error('actual JSON bind is not a string');
    const wire: unknown = JSON.parse(selectedIds);
    expect(wire).toEqual(expect.arrayContaining([...expected]));
  }
});

test('rechecks a restricted package through its actual current parent and returns detached steps', async () => {
  grant('project-viewer', 'project', 'alpha');
  const first = await reader().read(caller(), 'secret');
  if (!first.ok || first.value === null) throw Error('fixture parent grant did not reach');
  first.value.workPackage.name = 'Forged';
  const step = first.value.steps.at(0);
  if (step === undefined) throw Error('fixture step missing');
  step.name = 'Forged step';
  expect(await reader().read(caller(), 'secret')).toMatchObject({
    ok: true,
    value: { workPackage: { name: 'SECRET' }, steps: [{ name: 'Dev' }] },
  });
  fixtureDatabase().run("UPDATE work_package SET project_id='beta' WHERE id='secret'");
  expect(await reader().read(caller(), 'secret')).toEqual({ ok: true, value: null });
});

test('does not parse a valid foreign mapped package parent or private settings through own detail', async () => {
  grant();
  removeParent('foreign');
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting' WHERE id='abroad'",
  );
  expect(await reader().read(caller(), 'abroad')).toEqual({ ok: true, value: null });
  expect(await reader().read(caller(), 'missing')).toEqual({ ok: true, value: null });
});

test('keeps a valid foreign mapping under an own parent opaque before target validation', async () => {
  grant();
  withoutTriggers(
    ['work_package_organization_frozen_delete', 'work_package_project_ownership_insert'],
    () => {
      fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='secret'");
      fixtureDatabase().run("INSERT INTO work_package_organization VALUES('secret','org-b')");
    },
  );
  fixtureDatabase().run("UPDATE project SET name='Still owned' WHERE id='alpha'");
  expect(await reader().read(caller(), 'secret')).toEqual({ ok: true, value: null });
  const listed = await reader().list(caller());
  if (!listed.ok) throw Error('fixture list refused');
  expect(listed.value.map(({ id }) => id)).toEqual(['second', 'open']);
});

test('throws for an owned package with missing mapping even without a readable grant', async () => {
  withoutTriggers(['work_package_organization_frozen_delete'], () => {
    fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='open'");
  });
  await expectRejection(reader().read(caller(), 'open'), 'organization mapping');
  await expectRejection(reader().list(caller()), 'organization mapping');
});

test('throws for an owned package with a missing parent after restoring foreign keys', async () => {
  removeParent('alpha');
  await expectRejection(reader().read(caller(), 'open'), 'parent');
  await expectRejection(reader().list(caller()), 'parent');
});

test('throws on visible private settings rather than swallowing corruption as absence', async () => {
  grant();
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting' WHERE id='open'",
  );
  await expectRejection(reader().read(caller(), 'open'), 'estimate');
  await expectRejection(reader().list(caller()), 'estimate');
});

test('retains complete principal and expected access before an awaited snapshot selection', async () => {
  grant();
  const evidence = caller();
  const captured = await withHeldSelection(
    () => reader().read(evidence, 'open'),
    () => {
      evidence.principal.id = 'other';
      evidence.principal.authentication = { kind: 'first_party', issuedAt: 99 };
      if (evidence.expectedAccess.kind !== 'scoped') throw Error('fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { organizationId: 'org-b', userId: 'other' });
      Object.assign(evidence.expectedAccess.principal, { id: 'other' });
    },
  );
  expect(captured).toMatchObject({ ok: true, value: { workPackage: { id: 'open' } } });
  expect(selectedPrincipal).toMatchObject({
    id: 'reader',
    authentication: { kind: 'first_party', issuedAt: 1 },
  });
});

test('keeps authority, parent and private projection on the first-SQL snapshot across a rival commit', async () => {
  grant('project-viewer', 'project', 'alpha');
  const packages = reader();
  const captured = await withHeldSelection(
    () => packages.read(caller(), 'secret'),
    () => {
      fixtureDatabase().run('BEGIN IMMEDIATE');
      try {
        fixtureDatabase().run("DELETE FROM access_grant WHERE subject_id='reader'");
        fixtureDatabase().run(
          "UPDATE work_package SET project_id='beta',name='Changed' WHERE id='secret'",
        );
        fixtureDatabase().run("UPDATE step SET name='Changed step' WHERE id='secret-dev'");
        fixtureDatabase().run('COMMIT');
      } catch (cause: unknown) {
        let rollbackFailure: { cause: unknown } | null = null;
        try {
          fixtureDatabase().run('ROLLBACK');
        } catch (rollbackCause: unknown) {
          rollbackFailure = { cause: rollbackCause };
        }
        if (rollbackFailure !== null)
          throw new AggregateError(
            [cause, rollbackFailure.cause],
            'rival fixture mutation and rollback failed',
            { cause },
          );
        throw cause;
      }
    },
  );
  expect(captured).toMatchObject({
    ok: true,
    value: { workPackage: { name: 'SECRET', projectId: 'alpha' }, steps: [{ name: 'Dev' }] },
  });
  expect(await packages.read(caller(), 'secret')).toEqual({ ok: true, value: null });
});

test('refuses current membership and selection changes through the actual observation resolver', async () => {
  grant();
  fixtureDatabase().run(
    "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
  );
  expect(await reader().read(caller(), 'open')).toEqual({ ok: false, refusal: 'not_a_member' });
  fixtureDatabase().run(
    "UPDATE fixture_package_selection SET organization_id='org-b' WHERE user_id='reader'",
  );
  expect(await reader().list(caller())).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
});

for (const kind of ['machine', 'consent'] as const) {
  test(
    'uses only actual ' + kind + ' grants and refuses its revoked credential binding',
    async () => {
      grant('org-super-admin');
      fixtureDatabase().run(
        "INSERT INTO person(id,name,kind,account_id) VALUES('agent','Agent','agent','reader')",
      );
      fixtureDatabase().run(
        "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('agent','org-a','Agent')",
      );
      const credentialId = '00000000-0000-4000-8000-000000000001';
      fixtureDatabase().run(
        "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id) VALUES(?,'org-a','agent','reader',?,'Agent',1,'reader',?)",
        [
          credentialId,
          kind === 'machine' ? 'api_key' : 'mcp_consent',
          kind === 'machine' ? null : 'family',
        ],
      );
      grant('package-viewer', 'work_package', 'secret', 'machine_credential', credentialId);
      const evidence = caller();
      evidence.principal.authentication =
        kind === 'machine'
          ? { kind: 'machine', credentialId, personId: 'agent' }
          : {
              kind: 'consent',
              credentialId,
              personId: 'agent',
              issuer: 'https://issuer.test',
              subject: 'reader',
            };
      evidence.principal.delegation = {
        organizationId: 'org-a',
        audience: 'wbs-be-01/via-mcp-01',
        client: 'client',
        grant: 'family',
      };
      if (evidence.expectedAccess.kind !== 'scoped') throw Error('fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { cap: CONTRIBUTOR_CAP, delegated: true });
      expect(await reader().read(evidence, 'secret')).toMatchObject({
        ok: true,
        value: { workPackage: { id: 'secret' } },
      });
      expect(await reader().read(evidence, 'open')).toEqual({ ok: true, value: null });
      const listed = await reader().list(evidence);
      if (!listed.ok) throw Error('fixture credential list refused');
      expect(listed.value.map(({ id }) => id)).toEqual(['secret']);
      fixtureDatabase().run('UPDATE machine_credential SET revoked_at=2 WHERE id=?', [
        credentialId,
      ]);
      expect(await reader().read(evidence, 'secret')).toEqual({
        ok: false,
        refusal: 'organization_context_changed',
      });
    },
  );
}

test('preserves actual nonlegacy preactivation reads and refuses retained legacy evidence after activation', async () => {
  await disposeFixture();
  await openFixture(false);
  const packages = reader(),
    evidence: CommandCaller = {
      kind: 'human',
      principal: caller().principal,
      expectedAccess: { kind: 'legacy' },
    };
  expect(await packages.read(evidence, 'abroad')).toMatchObject({
    ok: true,
    value: { workPackage: { id: 'abroad', projectId: 'foreign' } },
  });
  expect(await packages.read({ kind: 'legacy', actorId: 'reader' }, 'secret')).toMatchObject({
    ok: true,
    value: { workPackage: { id: 'secret' } },
  });
  const listed = await packages.list(evidence);
  if (!listed.ok) throw Error('fixture legacy list refused');
  expect(listed.value.map(({ id }) => id)).toEqual(['abroad', 'second', 'secret', 'open']);
  fixtureDatabase().run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  expect(await packages.list(evidence)).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
  expect(await packages.read({ kind: 'legacy', actorId: 'reader' }, 'secret')).toEqual({
    ok: false,
    refusal: 'no_active_organization',
  });
});

/** Seeds the retained deployment-wide representation without fabricating caller authority. */
function seedLegacySolution(id: string, slug: string) {
  const url = 'https://solutions.example/' + slug;
  fixtureDatabase().run('UPDATE work_package SET solution_slug=?,solution_url=? WHERE id=?', [
    slug,
    url,
    id,
  ]);
  expect(
    fixtureDatabase()
      .query('SELECT id,solution_slug,solution_url FROM work_package WHERE id=?')
      .get(id),
  ).toEqual({ id, solution_slug: slug, solution_url: url });
}

/** Seeds one actual organization-local link; its composite FK retains the real package owner. */
function seedScopedSolution(id: string, organizationId: string, slug: string) {
  const url = 'https://solutions.example/' + slug;
  fixtureDatabase().run(
    'INSERT INTO work_package_solution(work_package_id,organization_id,slug,url) VALUES(?,?,?,?)',
    [id, organizationId, slug, url],
  );
  expect(
    fixtureDatabase()
      .query(
        'SELECT work_package_id,organization_id,slug,url FROM work_package_solution WHERE work_package_id=?',
      )
      .get(id),
  ).toEqual({ work_package_id: id, organization_id: organizationId, slug, url });
}

/** Adds a second valid foreign owner so same-slug crowding respects the actual unique index. */
async function createForeignSolutionPackage() {
  fixtureDatabase().run("INSERT INTO organization(id,name,created_at) VALUES('org-c','C',1)");
  fixtureDatabase().run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-c','creator','member',1)",
  );
  fixtureDatabase().run(
    "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('foreign-second','org-c','Foreign second',1,'creator')",
  );
  const created = await fixtureSource().stores.workPackages.createInOrganization(
    workPackageRow({
      id: 'abroad-second',
      projectId: 'foreign-second',
      name: 'ABROAD SECOND',
      createdAt: 5,
    }),
    [
      {
        id: 'abroad-second-dev',
        workPackageId: 'abroad-second',
        name: 'Dev',
        code: 'DEV',
        position: 10,
        allowancePercent: 0,
        estimateUnit: 'workdays',
      },
    ],
    { by: 'creator', at: 5 },
    'org-c',
    { id: 'abroad-second-grant', auditId: 'abroad-second-audit' },
  );
  if (typeof created === 'string') throw Error('second foreign fixture birth refused ' + created);
  expect(
    fixtureDatabase()
      .query(
        'SELECT resource_id,organization_id FROM work_package_organization WHERE resource_id=?',
      )
      .get('abroad-second'),
  ).toEqual({ resource_id: 'abroad-second', organization_id: 'org-c' });
}

/** Restores FK enforcement before any production observation, retaining mutation and restore failures. */
function withSolutionForeignKeysOff(corrupt: () => void) {
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  const failures: unknown[] = [];
  try {
    fixtureDatabase().run('PRAGMA foreign_keys=OFF');
    expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 0 });
    corrupt();
  } catch (cause: unknown) {
    failures.push(cause);
  }
  try {
    fixtureDatabase().run('PRAGMA foreign_keys=ON');
    expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  } catch (cause: unknown) {
    failures.push(cause);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'solution fixture mutation and FK restoration failed', {
      cause: failures[0],
    });
}

test('reads scoped solution-table and retained legacy slugs with the non-zoned detached projection', async () => {
  grant();
  seedLegacySolution('open', 'retained-solution');
  seedScopedSolution('second', 'org-a', 'scoped-solution');
  fixtureDatabase().run("UPDATE work_package SET timezone='invalid/private-zone' WHERE id='open'");
  const packages = reader();
  const legacy = await packages.readSolution(caller(), 'retained-solution');
  if (!legacy.ok || legacy.value === null) throw Error('retained scoped solution was not readable');
  expect(legacy.value).toMatchObject({
    workPackage: { id: 'open', projectId: 'alpha' },
    steps: [{ id: 'open-dev', name: 'Dev' }],
  });
  expect('timezone' in legacy.value.workPackage).toBe(false);
  legacy.value.workPackage.name = 'Forged solution';
  const step = legacy.value.steps.at(0);
  if (step === undefined) throw Error('retained solution step is absent');
  step.name = 'Forged solution step';
  expect(await packages.readSolution(caller(), 'retained-solution')).toMatchObject({
    ok: true,
    value: { workPackage: { id: 'open', name: 'OPEN' }, steps: [{ name: 'Dev' }] },
  });
  expect(await packages.readSolution(caller(), 'scoped-solution')).toMatchObject({
    ok: true,
    value: { workPackage: { id: 'second', projectId: 'beta' }, steps: [{ id: 'second-dev' }] },
  });
  expect(await packages.readSolution(caller(), 'missing-solution')).toEqual({
    ok: true,
    value: null,
  });
});

test('keeps preactivation solution lookup legacy-column-only and rechecks the actual activation marker', async () => {
  await disposeFixture();
  await openFixture(false);
  seedLegacySolution('abroad', 'preactivation-retained');
  seedScopedSolution('secret', 'org-a', 'preactivation-table-only');
  const evidence: CommandCaller = {
    kind: 'human',
    principal: caller().principal,
    expectedAccess: { kind: 'legacy' },
  };
  const packages = reader();
  expect(await packages.readSolution(evidence, 'preactivation-retained')).toMatchObject({
    ok: true,
    value: { workPackage: { id: 'abroad', projectId: 'foreign' } },
  });
  expect(
    await packages.readSolution({ kind: 'legacy', actorId: 'reader' }, 'preactivation-retained'),
  ).toMatchObject({ ok: true, value: { workPackage: { id: 'abroad' } } });
  expect(await packages.readSolution(evidence, 'preactivation-table-only')).toEqual({
    ok: true,
    value: null,
  });
  fixtureDatabase().run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  expect(await packages.readSolution(evidence, 'preactivation-retained')).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
  expect(
    await packages.readSolution({ kind: 'legacy', actorId: 'reader' }, 'preactivation-retained'),
  ).toEqual({ ok: false, refusal: 'no_active_organization' });
});

test('rejects an owned solution duplicate across both representations before hiding one unreadable match', async () => {
  grant();
  seedScopedSolution('open', 'org-a', 'owned-duplicate');
  expect(await reader().readSolution(caller(), 'owned-duplicate')).toMatchObject({
    ok: true,
    value: { workPackage: { id: 'open' } },
  });
  expect(await reader().read(caller(), 'secret')).toEqual({ ok: true, value: null });
  seedLegacySolution('secret', 'owned-duplicate');
  await expectRejection(reader().readSolution(caller(), 'owned-duplicate'), 'two work packages');
});

test('excludes two valid foreign same-slug candidates before the scoped limit and still detects two owned matches', async () => {
  grant();
  await createForeignSolutionPackage();
  seedScopedSolution('abroad', 'org-b', 'crowded-solution');
  seedScopedSolution('abroad-second', 'org-c', 'crowded-solution');
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting' WHERE id IN ('abroad','abroad-second')",
  );
  expect(
    fixtureDatabase()
      .query(
        "SELECT count(*) AS matches FROM work_package_solution WHERE slug='crowded-solution' AND organization_id IN ('org-b','org-c')",
      )
      .get(),
  ).toEqual({ matches: 2 });
  expect(await reader().readSolution(caller(), 'crowded-solution')).toEqual({
    ok: true,
    value: null,
  });
  seedScopedSolution('open', 'org-a', 'crowded-solution');
  expect(await reader().readSolution(caller(), 'crowded-solution')).toMatchObject({
    ok: true,
    value: { workPackage: { id: 'open', projectId: 'alpha' } },
  });
  seedLegacySolution('secret', 'crowded-solution');
  expect(await reader().read(caller(), 'secret')).toEqual({ ok: true, value: null });
  await expectRejection(reader().readSolution(caller(), 'crowded-solution'), 'two work packages');
});

test('keeps a valid foreign solution mapping under an own parent opaque before malformed private projection', async () => {
  grant();
  seedLegacySolution('secret', 'foreign-owned-parent');
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting' WHERE id='secret'",
  );
  withoutTriggers(['work_package_organization_frozen_update'], () => {
    fixtureDatabase().run(
      "UPDATE work_package_organization SET organization_id='org-b' WHERE resource_id='secret'",
    );
  });
  expect(
    fixtureDatabase()
      .query(
        "SELECT w.project_id,p.organization_id AS parent_organization_id,m.organization_id AS mapped_organization_id FROM work_package w JOIN project p ON p.id=w.project_id JOIN work_package_organization m ON m.resource_id=w.id WHERE w.id='secret'",
      )
      .get(),
  ).toEqual({
    project_id: 'alpha',
    parent_organization_id: 'org-a',
    mapped_organization_id: 'org-b',
  });
  expect(await reader().readSolution(caller(), 'foreign-owned-parent')).toEqual({
    ok: true,
    value: null,
  });
});

test('retains an owned-parent solution with an absent mapping for strict validation even without grants', async () => {
  seedLegacySolution('open', 'missing-map-solution');
  withoutTriggers(['work_package_organization_frozen_delete'], () => {
    fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='open'");
  });
  expect(
    fixtureDatabase()
      .query("SELECT resource_id FROM work_package_organization WHERE resource_id='open'")
      .get(),
  ).toBeNull();
  expect(
    fixtureDatabase()
      .query(
        "SELECT w.project_id,p.organization_id FROM work_package w JOIN project p ON p.id=w.project_id WHERE w.id='open'",
      )
      .get(),
  ).toEqual({ project_id: 'alpha', organization_id: 'org-a' });
  await expectRejection(
    reader().readSolution(caller(), 'missing-map-solution'),
    'organization mapping',
  );
});

for (const malformed of [
  { name: 'empty', expression: "''", storage: 'text', encoded: '' },
  { name: 'BLOB', expression: "X'6f72672d61'", storage: 'blob', encoded: '6F72672D61' },
] as const) {
  test(
    'retains an owned-parent solution with an ' +
      malformed.name +
      ' mapping after restoring constraints',
    async () => {
      seedLegacySolution('open', 'malformed-map-solution');
      withSolutionForeignKeysOff(() => {
        withoutTriggers(['work_package_organization_frozen_update'], () => {
          fixtureDatabase().run(
            'UPDATE work_package_organization SET organization_id=' +
              malformed.expression +
              " WHERE resource_id='open'",
          );
        });
      });
      expect(
        fixtureDatabase()
          .query(
            "SELECT typeof(organization_id) AS storage,hex(organization_id) AS encoded FROM work_package_organization WHERE resource_id='open'",
          )
          .get(),
      ).toEqual({ storage: malformed.storage, encoded: malformed.encoded });
      expect(
        fixtureDatabase()
          .query(
            "SELECT w.project_id,p.organization_id FROM work_package w JOIN project p ON p.id=w.project_id WHERE w.id='open'",
          )
          .get(),
      ).toEqual({ project_id: 'alpha', organization_id: 'org-a' });
      await expectRejection(
        reader().readSolution(caller(), 'malformed-map-solution'),
        'organization mapping',
      );
    },
  );
}

test('retains an owned-mapped solution with an absent parent after restoring foreign keys', async () => {
  seedLegacySolution('open', 'missing-parent-solution');
  removeParent('alpha');
  expect(
    fixtureDatabase()
      .query(
        "SELECT w.project_id,m.organization_id FROM work_package w JOIN work_package_organization m ON m.resource_id=w.id WHERE w.id='open'",
      )
      .get(),
  ).toEqual({ project_id: 'alpha', organization_id: 'org-a' });
  await expectRejection(reader().readSolution(caller(), 'missing-parent-solution'), 'parent');
});

test('retains an owned-mapped solution with a malformed parent identity after restoring foreign keys', async () => {
  seedLegacySolution('open', 'malformed-parent-solution');
  withSolutionForeignKeysOff(() => {
    fixtureDatabase().run("UPDATE work_package SET project_id=X'616c706861' WHERE id='open'");
  });
  expect(
    fixtureDatabase()
      .query(
        "SELECT typeof(w.project_id) AS storage,hex(w.project_id) AS encoded,m.organization_id FROM work_package w JOIN work_package_organization m ON m.resource_id=w.id WHERE w.id='open'",
      )
      .get(),
  ).toEqual({ storage: 'blob', encoded: '616C706861', organization_id: 'org-a' });
  await expectRejection(reader().readSolution(caller(), 'malformed-parent-solution'), 'parent');
});

test('authorizes the solution target before private decoding and throws once that same target becomes readable', async () => {
  grant();
  seedScopedSolution('secret', 'org-a', 'hidden-private-solution');
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting' WHERE id='secret'",
  );
  expect(await reader().readSolution(caller(), 'hidden-private-solution')).toEqual({
    ok: true,
    value: null,
  });
  grant('project-viewer', 'project', 'alpha');
  await expectRejection(reader().readSolution(caller(), 'hidden-private-solution'), 'estimate');
});

for (const kind of ['machine', 'consent'] as const) {
  test(
    'uses only actual ' + kind + ' solution grants and rechecks credential revocation',
    async () => {
      grant('org-super-admin');
      seedScopedSolution('secret', 'org-a', 'credential-granted-solution');
      seedScopedSolution('open', 'org-a', 'credential-other-solution');
      fixtureDatabase().run(
        "INSERT INTO person(id,name,kind,account_id) VALUES('solution-agent','Solution agent','agent','reader')",
      );
      fixtureDatabase().run(
        "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('solution-agent','org-a','Solution agent')",
      );
      const credentialId = '00000000-0000-4000-8000-000000000002';
      fixtureDatabase().run(
        "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id) VALUES(?,'org-a','solution-agent','reader',?,'Solution agent',1,'reader',?)",
        [
          credentialId,
          kind === 'machine' ? 'api_key' : 'mcp_consent',
          kind === 'machine' ? null : 'solution-family',
        ],
      );
      grant('package-viewer', 'work_package', 'secret', 'machine_credential', credentialId);
      const evidence = caller();
      evidence.principal.authentication =
        kind === 'machine'
          ? { kind: 'machine', credentialId, personId: 'solution-agent' }
          : {
              kind: 'consent',
              credentialId,
              personId: 'solution-agent',
              issuer: 'https://issuer.test',
              subject: 'reader',
            };
      evidence.principal.delegation = {
        organizationId: 'org-a',
        audience: 'wbs-be-01/via-mcp-01',
        client: 'client',
        grant: 'solution-family',
      };
      if (evidence.expectedAccess.kind !== 'scoped') throw Error('fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { cap: CONTRIBUTOR_CAP, delegated: true });
      expect(await reader().readSolution(evidence, 'credential-granted-solution')).toMatchObject({
        ok: true,
        value: { workPackage: { id: 'secret' } },
      });
      expect(await reader().readSolution(evidence, 'credential-other-solution')).toEqual({
        ok: true,
        value: null,
      });
      fixtureDatabase().run('UPDATE machine_credential SET revoked_at=2 WHERE id=?', [
        credentialId,
      ]);
      expect(await reader().readSolution(evidence, 'credential-granted-solution')).toEqual({
        ok: false,
        refusal: 'organization_context_changed',
      });
    },
  );
}

test('retains the complete solution caller before awaited current selection', async () => {
  grant();
  seedScopedSolution('open', 'org-a', 'retained-caller-solution');
  const evidence = caller();
  const captured = await withHeldSelection(
    () => reader().readSolution(evidence, 'retained-caller-solution'),
    () => {
      evidence.principal.id = 'other';
      evidence.principal.authentication = { kind: 'first_party', issuedAt: 99 };
      if (evidence.expectedAccess.kind !== 'scoped') throw Error('fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { organizationId: 'org-b', userId: 'other' });
      Object.assign(evidence.expectedAccess.principal, { id: 'other' });
    },
  );
  expect(captured).toMatchObject({ ok: true, value: { workPackage: { id: 'open' } } });
  expect(selectedPrincipal).toMatchObject({
    id: 'reader',
    authentication: { kind: 'first_party', issuedAt: 1 },
  });
});

test('keeps solution slug, current parent, grant and private steps on the same held snapshot', async () => {
  grant('project-viewer', 'project', 'alpha');
  seedScopedSolution('secret', 'org-a', 'held-solution');
  const packages = reader();
  const captured = await withHeldSelection(
    () => packages.readSolution(caller(), 'held-solution'),
    () => {
      fixtureDatabase().run('BEGIN IMMEDIATE');
      try {
        fixtureDatabase().run("DELETE FROM access_grant WHERE subject_id='reader'");
        fixtureDatabase().run(
          "UPDATE work_package SET project_id='beta',name='Changed old package' WHERE id='secret'",
        );
        fixtureDatabase().run("UPDATE step SET name='Changed old step' WHERE id='secret-dev'");
        fixtureDatabase().run(
          "UPDATE work_package_solution SET work_package_id='second' WHERE work_package_id='secret'",
        );
        grant('project-viewer', 'project', 'beta');
        fixtureDatabase().run('COMMIT');
      } catch (cause: unknown) {
        let rollbackFailure: { cause: unknown } | null = null;
        try {
          fixtureDatabase().run('ROLLBACK');
        } catch (rollbackCause: unknown) {
          rollbackFailure = { cause: rollbackCause };
        }
        if (rollbackFailure !== null)
          throw new AggregateError(
            [cause, rollbackFailure.cause],
            'solution rival mutation and rollback failed',
            { cause },
          );
        throw cause;
      }
    },
  );
  expect(captured).toMatchObject({
    ok: true,
    value: {
      workPackage: { id: 'secret', name: 'SECRET', projectId: 'alpha' },
      steps: [{ id: 'secret-dev', name: 'Dev' }],
    },
  });
  expect(
    fixtureDatabase()
      .query("SELECT work_package_id FROM work_package_solution WHERE slug='held-solution'")
      .get(),
  ).toEqual({ work_package_id: 'second' });
  expect(await packages.readSolution(caller(), 'held-solution')).toMatchObject({
    ok: true,
    value: {
      workPackage: { id: 'second', name: 'SECOND', projectId: 'beta' },
      steps: [{ id: 'second-dev', name: 'Dev' }],
    },
  });
});

test('rechecks actual solution membership and current organization selection', async () => {
  grant();
  seedScopedSolution('open', 'org-a', 'current-selection-solution');
  const packages = reader();
  expect(await packages.readSolution(caller(), 'current-selection-solution')).toMatchObject({
    ok: true,
    value: { workPackage: { id: 'open' } },
  });
  fixtureDatabase().run(
    "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
  );
  expect(await packages.readSolution(caller(), 'current-selection-solution')).toEqual({
    ok: false,
    refusal: 'not_a_member',
  });
  fixtureDatabase().run(
    "UPDATE fixture_package_selection SET organization_id='org-b' WHERE user_id='reader'",
  );
  expect(await packages.readSolution(caller(), 'current-selection-solution')).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
});

/** Real persisted event rows for the observation read; mounted controls separately own command recording. */
function writeHistoryEvent(
  id: string,
  workPackageId: string,
  createdAt: number,
  fields: {
    kind?: string;
    workItemId?: string | null;
    stepId?: string | null;
    before?: unknown;
    after?: unknown;
  } = {},
) {
  const workItemId: string | null = fields.workItemId === undefined ? 'focus' : fields.workItemId;
  const stepId: string | null = fields.stepId === undefined ? null : fields.stepId;
  const before: unknown = fields.before === undefined ? { do: 'clear_estimate' } : fields.before;
  const after: unknown = fields.after === undefined ? { do: 'set_estimate', id } : fields.after;
  const event = {
    id,
    workPackageId,
    userId: 'creator',
    kind: fields.kind ?? 'estimate',
    label: 'history ' + id,
    workItemId,
    stepId,
    before,
    after,
    createdAt,
  };
  fixtureDatabase().run(
    'INSERT INTO plan_event(id,work_package_id,user_id,kind,label,work_item_id,step_id,"before","after",created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [
      event.id,
      event.workPackageId,
      event.userId,
      event.kind,
      event.label,
      event.workItemId,
      event.stepId,
      JSON.stringify(event.before),
      JSON.stringify(event.after),
      event.createdAt,
    ],
  );
  expect(
    fixtureDatabase()
      .query('SELECT id,work_package_id,user_id,kind,created_at FROM plan_event WHERE id=?')
      .get(id),
  ).toEqual({
    id,
    work_package_id: workPackageId,
    user_id: 'creator',
    kind: event.kind,
    created_at: createdAt,
  });
  return event;
}

test('reads actual addressed history in deterministic order with filters and opaque historical JSON', async () => {
  grant('project-viewer', 'project', 'alpha');
  const older = writeHistoryEvent('history-a', 'secret', 10);
  const tied = writeHistoryEvent('history-b', 'secret', 10, {
    before: ['old-release', null],
    after: { historical: { revision: 'not-current-command', tuple: [1, null, false] } },
  });
  const newest = writeHistoryEvent('history-c', 'secret', 20, {
    kind: 'rename',
    workItemId: 'other',
  });
  writeHistoryEvent('foreign-history', 'abroad', 99);
  const packages = reader();
  const observed = await packages.readHistory(caller(), 'secret', {});
  expect(observed).toEqual({ ok: true, value: [newest, tied, older] });
  if (!observed.ok || observed.value === null) throw Error('Readable persisted history was absent');
  const first = observed.value.at(0);
  if (first === undefined) throw Error('Readable persisted history was empty');
  first.label = 'forged history label';
  first.after = { forged: true };
  expect(await packages.readHistory(caller(), 'secret', {})).toEqual({
    ok: true,
    value: [newest, tied, older],
  });
  expect(
    await packages.readHistory(caller(), 'secret', { workItemId: 'focus', kinds: ['estimate'] }),
  ).toEqual({ ok: true, value: [tied, older] });
  expect(await packages.readHistory(caller(), 'secret', { kinds: [] })).toEqual({
    ok: true,
    value: [newest, tied, older],
  });
  expect(
    await packages.readHistory(caller(), 'secret', { kinds: ['unknown-future-kind'] }),
  ).toEqual({ ok: true, value: [] });
  const batch = writeHistoryEvent('history-d', 'secret', 30, {
    kind: 'batch',
    after: { do: 'batch', steps: [{ do: 'set_estimate' }] },
  });
  expect(
    await packages.readHistory(caller(), 'secret', {
      kinds: ['estimate'],
      batchesHolding: ['set_estimate'],
      limit: 2,
    }),
  ).toEqual({ ok: true, value: [batch, tied] });
});

test('distinguishes readable empty history from absent foreign and unreadable addressed packages', async () => {
  grant();
  const packages = reader();
  expect(await packages.readHistory(caller(), 'open', {})).toEqual({ ok: true, value: [] });
  for (const id of ['missing', 'abroad', 'secret'])
    expect(await packages.readHistory(caller(), id, {})).toEqual({ ok: true, value: null });
});

test('retains the complete history caller and mutable filter arrays before awaited current selection', async () => {
  grant('project-viewer', 'project', 'alpha');
  writeHistoryEvent('retained-estimate', 'secret', 10);
  const batch = writeHistoryEvent('retained-batch', 'secret', 20, {
    kind: 'batch',
    after: { do: 'batch', steps: [{ do: 'set_estimate' }] },
  });
  const evidence = caller();
  const filter = {
    workItemId: 'focus',
    kinds: ['estimate'],
    batchesHolding: ['set_estimate'],
    limit: 1,
  };
  const captured = await withHeldSelection(
    () => reader().readHistory(evidence, 'secret', filter),
    () => {
      evidence.principal.id = 'other';
      evidence.principal.authentication = { kind: 'first_party', issuedAt: 99 };
      if (evidence.expectedAccess.kind !== 'scoped')
        throw Error('History fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { organizationId: 'org-b', userId: 'other' });
      Object.assign(evidence.expectedAccess.principal, { id: 'other' });
      filter.workItemId = 'changed';
      filter.kinds.splice(0, filter.kinds.length, 'rename');
      filter.batchesHolding.splice(0, filter.batchesHolding.length, 'delete_work_item');
      filter.limit = 2;
    },
  );
  expect(captured).toEqual({ ok: true, value: [batch] });
  expect(selectedPrincipal).toMatchObject({
    id: 'reader',
    authentication: { kind: 'first_party', issuedAt: 1 },
  });
});

test('keeps legacy history existence and filtering explicit and refuses it after actual activation', async () => {
  await disposeFixture();
  await openFixture(false);
  const event = writeHistoryEvent('legacy-event', 'abroad', 10);
  const evidence: CommandCaller = {
    kind: 'human',
    principal: caller().principal,
    expectedAccess: { kind: 'legacy' },
  };
  const packages = reader();
  expect(await packages.readHistory(evidence, 'abroad', {})).toEqual({ ok: true, value: [event] });
  expect(
    await packages.readHistory({ kind: 'legacy', actorId: 'reader' }, 'abroad', {
      kinds: ['unknown'],
    }),
  ).toEqual({ ok: true, value: [] });
  expect(await packages.readHistory(evidence, 'missing', {})).toEqual({ ok: true, value: null });
  fixtureDatabase().run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  expect(await packages.readHistory(evidence, 'abroad', {})).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
  expect(await packages.readHistory({ kind: 'legacy', actorId: 'reader' }, 'abroad', {})).toEqual({
    ok: false,
    refusal: 'no_active_organization',
  });
});

test('rejects an owned history target with missing mapping before hiding it for lack of grants', async () => {
  withoutTriggers(['work_package_organization_frozen_delete'], () => {
    fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='secret'");
  });
  expect(
    fixtureDatabase().query("SELECT project_id FROM work_package WHERE id='secret'").get(),
  ).toEqual({ project_id: 'alpha' });
  expect(
    fixtureDatabase()
      .query("SELECT resource_id FROM work_package_organization WHERE resource_id='secret'")
      .get(),
  ).toBeNull();
  await expectRejection(reader().readHistory(caller(), 'secret', {}), 'organization mapping');
});

for (const malformed of [
  { name: 'empty', expression: "''", storage: 'text', encoded: '' },
  { name: 'BLOB', expression: "X'6f72672d61'", storage: 'blob', encoded: '6F72672D61' },
] as const) {
  test(
    'rejects an owned history target with ' +
      malformed.name +
      ' mapping after restoring enforcement',
    async () => {
      withSolutionForeignKeysOff(() => {
        withoutTriggers(['work_package_organization_frozen_update'], () => {
          fixtureDatabase().run(
            'UPDATE work_package_organization SET organization_id=' +
              malformed.expression +
              " WHERE resource_id='secret'",
          );
        });
      });
      expect(
        fixtureDatabase()
          .query(
            "SELECT typeof(organization_id) AS storage,hex(organization_id) AS encoded FROM work_package_organization WHERE resource_id='secret'",
          )
          .get(),
      ).toEqual({ storage: malformed.storage, encoded: malformed.encoded });
      expect(
        fixtureDatabase()
          .query(
            "SELECT w.project_id,p.organization_id FROM work_package w JOIN project p ON p.id=w.project_id WHERE w.id='secret'",
          )
          .get(),
      ).toEqual({ project_id: 'alpha', organization_id: 'org-a' });
      await expectRejection(reader().readHistory(caller(), 'secret', {}), 'organization mapping');
    },
  );
}

test('rejects owned history with a missing parent after restoring foreign key enforcement', async () => {
  removeParent('alpha');
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  await expectRejection(reader().readHistory(caller(), 'secret', {}), 'parent');
});

test('rejects owned history with a malformed parent identity before event decoding', async () => {
  withSolutionForeignKeysOff(() => {
    fixtureDatabase().run("UPDATE work_package SET project_id=X'616c706861' WHERE id='secret'");
  });
  expect(
    fixtureDatabase()
      .query(
        "SELECT typeof(project_id) AS storage,hex(project_id) AS encoded FROM work_package WHERE id='secret'",
      )
      .get(),
  ).toEqual({ storage: 'blob', encoded: '616C706861' });
  await expectRejection(reader().readHistory(caller(), 'secret', {}), 'parent');
});

test('keeps valid foreign history mapping opaque before own-parent and malformed event decoding', async () => {
  grant('project-viewer', 'project', 'alpha');
  const event = writeHistoryEvent('foreign-map-event', 'secret', 10);
  fixtureDatabase().run('UPDATE plan_event SET "after"=? WHERE id=?', ['{', event.id]);
  withoutTriggers(
    ['work_package_organization_frozen_delete', 'work_package_project_ownership_insert'],
    () => {
      fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='secret'");
      fixtureDatabase().run(
        "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('secret','org-b')",
      );
    },
  );
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(fixtureDatabase().query('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(
    fixtureDatabase()
      .query(
        "SELECT w.project_id,p.organization_id AS parent_organization,m.organization_id AS mapped_organization FROM work_package w JOIN project p ON p.id=w.project_id JOIN work_package_organization m ON m.resource_id=w.id WHERE w.id='secret'",
      )
      .get(),
  ).toEqual({ project_id: 'alpha', parent_organization: 'org-a', mapped_organization: 'org-b' });
  expect(await reader().readHistory(caller(), 'secret', {})).toEqual({ ok: true, value: null });
});

test('conceals malformed unreadable event JSON then throws when granted without projecting package settings', async () => {
  const event = writeHistoryEvent('private-json-event', 'secret', 10);
  fixtureDatabase().run('UPDATE plan_event SET "before"=? WHERE id=?', ['{', event.id]);
  expect(await reader().readHistory(caller(), 'secret', {})).toEqual({ ok: true, value: null });
  grant('project-viewer', 'project', 'alpha');
  await expectRejection(reader().readHistory(caller(), 'secret', {}), 'JSON');
  fixtureDatabase().run('UPDATE plan_event SET "before"=? WHERE id=?', [
    JSON.stringify(event.before),
    event.id,
  ]);
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting',timezone='invalid/private-zone' WHERE id='secret'",
  );
  expect(await reader().readHistory(caller(), 'secret', {})).toEqual({ ok: true, value: [event] });
});

for (const kind of ['machine', 'consent'] as const) {
  test(
    'uses only actual ' + kind + ' history grants and rechecks credential revocation',
    async () => {
      grant('org-super-admin');
      const granted = writeHistoryEvent('credential-history-a', 'secret', 10);
      const other = writeHistoryEvent('credential-history-b', 'open', 20);
      expect(await reader().readHistory(caller(), 'open', {})).toEqual({
        ok: true,
        value: [other],
      });
      fixtureDatabase().run(
        "INSERT INTO person(id,name,kind,account_id) VALUES('history-agent','History agent','agent','reader')",
      );
      fixtureDatabase().run(
        "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('history-agent','org-a','History agent')",
      );
      const credentialId = '00000000-0000-4000-8000-000000000003';
      fixtureDatabase().run(
        "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id) VALUES(?,'org-a','history-agent','reader',?,'History agent',1,'reader',?)",
        [
          credentialId,
          kind === 'machine' ? 'api_key' : 'mcp_consent',
          kind === 'machine' ? null : 'history-family',
        ],
      );
      grant('package-viewer', 'work_package', 'secret', 'machine_credential', credentialId);
      const evidence = caller();
      evidence.principal.authentication =
        kind === 'machine'
          ? { kind: 'machine', credentialId, personId: 'history-agent' }
          : {
              kind: 'consent',
              credentialId,
              personId: 'history-agent',
              issuer: 'https://issuer.test',
              subject: 'reader',
            };
      evidence.principal.delegation = {
        organizationId: 'org-a',
        audience: 'wbs-be-01/via-mcp-01',
        client: 'client',
        grant: 'history-family',
      };
      if (evidence.expectedAccess.kind !== 'scoped')
        throw Error('History fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { cap: CONTRIBUTOR_CAP, delegated: true });
      expect(await reader().readHistory(evidence, 'secret', {})).toEqual({
        ok: true,
        value: [granted],
      });
      expect(await reader().readHistory(evidence, 'open', {})).toEqual({ ok: true, value: null });
      fixtureDatabase().run('UPDATE machine_credential SET revoked_at=2 WHERE id=?', [
        credentialId,
      ]);
      expect(await reader().readHistory(evidence, 'secret', {})).toEqual({
        ok: false,
        refusal: 'organization_context_changed',
      });
    },
  );
}

test('rechecks actual history membership and current organization selection', async () => {
  grant();
  const event = writeHistoryEvent('current-history', 'open', 10);
  const packages = reader();
  expect(await packages.readHistory(caller(), 'open', {})).toEqual({ ok: true, value: [event] });
  fixtureDatabase().run(
    "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
  );
  expect(await packages.readHistory(caller(), 'open', {})).toEqual({
    ok: false,
    refusal: 'not_a_member',
  });
  fixtureDatabase().run(
    "UPDATE fixture_package_selection SET organization_id='org-b' WHERE user_id='reader'",
  );
  expect(await packages.readHistory(caller(), 'open', {})).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
});

test('keeps history parent grant and event bytes on one held snapshot across a rival commit', async () => {
  grant('project-viewer', 'project', 'alpha');
  const event = writeHistoryEvent('held-history', 'secret', 10, { after: { epoch: 'old' } });
  const packages = reader();
  const captured = await withHeldSelection(
    () => packages.readHistory(caller(), 'secret', {}),
    () => {
      fixtureDatabase().run('BEGIN IMMEDIATE');
      try {
        fixtureDatabase().run(
          "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id='reader'",
        );
        fixtureDatabase().run("UPDATE work_package SET project_id='beta' WHERE id='secret'");
        fixtureDatabase().run('UPDATE plan_event SET label=?,"after"=? WHERE id=?', [
          'New history epoch',
          JSON.stringify({ epoch: 'new' }),
          event.id,
        ]);
        fixtureDatabase().run('COMMIT');
      } catch (cause: unknown) {
        let rollbackFailure: { cause: unknown } | undefined;
        try {
          fixtureDatabase().run('ROLLBACK');
        } catch (rollbackCause: unknown) {
          rollbackFailure = { cause: rollbackCause };
        }
        if (rollbackFailure !== undefined)
          throw new AggregateError(
            [cause, rollbackFailure.cause],
            'history rival mutation and rollback failed',
            { cause },
          );
        throw cause;
      }
    },
  );
  expect(captured).toEqual({ ok: true, value: [event] });
  expect(
    fixtureDatabase().query("SELECT project_id FROM work_package WHERE id='secret'").get(),
  ).toEqual({ project_id: 'beta' });
  expect(await packages.readHistory(caller(), 'secret', {})).toEqual({ ok: true, value: null });
  grant('project-viewer', 'project', 'beta');
  expect(await packages.readHistory(caller(), 'secret', {})).toEqual({
    ok: true,
    value: [{ ...event, label: 'New history epoch', after: { epoch: 'new' } }],
  });
});

test('checks current addressed readability without projecting private package fields', async () => {
  grant();
  const packages = reader();
  expect(await packages.checkRead(caller(), 'open')).toEqual({ ok: true, value: true });
  expect(await packages.checkRead(caller(), 'missing')).toEqual({ ok: true, value: false });
  expect(await packages.checkRead(caller(), 'abroad')).toEqual({ ok: true, value: false });
  expect(await packages.checkRead(caller(), 'secret')).toEqual({ ok: true, value: false });
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting',timezone='invalid/private-zone' WHERE id='secret'",
  );
  expect(await packages.checkRead(caller(), 'secret')).toEqual({ ok: true, value: false });
  grant('project-viewer', 'project', 'alpha');
  expect(await packages.checkRead(caller(), 'secret')).toEqual({ ok: true, value: true });
  await expectRejection(packages.read(caller(), 'secret'), 'estimate');
});

test('rejects missing owned read-admission mapping before a lack of grants can hide it', async () => {
  withoutTriggers(['work_package_organization_frozen_delete'], () => {
    fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='secret'");
  });
  expect(
    fixtureDatabase().query("SELECT project_id FROM work_package WHERE id='secret'").get(),
  ).toEqual({ project_id: 'alpha' });
  expect(
    fixtureDatabase()
      .query("SELECT resource_id FROM work_package_organization WHERE resource_id='secret'")
      .get(),
  ).toBeNull();
  await expectRejection(reader().checkRead(caller(), 'secret'), 'organization mapping');
});

for (const malformed of [
  { name: 'empty', expression: "''", storage: 'text', encoded: '' },
  { name: 'BLOB', expression: "X'6f72672d61'", storage: 'blob', encoded: '6F72672D61' },
] as const) {
  test(
    'rejects owned read admission with ' + malformed.name + ' mapping after restoring enforcement',
    async () => {
      withSolutionForeignKeysOff(() => {
        withoutTriggers(['work_package_organization_frozen_update'], () => {
          fixtureDatabase().run(
            'UPDATE work_package_organization SET organization_id=' +
              malformed.expression +
              " WHERE resource_id='secret'",
          );
        });
      });
      expect(
        fixtureDatabase()
          .query(
            "SELECT typeof(organization_id) AS storage,hex(organization_id) AS encoded FROM work_package_organization WHERE resource_id='secret'",
          )
          .get(),
      ).toEqual({ storage: malformed.storage, encoded: malformed.encoded });
      expect(
        fixtureDatabase()
          .query(
            "SELECT w.project_id,p.organization_id FROM work_package w JOIN project p ON p.id=w.project_id WHERE w.id='secret'",
          )
          .get(),
      ).toEqual({ project_id: 'alpha', organization_id: 'org-a' });
      await expectRejection(reader().checkRead(caller(), 'secret'), 'organization mapping');
    },
  );
}

test('rejects owned read admission with a missing parent after restoring foreign keys', async () => {
  removeParent('alpha');
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  await expectRejection(reader().checkRead(caller(), 'secret'), 'parent');
});

test('rejects owned read admission with a malformed current parent identity', async () => {
  withSolutionForeignKeysOff(() => {
    fixtureDatabase().run("UPDATE work_package SET project_id=X'616c706861' WHERE id='secret'");
  });
  expect(
    fixtureDatabase()
      .query(
        "SELECT typeof(project_id) AS storage,hex(project_id) AS encoded FROM work_package WHERE id='secret'",
      )
      .get(),
  ).toEqual({ storage: 'blob', encoded: '616C706861' });
  await expectRejection(reader().checkRead(caller(), 'secret'), 'parent');
});

test('keeps a valid foreign read-admission mapping opaque before malformed parent validation', async () => {
  grant('project-viewer', 'project', 'alpha');
  withoutTriggers(
    ['work_package_organization_frozen_delete', 'work_package_project_ownership_insert'],
    () => {
      fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='secret'");
      fixtureDatabase().run(
        "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('secret','org-b')",
      );
    },
  );
  withSolutionForeignKeysOff(() => {
    fixtureDatabase().run(
      "UPDATE work_package SET project_id=X'616c706861',estimate_method='invalid-private-setting' WHERE id='secret'",
    );
  });
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(
    fixtureDatabase()
      .query("SELECT organization_id FROM work_package_organization WHERE resource_id='secret'")
      .get(),
  ).toEqual({ organization_id: 'org-b' });
  expect(await reader().checkRead(caller(), 'secret')).toEqual({ ok: true, value: false });
});

test('keeps legacy read admission to narrow existence and refuses it after actual activation', async () => {
  await disposeFixture();
  await openFixture(false);
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting',timezone='invalid/private-zone' WHERE id='abroad'",
  );
  const evidence: CommandCaller = {
    kind: 'human',
    principal: caller().principal,
    expectedAccess: { kind: 'legacy' },
  };
  const packages = reader();
  expect(await packages.checkRead(evidence, 'abroad')).toEqual({ ok: true, value: true });
  expect(await packages.checkRead({ kind: 'legacy', actorId: 'reader' }, 'abroad')).toEqual({
    ok: true,
    value: true,
  });
  expect(await packages.checkRead(evidence, 'missing')).toEqual({ ok: true, value: false });
  fixtureDatabase().run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  expect(await packages.checkRead(evidence, 'abroad')).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
  expect(await packages.checkRead({ kind: 'legacy', actorId: 'reader' }, 'abroad')).toEqual({
    ok: false,
    refusal: 'no_active_organization',
  });
});

test('retains complete read-admission caller evidence before awaited current selection', async () => {
  grant('project-viewer', 'project', 'alpha');
  const evidence = caller();
  const captured = await withHeldSelection(
    () => reader().checkRead(evidence, 'secret'),
    () => {
      evidence.principal.id = 'other';
      evidence.principal.authentication = { kind: 'first_party', issuedAt: 99 };
      evidence.principal.scopes = [];
      if (evidence.expectedAccess.kind !== 'scoped')
        throw Error('Read-admission fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { organizationId: 'org-b', userId: 'other' });
      Object.assign(evidence.expectedAccess.principal, { id: 'other' });
    },
  );
  expect(captured).toEqual({ ok: true, value: true });
  expect(selectedPrincipal).toMatchObject({
    id: 'reader',
    authentication: { kind: 'first_party', issuedAt: 1 },
  });
});

test('rechecks actual read-admission membership and current organization selection', async () => {
  grant();
  const packages = reader();
  expect(await packages.checkRead(caller(), 'open')).toEqual({ ok: true, value: true });
  fixtureDatabase().run(
    "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
  );
  expect(await packages.checkRead(caller(), 'open')).toEqual({
    ok: false,
    refusal: 'not_a_member',
  });
  fixtureDatabase().run(
    "UPDATE fixture_package_selection SET organization_id='org-b' WHERE user_id='reader'",
  );
  expect(await packages.checkRead(caller(), 'open')).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
});

for (const kind of ['machine', 'consent'] as const) {
  test(
    'uses actual ' + kind + ' read-admission grants and rechecks credential revocation',
    async () => {
      grant('org-super-admin');
      expect(await reader().checkRead(caller(), 'open')).toEqual({ ok: true, value: true });
      fixtureDatabase().run(
        "INSERT INTO person(id,name,kind,account_id) VALUES('read-agent','Read agent','agent','reader')",
      );
      fixtureDatabase().run(
        "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('read-agent','org-a','Read agent')",
      );
      const credentialId = '00000000-0000-4000-8000-000000000004';
      fixtureDatabase().run(
        "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id) VALUES(?,'org-a','read-agent','reader',?,'Read agent',1,'reader',?)",
        [
          credentialId,
          kind === 'machine' ? 'api_key' : 'mcp_consent',
          kind === 'machine' ? null : 'read-family',
        ],
      );
      grant('package-viewer', 'work_package', 'secret', 'machine_credential', credentialId);
      const evidence = caller();
      evidence.principal.authentication =
        kind === 'machine'
          ? { kind: 'machine', credentialId, personId: 'read-agent' }
          : {
              kind: 'consent',
              credentialId,
              personId: 'read-agent',
              issuer: 'https://issuer.test',
              subject: 'reader',
            };
      evidence.principal.delegation = {
        organizationId: 'org-a',
        audience: 'wbs-be-01/via-mcp-01',
        client: 'client',
        grant: 'read-family',
      };
      if (evidence.expectedAccess.kind !== 'scoped')
        throw Error('Read-admission fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { cap: CONTRIBUTOR_CAP, delegated: true });
      expect(await reader().checkRead(evidence, 'secret')).toEqual({ ok: true, value: true });
      expect(await reader().checkRead(evidence, 'open')).toEqual({ ok: true, value: false });
      fixtureDatabase().run('UPDATE machine_credential SET revoked_at=2 WHERE id=?', [
        credentialId,
      ]);
      expect(await reader().checkRead(evidence, 'secret')).toEqual({
        ok: false,
        refusal: 'organization_context_changed',
      });
    },
  );
}

test('keeps read-admission target and parent grants on one held snapshot across a rival commit', async () => {
  grant('project-viewer', 'project', 'alpha');
  const packages = reader();
  const captured = await withHeldSelection(
    () => packages.checkRead(caller(), 'secret'),
    () => {
      fixtureDatabase().run('BEGIN IMMEDIATE');
      try {
        fixtureDatabase().run(
          "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id='reader'",
        );
        fixtureDatabase().run("UPDATE work_package SET project_id='beta' WHERE id='secret'");
        fixtureDatabase().run('COMMIT');
      } catch (cause: unknown) {
        let rollbackFailure: { cause: unknown } | undefined;
        try {
          fixtureDatabase().run('ROLLBACK');
        } catch (rollbackCause: unknown) {
          rollbackFailure = { cause: rollbackCause };
        }
        if (rollbackFailure !== undefined)
          throw new AggregateError(
            [cause, rollbackFailure.cause],
            'read-admission rival mutation and rollback failed',
            { cause },
          );
        throw cause;
      }
    },
  );
  expect(captured).toEqual({ ok: true, value: true });
  expect(
    fixtureDatabase().query("SELECT project_id FROM work_package WHERE id='secret'").get(),
  ).toEqual({ project_id: 'beta' });
  expect(await packages.checkRead(caller(), 'secret')).toEqual({ ok: true, value: false });
  grant('project-viewer', 'project', 'beta');
  expect(await packages.checkRead(caller(), 'secret')).toEqual({ ok: true, value: true });
});

function seedSavedShelfHeader(id: string, workPackageId: string, createdAt: number, name = id) {
  fixtureDatabase().run(
    'INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_absent_reason) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [
      id,
      workPackageId,
      name,
      'Historic Creator',
      'creator',
      createdAt,
      99,
      17,
      'a'.repeat(64),
      'future-reason',
    ],
  );
  return {
    id,
    workPackageId,
    name,
    createdBy: 'Historic Creator',
    createdById: 'creator',
    createdAt,
    inputSchemaVersion: 99,
    inputBytes: 17,
    inputSha256: 'a'.repeat(64),
    scheduleSchemaVersion: null,
    scheduleBytes: null,
    scheduleSha256: null,
    scheduleInputSha256: null,
    schedulerAlgorithmId: null,
    scheduleAbsentReason: 'future-reason',
  };
}

test('lists saved headers after current admission in repository order without body or package projection', async () => {
  grant('project-viewer', 'project', 'alpha');
  const older = seedSavedShelfHeader('older', 'secret', 1);
  const second = seedSavedShelfHeader('b', 'secret', 2);
  const first = seedSavedShelfHeader('a', 'secret', 2);
  seedSavedShelfHeader('other-package-header', 'second', 3);
  seedSavedShelfHeader('foreign-package-header', 'abroad', 4);
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting',timezone='invalid/private-zone' WHERE id='secret'",
  );
  expect(fixtureDatabase().query('SELECT COUNT(*) AS bodies FROM saved_plan_body').get()).toEqual({
    bodies: 0,
  });
  statements.length = 0;
  const reads = acquired;
  expect(await reader().listSaved(caller(), 'secret')).toEqual({
    ok: true,
    value: [first, second, older],
  });
  expect(acquired - reads).toBe(1);
  expect(statements.some((statement) => /from\s+["`]?saved_plan_body/i.test(statement.query))).toBe(
    false,
  );
  expect(await reader().listSaved(caller(), 'open')).toEqual({ ok: true, value: [] });
  expect(await reader().listSaved(caller(), 'missing')).toEqual({ ok: true, value: null });
  fixtureDatabase().run(
    "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id='reader'",
  );
  expect(await reader().listSaved(caller(), 'secret')).toEqual({ ok: true, value: null });
});

test('rejects owned saved-shelf missing mapping and parent before hidden headers and conceals valid foreign mapping', async () => {
  seedSavedShelfHeader('hidden-header', 'secret', 1);
  withoutTriggers(['work_package_organization_frozen_delete'], () => {
    fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='secret'");
  });
  await expectRejection(reader().listSaved(caller(), 'secret'), 'organization mapping');
  fixtureDatabase().run(
    "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('secret','org-a')",
  );
  removeParent('alpha');
  await expectRejection(reader().listSaved(caller(), 'secret'), 'parent');
  // A genuine foreign package retains its foreign map; its malformed private setting is opaque.
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting' WHERE id='abroad'",
  );
  seedSavedShelfHeader('foreign-header', 'abroad', 1);
  expect(await reader().listSaved(caller(), 'abroad')).toEqual({ ok: true, value: null });
});

test('keeps legacy saved shelves to narrow existence and rechecks activation before headers', async () => {
  await disposeFixture();
  await openFixture(false);
  const header = seedSavedShelfHeader('legacy-header', 'abroad', 1);
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting',timezone='invalid/private-zone' WHERE id='abroad'",
  );
  const evidence: CommandCaller = {
    kind: 'human',
    principal: caller().principal,
    expectedAccess: { kind: 'legacy' },
  };
  expect(await reader().listSaved(evidence, 'abroad')).toEqual({ ok: true, value: [header] });
  expect(await reader().listSaved({ kind: 'legacy', actorId: 'reader' }, 'abroad')).toEqual({
    ok: true,
    value: [header],
  });
  expect(await reader().listSaved(evidence, 'missing')).toEqual({ ok: true, value: null });
  fixtureDatabase().run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  expect(await reader().listSaved(evidence, 'abroad')).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
});

test('keeps saved header current parent and grants on one held observation across a rival commit', async () => {
  grant('project-viewer', 'project', 'alpha');
  const header = seedSavedShelfHeader('held-header', 'secret', 1, 'Captured');
  const observed = await withHeldSelection(
    () => reader().listSaved(caller(), 'secret'),
    () => {
      fixtureDatabase().run('BEGIN IMMEDIATE');
      try {
        fixtureDatabase().run("UPDATE work_package SET project_id='beta' WHERE id='secret'");
        fixtureDatabase().run("UPDATE saved_plan SET name='Changed' WHERE id='held-header'");
        fixtureDatabase().run(
          "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id='reader'",
        );
        fixtureDatabase().run('COMMIT');
      } catch (cause: unknown) {
        let rollbackFailure: { cause: unknown } | undefined;
        try {
          fixtureDatabase().run('ROLLBACK');
        } catch (rollbackCause: unknown) {
          rollbackFailure = { cause: rollbackCause };
        }
        if (rollbackFailure !== undefined)
          throw new AggregateError(
            [cause, rollbackFailure.cause],
            'saved-shelf rival mutation and rollback failed',
            { cause },
          );
        throw cause;
      }
    },
  );
  expect(observed).toEqual({ ok: true, value: [header] });
  expect(await reader().listSaved(caller(), 'secret')).toEqual({ ok: true, value: null });
  grant('project-viewer', 'project', 'beta');
  expect(await reader().listSaved(caller(), 'secret')).toEqual({
    ok: true,
    value: [{ ...header, name: 'Changed' }],
  });
});

test('keeps a valid foreign saved-shelf mapping opaque before own-parent validation', async () => {
  seedSavedShelfHeader('opaque-shelf-header', 'secret', 1);
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='invalid-private-setting',timezone='invalid/private-zone' WHERE id='secret'",
  );
  withoutTriggers(['work_package_organization_frozen_update'], () => {
    fixtureDatabase().run(
      "UPDATE work_package_organization SET organization_id='org-b' WHERE resource_id='secret'",
    );
  });
  expect(
    fixtureDatabase()
      .query(
        "SELECT w.project_id,p.organization_id AS parent_organization_id,m.organization_id AS mapped_organization_id FROM work_package w JOIN project p ON p.id=w.project_id JOIN work_package_organization m ON m.resource_id=w.id WHERE w.id='secret'",
      )
      .get(),
  ).toEqual({
    project_id: 'alpha',
    parent_organization_id: 'org-a',
    mapped_organization_id: 'org-b',
  });
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(fixtureDatabase().query('PRAGMA foreign_key_check').all()).toEqual([]);
  statements.length = 0;
  expect(await reader().listSaved(caller(), 'secret')).toEqual({ ok: true, value: null });
  expect(
    statements.some((statement) => /from\s+["`]?saved_plan["`]?\s/i.test(statement.query)),
  ).toBe(false);
});

test('returns actual saved-shelf membership and context refusals instead of a hidden shelf', async () => {
  grant('project-viewer', 'project', 'alpha');
  const header = seedSavedShelfHeader('context-shelf-header', 'secret', 1);
  const packages = reader();
  expect(await packages.listSaved(caller(), 'secret')).toEqual({ ok: true, value: [header] });
  fixtureDatabase().run(
    "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
  );
  expect(await packages.listSaved(caller(), 'secret')).toEqual({
    ok: false,
    refusal: 'not_a_member',
  });
  fixtureDatabase().run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','reader','member',1)",
  );
  fixtureDatabase().run(
    "UPDATE fixture_package_selection SET organization_id='org-b' WHERE user_id='reader'",
  );
  expect(await packages.listSaved(caller(), 'secret')).toEqual({
    ok: false,
    refusal: 'organization_context_changed',
  });
});

test('requires the exact scoped saved-shelf address when every stored candidate is owned and readable', async () => {
  withoutTriggers(
    ['work_package_organization_frozen_update', 'work_package_project_organization_update'],
    () => {
      fixtureDatabase().run(
        "UPDATE work_package_organization SET organization_id='org-a' WHERE resource_id='abroad'",
      );
      fixtureDatabase().run("UPDATE work_package SET project_id='alpha' WHERE id='abroad'");
    },
  );
  expect(fixtureDatabase().query('SELECT COUNT(*) AS packages FROM work_package').get()).toEqual({
    packages: 4,
  });
  expect(
    fixtureDatabase()
      .query(
        'SELECT w.id,w.project_id,m.organization_id,p.organization_id AS parent_organization_id FROM work_package w JOIN work_package_organization m ON m.resource_id=w.id JOIN project p ON p.id=w.project_id ORDER BY w.id',
      )
      .all(),
  ).toEqual([
    {
      id: 'abroad',
      project_id: 'alpha',
      organization_id: 'org-a',
      parent_organization_id: 'org-a',
    },
    { id: 'open', project_id: 'alpha', organization_id: 'org-a', parent_organization_id: 'org-a' },
    { id: 'second', project_id: 'beta', organization_id: 'org-a', parent_organization_id: 'org-a' },
    {
      id: 'secret',
      project_id: 'alpha',
      organization_id: 'org-a',
      parent_organization_id: 'org-a',
    },
  ]);
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(fixtureDatabase().query('PRAGMA foreign_key_check').all()).toEqual([]);
  grant('org-super-admin');
  const packages = reader();
  for (const id of ['abroad', 'open', 'second', 'secret'])
    expect(await packages.listSaved(caller(), id)).toEqual({ ok: true, value: [] });
  expect(await packages.listSaved(caller(), 'missing-owned-shelf-address')).toEqual({
    ok: true,
    value: null,
  });
});

function seedSavedRead(
  id: string,
  workPackageId: string,
  input: string | null = '  {"historic":true}\n',
): StoredSavedPlan {
  const header = seedSavedShelfHeader(id, workPackageId, 11);
  fixtureDatabase().run(
    'INSERT INTO saved_plan_organization(resource_id,organization_id) SELECT ?,organization_id FROM work_package_organization WHERE resource_id=?',
    [id, workPackageId],
  );
  if (input !== null)
    fixtureDatabase().run(
      "INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES(?,'input',?)",
      [id, input],
    );
  return { header, bodies: { input, schedule: null }, stepIdentity: { kind: 'pre_catalogue' } };
}

/** This disposable corruption keeps every previously enabled FK setting restored before the owning read. */
function withoutSavedReadForeignKeys(mutate: () => void) {
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  const failures: unknown[] = [];
  try {
    fixtureDatabase().run('PRAGMA foreign_keys=OFF');
    mutate();
  } catch (cause: unknown) {
    failures.push(cause);
  }
  try {
    fixtureDatabase().run('PRAGMA foreign_keys=ON');
    expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  } catch (cause: unknown) {
    failures.push(cause);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'saved-read corruption and FK restoration failed', {
      cause: failures[0],
    });
}

test('detaches exact saved bytes and missing bodies after current admission without private package projection', async () => {
  grant('project-viewer', 'project', 'alpha');
  const stored = seedSavedRead('stored-read', 'secret');
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='private-invalid',timezone='invalid/private' WHERE id='secret'",
  );
  const before = acquired;
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'stored-read' }),
  ).toEqual({ ok: true, value: { kind: 'stored', stored } });
  expect(acquired - before).toBe(1);
  expect(
    await reader().readSaved(caller(), {
      kind: 'comparison',
      workPackageId: 'secret',
      savedPlanId: 'stored-read',
    }),
  ).toEqual({ ok: true, value: { kind: 'stored', stored } });
  fixtureDatabase().run("DELETE FROM saved_plan_body WHERE saved_plan_id='stored-read'");
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'stored-read' }),
  ).toEqual({
    ok: true,
    value: {
      kind: 'stored',
      stored: { ...stored, bodies: { input: null, schedule: null } },
    },
  });
});

test('conceals denied saved detail and admits the comparison package before selecting any saved side', async () => {
  seedSavedRead('denied-read', 'secret');
  statements.length = 0;
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'denied-read' }),
  ).toEqual({ ok: true, value: { kind: 'package_not_found' } });
  expect(statements.some((statement) => /from\s+["`]?saved_plan_body/i.test(statement.query))).toBe(
    false,
  );
  statements.length = 0;
  expect(
    await reader().readSaved(caller(), {
      kind: 'comparison',
      workPackageId: 'secret',
      savedPlanId: 'denied-read',
    }),
  ).toEqual({ ok: true, value: { kind: 'package_not_found' } });
  expect(statements.some((statement) => /from\s+["`]?saved_plan/i.test(statement.query))).toBe(
    false,
  );
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'absent-read' }),
  ).toEqual({ ok: true, value: { kind: 'saved_plan_not_found' } });
  expect(
    await reader().readSaved(caller(), {
      kind: 'comparison',
      workPackageId: 'missing',
      savedPlanId: 'denied-read',
    }),
  ).toEqual({ ok: true, value: { kind: 'package_not_found' } });
  grant('project-viewer', 'project', 'alpha');
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'denied-read' }),
  ).toMatchObject({ ok: true, value: { kind: 'stored' } });
});

test('keeps valid foreign saved mappings opaque before malformed ownership and private header decoding', async () => {
  seedSavedRead('foreign-mapped-read', 'secret');
  withoutSavedReadForeignKeys(() => {
    fixtureDatabase().run(
      "UPDATE saved_plan SET work_package_id='absent-private-owner',input_schema_version=999 WHERE id='foreign-mapped-read'",
    );
  });
  withoutTriggers(['saved_plan_organization_frozen_update'], () => {
    fixtureDatabase().run(
      "UPDATE saved_plan_organization SET organization_id='org-b' WHERE resource_id='foreign-mapped-read'",
    );
  });
  statements.length = 0;
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'foreign-mapped-read' }),
  ).toEqual({ ok: true, value: { kind: 'saved_plan_not_found' } });
  expect(
    statements.some((statement) => /from\s+["`]?saved_plan["`]?\s/i.test(statement.query)),
  ).toBe(false);
  fixtureDatabase().run(
    "UPDATE saved_plan SET work_package_id='secret' WHERE id='foreign-mapped-read'",
  );
  grant('project-viewer', 'project', 'alpha');
  expect(
    await reader().readSaved(caller(), {
      kind: 'comparison',
      workPackageId: 'secret',
      savedPlanId: 'foreign-mapped-read',
    }),
  ).toEqual({ ok: true, value: { kind: 'saved_plan_not_found' } });
});

test('rejects an owned saved header with no mapping before a grant denial can hide it', async () => {
  seedSavedRead('unmapped-read', 'secret');
  withoutTriggers(['saved_plan_organization_frozen_delete'], () => {
    fixtureDatabase().run("DELETE FROM saved_plan_organization WHERE resource_id='unmapped-read'");
  });
  await expectRejection(
    reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'unmapped-read' }),
    'organization mapping',
  );
  grant('project-viewer', 'project', 'alpha');
  await expectRejection(
    reader().readSaved(caller(), {
      kind: 'comparison',
      workPackageId: 'secret',
      savedPlanId: 'unmapped-read',
    }),
    'organization mapping',
  );
});

test('rejects scoped saved header package orphans but preserves legacy orphan absence', async () => {
  seedSavedRead('orphan-package-read', 'secret');
  withoutSavedReadForeignKeys(() => {
    fixtureDatabase().run(
      "UPDATE saved_plan SET work_package_id='missing-owner' WHERE id='orphan-package-read'",
    );
  });
  await expectRejection(
    reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'orphan-package-read' }),
    'orphan package',
  );
  await disposeFixture();
  await openFixture(false);
  seedSavedRead('legacy-orphan-read', 'secret');
  withoutSavedReadForeignKeys(() => {
    fixtureDatabase().run(
      "UPDATE saved_plan SET work_package_id='missing-owner' WHERE id='legacy-orphan-read'",
    );
  });
  expect(
    await reader().readSaved(
      { kind: 'legacy', actorId: 'reader' },
      { kind: 'detail', savedPlanId: 'legacy-orphan-read' },
    ),
  ).toEqual({ ok: true, value: { kind: 'package_not_found' } });
});

test('rejects owned detail map-only orphans while comparison keeps its missing-side precedence', async () => {
  seedSavedRead('map-only-read', 'secret');
  withoutSavedReadForeignKeys(() =>
    fixtureDatabase().run("DELETE FROM saved_plan WHERE id='map-only-read'"),
  );
  expect(
    fixtureDatabase()
      .query(
        "SELECT organization_id FROM saved_plan_organization WHERE resource_id='map-only-read'",
      )
      .get(),
  ).toEqual({ organization_id: 'org-a' });
  await expectRejection(
    reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'map-only-read' }),
    'orphan organization mapping',
  );
  grant('project-viewer', 'project', 'alpha');
  expect(
    await reader().readSaved(caller(), {
      kind: 'comparison',
      workPackageId: 'secret',
      savedPlanId: 'map-only-read',
    }),
  ).toEqual({ ok: true, value: { kind: 'saved_plan_not_found' } });
  withoutTriggers(['saved_plan_organization_frozen_update'], () =>
    fixtureDatabase().run(
      "UPDATE saved_plan_organization SET organization_id='org-b' WHERE resource_id='map-only-read'",
    ),
  );
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'map-only-read' }),
  ).toEqual({ ok: true, value: { kind: 'saved_plan_not_found' } });
});

test('rejects selected saved package mapping and parent corruption before hidden private bytes', async () => {
  seedSavedRead('target-corruption-read', 'secret');
  withoutTriggers(['work_package_organization_frozen_delete'], () =>
    fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='secret'"),
  );
  await expectRejection(
    reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'target-corruption-read' }),
    'organization mapping',
  );
  fixtureDatabase().run(
    "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('secret','org-a')",
  );
  removeParent('alpha');
  await expectRejection(
    reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'target-corruption-read' }),
    'parent',
  );
});

test('rejects own saved mapping versus foreign package ownership before private decoding', async () => {
  seedSavedRead('conflicting-read', 'abroad');
  withoutTriggers(['saved_plan_organization_frozen_update'], () =>
    fixtureDatabase().run(
      "UPDATE saved_plan_organization SET organization_id='org-a' WHERE resource_id='conflicting-read'",
    ),
  );
  statements.length = 0;
  await expectRejection(
    reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'conflicting-read' }),
    'ownership conflict',
  );
  expect(statements.some((statement) => /from\s+["`]?saved_plan_body/i.test(statement.query))).toBe(
    false,
  );
});

test('refuses missing and wrong-package comparison sides before their unrelated corruption', async () => {
  grant('project-viewer', 'project', 'alpha');
  seedSavedRead('wrong-side-read', 'second');
  withoutTriggers(['saved_plan_organization_frozen_delete'], () =>
    fixtureDatabase().run(
      "DELETE FROM saved_plan_organization WHERE resource_id='wrong-side-read'",
    ),
  );
  statements.length = 0;
  for (const savedPlanId of ['wrong-side-read', 'missing-side-read'])
    expect(
      await reader().readSaved(caller(), {
        kind: 'comparison',
        workPackageId: 'secret',
        savedPlanId,
      }),
    ).toEqual({ ok: true, value: { kind: 'saved_plan_not_found' } });
  expect(
    statements.some((statement) => /from\s+["`]?saved_plan_organization/i.test(statement.query)),
  ).toBe(false);
  expect(statements.some((statement) => /from\s+["`]?saved_plan_body/i.test(statement.query))).toBe(
    false,
  );
});

test('keeps saved authority current parent headers and bodies on one held observation', async () => {
  grant('project-viewer', 'project', 'alpha');
  const stored = seedSavedRead('held-saved-read', 'secret');
  const captured = await withHeldSelection(
    () => reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'held-saved-read' }),
    () => {
      fixtureDatabase().run('BEGIN IMMEDIATE');
      try {
        fixtureDatabase().run("UPDATE work_package SET project_id='beta' WHERE id='secret'");
        fixtureDatabase().run(
          "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id='reader'",
        );
        fixtureDatabase().run(
          "UPDATE saved_plan SET name='Changed after capture' WHERE id='held-saved-read'",
        );
        fixtureDatabase().run(
          "UPDATE saved_plan_body SET bytes='changed bytes' WHERE saved_plan_id='held-saved-read' AND kind='input'",
        );
        fixtureDatabase().run('COMMIT');
      } catch (cause: unknown) {
        let rollbackFailure: { cause: unknown } | undefined;
        try {
          fixtureDatabase().run('ROLLBACK');
        } catch (failure: unknown) {
          rollbackFailure = { cause: failure };
        }
        if (rollbackFailure !== undefined)
          throw new AggregateError(
            [cause, rollbackFailure.cause],
            'saved read rival mutation and rollback failed',
            { cause },
          );
        throw cause;
      }
    },
  );
  expect(captured).toEqual({ ok: true, value: { kind: 'stored', stored } });
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'held-saved-read' }),
  ).toEqual({ ok: true, value: { kind: 'package_not_found' } });
  grant('project-viewer', 'project', 'beta');
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'held-saved-read' }),
  ).toEqual({
    ok: true,
    value: {
      kind: 'stored',
      stored: {
        stepIdentity: stored.stepIdentity,
        header: { ...stored.header, name: 'Changed after capture' },
        bodies: { input: 'changed bytes', schedule: null },
      },
    },
  });
});

for (const kind of ['machine', 'consent'] as const) {
  test(
    'uses actual ' + kind + ' saved-read grants rather than account grants and rechecks revocation',
    async () => {
      grant('org-super-admin');
      const stored = seedSavedRead('credential-saved-read', 'secret');
      seedSavedRead('account-only-saved-read', 'open');
      fixtureDatabase().run(
        "INSERT INTO person(id,name,kind,account_id) VALUES('saved-reader-agent','Saved reader','agent','reader')",
      );
      fixtureDatabase().run(
        "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('saved-reader-agent','org-a','Saved reader')",
      );
      const credentialId = '00000000-0000-4000-8000-000000000005';
      fixtureDatabase().run(
        "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id) VALUES(?,'org-a','saved-reader-agent','reader',?,'Saved reader',1,'reader',?)",
        [
          credentialId,
          kind === 'machine' ? 'api_key' : 'mcp_consent',
          kind === 'machine' ? null : 'saved-reader-family',
        ],
      );
      grant('package-viewer', 'work_package', 'secret', 'machine_credential', credentialId);
      const evidence = caller();
      evidence.principal.authentication =
        kind === 'machine'
          ? { kind: 'machine', credentialId, personId: 'saved-reader-agent' }
          : {
              kind: 'consent',
              credentialId,
              personId: 'saved-reader-agent',
              issuer: 'https://issuer.test',
              subject: 'reader',
            };
      evidence.principal.delegation = {
        organizationId: 'org-a',
        audience: 'wbs-be-01/via-mcp-01',
        client: 'client',
        grant: 'saved-reader-family',
      };
      if (evidence.expectedAccess.kind !== 'scoped')
        throw Error('saved fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { cap: CONTRIBUTOR_CAP, delegated: true });
      expect(
        await reader().readSaved(evidence, {
          kind: 'detail',
          savedPlanId: 'credential-saved-read',
        }),
      ).toEqual({ ok: true, value: { kind: 'stored', stored } });
      expect(
        await reader().readSaved(evidence, {
          kind: 'detail',
          savedPlanId: 'account-only-saved-read',
        }),
      ).toEqual({ ok: true, value: { kind: 'package_not_found' } });
      fixtureDatabase().run('UPDATE machine_credential SET revoked_at=2 WHERE id=?', [
        credentialId,
      ]);
      expect(
        await reader().readSaved(evidence, {
          kind: 'detail',
          savedPlanId: 'credential-saved-read',
        }),
      ).toEqual({ ok: false, refusal: 'organization_context_changed' });
    },
  );
}

for (const mapping of ['empty', 'blob'] as const) {
  test(
    'rejects selected saved ' + mapping + ' organization mapping before reading private bodies',
    async () => {
      seedSavedRead('malformed-map-read', 'secret');
      withoutSavedReadForeignKeys(() => {
        withoutTriggers(['saved_plan_organization_frozen_update'], () => {
          fixtureDatabase().run(
            'UPDATE saved_plan_organization SET organization_id=? WHERE resource_id=?',
            [mapping === 'empty' ? '' : new Uint8Array([65]), 'malformed-map-read'],
          );
        });
      });
      statements.length = 0;
      await expectRejection(
        reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'malformed-map-read' }),
        'organization mapping',
      );
      expect(
        statements.some((statement) => /from\s+["`]?saved_plan_body/i.test(statement.query)),
      ).toBe(false);
    },
  );
}

test('retains a saved address before held authority resolution and returns actual later membership refusal', async () => {
  grant('project-viewer', 'project', 'alpha');
  const stored = seedSavedRead('retained-saved-address', 'secret');
  const address = { kind: 'detail' as const, savedPlanId: 'retained-saved-address' };
  const captured = await withHeldSelection(
    () => reader().readSaved(caller(), address),
    () => {
      address.savedPlanId = 'mutated-address';
    },
  );
  expect(captured).toEqual({ ok: true, value: { kind: 'stored', stored } });
  fixtureDatabase().run(
    "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
  );
  expect(
    await reader().readSaved(caller(), { kind: 'detail', savedPlanId: 'retained-saved-address' }),
  ).toEqual({ ok: false, refusal: 'not_a_member' });
});

for (const identity of ['empty', 'blob'] as const) {
  test(
    'rejects saved ' + identity + ' package identity before package lookup or private bytes',
    async () => {
      seedSavedRead('malformed-package-identity', 'secret');
      withoutSavedReadForeignKeys(() => {
        fixtureDatabase().run('UPDATE saved_plan SET work_package_id=? WHERE id=?', [
          identity === 'empty' ? '' : new Uint8Array([65]),
          'malformed-package-identity',
        ]);
      });
      expect(
        fixtureDatabase()
          .query(
            "SELECT typeof(work_package_id) AS storage, length(work_package_id) AS width FROM saved_plan WHERE id='malformed-package-identity'",
          )
          .get(),
      ).toEqual({
        storage: identity === 'empty' ? 'text' : 'blob',
        width: identity === 'empty' ? 0 : 1,
      });
      statements.length = 0;
      await expectRejection(
        reader().readSaved(caller(), {
          kind: 'detail',
          savedPlanId: 'malformed-package-identity',
        }),
        'malformed package identity',
      );
      expect(
        statements.some((statement) =>
          /from\s+["`]?work_package["`]?(?:\s|$)/i.test(statement.query),
        ),
      ).toBe(false);
      expect(
        statements.some((statement) =>
          /from\s+["`]?saved_plan_body["`]?(?:\s|$)/i.test(statement.query),
        ),
      ).toBe(false);
    },
  );
}

test('enforces the borrowed saved reader non-null contract in an isolated real observation', async () => {
  grant('project-viewer', 'project', 'alpha');
  const stored = seedSavedRead('borrowed-null-contract', 'secret');
  const address = { kind: 'detail' as const, savedPlanId: 'borrowed-null-contract' };
  expect(await reader().readSaved(caller(), address)).toEqual({
    ok: true,
    value: { kind: 'stored', stored },
  });
  const owned = custody;
  if (owned === null) throw Error('saved contract fixture is not acquired');
  const script = `
    import assert from 'node:assert/strict';
    import { mock } from 'bun:test';
    import { sql } from 'drizzle-orm';
    const selectedModule = await import(${JSON.stringify(new URL('./saved-plan.ts', import.meta.url).href)});
    const actualExports = { ...selectedModule };
    const readRealStored = selectedModule.readSavedPlanIn;
    const calls = [];
    let returnsNull = false;
    let source;
    let primary;
    try {
      await mock.module(${JSON.stringify(new URL('./saved-plan.ts', import.meta.url).href)}, () => ({
        ...actualExports,
        readSavedPlanIn: async (snapshot, id) => {
          const realStored = await readRealStored(snapshot, id);
          assert.equal(id, 'borrowed-null-contract');
          assert.notEqual(realStored, null);
          assert.equal(realStored.header.id, id);
          calls.push({ id, returnsNull });
          return returnsNull ? null : realStored;
        },
      }));
      const { openSqliteSource } = await import(${JSON.stringify(new URL('./source.ts', import.meta.url).href)});
      const { CAPABLE_BACKEND_DEPENDENCY_CAPABILITY } = await import(${JSON.stringify(new URL('./testing/dependency-capability.ts', import.meta.url).href)});
      source = openSqliteSource({
        dbPath: ${JSON.stringify(owned.path)},
        dependencyCapability: CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      });
      const packages = source.createWorkPackageObservation({
        activeOrganizationOf: (snapshot) => async (principal) => {
          const selected = snapshot.all(sql\`SELECT organization_id AS organizationId FROM fixture_package_selection WHERE user_id=\${principal.id}\`).at(0);
          if (selected === undefined || selected.organizationId === null) return null;
          if (typeof selected.organizationId !== 'string') throw Error('fixture selection is malformed');
          return selected.organizationId;
        },
        now: () => 100,
      });
      const evidence = ${JSON.stringify(caller())};
      const address = ${JSON.stringify(address)};
      const healthy = await packages.readSaved(evidence, address);
      assert.equal(healthy.ok, true);
      assert.equal(healthy.value.kind, 'stored');
      assert.equal(healthy.value.stored.header.id, 'borrowed-null-contract');
      assert.deepEqual(calls, [{ id: 'borrowed-null-contract', returnsNull: false }]);
      console.log('saved-null-contract healthy helper witnessed');
      returnsNull = true;
      console.log('saved-null-contract replacing helper return only');
      await assert.rejects(
        () => packages.readSaved(evidence, address),
        { message: 'saved plan borrowed-null-contract disappeared inside its observation' },
      );
      assert.deepEqual(calls, [
        { id: 'borrowed-null-contract', returnsNull: false },
        { id: 'borrowed-null-contract', returnsNull: true },
      ]);
    } catch (cause) {
      primary = { cause };
    }
    const cleanup = [];
    if (source !== undefined) {
      try { await source.close(); } catch (cause) { cleanup.push(cause); }
    }
    try { mock.restore(); } catch (cause) { cleanup.push(cause); }
    if (primary !== undefined) {
      if (cleanup.length !== 0)
        throw new AggregateError([primary.cause, ...cleanup], 'saved contract and child cleanup failed', { cause: primary.cause });
      throw primary.cause;
    }
    if (cleanup.length !== 0)
      throw new AggregateError(cleanup, 'saved contract child cleanup failed', { cause: cleanup[0] });
    console.log('saved-null-contract verified');
  `;
  const child = Bun.spawn(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', script],
    {
      cwd: new URL('../../../../../', import.meta.url).pathname,
      env: { PATH: process.env['PATH'], NODE_ENV: 'test', TZ: 'UTC' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    },
  );
  const [exit, stdout, stderr] = await Promise.allSettled([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const failures: unknown[] = [];
  if (exit.status === 'rejected') failures.push(exit.reason);
  if (stdout.status === 'rejected') failures.push(stdout.reason);
  if (stderr.status === 'rejected') failures.push(stderr.reason);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'saved contract child settlement and drains failed', {
      cause: failures[0],
    });
  if (exit.status !== 'fulfilled' || stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled')
    throw Error('saved contract child outcomes lost after settlement');
  expect(exit.value, stdout.value + stderr.value).toBe(0);
  expect(stderr.value).toBe('');
  expect(stdout.value).toBe(
    'saved-null-contract healthy helper witnessed\n' +
      'saved-null-contract replacing helper return only\n' +
      'saved-null-contract verified\n',
  );
  // The replacement lived only in the joined child; this parent reader still has the real helper.
  expect(await reader().readSaved(caller(), address)).toEqual({
    ok: true,
    value: { kind: 'stored', stored },
  });
});

function createCurrentReader(
  configuration: Parameters<SqliteSource['bindLivePlans']>[0] = {
    schedulerOf: () => fastScheduler,
  },
) {
  return fixtureSource()
    .bindLivePlans(configuration)
    .createWorkPackageObservation({ activeOrganizationOf, now: () => 100 });
}
function seedCurrentLeaf(id: 'open' | 'secret' | 'second') {
  fixtureDatabase().run(
    'INSERT INTO work_item(id,work_package_id,position,name) VALUES(?,?,10,?)',
    [id + '-current-leaf', id, 'Current ' + id],
  );
  fixtureDatabase().run(
    'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES(?,?,1,1,1)',
    [id + '-current-leaf', id + '-dev'],
  );
  fixtureDatabase().run(
    "UPDATE work_package SET start_date='2026-10-05',estimate_rounding='exact' WHERE id=?",
    [id],
  );
}
function seedCurrentPerson(id: string) {
  fixtureDatabase().run('INSERT INTO person(id,name) VALUES(?,?)', [id, id]);
  fixtureDatabase().run(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES(?,'org-a',?)",
    [id, id],
  );
}
function assignCurrentPerson(id: string, personId: string) {
  const stepId = id + '-current-' + personId;
  fixtureDatabase().run(
    'INSERT INTO step(id,work_package_id,name,code,position) VALUES(?,?,?,?,20)',
    [stepId, id, personId, personId],
  );
  fixtureDatabase().run(
    'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES(?,?,1,1,1)',
    [id + '-current-leaf', stepId],
  );
  fixtureDatabase().run('INSERT INTO assignment(work_item_id,step_id,person_id) VALUES(?,?,?)', [
    id + '-current-leaf',
    stepId,
    personId,
  ]);
}
/** Synthetic trusted storage, identical to dependency reader fixtures; not an activation/runtime compatibility proof. */
function enableCurrentGraph() {
  fixtureDatabase().run(
    'INSERT INTO cross_work_package_dependency_activation_receipt(id,receipt) VALUES(1,?)',
    [
      JSON.stringify({
        protocol: 'wbs-dependency-activation',
        version: 1,
        activationId: 'synthetic-storage-fixture',
        databaseIdentity: 'isolated-test-database',
        candidateImage: 'fixture@sha256:' + 'a'.repeat(64),
        rollbackImage: 'fixture@sha256:' + 'b'.repeat(64),
        participantProofSha256: 'c'.repeat(64),
        migrationCaptureSha256: 'd'.repeat(64),
        activatedAt: 1,
      }),
    ],
  );
  fixtureDatabase().run(
    "UPDATE cross_work_package_dependency_activation SET state='ENABLED' WHERE id=1",
  );
  expect(
    fixtureDatabase()
      .query('SELECT state FROM cross_work_package_dependency_activation WHERE id=1')
      .get(),
  ).toEqual({ state: 'ENABLED' });
}
function seedCurrentDependency(id: string, predecessor: string, successor: string) {
  fixtureDatabase().run(
    "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES(?,'org-a',?,?,?,?,'whole','whole','FS')",
    [id, predecessor, successor, predecessor + '-current-leaf', successor + '-current-leaf'],
  );
}
function createCurrentScheduler(
  readCaptured: Parameters<Parameters<SqliteSource['bindLivePlans']>[0]['schedulerOf']>[0],
) {
  return createScheduler(
    (rows, edges, slices, notBefore, pools, reach, deadlines, typed, elsewhere, capacities) =>
      schedule(
        rows,
        edges,
        slices,
        notBefore,
        pools,
        reach,
        deadlines,
        typed,
        undefined,
        elsewhere,
        capacities,
      ),
    scheduleResolved,
    readCaptured === undefined
      ? undefined
      : {
          readCaptured,
          readLive: () => Promise.reject(Error('saved current attempted live optimizer admission')),
        },
  );
}

test('requires configured saved-current capture while preserving ordinary unbound reads and narrow target opacity', async () => {
  grant('project-viewer', 'project', 'alpha');
  expect(await reader().checkRead(caller(), 'secret')).toEqual({ ok: true, value: true });
  await expectRejection(reader().captureSavedCurrent(caller(), 'secret'), 'not configured');
  const current = createCurrentReader();
  expect(await current.captureSavedCurrent(caller(), 'missing-current')).toEqual({
    ok: true,
    value: null,
  });
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='private-invalid' WHERE id='abroad'",
  );
  expect(await current.captureSavedCurrent(caller(), 'abroad')).toEqual({ ok: true, value: null });
  fixtureDatabase().run(
    "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id='reader'",
  );
  expect(await current.captureSavedCurrent(caller(), 'secret')).toEqual({ ok: true, value: null });
});

test('finishes local saved-current Fast only after the actual borrowed loan is released', async () => {
  grant('project-viewer', 'project', 'alpha');
  seedCurrentLeaf('secret');
  let loan: Drizzle | undefined,
    calls = 0;
  function readAfterClose(ask: CapturedScheduleAsk): ScheduleRead;
  function readAfterClose(ask: LiveScheduleAsk): Promise<ScheduleRead>;
  function readAfterClose(ask: ScheduleAsk): ScheduleRead | Promise<ScheduleRead> {
    const snapshot = loan;
    if (snapshot === undefined) throw Error('current snapshot was not observed');
    const before = statements.length;
    expect(() => snapshot.all(sql`SELECT 1`)).toThrow(
      'pooled read connection was used after its release',
    );
    expect(statements.length).toBe(before);
    calls++;
    return ask.mode === 'capture' ? fastScheduler.read(ask) : fastScheduler.read(ask);
  }
  const current = fixtureSource()
    .bindLivePlans({ schedulerOf: () => ({ ...fastScheduler, read: readAfterClose }) })
    .createWorkPackageObservation({
      activeOrganizationOf(snapshot) {
        loan = snapshot;
        return activeOrganizationOf(snapshot);
      },
      now: () => 100,
    });
  const observed = await current.captureSavedCurrent(caller(), 'secret');
  expect(observed).toMatchObject({
    ok: true,
    value: {
      kind: 'local',
      reads: { workPackage: { id: 'secret', projectId: 'alpha' } },
      scheduled: { kind: 'scheduled' },
    },
  });
  expect(calls).toBe(1);
});

test('keeps hidden unrelated ranked private settings outside current shared capture', async () => {
  grant('project-viewer', 'project', 'alpha');
  fixtureDatabase().run("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  seedCurrentLeaf('secret');
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='private-invalid',timezone='invalid/private' WHERE id='second'",
  );
  const observed = await createCurrentReader().captureSavedCurrent(caller(), 'secret');
  expect(observed).toMatchObject({
    ok: true,
    value: { kind: 'scheduled', reads: { workPackage: { id: 'secret' } }, influencers: [] },
  });
});

test('does not traverse a hidden person-only bridge or let its external edge choose connected current mode', async () => {
  grant('project-viewer', 'project', 'alpha');
  fixtureDatabase().run("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  for (const id of ['open', 'secret', 'second'] as const) seedCurrentLeaf(id);
  seedCurrentPerson('current-bridge');
  assignCurrentPerson('secret', 'current-bridge');
  assignCurrentPerson('second', 'current-bridge');
  enableCurrentGraph();
  seedCurrentDependency('hidden-bridge-edge', 'second', 'open');
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='private-invalid' WHERE id='second'",
  );
  const observed = await createCurrentReader().captureSavedCurrent(caller(), 'secret');
  expect(observed).toMatchObject({
    ok: true,
    value: { kind: 'scheduled', reads: { workPackage: { id: 'secret' } }, influencers: [] },
  });
});

test('preserves readable higher-rank transitivity and stops at undated or lower current person neighbors', async () => {
  grant('org-super-admin');
  fixtureDatabase().run("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  for (const id of ['open', 'secret', 'second'] as const) seedCurrentLeaf(id);
  for (const person of ['current-p', 'current-q']) seedCurrentPerson(person);
  assignCurrentPerson('open', 'current-p');
  assignCurrentPerson('secret', 'current-p');
  assignCurrentPerson('secret', 'current-q');
  assignCurrentPerson('second', 'current-q');
  const current = createCurrentReader();
  const first = await current.captureSavedCurrent(caller(), 'second');
  expect(first).toMatchObject({
    ok: true,
    value: {
      kind: 'scheduled',
      influencers: [{ workPackageId: 'open' }, { workPackageId: 'secret' }],
    },
  });
  fixtureDatabase().run("UPDATE work_package SET start_date=NULL WHERE id='secret'");
  expect(await current.captureSavedCurrent(caller(), 'second')).toMatchObject({
    ok: true,
    value: { kind: 'scheduled', influencers: [] },
  });
  fixtureDatabase().run("UPDATE work_package SET start_date='2026-10-05' WHERE id='secret'");
  fixtureDatabase().run("UPDATE work_package SET start_date=NULL WHERE id='second'");
  expect(await current.captureSavedCurrent(caller(), 'second')).toMatchObject({
    ok: true,
    value: { kind: 'scheduled', influencers: [] },
  });
  fixtureDatabase().run("UPDATE work_package SET start_date='2026-10-05' WHERE id='second'");
  for (const [id, position] of [
    ['second', 10],
    ['secret', 20],
    ['open', 30],
  ] as const)
    fixtureDatabase().run(
      "INSERT INTO work_package_rank(work_package_id,organization_id,position,created_at,created_by) VALUES(?,'org-a',?,1,'creator')",
      [id, position],
    );
  expect(await current.captureSavedCurrent(caller(), 'second')).toMatchObject({
    ok: true,
    value: { kind: 'scheduled', influencers: [] },
  });
});

for (const [direction, held] of [
  ['incoming', false],
  ['outgoing', false],
  ['outgoing', true],
] as const) {
  test(
    'conceals a required hidden ' +
      direction +
      (held ? ' held' : '') +
      ' current dependency before private capture',
    async () => {
      grant('package-viewer', 'work_package', 'secret');
      for (const id of ['open', 'secret', 'second'] as const) seedCurrentLeaf(id);
      enableCurrentGraph();
      const hidden = direction === 'incoming' ? 'open' : 'second';
      seedCurrentDependency(
        'required-hidden-edge',
        direction === 'incoming' ? hidden : 'secret',
        direction === 'incoming' ? 'secret' : hidden,
      );
      if (held)
        fixtureDatabase().run("UPDATE work_item SET hold='on_hold' WHERE id=?", [
          hidden + '-current-leaf',
        ]);
      fixtureDatabase().run(
        "UPDATE work_package SET estimate_method='private-invalid' WHERE id=?",
        [hidden],
      );
      expect(await createCurrentReader().captureSavedCurrent(caller(), 'secret')).toEqual({
        ok: true,
        value: null,
      });
    },
  );
}

test('captures alternating readable person and incoming dependency closure without a rank cutoff', async () => {
  grant('org-super-admin');
  fixtureDatabase().run("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  for (const id of ['open', 'secret', 'second'] as const) seedCurrentLeaf(id);
  seedCurrentPerson('current-fixed-point');
  assignCurrentPerson('secret', 'current-fixed-point');
  assignCurrentPerson('open', 'current-fixed-point');
  enableCurrentGraph();
  seedCurrentDependency('incoming-after-person', 'second', 'open');
  const observed = await createCurrentReader().captureSavedCurrent(caller(), 'secret');
  expect(observed.ok).toBe(true);
  if (!observed.ok || observed.value?.kind !== 'connected')
    throw Error('expected admitted connected current capture');
  expect(
    observed.value.projection.capture.workPackages.map((member) => member.workPackageId),
  ).toEqual(['open', 'secret', 'second']);
  expect(observed.value.projection.capture.relationships.map((edge) => edge.id)).toEqual([
    'incoming-after-person',
  ]);
  const scouts = statements.filter((statement) =>
    statement.query.includes('SELECT DISTINCT neighbor.work_package_id'),
  );
  expect(scouts.length).toBeGreaterThan(0);
  expect(scouts.every((statement) => statement.parameters.length === 2)).toBe(true);
});

test('throws for missing and malformed required current endpoint identities after restoring foreign keys', async () => {
  grant('org-super-admin');
  for (const id of ['open', 'secret'] as const) seedCurrentLeaf(id);
  enableCurrentGraph();
  seedCurrentDependency('broken-required-current', 'open', 'secret');
  withoutSavedReadForeignKeys(() =>
    fixtureDatabase().run(
      "UPDATE external_dependency SET predecessor_work_package_id='missing-required-current' WHERE id='broken-required-current'",
    ),
  );
  await expectRejection(
    createCurrentReader().captureSavedCurrent(caller(), 'secret'),
    'endpoint is absent',
  );
  withoutSavedReadForeignKeys(() =>
    fixtureDatabase().run(
      "UPDATE external_dependency SET predecessor_work_package_id=? WHERE id='broken-required-current'",
      [new Uint8Array([65])],
    ),
  );
  await expectRejection(
    createCurrentReader().captureSavedCurrent(caller(), 'secret'),
    'endpoint identity is malformed',
  );
});

test('keeps current target mapping and parent corruption strict before a denial can hide it', async () => {
  withoutTriggers(['work_package_organization_frozen_delete'], () =>
    fixtureDatabase().run("DELETE FROM work_package_organization WHERE resource_id='secret'"),
  );
  await expectRejection(
    createCurrentReader().captureSavedCurrent(caller(), 'secret'),
    'organization mapping',
  );
  fixtureDatabase().run(
    "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('secret','org-a')",
  );
  removeParent('alpha');
  await expectRejection(createCurrentReader().captureSavedCurrent(caller(), 'secret'), 'parent');
});

test('retains current parent grants assignments and both cache objectives across a rival commit without admission', async () => {
  grant('project-viewer', 'project', 'alpha');
  seedCurrentLeaf('secret');
  seedCurrentPerson('current-old');
  seedCurrentPerson('current-new');
  assignCurrentPerson('secret', 'current-old');
  const local = await createCurrentReader().captureSavedCurrent(caller(), 'secret');
  if (!local.ok || local.value?.kind !== 'local' || local.value.scheduled.kind !== 'scheduled')
    throw Error('actual initial local schedule required');
  const input = scheduleInputOfCaptured(local.value.reads),
    contract = '7+1.0.0',
    budget = 60000;
  const generation = allocateGeneration(
    fixtureSource().db,
    'secret',
    contract,
    scheduleInputHash(input),
    1,
  );
  const encoded = JSON.stringify(
    encodeOptimizedResult({
      publication: 'solver',
      objectiveValues: {
        makespan: { value: 2, stageValue: 2, bound: 2, status: 'optimal' },
        priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
        movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
      },
      schedule: local.value.scheduled.fast,
    }),
  );
  for (const objective of ['pri', 'time'] as const)
    fixtureSource()
      .db.insert(optimizedScheduleCache)
      .values({
        workPackageId: 'secret',
        inputHash: scheduleInputHash(input),
        objective,
        contractVersion: contract,
        budgetMs: budget,
        generation,
        status: 'ok',
        resultJson: encoded,
        failureReason: null,
        createdAt: 1,
      })
      .run();
  const current = createCurrentReader({
    schedulerOf: createCurrentScheduler,
    optimization: { contractVersion: contract, budgetMs: budget, now: () => 100 },
  });
  const before = fixtureDatabase()
    .query('SELECT * FROM optimization_generation ORDER BY work_package_id,contract_version')
    .all();
  const captured = await withHeldSelection(
    () => current.captureSavedCurrent(caller(), 'secret'),
    () => {
      fixtureDatabase().run('BEGIN IMMEDIATE');
      try {
        fixtureDatabase().run("UPDATE work_package SET project_id='beta' WHERE id='secret'");
        fixtureDatabase().run(
          "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id='reader'",
        );
        fixtureDatabase().run(
          "UPDATE assignment SET person_id='current-new' WHERE work_item_id='secret-current-leaf'",
        );
        fixtureDatabase().run(
          "UPDATE optimized_schedule_cache SET status='failed',result_json=NULL,failure_reason='timeout' WHERE work_package_id='secret'",
        );
        fixtureDatabase().run('COMMIT');
      } catch (cause: unknown) {
        let rollbackFailure: { cause: unknown } | undefined;
        try {
          fixtureDatabase().run('ROLLBACK');
        } catch (failure: unknown) {
          rollbackFailure = { cause: failure };
        }
        if (rollbackFailure !== undefined)
          throw new AggregateError(
            [cause, rollbackFailure.cause],
            'current rival commit and rollback failed',
            { cause },
          );
        throw cause;
      }
    },
  );
  if (
    !captured.ok ||
    captured.value?.kind !== 'local' ||
    captured.value.scheduled.kind !== 'scheduled'
  )
    throw Error('captured local schedule required');
  expect(captured.value.reads.workPackage.projectId).toBe('alpha');
  expect(captured.value.reads.assignments.map((assignment) => assignment.personId)).toEqual([
    'current-old',
  ]);
  expect(captured.value.scheduled.optimization).toMatchObject({
    inputHash: scheduleInputHash(input),
    contractVersion: contract,
    budgetMs: budget,
    generation,
    variants: { pri: { state: 'ready' }, time: { state: 'ready' } },
  });
  expect(captured.value.scheduled.optimization?.schedules).toEqual({
    pri: local.value.scheduled.fast,
    time: local.value.scheduled.fast,
  });
  expect(await current.captureSavedCurrent(caller(), 'secret')).toEqual({ ok: true, value: null });
  grant('project-viewer', 'project', 'beta');
  const fresh = await current.captureSavedCurrent(caller(), 'secret');
  if (!fresh.ok || fresh.value?.kind !== 'local' || fresh.value.scheduled.kind !== 'scheduled')
    throw Error('fresh local schedule required');
  expect(fresh.value.reads.workPackage.projectId).toBe('beta');
  expect(fresh.value.reads.assignments.map((assignment) => assignment.personId)).toEqual([
    'current-new',
  ]);
  expect(fresh.value.scheduled.optimization?.variants).toEqual({
    pri: { state: 'idle' },
    time: { state: 'idle' },
  });
  expect(
    fixtureDatabase()
      .query('SELECT * FROM optimization_generation ORDER BY work_package_id,contract_version')
      .all(),
  ).toEqual(before);
  expect(fixtureDatabase().query('SELECT * FROM solver_queue').all()).toEqual([]);
  expect(fixtureDatabase().query('SELECT * FROM solver_slot').all()).toEqual([]);
});

test('preserves local unavailable-before-Fast and models only cycle while retaining calendar and unknown failures', async () => {
  grant('project-viewer', 'project', 'alpha');
  seedCurrentLeaf('secret');
  fixtureDatabase().run(
    "UPDATE work_package SET schedule_engine='optimized',optimization_enabled=1 WHERE id='secret'",
  );
  let fastCalls = 0;
  const unavailable = createCurrentReader({
    schedulerOf: () =>
      createScheduler(() => {
        fastCalls++;
        throw Error('unavailable engine reached Fast');
      }, scheduleResolved),
  });
  expect(await unavailable.captureSavedCurrent(caller(), 'secret')).toMatchObject({
    ok: true,
    value: { kind: 'local', scheduled: { kind: 'engine_unavailable' } },
  });
  expect(fastCalls).toBe(0);
  fixtureDatabase().run(
    "UPDATE work_package SET schedule_engine='fast',optimization_enabled=0 WHERE id='secret'",
  );
  const cycle = createCurrentReader({
    schedulerOf: () => ({
      ...fastScheduler,
      read: () => {
        throw new ScheduleCycleError();
      },
    }),
  });
  expect(await cycle.captureSavedCurrent(caller(), 'secret')).toMatchObject({
    ok: true,
    value: { kind: 'local', scheduled: { kind: 'cycle' } },
  });
  for (const failure of [
    undefined,
    Error('unknown current finish'),
    new CalendarRangeError('2026-10-05', 1e20),
  ]) {
    const current = createCurrentReader({
      schedulerOf: () => ({
        ...fastScheduler,
        read: () => {
          const cause: unknown = failure;
          throw cause;
        },
      }),
    });
    const settled = await current.captureSavedCurrent(caller(), 'secret').then(
      () => ({ rejected: false as const }),
      (cause: unknown) => ({ rejected: true as const, cause }),
    );
    expect(settled.rejected).toBe(true);
    if (!settled.rejected) throw Error('unexpected local current failure resolved');
    expect(settled.cause).toBe(failure);
  }
});

test('preserves explicit legacy local current capture and refuses it after actual activation', async () => {
  await disposeFixture();
  await openFixture(false);
  seedCurrentLeaf('secret');
  const current = createCurrentReader();
  expect(
    await current.captureSavedCurrent({ kind: 'legacy', actorId: 'reader' }, 'secret'),
  ).toMatchObject({ ok: true, value: { kind: 'local', reads: { workPackage: { id: 'secret' } } } });
  expect(
    await current.captureSavedCurrent({ kind: 'legacy', actorId: 'reader' }, 'missing'),
  ).toEqual({ ok: true, value: null });
  fixtureDatabase().run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  expect(
    await current.captureSavedCurrent({ kind: 'legacy', actorId: 'reader' }, 'secret'),
  ).toEqual({ ok: false, refusal: 'no_active_organization' });
});

for (const kind of ['machine', 'consent'] as const) {
  test(
    'captures current with actual ' +
      kind +
      ' grants instead of account grants and refuses revocation',
    async () => {
      grant('org-super-admin');
      seedCurrentLeaf('secret');
      fixtureDatabase().run(
        "INSERT INTO person(id,name,kind,account_id) VALUES('current-agent','Current reader','agent','reader')",
      );
      fixtureDatabase().run(
        "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('current-agent','org-a','Current reader')",
      );
      const credentialId = '00000000-0000-4000-8000-000000000006';
      fixtureDatabase().run(
        "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id) VALUES(?,'org-a','current-agent','reader',?,'Current reader',1,'reader',?)",
        [
          credentialId,
          kind === 'machine' ? 'api_key' : 'mcp_consent',
          kind === 'machine' ? null : 'current-family',
        ],
      );
      grant('package-viewer', 'work_package', 'secret', 'machine_credential', credentialId);
      const evidence = caller();
      evidence.principal.authentication =
        kind === 'machine'
          ? { kind: 'machine', credentialId, personId: 'current-agent' }
          : {
              kind: 'consent',
              credentialId,
              personId: 'current-agent',
              issuer: 'https://issuer.test',
              subject: 'reader',
            };
      evidence.principal.delegation = {
        organizationId: 'org-a',
        audience: 'wbs-be-01/via-mcp-01',
        client: 'client',
        grant: 'current-family',
      };
      if (evidence.expectedAccess.kind !== 'scoped')
        throw Error('current fixture scoped evidence lost');
      Object.assign(evidence.expectedAccess.scope, { cap: CONTRIBUTOR_CAP, delegated: true });
      const current = createCurrentReader();
      expect(await current.captureSavedCurrent(evidence, 'secret')).toMatchObject({
        ok: true,
        value: { kind: 'local', reads: { workPackage: { id: 'secret' } } },
      });
      expect(await current.captureSavedCurrent(evidence, 'open')).toEqual({
        ok: true,
        value: null,
      });
      fixtureDatabase().run('UPDATE machine_credential SET revoked_at=2 WHERE id=?', [
        credentialId,
      ]);
      expect(await current.captureSavedCurrent(evidence, 'secret')).toEqual({
        ok: false,
        refusal: 'organization_context_changed',
      });
    },
  );
}

test('conceals a valid foreign required current endpoint before its own-parent conflict or private settings', async () => {
  grant('package-viewer', 'work_package', 'secret');
  for (const id of ['open', 'secret'] as const) seedCurrentLeaf(id);
  enableCurrentGraph();
  seedCurrentDependency('foreign-required-current', 'open', 'secret');
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='private-invalid' WHERE id='open'",
  );
  withoutSavedReadForeignKeys(() => {
    withoutTriggers(['work_package_organization_frozen_update'], () => {
      fixtureDatabase().run(
        "UPDATE work_package_organization SET organization_id='org-b' WHERE resource_id='open'",
      );
    });
  });
  expect(await createCurrentReader().captureSavedCurrent(caller(), 'secret')).toEqual({
    ok: true,
    value: null,
  });
});

test('rejects an installed local scheduler that asks the detached cache about another current package', async () => {
  grant('project-viewer', 'project', 'alpha');
  seedCurrentLeaf('secret');
  const current = createCurrentReader({
    optimization: { contractVersion: '7+1.0.0', budgetMs: 60000, now: () => 100 },
    schedulerOf: (readCaptured) => {
      if (readCaptured === undefined) throw Error('configured current cache reader absent');
      const capturedReader = readCaptured;
      function retarget(ask: CapturedScheduleAsk): ScheduleRead;
      function retarget(ask: LiveScheduleAsk): Promise<ScheduleRead>;
      function retarget(ask: ScheduleAsk): ScheduleRead | Promise<ScheduleRead> {
        if (ask.mode !== 'capture') throw Error('current capture attempted live mode');
        const fast = fastScheduler.read(ask);
        if (fast.kind === 'engine_unavailable') return fast;
        return {
          ...fast,
          optimization: capturedReader({
            workPackageId: 'another-current-package',
            input: ask.input,
            objective: ask.objective,
            enabled: ask.enabled,
          }),
        };
      }
      return { ...fastScheduler, read: retarget };
    },
  });
  await expectRejection(current.captureSavedCurrent(caller(), 'secret'), 'cache question changed');
});

for (const state of ['ready', 'pending', 'failed'] as const) {
  test(`captures optimized-enabled current ${state} from the exact installed cache without admission`, async () => {
    grant('project-viewer', 'project', 'alpha');
    seedCurrentLeaf('secret');
    const initial = await createCurrentReader().captureSavedCurrent(caller(), 'secret');
    if (
      !initial.ok ||
      initial.value?.kind !== 'local' ||
      initial.value.scheduled.kind !== 'scheduled'
    )
      throw Error('actual Fast schedule is required before installing cache evidence');
    fixtureDatabase().run(
      "UPDATE work_package SET schedule_engine='optimized',optimization_enabled=1,schedule_objective='time' WHERE id='secret'",
    );
    const input = scheduleInputOfCaptured(initial.value.reads);
    const contract = '7+1.0.0',
      budget = 60000;
    const generation = allocateGeneration(
      fixtureSource().db,
      'secret',
      contract,
      scheduleInputHash(input),
      1,
    );
    if (state === 'pending') {
      fixtureDatabase().run(
        "INSERT INTO solver_queue(work_package_id,contract_version,objective,budget_ms,generation,admitted_cancel_epoch,enqueued_at) VALUES('secret',?,'time',?,?,0,1)",
        [contract, budget, generation],
      );
    } else {
      const encoded =
        state === 'ready'
          ? JSON.stringify(
              encodeOptimizedResult({
                publication: 'solver',
                objectiveValues: {
                  makespan: { value: 1, stageValue: 1, bound: 1, status: 'optimal' },
                  priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                  movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                },
                schedule: initial.value.scheduled.fast,
              }),
            )
          : null;
      fixtureSource()
        .db.insert(optimizedScheduleCache)
        .values({
          workPackageId: 'secret',
          inputHash: scheduleInputHash(input),
          objective: 'time',
          contractVersion: contract,
          budgetMs: budget,
          generation,
          status: state === 'ready' ? 'ok' : 'failed',
          resultJson: encoded,
          failureReason: state === 'failed' ? 'timeout' : null,
          createdAt: 1,
        })
        .run();
    }
    const tables = [
      'optimization_generation',
      'optimized_schedule_cache',
      'solver_slot',
      'solver_queue',
    ] as const;
    const before = tables.map((table) =>
      fixtureDatabase().query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
    const observed = await createCurrentReader({
      schedulerOf: createCurrentScheduler,
      optimization: { contractVersion: contract, budgetMs: budget, now: () => 100 },
    }).captureSavedCurrent(caller(), 'secret');
    if (
      !observed.ok ||
      observed.value?.kind !== 'local' ||
      observed.value.scheduled.kind !== 'scheduled'
    )
      throw Error('expected an admitted installed optimized current capture');
    expect(observed.value.reads.workPackage).toMatchObject({
      scheduleEngine: 'optimized',
      optimizationEnabled: true,
      scheduleObjective: 'time',
    });
    expect(observed.value.scheduled.optimization).toMatchObject({
      inputHash: scheduleInputHash(input),
      generation,
      contractVersion: contract,
      budgetMs: budget,
      variants: { pri: { state: 'idle' }, time: { state } },
    });
    expect(observed.value.scheduled.optimization?.schedules.time).toEqual(
      state === 'ready' ? initial.value.scheduled.fast : null,
    );
    expect(
      tables.map((table) => fixtureDatabase().query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    ).toEqual(before);
  });
}

test('retains exact connected current stage and historical body across a rival cache publication', async () => {
  grant('org-super-admin');
  for (const id of ['open', 'secret'] as const) seedCurrentLeaf(id);
  enableCurrentGraph();
  seedCurrentDependency('current-body-edge', 'open', 'secret');
  fixtureDatabase().run(
    "UPDATE work_package SET schedule_engine='optimized',optimization_enabled=1,schedule_objective='time' WHERE id='secret'",
  );
  const installed = { solverVersion: '0.4.0', budgetMs: 1000, now: () => 100 };
  const configuration = { schedulerOf: () => fastScheduler, connected: installed };
  const initial = await createCurrentReader(configuration).captureSavedCurrent(caller(), 'secret');
  if (
    !initial.ok ||
    initial.value?.kind !== 'connected' ||
    initial.value.projection.placement.kind !== 'scheduled'
  )
    throw Error('actual connected stage required');
  const initialSelection = initial.value.projection.placement.stages.find(
    (selection) => selection.stage.workPackageId === 'secret',
  );
  if (initialSelection === undefined) throw Error('target connected stage missing');
  const stageBytes = canonicalConnectedStageInput(initialSelection.stage);
  const question = captureConnectedQuestion(initialSelection.stage, 'time', installed);
  const before = fixtureDatabase()
    .query('SELECT * FROM optimization_generation ORDER BY rowid')
    .all();
  let published = false;
  const current = createCurrentReader(configuration);
  const held = await withHeldSelection(
    () => current.captureSavedCurrent(caller(), 'secret'),
    () => {
      fixtureSource()
        .db.insert(optimizedScheduleCache)
        .values({
          ...question,
          generation: 1,
          status: 'failed',
          failureReason: 'timeout',
          createdAt: 100,
        })
        .run();
      published = true;
    },
  );
  if (
    !held.ok ||
    held.value?.kind !== 'connected' ||
    held.value.projection.placement.kind !== 'scheduled'
  )
    throw Error('held connected capture required');
  expect(published).toBe(true);
  const heldSelection = held.value.projection.placement.stages.find(
    (selection) => selection.stage.workPackageId === 'secret',
  );
  if (heldSelection === undefined) throw Error('held target stage missing');
  expect(canonicalConnectedStageInput(heldSelection.stage)).toBe(stageBytes);
  expect(heldSelection.optimization?.variants.time).toEqual({ state: 'idle' });
  const history = captureConnectedHistory(held.value, 'secret');
  expect(history.input.schemaVersion).toBe(12);
  expect(history.input.dependencyHistory.kind).toBe('connected');
  if (history.input.dependencyHistory.kind !== 'connected' || !history.schedule.present)
    throw Error('connected current history must retain its placed body');
  expect(history.input.dependencyHistory.relationships.map((edge) => edge.id)).toEqual([
    'current-body-edge',
  ]);
  expect(history.schedule.body.version).toBe(4);
  expect(history.schedule.body.connection.targetWorkPackageId).toBe('secret');
  const historicalStage = history.schedule.body.connection.stages.find(
    (stage) => stage.workPackageId === 'secret',
  );
  expect(historicalStage).toMatchObject({
    format: 'connected-stage-v2',
    stageBytes,
    observation: {
      inputHash: question.inputHash,
      contractVersion: question.contractVersion,
      budgetMs: installed.budgetMs,
      quantum: 48,
      wireVersion: 5,
    },
    variants: { pri: { state: 'idle' }, time: { state: 'idle' } },
    selected: null,
  });
  const retainedBody = serializeSavedConnectedScheduleBody(history.schedule.body);
  const next = await createCurrentReader(configuration).captureSavedCurrent(caller(), 'secret');
  if (
    !next.ok ||
    next.value?.kind !== 'connected' ||
    next.value.projection.placement.kind !== 'scheduled'
  )
    throw Error('fresh connected capture required');
  const nextSelection = next.value.projection.placement.stages.find(
    (selection) => selection.stage.workPackageId === 'secret',
  );
  expect(nextSelection?.optimization?.variants.time).toEqual({
    state: 'failed',
    reason: 'timeout',
  });
  const freshHistory = captureConnectedHistory(next.value, 'secret');
  if (!freshHistory.schedule.present)
    throw Error('failed optimization must preserve connected Fast placement');
  expect(
    freshHistory.schedule.body.connection.stages.find((stage) => stage.workPackageId === 'secret')
      ?.variants?.time,
  ).toEqual({ state: 'failed', reason: 'timeout' });
  expect(serializeSavedConnectedScheduleBody(history.schedule.body)).toBe(retainedBody);
  expect(canonicalConnectedStageInput(heldSelection.stage)).toBe(stageBytes);
  expect(
    fixtureDatabase().query('SELECT * FROM optimization_generation ORDER BY rowid').all(),
  ).toEqual(before);
});

test('expires the real current connected scheduler callback when its observation loan settles', async () => {
  grant('org-super-admin');
  for (const id of ['open', 'secret'] as const) seedCurrentLeaf(id);
  const local = await createCurrentReader().captureSavedCurrent(caller(), 'secret');
  if (!local.ok || local.value?.kind !== 'local') throw Error('actual local input required');
  const ask = {
    workPackageId: 'secret',
    input: scheduleInputOfCaptured(local.value.reads),
    objective: 'time' as const,
    enabled: true,
  };
  enableCurrentGraph();
  seedCurrentDependency('current-lifetime-edge', 'open', 'secret');
  let retained: Parameters<Parameters<SqliteSource['bindLivePlans']>[0]['schedulerOf']>[0];
  let onLoanCalls = 0;
  const current = createCurrentReader({
    schedulerOf(readCaptured) {
      if (readCaptured === undefined) throw Error('configured captured reader missing');
      retained = readCaptured;
      expect(readCaptured(ask).variants.time).toEqual({ state: 'idle' });
      onLoanCalls++;
      return fastScheduler;
    },
    optimization: { contractVersion: '7+1.0.0', budgetMs: 60000, now: () => 100 },
    connected: { solverVersion: '0.4.0', budgetMs: 1000, now: () => 100 },
  });
  const observed = await current.captureSavedCurrent(caller(), 'secret');
  expect(observed.ok && observed.value?.kind).toBe('connected');
  expect(onLoanCalls).toBe(1);
  const callback = retained;
  if (callback === undefined) throw Error('current purpose did not retain the actual callback');
  expect(() => callback(ask)).toThrow('closed');
});

test('conceals a current target with a valid foreign mapping before its granted own-parent conflict', async () => {
  grant('project-viewer', 'project', 'alpha');
  seedCurrentLeaf('secret');
  const current = createCurrentReader();
  expect(await current.captureSavedCurrent(caller(), 'secret')).toMatchObject({
    ok: true,
    value: { kind: 'local', reads: { workPackage: { id: 'secret', projectId: 'alpha' } } },
  });
  expect(await reader().checkRead(caller(), 'open')).toEqual({ ok: true, value: true });
  fixtureDatabase().run(
    "UPDATE work_package SET estimate_method='private-invalid',timezone='private/invalid' WHERE id='secret'",
  );
  withoutSavedReadForeignKeys(() => {
    withoutTriggers(['work_package_organization_frozen_update'], () => {
      fixtureDatabase().run(
        "UPDATE work_package_organization SET organization_id='org-b' WHERE resource_id='secret'",
      );
    });
  });
  expect(
    fixtureDatabase()
      .query(
        "SELECT mapping.organization_id AS mappingOrganizationId,parent.organization_id AS parentOrganizationId,wp.project_id AS projectId FROM work_package wp JOIN work_package_organization mapping ON mapping.resource_id=wp.id JOIN project parent ON parent.id=wp.project_id WHERE wp.id='secret'",
      )
      .get(),
  ).toEqual({
    mappingOrganizationId: 'org-b',
    parentOrganizationId: 'org-a',
    projectId: 'alpha',
  });
  expect(
    fixtureDatabase()
      .query(
        "SELECT role FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
      )
      .get(),
  ).toEqual({ role: 'member' });
  expect(await reader().checkRead(caller(), 'open')).toEqual({ ok: true, value: true });
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(fixtureDatabase().query('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(await current.captureSavedCurrent(caller(), 'secret')).toEqual({ ok: true, value: null });
});

test('rejects a selected current dependency whose organization alone contradicts both owned endpoints', async () => {
  grant('org-super-admin');
  for (const id of ['open', 'secret'] as const) seedCurrentLeaf(id);
  enableCurrentGraph();
  seedCurrentDependency('current-organization-only', 'open', 'secret');
  const current = createCurrentReader();
  const initial = await current.captureSavedCurrent(caller(), 'secret');
  expect(initial.ok && initial.value?.kind).toBe('connected');
  const broadGrants = fixtureDatabase()
    .query<{ id: string }, []>(
      "SELECT id FROM access_grant WHERE organization_id='org-a' AND subject_kind='user' AND subject_id='reader' AND scope_kind='organization' AND scope_id='org-a' AND role_id='org-super-admin'",
    )
    .all();
  expect(broadGrants.length).toBe(1);
  const broadGrant = broadGrants.at(0);
  if (broadGrant === undefined) throw Error('actual broad reader grant missing');
  fixtureDatabase().run('DELETE FROM access_grant WHERE id=?', [broadGrant.id]);
  grant('package-viewer', 'work_package', 'secret');
  fixtureDatabase().run("UPDATE work_package SET restricted=1 WHERE id='open'");
  expect(
    fixtureDatabase()
      .query(
        "SELECT scope_kind,scope_id,role_id FROM access_grant WHERE organization_id='org-a' AND subject_kind='user' AND subject_id='reader'",
      )
      .all(),
  ).toEqual([{ scope_kind: 'work_package', scope_id: 'secret', role_id: 'package-viewer' }]);
  expect(
    fixtureDatabase()
      .query(
        "SELECT role FROM organization_membership WHERE organization_id='org-a' AND user_id='reader'",
      )
      .get(),
  ).toEqual({ role: 'member' });
  expect(await reader().checkRead(caller(), 'secret')).toEqual({ ok: true, value: true });
  expect(await reader().checkRead(caller(), 'open')).toEqual({ ok: true, value: false });
  expect(await current.captureSavedCurrent(caller(), 'secret')).toEqual({ ok: true, value: null });
  const before = fixtureDatabase()
    .query<Record<string, unknown>, []>(
      "SELECT * FROM external_dependency WHERE id='current-organization-only'",
    )
    .get();
  if (before === null) throw Error('actual selected dependency row missing');
  expect(before['organization_id']).toBe('org-a');
  expect(() =>
    fixtureDatabase().run(
      "UPDATE external_dependency SET organization_id='org-b' WHERE id='current-organization-only'",
    ),
  ).toThrow();
  withoutSavedReadForeignKeys(() => {
    fixtureDatabase().run(
      "UPDATE external_dependency SET organization_id='org-b' WHERE id='current-organization-only'",
    );
  });
  expect(
    fixtureDatabase()
      .query("SELECT * FROM external_dependency WHERE id='current-organization-only'")
      .get(),
  ).toEqual({ ...before, organization_id: 'org-b' });
  expect(fixtureDatabase().query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  const violations = fixtureDatabase()
    .query<{ table: string; parent: string }, []>('PRAGMA foreign_key_check')
    .all();
  expect(
    violations.map((violation) => ({ table: violation.table, parent: violation.parent })),
  ).toEqual([
    { table: 'external_dependency', parent: 'work_package_organization' },
    { table: 'external_dependency', parent: 'work_package_organization' },
  ]);
  await expectRejection(
    current.captureSavedCurrent(caller(), 'secret'),
    'dependency organization is inconsistent',
  );
});

test('retains installed current cache configuration after its original contract and budget object changes', async () => {
  grant('project-viewer', 'project', 'alpha');
  seedCurrentLeaf('secret');
  const initial = await createCurrentReader().captureSavedCurrent(caller(), 'secret');
  if (
    !initial.ok ||
    initial.value?.kind !== 'local' ||
    initial.value.scheduled.kind !== 'scheduled'
  )
    throw Error('actual Fast capture required before seeding the installed cache');
  fixtureDatabase().run(
    "UPDATE work_package SET schedule_engine='optimized',optimization_enabled=1,schedule_objective='time' WHERE id='secret'",
  );
  const input = scheduleInputOfCaptured(initial.value.reads);
  const contract = '7+1.0.0',
    budget = 60000;
  const generation = allocateGeneration(
    fixtureSource().db,
    'secret',
    contract,
    scheduleInputHash(input),
    1,
  );
  fixtureSource()
    .db.insert(optimizedScheduleCache)
    .values({
      workPackageId: 'secret',
      inputHash: scheduleInputHash(input),
      objective: 'time',
      contractVersion: contract,
      budgetMs: budget,
      generation,
      status: 'ok',
      failureReason: null,
      createdAt: 1,
      resultJson: JSON.stringify(
        encodeOptimizedResult({
          publication: 'solver',
          objectiveValues: {
            makespan: { value: 1, stageValue: 1, bound: 1, status: 'optimal' },
            priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
            movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
          },
          schedule: initial.value.scheduled.fast,
        }),
      ),
    })
    .run();
  const installed = { contractVersion: contract, budgetMs: budget, now: () => 100 };
  const current = createCurrentReader({
    schedulerOf: createCurrentScheduler,
    optimization: installed,
  });
  installed.contractVersion = '8+2.0.0';
  installed.budgetMs = 120000;
  expect(installed).toMatchObject({ contractVersion: '8+2.0.0', budgetMs: 120000 });
  const tables = [
    'optimization_generation',
    'optimized_schedule_cache',
    'solver_slot',
    'solver_queue',
  ] as const;
  const before = tables.map((table) =>
    fixtureDatabase().query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  );
  const observed = await current.captureSavedCurrent(caller(), 'secret');
  if (
    !observed.ok ||
    observed.value?.kind !== 'local' ||
    observed.value.scheduled.kind !== 'scheduled'
  )
    throw Error('installed optimized current capture required');
  expect(observed.value.scheduled.optimization).toMatchObject({
    inputHash: scheduleInputHash(input),
    generation,
    contractVersion: contract,
    budgetMs: budget,
    variants: { pri: { state: 'idle' }, time: { state: 'ready' } },
  });
  expect(observed.value.scheduled.optimization?.schedules.time).toEqual(
    initial.value.scheduled.fast,
  );
  expect(
    tables.map((table) => fixtureDatabase().query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
  ).toEqual(before);
});
