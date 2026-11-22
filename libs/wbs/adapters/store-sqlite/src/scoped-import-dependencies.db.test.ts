import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DocumentV14TypedDependency, PlanDocumentImport } from '@wbs/contracts';
import { type Broadcaster, type Scope, servicesOver } from '@wbs/core';
import { createImportService } from '@wbs/core/module/plan-import/composition';
import * as importedPlans from '@wbs/core/module/plan-import/imported-plan.resource';
import { ImportedPlanResource } from '@wbs/core/module/plan-import/imported-plan.resource';
import { clockOf } from '@wbs/core/ports/clock';
import type { CommittedWorkPackageEvent } from '@wbs/core/ports/committed-fanout';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '@wbs/core/ports/external-dependency-authoring';
import * as dependencyContexts from '@wbs/core/service/dependency-context';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { CONTRIBUTOR_CAP, type ScopedDependencyEndpoint } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';

import { SqliteCommandAccess } from './command-access';
import { openDatabase } from './db';
import { MachineCredentialRepository } from './machine-credential';
import { SqliteOrganizationAccess } from './organization-access';
import { openSqliteSource, type SqliteSource } from './source';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { seedDependencyAuthority } from './testing/dependency-activation';
import { CAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { seedPackageParent } from './testing/legacy-package-parent';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

const ACTOR = 'importer';
const STAMP = { at: 1_757_851_200_000, by: ACTOR };
// The fixture clock allocates a measure, the package, two creator grants, then its rows.
const ALLOCATION = { packageId: 'import-2', firstRow: 'import-5', secondRow: 'import-6' };
const PRINCIPAL = { id: ACTOR, username: ACTOR, scopes: ['read', 'write'] as const };
const ACCESS = {
  principal: { id: ACTOR, authentication: undefined },
  kind: 'scoped',
  scope: { cap: null, organizationId: 'org-a', userId: ACTOR },
} as const;
const ORGANIZATION_LIMITS = {
  maxAgentPersons: 50,
  maxConcurrentClaims: 200,
  maxCapacityUnitsPerResource: 10_000,
} as const;
const opened: { sqlite: SqliteSource; directory: string }[] = [];

afterEach(async () => {
  mock.restore();
  for (const { sqlite, directory } of opened.splice(0)) {
    await sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function documentFixture(): PlanDocumentImport {
  const document = planDocumentFixture();
  document.document.version = 11;
  document.capacity = [];
  document.calendarMarkers = [];
  document.directory = {
    teams: [],
    people: [],
    tags: [],
    services: [],
    types: [],
    externalSystems: [],
    resources: [],
  };
  const base = document.workItems.at(0);
  if (base === undefined) throw new Error('fixture lost its row');
  const leaf = {
    ...base,
    notes: '',
    serviceTeamId: null,
    serviceId: null,
    teamIds: [],
    tagIds: [],
    serviceIds: [],
    typeIds: [],
    externalRefs: [],
    assignees: {},
    deadline: null,
    actuals: {},
    progress: {},
    measures: {},
  };
  document.workItems = [
    { ...structuredClone(leaf), id: 'row-a', name: 'A' },
    { ...structuredClone(leaf), id: 'row-b', name: 'B', position: 20 },
  ];
  document.typedDependencies = [
    {
      id: 'local',
      type: 'FS',
      predecessor: { kind: 'internal', scope: 'whole', workItem: 'row-a' },
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-b' },
    },
    externalRelationship(),
  ];
  return document;
}

function externalRelationship(
  endpoint: ScopedDependencyEndpoint = {
    scope: 'whole',
    workPackageId: 'remote',
    workItemId: 'remote-leaf',
  },
): DocumentV14TypedDependency {
  const display = {
    workPackageName: 'Old work package name',
    abbreviation: 'OLD',
    workItemName: 'Old name',
    address: 'OLD.99',
  };
  return {
    id: 'external',
    type: 'FS',
    predecessor:
      endpoint.scope === 'whole'
        ? { kind: 'external', ...endpoint, display }
        : { kind: 'external', ...endpoint, display: { ...display, stepName: 'Old step name' } },
    successor: { kind: 'internal', scope: 'whole', workItem: 'row-a' },
  };
}

/** Actual writer state, including uncommitted leaks, audit, history, events and allocation counters. */
function snapshotTables(sqlite: SqliteSource) {
  return sqlite.db
    .all<{ name: string }>(
      sql.raw(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    )
    .map(({ name }) => ({
      name,
      rows: sqlite.db
        .all<Record<string, unknown>>(sql.raw(`SELECT * FROM "${name.replaceAll('"', '""')}"`))
        .map((row) => JSON.stringify(row))
        .sort(),
    }));
}

async function defineProjectStep(
  sqlite: SqliteSource,
  organizationId: string,
  projectId: string,
  identity: { id: string; name: string; code: string },
) {
  const definition = await sqlite.stores.stepCatalogue.defineAndBindStep(
    organizationId,
    {
      ...identity,
      position: 10,
      defaultAllowancePercent: 0,
      defaultEstimateUnit: 'workdays',
    },
    {
      bindingId: identity.id + '-binding',
      scopeKind: 'project',
      scopeId: projectId,
      workItemTypeId: null,
      position: 10,
    },
    { at: 1, by: 'other-owner' },
  );
  if (!definition.ok) throw new Error('fixture definition refused: ' + definition.reason);
}

async function harness(authoring: unknown = { state: 'active' }) {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-scoped-import-'));
  const path = join(directory, 'source.db');
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, { hasUnknownOwner: false });
  seedDependencyAuthority(path);
  const captures: string[] = [];
  const statements: string[] = [];
  const sqlite = openSqliteSource({
    dependencyCapability: CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
    organizationDefaultLimits: ORGANIZATION_LIMITS,
    logger: {
      logQuery: (statement) => {
        statements.push(statement);
      },
    },
    onFanoutCapture: (organizationId) => {
      captures.push(organizationId);
      statements.push('-- import capture');
    },
  });
  opened.push({ sqlite, directory });
  for (const id of [ACTOR, 'other-owner'])
    await sqlite.stores.users.create({ id, username: id, passwordHash: 'x', createdAt: 1 }, STAMP);
  sqlite.db.run(
    sql`INSERT INTO organization (id,name,created_at) VALUES ('org-a','A',1),('org-b','B',1)`,
  );
  seedPackageParent(path, 'org-a', 'fixture-project-a');
  seedPackageParent(path, 'org-a', 'fixture-project-remote');
  seedPackageParent(path, 'org-b', 'fixture-project-b');
  sqlite.db.run(
    sql`INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a',${ACTOR},'member',1),('org-a','other-owner','member',1),('org-b','other-owner','member',1)`,
  );
  sqlite.db.run(
    sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('import-authority','org-a','organization','org-a','user',${ACTOR},'org-admin','route',1),('import-remote','org-a','work_package','remote','user',${ACTOR},'package-contributor','route',1)`,
  );
  sqlite.db.run(
    sql`UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1`,
  );
  await defineProjectStep(sqlite, 'org-a', 'fixture-project-a', {
    id: 'import-qa',
    name: 'QA',
    code: 'qa',
  });
  for (const [id, organizationId, projectId] of [
    ['remote', 'org-a', 'fixture-project-remote'],
    ['foreign', 'org-b', 'fixture-project-b'],
  ] as const) {
    await sqlite.stores.workPackages.createInOrganization(
      workPackageRow({
        id,
        name: `Renamed ${id}`,
        abbreviation: id === 'remote' ? 'REM' : 'FOR',
        projectId,
        restricted: true,
        startDate: '2026-09-14',
      }),
      [],
      { at: 1, by: 'other-owner' },
      organizationId,
      { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
    );
    await defineProjectStep(sqlite, organizationId, projectId, {
      id: `${id}-step`,
      name: 'Build',
      code: 'impl',
    });
    await sqlite.stores.workItems.insert(
      workItemRow({ id: `${id}-parent`, workPackageId: id, name: 'Parent' }),
      [],
      { at: 1, by: 'other-owner' },
    );
    await sqlite.stores.workItems.insert(
      workItemRow({
        id: `${id}-leaf`,
        workPackageId: id,
        parentId: `${id}-parent`,
        name: 'Renamed leaf',
      }),
      [],
      { at: 1, by: 'other-owner' },
    );
  }
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  const announcements = recordingBroadcaster();
  const delivered: CommittedWorkPackageEvent[] = [];
  const deliveryWorkPackageCounts: number[] = [];
  let next = 0;
  const clock = clockOf({ now: () => STAMP.at, newId: () => `import-${String(++next)}` });
  const requirements = {
    commandAccess: new SqliteCommandAccess(
      sqlite.db,
      new SqliteOrganizationAccess(
        sqlite.db,
        () => Promise.resolve('org-a'),
        () => STAMP.at,
      ),
      new MachineCredentialRepository(sqlite.db, sqlite.gate),
    ),
    clock,
    scheduler: fastScheduler,
    uow: source.uow,
    announcements,
    externalDependencies: authoring as { state: 'active' | 'inactive' },
    committedFanout: {
      now: () => STAMP.at,
      deliverCommitted: async (events: readonly CommittedWorkPackageEvent[]) => {
        // A production writer must have released before transport can admit another turn.
        await source.uow.run(async (scope) => {
          deliveryWorkPackageCounts.push((await scope.stores.workPackages.list()).length);
          return { commit: true, value: undefined };
        });
        delivered.push(...events);
      },
    },
    batchServices: (scope: Scope, broadcast: Broadcaster) =>
      servicesOver(scope.stores, {
        dependencyContext: createLocalDependencyContext(scope.stores),
        admission: LEGACY_EDIT_ADMISSION,
        clock,
        broadcast,
        scheduler: fastScheduler,
        schedulerMode: 'capture',
      }),
  };
  return {
    sqlite,
    path,
    source,
    captures,
    statements,
    announcements,
    delivered,
    deliveryWorkPackageCounts,
    requirements,
    imports: () => createImportService(requirements),
  };
}

async function assertRefused(
  fixture: Awaited<ReturnType<typeof harness>>,
  document: PlanDocumentImport,
  expected: { code: string; path: string; detail: string | null },
) {
  const before = snapshotTables(fixture.sqlite);
  const beforeStatements = fixture.statements.length;
  expect(
    await fixture
      .imports()
      .import(
        document,
        { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
        'fixture-project-a',
      ),
  ).toMatchObject({
    ok: false,
    ...expected,
  });
  expect(snapshotTables(fixture.sqlite)).toEqual(before);
  expect(fixture.announcements.published).toEqual([]);
  expect(fixture.delivered).toEqual([]);
  expect(
    fixture.statements
      .slice(beforeStatements)
      .filter((statement) =>
        /^insert into "(?:typed_dependency|external_dependency)"/i.test(statement),
      ),
  ).toEqual([]);
}

describe('scoped import dependency admission', () => {
  it.each<ScopedDependencyEndpoint>([
    { scope: 'whole', workPackageId: 'remote', workItemId: 'remote-leaf' },
    { scope: 'node', workPackageId: 'remote', workItemId: 'remote-leaf', stepId: 'remote-step' },
    {
      scope: 'descendant-step',
      workPackageId: 'remote',
      workItemId: 'remote-parent',
      stepId: 'remote-step',
    },
  ])(
    'persists a restricted readable predecessor with current stable identity: %j',
    async (endpoint) => {
      const fixture = await harness();
      const document = documentFixture();
      document.typedDependencies[1] = externalRelationship(endpoint);
      const original = await fixture.source.stores.workItems.listByWorkPackage('remote');
      const workPackageBefore = await fixture.source.stores.workPackages.findById('remote');
      const stepsBefore = await fixture.source.stores.workPackages.stepsOf('remote');
      const imported = await fixture
        .imports()
        .import(
          document,
          { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
          'fixture-project-a',
        );
      expect(imported.ok).toBe(true);
      if (!imported.ok) throw new Error(`import refused: ${JSON.stringify(imported)}`);
      const stored = await fixture.source.stores.typedDependencies.listByWorkPackage(
        imported.workPackageId,
      );
      expect(stored).toHaveLength(2);
      expect(
        stored.find(({ predecessor }) => predecessor.workPackageId === 'remote')?.predecessor,
      ).toEqual(endpoint);
      expect(stored.every(({ id }) => id !== 'local' && id !== 'external')).toBe(true);
      expect(await fixture.source.stores.workItems.listByWorkPackage('remote')).toEqual(
        original.map((row) => ({
          ...row,
          revision: row.revision + (row.id === endpoint.workItemId ? 1 : 0),
        })),
      );
      const audit = fixture.sqlite.db.get<{
        created_at: number;
        updated_at: number;
        created_by: string;
      }>(
        sql`SELECT created_at,updated_at,created_by FROM work_item WHERE id=${endpoint.workItemId}`,
      );
      expect(audit).toEqual({ created_at: 1, updated_at: STAMP.at, created_by: 'other-owner' });
      expect(await fixture.source.stores.workPackages.findById('remote')).toEqual(
        workPackageBefore,
      );
      expect(await fixture.source.stores.workPackages.stepsOf('remote')).toEqual(stepsBefore);
      expect(fixture.captures).toEqual(['org-a', 'org-a']);
      expect(
        fixture.announcements.published.some(({ event }) => event.type === 'tree_replaced'),
      ).toBe(true);
      expect(fixture.delivered.length).toBeGreaterThan(0);
      expect(fixture.deliveryWorkPackageCounts.every((count) => count === 3)).toBe(true);
      for (const table of ['command_journal', 'plan_event', 'saved_plan'])
        expect(
          fixture.sqlite.db.get<{ count: number }>(
            sql.raw(`SELECT count(*) as count FROM ${table}`),
          ),
        ).toEqual({ count: 0 });
    },
  );

  it.each<ScopedDependencyEndpoint>([
    { scope: 'whole', workPackageId: 'missing', workItemId: 'remote-leaf' },
    { scope: 'whole', workPackageId: 'foreign', workItemId: 'foreign-leaf' },
    { scope: 'whole', workPackageId: 'remote', workItemId: 'missing' },
    { scope: 'whole', workPackageId: 'remote', workItemId: 'foreign-leaf' },
    { scope: 'node', workPackageId: 'remote', workItemId: 'remote-leaf', stepId: 'missing' },
    { scope: 'node', workPackageId: 'remote', workItemId: 'remote-leaf', stepId: 'foreign-step' },
  ])('conceals an absent or foreign endpoint and rolls back every table: %j', async (endpoint) => {
    const fixture = await harness();
    const document = documentFixture();
    document.typedDependencies[1] = externalRelationship(endpoint);
    await assertRefused(fixture, document, {
      code: 'unknown_ref',
      path: 'typedDependencies[1].predecessor',
      detail: null,
    });
  });

  it.each([
    ['node', 'remote-parent', 'node_on_parent'],
    ['descendant-step', 'remote-leaf', 'descendant_step_on_leaf'],
  ] as const)('models invalid shape %s on %s', async (scope, workItemId, detail) => {
    const fixture = await harness();
    const document = documentFixture();
    document.typedDependencies[1] = externalRelationship({
      scope,
      workItemId,
      workPackageId: 'remote',
      stepId: 'remote-step',
    });
    await assertRefused(fixture, document, {
      code: 'invalid_typed_dependency',
      path: 'typedDependencies[1].predecessor',
      detail,
    });
  });

  it('uses an explicit destination instead of the valid original or reused descriptive address', async () => {
    const fixture = await harness();
    const document = documentFixture();
    document.externalMappings = [
      {
        source: { scope: 'whole', workPackageId: 'remote', workItemId: 'remote-leaf' },
        destination: { scope: 'whole', workPackageId: 'remote', workItemId: 'remote-parent' },
      },
    ];
    const imported = await fixture
      .imports()
      .import(
        document,
        { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
        'fixture-project-a',
      );
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error('mapped import refused');
    expect(
      (
        await fixture.source.stores.typedDependencies.listByWorkPackage(imported.workPackageId)
      ).find(({ predecessor }) => predecessor.workPackageId === 'remote')?.predecessor.workItemId,
    ).toBe('remote-parent');
  });

  it('refuses an invalid selected mapping without falling back to the valid original', async () => {
    const fixture = await harness();
    const document = documentFixture();
    document.externalMappings = [
      {
        source: { scope: 'whole', workPackageId: 'remote', workItemId: 'remote-leaf' },
        destination: { scope: 'whole', workPackageId: 'remote', workItemId: 'absent' },
      },
    ];
    await assertRefused(fixture, document, {
      code: 'unknown_ref',
      path: 'typedDependencies[1].predecessor',
      detail: null,
    });
  });

  it('persists a mapping to an allocated local endpoint in local relationship storage', async () => {
    const fixture = await harness();
    const document = documentFixture();
    const external = externalRelationship();
    document.typedDependencies[1] = {
      ...external,
      type: 'SS',
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-b' },
    };
    document.externalMappings = [
      {
        source: { scope: 'whole', workPackageId: 'remote', workItemId: 'remote-leaf' },
        destination: {
          scope: 'whole',
          workPackageId: ALLOCATION.packageId,
          workItemId: ALLOCATION.firstRow,
        },
      },
    ];
    const imported = await fixture
      .imports()
      .import(
        document,
        { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
        'fixture-project-a',
      );
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error('allocated local mapping refused');
    expect(imported.workPackageId).toBe(ALLOCATION.packageId);
    expect(
      await fixture.source.stores.typedDependencies.listByWorkPackage(imported.workPackageId),
    ).toHaveLength(2);
    expect(
      fixture.sqlite.db.get<{ count: number }>(
        sql`SELECT count(*) as count FROM typed_dependency WHERE work_package_id=${imported.workPackageId}`,
      ),
    ).toEqual({ count: 2 });
    expect(
      fixture.sqlite.db.get<{ count: number }>(
        sql`SELECT count(*) as count FROM external_dependency WHERE successor_work_package_id=${imported.workPackageId}`,
      ),
    ).toEqual({ count: 0 });
  });

  it('refuses the full post-allocation duplicate with its original declaration path', async () => {
    const fixture = await harness();
    const document = documentFixture();
    const external = document.typedDependencies.at(1);
    if (external === undefined) throw new Error('fixture lost external relationship');
    document.typedDependencies[1] = {
      ...external,
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-b' },
    };
    document.externalMappings = [
      {
        source: { scope: 'whole', workPackageId: 'remote', workItemId: 'remote-leaf' },
        destination: {
          scope: 'whole',
          workPackageId: ALLOCATION.packageId,
          workItemId: ALLOCATION.firstRow,
        },
      },
    ];
    await assertRefused(fixture, document, {
      code: 'invalid_typed_dependency',
      path: 'typedDependencies[1]',
      detail: 'duplicate',
    });
  });

  it('refuses a reverse mapping cycle against the entire proposed typed set', async () => {
    const fixture = await harness();
    const document = documentFixture();
    document.externalMappings = [
      {
        source: { scope: 'whole', workPackageId: 'remote', workItemId: 'remote-leaf' },
        destination: {
          scope: 'whole',
          workPackageId: ALLOCATION.packageId,
          workItemId: ALLOCATION.secondRow,
        },
      },
    ];
    await assertRefused(fixture, document, {
      code: 'invalid_typed_dependency',
      path: 'typedDependencies[1]',
      detail: 'cycle',
    });
  });

  it('refuses explicit legacy after activation before active authoring', async () => {
    const fixture = await harness();
    const before = snapshotTables(fixture.sqlite);
    expect(
      await fixture
        .imports()
        .import(documentFixture(), { kind: 'legacy', actorId: ACTOR }, 'fixture-project-a'),
    ).toMatchObject({
      ok: false,
      refusal: 'no_active_organization',
    });
    expect(snapshotTables(fixture.sqlite)).toEqual(before);
    expect(fixture.announcements.published).toEqual([]);
  });

  it('keeps explicit inactive capability dormant despite seeded storage authority', async () => {
    const fixture = await harness(INACTIVE_EXTERNAL_DEPENDENCIES);
    await assertRefused(fixture, documentFixture(), {
      code: 'external_dependencies_inactive',
      path: 'typedDependencies[1]',
      detail: null,
    });
  });

  it.each([null, {}, { state: 'enabled' }])(
    'throws for malformed required authoring capability %j',
    async (capability) => {
      const fixture = await harness(capability);
      expect(() => fixture.imports()).toThrow();
    },
  );
});

function deferred() {
  let release: () => void = () => {
    throw new Error('deferred is not initialized');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function failureOf(pending: Promise<unknown>): Promise<Error> {
  const failure: unknown = await pending.catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('expected a thrown production fault');
  return failure;
}

describe('scoped import transaction lifetime and effects', () => {
  it('forwards fresh access to capture, callback, resource and dependency context in the admitted writer', async () => {
    const fixture = await harness();
    const expected = { ...ACCESS, scope: { ...ACCESS.scope, cap: CONTRIBUTOR_CAP } };
    const observations: unknown[] = [];
    const Resource = ImportedPlanResource;
    // Bun wraps constructors at runtime; its mockImplementation type only accepts callables.
    (
      spyOn(importedPlans, 'ImportedPlanResource') as unknown as {
        mockImplementation: (
          construct: (...args: ConstructorParameters<typeof Resource>) => ImportedPlanResource,
        ) => unknown;
      }
    ).mockImplementation((...args: ConstructorParameters<typeof Resource>) => {
      observations.push(args[1].access);
      return new Resource(...args);
    });
    const contextFor = dependencyContexts.createDependencyContext;
    spyOn(dependencyContexts, 'createDependencyContext').mockImplementation((...args) => {
      observations.push(args[1].access);
      return contextFor(...args);
    });
    const create = Reflect.get(Resource.prototype, 'createWorkPackage');
    spyOn(Resource.prototype, 'createWorkPackage').mockImplementation(function (
      this: ImportedPlanResource,
      ...args
    ) {
      observations.push(args[2]);
      return create.apply(this, args);
    });
    const requirements = fixture.requirements;
    const start = fixture.statements.length;
    const imports = createImportService({
      ...requirements,
      uow: {
        run: (act) =>
          requirements.uow.run(async (scope) => {
            const capture = scope.fanoutCapture;
            if (capture?.authorizeImport === undefined)
              throw new Error('fixture lacks import capture');
            const authorize = capture.authorizeImport.bind(capture);
            return act({
              ...scope,
              fanoutCapture: {
                ...capture,
                authorizeImport: (actor, access, project) => {
                  observations.push(access);
                  return authorize(actor, access, project);
                },
              },
            });
          }),
      },
    });
    expect(
      await imports.import(
        documentFixture(),
        {
          kind: 'human',
          principal: PRINCIPAL,
          expectedAccess: expected,
        },
        'fixture-project-a',
      ),
    ).toMatchObject({ ok: true });
    expect(observations.length).toBeGreaterThanOrEqual(4);
    for (const observed of observations) expect(observed).toEqual(ACCESS);
    const statements = fixture.statements.slice(start);
    const begin = statements.findIndex((statement) => /^begin immediate/i.test(statement));
    const membership = statements.findIndex((statement) =>
      /select.*organization_membership/i.test(statement),
    );
    const insert = statements.findIndex((statement) =>
      /^insert into "work_package"/i.test(statement),
    );
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(membership).toBeGreaterThan(begin);
    expect(insert).toBeGreaterThan(membership);
  });

  it('reads machine authority after BEGIN and observes second-connection revocation before active endpoint admission', async () => {
    const fixture = await harness();
    fixture.sqlite.db.run(
      sql`INSERT INTO person (id,name,kind,account_id) VALUES ('agent','Agent','agent',${ACTOR})`,
    );
    fixture.sqlite.db.run(
      sql`INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('agent','org-a','Agent')`,
    );
    const credentialId = crypto.randomUUID();
    fixture.sqlite.db.run(
      sql`INSERT INTO machine_credential (id,organization_id,person_id,issued_by,source,name,created_at,created_by) VALUES (${credentialId},'org-a','agent',${ACTOR},'api_key','Agent',1,${ACTOR})`,
    );
    fixture.sqlite.db.run(
      sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('machine-import-cap','org-a','organization','org-a','machine_credential',${credentialId},'org-admin','route',1)`,
    );
    const principal = {
      ...PRINCIPAL,
      authentication: { kind: 'machine' as const, credentialId, personId: 'agent' },
      delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' as const },
    };
    const caller = {
      kind: 'human' as const,
      principal,
      expectedAccess: { ...ACCESS, scope: { ...ACCESS.scope, cap: CONTRIBUTOR_CAP } },
    };
    const start = fixture.statements.length;
    expect(
      await fixture.imports().import(documentFixture(), caller, 'fixture-project-a'),
    ).toMatchObject({
      ok: false,
      code: 'forbidden',
      permission: 'project.manage_packages',
    });
    const statements = fixture.statements.slice(start);
    const begin = statements.findIndex((statement) => /^begin immediate/i.test(statement));
    const credential = statements.findIndex((statement) =>
      /select.*from "machine_credential"/i.test(statement),
    );
    const member = statements.findIndex((statement) =>
      /\bfrom\s+"?organization_membership\b/i.test(statement),
    );
    const capture = statements.indexOf('-- import capture');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(credential).toBeGreaterThan(begin);
    expect(member).toBeGreaterThan(credential);
    expect(capture).toBe(-1);
    const admitted = deferred();
    const release = deferred();
    const attempted = deferred();
    const held = fixture.sqlite.gate.enter(async () => {
      admitted.release();
      await release.promise;
    });
    await admitted.promise;
    const imports = createImportService({
      ...fixture.requirements,
      uow: {
        run: (act) => {
          attempted.release();
          return fixture.requirements.uow.run(act);
        },
      },
    });
    const pending = imports.import(documentFixture(), caller, 'fixture-project-a');
    await attempted.promise;
    const peer = openDatabase(fixture.path);
    try {
      peer.run('UPDATE machine_credential SET revoked_at=1 WHERE id=?', [credentialId]);
      const before = snapshotTables(fixture.sqlite);
      const captures = fixture.captures.length;
      release.release();
      await held;
      expect(await pending).toEqual({ ok: false, refusal: 'organization_context_changed' });
      expect(snapshotTables(fixture.sqlite)).toEqual(before);
      expect(fixture.captures.length).toBe(captures);
    } finally {
      release.release();
      await held;
      peer.close();
    }
  });

  it('requires the authoring capability even for an otherwise complete source', async () => {
    const fixture = await harness();
    const requirements = { ...fixture.requirements, externalDependencies: undefined };
    expect(() =>
      createImportService(requirements as unknown as Parameters<typeof createImportService>[0]),
    ).toThrow('capability is missing');
  });

  it('rechecks membership after queuing and before either capture or writes', async () => {
    const fixture = await harness();
    const admitted = deferred();
    const release = deferred();
    let before: ReturnType<typeof snapshotTables> | undefined;
    const holding = fixture.source.uow.run(async () => {
      admitted.release();
      await release.promise;
      fixture.sqlite.db.run(
        sql`DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id=${ACTOR}`,
      );
      before = snapshotTables(fixture.sqlite);
      return { commit: true, value: undefined };
    });
    await admitted.promise;
    const importing = fixture
      .imports()
      .import(
        documentFixture(),
        { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
        'fixture-project-a',
      );
    release.release();
    await holding;
    expect(await importing).toEqual({ ok: false, refusal: 'not_a_member' });
    if (before === undefined) throw new Error('queued writer did not capture its revoked state');
    expect(snapshotTables(fixture.sqlite)).toEqual(before);
    expect(fixture.captures).toEqual([]);
    expect(fixture.announcements.published).toEqual([]);
    expect(fixture.delivered).toEqual([]);
  });

  it('retains multiple FS SS FF tuples alongside local typed and legacy reach', async () => {
    const fixture = await harness();
    const document = documentFixture();
    const row = document.workItems.at(1);
    if (row === undefined) throw new Error('fixture lost its successor');
    row.dependsOn = ['row-a'];
    const external = externalRelationship();
    document.typedDependencies.push(
      { ...external, id: 'ss', type: 'SS' },
      { ...external, id: 'ff', type: 'FF' },
    );
    const imported = await fixture
      .imports()
      .import(
        document,
        { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
        'fixture-project-a',
      );
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error('mixed import refused');
    expect(
      (await fixture.source.stores.typedDependencies.listByWorkPackage(imported.workPackageId))
        .map(({ type }) => type)
        .sort(),
    ).toEqual(['FF', 'FS', 'FS', 'SS']);
    expect(
      await fixture.source.stores.dependencies.listByWorkPackage(imported.workPackageId),
    ).toHaveLength(1);
    expect(await fixture.source.stores.typedDependencies.listByWorkPackage('remote')).toEqual([]);
  });

  it('rejects trusted-corruption setup in the selected external connected component', async () => {
    const fixture = await harness();
    await fixture.source.stores.typedDependencies.add(
      {
        id: 'corrupt-self-node',
        workPackageId: 'remote',
        type: 'SS',
        predecessor: {
          scope: 'node',
          workPackageId: 'remote',
          workItemId: 'remote-leaf',
          stepId: 'remote-step',
        },
        successor: {
          scope: 'node',
          workPackageId: 'remote',
          workItemId: 'remote-leaf',
          stepId: 'remote-step',
        },
      },
      STAMP,
    );
    await assertRefused(fixture, documentFixture(), {
      code: 'invalid_typed_dependency',
      path: 'typedDependencies[1]',
      detail: 'self_node',
    });
  });

  it('identifies the later external declaration whose existing component is corrupt', async () => {
    const fixture = await harness();
    await fixture.source.stores.workPackages.createInOrganization(
      workPackageRow({
        id: 'clean',
        name: 'Clean',
        abbreviation: 'CLN',
        projectId: 'fixture-project-a',
        startDate: '2026-09-14',
      }),
      [],
      { ...STAMP, by: 'other-owner' },
      'org-a',
      { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
    );
    await fixture.source.stores.workItems.insert(
      workItemRow({ id: 'clean-leaf', workPackageId: 'clean' }),
      [],
      STAMP,
    );
    await fixture.source.stores.typedDependencies.add(
      {
        id: 'corrupt-self-node',
        workPackageId: 'remote',
        type: 'SS',
        predecessor: {
          scope: 'node',
          workPackageId: 'remote',
          workItemId: 'remote-leaf',
          stepId: 'remote-step',
        },
        successor: {
          scope: 'node',
          workPackageId: 'remote',
          workItemId: 'remote-leaf',
          stepId: 'remote-step',
        },
      },
      STAMP,
    );
    const document = documentFixture();
    document.typedDependencies.splice(1, 0, {
      ...externalRelationship({ scope: 'whole', workPackageId: 'clean', workItemId: 'clean-leaf' }),
      id: 'clean-component',
    });
    await assertRefused(fixture, document, {
      code: 'invalid_typed_dependency',
      path: 'typedDependencies[2]',
      detail: 'self_node',
    });
  });

  it('throws if remote persistence bypasses the declaration authoring gate', async () => {
    const fixture = await harness(INACTIVE_EXTERNAL_DEPENDENCIES);
    const before = snapshotTables(fixture.sqlite);
    spyOn(ImportedPlanResource.prototype, 'checkExternalAuthoring').mockImplementationOnce(
      () => null,
    );
    const failure = await failureOf(
      fixture
        .imports()
        .import(
          documentFixture(),
          { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
          'fixture-project-a',
        ),
    );
    expect(failure.message).toContain('bypassed authoring admission');
    expect(snapshotTables(fixture.sqlite)).toEqual(before);
    expect(fixture.announcements.published).toEqual([]);
  });

  for (const fault of ['relationship-throw', 'label-refusal'] as const) {
    it(`rolls back remote revisions and every table after staged external links: ${fault}`, async () => {
      const fixture = await harness();
      const before = snapshotTables(fixture.sqlite);
      let writes = 0;
      // The real store must stage both relationships before this injected boundary fails.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const add = TypedDependencyRepository.prototype.add;
      spyOn(TypedDependencyRepository.prototype, 'add').mockImplementation(async function (
        this: TypedDependencyRepository,
        ...args
      ) {
        await add.call(this, ...args);
        writes++;
        if (fault === 'relationship-throw' && writes === 2)
          throw new Error('after actual external write');
      });
      if (fault === 'label-refusal')
        spyOn(WorkItemRepository.prototype, 'patch').mockResolvedValue({
          ok: false,
          reason: 'unknown_tag',
        });
      const document = documentFixture();
      const populated = planDocumentFixture();
      const template = populated.workItems.at(0);
      if (template === undefined) throw new Error('populated fixture lost its row');
      document.directory = populated.directory;
      document.capacity = populated.capacity;
      document.calendarMarkers = populated.calendarMarkers;
      for (const row of document.workItems) {
        const { id, name, position, parentId } = row;
        Object.assign(row, structuredClone(template), {
          id,
          name,
          position,
          parentId,
          deadline: null,
          externalRefs: [],
        });
      }
      const successor = document.workItems.at(1);
      if (successor === undefined) throw new Error('populated fixture lost its successor');
      successor.dependsOn = ['row-a'];
      const importing = fixture
        .imports()
        .import(
          document,
          { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
          'fixture-project-a',
        );
      if (fault === 'relationship-throw')
        expect((await failureOf(importing)).message).toBe('after actual external write');
      else
        expect(await importing).toMatchObject({
          ok: false,
          code: 'source_refused',
          detail: 'unknown_tag',
        });
      expect(writes).toBe(2);
      expect(snapshotTables(fixture.sqlite)).toEqual(before);
      expect(fixture.announcements.published).toEqual([]);
      expect(fixture.delivered).toEqual([]);
    });
  }

  for (const settlement of ['success', 'refusal', 'throw'] as const) {
    it(`expires retained resource and dependency evidence after ${settlement}`, async () => {
      const fixture = await harness();
      let retained: ImportedPlanResource | undefined;
      const contexts: ReturnType<typeof dependencyContexts.createDependencyContext>[] = [];

      const create = Reflect.get(ImportedPlanResource.prototype, 'createWorkPackage');
      spyOn(ImportedPlanResource.prototype, 'createWorkPackage').mockImplementation(function (
        this: ImportedPlanResource,
        ...args
      ) {
        // Retain the actual production resource to exercise closure after settlement.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        retained = this;
        return create.call(this, ...args);
      });
      const open = dependencyContexts.createDependencyContext;
      spyOn(dependencyContexts, 'createDependencyContext').mockImplementation((...args) => {
        const context = open(...args);
        contexts.push(context);
        return context;
      });
      const document = documentFixture();
      if (settlement === 'refusal')
        document.typedDependencies[1] = externalRelationship({
          scope: 'whole',
          workPackageId: 'remote',
          workItemId: 'absent',
        });
      if (settlement === 'throw')
        spyOn(WorkItemRepository.prototype, 'patch').mockRejectedValue(
          new Error('selected settlement throw'),
        );
      const importing = fixture
        .imports()
        .import(
          document,
          { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
          'fixture-project-a',
        );
      if (settlement === 'throw')
        expect((await failureOf(importing)).message).toBe('selected settlement throw');
      else expect((await importing).ok).toBe(settlement === 'success');
      if (retained === undefined) throw new Error('production resource was not retained');
      const resource = retained;
      expect(() => resource.checkExternalAuthoring('typedDependencies[1]')).toThrow('closed');
      expect((await failureOf(resource.isSolutionSlugHeld('absent', ACCESS))).message).toContain(
        'closed',
      );
      expect(
        (await failureOf(resource.refuseCapacityWithin(ACCESS, 'import-1', 'resource-1', 1)))
          .message,
      ).toContain('closed');
      expect(
        (
          await failureOf(
            resource.refuseCapacityWithin({ kind: 'legacy' }, 'import-1', 'resource-1', 1),
          )
        ).message,
      ).toContain('closed');
      expect(contexts).toHaveLength(1);
      for (const context of contexts)
        expect(() => {
          context.context.assertUsable('import-1', ACTOR);
        }).toThrow('closed');
    });
  }

  it('rejects a refused endpoint read suspended across import observation closure', async () => {
    const fixture = await harness();
    const paused = deferred();
    const release = deferred();
    let suspended: Promise<Error> | undefined;
    let intercept = true;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const find = WorkPackageRepository.prototype.findInOrganization;
    spyOn(WorkPackageRepository.prototype, 'findInOrganization').mockImplementation(async function (
      this: WorkPackageRepository,
      ...args
    ) {
      const workPackage = await find.call(this, ...args);
      if (intercept && args[0] === 'absent') {
        intercept = false;
        paused.release();
        await release.promise;
      }
      return workPackage;
    });
    const open = dependencyContexts.createDependencyContext;
    spyOn(dependencyContexts, 'createDependencyContext').mockImplementation((...args) => {
      const opened = open(...args);
      suspended = failureOf(
        opened.context.endpoints.readEndpoint({
          scope: 'whole',
          workPackageId: 'absent',
          workItemId: 'absent-row',
        }),
      );
      return opened;
    });
    const importing = fixture
      .imports()
      .import(
        documentFixture(),
        { kind: 'human', principal: PRINCIPAL, expectedAccess: ACCESS },
        'fixture-project-a',
      );
    await paused.promise;
    expect((await importing).ok).toBe(true);
    release.release();
    if (suspended === undefined) throw new Error('endpoint read was never suspended');
    expect((await suspended).message).toContain('closed');
  });

  it.each(['owner', 'actor', 'relationship-owner', 'successor-owner'] as const)(
    'rejects a forged trusted %s at the private admission boundary',
    async (fault) => {
      const fixture = await harness();
      const before = snapshotTables(fixture.sqlite);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const write = ImportedPlanResource.prototype.writeDependencies;
      spyOn(ImportedPlanResource.prototype, 'writeDependencies').mockImplementation(function (
        this: ImportedPlanResource,
        workPackageId,
        located,
        stamp,
      ) {
        return write.call(
          this,
          fault === 'owner' ? 'remote' : workPackageId,
          fault === 'successor-owner'
            ? located.map((declaration) => ({
                ...declaration,
                relationship: {
                  ...declaration.relationship,
                  successor: { ...declaration.relationship.successor, workPackageId: 'remote' },
                },
              }))
            : fault === 'relationship-owner'
              ? located.map((declaration) => ({
                  ...declaration,
                  relationship: { ...declaration.relationship, workPackageId: 'remote' },
                }))
              : located,
          fault === 'actor' ? { ...stamp, by: 'other-owner' } : stamp,
        );
      });
      expect(
        (
          await failureOf(
            fixture.imports().import(
              documentFixture(),
              {
                kind: 'human',
                principal: PRINCIPAL,
                expectedAccess: ACCESS,
              },
              'fixture-project-a',
            ),
          )
        ).message,
      ).toBe(
        fault === 'relationship-owner' || fault === 'successor-owner'
          ? 'import relationship owner mismatch'
          : 'import dependency owner or actor mismatch',
      );
      expect(snapshotTables(fixture.sqlite)).toEqual(before);
      expect(fixture.announcements.published).toEqual([]);
    },
  );
});
