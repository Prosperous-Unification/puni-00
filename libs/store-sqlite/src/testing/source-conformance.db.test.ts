import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import type { TransactionalStores } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { DEFAULT_ESTIMATE_RULE } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { runMigrations } from '../migrate';
import { openSqliteSource, type OpenSqliteSourceOptions, type SqliteSource } from '../source';

const MIGRATIONS = new URL('../../../../apps/be-01/drizzle', import.meta.url).pathname;
type ExistingFamily = keyof ExistingStoreOpeners;
type OpenSource = (options: OpenSqliteSourceOptions) => SqliteSource;

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
  const dbPath = join(directory, 'source.db');
  runMigrations(dbPath, MIGRATIONS);
  const source = openSource({ dbPath });
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
  return { source, directory };
}

async function openSqliteCase<Family extends ExistingFamily>(
  family: Family,
  caseId: CaseId,
  openSource: OpenSource = openSqliteSource,
): Promise<CaseFixture<TransactionalStores[Family]>> {
  const { source, directory } = await seedSqliteSource(openSource);
  return {
    fixtureId: `sqlite:${caseId}`,
    port: source.stores[family],
    seed: DETERMINISTIC_SEED,
    readers: readersOf(source),
    scenario: { kind: 'ordinary' },
    async close() {
      await source.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

const openers: ExistingStoreOpeners = {
  steps: (caseId) => openSqliteCase('steps', caseId),
  estimates: (caseId) => openSqliteCase('estimates', caseId),
  directory: (caseId) => openSqliteCase('directory', caseId),
  eventLog: (caseId) => openSqliteCase('eventLog', caseId),
};

function openersFrom(openSource: OpenSource): ExistingStoreOpeners {
  return {
    steps: (caseId) => openSqliteCase('steps', caseId, openSource),
    estimates: (caseId) => openSqliteCase('estimates', caseId, openSource),
    directory: (caseId) => openSqliteCase('directory', caseId, openSource),
    eventLog: (caseId) => openSqliteCase('eventLog', caseId, openSource),
  };
}

function withStores(source: SqliteSource, stores: Partial<TransactionalStores>): SqliteSource {
  return { ...source, stores: { ...source.stores, ...stores } };
}

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
  readonly openers: ExistingStoreOpeners;
  report: Awaited<ReturnType<typeof runCases>> | null;
}

async function proveFault(fault: Fault<SqliteSource>): Promise<FaultProof> {
  return recordFaultProof(fault, {
    assertion: `${fault.caseId} reports passed`,
    setup(run: FaultRun<SqliteSource>) {
      const openSource = brokenSource(openSqliteSource, run);
      return Promise.resolve({ openers: openersFrom(openSource), report: null });
    },
    async exercise(context: FaultContext) {
      context.report = await runCases(existingStoreRegistrations(context.openers), {
        focus: [fault.caseId],
      });
    },
    assert(context: FaultContext) {
      const execution = context.report?.cases[0];
      if (execution?.status === 'failed') throw new Error(execution.failure);
      expect(execution?.status).toBe('passed');
      return Promise.resolve();
    },
  });
}

describe('SQLite existing source conformance', () => {
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

  it('reinjects the existing add, rename, estimate, remove, range, and prune faults', async () => {
    const proofs = await Promise.all(
      [addFault, renameFault, estimateFault, removeFault, rangeFault, pruneFault].map(proveFault),
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
  });
});
