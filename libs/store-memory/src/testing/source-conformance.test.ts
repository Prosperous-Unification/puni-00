import {
  assertCompleteStateAlternative,
  assertSeedState,
  brokenSource,
  type Capabilities,
  type CaseFixture,
  type CaseId,
  completeSubtreeCopy,
  createFaultControl,
  defineFault,
  DEPENDENCY_SURVIVOR_IDS,
  DETERMINISTIC_SEED,
  type ExecutionReport,
  type ExistingStoreOpeners,
  existingStoreRegistrations,
  type Fault,
  type FaultProof,
  type FaultRun,
  PROGRESS_SENTINEL_STEP_ID,
  readSubtreePublicState,
  recordFaultProof,
  replaceMethod,
  runCases,
  SOURCE_CONFORMANCE_CASES,
  type SourceDeclaration,
  type SourceReaders,
  subtreeSeedRecords,
} from '@wbs/conformance';
import type {
  CommandJournalStore,
  JournalEntry,
  PlanEvent,
  StoredDependency,
  StoredProgress,
  SubtreeCopy,
  SubtreeStore,
  TeamWithServices,
  TransactionalStores,
  User,
  WriteStamp,
} from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { inMemoryDependencies } from '../dependency-fixture';
import { projectRow } from '../project-fixture';
import { openMemorySourceFixture, openMemorySourceWithLateWriteSeam } from '../source';
import {
  type MemoryLateWriteControl,
  memoryLateWriteControl,
  type MemoryLateWritePoint,
} from './faults';

type ExistingFamily = keyof ExistingStoreOpeners;
type MemorySource = ReturnType<typeof openMemorySourceFixture>['source'] & {
  deriveNextEventSeqFromRetained(subscription: string): void;
  independentJournalHistoryFor(): Promise<PlanEvent[]>;
  routeJournalEventToIndependent(eventId: string): PlanEvent;
  storeDependencyById(dependency: StoredDependency): void;
  insertSubtree(copy: SubtreeCopy, stamp: WriteStamp): Promise<void>;
  journal: CommandJournalStore;
};
type OpenSource = () => MemorySource;

function openConformanceMemorySource(): MemorySource {
  const fixture = openMemorySourceFixture();
  const source = {
    ...fixture.source,
    deriveNextEventSeqFromRetained: (subscription: string) => {
      fixture.deriveNextEventSeqFromRetained(subscription);
    },
    independentJournalHistoryFor: () => fixture.independentJournalHistoryFor(),
    routeJournalEventToIndependent: (eventId: string) =>
      fixture.routeJournalEventToIndependent(eventId),
    storeDependencyById: (dependency: StoredDependency) => {
      fixture.storeDependencyById(dependency);
    },
    insertSubtree: (copy: SubtreeCopy, stamp: WriteStamp) =>
      fixture.source.uow.run(async ({ stores }) => {
        await stores.subtrees.insertSubtree(copy, stamp);
        return { commit: true, value: undefined };
      }),
  };
  return { ...source, journal: transactionalJournal(source as MemorySource) };
}

function readersOf(source: MemorySource): SourceReaders {
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

async function throwAfterMemoryCleanup(failure: unknown, source: MemorySource): Promise<never> {
  try {
    await source.close();
  } catch (cleanupFailure) {
    throw new AggregateError(
      [failure, cleanupFailure],
      'memory source setup and cleanup both failed',
      { cause: cleanupFailure },
    );
  }
  throw failure;
}

async function seedMemorySource(
  openSource: OpenSource = openConformanceMemorySource,
  finishSeed?: (source: MemorySource) => Promise<void>,
): Promise<MemorySource> {
  const source = openSource();
  try {
    const { stores } = source;
    const seed = DETERMINISTIC_SEED;
    for (const [index, ownerId] of seed.ownerIds.entries()) {
      const stamp = seed.stamps[index] ?? seed.stamps[0];
      await stores.users.create(
        {
          id: ownerId,
          username: `owner-${String(index + 1)}`,
          passwordHash: 'x',
          createdAt: stamp.at,
        },
        stamp,
      );
      const projectId = seed.projectIds[index] ?? seed.projectIds[0];
      const stepIds = seed.stepIds[index] ?? seed.stepIds[0];
      const starting = stepIds.map((id, stepIndex) => ({
        id,
        projectId,
        name: stepIndex === 0 ? 'Dev' : 'QA',
        position: (stepIndex + 1) * 10,
      }));
      await stores.projects.create(
        projectRow({
          id: projectId,
          ownerId,
          name: `Project ${String(index + 1)}`,
          createdAt: stamp.at,
        }),
        starting,
        stamp,
      );
      for (const step of starting) await stores.steps.add(step, stamp);
      const workItemIds = seed.workItemIds[index] ?? seed.workItemIds[0];
      for (const [rowIndex, id] of workItemIds.entries()) {
        await stores.workItems.insert(
          workItemRow({ id, projectId, name: `Work ${String(rowIndex + 1)}` }),
          [],
          stamp,
        );
      }
    }
    for (const [index, teamId] of seed.teamIds.entries()) {
      await stores.directory.addTeam(
        { id: teamId, name: `Team ${String(index + 1)}` },
        seed.stamps[0],
      );
    }
    await stores.directory.addTag({ id: seed.tagIds[0], name: 'Tag 1' }, seed.stamps[0]);
    await stores.directory.addService(
      { id: seed.serviceIds[0], name: 'Service 1' },
      seed.stamps[0],
    );
    await stores.directory.addWorkItemType({ id: seed.typeIds[0], name: 'Type 1' }, seed.stamps[0]);
    for (const [index, personId] of seed.personIds.entries()) {
      await stores.directory.addPerson(
        { id: personId, name: `Person ${String(index + 1)}` },
        [seed.teamIds[index] ?? seed.teamIds[0]],
        seed.stamps[0],
      );
    }
    await verifyMemorySeed(source);
    await finishSeed?.(source);
    return source;
  } catch (failure) {
    return await throwAfterMemoryCleanup(failure, source);
  }
}

async function verifyMemorySeed(source: MemorySource): Promise<void> {
  const seed = DETERMINISTIC_SEED;
  for (const [index, projectId] of seed.projectIds.entries()) {
    expect(await source.stores.projects.findById(projectId)).toMatchObject({
      id: projectId,
      ownerId: seed.ownerIds[index],
      name: `Project ${String(index + 1)}`,
    });
    expect((await source.stores.workItems.listByProject(projectId)).map(({ id }) => id)).toEqual([
      ...seed.workItemIds[index],
    ]);
  }
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

function memoryFixture<Family extends ExistingFamily>(
  source: MemorySource,
  family: Family,
  caseId: CaseId,
): CaseFixture<TransactionalStores[Family]> {
  return {
    fixtureId: `memory:${caseId}`,
    port: source.stores[family],
    journalAppender: source.journal,
    seed: DETERMINISTIC_SEED,
    readers: readersOf(source),
    scenario: { kind: 'ordinary' },
    close: () => source.close(),
  };
}

async function openMemoryCase<Family extends ExistingFamily>(
  family: Family,
  caseId: CaseId,
  openSource: OpenSource = openConformanceMemorySource,
): Promise<CaseFixture<TransactionalStores[Family]>> {
  const lateControl =
    family === 'subtrees' && caseId === 'subtrees.insertSubtree:late-failure'
      ? memoryLateWriteControl('subtree-final-satellite')
      : family === 'journal' && caseId === 'journal.append:history-atomic'
        ? memoryLateWriteControl('journal-history-insert')
        : null;
  const selectedOpen = lateControl === null ? openSource : () => memoryLateSource(lateControl);
  const source = await seedMemorySource(selectedOpen, async (seeded) => {
    if (family === 'progress') await seedProgressStep(seeded);
    if (family === 'dependencies') await seedDependencyWorkItems(seeded);
    if (family === 'subtrees') await seedSubtreeRecords(seeded);
  });
  if (family === 'subtrees') {
    return {
      fixtureId: `memory:${caseId}`,
      port: transactionalSubtrees(source),
      journalAppender: source.journal,
      seed: DETERMINISTIC_SEED,
      readers: readersOf(source),
      scenario:
        lateControl === null
          ? { kind: 'ordinary' }
          : {
              kind: 'late-write',
              point: 'subtree-final-satellite',
              arm: () => {
                lateControl.arm();
              },
              reached: () => lateControl.reached(),
            },
      close: () => source.close(),
    } as unknown as CaseFixture<TransactionalStores[Family]>;
  }
  if (family === 'journal') {
    return {
      fixtureId: `memory:${caseId}`,
      port: source.journal,
      journalAppender: source.journal,
      seed: DETERMINISTIC_SEED,
      readers: readersOf(source),
      scenario:
        lateControl === null
          ? { kind: 'ordinary' }
          : {
              kind: 'late-write',
              point: 'journal-history-insert',
              arm: () => {
                lateControl.arm();
              },
              reached: () => lateControl.reached(),
            },
      close: () => source.close(),
    } as unknown as CaseFixture<TransactionalStores[Family]>;
  }
  return memoryFixture(source, family, caseId);
}

async function seedProgressStep(source: MemorySource): Promise<void> {
  await source.stores.steps.add(
    {
      id: PROGRESS_SENTINEL_STEP_ID,
      projectId: DETERMINISTIC_SEED.projectIds[0],
      name: 'Review',
    },
    DETERMINISTIC_SEED.stamps[0],
  );
}

async function seedDependencyWorkItems(source: MemorySource): Promise<void> {
  for (const [index, id] of DEPENDENCY_SURVIVOR_IDS.entries()) {
    await source.stores.workItems.insert(
      workItemRow({
        id,
        projectId: DETERMINISTIC_SEED.projectIds[0],
        name: `Dependency survivor ${String(index + 1)}`,
        position: (index + 3) * 10,
      }),
      [],
      DETERMINISTIC_SEED.stamps[0],
    );
  }
  expect(
    (await source.stores.workItems.listByProject(DETERMINISTIC_SEED.projectIds[0]))
      .map(({ id }) => id)
      .toSorted(),
  ).toEqual([...DETERMINISTIC_SEED.workItemIds[0], ...DEPENDENCY_SURVIVOR_IDS].toSorted());
}

async function seedSubtreeRecords(source: MemorySource): Promise<void> {
  const seeded = subtreeSeedRecords(DETERMINISTIC_SEED);
  for (const row of seeded.estimates)
    await source.stores.estimates.set(structuredClone(row), DETERMINISTIC_SEED.stamps[0]);
  for (const row of seeded.actuals)
    await source.stores.actuals.set(structuredClone(row), DETERMINISTIC_SEED.stamps[0]);
  for (const row of seeded.progress)
    await source.stores.progress.set(structuredClone(row), DETERMINISTIC_SEED.stamps[0]);
  for (const row of seeded.measures)
    await source.stores.measures.set(structuredClone(row), DETERMINISTIC_SEED.stamps[0]);
  for (const row of seeded.assignments) {
    expect(
      await source.stores.directory.assign(
        row.workItemId,
        row.stepId,
        row.personId,
        DETERMINISTIC_SEED.stamps[0],
      ),
    ).toEqual({ ok: true });
  }
  for (const row of seeded.dependencies)
    await source.stores.dependencies.add(structuredClone(row), DETERMINISTIC_SEED.stamps[0]);
}

function transactionalSubtrees(source: MemorySource): SubtreeStore {
  return {
    insertSubtree: (copy, stamp) => source.insertSubtree(copy, stamp),
  };
}

function transactionalJournal(source: MemorySource): CommandJournalStore {
  const commit = (write: (journal: CommandJournalStore) => Promise<void>) =>
    source.uow.run(async ({ stores }) => {
      await write(stores.journal);
      return { commit: true, value: undefined };
    });
  return {
    append: (entry, event) => commit((journal) => journal.append(entry, event)),
    entriesFor: (projectId, userId) => source.stores.journal.entriesFor(projectId, userId),
    flip: (id, undone, preconditions) =>
      commit((journal) => journal.flip(id, undone, preconditions)),
    restamp: (id, preconditions) => commit((journal) => journal.restamp(id, preconditions)),
    discard: (id) => commit((journal) => journal.discard(id)),
    stateOf: (projectId, userId) => source.stores.journal.stateOf(projectId, userId),
  };
}

function memoryLateSource(
  control: MemoryLateWriteControl<MemoryLateWritePoint>,
  reachProof?: () => void,
): MemorySource {
  const fixture = openMemorySourceWithLateWriteSeam({
    reach(phase, evidence) {
      if (control.reachStagedWrite(phase, evidence)) {
        reachProof?.();
        throw new Error(`injected memory fault at ${phase}`);
      }
    },
  });
  return {
    ...fixture.source,
    deriveNextEventSeqFromRetained: (subscription) => {
      fixture.deriveNextEventSeqFromRetained(subscription);
    },
    independentJournalHistoryFor: () => fixture.independentJournalHistoryFor(),
    routeJournalEventToIndependent: (eventId) => fixture.routeJournalEventToIndependent(eventId),
    storeDependencyById: (dependency) => {
      fixture.storeDependencyById(dependency);
    },
    insertSubtree: (copy, stamp) =>
      fixture.source.uow.run(async ({ stores }) => {
        await stores.subtrees.insertSubtree(copy, stamp);
        return { commit: true, value: undefined };
      }),
    journal: transactionalJournal(fixture.source as MemorySource),
  };
}

const openers: ExistingStoreOpeners = {
  projects: (caseId) => openMemoryCase('projects', caseId),
  users: (caseId) => openMemoryCase('users', caseId),
  capacity: (caseId) => openMemoryCase('capacity', caseId),
  priorityBands: (caseId) => openMemoryCase('priorityBands', caseId),
  calendarMarkers: (caseId) => openMemoryCase('calendarMarkers', caseId),
  workItems: (caseId) => openMemoryCase('workItems', caseId),
  steps: (caseId) => openMemoryCase('steps', caseId),
  estimates: (caseId) => openMemoryCase('estimates', caseId),
  actuals: (caseId) => openMemoryCase('actuals', caseId),
  measures: (caseId) => openMemoryCase('measures', caseId),
  progress: (caseId) => openMemoryCase('progress', caseId),
  dependencies: (caseId) => openMemoryCase('dependencies', caseId),
  directory: (caseId) => openMemoryCase('directory', caseId),
  eventLog: (caseId) => openMemoryCase('eventLog', caseId),
  planEvents: (caseId) => openMemoryCase('planEvents', caseId),
  subtrees: (caseId) => openMemoryCase('subtrees', caseId),
  journal: (caseId) => openMemoryCase('journal', caseId),
};

const unknownStepGap = {
  caseId: 'estimates.set:unknown_step' as const,
  reason: 'the memory estimate fixture does not validate step references',
  evidence: {
    sourceRevision: '3161e5fc',
    assertion: 'estimate set returns unknown_step for an absent step',
    observedFailure: 'Expected: "unknown_step"\nReceived: "written"',
  },
};

const actualUnknownStepGap = {
  caseId: 'actuals.set:unknown_step' as const,
  reason: 'the memory actual fixture does not validate step references',
  evidence: {
    sourceRevision: '686ea2bb',
    assertion: 'actual set refuses an absent step without changing either project',
    observedFailure: `-   "outcome": "unknown_step",
+   "outcome": "written",
    "projectA": [
+     {
+       "days": 13,
+       "recordedAt": 201,
+       "stepId": "no-such-step",
+       "workItemId": "work-a-one",
+     },`,
  },
};

const measureUnknownStepGap = {
  caseId: 'measures.set:unknown_step' as const,
  reason: 'the memory measure fixture does not validate step references',
  evidence: {
    sourceRevision: '00a1a609',
    assertion: 'measure set refuses an absent step without changing either project',
    observedFailure: `-   "outcome": "unknown_step",
+   "outcome": "written",
    "projectA": [
+     {
+       "metric": "token_estimate",
+       "recordedAt": 201,
+       "stepId": "no-such-step",
+       "value": 21,
+       "workItemId": "work-a-one",
+     },`,
  },
};

const progressUnknownStepGap = {
  caseId: 'progress.set:unknown_step' as const,
  reason: 'the memory progress fixture does not validate step references',
  evidence: {
    sourceRevision: 'dca55563',
    assertion: 'progress set refuses an absent step without changing either project',
    observedFailure: `-   "outcome": "unknown_step",
+   "outcome": "written",
    "projectA": [
+     {
+       "state": "done",
+       "statedAt": 201,
+       "stepId": "no-such-step",
+       "workItemId": "work-a-one",
+     },`,
  },
};

const capacityMissingReferenceGap = {
  caseId: 'capacity.set:missing-reference' as const,
  reason: 'the memory capacity fixture does not hold project or team reference sets',
  evidence: {
    sourceRevision: '52f961b5',
    assertion: 'capacity set refuses missing project and team references',
    observedFailure: 'Expected  - 6\n+ Received  + 14',
  },
};

const priorityMissingProjectGap = {
  caseId: 'priorityBands.replace:missing-project' as const,
  reason: 'the memory priority-band fixture does not hold a project reference set',
  evidence: {
    sourceRevision: '52f961b5',
    assertion: 'priority-band replacement refuses a missing project',
    observedFailure: 'Expected  - 16\n+ Received  + 15',
  },
};

const knownGaps = [
  unknownStepGap,
  actualUnknownStepGap,
  measureUnknownStepGap,
  progressUnknownStepGap,
  capacityMissingReferenceGap,
  priorityMissingProjectGap,
];

const declaration: SourceDeclaration = {
  name: 'memory',
  revision: '3161e5fc',
  historyAdmission: 'independent-write',
  // This slice executes five families; Task 7.1 replaces this test boundary
  // with the complete source declaration before terminal certification.
  capabilities: {
    projects: { kind: 'offered', gaps: [], open: openers.projects },
    users: { kind: 'offered', gaps: [], open: openers.users },
    capacity: {
      kind: 'offered',
      gaps: [capacityMissingReferenceGap],
      open: openers.capacity,
    },
    priorityBands: {
      kind: 'offered',
      gaps: [priorityMissingProjectGap],
      open: openers.priorityBands,
    },
    calendarMarkers: { kind: 'offered', gaps: [], open: openers.calendarMarkers },
    workItems: { kind: 'offered', gaps: [], open: openers.workItems },
    steps: { kind: 'offered', gaps: [], open: openers.steps },
    estimates: { kind: 'offered', gaps: [unknownStepGap], open: openers.estimates },
    actuals: { kind: 'offered', gaps: [actualUnknownStepGap], open: openers.actuals },
    measures: { kind: 'offered', gaps: [measureUnknownStepGap], open: openers.measures },
    progress: { kind: 'offered', gaps: [progressUnknownStepGap], open: openers.progress },
    dependencies: { kind: 'offered', gaps: [], open: openers.dependencies },
    directory: { kind: 'offered', gaps: [], open: openers.directory },
    eventLog: { kind: 'offered', gaps: [], open: openers.eventLog },
    planEvents: { kind: 'offered', gaps: [], open: openers.planEvents },
    subtrees: { kind: 'offered', gaps: [], open: openers.subtrees },
    journal: { kind: 'offered', gaps: [], open: openers.journal },
  } as unknown as Capabilities,
};

function withStores(source: MemorySource, stores: Partial<TransactionalStores>): MemorySource {
  return { ...source, stores: { ...source.stores, ...stores } };
}

const capacityProjectTeamFault = defineFault({
  id: 'break:capacity.set:project-team-key',
  caseId: 'capacity.set:project-team-key',
  createControl: () => createFaultControl('capacity.set:project-team-key'),
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
    return withStores(source, {
      capacity: replaceMethod(source.stores.capacity, 'set', (set) => {
        return (projectId, teamId, size, stamp) =>
          set(
            projectId,
            teamId,
            size === null && control.reach('capacity.set:clear') ? 0 : size,
            stamp,
          );
      }),
    });
  },
});

const priorityDefaultsFault = defineFault({
  id: 'break:priorityBands.listFor:defaults',
  caseId: 'priorityBands.listFor:defaults',
  createControl: () => createFaultControl('priorityBands.listFor:defaults'),
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
          await replace(DETERMINISTIC_SEED.projectIds[1], DEFAULT_PRIORITY_BANDS, stamp);
          return replace(projectId, bands, stamp);
        };
      }),
    });
  },
});

const markerOrderFault = defineFault({
  id: 'break:calendarMarkers.listFor:total-order',
  caseId: 'calendarMarkers.listFor:total-order',
  createControl: () => createFaultControl('calendarMarkers.listFor:total-order'),
  mutate(source: MemorySource, control) {
    const insertion = new Map<string, number>();
    let next = 0;
    const calendarMarkers = replaceMethod(
      source.stores.calendarMarkers,
      'create',
      (create) => async (marker) => {
        const written = await create(marker);
        if (written.ok) {
          insertion.set(marker.id, next);
          next += 1;
        }
        return written;
      },
    );
    return withStores(source, {
      calendarMarkers: replaceMethod(calendarMarkers, 'listFor', (listFor) => {
        return async (projectId) => {
          const markers = await listFor(projectId);
          if (!control.reach('calendarMarkers.listFor:total-order')) return markers;
          return markers.toSorted(
            (left, right) =>
              left.date.localeCompare(right.date) ||
              left.createdAt - right.createdAt ||
              (insertion.get(left.id) ?? -1) - (insertion.get(right.id) ?? -1),
          );
        };
      }),
    });
  },
});

const markerProjectScopeFault = defineFault({
  id: 'break:calendarMarkers.write:project-scope',
  caseId: 'calendarMarkers.write:project-scope',
  createControl: () => createFaultControl('calendarMarkers.write:project-scope:project-predicate'),
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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

const createUniqueNameFault = defineFault({
  id: 'break:users.create:unique-name',
  caseId: 'users.create:unique-name',
  createControl: () => createFaultControl('users.create:unique-name'),
  mutate(source: MemorySource, control) {
    const accounts = new Map<string, User>();
    return withStores(source, {
      users: replaceMethod(source.stores.users, 'create', (create) => async (user, stamp) => {
        const existing = accounts.get(user.username);
        if (existing !== undefined && control.reach('users.create:unique-name')) {
          Object.assign(existing, user);
          return user;
        }
        const created = await create(user, stamp);
        if (created !== null) accounts.set(user.username, user);
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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

const insertRespaceFault = defineFault({
  id: 'break:workItems.insert:respace',
  caseId: 'workItems.insert:respace',
  createControl: () => createFaultControl('workItems.insert:respace'),
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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

const frozenAcquireFault = defineFault({
  id: 'break:workItems.setFrozenNumbers:clear',
  caseId: 'workItems.setFrozenNumbers:clear',
  createControl: () => createFaultControl('workItems.setFrozenNumbers:clear:first-freeze'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      workItems: replaceMethod(
        source.stores.workItems,
        'setFrozenNumbers',
        (setFrozenNumbers) => (updates, stamp) => {
          const firstId = DETERMINISTIC_SEED.workItemIds[0][0];
          const preventsFirstFreeze = updates.some(
            ({ id, frozenNumber }) => id === firstId && frozenNumber === '010',
          );
          if (!preventsFirstFreeze) return setFrozenNumbers(updates, stamp);
          control.reach('workItems.setFrozenNumbers:clear:first-freeze');
          // Proof: retaining `010` here restored the focused fault to
          // assertion-passed; null reaches the real source and its bookkeeping.
          return setFrozenNumbers(
            updates.map((update) =>
              update.id === firstId ? { ...update, frozenNumber: null } : update,
            ),
            stamp,
          );
        },
      ),
    });
  },
});

const frozenClearFault = defineFault({
  id: 'break:workItems.setFrozenNumbers:clear',
  caseId: 'workItems.setFrozenNumbers:clear',
  createControl: () => createFaultControl('workItems.setFrozenNumbers:clear'),
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
    return withStores(source, {
      actuals: replaceMethod(source.stores.actuals, 'set', (set) => {
        return (actual, stamp) => {
          if (actual.stepId === 'no-such-step') control.reach('actuals.set:unknown_step');
          return set(actual, stamp);
        };
      }),
    });
  },
});

const measureSetPairIdentityFault = defineFault({
  id: 'break:measures.set:metric-key',
  caseId: 'measures.set:metric-key',
  createControl: () => createFaultControl('measures.set:metric-key'),
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
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
  mutate(source: MemorySource, control) {
    return withStores(source, {
      measures: replaceMethod(source.stores.measures, 'set', (set) => {
        return (measure, stamp) => {
          if (measure.stepId === 'no-such-step') control.reach('measures.set:unknown_step');
          return set(measure, stamp);
        };
      }),
    });
  },
});

const progressReplaceFault = defineFault({
  id: 'break:progress.set:replace',
  caseId: 'progress.set:replace',
  createControl: () => createFaultControl('progress.set:replace'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      progress: replaceMethod(source.stores.progress, 'set', (set) => {
        return (progress, stamp) =>
          set(
            progress.statedAt === 201 && control.reach('progress.set:replace')
              ? { ...progress, state: 'in_progress', statedAt: 101 }
              : progress,
            stamp,
          );
      }),
    });
  },
});

const progressNotStartedSurrogateFault = defineFault({
  id: 'break:progress.remove:absence',
  caseId: 'progress.remove:absence',
  createControl: () => createFaultControl('progress.remove:absence'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      progress: replaceMethod(source.stores.progress, 'remove', (remove) => {
        return async (workItemId, stepId, stamp) => {
          await remove(workItemId, stepId, stamp);
          if (!control.reach('progress.remove:absence')) return;
          // Test boundary: the fault must cross the precise port with the
          // invalid stored value that production types deliberately exclude.
          const surrogate = {
            workItemId,
            stepId,
            state: 'not_started',
            statedAt: 201,
          } as unknown as StoredProgress;
          await source.stores.progress.set(surrogate, stamp);
        };
      }),
    });
  },
});

const progressMoveOwnershipFault = defineFault({
  id: 'break:progress.moveAll:ownership',
  caseId: 'progress.moveAll:ownership',
  createControl: () => createFaultControl('progress.moveAll:ownership'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      progress: replaceMethod(source.stores.progress, 'moveAll', (moveAll) => {
        return async (fromWorkItemId, toWorkItemId, stamp) => {
          if (!control.reach('progress.moveAll:ownership')) {
            return moveAll(fromWorkItemId, toWorkItemId, stamp);
          }
          const rows = await source.stores.progress.listByProject(DETERMINISTIC_SEED.projectIds[0]);
          for (const progress of rows.filter(({ workItemId }) => workItemId === fromWorkItemId)) {
            await source.stores.progress.set({ ...progress, workItemId: toWorkItemId }, stamp);
          }
        };
      }),
    });
  },
});

const progressUnknownStepFault = defineFault({
  id: 'break:progress.set:unknown_step',
  caseId: 'progress.set:unknown_step',
  createControl: () => createFaultControl('progress.set:unknown_step'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      progress: replaceMethod(source.stores.progress, 'set', (set) => {
        return (progress, stamp) => {
          if (progress.stepId === 'no-such-step') control.reach('progress.set:unknown_step');
          return set(progress, stamp);
        };
      }),
    });
  },
});

const dependencyIdFault = defineFault({
  id: 'break:dependencies.add:idempotent-pair',
  caseId: 'dependencies.add:idempotent-pair',
  createControl: () => createFaultControl('dependencies.add:idempotent-pair:edge-id'),
  mutate(source: MemorySource, control) {
    let setupAdds = 0;
    return withStores(source, {
      dependencies: replaceMethod(source.stores.dependencies, 'add', (add) => {
        return async (dependency, stamp) => {
          if (dependency.id !== 'dependency-idempotent-second-id') {
            setupAdds += 1;
            if (control.reached()) throw new Error('dependency ID fault reached during setup');
            return add(dependency, stamp);
          }
          if (setupAdds !== 3)
            throw new Error(`dependency ID fault saw ${String(setupAdds)} setup adds`);
          control.reach('dependencies.add:idempotent-pair:edge-id');
          source.storeDependencyById(dependency);
          const storedPair = (await source.stores.dependencies.listByProject(dependency.projectId))
            .filter(
              (edge) =>
                edge.predecessorId === dependency.predecessorId &&
                edge.successorId === dependency.successorId,
            )
            .toSorted((left, right) => left.id.localeCompare(right.id));
          // Proof: disabling the source-owned ID insert left only the complete
          // original edge here; the focused proof then rejected the missing
          // second-ID record before it could claim the shared extra-edge diff.
          expect(storedPair).toEqual([
            { ...dependency, id: 'dependency-idempotent-original' },
            dependency,
          ]);
        };
      }),
    });
  },
});

const dependencyInputMutationFault = defineFault({
  id: 'break:dependencies.add:idempotent-pair',
  caseId: 'dependencies.add:idempotent-pair',
  createControl: () => createFaultControl('dependencies.add:idempotent-pair:input-id'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      dependencies: replaceMethod(source.stores.dependencies, 'add', (add) => {
        return (dependency, stamp) => {
          if (dependency.id === 'dependency-idempotent-original') {
            control.reach('dependencies.add:idempotent-pair:input-id');
            dependency.id = 'dependency-idempotent-mutated';
          }
          return add(dependency, stamp);
        };
      }),
    });
  },
});

const directoryAssignmentsOfSubsetFault = defineFault({
  id: 'break:directory.assign:scope-replace-clear',
  caseId: 'directory.assign:scope-replace-clear',
  createControl: () => createFaultControl('directory.assign:scope-replace-clear:subset'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      directory: replaceMethod(source.stores.directory, 'assignmentsOf', (assignmentsOf) => {
        return (workItemIds) => {
          const requested = DETERMINISTIC_SEED.workItemIds[0];
          if (
            workItemIds.length !== requested.length ||
            !requested.every((id, index) => workItemIds[index] === id)
          ) {
            return assignmentsOf(workItemIds);
          }
          control.reach('directory.assign:scope-replace-clear:subset');
          // Proof: forwarding only workItemIds made this focused fault
          // assertion-passed; this real reader call ignores the strict subset.
          return assignmentsOf([...workItemIds, DETERMINISTIC_SEED.workItemIds[1][0]]);
        };
      }),
    });
  },
});

const directoryAssignmentScopeFault = defineFault({
  id: 'break:directory.assign:scope-replace-clear',
  caseId: 'directory.assign:scope-replace-clear',
  createControl: () => createFaultControl('directory.assign:scope-replace-clear:pair-scope'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      directory: replaceMethod(source.stores.directory, 'assign', (assign) => {
        return async (workItemId, stepId, personId, stamp) => {
          if (
            workItemId !== DETERMINISTIC_SEED.workItemIds[0][0] ||
            stepId !== DETERMINISTIC_SEED.stepIds[0][0] ||
            personId !== DETERMINISTIC_SEED.personIds[1]
          ) {
            return assign(workItemId, stepId, personId, stamp);
          }
          control.reach('directory.assign:scope-replace-clear:pair-scope');
          // Proof: omitting this real collateral clear changed the fault result
          // from observed to assertion-passed in the focused proof.
          await source.stores.directory.assign(
            DETERMINISTIC_SEED.workItemIds[0][1],
            stepId,
            null,
            stamp,
          );
          return assign(workItemId, stepId, personId, stamp);
        };
      }),
    });
  },
});

const directoryTeamAtomicityFault = defineFault({
  id: 'break:directory.patchTeam:atomic-refusal',
  caseId: 'directory.patchTeam:atomic-refusal',
  createControl: () => createFaultControl('directory.patchTeam:atomic-refusal:early-rename'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      directory: replaceMethod(source.stores.directory, 'patchTeam', (patchTeam) => {
        return async (teamId, patch, stamp) => {
          if (
            teamId !== DETERMINISTIC_SEED.teamIds[0] ||
            patch.name !== 'Directory escaped' ||
            patch.serviceIds?.[0] !== 'directory-unknown-service'
          ) {
            return patchTeam(teamId, patch, stamp);
          }
          expect(await patchTeam(teamId, { name: patch.name }, stamp)).toEqual({
            ok: true,
            team: {
              id: teamId,
              name: 'Directory escaped',
              serviceIds: [DETERMINISTIC_SEED.serviceIds[0]],
            },
            projectIds: [],
          });
          // Proof: omitting this real early rename made this public snapshot
          // receive Directory original where Directory escaped was expected.
          expect(
            (await source.stores.directory.listTeams())
              .map((team) => ({ ...team, serviceIds: team.serviceIds.toSorted() }))
              .toSorted((left, right) => left.id.localeCompare(right.id)),
          ).toEqual([
            {
              id: DETERMINISTIC_SEED.teamIds[0],
              name: 'Directory escaped',
              serviceIds: [DETERMINISTIC_SEED.serviceIds[0]],
            },
            {
              id: DETERMINISTIC_SEED.teamIds[1],
              name: 'Team 2',
              serviceIds: ['directory-service-sentinel'],
            },
          ]);
          control.reach('directory.patchTeam:atomic-refusal:early-rename');
          return patchTeam(teamId, patch, stamp);
        };
      }),
    });
  },
});

const dependencyPairPredicateFault = defineFault({
  id: 'break:dependencies.remove:pair',
  caseId: 'dependencies.remove:pair',
  createControl: () => createFaultControl('dependencies.remove:pair:successor-predicate'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      dependencies: replaceMethod(source.stores.dependencies, 'remove', (remove) => {
        return async (predecessorId, successorId, stamp) => {
          if (!control.reach('dependencies.remove:pair:successor-predicate')) {
            return remove(predecessorId, successorId, stamp);
          }
          const edges = (
            await Promise.all(
              DETERMINISTIC_SEED.projectIds.map((projectId) =>
                source.stores.dependencies.listByProject(projectId),
              ),
            )
          ).flat();
          for (const edge of edges.filter((edge) => edge.predecessorId === predecessorId)) {
            await remove(edge.predecessorId, edge.successorId, stamp);
          }
        };
      }),
    });
  },
});

const dependencyOutgoingOnlyFault = defineFault({
  id: 'break:dependencies.removeAllFor:touching-set',
  caseId: 'dependencies.removeAllFor:touching-set',
  createControl: () => createFaultControl('dependencies.removeAllFor:touching-set:outgoing-only'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      dependencies: replaceMethod(source.stores.dependencies, 'removeAllFor', (removeAllFor) => {
        return async (workItemIds, stamp) => {
          if (!control.reach('dependencies.removeAllFor:touching-set:outgoing-only')) {
            return removeAllFor(workItemIds, stamp);
          }
          const doomed = new Set(workItemIds);
          const edges = await source.stores.dependencies.listByProject(
            DETERMINISTIC_SEED.projectIds[0],
          );
          for (const edge of edges.filter((edge) => doomed.has(edge.predecessorId))) {
            await source.stores.dependencies.remove(edge.predecessorId, edge.successorId, stamp);
          }
        };
      }),
    });
  },
});

const dependencyIncompleteSetFault = defineFault({
  id: 'break:dependencies.removeAllFor:touching-set',
  caseId: 'dependencies.removeAllFor:touching-set',
  createControl: () => createFaultControl('dependencies.removeAllFor:touching-set:first-only'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      dependencies: replaceMethod(source.stores.dependencies, 'removeAllFor', (removeAllFor) => {
        return (workItemIds, stamp) =>
          removeAllFor(
            control.reach('dependencies.removeAllFor:touching-set:first-only')
              ? workItemIds.slice(0, 1)
              : workItemIds,
            stamp,
          );
      }),
    });
  },
});

const eventRetainedMaximumFault = defineFault({
  id: 'break:eventLog.pruneBeyond:empty-sequence',
  caseId: 'eventLog.pruneBeyond:empty-sequence',
  createControl: () => createFaultControl('eventLog.pruneBeyond:empty-sequence:next-record'),
  mutate(source: MemorySource, control) {
    let didPruneToEmpty = false;
    const eventLog = replaceMethod(source.stores.eventLog, 'pruneBeyond', (pruneBeyond) => {
      return async (maximum) => {
        const removed = await pruneBeyond(maximum);
        if (control.isArmed() && maximum === 0) didPruneToEmpty = true;
        return removed;
      };
    });
    return withStores(source, {
      eventLog: replaceMethod(eventLog, 'recordEvent', (recordEvent) => {
        return async (subscription, message, createdAt) => {
          if (!didPruneToEmpty) return recordEvent(subscription, message, createdAt);
          source.deriveNextEventSeqFromRetained(subscription);
          const recorded = await recordEvent(subscription, message, createdAt);
          control.reach('eventLog.pruneBeyond:empty-sequence:next-record');
          const retained = await source.stores.eventLog.rangeSince(subscription, -1);
          const latest = await source.stores.eventLog.latestSeq(subscription);
          if (
            retained.length !== 1 ||
            retained[0]?.seq !== recorded.seq ||
            latest !== recorded.seq
          ) {
            throw new Error('retained-MAX fault did not persist its returned sequence');
          }
          return recorded;
        };
      }),
    });
  },
});

function task52JournalEntry(
  id: 'flip-target' | 'flip-peer' | 'flip-other-project',
  undone: boolean,
  expectedRevision?: number,
  fromRevision?: number,
): JournalEntry {
  const isTarget = id === 'flip-target';
  const isPeer = id === 'flip-peer';
  const createdAt = isTarget ? 101 : isPeer ? 102 : 103;
  const projectId = id === 'flip-other-project' ? 'project-b' : 'project-a';
  const userId = id === 'flip-other-project' ? 'owner-b' : 'owner-a';
  const revisionKey = isTarget ? 'work-a-one' : isPeer ? 'work-a-two' : id;
  return {
    id,
    projectId,
    userId,
    seq: isPeer ? 2 : 1,
    kind: 'rename',
    payload: { label: `Rename ${id}`, forward: { type: 'rename', name: `After ${id}` } },
    inverse: { type: 'rename', name: `Before ${id}` },
    preconditions: {
      expected: { [revisionKey]: expectedRevision ?? createdAt },
      from: { [revisionKey]: fromRevision ?? createdAt - 1 },
    },
    undone,
    createdAt,
  };
}

function task52FlipHistory(): [PlanEvent[], PlanEvent[]] {
  const expectedEvent = (
    id: 'flip-target' | 'flip-peer' | 'flip-other-project',
    createdAt: number,
  ): PlanEvent => ({
    id: `event-${id}`,
    projectId: id === 'flip-other-project' ? 'project-b' : 'project-a',
    userId: id === 'flip-other-project' ? 'owner-b' : 'owner-a',
    kind: 'rename',
    label: `Rename ${id}`,
    workItemId: `${id}-work`,
    stepId: null,
    before: { type: 'rename', name: `Before ${id}` },
    after: { type: 'rename', name: `After ${id}` },
    createdAt,
  });
  return [
    [expectedEvent('flip-peer', 102), expectedEvent('flip-target', 101)],
    [expectedEvent('flip-other-project', 103)],
  ];
}

async function readTask52FlipState(source: MemorySource) {
  return {
    entries: await Promise.all([
      source.journal.entriesFor('project-a', 'owner-a'),
      source.journal.entriesFor('project-b', 'owner-b'),
    ]),
    states: await Promise.all([
      source.journal.stateOf('project-a', 'owner-a'),
      source.journal.stateOf('project-b', 'owner-b'),
    ]),
    history: await Promise.all([
      source.stores.planEvents.listFor('project-a', {}),
      source.stores.planEvents.listFor('project-b', {}),
    ]),
  };
}

const journalRetainedPreconditionsFault = defineFault({
  id: 'break:journal.flip:preconditions',
  caseId: 'journal.flip:preconditions',
  createControl: () => createFaultControl('journal.flip:preconditions:retain-old'),
  mutate(source: MemorySource, control) {
    return {
      ...source,
      journal: replaceMethod(source.journal, 'flip', (flip) => {
        return async (id, undone, preconditions) => {
          if (!control.isArmed() || id !== 'flip-target') return flip(id, undone, preconditions);
          // Proof: forwarding the supplied preconditions changed all four focused
          // memory fault outcomes from `observed` to `assertion-passed`.
          await flip(
            id,
            undone,
            structuredClone({ expected: { 'work-a-one': 11 }, from: { 'work-a-one': 10 } }),
          );
          expect(await readTask52FlipState(source)).toEqual({
            entries: [
              [
                task52JournalEntry('flip-target', true, 11, 10),
                task52JournalEntry('flip-peer', false, 12, 11),
              ],
              [task52JournalEntry('flip-other-project', false)],
            ],
            states: [
              { undoable: true, redoable: true },
              { undoable: true, redoable: false },
            ],
            history: task52FlipHistory(),
          });
          control.reach('journal.flip:preconditions:retain-old');
        };
      }),
    };
  },
});

const journalRestampFlipsFault = defineFault({
  id: 'break:journal.flip:preconditions',
  caseId: 'journal.flip:preconditions',
  createControl: () => createFaultControl('journal.flip:preconditions:restamp-flips'),
  mutate(source: MemorySource, control) {
    const flip = source.journal.flip.bind(source.journal);
    return {
      ...source,
      journal: replaceMethod(source.journal, 'restamp', (restamp) => {
        return async (id, preconditions) => {
          if (!control.isArmed() || id !== 'flip-target') return restamp(id, preconditions);
          // Proof: delegating to restamp preserved `undone: true` and changed the
          // four-fault reversal to four `assertion-passed` outcomes.
          await flip(id, false, structuredClone(preconditions));
          expect(await readTask52FlipState(source)).toEqual({
            entries: [
              [
                task52JournalEntry('flip-target', false, 31, 11),
                task52JournalEntry('flip-peer', false, 12, 11),
              ],
              [task52JournalEntry('flip-other-project', false)],
            ],
            states: [
              { undoable: true, redoable: false },
              { undoable: true, redoable: false },
            ],
            history: task52FlipHistory(),
          });
          control.reach('journal.flip:preconditions:restamp-flips');
        };
      }),
    };
  },
});

function task52PlanEvent(
  id: string,
  projectId: 'project-a' | 'project-b',
  userId: 'owner-a' | 'owner-b',
  workItemId: string | null,
  kind: string,
  createdAt: number,
): PlanEvent {
  return {
    id: `history-${projectId === 'project-a' ? 'a' : 'b'}-${id}`,
    projectId,
    userId,
    kind,
    label: `History history-${projectId === 'project-a' ? 'a' : 'b'}-${id}`,
    workItemId,
    stepId: null,
    before: { type: `undo_${kind}`, workItemId },
    after: { type: kind, workItemId },
    createdAt,
  };
}

function task52PlanEvents(): [PlanEvent[], PlanEvent[]] {
  return [
    [
      task52PlanEvent('101-wide', 'project-a', 'owner-a', null, 'freeze', 101),
      task52PlanEvent('100-z', 'project-a', 'owner-a', 'work-a-one', 'clear_estimate', 100),
      task52PlanEvent('100-m', 'project-a', 'owner-a', 'work-a-one', 'actual', 100),
      task52PlanEvent('100-a', 'project-a', 'owner-a', 'work-a-two', 'rename', 100),
      task52PlanEvent('99', 'project-a', 'owner-a', 'work-a-one', 'estimate', 99),
    ],
    [
      task52PlanEvent('101-wide', 'project-b', 'owner-b', null, 'freeze', 101),
      task52PlanEvent('100', 'project-b', 'owner-b', 'work-b-two', 'rename', 100),
      task52PlanEvent('99', 'project-b', 'owner-b', 'work-b-one', 'actual', 99),
    ],
  ];
}

function task52HistoryEntry(
  id: string,
  projectId: 'project-a' | 'project-b',
  userId: 'owner-a' | 'owner-b',
  seq: number,
  workItemId: string | null,
  kind: string,
  createdAt: number,
): JournalEntry {
  const prefix = projectId === 'project-a' ? 'a' : 'b';
  const journalId = `journal-${prefix}-${id}`;
  const eventId = `history-${prefix}-${id}`;
  return {
    id: journalId,
    projectId,
    userId,
    seq,
    kind,
    payload: { label: `History ${eventId}`, forward: { type: kind, workItemId } },
    inverse: { type: `undo_${kind}`, workItemId },
    preconditions: { expected: { [journalId]: createdAt }, from: {} },
    undone: false,
    createdAt,
  };
}

function task52HistoryJournals(): [JournalEntry[], JournalEntry[]] {
  return [
    [
      task52HistoryEntry('99', 'project-a', 'owner-a', 1, 'work-a-one', 'estimate', 99),
      task52HistoryEntry('100-z', 'project-a', 'owner-a', 2, 'work-a-one', 'clear_estimate', 100),
      task52HistoryEntry('100-a', 'project-a', 'owner-a', 3, 'work-a-two', 'rename', 100),
      task52HistoryEntry('100-m', 'project-a', 'owner-a', 4, 'work-a-one', 'actual', 100),
      task52HistoryEntry('101-wide', 'project-a', 'owner-a', 5, null, 'freeze', 101),
    ],
    [
      task52HistoryEntry('99', 'project-b', 'owner-b', 1, 'work-b-one', 'actual', 99),
      task52HistoryEntry('100', 'project-b', 'owner-b', 2, 'work-b-two', 'rename', 100),
      task52HistoryEntry('101-wide', 'project-b', 'owner-b', 3, null, 'freeze', 101),
    ],
  ];
}

async function readTask52HistoryState(source: MemorySource) {
  return {
    projectAEvents: await source.stores.planEvents.listFor('project-a', {}),
    projectBEvents: await source.stores.planEvents.listFor('project-b', {}),
    journals: await Promise.all([
      source.journal.entriesFor('project-a', 'owner-a'),
      source.journal.entriesFor('project-b', 'owner-b'),
    ]),
  };
}

const planEventsIgnoreItemFilterFault = defineFault({
  id: 'break:planEvents.listFor:filters-order',
  caseId: 'planEvents.listFor:filters-order',
  createControl: () => createFaultControl('planEvents.listFor:filters-order:ignore-item'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      planEvents: replaceMethod(source.stores.planEvents, 'listFor', (listFor) => {
        return async (projectId, filter) => {
          if (
            !control.isArmed() ||
            projectId !== 'project-a' ||
            filter.workItemId !== 'work-a-one' ||
            filter.kinds !== undefined
          ) {
            return listFor(projectId, filter);
          }
          // Proof: forwarding the item filter removed the leaked item-two event
          // and changed the four-fault reversal to `assertion-passed` throughout.
          const leaked = await listFor(projectId, {});
          expect(leaked).toEqual(task52PlanEvents()[0]);
          control.reach('planEvents.listFor:filters-order:ignore-item');
          return leaked;
        };
      }),
    });
  },
});

const planEventsInclusivePruneFault = defineFault({
  id: 'break:planEvents.pruneOlderThan:strict-cutoff',
  caseId: 'planEvents.pruneOlderThan:strict-cutoff',
  createControl: () => createFaultControl('planEvents.pruneOlderThan:strict-cutoff:inclusive'),
  mutate(source: MemorySource, control) {
    return withStores(source, {
      planEvents: replaceMethod(source.stores.planEvents, 'pruneOlderThan', (pruneOlderThan) => {
        return async (cutoff) => {
          if (!control.isArmed() || cutoff !== 100) return pruneOlderThan(cutoff);
          // Proof: forwarding cutoff 100 retained every cutoff row and changed
          // the four-fault reversal to four `assertion-passed` outcomes.
          const deletedCount = await pruneOlderThan(101);
          const [projectAEvents, projectBEvents] = task52PlanEvents();
          expect({ deletedCount, ...(await readTask52HistoryState(source)) }).toEqual({
            deletedCount: 6,
            projectAEvents: [projectAEvents[0]],
            projectBEvents: [projectBEvents[0]],
            journals: task52HistoryJournals(),
          });
          control.reach('planEvents.pruneOlderThan:strict-cutoff:inclusive');
          return deletedCount;
        };
      }),
    });
  },
});

const journalIndependentHistoryFault = defineFault({
  id: 'break:journal.append:history-atomic',
  caseId: 'journal.append:history-atomic',
  createControl: () => createFaultControl('journal.append:history-atomic:independent-history'),
  mutate(source: MemorySource, control) {
    return {
      ...source,
      journal: replaceMethod(source.journal, 'append', (append) => async (entry, event) => {
        // Proof: disabling only this adapter-owned route changed the permanent
        // four-fault result's first kind from `observed` to `assertion-passed`.
        if (!control.isArmed() || entry.id !== 'atomic-target') return append(entry, event);
        await append(entry, event);
        const moved = source.routeJournalEventToIndependent(event.id);
        expect(moved).toEqual(event);
        expect(await source.independentJournalHistoryFor()).toEqual([event]);
        expect(await source.journal.entriesFor(entry.projectId, entry.userId)).toContainEqual({
          ...entry,
          seq: 2,
          undone: false,
        });
        expect(await source.stores.planEvents.listFor(event.projectId, {})).not.toContainEqual(
          event,
        );
        control.reach('journal.append:history-atomic:independent-history');
      }),
    };
  },
});

const journalLateOutsideFault = defineFault({
  id: 'break:journal.append:history-atomic',
  caseId: 'journal.append:history-atomic',
  createControl: () => createFaultControl('journal.append:history-atomic:outside-owner'),
  mutate(source: MemorySource, control) {
    return {
      ...source,
      journal: replaceMethod(source.journal, 'append', (append) => async (entry, event) => {
        await append(entry, event);
        if (entry.id !== 'atomic-late-target') return;
        expect(await source.journal.entriesFor(entry.projectId, entry.userId)).toContainEqual({
          ...entry,
          seq: 3,
          undone: false,
        });
        expect(await source.stores.planEvents.listFor(event.projectId, {})).toContainEqual(event);
        control.reach('journal.append:history-atomic:outside-owner');
        throw new Error('injected memory journal-history-insert failure outside staged owner');
      }),
    };
  },
});

interface JournalIncompleteProbe {
  attempts: number;
  closeCalls: number;
  entries: JournalEntry[][] | null;
  history: PlanEvent[][] | null;
  independentHistory: PlanEvent[] | null;
}

function commitJournalWithoutLateHistory(
  source: MemorySource,
  probe: JournalIncompleteProbe,
): MemorySource {
  return {
    ...source,
    async close() {
      probe.closeCalls += 1;
      await source.close();
    },
    journal: replaceMethod(source.journal, 'append', (append) => async (entry, event) => {
      await append(entry, event);
      if (entry.id !== 'atomic-late-target') return;
      probe.attempts += 1;
      source.routeJournalEventToIndependent(event.id);
      probe.entries = await Promise.all([
        source.journal.entriesFor(DETERMINISTIC_SEED.projectIds[0], DETERMINISTIC_SEED.ownerIds[0]),
        source.journal.entriesFor(DETERMINISTIC_SEED.projectIds[0], DETERMINISTIC_SEED.ownerIds[1]),
        source.journal.entriesFor(DETERMINISTIC_SEED.projectIds[1], DETERMINISTIC_SEED.ownerIds[1]),
      ]);
      probe.history = await Promise.all(
        DETERMINISTIC_SEED.projectIds.map((projectId) =>
          source.stores.planEvents.listFor(projectId, {}),
        ),
      );
      probe.independentHistory = await source.independentJournalHistoryFor();
    }),
  };
}

function expectedAtomicEntry(
  id: string,
  projectId: string,
  userId: string,
  seq: number,
  createdAt: number,
): JournalEntry {
  return {
    id,
    projectId,
    userId,
    seq,
    kind: 'rename',
    payload: { label: `Rename ${id}`, forward: { type: 'rename', name: `After ${id}` } },
    inverse: { type: 'rename', name: `Before ${id}` },
    preconditions: { expected: { [id]: createdAt }, from: { [id]: createdAt - 1 } },
    undone: false,
    createdAt,
  };
}

function expectedAtomicEvent(
  id: string,
  projectId: string,
  userId: string,
  createdAt: number,
): PlanEvent {
  return {
    id: `event-${id}`,
    projectId,
    userId,
    kind: 'rename',
    label: `Rename ${id}`,
    workItemId: `${id}-work`,
    stepId: null,
    before: { type: 'rename', name: `Before ${id}` },
    after: { type: 'rename', name: `After ${id}` },
    createdAt,
  };
}

const journalCollateralActorFault = defineFault({
  id: 'break:journal.append:history-atomic',
  caseId: 'journal.append:history-atomic',
  createControl: () => createFaultControl('journal.append:history-atomic:collateral-actor'),
  mutate(source: MemorySource, control) {
    return {
      ...source,
      journal: replaceMethod(source.journal, 'append', (append) => async (entry, event) => {
        await append(entry, event);
        if (entry.id !== 'atomic-target') return;
        await source.journal.discard('atomic-sentinel-b');
        control.reach('journal.append:history-atomic:collateral-actor');
      }),
    };
  },
});

const journalReplacementCorruptionFault = defineFault({
  id: 'break:journal.append:account-redo-depth',
  caseId: 'journal.append:account-redo-depth',
  createControl: () => createFaultControl('journal.append:account-redo-depth:replacement-record'),
  mutate(source: MemorySource, control) {
    return {
      ...source,
      journal: replaceMethod(source.journal, 'append', (append) => async (entry, event) => {
        if (entry.id !== 'redo-a-replacement') return append(entry, event);
        await append({ ...entry, inverse: { broken: 'replacement inverse' } }, event);
        control.reach('journal.append:account-redo-depth:replacement-record');
      }),
    };
  },
});

function expectedActorBRedo() {
  return {
    id: 'redo-b',
    projectId: DETERMINISTIC_SEED.projectIds[0],
    userId: DETERMINISTIC_SEED.ownerIds[1],
    seq: 1,
    kind: 'rename' as const,
    payload: { label: 'Rename redo-b', forward: { type: 'rename', name: 'After redo-b' } },
    inverse: { type: 'rename', name: 'Before redo-b' },
    preconditions: { expected: { 'redo-b': 900 }, from: { 'redo-b': 899 } },
    undone: true,
    createdAt: 102,
  };
}

const journalBroadRedoFault = defineFault({
  id: 'break:journal.append:account-redo-depth',
  caseId: 'journal.append:account-redo-depth',
  createControl: () => createFaultControl('journal.append:account-redo-depth:all-redo'),
  mutate(source: MemorySource, control) {
    return {
      ...source,
      journal: replaceMethod(source.journal, 'append', (append) => async (entry, event) => {
        await append(entry, event);
        if (entry.id !== 'redo-a-replacement') return;
        expect(
          await source.journal.entriesFor(
            DETERMINISTIC_SEED.projectIds[0],
            DETERMINISTIC_SEED.ownerIds[1],
          ),
        ).toEqual([expectedActorBRedo()]);
        await source.journal.discard('redo-b');
        control.reach('journal.append:account-redo-depth:all-redo');
      }),
    };
  },
});

const journalHistoryPruneFault = defineFault({
  id: 'break:journal.append:account-redo-depth',
  caseId: 'journal.append:account-redo-depth',
  createControl: () => createFaultControl('journal.append:account-redo-depth:history-prune'),
  mutate(source: MemorySource, control) {
    return {
      ...source,
      journal: replaceMethod(source.journal, 'append', (append) => async (entry, event) => {
        await append(entry, event);
        if (entry.id !== 'depth-50') return;
        await source.stores.planEvents.pruneOlderThan(350);
        control.reach('journal.append:account-redo-depth:history-prune');
      }),
    };
  },
});

const subtreeDependencyBackingFault = defineFault({
  id: 'break:subtrees.insertSubtree:complete-copy',
  caseId: 'subtrees.insertSubtree:complete-copy',
  createControl: () => createFaultControl('subtrees.insertSubtree:complete-copy:dependencies'),
  mutate(source: MemorySource, control) {
    const isolated = inMemoryDependencies();
    return {
      ...source,
      async insertSubtree(copy, stamp) {
        if (!control.isArmed()) return source.insertSubtree(copy, stamp);
        await source.insertSubtree({ ...copy, dependencies: [] }, stamp);
        for (const dependency of copy.dependencies)
          await isolated.add(structuredClone(dependency), stamp);
        expect(await isolated.listByProject(DETERMINISTIC_SEED.projectIds[0])).toEqual([
          ...copy.dependencies,
        ]);
        // Proof: removing only this complete-state prerequisite changed the
        // successful-incomplete dependency proof from phase-failed to observed.
        assertCompleteStateAlternative(
          await readSubtreePublicState(readersOf(source), DETERMINISTIC_SEED.projectIds[0]),
          DETERMINISTIC_SEED,
          [{ dependencyIds: copy.dependencies.map(({ id }) => id) }, {}],
        );
        control.reach('subtrees.insertSubtree:complete-copy:dependencies');
      },
    };
  },
});

const subtreeRemovedMeasureFault = defineFault({
  id: 'break:subtrees.insertSubtree:complete-copy',
  caseId: 'subtrees.insertSubtree:complete-copy',
  createControl: () => createFaultControl('subtrees.insertSubtree:complete-copy:removed-measure'),
  mutate(source: MemorySource, control) {
    return {
      ...source,
      async insertSubtree(copy, stamp) {
        if (!control.isArmed()) return source.insertSubtree(copy, stamp);
        const metrics = ['token_estimate', 'token_actual', 'hours_actual'] as const;
        const pairWide = copy.removedMeasures.flatMap(({ workItemId, stepId }) =>
          metrics.map((metric) => ({
            workItemId,
            stepId,
            metric,
          })),
        );
        await source.insertSubtree({ ...copy, removedMeasures: pairWide }, stamp);
        const [firstItemId, removalItemId] = DETERMINISTIC_SEED.workItemIds[0];
        const [devStepId, qaStepId] = DETERMINISTIC_SEED.stepIds[0];
        // Proof: removing only this complete-state prerequisite changed the
        // successful-incomplete measure proof from phase-failed to observed.
        assertCompleteStateAlternative(
          await readSubtreePublicState(readersOf(source), DETERMINISTIC_SEED.projectIds[0]),
          DETERMINISTIC_SEED,
          [
            {
              measureKeys: [
                `${removalItemId}\u0000${devStepId}\u0000token_actual`,
                `${removalItemId}\u0000${devStepId}\u0000hours_actual`,
                `${firstItemId}\u0000${qaStepId}\u0000token_estimate`,
              ],
            },
            {},
          ],
        );
        control.reach('subtrees.insertSubtree:complete-copy:removed-measure');
      },
    };
  },
});

const subtreeRollbackFault = defineFault({
  id: 'break:subtrees.insertSubtree:late-failure',
  caseId: 'subtrees.insertSubtree:late-failure',
  createControl: () => createFaultControl('subtrees.insertSubtree:late-failure:unstaged'),
  mutate(source: MemorySource, control) {
    return {
      ...source,
      insertSubtree(copy, stamp) {
        if (!control.isArmed()) return source.insertSubtree(copy, stamp);
        return source.stores.subtrees.insertSubtree(copy, stamp);
      },
    };
  },
});

interface FaultContext {
  readonly registration: ReturnType<typeof existingStoreRegistrations>[number];
  assertionFailure: string | null;
  report: ExecutionReport | null;
}

async function proveFault(
  fault: Fault<MemorySource>,
  openSource: OpenSource = openConformanceMemorySource,
  decorate: (source: MemorySource) => MemorySource = (source) => source,
  prepare: (source: MemorySource) => Promise<void> = () => Promise.resolve(),
): Promise<FaultProof> {
  return recordFaultProof(fault, {
    assertion: `${fault.caseId} reports passed`,
    async setup(run: FaultRun<MemorySource>) {
      const lateControl =
        fault.caseId === 'subtrees.insertSubtree:late-failure'
          ? memoryLateWriteControl('subtree-final-satellite')
          : fault.caseId === 'journal.append:history-atomic' &&
              run.control.phase !== 'journal.append:history-atomic:outside-owner'
            ? memoryLateWriteControl('journal-history-insert')
            : null;
      const baseOpen =
        lateControl === null
          ? openSource
          : () =>
              memoryLateSource(lateControl, () => {
                run.control.reach(run.control.phase);
              });
      const source = await seedMemorySource(
        brokenSource(() => decorate(baseOpen()), run),
        async (seeded) => {
          if (fault.caseId.startsWith('progress.')) await seedProgressStep(seeded);
          if (fault.caseId.startsWith('dependencies.')) await seedDependencyWorkItems(seeded);
          if (fault.caseId.startsWith('subtrees.')) await seedSubtreeRecords(seeded);
        },
      );
      try {
        await prepare(source);
      } catch (failure) {
        return throwAfterMemoryCleanup(failure, source);
      }
      let wasOpened = false;
      const takeFixture = <Family extends ExistingFamily>(
        family: Family,
        caseId: CaseId,
      ): Promise<CaseFixture<TransactionalStores[Family]>> => {
        if (wasOpened) return Promise.reject(new Error(`${fault.caseId} fixture opened twice`));
        wasOpened = true;
        if (family === 'journal') {
          return Promise.resolve({
            fixtureId: `memory:${caseId}`,
            port: source.journal,
            journalAppender: source.journal,
            seed: DETERMINISTIC_SEED,
            readers: readersOf(source),
            scenario: {
              kind: 'late-write',
              point: 'journal-history-insert',
              arm:
                lateControl?.phase === 'journal-history-insert'
                  ? () => {
                      lateControl.arm();
                    }
                  : () => undefined,
              reached:
                lateControl?.phase === 'journal-history-insert'
                  ? () => lateControl.reached()
                  : () => run.control.reached(),
            },
            close: () => source.close(),
          } as unknown as CaseFixture<TransactionalStores[Family]>);
        }
        if (family !== 'subtrees') return Promise.resolve(memoryFixture(source, family, caseId));
        return Promise.resolve({
          fixtureId: `memory:${caseId}`,
          port: transactionalSubtrees(source),
          journalAppender: source.journal,
          seed: DETERMINISTIC_SEED,
          readers: readersOf(source),
          scenario:
            lateControl === null
              ? { kind: 'ordinary' }
              : {
                  kind: 'late-write',
                  point: 'subtree-final-satellite',
                  arm: () => {
                    lateControl.arm();
                  },
                  reached: () => lateControl.reached(),
                },
          close: () => source.close(),
        } as unknown as CaseFixture<TransactionalStores[Family]>);
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
        progress: (caseId) => takeFixture('progress', caseId),
        dependencies: (caseId) => takeFixture('dependencies', caseId),
        directory: (caseId) => takeFixture('directory', caseId),
        eventLog: (caseId) => takeFixture('eventLog', caseId),
        planEvents: (caseId) => takeFixture('planEvents', caseId),
        subtrees: (caseId) => takeFixture('subtrees', caseId),
        journal: (caseId) => takeFixture('journal', caseId),
      });
      const registration = registrations.find(({ caseId }) => caseId === fault.caseId);
      if (registration === undefined) throw new Error(`missing registration for ${fault.caseId}`);
      return { registration, assertionFailure: null, report: null };
    },
    async exercise(context: FaultContext) {
      context.report = await runCases([context.registration], { focus: [fault.caseId] });
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

function failedCase(report: ExecutionReport, caseId: CaseId) {
  return report.cases.find((execution) => execution.caseId === caseId);
}

interface MemoryLifecycleProbe {
  closeCalls: number;
}

interface Task52FlipWindowProbe extends MemoryLifecycleProbe {
  attempts: number;
  state: Awaited<ReturnType<typeof readTask52FlipState>> | null;
}

function omitTask52Flip(source: MemorySource, probe: Task52FlipWindowProbe): MemorySource {
  return {
    ...source,
    journal: replaceMethod(source.journal, 'flip', (flip) => async (id, undone, preconditions) => {
      if (id !== 'flip-target') return flip(id, undone, preconditions);
      probe.attempts += 1;
      probe.state = await readTask52FlipState(source);
    }),
    async close() {
      probe.closeCalls += 1;
      await source.close();
    },
  };
}

interface Task52PruneWindowProbe extends MemoryLifecycleProbe {
  attempts: number;
  state: Awaited<ReturnType<typeof readTask52HistoryState>> | null;
}

function omitTask52Prune(source: MemorySource, probe: Task52PruneWindowProbe): MemorySource {
  const decorated = withStores(source, {
    planEvents: replaceMethod(source.stores.planEvents, 'pruneOlderThan', () => async () => {
      probe.attempts += 1;
      probe.state = await readTask52HistoryState(source);
      return 0;
    }),
  });
  return {
    ...decorated,
    async close() {
      probe.closeCalls += 1;
      await source.close();
    },
  };
}

interface JournalPrewriteProbe extends MemoryLifecycleProbe {
  attempts: number;
  entries: JournalEntry[][] | null;
  history: PlanEvent[][] | null;
}

function rejectJournalBeforeAppend(
  source: MemorySource,
  probe: JournalPrewriteProbe,
): MemorySource {
  return {
    ...source,
    journal: replaceMethod(source.journal, 'append', (append) => async (entry, event) => {
      if (entry.id !== 'atomic-late-target') return append(entry, event);
      probe.attempts += 1;
      probe.entries = await Promise.all([
        source.journal.entriesFor(DETERMINISTIC_SEED.projectIds[0], DETERMINISTIC_SEED.ownerIds[0]),
        source.journal.entriesFor(DETERMINISTIC_SEED.projectIds[0], DETERMINISTIC_SEED.ownerIds[1]),
        source.journal.entriesFor(DETERMINISTIC_SEED.projectIds[1], DETERMINISTIC_SEED.ownerIds[1]),
      ]);
      probe.history = await Promise.all(
        DETERMINISTIC_SEED.projectIds.map((projectId) =>
          source.stores.planEvents.listFor(projectId, {}),
        ),
      );
      throw new Error('injected journal-history-insert failure before target append');
    }),
    async close() {
      probe.closeCalls += 1;
      await source.close();
    },
  };
}

function skipActorBRedo(
  source: MemorySource,
  probe: MemoryLifecycleProbe & { attempts: number },
): MemorySource {
  return {
    ...source,
    journal: replaceMethod(source.journal, 'flip', (flip) => async (id, undone, preconditions) => {
      if (id !== 'redo-b') return flip(id, undone, preconditions);
      probe.attempts += 1;
    }),
    async close() {
      probe.closeCalls += 1;
      await source.close();
    },
  };
}

interface SubtreePrewriteProbe extends MemoryLifecycleProbe {
  attempts: number;
  state: Awaited<ReturnType<typeof readSubtreePublicState>>[] | null;
}

interface SubtreeIncompleteProbe extends MemoryLifecycleProbe {
  attempts: number;
  state: Awaited<ReturnType<typeof readSubtreePublicState>> | null;
}

function omitCopiedProgress(source: MemorySource, probe: SubtreeIncompleteProbe): MemorySource {
  return {
    ...source,
    async insertSubtree(copy, stamp) {
      probe.attempts += 1;
      await source.insertSubtree({ ...copy, progress: [] }, stamp);
      probe.state = await readSubtreePublicState(
        readersOf(source),
        DETERMINISTIC_SEED.projectIds[0],
      );
    },
    async close() {
      probe.closeCalls += 1;
      await source.close();
    },
  };
}

function rejectSubtreeBeforeWrite(
  source: MemorySource,
  probe: SubtreePrewriteProbe,
  message: string,
): MemorySource {
  const reject = async (_copy: SubtreeCopy, _stamp: WriteStamp): Promise<void> => {
    probe.attempts += 1;
    probe.state = await Promise.all(
      DETERMINISTIC_SEED.projectIds.map((projectId) =>
        readSubtreePublicState(readersOf(source), projectId),
      ),
    );
    throw new Error(message);
  };
  return withStores(
    {
      ...source,
      insertSubtree: reject,
      async close() {
        probe.closeCalls += 1;
        await source.close();
      },
    },
    {
      subtrees: replaceMethod(source.stores.subtrees, 'insertSubtree', () => reject),
    },
  );
}

function observeSubtreeWrites(
  source: MemorySource,
  probe: MemoryLifecycleProbe & { attempts: number },
) {
  return withStores(
    {
      ...source,
      async close() {
        probe.closeCalls += 1;
        await source.close();
      },
    },
    {
      subtrees: replaceMethod(source.stores.subtrees, 'insertSubtree', (insertSubtree) => {
        return (copy, stamp) => {
          probe.attempts += 1;
          return insertSubtree(copy, stamp);
        };
      }),
    },
  );
}

interface DirectoryPrewriteProbe extends MemoryLifecycleProbe {
  attempts: number;
  teams: TeamWithServices[] | null;
}

function openDirectoryPrewriteFailureSource(probe: DirectoryPrewriteProbe): MemorySource {
  const source = openConformanceMemorySource();
  return withStores(
    {
      ...source,
      async close() {
        probe.closeCalls += 1;
        await source.close();
      },
    },
    {
      directory: replaceMethod(source.stores.directory, 'patchTeam', (patchTeam) => {
        return async (teamId, patch, stamp) => {
          if (patch.name === 'Directory escaped' && patch.serviceIds === undefined) {
            probe.attempts += 1;
            probe.teams = (await source.stores.directory.listTeams())
              .map((team) => ({ ...team, serviceIds: team.serviceIds.toSorted() }))
              .toSorted((left, right) => left.id.localeCompare(right.id));
            throw new Error('injected failure before early directory rename');
          }
          return patchTeam(teamId, patch, stamp);
        };
      }),
    },
  );
}

function openDependencySeedFailureSource(
  probe: MemoryLifecycleProbe,
  cleanupFailure?: string,
): MemorySource {
  const source = openConformanceMemorySource();
  return withStores(
    {
      ...source,
      async close() {
        probe.closeCalls += 1;
        await source.close();
        if (cleanupFailure !== undefined) throw new Error(cleanupFailure);
      },
    },
    {
      workItems: replaceMethod(source.stores.workItems, 'insert', (insert) => {
        return (workItem, children, stamp) => {
          if (workItem.id === DEPENDENCY_SURVIVOR_IDS[1]) {
            throw new Error('injected second dependency survivor seed failure');
          }
          return insert(workItem, children, stamp);
        };
      }),
    },
  );
}

function openProgressSeedFailureSource(
  probe: MemoryLifecycleProbe,
  cleanupFailure?: string,
): MemorySource {
  const source = openConformanceMemorySource();
  return withStores(
    {
      ...source,
      async close() {
        probe.closeCalls += 1;
        await source.close();
        if (cleanupFailure !== undefined) throw new Error(cleanupFailure);
      },
    },
    {
      steps: replaceMethod(source.stores.steps, 'add', (add) => {
        return (step, stamp) => {
          if (step.id === PROGRESS_SENTINEL_STEP_ID) {
            throw new Error('injected progress companion seed failure');
          }
          return add(step, stamp);
        };
      }),
    },
  );
}

describe('memory existing source conformance', () => {
  it('runs every Task 5.2 journal and plan-event case through the staged memory source', async () => {
    const caseIds = [
      'planEvents.listFor:filters-order',
      'planEvents.pruneOlderThan:strict-cutoff',
      'journal.flip:preconditions',
    ] as const;
    const report = await runCases(existingStoreRegistrations(openers), { focus: caseIds });
    const failure = report.cases.find(({ status }) => status === 'failed');
    if (failure?.status === 'failed') throw new Error(failure.failure);
    expect(report.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      caseIds.map((caseId) => ({ caseId, status: 'passed' })),
    );
  });

  it('reinjects retained flip preconditions, restamp direction, ignored item filters and inclusive pruning in memory', async () => {
    const proofs = await Promise.all([
      proveFault(journalRetainedPreconditionsFault),
      proveFault(journalRestampFlipsFault),
      proveFault(planEventsIgnoreItemFilterFault),
      proveFault(planEventsInclusivePruneFault),
    ]);
    // Proof: reversing each adapter fault at its production method produced
    // `Expected - 4 / Received + 4`, with four `assertion-passed` outcomes.
    expect(proofs.map(({ kind }) => kind)).toEqual([
      'observed',
      'observed',
      'observed',
      'observed',
    ]);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    expect(failures[0]).toContain(`"work-a-one": 21`);
    expect(failures[0]).toContain(`"work-a-one": 11`);
    expect(failures[1]).toContain(`-         "undone": true`);
    expect(failures[1]).toContain(`+         "undone": false`);
    expect(failures[1]).toContain(`"redoable": true`);
    expect(failures[1]).toContain(`"redoable": false`);
    expect(failures[2]).toContain(`"history-a-101-wide"`);
    expect(failures[2]).toContain(`"history-a-100-a"`);
    expect(failures[3]).toContain(`"deletedCount": 2`);
    expect(failures[3]).toContain(`"deletedCount": 6`);
    expect(failures[3]).toContain(`"history-a-100-z"`);
    expect(failures[3]).toContain(`"history-a-100-m"`);
    expect(failures[3]).toContain(`"history-a-100-a"`);
    expect(failures[3]).toContain(`"history-b-100"`);
  });

  it('refuses Task 5.2 memory faults before complete public mutations', async () => {
    const flipProbe: Task52FlipWindowProbe = { attempts: 0, closeCalls: 0, state: null };
    const pruneProbe: Task52PruneWindowProbe = { attempts: 0, closeCalls: 0, state: null };
    const [flipProof, pruneProof] = await Promise.all([
      proveFault(journalRetainedPreconditionsFault, openConformanceMemorySource, (source) =>
        omitTask52Flip(source, flipProbe),
      ),
      proveFault(planEventsInclusivePruneFault, openConformanceMemorySource, (source) =>
        omitTask52Prune(source, pruneProbe),
      ),
    ]);
    // Proof: reaching either phase without its verified complete mutation changed
    // this list away from the two required `phase-failed` outcomes.
    expect([flipProof.kind, pruneProof.kind]).toEqual(['phase-failed', 'phase-failed']);
    expect(flipProbe).toEqual({
      attempts: 1,
      closeCalls: 1,
      state: {
        entries: [
          [
            task52JournalEntry('flip-target', false, 11, 10),
            task52JournalEntry('flip-peer', false, 12, 11),
          ],
          [task52JournalEntry('flip-other-project', false)],
        ],
        states: [
          { undoable: true, redoable: false },
          { undoable: true, redoable: false },
        ],
        history: task52FlipHistory(),
      },
    });
    expect(pruneProbe).toEqual({
      attempts: 1,
      closeCalls: 1,
      state: {
        projectAEvents: task52PlanEvents()[0],
        projectBEvents: task52PlanEvents()[1],
        journals: task52HistoryJournals(),
      },
    });
  });

  it('runs every Task 5.1 journal case through the staged memory source', async () => {
    const caseIds = ['journal.append:history-atomic', 'journal.append:account-redo-depth'] as const;
    const report = await runCases(existingStoreRegistrations(openers), { focus: caseIds });
    const failure = report.cases.find(({ status }) => status === 'failed');
    if (failure?.status === 'failed') throw new Error(failure.failure);
    expect(report.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      caseIds.map((caseId) => ({ caseId, status: 'passed' })),
    );
  });

  it('reinjects independent history, broad redo clearing and history pruning in memory', async () => {
    const proofs = await Promise.all([
      proveFault(journalIndependentHistoryFault),
      proveFault(journalLateOutsideFault),
      proveFault(journalBroadRedoFault),
      proveFault(journalHistoryPruneFault),
    ]);
    // Proof: removing only the four production-path phase bridges changed this
    // exact list to four `phase-failed` outcomes (`Expected - 4 / Received + 4`).
    expect(proofs.map(({ kind }) => kind)).toEqual([
      'observed',
      'observed',
      'observed',
      'observed',
    ]);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    // Proof: the independently routed target history leaves this complete event
    // absent from project A after its real journal entry commits.
    expect(failures[0]).toContain(`-       "createdAt": 201,
-       "id": "event-atomic-target",
-       "kind": "rename",
-       "label": "Rename atomic-target",
-       "projectId": "project-a",`);
    // Proof: throwing outside the staged owner leaves this complete entry committed.
    expect(failures[1]).toContain(`+       "id": "atomic-late-target",
+       "inverse": {`);
    // Proof: clearing both actors' redo removes B's complete retained entry.
    expect(failures[2]).toContain(`-       "id": "redo-b",
-       "inverse": {`);
    // Proof: pruning history with the journal removes the complete oldest event.
    expect(failures[3]).toContain(`-     "id": "event-redo-a"`);
  });

  it('refuses to certify a pre-write memory journal failure', async () => {
    const probe: JournalPrewriteProbe = {
      attempts: 0,
      closeCalls: 0,
      entries: null,
      history: null,
    };
    const proof = await proveFault(journalLateOutsideFault, openConformanceMemorySource, (source) =>
      rejectJournalBeforeAppend(source, probe),
    );
    // Proof: reaching before the real target append changed this to observed.
    expect(proof.kind).toBe('phase-failed');
    const [projectA, projectB] = DETERMINISTIC_SEED.projectIds;
    const [actorA, actorB] = DETERMINISTIC_SEED.ownerIds;
    expect(probe).toEqual({
      attempts: 1,
      closeCalls: 1,
      entries: [
        [
          expectedAtomicEntry('atomic-sentinel-a', projectA, actorA, 1, 101),
          expectedAtomicEntry('atomic-target', projectA, actorA, 2, 201),
        ],
        [expectedAtomicEntry('atomic-sentinel-b', projectA, actorB, 1, 102)],
        [expectedAtomicEntry('atomic-other-project', projectB, actorB, 1, 103)],
      ],
      history: [
        [
          expectedAtomicEvent('atomic-target', projectA, actorA, 201),
          expectedAtomicEvent('atomic-sentinel-b', projectA, actorB, 102),
          expectedAtomicEvent('atomic-sentinel-a', projectA, actorA, 101),
        ],
        [expectedAtomicEvent('atomic-other-project', projectB, actorB, 103)],
      ],
    });
  });

  it('refuses to observe a reached memory late write with incomplete public history', async () => {
    const probe: JournalIncompleteProbe = {
      attempts: 0,
      closeCalls: 0,
      entries: null,
      history: null,
      independentHistory: null,
    };
    const proof = await proveFault(journalLateOutsideFault, openConformanceMemorySource, (source) =>
      commitJournalWithoutLateHistory(source, probe),
    );
    const [projectA, projectB] = DETERMINISTIC_SEED.projectIds;
    const [actorA, actorB] = DETERMINISTIC_SEED.ownerIds;
    // Proof: removing only the outside-owner complete history prerequisite changed
    // this result to `observed` after the incomplete source committed its three rows.
    expect(proof.kind).toBe('phase-failed');
    expect(probe).toEqual({
      attempts: 1,
      closeCalls: 1,
      entries: [
        [
          expectedAtomicEntry('atomic-sentinel-a', projectA, actorA, 1, 101),
          expectedAtomicEntry('atomic-target', projectA, actorA, 2, 201),
          expectedAtomicEntry('atomic-late-target', projectA, actorA, 3, 202),
        ],
        [expectedAtomicEntry('atomic-sentinel-b', projectA, actorB, 1, 102)],
        [expectedAtomicEntry('atomic-other-project', projectB, actorB, 1, 103)],
      ],
      history: [
        [
          expectedAtomicEvent('atomic-target', projectA, actorA, 201),
          expectedAtomicEvent('atomic-sentinel-b', projectA, actorB, 102),
          expectedAtomicEvent('atomic-sentinel-a', projectA, actorA, 101),
        ],
        [expectedAtomicEvent('atomic-other-project', projectB, actorB, 103)],
      ],
      independentHistory: [expectedAtomicEvent('atomic-late-target', projectA, actorA, 202)],
    });
  });

  it('detects collateral actor deletion, replacement corruption and missing redo setup', async () => {
    const collateral = await proveFault(journalCollateralActorFault);
    const replacement = await proveFault(journalReplacementCorruptionFault);
    const probe = { attempts: 0, closeCalls: 0 };
    const missingRedo = await proveFault(
      journalBroadRedoFault,
      openConformanceMemorySource,
      (source) => skipActorBRedo(source, probe),
    );
    expect([collateral.kind, replacement.kind, missingRedo.kind]).toEqual([
      'observed',
      'observed',
      'phase-failed',
    ]);
    expect(probe).toEqual({ attempts: 1, closeCalls: 1 });
    expect(
      collateral.kind === 'observed' ? Bun.stripANSI(collateral.observedFailure) : '',
    ).toContain(`-       "id": "atomic-sentinel-b",`);
    expect(
      replacement.kind === 'observed' ? Bun.stripANSI(replacement.observedFailure) : '',
    ).toContain(`+         "broken": "replacement inverse",`);
  });

  it('runs every subtree case through the staged memory source', async () => {
    const caseIds = [
      'subtrees.insertSubtree:complete-copy',
      'subtrees.insertSubtree:late-failure',
    ] as const;
    const report = await runCases(existingStoreRegistrations(openers), { focus: caseIds });
    const failure = report.cases.find(({ status }) => status === 'failed');
    if (failure?.status === 'failed') throw new Error(failure.failure);
    expect(report.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      caseIds.map((caseId) => ({ caseId, status: 'passed' })),
    );
  });

  it('reinjects complete-copy dependency and metric-key faults through memory state', async () => {
    const proofs = await Promise.all([
      proveFault(subtreeDependencyBackingFault),
      proveFault(subtreeRemovedMeasureFault),
    ]);
    // Proof: independently disabling isolation changed the first proof to
    // `assertion-passed`; disabling pair-wide deletion changed the second.
    expect(proofs.map(({ kind }) => kind)).toEqual(['observed', 'observed']);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    // Proof: the isolated dependency fault reaches only after exact prerequisite
    // state, then fails on this signed complete public edge.
    expect(failures[0]).toContain(`-       "id": "subtree-copy-dependency",
-       "predecessorId": "subtree-copy-root",
-       "projectId": "project-a",
-       "successorId": "subtree-copy-child",
-     },
-     {`);
    // Proof: pair-wide deletion reaches only after exact corrupted state, then
    // loses this signed complete unrequested triple-key survivor.
    expect(failures[1]).toContain(`-     {
-       "metric": "token_actual",
-       "recordedAt": 132,
-       "stepId": "step-a-dev",
-       "value": 102,
-       "workItemId": "work-a-two",
-     },`);
  });

  it('classifies subtree pre-write failures before their real proof phases', async () => {
    const dependencyProbe: SubtreePrewriteProbe = { attempts: 0, closeCalls: 0, state: null };
    const measureProbe: SubtreePrewriteProbe = { attempts: 0, closeCalls: 0, state: null };
    const rollbackProbe: SubtreePrewriteProbe = { attempts: 0, closeCalls: 0, state: null };
    const [dependency, measure, rollback] = await Promise.all([
      proveFault(subtreeDependencyBackingFault, openConformanceMemorySource, (source) =>
        rejectSubtreeBeforeWrite(
          source,
          dependencyProbe,
          'subtree-copy-dependency pre-write rejection',
        ),
      ),
      proveFault(subtreeRemovedMeasureFault, openConformanceMemorySource, (source) =>
        rejectSubtreeBeforeWrite(
          source,
          measureProbe,
          'token_actual value 102 recordedAt 132 pre-write rejection',
        ),
      ),
      proveFault(subtreeRollbackFault, openConformanceMemorySource, (source) =>
        rejectSubtreeBeforeWrite(
          source,
          rollbackProbe,
          'subtree-copy-root subtree-final-satellite pre-write rejection',
        ),
      ),
    ]);

    // Proof: reaching in the outer decorators classified both ID-bearing
    // pre-write errors as observed shared failures instead of phase failures.
    expect([dependency.kind, measure.kind, rollback.kind]).toEqual([
      'phase-failed',
      'phase-failed',
      'phase-failed',
    ]);
    expect([dependencyProbe.attempts, measureProbe.attempts, rollbackProbe.attempts]).toEqual([
      1, 1, 1,
    ]);
    expect([dependencyProbe.closeCalls, measureProbe.closeCalls, rollbackProbe.closeCalls]).toEqual(
      [1, 1, 1],
    );
    for (const probe of [dependencyProbe, measureProbe, rollbackProbe]) {
      if (probe.state === null) throw new Error('subtree pre-write state was not captured');
      assertSeedState(probe.state[0], DETERMINISTIC_SEED, 0);
      assertSeedState(probe.state[1], DETERMINISTIC_SEED, 1);
    }
    if (!('phase' in dependency) || !('phase' in measure) || !('phase' in rollback))
      throw new Error('subtree pre-write proof did not report a phase');
    expect([dependency.phase, measure.phase, rollback.phase]).toEqual([
      'subtrees.insertSubtree:complete-copy:dependencies',
      'subtrees.insertSubtree:complete-copy:removed-measure',
      'subtrees.insertSubtree:late-failure:unstaged',
    ]);
  });

  it('refuses successful incomplete complete-copy prerequisites in memory', async () => {
    const dependencyProbe: SubtreeIncompleteProbe = { attempts: 0, closeCalls: 0, state: null };
    const measureProbe: SubtreeIncompleteProbe = { attempts: 0, closeCalls: 0, state: null };
    const [dependency, measure] = await Promise.all([
      proveFault(subtreeDependencyBackingFault, openConformanceMemorySource, (source) =>
        omitCopiedProgress(source, dependencyProbe),
      ),
      proveFault(subtreeRemovedMeasureFault, openConformanceMemorySource, (source) =>
        omitCopiedProgress(source, measureProbe),
      ),
    ]);

    // Proof: deleting only the two owning assertCompleteStateAlternative calls
    // changed both real successful-incomplete runs from phase-failed to observed.
    expect([dependency.kind, measure.kind]).toEqual(['phase-failed', 'phase-failed']);
    if (dependency.kind !== 'phase-failed' || measure.kind !== 'phase-failed') {
      throw new Error('successful incomplete memory insert reached a proof phase');
    }
    expect([dependency.failure, measure.failure]).toEqual([
      'fault did not reach subtrees.insertSubtree:complete-copy:dependencies',
      'fault did not reach subtrees.insertSubtree:complete-copy:removed-measure',
    ]);
    expect([dependencyProbe.attempts, measureProbe.attempts]).toEqual([1, 1]);
    expect([dependencyProbe.closeCalls, measureProbe.closeCalls]).toEqual([1, 1]);
    if (dependencyProbe.state === null || measureProbe.state === null) {
      throw new Error('successful incomplete memory insertion was not publicly observed');
    }
    const missingProgress = ['subtree-copy-root\u0000step-a-dev'];
    assertCompleteStateAlternative(dependencyProbe.state, DETERMINISTIC_SEED, [
      {
        dependencyIds: ['subtree-copy-dependency'],
        progressKeys: missingProgress,
      },
    ]);
    assertCompleteStateAlternative(measureProbe.state, DETERMINISTIC_SEED, [
      {
        measureKeys: [
          'work-a-two\u0000step-a-dev\u0000token_actual',
          'work-a-two\u0000step-a-dev\u0000hours_actual',
          'work-a-one\u0000step-a-qa\u0000token_estimate',
        ],
        progressKeys: missingProgress,
      },
    ]);
  });

  it('refuses a late proof whose populated estimate prerequisite is missing', async () => {
    const probe = { attempts: 0, closeCalls: 0 };
    const proof = await proveFault(
      subtreeRollbackFault,
      openConformanceMemorySource,
      (source) => observeSubtreeWrites(source, probe),
      async (source) => {
        for (const estimate of subtreeSeedRecords(DETERMINISTIC_SEED).estimates) {
          await source.stores.estimates.remove(
            estimate.workItemId,
            estimate.stepId,
            DETERMINISTIC_SEED.stamps[0],
          );
        }
      },
    );

    // Proof: snapshotting without assertSeedState returned observed;
    // the repaired case refuses the proof before any subtree write can reach.
    expect(proof.kind).toBe('phase-failed');
    if (proof.kind !== 'phase-failed') throw new Error(`expected phase failure, got ${proof.kind}`);
    expect(proof.failure).toBe('fault did not reach subtrees.insertSubtree:late-failure:unstaged');
    expect(probe).toEqual({ attempts: 0, closeCalls: 1 });
  });

  it('rolls back a copied row when its explicit team set is refused', async () => {
    let closeCalls = 0;
    const source = await seedMemorySource(() => {
      const opened = openConformanceMemorySource();
      return {
        ...opened,
        async close() {
          closeCalls += 1;
          await opened.close();
        },
      };
    }, seedSubtreeRecords);
    try {
      const before = await Promise.all(
        DETERMINISTIC_SEED.projectIds.map((projectId) =>
          readSubtreePublicState(readersOf(source), projectId),
        ),
      );
      assertSeedState(before[0], DETERMINISTIC_SEED, 0);
      assertSeedState(before[1], DETERMINISTIC_SEED, 1);
      const copy = completeSubtreeCopy(DETERMINISTIC_SEED);
      const refused: SubtreeCopy = {
        ...copy,
        rows: copy.rows.map((row, index) =>
          index === 0 ? { ...row, teamIds: ['subtree-unknown-team'] } : structuredClone(row),
        ),
      };
      const write = source.insertSubtree(refused, DETERMINISTIC_SEED.stamps[1]);
      expect(write).rejects.toThrow('cannot restore team set for subtree-copy-root: unknown_team');
      await write.catch(() => undefined);
      // The guard-removal proof fails at the rejection above. These assertions
      // cover the guarded operation's complete rollback.
      expect(
        await Promise.all(
          DETERMINISTIC_SEED.projectIds.map((projectId) =>
            readSubtreePublicState(readersOf(source), projectId),
          ),
        ),
      ).toEqual(before);
      expect(closeCalls).toBe(0);
    } finally {
      await source.close();
    }
    expect(closeCalls).toBe(1);
  });

  it('reinjects an unstaged terminal subtree failure through committed memory state', async () => {
    const proof = await proveFault(subtreeRollbackFault);
    // Proof: restoring the staged insert returned `assertion-passed` here.
    expect(proof.kind).toBe('observed');
    if (proof.kind !== 'observed') throw new Error(`expected observed proof, got ${proof.kind}`);
    // Proof: bypassing the staged MemoryState swap failed the complete public
    // snapshot with the escaped `subtree-copy-root` record after the terminal throw.
    expect(Bun.stripANSI(proof.observedFailure)).toContain(`+         "deadline": "2026-09-30",
+         "externalRefs": [],
+         "frozenNumber": "030",
+         "id": "subtree-copy-root",
+         "maxParallel": 2,
+         "name": "Copied root",
+         "notes": "all fields travel",
+         "parentId": null,
+         "position": 20,
+         "priority": 2,
+         "projectId": "project-a",
+         "revision": 0,
+         "serviceId": "service-a",
+         "serviceIds": [],
+         "serviceTeamId": "team-a",
+         "startNoEarlierThan": "2026-09-15",
+         "startNoEarlierThanReason": "contract start",
+         "tagIds": [],
+         "teamIds": [
+           "team-a",
+           "team-b",
+         ],
+         "typeIds": [],`);
  });
  it('closes once when ordinary progress companion seeding fails', async () => {
    const probe: MemoryLifecycleProbe = { closeCalls: 0 };
    let failure: unknown;
    try {
      await openMemoryCase('progress', 'progress.set:replace', () =>
        openProgressSeedFailureSource(probe),
      );
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toHaveProperty('message', 'injected progress companion seed failure');
    // Proof: the shared setup owner closes once when the final progress-only
    // seed rejects after the complete base seed has settled.
    expect(probe.closeCalls).toBe(1);
  });

  it('closes once when proof progress companion seeding fails', async () => {
    const probe: MemoryLifecycleProbe = { closeCalls: 0 };
    const proof = await proveFault(progressReplaceFault, () =>
      openProgressSeedFailureSource(probe),
    );

    expect(proof).toEqual({
      kind: 'setup-failed',
      faultId: 'break:progress.set:replace',
      caseId: 'progress.set:replace',
      failure: 'injected progress companion seed failure',
    });
    expect(probe.closeCalls).toBe(1);
  });

  it('preserves progress companion setup and cleanup failures', async () => {
    const probe: MemoryLifecycleProbe = { closeCalls: 0 };
    let failure: unknown;
    try {
      await openMemoryCase('progress', 'progress.set:replace', () =>
        openProgressSeedFailureSource(probe, 'injected progress cleanup failure'),
      );
    } catch (caught) {
      failure = caught;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).toHaveProperty('message', 'memory source setup and cleanup both failed');
    expect((failure as AggregateError).errors.map((member) => String(member))).toEqual([
      'Error: injected progress companion seed failure',
      'Error: injected progress cleanup failure',
    ]);
    expect(probe.closeCalls).toBe(1);
  });

  it('leaves successful progress fixture cleanup to its single teardown', async () => {
    const probe: MemoryLifecycleProbe = { closeCalls: 0 };
    const source = openConformanceMemorySource();
    const fixture = await openMemoryCase('progress', 'progress.set:replace', () => ({
      ...source,
      async close() {
        probe.closeCalls += 1;
        await source.close();
      },
    }));
    expect(probe.closeCalls).toBe(0);
    await fixture.close();
    expect(probe.closeCalls).toBe(1);
  });

  it('closes once when ordinary dependency companion seeding fails', async () => {
    const probe: MemoryLifecycleProbe = { closeCalls: 0 };
    let failure: unknown;
    try {
      await openMemoryCase('dependencies', 'dependencies.add:idempotent-pair', () =>
        openDependencySeedFailureSource(probe),
      );
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toHaveProperty('message', 'injected second dependency survivor seed failure');
    // Proof: when dependency survivor seeding lived outside the setup owner,
    // this late failure left closeCalls at zero.
    expect(probe.closeCalls).toBe(1);
  });

  it('closes once when proof dependency companion seeding fails', async () => {
    const probe: MemoryLifecycleProbe = { closeCalls: 0 };
    const proof = await proveFault(dependencyPairPredicateFault, () =>
      openDependencySeedFailureSource(probe),
    );

    expect(proof).toEqual({
      kind: 'setup-failed',
      faultId: 'break:dependencies.remove:pair',
      caseId: 'dependencies.remove:pair',
      failure: 'injected second dependency survivor seed failure',
    });
    // Proof: the old proof setup seeded survivors after its cleanup owner and
    // reported setup-failed while leaving closeCalls at zero.
    expect(probe.closeCalls).toBe(1);
  });

  it('preserves both memory setup and cleanup failures', async () => {
    const probe: MemoryLifecycleProbe = { closeCalls: 0 };
    let failure: unknown;
    try {
      await openMemoryCase('dependencies', 'dependencies.add:idempotent-pair', () =>
        openDependencySeedFailureSource(probe, 'injected memory cleanup failure'),
      );
    } catch (caught) {
      failure = caught;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).toHaveProperty('message', 'memory source setup and cleanup both failed');
    expect((failure as AggregateError).errors.map((member) => String(member))).toEqual([
      'Error: injected second dependency survivor seed failure',
      'Error: injected memory cleanup failure',
    ]);
    expect(probe.closeCalls).toBe(1);
  });

  it('does not close a successful memory fixture during setup', async () => {
    const probe: MemoryLifecycleProbe = { closeCalls: 0 };
    const source = openConformanceMemorySource();
    const fixture = await openMemoryCase(
      'dependencies',
      'dependencies.add:idempotent-pair',
      () => ({
        ...source,
        async close() {
          probe.closeCalls += 1;
          await source.close();
        },
      }),
    );
    expect(probe.closeCalls).toBe(0);
    await fixture.close();
    expect(probe.closeCalls).toBe(1);
  });

  it("memory's progress unknown-step gap names an observed refusal mismatch", async () => {
    const caseIds = [
      'progress.set:replace',
      'progress.remove:absence',
      'progress.moveAll:ownership',
      'progress.set:unknown_step',
    ] as const;
    const report = await runCases(existingStoreRegistrations(openers), { focus: caseIds });

    expect(report.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: 'progress.set:replace', status: 'passed' },
      { caseId: 'progress.remove:absence', status: 'passed' },
      { caseId: 'progress.moveAll:ownership', status: 'passed' },
      { caseId: 'progress.set:unknown_step', status: 'failed' },
    ]);
    const unknownStep = failedCase(report, 'progress.set:unknown_step');
    expect(unknownStep?.status).toBe('failed');
    if (unknownStep?.status !== 'failed') throw new Error('progress gap bypass did not fail');
    expect(unknownStep.assertionPhase).toBe('assertion');
    // Proof: before this exact gap was declared, the real unexcluded memory
    // case returned `written` and exposed the complete escaped done statement,
    // stated at 201, in project A's public list.
    expect(Bun.stripANSI(unknownStep.failure)).toContain(
      progressUnknownStepGap.evidence.observedFailure,
    );
  });

  it('runs every work-item case through the real memory source', async () => {
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

  it('names the observed configuration-reference refusal gaps', async () => {
    const report = await runCases(existingStoreRegistrations(openers), {
      focus: ['capacity.set:missing-reference', 'priorityBands.replace:missing-project'],
    });
    const capacity = failedCase(report, capacityMissingReferenceGap.caseId);
    const priorityBands = failedCase(report, priorityMissingProjectGap.caseId);

    expect(capacity?.status).toBe('failed');
    expect(priorityBands?.status).toBe('failed');
    if (capacity?.status !== 'failed' || priorityBands?.status !== 'failed') {
      throw new Error('configuration gap bypass did not fail');
    }
    expect(capacity.assertionPhase).toBe('assertion');
    expect(priorityBands.assertionPhase).toBe('assertion');
    // Proof: bypassing both declaration gaps through `openMemorySource` failed
    // with capacity's two true outcomes plus its two escaped rows
    // (`Expected - 6 / Received + 14`); priority returned true and exposed its
    // stored missing-project ladder (`Expected - 16 / Received + 15`).
    expect(Bun.stripANSI(capacity.failure)).toContain(
      capacityMissingReferenceGap.evidence.observedFailure,
    );
    expect(Bun.stripANSI(priorityBands.failure)).toContain(
      priorityMissingProjectGap.evidence.observedFailure,
    );
  });

  it('runs every offered existing case and reports the exact known gaps', async () => {
    const registrations = existingStoreRegistrations(openers);
    const report = await runCases(registrations, {
      declaration,
      focus: [...SOURCE_CONFORMANCE_CASES],
    });

    expect(report.kind).toBe('partial');
    expect(
      report.cases.filter(({ status }) => status === 'passed').map(({ caseId }) => caseId),
    ).toEqual(
      SOURCE_CONFORMANCE_CASES.filter((caseId) => !knownGaps.some((gap) => gap.caseId === caseId)),
    );
    expect(
      knownGaps.map((gap) => {
        const execution = failedCase(report, gap.caseId);
        return execution === undefined
          ? undefined
          : {
              family: execution.family,
              caseId: execution.caseId,
              status: execution.status,
              executed: execution.executed,
            };
      }),
    ).toEqual([
      {
        family: 'estimates',
        caseId: unknownStepGap.caseId,
        status: 'not-offered',
        executed: false,
      },
      {
        family: 'actuals',
        caseId: actualUnknownStepGap.caseId,
        status: 'not-offered',
        executed: false,
      },
      {
        family: 'measures',
        caseId: measureUnknownStepGap.caseId,
        status: 'not-offered',
        executed: false,
      },
      {
        family: 'progress',
        caseId: progressUnknownStepGap.caseId,
        status: 'not-offered',
        executed: false,
      },
      {
        family: 'capacity',
        caseId: capacityMissingReferenceGap.caseId,
        status: 'not-offered',
        executed: false,
      },
      {
        family: 'priorityBands',
        caseId: priorityMissingProjectGap.caseId,
        status: 'not-offered',
        executed: false,
      },
    ]);
  });

  it("memory's unknown-step gap names an observed refusal mismatch", async () => {
    const report = await runCases(existingStoreRegistrations(openers), {
      focus: [unknownStepGap.caseId],
    });
    const execution = failedCase(report, unknownStepGap.caseId);

    expect(execution?.status).toBe('failed');
    if (execution?.status !== 'failed') throw new Error('unknown-step bypass did not fail');
    expect(execution.assertionPhase).toBe('assertion');
    const observedFailure = Bun.stripANSI(execution.failure);
    // Proof: bypassing the declaration gap ran this shared case through
    // `openMemorySource`; Bun failed on `Expected: "unknown_step" · Received: "written"`.
    expect(observedFailure).toContain(unknownStepGap.evidence.observedFailure);
  });

  it("memory's actual unknown-step gap names an observed refusal mismatch", async () => {
    const report = await runCases(existingStoreRegistrations(openers), {
      focus: ['actuals.set:unknown_step'],
    });
    const execution = failedCase(report, 'actuals.set:unknown_step');
    expect(execution?.status).toBe('failed');
    if (execution?.status !== 'failed') throw new Error('actual unknown-step bypass did not fail');
    expect(execution.assertionPhase).toBe('assertion');
    const observedFailure = Bun.stripANSI(execution.failure);
    // Proof: bypassing the actual gap through the real memory source produced
    // received `written` and the escaped work-a-one/no-such-step row with days
    // 13 at recordedAt 201 in project A's complete public list.
    expect(observedFailure).toContain(actualUnknownStepGap.evidence.observedFailure);
  });

  it("memory's measure unknown-step gap names an observed refusal mismatch", async () => {
    const report = await runCases(existingStoreRegistrations(openers), {
      focus: ['measures.set:unknown_step'],
    });
    const execution = failedCase(report, 'measures.set:unknown_step');
    expect(execution?.status).toBe('failed');
    if (execution?.status !== 'failed') throw new Error('measure unknown-step bypass did not fail');
    expect(execution.assertionPhase).toBe('assertion');
    const observedFailure = Bun.stripANSI(execution.failure);
    // Proof: bypassing the measure gap through the real memory source produced
    // received `written` and the escaped work-a-one/no-such-step token estimate,
    // value 21 at recordedAt 201, in project A's complete public list.
    expect(observedFailure).toContain(measureUnknownStepGap.evidence.observedFailure);
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

  it('reinjects capacity-key, clearing, default, and whole-ladder faults', async () => {
    const faults = [
      capacityProjectTeamFault,
      capacityClearFault,
      priorityDefaultsFault,
      priorityFirstRungFault,
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
    expect(failures[2]).toContain('"Critical"');
    expect(failures[2]).toContain('"projectA": []');
    expect(failures[3]).toContain('"label": "Soon"');

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      faults.map(({ caseId }) => ({ caseId, status: 'passed' })),
    );
  });

  it('reinjects whole-ladder project-scope destruction', async () => {
    const proof = await proveFault(priorityProjectScopeFault);

    expect(proof.kind).toBe('observed');
    if (proof.kind !== 'observed') throw new Error('project-scope destruction was not observed');
    // Proof: resetting B through the staged source before replacing A failed
    // here on `"label": "Now"` becoming `"label": "Critical"`.
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

  it('reinjects the five work-item matrix faults in their named windows', async () => {
    const faults = [
      insertRespaceFault,
      patchRefusalAtomicFault,
      removePromotionFault,
      frozenAcquireFault,
      frozenClearFault,
    ];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(faults.map(() => 'observed'));
    expect(proofs.map((proof) => (proof.kind === 'observed' ? proof.phase : null))).toEqual([
      'workItems.insert:respace',
      'workItems.patch:refusal-atomic',
      'workItems.remove:promotion',
      'workItems.setFrozenNumbers:clear:first-freeze',
      'workItems.setFrozenNumbers:clear',
    ]);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    // Proof: the five real memory mutations failed respectively with the tight
    // sibling still at position 11, `Escaped rename`, the child's old parent
    // `work-a-one`, the first number received as null, and the retained number
    // received as null.
    expect(failures[0]).toContain('"position": 11');
    expect(failures[1]).toContain('"name": "Escaped rename"');
    expect(failures[2]).toContain('parentId: "work-a-one"');
    expect(failures[3]).toContain(`Expected to contain: [
  {
    id: "work-a-one",
    projectId: "project-a",
    parentId: null,
    position: 10,
    name: "Work 1",
    notes: "",
    frozenNumber: null,
    startNoEarlierThan: null,
    startNoEarlierThanReason: null,
    deadline: null,
    priority: null,
    serviceTeamId: "team-a",
    serviceId: null,
    maxParallel: 1,
    revision: 0,
    teamIds: [ "team-a" ],
    tagIds: [],
    serviceIds: [ "service-a" ],
    typeIds: [ "type-a" ],`);
    expect(failures[4]).toContain('frozenNumber: null');

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
      declaration,
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: 'estimates.moveAll:ownership', status: 'passed' },
      { caseId: 'actuals.set:replace', status: 'passed' },
      { caseId: 'actuals.remove:pair', status: 'passed' },
      { caseId: 'actuals.moveAll:ownership', status: 'passed' },
      { caseId: 'actuals.set:unknown_step', status: 'not-offered' },
    ]);
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
      declaration,
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: 'measures.set:metric-key', status: 'passed' },
      { caseId: 'measures.remove:metric-key', status: 'passed' },
      { caseId: 'measures.moveAll:all-metrics', status: 'passed' },
      { caseId: 'measures.set:unknown_step', status: 'not-offered' },
    ]);
  });

  it('reinjects progress replacement, absence, ownership, and refusal faults', async () => {
    const faults = [
      progressReplaceFault,
      progressNotStartedSurrogateFault,
      progressMoveOwnershipFault,
      progressUnknownStepFault,
    ];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(faults.map(() => 'observed'));
    expect(proofs.map((proof) => (proof.kind === 'observed' ? proof.phase : null))).toEqual([
      'progress.set:replace',
      'progress.remove:absence',
      'progress.moveAll:ownership',
      'progress.set:unknown_step',
    ]);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    // Proof: retaining the first statement left the complete work-a-one/dev row
    // at in_progress@101 instead of replacing it with done@201.
    expect(failures[0]).toContain(`    {
-     "state": "done",
-     "statedAt": 201,
+     "state": "in_progress",
+     "statedAt": 101,
      "stepId": "step-a-dev",
      "workItemId": "work-a-one",
    },`);
    // Proof: storing the third state as a surrogate exposed the complete
    // not_started@201 row on the removed work-a-one/dev pair.
    expect(failures[1]).toContain(`    {
+     "state": "not_started",
+     "statedAt": 201,
+     "stepId": "step-a-dev",
+     "workItemId": "work-a-one",
+   },`);
    // Proof: copying both source statements exposed the complete done@101 and
    // in_progress@102 source rows beside their complete destination rows.
    expect(failures[2]).toContain(`      "state": "done",
      "statedAt": 101,
      "stepId": "step-a-dev",
+     "workItemId": "work-a-one",
+   },
+   {
+     "state": "in_progress",
+     "statedAt": 102,
+     "stepId": "step-a-qa",
+     "workItemId": "work-a-one",
+   },
+   {
+     "state": "done",
+     "statedAt": 101,
+     "stepId": "step-a-dev",
      "workItemId": "work-a-two",
    },`);
    expect(failures[2]).toContain(`    {
      "state": "in_progress",
      "statedAt": 102,
      "stepId": "step-a-qa",
      "workItemId": "work-a-two",
    },
    {
      "state": "done",
      "statedAt": 103,
      "stepId": "step-a-review",
      "workItemId": "work-a-two",
    },`);
    // Proof: accepting the missing step produced received written and the
    // complete escaped work-a-one/no-such-step/done@201 public row.
    expect(failures[3]).toContain(`-   "outcome": "unknown_step",
+   "outcome": "written",
    "projectA": [
+     {
+       "state": "done",
+       "statedAt": 201,
+       "stepId": "no-such-step",
+       "workItemId": "work-a-one",
+     },`);

    const restored = await runCases(existingStoreRegistrations(openers), {
      declaration,
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: 'progress.set:replace', status: 'passed' },
      { caseId: 'progress.remove:absence', status: 'passed' },
      { caseId: 'progress.moveAll:ownership', status: 'passed' },
      { caseId: 'progress.set:unknown_step', status: 'not-offered' },
    ]);
  });

  it('reinjects dependency identity, pair, direction, and full-set faults', async () => {
    const faults = [
      dependencyIdFault,
      dependencyInputMutationFault,
      dependencyPairPredicateFault,
      dependencyOutgoingOnlyFault,
      dependencyIncompleteSetFault,
    ];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(faults.map(() => 'observed'));
    expect(proofs.map((proof) => (proof.kind === 'observed' ? proof.phase : null))).toEqual([
      'dependencies.add:idempotent-pair:edge-id',
      'dependencies.add:idempotent-pair:input-id',
      'dependencies.remove:pair:successor-predicate',
      'dependencies.removeAllFor:touching-set:outgoing-only',
      'dependencies.removeAllFor:touching-set:first-only',
    ]);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    // Proof: ID-keyed deduplication retains the original source-owned edge and
    // adds this complete second-ID edge after verified inert setup.
    expect(failures[0]).toContain(`    {
+     "id": "dependency-idempotent-second-id",
+     "predecessorId": "work-a-one",
+     "projectId": "project-a",
+     "successorId": "work-a-two",
+   },
+   {`);
    // Proof: mutating the write argument in place exposes the complete
    // corrupted-ID edge without altering the independent expected record.
    expect(failures[1]).toContain(`    {
-     "id": "dependency-idempotent-original",
+     "id": "dependency-idempotent-mutated",
      "predecessorId": "work-a-one",
      "projectId": "project-a",
      "successorId": "work-a-two",
    },`);
    // Proof: omitting the successor predicate removes this complete expected
    // same-predecessor edge along with the selected pair.
    expect(failures[2]).toContain(`    {
-     "id": "dependency-remove-same-predecessor",
-     "predecessorId": "work-a-one",
-     "projectId": "project-a",
-     "successorId": "dependency-survivor-one",
-   },
-   {`);
    // Proof: removing outgoing edges only leaves this complete incoming edge
    // in the received project-A list.
    expect(failures[3]).toContain(`    {
+     "id": "dependency-remove-all-incoming",
+     "predecessorId": "dependency-survivor-one",
+     "projectId": "project-a",
+     "successorId": "work-a-one",
+   },
+   {`);
    // Proof: passing only the first doomed ID leaves this complete outgoing
    // edge for the second doomed row in the received project-A list.
    expect(failures[4]).toContain(`    {
+     "id": "dependency-remove-all-outgoing",
+     "predecessorId": "work-a-two",
+     "projectId": "project-a",
+     "successorId": "dependency-survivor-two",
+   },
+   {`);

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: 'dependencies.add:idempotent-pair', status: 'passed' },
      { caseId: 'dependencies.remove:pair', status: 'passed' },
      { caseId: 'dependencies.removeAllFor:touching-set', status: 'passed' },
    ]);
  });

  it('rejects a pre-write team fault before the atomicity phase', async () => {
    const probe: DirectoryPrewriteProbe = {
      attempts: 0,
      closeCalls: 0,
      teams: null,
    };
    const proof = await proveFault(directoryTeamAtomicityFault, () =>
      openDirectoryPrewriteFailureSource(probe),
    );

    // Proof: reaching before the name-only write returned `observed`; moving
    // reach after its complete public verification returns phase-failed.
    expect(proof).toEqual({
      kind: 'phase-failed',
      faultId: 'break:directory.patchTeam:atomic-refusal',
      caseId: 'directory.patchTeam:atomic-refusal',
      phase: 'directory.patchTeam:atomic-refusal:early-rename',
      failure: 'fault did not reach directory.patchTeam:atomic-refusal:early-rename',
    });
    expect(probe).toEqual({
      attempts: 1,
      closeCalls: 1,
      teams: [
        {
          id: 'team-a',
          name: 'Directory original',
          serviceIds: ['service-a'],
        },
        {
          id: 'team-b',
          name: 'Team 2',
          serviceIds: ['directory-service-sentinel'],
        },
      ],
    });
  });

  it('reinjects directory assignment scope and team atomicity faults', async () => {
    const faults = [
      directoryAssignmentsOfSubsetFault,
      directoryAssignmentScopeFault,
      directoryTeamAtomicityFault,
    ];
    const proofs = await Promise.all(faults.map((fault) => proveFault(fault)));

    expect(proofs.map(({ kind }) => kind)).toEqual(['observed', 'observed', 'observed']);
    expect(proofs.map((proof) => (proof.kind === 'observed' ? proof.phase : null))).toEqual([
      'directory.assign:scope-replace-clear:subset',
      'directory.assign:scope-replace-clear:pair-scope',
      'directory.patchTeam:atomic-refusal:early-rename',
    ]);
    const failures = proofs.map((proof) =>
      proof.kind === 'observed' ? Bun.stripANSI(proof.observedFailure) : '',
    );
    // Proof: ignoring the strict subset adds this complete project-B row.
    expect(failures[0]).toContain(`+     {
+       "personId": "person-b",
+       "stepId": "step-b-dev",
+       "workItemId": "work-b-one",
+     },`);
    // Proof: broad replacement removes this complete expected same-step
    // survivor from the coherent assignment snapshots.
    expect(failures[1]).toContain(`-         {
-           "personId": "person-a",
-           "stepId": "step-a-dev",
-           "workItemId": "work-a-two",
-         },`);
    // Proof: the early real rename preserves ownership but changes the
    // complete received target team name after the refusal settles.
    expect(failures[2]).toContain(`    {
      "id": "team-a",
-     "name": "Directory original",
+     "name": "Directory escaped",
      "serviceIds": [
        "service-a",
      ],
    },`);

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: 'directory.assign:scope-replace-clear', status: 'passed' },
      { caseId: 'directory.patchTeam:atomic-refusal', status: 'passed' },
    ]);
  });

  it('reinjects retained-maximum event sequence allocation', async () => {
    const proof = await proveFault(eventRetainedMaximumFault);

    expect(proof.kind).toBe('observed');
    if (proof.kind !== 'observed') throw new Error('retained-maximum fault was not observed');
    expect(proof.phase).toBe('eventLog.pruneBeyond:empty-sequence:next-record');
    // Proof: deriving from retained MAX after prune-to-empty changes the next
    // returned complete record itself from sequence 2 to sequence 0.
    expect(Bun.stripANSI(proof.observedFailure)).toContain(`  {
    "createdAt": 201,
    "message": {
      "type": "empty-next",
    },
-   "seq": 2,
+   "seq": 0,
    "subscription": "project:project-a",
  }`);

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: [eventRetainedMaximumFault.caseId],
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: 'eventLog.pruneBeyond:empty-sequence', status: 'passed' },
    ]);
  });
});
