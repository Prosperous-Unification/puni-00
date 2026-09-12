import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  brokenSource,
  type CaseFixture,
  type CaseId,
  createFaultControl,
  defineFault,
  DETERMINISTIC_SEED,
  type ExistingStoreOpeners,
  existingStoreRegistrations,
  type Fault,
  type FaultProof,
  type FaultRun,
  recordFaultProof,
  replaceMethod,
  runCases,
  SOURCE_CONFORMANCE_CASES,
  type SourceReaders,
} from '@wbs/conformance';
import type { TransactionalStores, User } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { DEFAULT_ESTIMATE_RULE } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';
import { asc, eq, sql } from 'drizzle-orm';

import { runMigrations } from '../migrate';
import {
  actual as actualTable,
  calendarMarker as markerTable,
  stepMeasure as measureTable,
  users as userTable,
} from '../schema';
import { openSqliteSource, type OpenSqliteSourceOptions, type SqliteSource } from '../source';

const MIGRATIONS = new URL('../../../../apps/be-01/drizzle', import.meta.url).pathname;
type ExistingFamily = keyof ExistingStoreOpeners;
type OpenSource = (options: OpenSqliteSourceOptions) => SqliteSource;

async function closeSqliteResources(
  source: SqliteSource | undefined,
  directory: string,
): Promise<void> {
  let didCloseFail = false;
  let closeFailure: unknown;
  if (source !== undefined) {
    try {
      await source.close();
    } catch (failure) {
      didCloseFail = true;
      closeFailure = failure;
    }
  }

  let didRemoveFail = false;
  let removeFailure: unknown;
  try {
    rmSync(directory, { recursive: true, force: true });
  } catch (failure) {
    didRemoveFail = true;
    removeFailure = failure;
  }

  if (didCloseFail && didRemoveFail) {
    throw new AggregateError(
      [closeFailure, removeFailure],
      'SQLite conformance source close and directory removal failed',
      { cause: closeFailure },
    );
  }
  if (didCloseFail) throw closeFailure;
  if (didRemoveFail) throw removeFailure;
}

async function throwAfterCleanup(
  setupFailure: unknown,
  source: SqliteSource | undefined,
  directory: string,
): Promise<never> {
  try {
    await closeSqliteResources(source, directory);
  } catch (cleanupFailure) {
    throw new AggregateError(
      [setupFailure, cleanupFailure],
      'SQLite conformance setup and cleanup failed',
      { cause: cleanupFailure },
    );
  }
  throw setupFailure;
}

function readersOf(source: SqliteSource): SourceReaders {
  return {
    projects: source.stores.projects,
    workItems: source.stores.workItems,
    steps: source.stores.steps,
    estimates: source.stores.estimates,
    actuals: source.stores.actuals,
    measures: source.stores.measures,
    progress: source.stores.progress,
    dependencies: source.stores.dependencies,
    directory: source.stores.directory,
    journal: source.stores.journal,
    planEvents: source.stores.planEvents,
    savedPlans: source.history.savedPlans,
  };
}

async function seedSqliteSource(openSource: OpenSource = openSqliteSource): Promise<{
  readonly source: SqliteSource;
  readonly directory: string;
}> {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-sqlite-conformance-'));
  let source: SqliteSource | undefined;
  try {
    const dbPath = join(directory, 'source.db');
    runMigrations(dbPath, MIGRATIONS);
    source = openSource({ dbPath });
    const seed = DETERMINISTIC_SEED;
    for (const [index, ownerId] of seed.ownerIds.entries()) {
      const stamp = seed.stamps[index] ?? seed.stamps[0];
      const projectId = seed.projectIds[index] ?? seed.projectIds[0];
      const stepIds = seed.stepIds[index] ?? seed.stepIds[0];
      await source.stores.users.create(
        {
          id: ownerId,
          username: `owner-${String(index + 1)}`,
          passwordHash: 'x',
          createdAt: stamp.at,
        },
        stamp,
      );
      await source.stores.projects.create(
        {
          id: projectId,
          ownerId,
          name: `Project ${String(index + 1)}`,
          restricted: false,
          estimateMethod: 'pert',
          depReach: 'whole-item',
          pertWeights: DEFAULT_ESTIMATE_RULE.pertWeights,
          estimateRounding: DEFAULT_ESTIMATE_RULE.rounding,
          startDate: null,
          solutionRef: null,
          revision: 0,
          createdAt: stamp.at,
          optimizationEnabled: false,
          scheduleEngine: 'fast',
          scheduleObjective: 'pri',
        },
        stepIds.map((id, stepIndex) => ({
          id,
          projectId,
          name: stepIndex === 0 ? 'Dev' : 'QA',
          position: (stepIndex + 1) * 10,
        })),
        stamp,
      );
      const workItemIds = seed.workItemIds[index] ?? seed.workItemIds[0];
      for (const [rowIndex, id] of workItemIds.entries()) {
        await source.stores.workItems.insert(
          workItemRow({ id, projectId, name: `Work ${String(rowIndex + 1)}` }),
          [],
          stamp,
        );
      }
    }
    for (const [index, teamId] of seed.teamIds.entries()) {
      await source.stores.directory.addTeam(
        { id: teamId, name: `Team ${String(index + 1)}` },
        seed.stamps[0],
      );
    }
    await source.stores.directory.addTag({ id: seed.tagIds[0], name: 'Tag 1' }, seed.stamps[0]);
    await source.stores.directory.addService(
      { id: seed.serviceIds[0], name: 'Service 1' },
      seed.stamps[0],
    );
    await source.stores.directory.addWorkItemType(
      { id: seed.typeIds[0], name: 'Type 1' },
      seed.stamps[0],
    );
    for (const [index, personId] of seed.personIds.entries()) {
      await source.stores.directory.addPerson(
        { id: personId, name: `Person ${String(index + 1)}` },
        [seed.teamIds[index] ?? seed.teamIds[0]],
        seed.stamps[0],
      );
    }
    await verifySqliteSeed(source);
    return { source, directory };
  } catch (failure) {
    return throwAfterCleanup(failure, source, directory);
  }
}

async function verifySqliteSeed(source: SqliteSource): Promise<void> {
  const seed = DETERMINISTIC_SEED;
  for (const [index, projectId] of seed.projectIds.entries()) {
    const project = await source.stores.projects.findById(projectId);
    expect(project).toMatchObject({
      id: projectId,
      ownerId: seed.ownerIds[index],
      name: `Project ${String(index + 1)}`,
    });
    expect(
      (await source.stores.steps.listByProject(projectId)).map(({ id, name }) => ({ id, name })),
    ).toEqual([
      { id: seed.stepIds[index][0], name: 'Dev' },
      { id: seed.stepIds[index][1], name: 'QA' },
    ]);
    expect((await source.stores.workItems.listByProject(projectId)).map(({ id }) => id)).toEqual([
      ...seed.workItemIds[index],
    ]);
  }
  expect((await source.stores.directory.listTeams()).map(({ id }) => id).sort()).toEqual([
    ...seed.teamIds,
  ]);
  expect((await source.stores.directory.listPeople()).map(({ id }) => id).sort()).toEqual([
    ...seed.personIds,
  ]);
  expect((await source.stores.directory.listTags()).map(({ id }) => id)).toContain(seed.tagIds[0]);
  expect((await source.stores.directory.listServices()).map(({ id }) => id)).toContain(
    seed.serviceIds[0],
  );
  expect((await source.stores.directory.listWorkItemTypes()).map(({ id }) => id)).toContain(
    seed.typeIds[0],
  );
  expect((await source.stores.directory.listExternalSystems()).map(({ id }) => id)).toContain(
    seed.externalSystemIds[0],
  );
}

function sqliteFixture<Family extends ExistingFamily>(
  source: SqliteSource,
  directory: string,
  family: Family,
  caseId: CaseId,
): CaseFixture<TransactionalStores[Family]> {
  return {
    fixtureId: `sqlite:${caseId}`,
    port: source.stores[family],
    seed: DETERMINISTIC_SEED,
    readers: readersOf(source),
    scenario: { kind: 'ordinary' },
    close: () => closeSqliteResources(source, directory),
  };
}

async function openSqliteCase<Family extends ExistingFamily>(
  family: Family,
  caseId: CaseId,
  openSource: OpenSource = openSqliteSource,
): Promise<CaseFixture<TransactionalStores[Family]>> {
  const { source, directory } = await seedSqliteSource(openSource);
  return sqliteFixture(source, directory, family, caseId);
}

const openers: ExistingStoreOpeners = {
  projects: (caseId) => openSqliteCase('projects', caseId),
  users: (caseId) => openSqliteCase('users', caseId),
  capacity: (caseId) => openSqliteCase('capacity', caseId),
  priorityBands: (caseId) => openSqliteCase('priorityBands', caseId),
  calendarMarkers: (caseId) => openSqliteCase('calendarMarkers', caseId),
  workItems: (caseId) => openSqliteCase('workItems', caseId),
  steps: (caseId) => openSqliteCase('steps', caseId),
  estimates: (caseId) => openSqliteCase('estimates', caseId),
  actuals: (caseId) => openSqliteCase('actuals', caseId),
  measures: (caseId) => openSqliteCase('measures', caseId),
  directory: (caseId) => openSqliteCase('directory', caseId),
  eventLog: (caseId) => openSqliteCase('eventLog', caseId),
};

function withStores(source: SqliteSource, stores: Partial<TransactionalStores>): SqliteSource {
  return { ...source, stores: { ...source.stores, ...stores } };
}

const capacityProjectTeamFault = defineFault({
  id: 'break:capacity.set:project-team-key',
  caseId: 'capacity.set:project-team-key',
  createControl: () => createFaultControl('capacity.set:project-team-key'),
  mutate(source: SqliteSource, control) {
    const projectByTeam = new Map<string, string>();
    return withStores(source, {
      capacity: replaceMethod(source.stores.capacity, 'set', (set) => {
        return (projectId, teamId, size, stamp) => {
          const firstProjectId = projectByTeam.get(teamId);
          projectByTeam.set(teamId, firstProjectId ?? projectId);
          return set(
            firstProjectId !== undefined &&
              firstProjectId !== projectId &&
              control.reach('capacity.set:project-team-key')
              ? firstProjectId
              : projectId,
            teamId,
            size,
            stamp,
          );
        };
      }),
    });
  },
});

const capacityClearFault = defineFault({
  id: 'break:capacity.set:clear',
  caseId: 'capacity.set:clear',
  createControl: () => createFaultControl('capacity.set:clear'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      capacity: replaceMethod(source.stores.capacity, 'set', (set) => {
        return async (projectId, teamId, size, stamp) => {
          if (size !== null || !control.reach('capacity.set:clear')) {
            return set(projectId, teamId, size, stamp);
          }
          source.db.run(sql.raw('PRAGMA ignore_check_constraints = ON'));
          try {
            return await set(projectId, teamId, 0, stamp);
          } finally {
            source.db.run(sql.raw('PRAGMA ignore_check_constraints = OFF'));
          }
        };
      }),
    });
  },
});

const capacityMissingReferenceFault = defineFault({
  id: 'break:capacity.set:missing-reference',
  caseId: 'capacity.set:missing-reference',
  createControl: () => createFaultControl('capacity.set:missing-reference'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      capacity: replaceMethod(source.stores.capacity, 'set', (set) => {
        return (projectId, teamId, size, stamp) =>
          control.reach('capacity.set:missing-reference')
            ? set(
                projectId === 'project-missing' ? 'project-a' : projectId,
                teamId === 'team-missing' ? 'team-a' : teamId,
                size,
                stamp,
              )
            : set(projectId, teamId, size, stamp);
      }),
    });
  },
});

const priorityDefaultsFault = defineFault({
  id: 'break:priorityBands.listFor:defaults',
  caseId: 'priorityBands.listFor:defaults',
  createControl: () => createFaultControl('priorityBands.listFor:defaults'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      priorityBands: replaceMethod(source.stores.priorityBands, 'listFor', (listFor) => {
        return async (projectId) => {
          const bands = await listFor(projectId);
          return control.reach('priorityBands.listFor:defaults') ? [] : bands;
        };
      }),
    });
  },
});

const priorityFirstRungFault = defineFault({
  id: 'break:priorityBands.replace:whole-project',
  caseId: 'priorityBands.replace:whole-project',
  createControl: () => createFaultControl('priorityBands.replace:whole-project:first-rung'),
  mutate(source: SqliteSource, control) {
    const replaceCountByProject = new Map<string, number>();
    return withStores(source, {
      priorityBands: replaceMethod(source.stores.priorityBands, 'replace', (replace) => {
        return async (projectId, bands, stamp) => {
          const replaceCount = (replaceCountByProject.get(projectId) ?? 0) + 1;
          replaceCountByProject.set(projectId, replaceCount);
          if (
            replaceCount !== 2 ||
            !control.reach('priorityBands.replace:whole-project:first-rung')
          ) {
            return replace(projectId, bands, stamp);
          }
          const replacement = bands.at(0);
          if (replacement === undefined) throw new Error('replacement ladder has no first band');
          const existing = await source.stores.priorityBands.listFor(projectId);
          return replace(projectId, [replacement, ...existing.slice(1)], stamp);
        };
      }),
    });
  },
});

const priorityProjectScopeFault = defineFault({
  id: 'break:priorityBands.replace:whole-project',
  caseId: 'priorityBands.replace:whole-project',
  createControl: () => createFaultControl('priorityBands.replace:whole-project:project-scope'),
  mutate(source: SqliteSource, control) {
    const replaceCountByProject = new Map<string, number>();
    return withStores(source, {
      priorityBands: replaceMethod(source.stores.priorityBands, 'replace', (replace) => {
        return async (projectId, bands, stamp) => {
          const replaceCount = (replaceCountByProject.get(projectId) ?? 0) + 1;
          replaceCountByProject.set(projectId, replaceCount);
          if (
            replaceCount !== 2 ||
            !control.reach('priorityBands.replace:whole-project:project-scope')
          ) {
            return replace(projectId, bands, stamp);
          }
          source.db.run(
            sql.raw(`CREATE TEMP TRIGGER conformance_priority_band_unscoped_delete
              AFTER DELETE ON project_priority_band
              WHEN OLD.project_id = '${DETERMINISTIC_SEED.projectIds[0]}'
              BEGIN
                DELETE FROM project_priority_band WHERE project_id <> OLD.project_id;
              END`),
          );
          try {
            return await replace(projectId, bands, stamp);
          } finally {
            source.db.run(sql.raw('DROP TRIGGER conformance_priority_band_unscoped_delete'));
          }
        };
      }),
    });
  },
});

const priorityMissingProjectFault = defineFault({
  id: 'break:priorityBands.replace:missing-project',
  caseId: 'priorityBands.replace:missing-project',
  createControl: () => createFaultControl('priorityBands.replace:missing-project'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      priorityBands: replaceMethod(source.stores.priorityBands, 'replace', (replace) => {
        return (projectId, bands, stamp) =>
          replace(
            control.reach('priorityBands.replace:missing-project') ? 'project-a' : projectId,
            bands,
            stamp,
          );
      }),
    });
  },
});

const createUniqueNameFault = defineFault({
  id: 'break:users.create:unique-name',
  caseId: 'users.create:unique-name',
  createControl: () => createFaultControl('users.create:unique-name'),
  mutate(source: SqliteSource, control) {
    const accounts = new Map<string, string>();
    return withStores(source, {
      users: replaceMethod(source.stores.users, 'create', (create) => async (user, stamp) => {
        const existingId = accounts.get(user.username);
        if (existingId !== undefined && control.reach('users.create:unique-name')) {
          source.db.delete(userTable).where(eq(userTable.id, existingId)).run();
        }
        const created = await create(user, stamp);
        if (created !== null) accounts.set(user.username, user.id);
        return created;
      }),
    });
  },
});

function withoutPassword(user: User | null): User | null {
  if (user === null) return null;
  const { passwordHash: _passwordHash, ...incomplete } = user;
  return incomplete as User;
}

const findIdentityFault = defineFault({
  id: 'break:users.find:identity',
  caseId: 'users.find:identity',
  createControl: () => createFaultControl('users.find:identity'),
  mutate(source: SqliteSource, control) {
    const users = replaceMethod(source.stores.users, 'findById', (findById) => async (id) => {
      const user = await findById(id);
      return control.reach('users.find:identity') ? withoutPassword(user) : user;
    });
    return withStores(source, {
      users: replaceMethod(users, 'findByUsername', (findByUsername) => async (username) => {
        const user = await findByUsername(username);
        return control.reach('users.find:identity') ? withoutPassword(user) : user;
      }),
    });
  },
});

const issuerSubjectFault = defineFault({
  id: 'break:users.resolveOidcIdentity:issuer-subject',
  caseId: 'users.resolveOidcIdentity:issuer-subject',
  createControl: () => createFaultControl('users.resolveOidcIdentity:issuer-subject'),
  mutate(source: SqliteSource, control) {
    const issuers = new Map<string, string>();
    return withStores(source, {
      users: replaceMethod(
        source.stores.users,
        'resolveOidcIdentity',
        (resolve) => (identity, create, stamp) => {
          const issuer = issuers.get(identity.subject);
          issuers.set(identity.subject, issuer ?? identity.issuer);
          return resolve(
            issuer !== undefined &&
              issuer !== identity.issuer &&
              control.reach('users.resolveOidcIdentity:issuer-subject')
              ? { ...identity, issuer }
              : identity,
            create,
            stamp,
          );
        },
      ),
    });
  },
});

const verifiedConflictFault = defineFault({
  id: 'break:users.resolveOidcIdentity:verified-conflict',
  caseId: 'users.resolveOidcIdentity:verified-conflict',
  createControl: () => createFaultControl('users.resolveOidcIdentity:verified-conflict'),
  mutate(source: SqliteSource, control) {
    const issuers = new Map<string, string>();
    return withStores(source, {
      users: replaceMethod(
        source.stores.users,
        'resolveOidcIdentity',
        (resolve) => (identity, create, stamp) => {
          const email = identity.email?.toLowerCase() ?? null;
          const issuer = email === null ? undefined : issuers.get(email);
          if (email !== null) issuers.set(email, issuer ?? identity.issuer);
          return resolve(
            issuer !== undefined &&
              issuer !== identity.issuer &&
              control.reach('users.resolveOidcIdentity:verified-conflict')
              ? { ...identity, emailVerified: false }
              : identity,
            create,
            stamp,
          );
        },
      ),
    });
  },
});

const createProjectStepsFault = defineFault({
  id: 'break:projects.create:steps',
  caseId: 'projects.create:steps',
  createControl: () => createFaultControl('projects.create:steps'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      projects: replaceMethod(
        source.stores.projects,
        'create',
        (create) => (project, steps, stamp) =>
          create(project, control.reach('projects.create:steps') ? [] : steps, stamp),
      ),
    });
  },
});

const updateProjectScopeFault = defineFault({
  id: 'break:projects.update:scope',
  caseId: 'projects.update:scope',
  createControl: () => createFaultControl('projects.update:scope'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      projects: replaceMethod(
        source.stores.projects,
        'update',
        (update) => async (id, patch, stamp) => {
          const updated = await update(id, patch, stamp);
          if (id === DETERMINISTIC_SEED.projectIds[0] && control.reach('projects.update:scope')) {
            await update(DETERMINISTIC_SEED.projectIds[1], patch, stamp);
          }
          return updated;
        },
      ),
    });
  },
});

const projectReaderOrderFault = defineFault({
  id: 'break:projects.recordOpen:reader-order',
  caseId: 'projects.recordOpen:reader-order',
  createControl: () => createFaultControl('projects.recordOpen:reader-order'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      projects: replaceMethod(
        source.stores.projects,
        'listFor',
        (listFor) => (userId) =>
          listFor(
            control.reach('projects.recordOpen:reader-order')
              ? DETERMINISTIC_SEED.ownerIds[0]
              : userId,
          ),
      ),
    });
  },
});

const markerOrderFault = defineFault({
  id: 'break:calendarMarkers.listFor:total-order',
  caseId: 'calendarMarkers.listFor:total-order',
  createControl: () => createFaultControl('calendarMarkers.listFor:total-order'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      calendarMarkers: replaceMethod(source.stores.calendarMarkers, 'listFor', (listFor) => {
        return async (projectId) => {
          if (!control.reach('calendarMarkers.listFor:total-order')) return listFor(projectId);
          return await source.db
            .select({
              id: markerTable.id,
              projectId: markerTable.projectId,
              date: markerTable.date,
              name: markerTable.name,
              color: markerTable.color,
              createdAt: markerTable.createdAt,
            })
            .from(markerTable)
            .where(eq(markerTable.projectId, projectId))
            .orderBy(asc(markerTable.date), asc(markerTable.createdAt));
        };
      }),
    });
  },
});

const markerProjectScopeFault = defineFault({
  id: 'break:calendarMarkers.write:project-scope',
  caseId: 'calendarMarkers.write:project-scope',
  createControl: () => createFaultControl('calendarMarkers.write:project-scope:project-predicate'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      calendarMarkers: replaceMethod(source.stores.calendarMarkers, 'rename', (rename) => {
        return (projectId, id, name) =>
          rename(
            id === 'marker-owned-a' &&
              projectId === DETERMINISTIC_SEED.projectIds[1] &&
              control.reach('calendarMarkers.write:project-scope:project-predicate')
              ? DETERMINISTIC_SEED.projectIds[0]
              : projectId,
            id,
            name,
          );
      }),
    });
  },
});

const markerLiteralDateFault = defineFault({
  id: 'break:calendarMarkers.write:project-scope',
  caseId: 'calendarMarkers.write:project-scope',
  createControl: () => createFaultControl('calendarMarkers.write:project-scope:literal-date'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      calendarMarkers: replaceMethod(source.stores.calendarMarkers, 'create', (create) => {
        return (marker) =>
          create(
            marker.id === 'marker-owned-a' &&
              control.reach('calendarMarkers.write:project-scope:literal-date')
              ? Object.assign(marker, { date: '2026-09-11' })
              : marker,
          );
      }),
    });
  },
});

const insertRespaceFault = defineFault({
  id: 'break:workItems.insert:respace',
  caseId: 'workItems.insert:respace',
  createControl: () => createFaultControl('workItems.insert:respace'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      workItems: replaceMethod(source.stores.workItems, 'insert', (insert) => {
        return (row, respaced, stamp) =>
          insert(
            row,
            row.id === 'work-a-inserted' && control.reach('workItems.insert:respace')
              ? []
              : respaced,
            stamp,
          );
      }),
    });
  },
});

const patchRefusalAtomicFault = defineFault({
  id: 'break:workItems.patch:refusal-atomic',
  caseId: 'workItems.patch:refusal-atomic',
  createControl: () => createFaultControl('workItems.patch:refusal-atomic'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      workItems: replaceMethod(source.stores.workItems, 'patch', (patch) => {
        return async (id, changes, stamp) => {
          if (changes.name === 'Escaped rename' && changes.teamIds?.includes('team-missing')) {
            const scalar = await patch(id, { name: changes.name }, stamp);
            if (!scalar.ok) throw new Error('partial-write setup scalar patch was refused');
            const written = await source.stores.workItems.findById(id);
            if (written?.name !== changes.name) {
              throw new Error('partial-write setup scalar patch was not observable');
            }
            control.reach('workItems.patch:refusal-atomic');
          }
          return patch(id, changes, stamp);
        };
      }),
    });
  },
});

const removePromotionFault = defineFault({
  id: 'break:workItems.remove:promotion',
  caseId: 'workItems.remove:promotion',
  createControl: () => createFaultControl('workItems.remove:promotion'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      workItems: replaceMethod(source.stores.workItems, 'remove', (remove) => {
        return (ids, promoted, stamp) =>
          remove(
            ids,
            control.reach('workItems.remove:promotion')
              ? promoted.filter(({ id }) => id !== 'work-a-child-two')
              : promoted,
            stamp,
          );
      }),
    });
  },
});

const frozenClearFault = defineFault({
  id: 'break:workItems.setFrozenNumbers:clear',
  caseId: 'workItems.setFrozenNumbers:clear',
  createControl: () => createFaultControl('workItems.setFrozenNumbers:clear'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      workItems: replaceMethod(
        source.stores.workItems,
        'setFrozenNumbers',
        (setFrozenNumbers) => (updates, stamp) => {
          const isClear = updates.some(({ frozenNumber }) => frozenNumber === null);
          return setFrozenNumbers(
            isClear && control.reach('workItems.setFrozenNumbers:clear')
              ? [...updates, { id: DETERMINISTIC_SEED.workItemIds[0][1], frozenNumber: null }]
              : updates,
            stamp,
          );
        },
      ),
    });
  },
});

const estimateMoveOwnershipFault = defineFault({
  id: 'break:estimates.moveAll:ownership',
  caseId: 'estimates.moveAll:ownership',
  createControl: () => createFaultControl('estimates.moveAll:ownership'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      estimates: replaceMethod(source.stores.estimates, 'moveAll', (moveAll) => {
        return async (fromWorkItemId, toWorkItemId, stamp) => {
          if (!control.reach('estimates.moveAll:ownership')) {
            return moveAll(fromWorkItemId, toWorkItemId, stamp);
          }
          const estimates = await source.stores.estimates.listByProject(
            DETERMINISTIC_SEED.projectIds[0],
          );
          for (const estimate of estimates.filter(
            ({ workItemId }) => workItemId === fromWorkItemId,
          )) {
            await source.stores.estimates.set({ ...estimate, workItemId: toWorkItemId }, stamp);
          }
        };
      }),
    });
  },
});

const actualReplaceRecordedAtFault = defineFault({
  id: 'break:actuals.set:replace',
  caseId: 'actuals.set:replace',
  createControl: () => createFaultControl('actuals.set:replace'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      actuals: replaceMethod(source.stores.actuals, 'set', (set) => {
        return (actual, stamp) =>
          set(
            actual.recordedAt === 201 && control.reach('actuals.set:replace')
              ? { ...actual, recordedAt: 101 }
              : actual,
            stamp,
          );
      }),
    });
  },
});

const actualRemovePairFault = defineFault({
  id: 'break:actuals.remove:pair',
  caseId: 'actuals.remove:pair',
  createControl: () => createFaultControl('actuals.remove:pair'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      actuals: replaceMethod(source.stores.actuals, 'remove', (remove) => {
        return async (workItemId, stepId, stamp) => {
          await remove(workItemId, stepId, stamp);
          if (control.reach('actuals.remove:pair')) {
            await remove(DETERMINISTIC_SEED.workItemIds[0][1], stepId, stamp);
          }
        };
      }),
    });
  },
});

const actualRemoveFirstCallFault = defineFault({
  id: 'break:actuals.remove:pair',
  caseId: 'actuals.remove:pair',
  createControl: () => createFaultControl('actuals.remove:pair:first-settlement'),
  mutate(source: SqliteSource, control) {
    let removeCount = 0;
    return withStores(source, {
      actuals: replaceMethod(source.stores.actuals, 'remove', (remove) => {
        return (workItemId, stepId, stamp) => {
          removeCount += 1;
          if (removeCount === 1 && control.reach('actuals.remove:pair:first-settlement')) {
            return Promise.resolve();
          }
          return remove(workItemId, stepId, stamp);
        };
      }),
    });
  },
});

const actualMoveOwnershipFault = defineFault({
  id: 'break:actuals.moveAll:ownership',
  caseId: 'actuals.moveAll:ownership',
  createControl: () => createFaultControl('actuals.moveAll:ownership'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      actuals: replaceMethod(source.stores.actuals, 'moveAll', (moveAll) => {
        return async (fromWorkItemId, toWorkItemId, stamp) => {
          if (!control.reach('actuals.moveAll:ownership')) {
            return moveAll(fromWorkItemId, toWorkItemId, stamp);
          }
          const actuals = await source.stores.actuals.listByProject(
            DETERMINISTIC_SEED.projectIds[0],
          );
          for (const actual of actuals.filter(({ workItemId }) => workItemId === fromWorkItemId)) {
            await source.stores.actuals.set({ ...actual, workItemId: toWorkItemId }, stamp);
          }
        };
      }),
    });
  },
});

const actualUnknownStepFault = defineFault({
  id: 'break:actuals.set:unknown_step',
  caseId: 'actuals.set:unknown_step',
  createControl: () => createFaultControl('actuals.set:unknown_step'),
  mutate(source: SqliteSource, control) {
    const acceptingActuals = replaceMethod(source.stores.actuals, 'set', (set) => {
      return (actual, stamp) => {
        if (actual.stepId !== 'no-such-step' || !control.reach('actuals.set:unknown_step')) {
          return set(actual, stamp);
        }
        source.db.run(sql.raw('PRAGMA foreign_keys = OFF'));
        try {
          source.db.insert(actualTable).values(actual).run();
        } finally {
          source.db.run(sql.raw('PRAGMA foreign_keys = ON'));
        }
        return Promise.resolve('written');
      };
    });
    return withStores(source, {
      actuals: replaceMethod(acceptingActuals, 'listByProject', (listByProject) => {
        return async (projectId) => {
          const rows = await listByProject(projectId);
          if (projectId !== DETERMINISTIC_SEED.projectIds[0]) return rows;
          const escaped = await source.db
            .select({
              workItemId: actualTable.workItemId,
              stepId: actualTable.stepId,
              days: actualTable.days,
              recordedAt: actualTable.recordedAt,
            })
            .from(actualTable)
            .where(eq(actualTable.stepId, 'no-such-step'));
          return [...escaped, ...rows];
        };
      }),
    });
  },
});

const measureSetPairIdentityFault = defineFault({
  id: 'break:measures.set:metric-key',
  caseId: 'measures.set:metric-key',
  createControl: () => createFaultControl('measures.set:metric-key'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      measures: replaceMethod(source.stores.measures, 'set', (set) => {
        return async (measure, stamp) => {
          if (measure.value === 21 && control.reach('measures.set:metric-key')) {
            await source.stores.measures.remove(
              measure.workItemId,
              measure.stepId,
              'hours_actual',
              stamp,
            );
            await source.stores.measures.remove(
              measure.workItemId,
              measure.stepId,
              'token_estimate',
              stamp,
            );
          }
          return set(measure, stamp);
        };
      }),
    });
  },
});

const measureSetRecordedAtFault = defineFault({
  id: 'break:measures.set:metric-key',
  caseId: 'measures.set:metric-key',
  createControl: () => createFaultControl('measures.set:metric-key:recorded-at'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      measures: replaceMethod(source.stores.measures, 'set', (set) => {
        return (measure, stamp) =>
          set(
            measure.value === 21 && control.reach('measures.set:metric-key:recorded-at')
              ? { ...measure, recordedAt: 102 }
              : measure,
            stamp,
          );
      }),
    });
  },
});

const measureRemovePairIdentityFault = defineFault({
  id: 'break:measures.remove:metric-key',
  caseId: 'measures.remove:metric-key',
  createControl: () => createFaultControl('measures.remove:metric-key'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      measures: replaceMethod(source.stores.measures, 'remove', (remove) => {
        return async (workItemId, stepId, metric, stamp) => {
          await remove(workItemId, stepId, metric, stamp);
          if (!control.reach('measures.remove:metric-key')) return;
          await remove(workItemId, stepId, 'hours_actual', stamp);
          await remove(workItemId, stepId, 'token_estimate', stamp);
        };
      }),
    });
  },
});

const measureMoveOneMetricFault = defineFault({
  id: 'break:measures.moveAll:all-metrics',
  caseId: 'measures.moveAll:all-metrics',
  createControl: () => createFaultControl('measures.moveAll:all-metrics'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      measures: replaceMethod(source.stores.measures, 'moveAll', (moveAll) => {
        return async (fromWorkItemId, toWorkItemId, stamp) => {
          if (!control.reach('measures.moveAll:all-metrics')) {
            return moveAll(fromWorkItemId, toWorkItemId, stamp);
          }
          const measures = await source.stores.measures.listByProject(
            DETERMINISTIC_SEED.projectIds[0],
          );
          for (const measure of measures.filter(
            ({ workItemId, metric }) =>
              workItemId === fromWorkItemId && metric === 'token_estimate',
          )) {
            await source.stores.measures.set({ ...measure, workItemId: toWorkItemId }, stamp);
            await source.stores.measures.remove(
              fromWorkItemId,
              measure.stepId,
              measure.metric,
              stamp,
            );
          }
        };
      }),
    });
  },
});

const measureMoveRecordedAtFault = defineFault({
  id: 'break:measures.moveAll:all-metrics',
  caseId: 'measures.moveAll:all-metrics',
  createControl: () => createFaultControl('measures.moveAll:all-metrics:recorded-at'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      measures: replaceMethod(source.stores.measures, 'moveAll', (moveAll) => {
        return async (fromWorkItemId, toWorkItemId, stamp) => {
          await moveAll(fromWorkItemId, toWorkItemId, stamp);
          if (!control.reach('measures.moveAll:all-metrics:recorded-at')) return;
          await source.stores.measures.set(
            {
              workItemId: toWorkItemId,
              stepId: DETERMINISTIC_SEED.stepIds[0][0],
              metric: 'token_actual',
              value: 11,
              recordedAt: 999,
            },
            stamp,
          );
        };
      }),
    });
  },
});

const measureUnknownStepFault = defineFault({
  id: 'break:measures.set:unknown_step',
  caseId: 'measures.set:unknown_step',
  createControl: () => createFaultControl('measures.set:unknown_step'),
  mutate(source: SqliteSource, control) {
    const acceptingMeasures = replaceMethod(source.stores.measures, 'set', (set) => {
      return (measure, stamp) => {
        if (measure.stepId !== 'no-such-step' || !control.reach('measures.set:unknown_step')) {
          return set(measure, stamp);
        }
        source.db.run(sql.raw('PRAGMA foreign_keys = OFF'));
        try {
          source.db.insert(measureTable).values(measure).run();
        } finally {
          source.db.run(sql.raw('PRAGMA foreign_keys = ON'));
        }
        return Promise.resolve('written');
      };
    });
    return withStores(source, {
      measures: replaceMethod(acceptingMeasures, 'listByProject', (listByProject) => {
        return async (projectId) => {
          const rows = await listByProject(projectId);
          if (projectId !== DETERMINISTIC_SEED.projectIds[0]) return rows;
          const escaped = await source.db
            .select({
              workItemId: measureTable.workItemId,
              stepId: measureTable.stepId,
              metric: measureTable.metric,
              value: measureTable.value,
              recordedAt: measureTable.recordedAt,
            })
            .from(measureTable)
            .where(eq(measureTable.stepId, 'no-such-step'));
          return [...escaped, ...rows];
        };
      }),
    });
  },
});

const addFault = defineFault({
  id: 'break:steps.add',
  caseId: 'steps.add',
  createControl: () => createFaultControl('steps.add'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      steps: replaceMethod(
        source.stores.steps,
        'add',
        (add) => async (step, stamp) =>
          add(control.reach('steps.add') ? { ...step, name: 'faulted add' } : step, stamp),
      ),
    });
  },
});

const renameFault = defineFault({
  id: 'break:steps.rename',
  caseId: 'steps.rename',
  createControl: () => createFaultControl('steps.rename'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      steps: replaceMethod(
        source.stores.steps,
        'rename',
        (rename) => (stepId, name, stamp) =>
          rename(stepId, control.reach('steps.rename') ? 'faulted rename' : name, stamp),
      ),
    });
  },
});

const estimateFault = defineFault({
  id: 'break:estimates.set',
  caseId: 'estimates.set',
  createControl: () => createFaultControl('estimates.set'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      estimates: replaceMethod(
        source.stores.estimates,
        'set',
        (set) => (estimate, stamp) =>
          set(
            control.reach('estimates.set')
              ? { ...estimate, realistic: estimate.realistic + 1 }
              : estimate,
            stamp,
          ),
      ),
    });
  },
});

const removeFault = defineFault({
  id: 'break:estimates.remove',
  caseId: 'estimates.remove',
  createControl: () => createFaultControl('estimates.remove'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      estimates: replaceMethod(
        source.stores.estimates,
        'remove',
        (remove) => (workItemId, stepId, stamp) =>
          control.reach('estimates.remove') ? Promise.resolve() : remove(workItemId, stepId, stamp),
      ),
    });
  },
});

const rangeFault = defineFault({
  id: 'break:eventLog.rangeSince',
  caseId: 'eventLog.rangeSince',
  createControl: () => createFaultControl('eventLog.rangeSince'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      eventLog: replaceMethod(
        source.stores.eventLog,
        'rangeSince',
        (rangeSince) => (subscription, sinceSeq) =>
          control.reach('eventLog.rangeSince')
            ? Promise.resolve([])
            : rangeSince(subscription, sinceSeq),
      ),
    });
  },
});

const pruneFault = defineFault({
  id: 'break:eventLog.pruneBeyond',
  caseId: 'eventLog.pruneBeyond',
  createControl: () => createFaultControl('eventLog.pruneBeyond'),
  mutate(source: SqliteSource, control) {
    return withStores(source, {
      eventLog: replaceMethod(
        source.stores.eventLog,
        'pruneBeyond',
        (pruneBeyond) => (maximum) =>
          control.reach('eventLog.pruneBeyond') ? Promise.resolve(0) : pruneBeyond(maximum),
      ),
    });
  },
});

interface FaultContext {
  readonly registration: ReturnType<typeof existingStoreRegistrations>[number];
  assertionFailure: string | null;
  report: Awaited<ReturnType<typeof runCases>> | null;
}

async function proveFault(
  fault: Fault<SqliteSource>,
  openBase: OpenSource = openSqliteSource,
): Promise<FaultProof> {
  return recordFaultProof(fault, {
    assertion: `${fault.caseId} reports passed`,
    async setup(run: FaultRun<SqliteSource>) {
      const openSource = brokenSource(openBase, run);
      const { source, directory } = await seedSqliteSource(openSource);
      let wasOpened = false;
      const takeFixture = <Family extends ExistingFamily>(
        family: Family,
        caseId: CaseId,
      ): Promise<CaseFixture<TransactionalStores[Family]>> => {
        if (wasOpened) return Promise.reject(new Error(`${fault.caseId} fixture opened twice`));
        wasOpened = true;
        return Promise.resolve(sqliteFixture(source, directory, family, caseId));
      };
      const registrations = existingStoreRegistrations({
        projects: (caseId) => takeFixture('projects', caseId),
        users: (caseId) => takeFixture('users', caseId),
        capacity: (caseId) => takeFixture('capacity', caseId),
        priorityBands: (caseId) => takeFixture('priorityBands', caseId),
        calendarMarkers: (caseId) => takeFixture('calendarMarkers', caseId),
        workItems: (caseId) => takeFixture('workItems', caseId),
        steps: (caseId) => takeFixture('steps', caseId),
        estimates: (caseId) => takeFixture('estimates', caseId),
        actuals: (caseId) => takeFixture('actuals', caseId),
        measures: (caseId) => takeFixture('measures', caseId),
        directory: (caseId) => takeFixture('directory', caseId),
        eventLog: (caseId) => takeFixture('eventLog', caseId),
      });
      const registration = registrations.find(({ caseId }) => caseId === fault.caseId);
      if (registration === undefined) {
        return throwAfterCleanup(
          new Error(`missing existing registration for ${fault.caseId}`),
          source,
          directory,
        );
      }
      return { registration, assertionFailure: null, report: null };
    },
    async exercise(context: FaultContext) {
      context.report = await runCases([context.registration], {
        focus: [fault.caseId],
      });
      const execution = context.report.cases[0];
      if (execution.status === 'failed' && execution.assertionPhase !== 'assertion') {
        throw new Error(execution.failure);
      }
      if (execution.status !== 'failed' && execution.status !== 'passed') {
        throw new Error(`${fault.caseId} finished ${execution.status} without an assertion`);
      }
      context.assertionFailure = execution.status === 'failed' ? execution.failure : null;
    },
    assert(context: FaultContext) {
      if (context.assertionFailure !== null) throw new Error(context.assertionFailure);
      expect(context.report?.cases[0]?.status).toBe('passed');
      return Promise.resolve();
    },
  });
}

describe('SQLite existing source conformance', () => {
  it('runs every work-item case through the real SQLite source', async () => {
    const caseIds = [
      'workItems.insert:respace',
      'workItems.patch:refusal-atomic',
      'workItems.move:parent-position',
      'workItems.remove:promotion',
      'workItems.setFrozenNumbers:clear',
    ] as const;
    const report = await runCases(existingStoreRegistrations(openers), { focus: caseIds });

    expect(report.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      caseIds.map((caseId) => ({ caseId, status: 'passed' })),
    );
  });

  it('failed SQLite setup closes its source and removes its temporary directory', async () => {
    let closeCalls = 0;
    let directory = '';
    let setupFailure: unknown;
    try {
      await seedSqliteSource((options) => {
        directory = dirname(options.dbPath);
        const source = openSqliteSource(options);
        return {
          ...source,
          stores: {
            ...source.stores,
            users: replaceMethod(
              source.stores.users,
              'create',
              () => () => Promise.reject(new Error('injected seed failure')),
            ),
          },
          async close() {
            closeCalls += 1;
            await source.close();
          },
        };
      });
    } catch (failure) {
      setupFailure = failure;
    }

    expect(setupFailure).toBeInstanceOf(Error);
    expect((setupFailure as Error).message).toBe('injected seed failure');
    // Proof: before setup owned cleanup, the actual source was never closed and
    // its `wbs-sqlite-conformance-*` directory still existed (0 / true).
    expect(closeCalls).toBe(1);
    expect(existsSync(directory)).toBe(false);
  });

  it('failed SQLite setup preserves its original and cleanup failures', async () => {
    let directory = '';
    let combinedFailure: unknown;
    try {
      await seedSqliteSource((options) => {
        directory = dirname(options.dbPath);
        const source = openSqliteSource(options);
        return {
          ...source,
          stores: {
            ...source.stores,
            users: replaceMethod(
              source.stores.users,
              'create',
              () => () => Promise.reject(new Error('injected original setup failure')),
            ),
          },
          async close() {
            await source.close();
            throw new Error('injected setup cleanup failure');
          },
        };
      });
    } catch (failure) {
      combinedFailure = failure;
    }

    // Proof: replacing the aggregate with the cleanup error alone failed on
    // `Expected: true · Received: false`, losing the original setup failure.
    expect(combinedFailure instanceof AggregateError).toBe(true);
    if (!(combinedFailure instanceof AggregateError)) {
      throw new Error('setup and cleanup failures were not aggregated');
    }
    expect(combinedFailure.errors).toEqual([
      expect.objectContaining({ message: 'injected original setup failure' }),
      expect.objectContaining({ message: 'injected setup cleanup failure' }),
    ]);
    expect(existsSync(directory)).toBe(false);
  });

  it('the execution report surfaces nested SQLite setup and cleanup failures', async () => {
    let closeCalls = 0;
    let directory = '';
    const report = await runCases(
      [
        {
          family: 'steps',
          caseId: 'steps.add',
          async openAndRun() {
            const fixture = await openSqliteCase('steps', 'steps.add', (options) => {
              directory = dirname(options.dbPath);
              const source = openSqliteSource(options);
              return {
                ...source,
                stores: {
                  ...source.stores,
                  users: replaceMethod(
                    source.stores.users,
                    'create',
                    () => () => Promise.reject(new Error('original report setup sentinel')),
                  ),
                },
                async close() {
                  closeCalls += 1;
                  await source.close();
                  throw new AggregateError(
                    [
                      new Error('report cleanup sentinel'),
                      new AggregateError(
                        [new Error('report nested cleanup sentinel')],
                        'nested report cleanup',
                      ),
                    ],
                    'report cleanup',
                  );
                },
              };
            });
            return {
              fixtureId: fixture.fixtureId,
              assert: () => Promise.resolve(),
              close: () => fixture.close(),
            };
          },
        },
      ],
      { focus: ['steps.add'] },
    );

    const execution = report.cases[0];
    expect(execution.status).toBe('failed');
    if (execution.status !== 'failed') throw new Error('expected failed report evidence');
    expect(execution.assertionPhase).toBe('setup');
    // Proof: flattening the real setup AggregateError to `.message` failed on
    // `Expected to contain: "original report setup sentinel"; Received:
    // "SQLite conformance setup and cleanup failed"`.
    expect(execution.failure).toBe(
      'SQLite conformance setup and cleanup failed: [original report setup sentinel; report cleanup: [report cleanup sentinel; nested report cleanup: [report nested cleanup sentinel]]]',
    );
    expect(closeCalls).toBe(1);
    expect(existsSync(directory)).toBe(false);
  });

  it('the fault proof surfaces nested SQLite setup and cleanup failures', async () => {
    let closeCalls = 0;
    let directory = '';
    const proof = await proveFault(addFault, (options) => {
      directory = dirname(options.dbPath);
      const source = openSqliteSource(options);
      return {
        ...source,
        stores: {
          ...source.stores,
          users: replaceMethod(
            source.stores.users,
            'create',
            () => () => Promise.reject(new Error('original proof setup sentinel')),
          ),
        },
        async close() {
          closeCalls += 1;
          await source.close();
          throw new AggregateError(
            [
              new Error('proof cleanup sentinel'),
              new AggregateError(
                [new Error('proof nested cleanup sentinel')],
                'nested proof cleanup',
              ),
            ],
            'proof cleanup',
          );
        },
      };
    });

    expect(proof.kind).toBe('setup-failed');
    if (proof.kind !== 'setup-failed') throw new Error('expected failed proof setup');
    // Proof: flattening the proof AggregateError to `.message` failed on
    // `Expected to contain: "original proof setup sentinel"; Received:
    // "SQLite conformance setup and cleanup failed"`.
    expect(proof.failure).toBe(
      'SQLite conformance setup and cleanup failed: [original proof setup sentinel; proof cleanup: [proof cleanup sentinel; nested proof cleanup: [proof nested cleanup sentinel]]]',
    );
    expect(closeCalls).toBe(1);
    expect(existsSync(directory)).toBe(false);
  });

  it('a seed failure cannot become an observed shared-case assertion', async () => {
    let reachedDuringSeed = false;
    const seedFault = defineFault({
      id: 'break:steps.add',
      caseId: 'steps.add',
      createControl: () => createFaultControl('steps.add'),
      mutate(source: SqliteSource, control) {
        const decorated = addFault.mutate(source, control);
        return withStores(decorated, {
          projects: replaceMethod(
            decorated.stores.projects,
            'create',
            (create) => async (project, steps, stamp) => {
              await create(project, steps, stamp);
              await decorated.stores.steps.add(
                { id: 'probe-step', projectId: project.id, name: 'Setup step' },
                stamp,
              );
              reachedDuringSeed = control.reached();
              throw new Error('injected seed failure after actual steps.add');
            },
          ),
        });
      },
    });

    const proof = await proveFault(seedFault);

    // Proof: with setup deferred until after arm, this was `observed` and
    // reachedDuringSeed was true although the shared assertion never ran.
    expect(reachedDuringSeed).toBe(false);
    expect(proof).toEqual({
      kind: 'setup-failed',
      faultId: 'break:steps.add',
      caseId: 'steps.add',
      failure: 'injected seed failure after actual steps.add',
    });
  });

  it('a cleanup failure after fault reach is a phase failure, not assertion proof', async () => {
    let directory = '';
    const cleanupFault = defineFault({
      id: 'break:steps.add',
      caseId: 'steps.add',
      createControl: () => createFaultControl('steps.add'),
      mutate(source: SqliteSource, control) {
        const decorated = addFault.mutate(source, control);
        return {
          ...decorated,
          async close() {
            await decorated.close();
            throw new Error('injected cleanup failure after actual steps.add');
          },
        };
      },
    });

    const proof = await proveFault(cleanupFault, (options) => {
      directory = dirname(options.dbPath);
      return openSqliteSource(options);
    });

    // Proof: rethrowing every failed execution from the proof assertion made
    // this `observed`; the corrected production path reports `phase-failed`
    // with both the Wiring assertion and injected cleanup failure retained.
    expect(proof.kind).toBe('phase-failed');
    if (proof.kind !== 'phase-failed') throw new Error('cleanup was accepted as proof');
    expect(proof.faultId).toBe('break:steps.add');
    expect(proof.caseId).toBe('steps.add');
    expect(proof.phase).toBe('steps.add');
    expect(Bun.stripANSI(proof.failure)).toContain('Expected to contain: "Wiring"');
    expect(proof.failure).toContain(
      'cleanup failed: injected cleanup failure after actual steps.add',
    );
    expect(existsSync(directory)).toBe(false);
  });

  it('SQLite runs every offered existing case', async () => {
    const report = await runCases(existingStoreRegistrations(openers), {
      focus: [...SOURCE_CONFORMANCE_CASES],
    });

    expect(report.kind).toBe('partial');
    expect(report.cases.map(({ caseId }) => caseId)).toEqual([...SOURCE_CONFORMANCE_CASES]);
    expect(
      report.cases.map(({ caseId, status, executed }) => ({ caseId, status, executed })),
    ).toEqual(
      SOURCE_CONFORMANCE_CASES.map((caseId) => ({ caseId, status: 'passed', executed: true })),
    );
  });

  it('reinjects project step, scope, and reader-order faults', async () => {
    const faults = [createProjectStepsFault, updateProjectScopeFault, projectReaderOrderFault];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(['observed', 'observed', 'observed']);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    expect(failures[0]).toContain('project-created-dev');
    expect(failures[1]).toContain('"name": "Renamed project"');
    expect(failures[2]).toContain('"Project 2"');
    expect(failures[2]).toContain('"Project 1"');

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      faults.map(({ caseId }) => ({ caseId, status: 'passed' })),
    );
  });

  it('reinjects account uniqueness, read-shape, issuer, and verified-email faults', async () => {
    const faults = [
      createUniqueNameFault,
      findIdentityFault,
      issuerSubjectFault,
      verifiedConflictFault,
    ];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(
      Array.from({ length: faults.length }, () => 'observed'),
    );
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    expect(failures[0]).toContain('"duplicate": {');
    expect(failures[1]).toContain('"passwordHash": null');
    expect(failures[2]).toContain('"otherStored": null');
    expect(failures[3]).toContain('"id": "oidc-conflict"');

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      faults.map(({ caseId }) => ({ caseId, status: 'passed' })),
    );
  });

  it('reinjects capacity and priority-band configuration faults', async () => {
    const faults = [
      capacityProjectTeamFault,
      capacityClearFault,
      capacityMissingReferenceFault,
      priorityDefaultsFault,
      priorityFirstRungFault,
      priorityMissingProjectFault,
    ];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(
      Array.from({ length: faults.length }, () => 'observed'),
    );
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    expect(failures[0]).toContain('"team-a" => 5');
    expect(failures[1]).toContain('"size": 0');
    expect(failures[2]).toContain('"missingProject"');
    expect(failures[2]).toContain('"ok": true');
    expect(failures[3]).toContain('"Critical"');
    expect(failures[3]).toContain('"projectA": []');
    expect(failures[4]).toContain('"label": "Soon"');
    expect(failures[5]).toContain('"ok": true');

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      faults.map(({ caseId }) => ({ caseId, status: 'passed' })),
    );
  });

  it('reinjects project-scope destruction inside the priority-band transaction', async () => {
    const proof = await proveFault(priorityProjectScopeFault);

    expect(proof.kind).toBe('observed');
    if (proof.kind !== 'observed') throw new Error('project-scope destruction was not observed');
    // Proof: the trigger broadened the real transaction's A-row deletion to B;
    // this failed on `"label": "Now"` becoming `"label": "Critical"`.
    expect(Bun.stripANSI(proof.observedFailure)).toContain('"label": "Now"');
    expect(Bun.stripANSI(proof.observedFailure)).toContain('"label": "Critical"');

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: [priorityProjectScopeFault.caseId],
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: priorityProjectScopeFault.caseId, status: 'passed' },
    ]);
  });

  it('reinjects marker order, project-scope, and literal-date faults', async () => {
    const faults = [markerOrderFault, markerProjectScopeFault, markerLiteralDateFault];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(['observed', 'observed', 'observed']);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    expect(failures[0]).toContain('"marker-c"');
    expect(failures[1]).toContain('"name": "Mine now"');
    expect(failures[2]).toContain('"date": "2026-09-11"');

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: markerOrderFault.caseId, status: 'passed' },
      { caseId: markerProjectScopeFault.caseId, status: 'passed' },
    ]);
  });

  it('reinjects the existing add, rename, estimate, remove, range, and prune faults', async () => {
    const proofs = await Promise.all(
      [addFault, renameFault, estimateFault, removeFault, rangeFault, pruneFault].map((fault) =>
        proveFault(fault),
      ),
    );

    expect(proofs.map(({ kind }) => kind)).toEqual(Array.from({ length: 6 }, () => 'observed'));
    const observedFailures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    const expectedFragments = [
      'Expected to contain: "Wiring"',
      'Received: "faulted rename"',
      'Received: 3',
      '"work-a-two"',
      '+ []',
      'Received: 0',
    ];
    for (const [index, fragment] of expectedFragments.entries()) {
      expect(observedFailures[index]).toContain(fragment);
    }

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: [
        addFault.caseId,
        renameFault.caseId,
        estimateFault.caseId,
        removeFault.caseId,
        rangeFault.caseId,
        pruneFault.caseId,
      ],
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      [addFault, renameFault, estimateFault, removeFault, rangeFault, pruneFault].map(
        ({ caseId }) => ({ caseId, status: 'passed' }),
      ),
    );
  });

  it('reinjects the four work-item matrix faults in their named windows', async () => {
    const faults = [
      insertRespaceFault,
      patchRefusalAtomicFault,
      removePromotionFault,
      frozenClearFault,
    ];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(Array.from({ length: 4 }, () => 'observed'));
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    // Proof: the four real SQLite mutations failed respectively with the tight
    // sibling still at position 11, `Escaped rename`, a settled refusal with the
    // parent retained, and the retained number received as null.
    expect(failures[0]).toContain('"position": 11');
    expect(failures[1]).toContain('"name": "Escaped rename"');
    expect(failures[2]).toContain('didRefuse: true');
    expect(failures[3]).toContain('frozenNumber: null');

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      faults.map(({ caseId }) => ({ caseId, status: 'passed' })),
    );
  });

  it('reinjects estimate and actual ownership, pair, timestamp, and refusal faults', async () => {
    const faults = [
      estimateMoveOwnershipFault,
      actualReplaceRecordedAtFault,
      actualRemoveFirstCallFault,
      actualRemovePairFault,
      actualMoveOwnershipFault,
      actualUnknownStepFault,
    ];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(faults.map(() => 'observed'));
    expect(proofs.map((proof) => (proof.kind === 'observed' ? proof.phase : null))).toEqual([
      'estimates.moveAll:ownership',
      'actuals.set:replace',
      'actuals.remove:pair:first-settlement',
      'actuals.remove:pair',
      'actuals.moveAll:ownership',
      'actuals.set:unknown_step',
    ]);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    // Proof: copying through the real estimate set path exposed both complete
    // source trios as additions beside the two unchanged destination trios.
    expect(failures[0]).toContain(`      "optimistic": 1,
      "pessimistic": 4,
      "realistic": 2,
      "stepId": "step-a-dev",
+     "workItemId": "work-a-one",
+   },
+   {
+     "optimistic": 3,
+     "pessimistic": 8,
+     "realistic": 5,
+     "stepId": "step-a-qa",
+     "workItemId": "work-a-one",
+   },
+   {
+     "optimistic": 1,
+     "pessimistic": 4,
+     "realistic": 2,
+     "stepId": "step-a-dev",
      "workItemId": "work-a-two",`);
    expect(failures[0]).toContain(`    {
      "optimistic": 3,
      "pessimistic": 8,
      "realistic": 5,
      "stepId": "step-a-qa",
      "workItemId": "work-a-two",
    },`);
    // Proof: retaining the first recording time produced the complete target
    // pair with days 13, expected timestamp 201 and received timestamp 101.
    expect(failures[1]).toContain(`    {
      "days": 13,
-     "recordedAt": 201,
+     "recordedAt": 101,
      "stepId": "step-a-dev",
      "workItemId": "work-a-one",
    },`);
    // Proof: suppressing the first removal exposed the complete targeted
    // work-a-one/dev row as an addition in the first settlement window.
    expect(failures[2]).toContain(`    {
+     "days": 2,
+     "recordedAt": 101,
+     "stepId": "step-a-dev",
+     "workItemId": "work-a-one",
+   },`);
    // Proof: broadening removal exposed the complete work-a-two/dev survivor,
    // days 5 at recordedAt 103, as absent from the received first settlement.
    expect(failures[3]).toContain(`-   {
-     "days": 5,
-     "recordedAt": 103,
-     "stepId": "step-a-dev",
-     "workItemId": "work-a-two",
-   },`);
    // Proof: copying through the real actual set path exposed both complete
    // source rows as additions beside the two unchanged destination rows.
    expect(failures[4]).toContain(`      "days": 2,
      "recordedAt": 101,
      "stepId": "step-a-dev",
+     "workItemId": "work-a-one",
+   },
+   {
+     "days": 3,
+     "recordedAt": 102,
+     "stepId": "step-a-qa",
+     "workItemId": "work-a-one",
+   },
+   {
+     "days": 2,
+     "recordedAt": 101,
+     "stepId": "step-a-dev",
      "workItemId": "work-a-two",`);
    expect(failures[4]).toContain(`    {
      "days": 3,
      "recordedAt": 102,
      "stepId": "step-a-qa",
      "workItemId": "work-a-two",
    },`);
    // Proof: accepting the missing step produced both received `written` and
    // the complete escaped work-a-one/no-such-step/days-13/recordedAt-201 row.
    expect(failures[5]).toContain(`-   "outcome": "unknown_step",
+   "outcome": "written",
    "projectA": [
+     {
+       "days": 13,
+       "recordedAt": 201,
+       "stepId": "no-such-step",
+       "workItemId": "work-a-one",
+     },`);

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      Array.from(new Set(faults.map(({ caseId }) => caseId)), (caseId) => ({
        caseId,
        status: 'passed',
      })),
    );
  });

  it('reinjects measure identity, timestamp, ownership, and refusal faults', async () => {
    const faults = [
      measureSetPairIdentityFault,
      measureSetRecordedAtFault,
      measureRemovePairIdentityFault,
      measureMoveOneMetricFault,
      measureMoveRecordedAtFault,
      measureUnknownStepFault,
    ];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(faults.map(() => 'observed'));
    expect(proofs.map((proof) => (proof.kind === 'observed' ? proof.phase : null))).toEqual([
      'measures.set:metric-key',
      'measures.set:metric-key:recorded-at',
      'measures.remove:metric-key',
      'measures.moveAll:all-metrics',
      'measures.moveAll:all-metrics:recorded-at',
      'measures.set:unknown_step',
    ]);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    // Proof: omitting metric from set identity deleted the complete hours and
    // token-estimate survivors from the requested pair after its complete setup.
    expect(failures[0]).toContain(`    {
-     "metric": "hours_actual",
-     "recordedAt": 103,
-     "stepId": "step-a-dev",
-     "value": 12,
-     "workItemId": "work-a-one",
-   },`);
    expect(failures[0]).toContain(`-   {
-     "metric": "token_estimate",
-     "recordedAt": 101,
-     "stepId": "step-a-dev",
-     "value": 10,
      "workItemId": "work-a-one",
    },`);
    // Proof: retaining the first timestamp on token_actual value 21 produced
    // expected recordedAt 201 and received 102 on the complete triple key.
    expect(failures[1]).toContain(`    {
      "metric": "token_actual",
-     "recordedAt": 201,
+     "recordedAt": 102,
      "stepId": "step-a-dev",
      "value": 21,
      "workItemId": "work-a-one",
    },`);
    // Proof: omitting metric from remove identity deleted both complete
    // non-target metric survivors from the requested pair's first settlement.
    expect(failures[2]).toContain(`    {
-     "metric": "hours_actual",
-     "recordedAt": 103,
-     "stepId": "step-a-dev",
-     "value": 12,
-     "workItemId": "work-a-one",
-   },`);
    expect(failures[2]).toContain(`-   {
-     "metric": "token_estimate",
-     "recordedAt": 101,
-     "stepId": "step-a-dev",
-     "value": 10,
-     "workItemId": "work-a-one",
-   },`);
    // Proof: moving only token_estimate left the complete hours_actual and
    // token_actual rows received on work-a-one instead of expected work-a-two.
    expect(failures[3]).toContain(`    {
      "metric": "hours_actual",
      "recordedAt": 103,
      "stepId": "step-a-dev",
      "value": 12,
-     "workItemId": "work-a-two",
+     "workItemId": "work-a-one",
    },`);
    expect(failures[3]).toContain(`    {
      "metric": "token_actual",
      "recordedAt": 102,
      "stepId": "step-a-dev",
      "value": 11,
-     "workItemId": "work-a-two",
+     "workItemId": "work-a-one",
    },`);
    // Proof: losing the moved token_actual timestamp produced expected 102 and
    // received 999 on its complete destination triple and value.
    expect(failures[4]).toContain(`    {
      "metric": "token_actual",
-     "recordedAt": 102,
+     "recordedAt": 999,
      "stepId": "step-a-dev",
      "value": 11,
      "workItemId": "work-a-two",
    },`);
    // Proof: accepting the missing step produced received written and the
    // complete escaped token_estimate row in project A's settled public read.
    expect(failures[5]).toContain(`-   "outcome": "unknown_step",
+   "outcome": "written",
    "projectA": [
+     {
+       "metric": "token_estimate",
+       "recordedAt": 201,
+       "stepId": "no-such-step",
+       "value": 21,
+       "workItemId": "work-a-one",
+     },`);

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      Array.from(new Set(faults.map(({ caseId }) => caseId)), (caseId) => ({
        caseId,
        status: 'passed',
      })),
    );
  });
});
