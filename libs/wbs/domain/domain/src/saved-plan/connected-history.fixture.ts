import type { PlanInputRows } from './canonical-plan-input';
import type { SavedConnectedDependencyHistory } from './dependency-history';
import { planFixtureRows } from './plan-fixture';

export function connectedHistoryFixture() {
  const steps = [
    { id: 'design', code: null, name: 'Design', position: 0 },
    { id: 'test', code: 'test', name: 'Test', position: 1 },
  ];
  const span = (start: number, finish: number) => ({
    duration: finish - start,
    estimated: true,
    earliestStart: start,
    earliestFinish: finish,
    latestStart: start,
    latestFinish: finish,
    float: 0,
    critical: true,
  });
  const slices = [
    ['a\u0000design', 'a', 'design', 0, 1],
    ['a\u0000test', 'a', 'test', 3, 4],
    ['b\u0000build', 'b', 'build', 1, 3],
  ] as const;
  const placement = (offset: number) => ({
    workItems: { a: span(0, 4 + offset), b: span(1, 3) },
    slices: Object.fromEntries(
      slices.map(([key, workItemId, stepId, start, finish]) => [
        key,
        {
          ...span(
            start + (workItemId === 'a' ? offset : 0),
            finish + (workItemId === 'a' ? offset : 0),
          ),
          workItemId,
          stepId,
          personId: null,
          boundBy: 'projectStart',
          resourcePredecessorId: null,
          capacityPredecessorIds: [],
          capacityTeamId: null,
          width: 1,
          effort: finish - start,
          lateBy: null,
        },
      ]),
    ),
    waitingForPerson: 0,
    waitingForCapacity: 0,
  });
  const endpoint = (
    projectId: string,
    workItemId: string,
    step: (typeof steps)[number],
    scope: 'node' | 'descendant-step' = 'node',
  ) => ({
    projectId,
    workItemId,
    scope,
    stepId: step.id,
    name: workItemId === 'root' ? 'Held root' : workItemId,
    projectAbbreviation: projectId,
    workItemNumber: workItemId === 'root' ? '001' : '002',
    step,
    stepNodeId: scope === 'node' ? `sn1.${workItemId}.${step.id}` : null,
    stepReference: null,
    qualifiedReference: null,
    isLeaf: workItemId !== 'root',
  });
  const build = { id: 'build', code: 'build', name: 'Build', position: 0 };
  const relationships = [
    {
      id: 'fs',
      projectId: 'B',
      type: 'FS',
      predecessor: endpoint('A', 'a', steps[0]),
      successor: endpoint('B', 'b', build),
    },
    {
      id: 'ss',
      projectId: 'A',
      type: 'SS',
      predecessor: endpoint('B', 'b', build),
      successor: endpoint('A', 'a', steps[1]),
    },
    {
      id: 'ff',
      projectId: 'B',
      type: 'FF',
      predecessor: endpoint('A', 'root', steps[0], 'descendant-step'),
      successor: endpoint('B', 'b', build),
    },
  ];
  const nodes = [
    { kind: 'step', ref: { workItemId: 'a', stepId: 'design' }, at: 0 },
    { kind: 'step', ref: { workItemId: 'a', stepId: 'test' }, at: 1 },
    { kind: 'step', ref: { workItemId: 'b', stepId: 'build' }, at: 0 },
  ];
  const edges = [
    {
      predecessor: { leafId: 'a', at: 0 },
      successor: { leafId: 'b', at: 0 },
      type: 'FS',
      provenance: 'authored',
      relationshipId: 'fs',
    },
    {
      predecessor: { leafId: 'b', at: 0 },
      successor: { leafId: 'a', at: 1 },
      type: 'SS',
      provenance: 'authored',
      relationshipId: 'ss',
    },
  ];
  const projects = [
    {
      projectId: 'A',
      name: 'Alpha',
      abbreviation: 'A',
      startDate: '2026-10-01',
      timezone: 'UTC',
      rank: 0,
      engine: 'optimized',
      objective: 'time',
      enabled: true,
      steps,
      workItems: [
        {
          id: 'root',
          name: 'Held root',
          parentId: null,
          number: '001',
          hold: 'on_hold',
          status: 'on_hold',
        },
        { id: 'a', name: 'a', parentId: 'root', number: '002', hold: null, status: 'unknown' },
      ],
    },
    {
      projectId: 'B',
      name: 'Beta',
      abbreviation: 'B',
      startDate: '2026-10-02',
      timezone: 'UTC',
      rank: 1,
      engine: 'fast',
      objective: 'pri',
      enabled: false,
      steps: [build],
      workItems: [
        {
          id: 'b',
          name: 'b',
          parentId: null,
          number: '002',
          hold: null,
          status: 'blocked_by_proxy',
        },
      ],
    },
  ];
  const history = {
    kind: 'connected',
    targetProjectId: 'A',
    mode: 'isolated',
    projects,
    relationships,
    graph: { nodes, edges },
    ownership: [
      ['root', 'A'],
      ['a', 'A'],
      ['b', 'B'],
    ],
    readiness: slices.map(([key, workItemId, stepId]) => ({
      kind: 'step',
      key,
      projectId: workItemId === 'a' ? 'A' : 'B',
      workItemId,
      stepId,
      status: workItemId === 'a' ? 'unknown' : 'blocked_by_proxy',
      reading: 'blocked_by_proxy',
      causes: [{ kind: 'work-item', workItemId: 'root' }],
      intrinsic: { started: false, done: false },
      eligibility: { canStart: true, canFinish: true, startBlockers: [], finishBlockers: [] },
    })),
    placementState: { kind: 'scheduled' },
  };
  const stageBytes = (projectId: string, offset: number) =>
    JSON.stringify({
      kind: 'connected-stage',
      projectId,
      mode: 'isolated',
      originOrdinal: 20727,
      projects: projects.map((project, index) => ({
        projectId: project.projectId,
        rank: project.rank,
        anchorOrdinal: 20727 + index,
      })),
      rows: [
        { id: 'a', parentId: null, position: 0, priority: null },
        { id: 'b', parentId: null, position: 0, priority: null },
      ],
      ownership: [
        ['a', 'A'],
        ['b', 'B'],
      ],
      ranks: [
        ['A', 0],
        ['B', 1],
      ],
      slices: [
        {
          workItemId: 'a',
          steps: steps.map((step) => ({
            stepId: step.id,
            days: 1,
            width: 1,
            personId: null,
            poolIds: [],
            demands: [],
          })),
        },
        {
          workItemId: 'b',
          steps: [{ stepId: 'build', days: 2, width: 1, personId: null, poolIds: [], demands: [] }],
        },
      ],
      nodes: nodes.map((node) => ({
        kind: node.kind,
        workItemId: node.ref.workItemId,
        stepId: node.ref.stepId,
        at: node.at,
      })),
      edges,
      relationships: relationships.map((relationship) => ({
        id: relationship.id,
        type: relationship.type,
        predecessor: [
          relationship.predecessor.projectId,
          relationship.predecessor.scope,
          relationship.predecessor.workItemId,
          relationship.predecessor.stepId,
        ],
        successor: [
          relationship.successor.projectId,
          relationship.successor.scope,
          relationship.successor.workItemId,
          relationship.successor.stepId,
        ],
      })),
      notBefore: [],
      deadlines: [],
      poolSizes: [],
      resourceCapacities: [],
      elsewhere: [],
      starts: slices.map(([key, workItemId, , start]) => [
        key,
        start + (workItemId === 'a' ? offset : 0),
      ]),
      finishes: slices.map(([key, workItemId, , , finish]) => [
        key,
        finish + (workItemId === 'a' ? offset : 0),
      ]),
    });
  const aBytes = stageBytes('A', 0);
  const question = {
    projectId: 'A',
    inputHash: 'input',
    questionHash: 'question',
    objective: 'time',
    contractVersion: '1',
    budgetMs: 100,
    quantum: 1,
    wireVersion: 1,
    stageBytes: aBytes,
  };
  const score = { makespan: 4, priority: 7, movement: 0 };
  const decision = {
    scope: { kind: 'connected-stage', projectId: 'A' },
    chosen: 'optimized',
    schedule: placement(1),
    baseline: placement(0),
    values: score,
    optimizedValues: score,
    baselineValues: score,
  };
  const evidence = {
    kind: 'connected',
    targetProjectId: 'A',
    mode: 'isolated',
    originOrdinal: 20727,
    baseline: placement(0),
    composite: placement(1),
    stages: [
      {
        projectId: 'A',
        engine: 'optimized',
        objective: 'time',
        format: 'connected-stage-v1',
        stageBytes: aBytes,
        observation: {
          inputHash: 'input',
          contractVersion: '1',
          budgetMs: 100,
          quantum: 1,
          wireVersion: 1,
        },
        variants: {
          pri: { state: 'pending' },
          time: {
            state: 'ready',
            proof: 'proven',
            candidate: {
              question,
              starts: [
                ['a\u0000design', 1],
                ['a\u0000test', 4],
              ],
            },
            decision,
          },
        },
        selected: 'time',
      },
      {
        projectId: 'B',
        engine: 'fast',
        objective: 'pri',
        format: 'connected-stage-v1',
        stageBytes: stageBytes('B', 1),
        observation: null,
        variants: null,
        selected: null,
      },
    ],
    idleProjects: [],
  };
  return { history, evidence };
}

/** Builds target rows whose identities and parents agree with the captured component. */
export function connectedPlanFixtureRows(history: SavedConnectedDependencyHistory): PlanInputRows {
  const target = history.projects.find((project) => project.projectId === history.targetProjectId);
  if (target === undefined) throw new Error('fixture target must exist');
  return {
    ...planFixtureRows,
    project: {
      ...planFixtureRows.project,
      id: target.projectId,
      name: target.name,
      startDate: target.startDate,
      timezone: target.timezone,
    },
    workItems: target.workItems.map((row, position) => ({
      ...planFixtureRows.workItems[0],
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      position,
      hold: row.hold,
      readiness: null,
      frozenNumber: row.number,
      typeIds: [],
      tagIds: [],
      externalRefs: [],
      serviceTeamId: null,
      serviceId: null,
    })),
    steps: target.steps.map((step) => ({
      ...planFixtureRows.steps[0],
      ...step,
      code: step.code,
    })),
    stepValues: [],
    stepBlockages: [],
    stepParallels: [],
    measures: [],
    dependencies: [],
    typedDependencies: [],
    assignments: [],
    workItemTeams: [],
    workItemServices: [],
  };
}
