import type { ConnectedOptimizationStage } from './connected-optimization-input';
import { validateResolvedGraph } from './resolved-schedule-input';
import { checkElsewhere, indexTree, sliceKey } from './schedule';
import { groupSlicesByLeaf } from './slice-groups';
import {
  isDependencyEndpointScope,
  isRelationshipType,
  type ScopedDependencyEndpoint,
} from './typed-dependency';

const byBytes = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const sortedPairs = <V>(pairs: ReadonlyMap<string, V>) =>
  [...pairs].sort(([a], [b]) => byBytes(a, b));
const sortedRecords = <V>(records: readonly V[]) =>
  [...records].sort((a, b) => byBytes(JSON.stringify(a), JSON.stringify(b)));

function requireFact(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`connected stage: ${message}`);
}

function requireFinite(value: number, field: string): void {
  // Proof: removing this guard failed all twelve `refuses nonfinite ...` cases.
  // Rank/start NaN also meet downstream refusals; the combined finite/rank/
  // interval fault admitted them. Origin/anchor/effort/capacity faults admitted directly.
  requireFact(Number.isFinite(value), `finite ${field}`);
}

const isText = (value: unknown): value is string => typeof value === 'string';

function canonicalEndpoint(endpoint: ScopedDependencyEndpoint) {
  // Proof: removal admitted `refuses null or numeric original selector identities`.
  requireFact(isText(endpoint.workItemId), 'selector identity');
  return endpoint.scope === 'whole'
    ? [endpoint.projectId, endpoint.scope, endpoint.workItemId]
    : [endpoint.projectId, endpoint.scope, endpoint.workItemId, endpoint.stepId];
}

/**
 * Stable constraint bytes for the captured reduced component, without rounding
 * real placements or mutating source maps. Sets sort bytewise; each leaf keeps
 * its actual step order. Descriptive labels and frozen numbers carry no meaning.
 *
 * Throws on absent, contradictory or nonfinite stage evidence. The existing
 * graph boundary checks nodes/endpoints; it cannot detect an authored edge the
 * caller omitted. Original selectors may address rows removed by reduction.
 * Core validates baseline feasibility; this function performs no scheduling.
 * SHA-256 and the objective/runtime/budget/quantum tuple belong to adapters.
 */
export function canonicalConnectedStageInput(stage: ConnectedOptimizationStage): string {
  // Proof: independently removing each vocabulary guard admitted its fault in
  // `refuses stage discriminator and capacity mode outside their vocabularies`.
  requireFact(['connected-stage'].includes(stage.kind), 'stage kind');
  requireFact(['shared', 'isolated'].includes(stage.mode), 'capacity mode');
  requireFinite(stage.originOrdinal, 'origin');
  const { input } = stage;
  // Proof (diagnostic): removing this check made `refuses local input` throw
  // a property-access error instead of naming the absent connected order.
  requireFact(input.order.kind === 'connected', 'connected order');
  const { projectIdByWorkItem, rankByProject } = input.order;
  const projects = new Map<string, ConnectedOptimizationStage['projects'][number]>();
  for (const project of stage.projects) {
    // Proof: removal admitted `refuses duplicate project`.
    requireFact(!projects.has(project.projectId), 'duplicate project');
    requireFinite(project.rank, 'rank');
    if (project.anchorOrdinal !== null) requireFinite(project.anchorOrdinal, 'anchor');
    // Proof: removal admitted `refuses inconsistent rank`.
    requireFact(rankByProject.get(project.projectId) === project.rank, 'rank evidence');
    projects.set(project.projectId, project);
  }
  // Proof: removal admitted `refuses extra rank`.
  requireFact(rankByProject.size === projects.size, 'rank evidence');
  // Proof: removal admitted `refuses unknown stage owner`.
  requireFact(projects.has(stage.projectId), 'stage owner');
  const rows = new Map(input.rows.map((row) => [row.id, row]));
  // Proof: removal admitted `refuses duplicate row`.
  requireFact(rows.size === input.rows.length, 'duplicate row');
  for (const row of input.rows) {
    requireFinite(row.position, 'row position');
    if (row.priority !== null) requireFinite(row.priority, 'row priority');
    const owner = projectIdByWorkItem.get(row.id);
    // Proof: removal admitted unknown retained-parent ownership in
    // `refuses missing and unknown ownership on retained parents independently of active slices`.
    requireFact(owner !== undefined && projects.has(owner), 'ownership');
  }
  // Proof: removal admitted `refuses extra reduced ownership facts`.
  requireFact(projectIdByWorkItem.size === rows.size, 'ownership keys');
  const keys = new Set(input.slices.map((slice) => sliceKey(slice.workItemId, slice.stepId)));
  // Proof: removal changed `refuses duplicate slice` to a graph diagnostic;
  // removing it together with graph validation admitted the duplicate (redundant guards).
  requireFact(keys.size === input.slices.length, 'duplicate slice');
  // Proof: removing this call admitted `refuses missing graph node` and
  // `refuses foreign workflow endpoints through the shared graph validator`.
  validateResolvedGraph(input);
  // Proof: removal admitted `refuses malformed elsewhere evidence through the existing boundary`.
  checkElsewhere(input.elsewhere);
  for (const slice of input.slices) {
    // Proof: removal admitted the absent collection in
    // `refuses missing required person, selector identity and pool collection facts`.
    requireFact(Array.isArray(slice.poolIds), 'slice pools');
    if (slice.days !== null) requireFinite(slice.days, 'slice effort');
    const owner = projectIdByWorkItem.get(slice.workItemId);
    const project = owner === undefined ? undefined : projects.get(owner);
    // Proof: removal admitted `refuses missing anchor`.
    requireFact(project !== undefined && project.anchorOrdinal !== null, 'active project anchor');
  }
  // Proof: removal admitted missing starts and surplus finishes in
  // `refuses missing start` and `refuses extra finish`.
  requireFact(
    stage.starts.size === keys.size &&
      stage.finishes.size === keys.size &&
      [...keys].every((key) => stage.starts.has(key) && stage.finishes.has(key)),
    'placement keys',
  );
  for (const [key, start] of stage.starts) {
    const finish = stage.finishes.get(key);
    // Proof (redundant): removing this narrowing check leaves all negatives
    // green: the exact key-set check above already proves every finish exists.
    requireFact(finish !== undefined, 'placement keys');
    requireFinite(start, 'start');
    requireFinite(finish, 'finish');
    // Proof: removal admitted `refuses reversed interval`.
    requireFact(finish >= start, 'reversed placement');
  }
  for (const [field, values] of [
    ['floor', input.notBefore],
    ['deadline', input.deadlines],
    ['pool capacity', input.poolSizes],
    ['resource capacity', input.resourceCapacities],
  ] as const)
    for (const value of values.values()) requireFinite(value, field);

  const relationships = new Map(
    stage.relationships.map((relationship) => [relationship.id, relationship]),
  );
  // Proof: removal admitted `refuses duplicate relationship`.
  requireFact(relationships.size === stage.relationships.length, 'duplicate relationship');
  for (const relationship of stage.relationships) {
    // Proof: removal admitted `refuses unsupported unused authored relationship type`;
    // a linked relationship also meets the graph-evidence check (redundant).
    requireFact(isRelationshipType(relationship.type), 'relationship type');
    for (const endpoint of [relationship.predecessor, relationship.successor]) {
      // Proof: removal admitted `refuses unknown selector project`.
      requireFact(projects.has(endpoint.projectId), 'selector project');
      // Proof: independently removing scope/step guards admitted their faults in
      // `refuses unsupported selectors, relationship types and graph provenance`.
      requireFact(isDependencyEndpointScope(endpoint.scope), 'selector scope');
      requireFact(
        endpoint.scope === 'whole' ||
          (typeof endpoint.stepId === 'string' && endpoint.stepId.length > 0),
        'selector step',
      );
      // Ownership is known only for surviving reduced rows. Held/original
      // selectors remain the authoritative resolver's evidence.
      const owner = projectIdByWorkItem.get(endpoint.workItemId);
      // Proof: removal admitted `refuses selector ownership independently of graph relationship evidence`.
      requireFact(owner === undefined || owner === endpoint.projectId, 'relationship ownership');
    }
  }
  for (const edge of input.graph.edges) {
    // Proof: independently removing provenance/type guards admitted their faults in
    // `refuses unsupported selectors, relationship types and graph provenance`.
    requireFact(['workflow', 'legacy', 'authored'].includes(edge.provenance), 'graph provenance');
    requireFact(
      isRelationshipType(edge.type) &&
        (edge.provenance === 'authored' || ['FS'].includes(edge.type)),
      'graph type',
    );
    if (edge.provenance !== 'authored') continue;
    const relationship = relationships.get(edge.relationshipId);
    // Proof: removal admitted `refuses relationship type mismatch`; missing
    // relationship evidence still threw on later access (diagnostic-only).
    requireFact(relationship?.type === edge.type, 'relationship evidence');
    // Proof: removal admitted `refuses graph ownership independently of unreduced selector identities`.
    requireFact(
      projectIdByWorkItem.get(edge.predecessor.leafId) === relationship.predecessor.projectId &&
        projectIdByWorkItem.get(edge.successor.leafId) === relationship.successor.projectId,
      'relationship ownership',
    );
  }
  const grouped = groupSlicesByLeaf(indexTree(input.rows).leafIds, input.slices);
  const canonical = {
    kind: stage.kind,
    projectId: stage.projectId,
    mode: stage.mode,
    originOrdinal: stage.originOrdinal,
    projects: [...stage.projects]
      .sort((a, b) => a.rank - b.rank || byBytes(a.projectId, b.projectId))
      .map((project) => ({
        projectId: project.projectId,
        rank: project.rank,
        anchorOrdinal: project.anchorOrdinal,
      })),
    rows: [...input.rows]
      .sort((a, b) => byBytes(a.id, b.id))
      .map((row) => ({
        id: row.id,
        parentId: row.parentId,
        position: row.position,
        priority: row.priority,
      })),
    ownership: sortedPairs(projectIdByWorkItem),
    ranks: sortedPairs(rankByProject),
    slices: sortedPairs(grouped).map(([workItemId, slices]) => ({
      workItemId,
      steps: slices.map((slice) => ({
        stepId: slice.stepId,
        days: slice.days,
        width: slice.width,
        personId: slice.personId,
        poolIds: [...new Set(slice.poolIds)].sort(byBytes),
        demands: (slice.demands ?? []).map((demand) => ({
          resourceId: demand.resourceId,
          units: demand.units,
        })),
      })),
    })),
    nodes: sortedRecords(
      input.graph.nodes.map((node) =>
        node.kind === 'step'
          ? {
              kind: node.kind,
              workItemId: node.ref.workItemId,
              stepId: node.ref.stepId,
              at: node.at,
            }
          : { kind: node.kind, workItemId: node.workItemId, at: node.at },
      ),
    ),
    edges: sortedRecords(
      input.graph.edges.map((edge) => ({
        predecessor: { leafId: edge.predecessor.leafId, at: edge.predecessor.at },
        successor: { leafId: edge.successor.leafId, at: edge.successor.at },
        type: edge.type,
        provenance: edge.provenance,
        ...(edge.provenance === 'authored' ? { relationshipId: edge.relationshipId } : {}),
      })),
    ),
    relationships: [...stage.relationships]
      .sort((a, b) => byBytes(a.id, b.id))
      .map((relationship) => ({
        id: relationship.id,
        type: relationship.type,
        predecessor: canonicalEndpoint(relationship.predecessor),
        successor: canonicalEndpoint(relationship.successor),
      })),
    notBefore: sortedPairs(input.notBefore),
    deadlines: sortedPairs(input.deadlines),
    poolSizes: sortedPairs(input.poolSizes),
    resourceCapacities: sortedPairs(input.resourceCapacities),
    elsewhere: sortedPairs(input.elsewhere).map(([personId, bookings]) => ({
      personId,
      bookings: bookings.map((booking) => ({
        start: booking.start,
        end: booking.end,
        projectId: booking.projectId,
        workItemId: booking.workItemId,
      })),
    })),
    starts: sortedPairs(stage.starts),
    finishes: sortedPairs(stage.finishes),
  };
  return JSON.stringify(canonical, (_key, value: unknown) => {
    // Proof: removal admitted the absent person identity in
    // `refuses missing required person, selector identity and pool collection facts`.
    requireFact(value !== undefined, 'defined canonical fact');
    return value;
  });
}
