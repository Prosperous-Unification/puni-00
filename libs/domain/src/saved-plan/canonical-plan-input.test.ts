import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import {
  CANONICAL_PLAN_INPUT_SCHEMA_VERSION,
  canonicalisePlanInput,
  type CanonicalPlanInput,
  type PlanInputRows,
  serialiseCanonicalPlanInput,
} from './canonical-plan-input';

/**
 * A plan whose every collection holds at least two rows, deliberately supplied
 * out of order. One row each would let a canonicaliser that sorts nothing pass
 * every assertion below.
 */
const rows: PlanInputRows = {
  project: {
    id: 'p1',
    name: 'Rewire the shed',
    restricted: false,
    ownerId: 'u1',
    solutionSlug: 'shed',
    solutionUrl: null,
    estimateMethod: 'pert',
    depReach: 'whole-item',
    estimateRounding: 'ceil',
    startDate: '2026-09-07',
    pertWeightOptimistic: 1,
    pertWeightRealistic: 4,
    pertWeightPessimistic: 1,
  },
  workItems: [
    {
      id: 'w2',
      parentId: 'w1',
      position: 20,
      name: 'Pull cable',
      notes: '',
      typeIds: ['t-spike', 't-task'],
      tagIds: ['tag-b', 'tag-a'],
      externalRefs: [
        { externalSystemId: 'jira', url: 'https://jira/SHED-2', position: 20 },
        { externalSystemId: 'gh', url: 'https://gh/17', position: 10 },
      ],
      priority: 30,
      maxParallel: 1,
      frozenNumber: null,
      serviceTeamId: 'team-1',
      serviceId: null,
      startNoEarlierThan: null,
      startNoEarlierThanReason: null,
    },
    {
      id: 'w1',
      parentId: null,
      position: 10,
      name: 'Electrics',
      notes: 'consented',
      typeIds: [],
      tagIds: ['tag-a'],
      externalRefs: [],
      priority: 10,
      maxParallel: 2,
      frozenNumber: '1',
      serviceTeamId: null,
      serviceId: 'svc-1',
      startNoEarlierThan: '2026-09-14',
      startNoEarlierThanReason: 'inspection booked',
    },
  ],
  steps: [
    { id: 's2', name: 'Test', position: 20 },
    { id: 's1', name: 'Build', position: 10 },
  ],
  stepValues: [
    {
      workItemId: 'w2',
      stepId: 's1',
      optimistic: 1,
      realistic: 2,
      pessimistic: 5,
      derived: 2.5,
      actual: null,
      progress: 0,
    },
    {
      workItemId: 'w1',
      stepId: 's2',
      optimistic: null,
      realistic: null,
      pessimistic: null,
      derived: null,
      actual: 3,
      progress: 100,
    },
  ],
  measures: [
    { workItemId: 'w2', kind: 'tokens', value: 1200 },
    { workItemId: 'w2', kind: 'hours', value: 8 },
  ],
  dependencies: [
    { predecessorId: 'w2', successorId: 'w1' },
    { predecessorId: 'w1', successorId: 'w2' },
  ],
  assignments: [
    { workItemId: 'w2', personId: 'per-2' },
    { workItemId: 'w1', personId: 'per-1' },
  ],
  people: [
    { id: 'per-2', name: 'Bo' },
    { id: 'per-1', name: 'Ada' },
  ],
  teams: [
    { id: 'team-2', name: 'Second fix' },
    { id: 'team-1', name: 'First fix' },
  ],
  services: [
    { id: 'svc-2', name: 'Testing' },
    { id: 'svc-1', name: 'Wiring' },
  ],
  personTeams: [
    { personId: 'per-2', teamId: 'team-2' },
    { personId: 'per-1', teamId: 'team-1' },
  ],
  teamServices: [
    { teamId: 'team-2', serviceId: 'svc-2' },
    { teamId: 'team-1', serviceId: 'svc-1' },
  ],
  workItemTeams: [
    { workItemId: 'w2', teamId: 'team-2' },
    { workItemId: 'w1', teamId: 'team-1' },
  ],
  workItemServices: [
    { workItemId: 'w2', serviceId: 'svc-2' },
    { workItemId: 'w1', serviceId: 'svc-1' },
  ],
  priorityBands: [
    { startsAt: 21, label: 'High', writes: 30 },
    { startsAt: 1, label: 'Critical', writes: 10 },
  ],
  capacity: [
    { teamId: 'team-2', people: 1 },
    { teamId: 'team-1', people: 3 },
  ],
  tags: [
    { id: 'tag-b', name: 'risky' },
    { id: 'tag-a', name: 'agreed' },
  ],
  workItemTypes: [
    { id: 't-epic', name: 'Epic' },
    { id: 't-task', name: 'Task' },
    // `w2` states this one too, and the registry's contract is every type id the
    // captured items use — a fixture that omits it contradicts its own field doc.
    { id: 't-spike', name: 'Spike' },
  ],
  externalSystems: [
    { id: 'jira', name: 'Jira' },
    { id: 'gh', name: 'GitHub' },
  ],
};

/** Every collection reversed — same plan, opposite arrival order. */
function reversed(values: PlanInputRows): PlanInputRows {
  return {
    ...values,
    workItems: [...values.workItems].reverse().map((row) => ({
      ...row,
      typeIds: [...row.typeIds].reverse(),
      tagIds: [...row.tagIds].reverse(),
      externalRefs: [...row.externalRefs].reverse(),
    })),
    steps: [...values.steps].reverse(),
    stepValues: [...values.stepValues].reverse(),
    measures: [...values.measures].reverse(),
    dependencies: [...values.dependencies].reverse(),
    assignments: [...values.assignments].reverse(),
    people: [...values.people].reverse(),
    teams: [...values.teams].reverse(),
    services: [...values.services].reverse(),
    personTeams: [...values.personTeams].reverse(),
    teamServices: [...values.teamServices].reverse(),
    workItemTeams: [...values.workItemTeams].reverse(),
    workItemServices: [...values.workItemServices].reverse(),
    priorityBands: [...values.priorityBands].reverse(),
    capacity: [...values.capacity].reverse(),
    tags: [...values.tags].reverse(),
    workItemTypes: [...values.workItemTypes].reverse(),
    externalSystems: [...values.externalSystems].reverse(),
  };
}

describe('canonicalisePlanInput', () => {
  it('serializes identically whatever order the rows arrived in', () => {
    const left = serialiseCanonicalPlanInput(canonicalisePlanInput(rows));
    const right = serialiseCanonicalPlanInput(canonicalisePlanInput(reversed(rows)));

    expect(right).toBe(left);
  });

  it('stamps the schema version the body carries', () => {
    expect(canonicalisePlanInput(rows).schemaVersion).toBe(CANONICAL_PLAN_INPUT_SCHEMA_VERSION);
  });

  it('keeps no key the closed field list does not name', () => {
    // A read row carrying an audit column, a write counter and a refresh cursor
    // — the three classes the JSDoc rules out. None may reach the bytes.
    const contaminated = {
      ...rows,
      project: {
        ...rows.project,
        revision: 41,
        createdAt: 1_756_000_000,
        updatedAt: 1_756_000_001,
        createdBy: 'u9',
      },
      workItems: rows.workItems.map((row) => ({ ...row, revision: 7 })),
      latestSeq: 918,
    } as unknown as PlanInputRows;

    const bytes = serialiseCanonicalPlanInput(canonicalisePlanInput(contaminated));

    expect(bytes).toBe(serialiseCanonicalPlanInput(canonicalisePlanInput(rows)));
    for (const leaked of ['revision', 'createdAt', 'updatedAt', 'createdBy', 'latestSeq']) {
      expect(bytes).not.toContain(leaked);
    }
  });

  /**
   * The whole type set, not one of it. `typeId: string | null` held exactly one
   * id and this fixture row states two, so a singular field silently keeps
   * whichever the fold reached for — and `workItemTypes`, whose contract is
   * "every work-item-type id the captured items use", is enumerated from this.
   */
  it('stores every work-item type a row states, not one of them', () => {
    const [typed] = canonicalisePlanInput(rows).workItems.filter((row) => row.id === 'w2');

    expect(typed.typeIds).toEqual(['t-spike', 't-task']);
  });

  /**
   * An external ref is identified by its `url`; `work_item_external_ref` has no
   * `external_id` column. Sorting by a field the row cannot supply compares
   * `undefined` with `undefined`, which leaves arrival order in the bytes — so
   * this asserts the *sorted* order rather than only that both fields survive.
   */
  it('orders external refs by system then url, and keeps the shown position', () => {
    const [linked] = canonicalisePlanInput(rows).workItems.filter((row) => row.id === 'w2');

    expect(linked.externalRefs).toEqual([
      { externalSystemId: 'gh', url: 'https://gh/17', position: 10 },
      { externalSystemId: 'jira', url: 'https://jira/SHED-2', position: 20 },
    ]);
  });

  /**
   * The watched negative for 1.3. A canonicaliser that stops sorting work items
   * still returns a perfectly well-typed value, so the only thing that can
   * catch it is the byte comparison above — proved here by running that
   * comparison against a copy with exactly that one sort removed.
   */
  it('the byte comparison is what catches a dropped sort', () => {
    const withoutWorkItemSort = (values: PlanInputRows): CanonicalPlanInput => ({
      ...canonicalisePlanInput(values),
      workItems: values.workItems,
    });

    const left = JSON.stringify(withoutWorkItemSort(rows));
    const right = JSON.stringify(withoutWorkItemSort(reversed(rows)));

    expect(right).not.toBe(left);
  });
});

describe('canonicalisePlanInput round trip', () => {
  /**
   * Generated plans rather than the fixture: the round trip must hold for row
   * counts and orderings nobody wrote down, which is where a sort that ties on
   * an unstable key shows up.
   */
  const arbitraryRows = fc
    .record({
      ids: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), {
        minLength: 1,
        maxLength: 8,
      }),
      tagIds: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 4 }),
      teamIds: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 4 }),
      startDate: fc.option(fc.constant('2026-09-07'), { nil: null }),
    })
    .map(({ ids, tagIds, teamIds, startDate }): PlanInputRows => {
      const named = (id: string) => ({ id, name: `name ${id}` });
      return {
        project: { ...rows.project, startDate },
        workItems: ids.map((id, index) => ({
          id,
          parentId: index === 0 ? null : (ids[0] ?? null),
          position: (index + 1) * 10,
          name: `item ${id}`,
          notes: '',
          typeIds: [],
          tagIds,
          externalRefs: [],
          priority: index,
          maxParallel: 1,
          frozenNumber: null,
          serviceTeamId: teamIds[0] ?? null,
          serviceId: null,
          startNoEarlierThan: null,
          startNoEarlierThanReason: null,
        })),
        steps: [{ id: 's1', name: 'Build', position: 10 }],
        stepValues: ids.map((id) => ({
          workItemId: id,
          stepId: 's1',
          optimistic: 1,
          realistic: 2,
          pessimistic: 3,
          derived: 2,
          actual: null,
          progress: 0,
        })),
        measures: [],
        dependencies: [],
        assignments: [],
        people: [],
        teams: teamIds.map(named),
        services: [],
        personTeams: [],
        teamServices: [],
        workItemTeams: [],
        workItemServices: [],
        priorityBands: rows.priorityBands,
        capacity: teamIds.map((teamId) => ({ teamId, people: 1 })),
        tags: tagIds.map(named),
        workItemTypes: [],
        externalSystems: [],
      };
    });

  it('canonicalise, serialize, parse, canonicalise again — identical bytes', () => {
    fc.assert(
      fc.property(arbitraryRows, (values) => {
        const once = serialiseCanonicalPlanInput(canonicalisePlanInput(values));
        const parsed = JSON.parse(once) as PlanInputRows;
        const twice = serialiseCanonicalPlanInput(canonicalisePlanInput(parsed));

        expect(twice).toBe(once);
      }),
      { numRuns: 200 },
    );
  });
});
