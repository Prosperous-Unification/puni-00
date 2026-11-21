import type { LeafStepOrder } from '../leaf-step-order';
import { readSavedConnectedScheduleEvidence } from './connected-schedule';
import { leafHistoryFixture } from './leaf-dependency-history.fixture';

/** Synthetic cross-body codec evidence; no actual Source, engine or predecessor produced it. */
export function leafScheduleFixture(orders?: readonly LeafStepOrder[]) {
  const history = leafHistoryFixture(),
    member = history.workPackages[0],
    leaves = orders ?? member.leafSteps;
  const span = {
    duration: 0,
    estimated: false,
    earliestStart: 0,
    earliestFinish: 0,
    latestStart: 0,
    latestFinish: 0,
    float: 0,
    critical: false,
  };
  const nodes = leaves.flatMap((leaf) => {
    const steps: readonly (string | null)[] = leaf.stepIds.length === 0 ? [null] : leaf.stepIds;
    return steps.map((stepId, at) => ({ workItemId: leaf.workItemId, stepId, at }));
  });
  const placement = {
    workItems: Object.fromEntries(member.workItems.map((row) => [row.id, span])),
    slices: Object.fromEntries(
      nodes.map((node) => [
        node.workItemId + '\u0000' + (node.stepId ?? ''),
        {
          ...span,
          workItemId: node.workItemId,
          stepId: node.stepId,
          personId: null,
          boundBy: 'workPackageStart',
          resourcePredecessorId: null,
          capacityPredecessorIds: [],
          capacityTeamId: null,
          width: 1,
          effort: 0,
          lateBy: null,
        },
      ]),
    ),
    waitingForPerson: 0,
    waitingForCapacity: 0,
  };
  const authored = history.graph.edges.filter((edge) => edge.provenance === 'authored');
  const workflow = leaves.flatMap((leaf) =>
    leaf.stepIds.slice(1).map((_step, index) => ({
      provenance: 'workflow',
      type: 'FS',
      predecessor: { leafId: leaf.workItemId, at: index },
      successor: { leafId: leaf.workItemId, at: index + 1 },
    })),
  );
  const stage = {
    kind: 'connected-stage',
    workPackageId: 'package',
    mode: 'isolated',
    originOrdinal: 20727,
    workPackages: [{ workPackageId: 'package', rank: 0, anchorOrdinal: 20727 }],
    rows: member.workItems.map((row, position) => ({
      id: row.id,
      parentId: row.parentId,
      position,
      priority: null,
    })),
    ownership: history.ownership,
    ranks: [['package', 0]],
    slices: leaves.map((leaf) => ({
      workItemId: leaf.workItemId,
      steps: (leaf.stepIds.length === 0 ? [null] : leaf.stepIds).map((stepId) => ({
        stepId,
        days: 0,
        width: 1,
        personId: null,
        poolIds: [],
        demands: [],
      })),
    })),
    nodes: nodes.map((node) =>
      node.stepId === null
        ? { kind: 'boundary', workItemId: node.workItemId, at: node.at }
        : { kind: 'step', ...node },
    ),
    edges: [...workflow, ...authored],
    relationships: history.relationships.map((relationship) => ({
      id: relationship.id,
      type: relationship.type,
      predecessor: [
        relationship.predecessor.workPackageId,
        relationship.predecessor.scope,
        relationship.predecessor.workItemId,
        'stepId' in relationship.predecessor ? relationship.predecessor.stepId : undefined,
      ],
      successor: [
        relationship.successor.workPackageId,
        relationship.successor.scope,
        relationship.successor.workItemId,
        'stepId' in relationship.successor ? relationship.successor.stepId : undefined,
      ],
    })),
    notBefore: [],
    deadlines: [],
    poolSizes: [],
    resourceCapacities: [],
    elsewhere: [],
    starts: Object.keys(placement.slices).map((key) => [key, 0]),
    finishes: Object.keys(placement.slices).map((key) => [key, 0]),
  };
  return {
    history,
    evidence: readSavedConnectedScheduleEvidence({
      kind: 'connected',
      targetWorkPackageId: 'package',
      mode: 'isolated',
      originOrdinal: 20727,
      baseline: placement,
      composite: placement,
      stages: [
        {
          workPackageId: 'package',
          engine: 'fast',
          objective: 'pri',
          format: 'connected-stage-v2',
          stageBytes: JSON.stringify(stage),
          observation: null,
          variants: null,
          selected: null,
        },
      ],
      idleWorkPackages: [],
    }),
  };
}
