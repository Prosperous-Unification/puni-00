import { buildConnectedSolverRequest } from '@wbs/contracts/solver/build-connected-request';
import { evaluateConnectedSolverOutcome } from '@wbs/contracts/solver/connected-solver-outcome';
import {
  type ConnectedOptimizationStage,
  resolveScheduleInput,
  scheduleResolved,
  sliceKey,
} from '@wbs/domain';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const AB = '44444444-4444-4444-8444-444444444444';
const BC = '55555555-5555-4555-8555-555555555555';

/** Installed-image questions exercising foreign pins and quantized boundary classification. */
export type ConnectedImageScenarioKind = 'connected-feasible' | 'connected-fractional';

function captureStage(fractional: boolean): ConnectedOptimizationStage {
  const resolved = resolveScheduleInput({
    rows: [A, B, C].map((id, position) => ({
      id,
      position,
      parentId: null,
      priority: null,
      frozenNumber: null,
    })),
    slices: [A, B, C].map((workItemId) => ({
      workItemId,
      stepId: null,
      days: fractional && workItemId === A ? 0.2 : 1,
      width: 1,
      personId: null,
      poolIds: [],
    })),
    edges: [
      { predecessorId: A, successorId: B },
      { predecessorId: B, successorId: C },
    ],
    typed: [],
    reach: 'whole-item',
    notBefore: new Map(),
    deadlines: new Map(),
    poolSizes: new Map(),
  });
  const input = {
    ...resolved,
    graph: {
      ...resolved.graph,
      edges: resolved.graph.edges.map((edge, index) => ({
        ...edge,
        provenance: 'authored' as const,
        relationshipId: [AB, BC][index],
      })),
    },
    order: {
      kind: 'connected' as const,
      projectIdByWorkItem: new Map([
        [A, A],
        [B, B],
        [C, C],
      ]),
      rankByProject: new Map([
        [A, 0],
        [B, 1],
        [C, 2],
      ]),
    },
  };
  const placement = scheduleResolved(input);
  return {
    kind: 'connected-stage',
    projectId: B,
    mode: 'isolated',
    originOrdinal: 20000,
    projects: [A, B, C].map((projectId, rank) => ({ projectId, rank, anchorOrdinal: 20000 })),
    input,
    relationships: [
      {
        id: AB,
        type: 'FS',
        predecessor: { scope: 'whole', projectId: A, workItemId: A },
        successor: { scope: 'whole', projectId: B, workItemId: B },
      },
      {
        id: BC,
        type: 'FS',
        predecessor: { scope: 'whole', projectId: B, workItemId: B },
        successor: { scope: 'whole', projectId: C, workItemId: C },
      },
    ],
    starts: new Map([...placement.slices].map(([slice, placed]) => [slice, placed.earliestStart])),
    finishes: new Map(
      [...placement.slices].map(([slice, placed]) => [slice, placed.earliestFinish]),
    ),
  };
}

/** Build through the production connected request boundary, retaining its contradictory bytes. */
export function connectedImageScenario(kind: ConnectedImageScenarioKind) {
  const stage = captureStage(kind === 'connected-fractional');
  const prepared = buildConnectedSolverRequest(
    stage,
    {
      inputHash: `image-${kind}-input-v1`,
      questionHash: `image-${kind}-pri-v1`,
    },
    { solverVersion: '0.4.0', budgetMs: 30_000 },
    'pri',
  );
  if (prepared.kind === 'failed')
    throw new Error(`connected image preparation: ${prepared.failure}: ${prepared.detail}`);
  if (prepared.kind !== (kind === 'connected-fractional' ? 'boundary-infeasible' : 'request')) {
    throw new Error(`connected image preparation: unexpected ${prepared.kind}`);
  }
  return { kind, stage, request: prepared.request };
}

/** Require the actual child's exact connected evidence and replay the full fixed component. */
export function verifyConnectedImageResponse(
  scenario: ReturnType<typeof connectedImageScenario>,
  stdout: string,
): void {
  // Proof: bypassing this validator admits wrong scope/hash, malformed output and forged
  // foreign pins in the image scenario negatives; no direct contradiction substitutes for a child.
  const outcome = evaluateConnectedSolverOutcome(scenario.stage, scenario.request, {
    kind: 'response',
    stdout,
  });
  if (scenario.kind === 'connected-fractional') {
    if (
      outcome.kind !== 'boundary-infeasible' ||
      outcome.certificate.evidence.kind !== 'solver-proven-infeasible'
    ) {
      throw new Error(
        `connected image expected solver-proven boundary-infeasible: ${outcome.kind}`,
      );
    }
    return;
  }
  if (outcome.kind !== 'ok') throw new Error(`connected image expected feasible: ${outcome.kind}`);
  // Proof: the displaced B answer is refused; full replay also keeps fixed A/C exact.
  if (outcome.starts.size !== 1 || outcome.starts.get(sliceKey(B, null)) !== 1) {
    throw new Error('connected image changed the exact B placement');
  }
  for (const [id, start, finish] of [
    [A, 0, 1],
    [C, 2, 3],
  ] as const) {
    const placed = outcome.decision.schedule.slices.get(sliceKey(id, null));
    if (placed?.earliestStart !== start || placed.earliestFinish !== finish) {
      throw new Error('connected image changed fixed foreign placement');
    }
  }
}
