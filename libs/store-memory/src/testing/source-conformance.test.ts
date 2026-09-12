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
import type { TransactionalStores } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
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
  return source;
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

const declaration: SourceDeclaration = {
  name: 'memory',
  revision: '3161e5fc',
  historyAdmission: 'independent-write',
  // This slice executes four families; Task 7.1 replaces this test boundary
  // with the complete source declaration before terminal certification.
  capabilities: {
    projects: { kind: 'offered', gaps: [], open: openers.projects },
    steps: { kind: 'offered', gaps: [], open: openers.steps },
    estimates: { kind: 'offered', gaps: [unknownStepGap], open: openers.estimates },
    directory: { kind: 'offered', gaps: [], open: openers.directory },
    eventLog: { kind: 'offered', gaps: [], open: openers.eventLog },
  } as unknown as Capabilities,
};

function withStores(source: MemorySource, stores: Partial<TransactionalStores>): MemorySource {
  return { ...source, stores: { ...source.stores, ...stores } };
}

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
  it('runs every offered existing case and reports the exact known gap', async () => {
    const registrations = existingStoreRegistrations(openers);
    const report = await runCases(registrations, {
      declaration,
      focus: [...SOURCE_CONFORMANCE_CASES],
    });

    expect(report.kind).toBe('partial');
    expect(
      report.cases.filter(({ status }) => status === 'passed').map(({ caseId }) => caseId),
    ).toEqual(SOURCE_CONFORMANCE_CASES.filter((caseId) => caseId !== unknownStepGap.caseId));
    expect(failedCase(report, unknownStepGap.caseId)).toEqual({
      family: 'estimates',
      caseId: unknownStepGap.caseId,
      status: 'not-offered',
      executed: false,
    });
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
});
