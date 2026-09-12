import {
  type Capabilities,
  type CaseFixture,
  type CaseId,
  DETERMINISTIC_SEED,
  type ExecutionReport,
  type ExistingStoreOpeners,
  existingStoreRegistrations,
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

async function seedMemorySource(): Promise<ReturnType<typeof openMemorySource>> {
  const source = openMemorySource();
  const { stores } = source;
  const seed = DETERMINISTIC_SEED;
  for (const [index, ownerId] of seed.ownerIds.entries()) {
    await stores.users.create(
      {
        id: ownerId,
        username: `owner-${String(index + 1)}`,
        passwordHash: 'x',
        createdAt: seed.stamps[index]?.at ?? 0,
      },
      seed.stamps[index] ?? seed.stamps[0],
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
      projectRow({ id: projectId, ownerId, name: `Project ${String(index + 1)}` }),
      starting,
      seed.stamps[index] ?? seed.stamps[0],
    );
    for (const step of starting) await stores.steps.add(step, seed.stamps[index] ?? seed.stamps[0]);
    const workItemIds = seed.workItemIds[index] ?? seed.workItemIds[0];
    for (const [rowIndex, id] of workItemIds.entries()) {
      await stores.workItems.insert(
        workItemRow({ id, projectId, name: `Work ${String(rowIndex + 1)}` }),
        [],
        seed.stamps[index] ?? seed.stamps[0],
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

async function openMemoryCase<Family extends ExistingFamily>(
  family: Family,
  caseId: CaseId,
): Promise<CaseFixture<TransactionalStores[Family]>> {
  const source = await seedMemorySource();
  return {
    fixtureId: `memory:${caseId}`,
    port: source.stores[family],
    seed: DETERMINISTIC_SEED,
    readers: readersOf(source),
    scenario: { kind: 'ordinary' },
    close: () => source.close(),
  };
}

const openers: ExistingStoreOpeners = {
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
    steps: { kind: 'offered', gaps: [], open: openers.steps },
    estimates: { kind: 'offered', gaps: [unknownStepGap], open: openers.estimates },
    directory: { kind: 'offered', gaps: [], open: openers.directory },
    eventLog: { kind: 'offered', gaps: [], open: openers.eventLog },
  } as unknown as Capabilities,
};

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
});
