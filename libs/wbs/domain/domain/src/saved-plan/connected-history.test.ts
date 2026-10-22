import { describe, expect, test } from 'bun:test';

import { connectedHistoryFixture } from './connected-history.fixture';
import {
  encodeSavedPlacement,
  readSavedConnectedScheduleEvidence,
  serializeSavedConnectedScheduleEvidence,
  validateSavedConnectedHistory,
} from './connected-schedule';
import { readSavedDependencyHistory, serializeSavedDependencyHistory } from './dependency-history';

describe('immutable connected history codec', () => {
  test('preserves captured selectors, null labels and pre-selection stages without scheduling', () => {
    const { history, evidence } = connectedHistoryFixture();
    const captured = readSavedDependencyHistory(history);
    const placement = readSavedConnectedScheduleEvidence(evidence);
    validateSavedConnectedHistory(captured, placement);
    const roundTrip = readSavedDependencyHistory(
      JSON.parse(serializeSavedDependencyHistory(captured)),
    );
    expect(roundTrip.kind).toBe('connected');
    if (roundTrip.kind !== 'connected') throw new Error('expected connected fixture');
    expect(roundTrip.relationships.map((relationship) => relationship.id).sort()).toEqual(
      history.relationships.map((relationship) => relationship.id).sort(),
    );
    expect(
      roundTrip.relationships.find((relationship) => relationship.id === 'ff')?.predecessor.scope,
    ).toBe('descendant-step');
    expect(
      roundTrip.relationships.find((relationship) => relationship.id === 'fs')?.predecessor
        .stepReference,
    ).toBeNull();
    expect(roundTrip.projects as unknown).toEqual(history.projects);
    expect(JSON.parse(serializeSavedConnectedScheduleEvidence(placement))).toEqual(evidence);
    expect(placement.stages[0]?.stageBytes).not.toBe(placement.stages[1]?.stageBytes);
    expect(Object.isFrozen(captured)).toBe(true);
  });
  test('detaches nested caller mutations', () => {
    const { history, evidence } = connectedHistoryFixture();
    const captured = readSavedDependencyHistory(history);
    const selected = readSavedConnectedScheduleEvidence(evidence);
    const before = serializeSavedDependencyHistory(captured);
    const selectedBefore = serializeSavedConnectedScheduleEvidence(selected);
    history.projects[0].name = 'renamed';
    evidence.composite.slices['a\u0000design'].earliestStart = 900;
    expect(serializeSavedDependencyHistory(captured)).toBe(before);
    expect(serializeSavedConnectedScheduleEvidence(selected)).toBe(selectedBefore);
  });
  test('canonicalizes unordered insertion while preserving stage execution order', () => {
    const { evidence, history } = connectedHistoryFixture();
    const reversed = structuredClone(evidence);
    reversed.composite.slices = Object.fromEntries(
      Object.entries(reversed.composite.slices).reverse(),
    );
    expect(
      serializeSavedConnectedScheduleEvidence(readSavedConnectedScheduleEvidence(reversed)),
    ).toBe(serializeSavedConnectedScheduleEvidence(readSavedConnectedScheduleEvidence(evidence)));
    reversed.stages.reverse();
    expect(() => {
      validateSavedConnectedHistory(
        readSavedDependencyHistory(history),
        readSavedConnectedScheduleEvidence(reversed),
      );
    }).toThrow('stage_order');
  });
  test.each([
    'missing-field',
    'duplicate',
    'unknown-owner',
    'unknown-endpoint',
    'nonfinite',
    'unknown-field',
  ])('refuses malformed dependency evidence: %s', (fault) => {
    const { history } = connectedHistoryFixture();
    if (fault === 'missing-field')
      delete (history.projects[0] as Partial<(typeof history.projects)[number]>).abbreviation;
    if (fault === 'duplicate') history.projects.push(history.projects[0]);
    if (fault === 'unknown-owner') history.ownership[0] = ['root', 'foreign'];
    if (fault === 'unknown-endpoint') history.relationships[0].predecessor.workItemId = 'absent';
    if (fault === 'nonfinite') history.projects[0].rank = Infinity;
    if (fault === 'unknown-field') Object.assign(history.projects[0], { unexpected: true });
    expect(() => readSavedDependencyHistory(history)).toThrow();
  });
  test('refuses candidate question mismatching its captured stage', () => {
    const { evidence } = connectedHistoryFixture();
    evidence.stages[0].variants!.time.candidate.question.stageBytes = evidence.stages[1].stageBytes;
    expect(() => readSavedConnectedScheduleEvidence(evidence)).toThrow('question_identity');
  });
  test('requires every explicitly empty canonical stage collection', () => {
    const { evidence } = connectedHistoryFixture();
    const stage = evidence.stages[1];
    const packet = JSON.parse(stage.stageBytes) as { elsewhere?: unknown };
    expect(packet.elsewhere).toEqual([]);
    delete packet.elsewhere;
    stage.stageBytes = JSON.stringify(packet);
    expect(() => readSavedConnectedScheduleEvidence(evidence)).toThrow();
  });
  test('retains unavailable calendar reason without manufacturing placement', () => {
    const { history } = connectedHistoryFixture();
    Object.assign(history, {
      placementState: {
        kind: 'dependency_calendar_missing',
        projects: [{ projectId: 'B', abbreviation: 'B', name: 'Beta' }],
      },
    });
    const captured = readSavedDependencyHistory(history);
    validateSavedConnectedHistory(captured, null);
    expect(() => {
      validateSavedConnectedHistory(
        captured,
        readSavedConnectedScheduleEvidence(connectedHistoryFixture().evidence),
      );
    }).toThrow('placement_state');
  });
});

test('explicit map encoding retains every slice and work item', () => {
  const { evidence } = connectedHistoryFixture();
  const schedule = {
    ...evidence.baseline,
    slices: new Map(Object.entries(evidence.baseline.slices)),
    workItems: new Map(Object.entries(evidence.baseline.workItems)),
    eventsVisited: 0,
  };
  const captured = encodeSavedPlacement(schedule as Parameters<typeof encodeSavedPlacement>[0]);
  expect(Object.keys(captured.slices)).toHaveLength(3);
  expect(Object.keys(captured.workItems)).toHaveLength(2);
  const reversed = {
    ...schedule,
    slices: new Map([...schedule.slices].reverse()),
    workItems: new Map([...schedule.workItems].reverse()),
  };
  expect(
    serializeSavedConnectedScheduleEvidence(
      readSavedConnectedScheduleEvidence({
        ...evidence,
        baseline: encodeSavedPlacement(reversed as Parameters<typeof encodeSavedPlacement>[0]),
      }),
    ),
  ).toBe(serializeSavedConnectedScheduleEvidence(readSavedConnectedScheduleEvidence(evidence)));
});

test('empty component has null axis and no fabricated stage', () => {
  const { history, evidence } = connectedHistoryFixture();
  const emptyHistory = readSavedDependencyHistory({
    ...history,
    projects: history.projects.map((project) => ({ ...project, workItems: [] })),
    relationships: [],
    ownership: [],
    readiness: [],
    graph: { nodes: [], edges: [] },
  });
  const empty = { workItems: {}, slices: {}, waitingForPerson: 0, waitingForCapacity: 0 };
  const captured = readSavedConnectedScheduleEvidence({
    ...evidence,
    originOrdinal: null,
    baseline: empty,
    composite: empty,
    stages: [],
    idleProjects: ['B', 'A'],
  });
  expect(() => {
    validateSavedConnectedHistory(emptyHistory, captured);
  }).not.toThrow();
});

test('boundary-infeasible keeps the scoped certificate and displayed schedule', () => {
  const { history, evidence } = connectedHistoryFixture();
  const stage = evidence.stages[0];
  const question = stage.variants!.time.candidate.question;
  const captured = readSavedConnectedScheduleEvidence({
    ...evidence,
    composite: evidence.baseline,
    stages: [
      {
        ...stage,
        selected: null,
        variants: {
          pri: { state: 'pending' },
          time: {
            state: 'boundary-infeasible',
            certificate: {
              kind: 'boundary-infeasible',
              question,
              evidence: 'contradictory-bounds',
            },
          },
        },
      },
      {
        ...evidence.stages[1],
        stageBytes: JSON.stringify({
          ...(JSON.parse(evidence.stages[1].stageBytes) as Record<string, unknown>),
          starts: (JSON.parse(stage.stageBytes) as { starts: unknown }).starts,
          finishes: (JSON.parse(stage.stageBytes) as { finishes: unknown }).finishes,
        }),
      },
    ],
  });
  expect(captured.stages[0]?.variants?.time.state).toBe('boundary-infeasible');
  expect(() => {
    validateSavedConnectedHistory(readSavedDependencyHistory(history), captured);
  }).not.toThrow();
});

test('refuses a later boundary rewritten from final placements', () => {
  const { history, evidence } = connectedHistoryFixture();
  const packet = JSON.parse(evidence.stages[1].stageBytes) as {
    starts: [string, number][];
    finishes: [string, number][];
  };
  packet.starts[2][1] = 800;
  packet.finishes[2][1] = 900;
  evidence.stages[1].stageBytes = JSON.stringify(packet);
  expect(() => {
    validateSavedConnectedHistory(
      readSavedDependencyHistory(history),
      readSavedConnectedScheduleEvidence(evidence),
    );
  }).toThrow('stage_boundary');
});

test('historical reader operates with the live scheduler module poisoned', () => {
  const dependencyUrl = new URL('./dependency-history.ts', import.meta.url).href;
  const scheduleUrl = new URL('./connected-schedule.ts', import.meta.url).href;
  const fixtureUrl = new URL('./connected-history.fixture.ts', import.meta.url).href;
  const liveUrl = new URL('../schedule.ts', import.meta.url).href;
  const script = `import { mock } from 'bun:test';
    mock.module(${JSON.stringify(liveUrl)}, () => { throw new Error('live scheduler imported'); });
    const { readSavedDependencyHistory } = await import(${JSON.stringify(dependencyUrl)});
    const { readSavedConnectedScheduleEvidence, validateSavedConnectedHistory } = await import(${JSON.stringify(scheduleUrl)});
    const { connectedHistoryFixture } = await import(${JSON.stringify(fixtureUrl)});
    const { history, evidence } = connectedHistoryFixture();
    validateSavedConnectedHistory(readSavedDependencyHistory(history), readSavedConnectedScheduleEvidence(evidence));`;
  const execution = Bun.spawnSync([process.execPath, '--eval', script]);
  expect(new TextDecoder().decode(execution.stderr)).toBe('');
  expect(execution.exitCode).toBe(0);
});

test.each([
  'readiness-cause',
  'graph-endpoint',
  'node-scope',
  'duplicate-map',
  'nonfinite-placement',
  'candidate-keys',
  'target-mismatch',
])('refuses conflicting historical references: %s', (fault) => {
  const { history, evidence } = connectedHistoryFixture();
  if (fault === 'readiness-cause') history.readiness[0].causes[0].workItemId = 'absent';
  if (fault === 'graph-endpoint') history.graph.edges[0].predecessor.leafId = 'absent';
  if (fault === 'node-scope') history.relationships[0].predecessor.scope = 'descendant-step';
  if (fault === 'nonfinite-placement')
    evidence.composite.slices['a\u0000design'].earliestStart = NaN;
  if (fault === 'target-mismatch') evidence.targetProjectId = 'B';
  if (fault === 'candidate-keys') evidence.stages[0].variants!.time.candidate.starts.pop();
  if (fault === 'duplicate-map') {
    const packet = JSON.parse(evidence.stages[1].stageBytes) as { starts: [string, number][] };
    packet.starts.push(packet.starts[0]);
    evidence.stages[1].stageBytes = JSON.stringify(packet);
  }
  expect(() => {
    validateSavedConnectedHistory(
      readSavedDependencyHistory(history),
      readSavedConnectedScheduleEvidence(evidence),
    );
  }).toThrow();
});

test.each([
  'missing-node-and-reading',
  'wrong-node-position',
  'missing-stage-member',
  'forged-stage-selector',
])('refuses incomplete component evidence: %s', (fault) => {
  const { history, evidence } = connectedHistoryFixture();
  if (fault === 'missing-node-and-reading') {
    history.graph.nodes.splice(1, 1);
    history.readiness.splice(1, 1);
    history.graph.edges.splice(1, 1);
  }
  if (fault === 'wrong-node-position') history.graph.nodes[1].at = 50;
  if (fault === 'missing-stage-member' || fault === 'forged-stage-selector') {
    const packet = JSON.parse(evidence.stages[1].stageBytes) as {
      projects: unknown[];
      relationships: { predecessor: string[] }[];
    };
    if (fault === 'missing-stage-member') packet.projects.pop();
    else packet.relationships[0].predecessor[2] = 'nonexistent-retired-row';
    evidence.stages[1].stageBytes = JSON.stringify(packet);
  }
  expect(() => {
    validateSavedConnectedHistory(
      readSavedDependencyHistory(history),
      readSavedConnectedScheduleEvidence(evidence),
    );
  }).toThrow();
});

test('names the missing endpoint lookup boundary', () => {
  const { history } = connectedHistoryFixture();
  history.relationships[0].predecessor.workItemId = 'absent';
  expect(() => readSavedDependencyHistory(history)).toThrow('endpoint_lookup');
});

describe('reviewed historical stage invariants', () => {
  test.each(['enabled Fast', 'disabled optimized'])(
    'retains %s without selecting observed candidates',
    (configuration) => {
      const { history, evidence } = connectedHistoryFixture();
      const stage = evidence.stages[0];
      const firstPacket = JSON.parse(stage.stageBytes) as { starts: unknown; finishes: unknown };
      const nextPacket = JSON.parse(evidence.stages[1].stageBytes) as Record<string, unknown>;
      const isFast = configuration === 'enabled Fast';
      const capturedHistory = readSavedDependencyHistory({
        ...history,
        projects: history.projects.map((project) =>
          project.projectId === 'A'
            ? { ...project, engine: isFast ? 'fast' : 'optimized', enabled: isFast }
            : project,
        ),
      });
      const captured = readSavedConnectedScheduleEvidence({
        ...evidence,
        composite: evidence.baseline,
        stages: [
          {
            ...stage,
            engine: isFast ? 'fast' : 'optimized',
            variants: isFast ? stage.variants : null,
            selected: null,
          },
          {
            ...evidence.stages[1],
            stageBytes: JSON.stringify({
              ...nextPacket,
              starts: firstPacket.starts,
              finishes: firstPacket.finishes,
            }),
          },
        ],
      });
      expect(() => {
        validateSavedConnectedHistory(capturedHistory, captured);
      }).not.toThrow();
      expect(captured.stages[0]?.selected).toBeNull();
      expect(captured.stages[0]?.variants?.time.state).toBe(isFast ? 'ready' : undefined);
    },
  );

  test('refuses swapped stage step identities at otherwise complete positions', () => {
    const { evidence } = connectedHistoryFixture();
    const packet = JSON.parse(evidence.stages[1].stageBytes) as { nodes: { at: number }[] };
    [packet.nodes[0].at, packet.nodes[1].at] = [packet.nodes[1].at, packet.nodes[0].at];
    evidence.stages[1].stageBytes = JSON.stringify(packet);
    expect(() => readSavedConnectedScheduleEvidence(evidence)).toThrow('stage_node_position');
  });

  test.each(['predecessor', 'successor'] as const)(
    'refuses authored stage edge with foreign %s ownership',
    (side) => {
      const { evidence } = connectedHistoryFixture();
      const packet = JSON.parse(evidence.stages[1].stageBytes) as {
        edges: {
          predecessor: { leafId: string; at: number };
          successor: { leafId: string; at: number };
        }[];
      };
      packet.edges[0][side] = { leafId: side === 'predecessor' ? 'b' : 'a', at: 0 };
      evidence.stages[1].stageBytes = JSON.stringify(packet);
      expect(() => readSavedConnectedScheduleEvidence(evidence)).toThrow('stage_edge_ownership');
    },
  );

  test.each(['baseline', 'composite', 'decision baseline', 'decision schedule'])(
    'refuses reversed work-item intervals in %s',
    (location) => {
      for (const coordinate of ['earliest', 'latest'] as const) {
        const { evidence } = connectedHistoryFixture();
        const decision = evidence.stages[0].variants!.time.decision;
        const placement =
          location === 'baseline'
            ? evidence.baseline
            : location === 'composite'
              ? evidence.composite
              : location === 'decision baseline'
                ? decision.baseline
                : decision.schedule;
        placement.workItems.a[coordinate === 'earliest' ? 'earliestFinish' : 'latestFinish'] = -1;
        expect(() => readSavedConnectedScheduleEvidence(evidence)).toThrow('placement_interval');
      }
    },
  );
});

test('Fast cannot select an observed ready objective', () => {
  const { evidence } = connectedHistoryFixture();
  evidence.stages[0].engine = 'fast';
  expect(() => readSavedConnectedScheduleEvidence(evidence)).toThrow('selected_objective');
});

test.each(['disabled observed', 'enabled optimized unobserved'])(
  'refuses inconsistent stage enablement: %s',
  (configuration) => {
    const { history, evidence } = connectedHistoryFixture();
    const enabled = configuration === 'enabled optimized unobserved';
    const capturedHistory = readSavedDependencyHistory({
      ...history,
      projects: history.projects.map((project) =>
        project.projectId === 'A' ? { ...project, enabled } : project,
      ),
    });
    const captured = readSavedConnectedScheduleEvidence({
      ...evidence,
      stages: evidence.stages.map((stage) =>
        stage.projectId === 'A' && enabled ? { ...stage, variants: null, selected: null } : stage,
      ),
    });
    expect(() => {
      validateSavedConnectedHistory(capturedHistory, captured);
    }).toThrow('stage_enablement');
  },
);
