import {
  type ConnectedOptimizationStage,
  durationOf,
  groupSlicesByLeaf,
  indexTree,
  sliceKey,
  SOLVER_QUANTUM,
} from '@wbs/domain';

import type { SolverBoundary } from './wire-types';

/**
 * Project every authoritative cross-project pair into a conservative integer
 * start bound.
 *
 * Proof: changing the active incoming/outgoing SS ceil/floor, outgoing FS
 * floor, and incoming/outgoing FF ceil/floor each failed the fractional case
 * (1–2 failures among 10 tests). The FS incoming ceiling mutation missed the
 * 10 > 9 window (2 failures). With D=ceil(Qd), the first incoming FF max term
 * and the second outgoing FS/FF min terms are algebraically masked; they are
 * retained to state the frozen equations, not claimed as independently
 * breakable checks.
 */
export function buildConnectedSolverBoundaries(
  stage: ConnectedOptimizationStage,
  localSlices: readonly { readonly key: string; readonly durationUnits: number }[],
): readonly SolverBoundary[] {
  if (stage.input.order.kind !== 'connected') throw new Error('connected stage has local order');
  const ownership = stage.input.order.projectIdByWorkItem;
  const groups = groupSlicesByLeaf(indexTree(stage.input.rows).leafIds, stage.input.slices);
  const localByKey = new Map(localSlices.map((slice) => [slice.key, slice]));
  const keyAndSlice = (leafId: string, at: number) => {
    const slice = groups.get(leafId)?.[at];
    if (slice === undefined) throw new Error(`no resolved slice ${leafId}/${String(at)}`);
    return { key: sliceKey(slice.workItemId, slice.stepId), slice };
  };
  const checked = (bound: number): number => {
    if (!Number.isSafeInteger(bound))
      throw new Error('connected boundary exceeds safe integer range');
    return bound;
  };
  const boundaries: SolverBoundary[] = [];
  // Proof: limiting this production traversal to its first graph edge made
  // the four-pair expansion test observe only one bound (4 pass / 4 fail).
  for (const edge of stage.input.graph.edges) {
    const predecessorOwner = ownership.get(edge.predecessor.leafId);
    const successorOwner = ownership.get(edge.successor.leafId);
    if (predecessorOwner === undefined || successorOwner === undefined)
      throw new Error('resolved boundary has no owner');
    if (predecessorOwner === successorOwner) continue;
    if (edge.provenance !== 'authored')
      throw new Error('cross-project boundary has no authored relationship');
    if (predecessorOwner !== stage.projectId && successorOwner !== stage.projectId) continue;
    const incoming = successorOwner === stage.projectId;
    const local = keyAndSlice(
      incoming ? edge.successor.leafId : edge.predecessor.leafId,
      incoming ? edge.successor.at : edge.predecessor.at,
    );
    const foreign = keyAndSlice(
      incoming ? edge.predecessor.leafId : edge.successor.leafId,
      incoming ? edge.predecessor.at : edge.successor.at,
    );
    const localWire = localByKey.get(local.key);
    if (localWire === undefined) throw new Error(`boundary local slice ${local.key} is absent`);
    const foreignStart = stage.starts.get(foreign.key);
    const foreignFinish = stage.finishes.get(foreign.key);
    if (
      foreignStart === undefined ||
      foreignFinish === undefined ||
      !Number.isFinite(foreignStart) ||
      !Number.isFinite(foreignFinish)
    )
      throw new Error(`fixed foreign slice ${foreign.key} has no finite placement`);
    const duration = durationOf(local.slice);
    const common = {
      localKey: local.key,
      foreignProjectId: incoming ? predecessorOwner : successorOwner,
      foreignKey: foreign.key,
      relationshipId: edge.relationshipId,
      type: edge.type,
    };
    if (incoming) {
      // Proof: replacing this FS ceiling with floor turned the 0.2/1/1.2
      // stage from boundary-infeasible into a request (5 pass / 2 fail).
      const lower =
        edge.type === 'FS'
          ? Math.ceil(SOLVER_QUANTUM * foreignFinish)
          : edge.type === 'SS'
            ? Math.ceil(SOLVER_QUANTUM * foreignStart)
            : Math.max(
                Math.ceil(SOLVER_QUANTUM * foreignFinish) - localWire.durationUnits,
                Math.ceil(SOLVER_QUANTUM * (foreignFinish - duration)),
              );
      boundaries.push({ ...common, direction: 'incoming', minimumStartUnits: checked(lower) });
    } else {
      const upper =
        edge.type === 'SS'
          ? Math.floor(SOLVER_QUANTUM * foreignStart)
          : edge.type === 'FS'
            ? Math.min(
                Math.floor(SOLVER_QUANTUM * foreignStart) - localWire.durationUnits,
                Math.floor(SOLVER_QUANTUM * (foreignStart - duration)),
              )
            : Math.min(
                Math.floor(SOLVER_QUANTUM * foreignFinish) - localWire.durationUnits,
                Math.floor(SOLVER_QUANTUM * (foreignFinish - duration)),
              );
      boundaries.push({ ...common, direction: 'outgoing', maximumStartUnits: checked(upper) });
    }
  }
  return boundaries;
}
