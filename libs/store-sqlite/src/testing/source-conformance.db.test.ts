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
import { eq } from 'drizzle-orm';

import { runMigrations } from '../migrate';
import { users as userTable } from '../schema';
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
  steps: (caseId) => openSqliteCase('steps', caseId),
  estimates: (caseId) => openSqliteCase('estimates', caseId),
  directory: (caseId) => openSqliteCase('directory', caseId),
  eventLog: (caseId) => openSqliteCase('eventLog', caseId),
};

function withStores(source: SqliteSource, stores: Partial<TransactionalStores>): SqliteSource {
  return { ...source, stores: { ...source.stores, ...stores } };
}

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
        steps: (caseId) => takeFixture('steps', caseId),
        estimates: (caseId) => takeFixture('estimates', caseId),
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
});
