import {
  GanttDataError,
  type GanttPlan,
  type GanttSlice,
  type TypedChartEndpoint,
  type TypedGanttArrow,
} from './gantt-geometry';

/**
 * Resolve authored endpoints with whole/node/descendant-step rules and project step order.
 * @throws GanttDataError when a typed endpoint names an unknown work item, missing slice or step,
 * or a scope that cannot describe that tree node.
 */
export function resolveTypedGanttArrows(plan: GanttPlan): {
  arrows: TypedGanttArrow[];
  internalDependencies: { rowId: string; count: number }[];
} {
  const children = new Map<string, string[]>();
  const parents = new Map(plan.tree.map((row) => [row.id, row.parentId]));
  for (const row of plan.tree) {
    if (row.parentId === null) continue;
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row.id);
    children.set(row.parentId, siblings);
  }
  const stepOrder = new Map(plan.steps.map((step, index) => [step.id, index]));
  const slices = new Map<string, GanttSlice[]>();
  for (const slice of plan.slices) {
    const own = slices.get(slice.workItemId) ?? [];
    own.push(slice);
    slices.set(slice.workItemId, own);
  }
  // Proof: without this ordering, `uses project step order for whole endpoints
  // despite shuffled slices` selected A-dev → B-qa instead of A-qa → B-dev.
  // Watched 2026-09-28.
  for (const own of slices.values())
    own.sort(
      (left, right) =>
        (stepOrder.get(left.stepId ?? '') ?? Number.POSITIVE_INFINITY) -
        (stepOrder.get(right.stepId ?? '') ?? Number.POSITIVE_INFINITY),
    );
  const rows = new Map(plan.rows.map((row, rowIndex) => [row.id, rowIndex]));
  const leavesUnder = (workItemId: string): string[] => {
    // Proof: disabling this guard made the unknown-work-item chart test get
    // `missing chart slices for missing` instead. Watched 2026-09-28.
    if (!parents.has(workItemId)) throw new GanttDataError(`unknown chart work item ${workItemId}`);
    const descendants = children.get(workItemId);
    return descendants === undefined ? [workItemId] : descendants.flatMap(leavesUnder);
  };
  const endsOf = (endpoint: TypedChartEndpoint, side: 'predecessor' | 'successor') =>
    leavesUnder(endpoint.workItemId).map((leafId) => {
      const own = slices.get(leafId);
      // Proof: disabling this guard made the missing-slices chart test get a
      // TypeError reading `length` from undefined. Watched 2026-09-28.
      if (own === undefined || own.length === 0)
        throw new GanttDataError(`missing chart slices for ${leafId}`);
      // Proof: disabling this guard made the node-on-parent chart test resolve
      // without throwing. Watched 2026-09-28.
      if (endpoint.scope === 'node' && leafId !== endpoint.workItemId)
        throw new GanttDataError(`node endpoint is not a leaf: ${endpoint.workItemId}`);
      // Proof: disabling this guard made the descendant-step-on-leaf chart
      // test resolve without throwing. Watched 2026-09-28.
      if (endpoint.scope === 'descendant-step' && leafId === endpoint.workItemId)
        throw new GanttDataError(`descendant-step endpoint is a leaf: ${leafId}`);
      const slice =
        endpoint.scope === 'whole'
          ? own[side === 'predecessor' ? own.length - 1 : 0]
          : own.find((candidate) => candidate.stepId === endpoint.stepId);
      // Proof: disabling this guard made the missing-step chart test get a
      // TypeError reading `workItemId` from undefined. Watched 2026-09-28.
      if (slice === undefined)
        // Proof: replacing GanttDataError with Error made `discloses malformed
        // typed endpoint data and recovers on the next chart read` display
        // "Something went wrong" instead of the missing step. Watched 2026-09-28.
        throw new GanttDataError(`missing chart step ${String(endpoint.stepId)} in ${leafId}`);
      return slice;
    });
  const visibleOf = (leafId: string): { id: string; index: number } | null => {
    let cursor: string | null = leafId;
    while (cursor !== null) {
      const index = rows.get(cursor);
      if (index !== undefined) return { id: cursor, index };
      cursor = parents.get(cursor) ?? null;
    }
    return null;
  };
  const grouped = new Map<string, TypedGanttArrow>();
  const internal = new Map<string, Set<string>>();
  for (const dependency of plan.typedDependencies ?? []) {
    const scope = `${dependency.predecessor.scope}->${dependency.successor.scope}`;
    for (const before of endsOf(dependency.predecessor, 'predecessor')) {
      for (const after of endsOf(dependency.successor, 'successor')) {
        const from = visibleOf(before.workItemId);
        const to = visibleOf(after.workItemId);
        if (from === null || to === null) continue;
        if (from.id === to.id && (from.id !== before.workItemId || to.id !== after.workItemId)) {
          const ids = internal.get(from.id) ?? new Set<string>();
          ids.add(dependency.id);
          internal.set(from.id, ids);
          continue;
        }
        const proxy = from.id !== before.workItemId || to.id !== after.workItemId;
        const key = proxy
          ? `${from.id}|${to.id}|${dependency.type}|${scope}`
          : `${dependency.id}|${before.id}|${after.id}`;
        const existing = grouped.get(key);
        if (existing !== undefined) {
          existing.count += 1;
          if (!existing.relationshipIds.includes(dependency.id))
            existing.relationshipIds.push(dependency.id);
          // Proof: without per-relationship membership, `keeps each grouped
          // relationship’s resolved slices` received undefined instead of the
          // dev and QA pairs. Watched 2026-09-28.
          existing.relationshipSlices.push({
            relationshipId: dependency.id,
            predecessorSliceId: before.id,
            successorSliceId: after.id,
          });
          continue;
        }
        grouped.set(key, {
          relationshipId: dependency.id,
          relationshipIds: [dependency.id],
          relationshipSlices: [
            {
              relationshipId: dependency.id,
              predecessorSliceId: before.id,
              successorSliceId: after.id,
            },
          ],
          predecessorId: from.id,
          successorId: to.id,
          predecessorSliceId: before.id,
          successorSliceId: after.id,
          fromRowIndex: from.index,
          fromStart: before.earliestStart,
          // Proof: replacing scheduled finish with `before.earliestStart + 2`
          // (the placeholder width) made `anchors typed node arrows at scheduled
          // finish and start, including unknown placeholders` fail: fromX 2
          // instead of 0. Watched 2026-09-28.
          fromFinish: before.earliestFinish,
          toRowIndex: to.index,
          toStart: after.earliestStart,
          count: 1,
          proxy,
          scope,
        });
      }
    }
  }
  return {
    arrows: [...grouped.values()],
    internalDependencies: [...internal].map(([rowId, ids]) => ({ rowId, count: ids.size })),
  };
}
