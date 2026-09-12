import {
  brokenSource,
  type Capabilities,
  type CaseFixture,
  type CaseId,
  createFaultControl,
  defineFault,
  DETERMINISTIC_SEED,
  type ExecutionReport,
  type ExistingStoreOpeners,
  existingStoreRegistrations,
  type Fault,
  type FaultProof,
  type FaultRun,
  recordFaultProof,
  replaceMethod,
  runCases,
  SOURCE_CONFORMANCE_CASES,
  type SourceDeclaration,
  type SourceReaders,
} from '@wbs/conformance';
import type { TransactionalStores, User } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { projectRow } from '../project-fixture';
import { openMemorySource } from '../source';

type ExistingFamily = keyof ExistingStoreOpeners;
type MemorySource = ReturnType<typeof openMemorySource>;
type OpenSource = () => MemorySource;

function readersOf(source: ReturnType<typeof openMemorySource>): SourceReaders {
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

async function seedMemorySource(openSource: OpenSource = openMemorySource): Promise<MemorySource> {
  const source = openSource();
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
  for (const [index, personId] of seed.personIds.entries()) {
    await stores.directory.addPerson(
      { id: personId, name: `Person ${String(index + 1)}` },
      [seed.teamIds[index] ?? seed.teamIds[0]],
      seed.stamps[0],
    );
  }
  await verifyMemorySeed(source);
  return source;
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
}

function memoryFixture<Family extends ExistingFamily>(
  source: MemorySource,
  family: Family,
  caseId: CaseId,
): CaseFixture<TransactionalStores[Family]> {
  return {
    fixtureId: `memory:${caseId}`,
    port: source.stores[family],
    seed: DETERMINISTIC_SEED,
    readers: readersOf(source),
    scenario: { kind: 'ordinary' },
    close: () => source.close(),
  };
}

async function openMemoryCase<Family extends ExistingFamily>(
  family: Family,
  caseId: CaseId,
  openSource: OpenSource = openMemorySource,
): Promise<CaseFixture<TransactionalStores[Family]>> {
  return memoryFixture(await seedMemorySource(openSource), family, caseId);
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
  directory: (caseId) => openMemoryCase('directory', caseId),
  eventLog: (caseId) => openMemoryCase('eventLog', caseId),
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

const knownGaps = [unknownStepGap, capacityMissingReferenceGap, priorityMissingProjectGap];

const declaration: SourceDeclaration = {
  name: 'memory',
  revision: '3161e5fc',
  historyAdmission: 'independent-write',
  // This slice executes four families; Task 7.1 replaces this test boundary
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
    directory: { kind: 'offered', gaps: [], open: openers.directory },
    eventLog: { kind: 'offered', gaps: [], open: openers.eventLog },
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

interface FaultContext {
  readonly registration: ReturnType<typeof existingStoreRegistrations>[number];
  assertionFailure: string | null;
  report: ExecutionReport | null;
}

async function proveFault(fault: Fault<MemorySource>): Promise<FaultProof> {
  return recordFaultProof(fault, {
    assertion: `${fault.caseId} reports passed`,
    async setup(run: FaultRun<MemorySource>) {
      const source = await seedMemorySource(brokenSource(openMemorySource, run));
      let wasOpened = false;
      const takeFixture = <Family extends ExistingFamily>(
        family: Family,
        caseId: CaseId,
      ): Promise<CaseFixture<TransactionalStores[Family]>> => {
        if (wasOpened) return Promise.reject(new Error(`${fault.caseId} fixture opened twice`));
        wasOpened = true;
        return Promise.resolve(memoryFixture(source, family, caseId));
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
        directory: (caseId) => takeFixture('directory', caseId),
        eventLog: (caseId) => takeFixture('eventLog', caseId),
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

describe('memory existing source conformance', () => {
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
    // Proof: the four real memory mutations failed respectively with the tight
    // sibling still at position 11, `Escaped rename`, the child's old parent
    // `work-a-one`, and the retained number received as null.
    expect(failures[0]).toContain('"position": 11');
    expect(failures[1]).toContain('"name": "Escaped rename"');
    expect(failures[2]).toContain('"parentId": "work-a-one"');
    expect(failures[3]).toContain('"frozenNumber": null');

    const restored = await runCases(existingStoreRegistrations(openers), {
      focus: faults.map(({ caseId }) => caseId),
    });
    expect(restored.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual(
      faults.map(({ caseId }) => ({ caseId, status: 'passed' })),
    );
  });
});
