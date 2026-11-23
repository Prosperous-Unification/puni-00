import { canonicalisePlanInput } from './canonical-plan-input';
import { leafHistoryFixture } from './leaf-dependency-history.fixture';
import { planFixtureRows } from './plan-fixture';

export { leafScheduleFixture } from './leaf-connected-schedule.fixture';

/** Synthetic new-format controls; the frozen predecessor fixture remains untouched and is never a current Source certificate. */
export function input13Fixture(connected = false) {
  const authored = canonicalisePlanInput(planFixtureRows);
  const history = leafHistoryFixture(),
    member = history.workPackages[0],
    template = authored.workItems.find((row) => row.id === 'w2');
  if (template === undefined) throw new Error('fixture row template absent');
  return structuredClone({
    ...authored,
    schemaVersion: 13 as const,
    workPackage: {
      ...authored.workPackage,
      id: 'package',
      name: 'Package',
      projectId: 'recorded-parent',
      startDate: null,
      timezone: 'UTC',
    },
    workItems: member.workItems.map((row, position) => ({
      ...template,
      id: row.id,
      parentId: row.parentId,
      position,
      name: row.name,
      hold: row.hold,
      typeIds: [],
      tagIds: [],
      externalRefs: [],
      serviceTeamId: null,
      serviceId: null,
      frozenNumber: null,
    })),
    steps: member.steps.map((step) => ({
      ...step,
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    })),
    leafSteps: member.leafSteps,
    stepValues: [
      {
        workItemId: 'story',
        stepId: 'dev',
        optimistic: 1,
        realistic: 1,
        pessimistic: 1,
        derived: 1,
        actual: null,
        progress: null,
      },
    ],
    stepBlockages: [],
    stepParallels: [],
    measures: [],
    measureEstimates: [],
    budgets: [],
    dependencies: [],
    typedDependencies: [
      {
        id: 'qa-after-parent',
        type: 'FS' as const,
        predecessor: { scope: 'descendant-step' as const, workItemId: 'P', stepId: 'qa' },
        successor: { scope: 'node' as const, workItemId: 'target', stepId: 'qa' },
      },
    ],
    assignments: [],
    people: [],
    teams: [],
    services: [],
    personTeams: [],
    teamServices: [],
    workItemTeams: [],
    workItemServices: [],
    priorityBands: [],
    capacity: [],
    tags: [],
    workItemTypes: [],
    externalSystems: [],
    dependencyHistory: connected ? history : { kind: 'local' as const },
  });
}
