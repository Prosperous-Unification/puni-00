import {
  canonicalConnectedStageInput,
  type ConnectedOptimizationStage,
  contractVersionOf,
  durationOf,
  type ElsewhereBooking,
  groupSlicesByLeaf,
  indexTree,
  leafDeadlinesOf,
  leafFloorsOf,
  priorityByLeaf,
  priorityWeights,
  type Slice,
  sliceKey,
  SOLVER_QUANTUM,
} from '@wbs/domain';

import { buildSolverPools, buildSolverResources } from './build-solver-pools';
import { buildSolverSlices } from './build-solver-slices';
import { buildConnectedSolverBoundaries } from './connected-boundaries';
import { quantiseElsewhere } from './quantise-elsewhere';
import { preflightSolverRequest, type SolverPreflightFailure } from './solver-preflight';
import { ffStartWeightUnits } from './solver-units';
import { STAGE_BUDGET_SPLIT } from './stage-budget';
import {
  type ConnectedSolverRequest,
  SOLVER_WIRE_VERSION,
  type SolverEdge,
  type SolverObjective,
  type SolverOffsetMap,
} from './wire-types';

/** A request or a direct mathematical refusal for one fixed-boundary stage. */
export type ConnectedPreparedRequest =
  | { readonly kind: 'request'; readonly request: ConnectedSolverRequest }
  | {
      readonly kind: 'boundary-infeasible';
      readonly stage: ConnectedOptimizationStage;
      readonly request: ConnectedSolverRequest;
      readonly evidence: {
        readonly kind: 'contradictory-bounds';
        readonly key: string;
        readonly lower: number;
        readonly upper: number;
        readonly contributors: readonly string[];
      };
    }
  | { readonly kind: 'failed'; readonly failure: SolverPreflightFailure; readonly detail: string };

/** Both objective variants ask the same captured question and movement origin. */
export interface ConnectedSolverRequestPair {
  readonly pri: ConnectedPreparedRequest;
  readonly time: ConnectedPreparedRequest;
}

/** Build a local decision model from the authoritative reduced graph and fixed foreign placement. */
export function buildConnectedSolverRequestPair(
  stage: ConnectedOptimizationStage,
  identity: { readonly inputHash: string; readonly questionHash: string },
  installed: { readonly solverVersion: string; readonly budgetMs: number },
): ConnectedSolverRequestPair {
  canonicalConnectedStageInput(stage);
  if (!identity.inputHash || !identity.questionHash)
    throw new Error('connected question identity is absent');
  // Proof: bypassing this installed-version guard prepared a wire-5 request
  // against solver 0.3.0 (12 pass / 1 fail).
  if (installed.solverVersion !== '0.4.0') {
    const failed: ConnectedPreparedRequest = {
      kind: 'failed',
      failure: 'incompatible-solver',
      detail: `solver ${installed.solverVersion} does not accept wire 5; expected 0.4.0`,
    };
    return { pri: failed, time: failed };
  }
  if (stage.input.order.kind !== 'connected') throw new Error('connected stage has local order');
  const ownership = stage.input.order.projectIdByWorkItem;
  const ownRows = stage.input.rows.filter((row) => ownership.get(row.id) === stage.projectId);
  const ownSlices = stage.input.slices.filter(
    (slice) => ownership.get(slice.workItemId) === stage.projectId,
  );
  if (ownSlices.length === 0) throw new Error('empty connected stage spawns nothing');
  const allIndex = indexTree(stage.input.rows);
  const ownIndex = indexTree(ownRows);
  const slices = buildSolverSlices(ownSlices, {
    floors: leafFloorsOf(stage.input.notBefore, allIndex),
    deadlines: leafDeadlinesOf(stage.input.deadlines, allIndex),
    weights: priorityWeights(priorityByLeaf(ownRows, ownIndex)),
  });
  const grouped = groupSlicesByLeaf(allIndex.leafIds, stage.input.slices);
  const graphSlice = (leafId: string, at: number): Slice => {
    const slice = grouped.get(leafId)?.[at];
    if (slice === undefined) throw new Error(`no resolved slice ${leafId}/${String(at)}`);
    return slice;
  };
  const edges: SolverEdge[] = [];
  for (const edge of stage.input.graph.edges) {
    if (
      ownership.get(edge.predecessor.leafId) !== stage.projectId ||
      ownership.get(edge.successor.leafId) !== stage.projectId
    )
      continue;
    const predecessor = graphSlice(edge.predecessor.leafId, edge.predecessor.at);
    const successor = graphSlice(edge.successor.leafId, edge.successor.at);
    const predecessorKey = sliceKey(predecessor.workItemId, predecessor.stepId);
    const successorKey = sliceKey(successor.workItemId, successor.stepId);
    edges.push(
      edge.type === 'FF'
        ? {
            predecessorKey,
            successorKey,
            type: 'FF',
            startWeightUnits: ffStartWeightUnits(predecessor, successor),
          }
        : { predecessorKey, successorKey, type: edge.type },
    );
  }
  const boundaries = buildConnectedSolverBoundaries(stage, slices);
  const namedLocalPeople = new Set(
    ownSlices
      .filter((slice) => durationOf(slice) > 0 && slice.personId !== null)
      .map((slice) => slice.personId),
  );
  const fixed: { projectId: string; key: string; start: number; finish: number }[] = [];
  const occupancy: {
    personId: string;
    projectId: string;
    key: string;
    start: number;
    finish: number;
  }[] = [];
  const elsewhere = new Map<string, ElsewhereBooking[]>();
  for (const slice of stage.input.slices) {
    const projectId = ownership.get(slice.workItemId);
    if (projectId === undefined) throw new Error(`slice ${slice.workItemId} has no owner`);
    if (projectId === stage.projectId) continue;
    const key = sliceKey(slice.workItemId, slice.stepId);
    const start = stage.starts.get(key);
    const finish = stage.finishes.get(key);
    if (start === undefined || finish === undefined)
      throw new Error(`fixed slice ${key} has no placement`);
    fixed.push({ projectId, key, start, finish });
    if (stage.mode !== 'shared' || slice.personId === null || finish <= start) continue;
    // Proof: omitting the holder while leaving the booking in place made the
    // provenance assertion fail (11 pass / 1 fail).
    occupancy.push({ personId: slice.personId, projectId, key, start, finish });
    if (namedLocalPeople.has(slice.personId)) {
      const bookings = elsewhere.get(slice.personId) ?? [];
      bookings.push({ start, end: finish, projectId, workItemId: slice.workItemId });
      elsewhere.set(slice.personId, bookings);
    }
  }
  const bytes = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
  fixed.sort((left, right) => bytes(left.projectId, right.projectId) || bytes(left.key, right.key));
  occupancy.sort(
    (left, right) =>
      bytes(left.personId, right.personId) ||
      left.start - right.start ||
      bytes(left.key, right.key),
  );
  for (const bookings of elsewhere.values())
    bookings.sort((left, right) => left.start - right.start || left.end - right.end);
  const bookings = quantiseElsewhere(elsewhere);
  if (!bookings.ok) {
    const failed: ConnectedPreparedRequest = {
      kind: 'failed',
      failure: bookings.failure,
      detail: bookings.detail,
    };
    return { pri: failed, time: failed };
  }
  const reference: Record<string, number> = {};
  for (const slice of slices) {
    const real = stage.starts.get(slice.key);
    if (real === undefined || !Number.isFinite(real))
      throw new Error(`local slice ${slice.key} has no finite start`);
    const offset = Math.round(real * SOLVER_QUANTUM);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new Error(`local start ${slice.key} has no safe movement reference`);
    reference[slice.key] = offset;
  }
  const movementReferenceOffsets: SolverOffsetMap = reference;
  const preflight = preflightSolverRequest(
    slices,
    movementReferenceOffsets,
    edges,
    bookings.wire,
    boundaries
      .filter((boundary) => boundary.direction === 'incoming')
      .map((boundary) => boundary.minimumStartUnits),
    // Proof: omitting reference extent made the 1000-day connected origin
    // emit horizon 58 despite movement reference 48000 (10 pass / 1 fail).
    true,
  );
  if (!preflight.ok) {
    const failed: ConnectedPreparedRequest = {
      kind: 'failed',
      failure: preflight.failure,
      detail: preflight.detail,
    };
    return { pri: failed, time: failed };
  }
  const common: Omit<ConnectedSolverRequest, 'objective'> = {
    wireVersion: SOLVER_WIRE_VERSION,
    contractVersion: contractVersionOf(installed.solverVersion),
    solverVersion: installed.solverVersion,
    budgetMs: installed.budgetMs,
    stageBudgetSplit: STAGE_BUDGET_SPLIT,
    quantum: SOLVER_QUANTUM,
    horizonUnits: preflight.horizonUnits,
    slices,
    edges,
    pools: buildSolverPools(slices, stage.input.poolSizes),
    resources: buildSolverResources(slices, stage.input.resourceCapacities),
    elsewhere: bookings.wire,
    scope: {
      kind: 'connected-stage',
      projectId: stage.projectId,
      inputHash: identity.inputHash,
      questionHash: identity.questionHash,
      originOrdinal: stage.originOrdinal,
      projects: stage.projects,
      fixed,
      boundaries,
      occupancy,
    },
    movementReferenceOffsets,
    feasibleBaselineOffsets: null,
    seedOffsets: movementReferenceOffsets,
  };
  for (const slice of slices) {
    const incoming = boundaries.flatMap((boundary) =>
      boundary.localKey === slice.key && boundary.direction === 'incoming'
        ? [{ relationshipId: boundary.relationshipId, bound: boundary.minimumStartUnits }]
        : [],
    );
    const outgoing = boundaries.flatMap((boundary) =>
      boundary.localKey === slice.key && boundary.direction === 'outgoing'
        ? [{ relationshipId: boundary.relationshipId, bound: boundary.maximumStartUnits }]
        : [],
    );
    const lower = Math.max(0, slice.notBeforeUnits, ...incoming.map((boundary) => boundary.bound));
    const upper = Math.min(preflight.horizonUnits, ...outgoing.map((boundary) => boundary.bound));
    if (lower > upper) {
      const evidence: Extract<
        ConnectedPreparedRequest,
        { kind: 'boundary-infeasible' }
      >['evidence'] = {
        kind: 'contradictory-bounds',
        key: slice.key,
        lower,
        upper,
        contributors: [
          `floor:${String(slice.notBeforeUnits)}`,
          `horizon:${String(preflight.horizonUnits)}`,
          ...incoming.map(
            (boundary) => `${boundary.relationshipId}:incoming:${String(boundary.bound)}`,
          ),
          ...outgoing.map(
            (boundary) => `${boundary.relationshipId}:outgoing:${String(boundary.bound)}`,
          ),
        ],
      };
      return {
        pri: {
          kind: 'boundary-infeasible',
          stage,
          request: { ...common, objective: 'pri' },
          evidence,
        },
        time: {
          kind: 'boundary-infeasible',
          stage,
          request: { ...common, objective: 'time' },
          evidence,
        },
      };
    }
  }
  const requestOf = (objective: SolverObjective): ConnectedPreparedRequest => ({
    kind: 'request',
    request: { ...common, objective },
  });
  return { pri: requestOf('pri'), time: requestOf('time') };
}
