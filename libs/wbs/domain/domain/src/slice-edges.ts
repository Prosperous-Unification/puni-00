/**
 * The slice graph's edges: the intra-item step chain, and where an external
 * dependency joins the two leaves it connects.
 *
 * They are here rather than inside `schedule()` for `leaf-constraints.ts`'s
 * reason — the solver request builder must derive **the same** graph, because
 * the wire carries edges already leaf-expanded with the reach applied and
 * Python never receives the tree. A second copy in `libs/wbs/domain/contracts` would be
 * the copy that gets the join backwards, and the join has already been got
 * backwards three separate ways, each caught only by a watched red:
 *
 * | wrong join | what failed |
 * |---|---|
 * | predecessor's **last** slice under `anchor-slice` | `waits for the first role, not the last` (2026-08-11) |
 * | predecessor's **first** slice, plain | four `schedule-shapes` cases, every `earliestStart` back at 0 (2026-08-11) |
 * | the reach applied to the **successor** too | `a parent predecessor expands to its leaves under either reach` (2026-08-30) |
 *
 * So the asymmetry is the content of this module: an edge **leaves** the
 * predecessor's *reached* slice and **arrives** at the successor's *first*
 * slice plain. The reach never touches the successor side — applying it there
 * lets the successor's own early steps escape the wait entirely, which is the
 * third row above.
 *
 * What is deliberately NOT here: the expansion of a written edge down to
 * leaves. That is `expandToLeaves` in `schedule.ts`, it is already exported,
 * and it answers a question about the **tree** rather than about slices. This
 * module takes the leaf edges it produces.
 */

import type { DependencyReach } from './dependency-reach';
import type { StepNodeRef } from './step-node';

/**
 * The half of a `Slice` the reach reads: whether anybody estimated it.
 *
 * Named structurally rather than imported, for `leaf-constraints.ts`'s reason —
 * `Slice` is `schedule.ts`'s type and `schedule.ts` imports this module, so
 * taking the whole interface would be a cycle, and a type-only cycle is still a
 * cycle to read.
 */
export interface EstimatedSlice {
  readonly days: number | null;
}

/**
 * The half of a `Slice` the graph names a node by: its reach reading, and the
 * step it is an occurrence of — `null` for the one stepless slice a leaf gets in
 * a project with no steps, which is that leaf's work-item boundary.
 */
export interface GraphSlice extends EstimatedSlice {
  readonly stepId: string | null;
}

/**
 * One node of the step-node graph, at the position its slice holds in its
 * leaf's group: a step node (ADR 0031) or, in a project with no steps, the
 * leaf's zero-time work-item boundary. Never both for one leaf.
 */
export type StepNodeGraphNode =
  | { readonly kind: 'step'; readonly ref: StepNodeRef; readonly at: number }
  | { readonly kind: 'boundary'; readonly workItemId: string; readonly at: number };

/** One end of a slice edge: a leaf, and how many steps into it the edge touches. */
export interface SliceEdgeEnd {
  readonly leafId: string;
  /** An index into that leaf's own slice group, in the step order it was given. */
  readonly at: number;
}

/**
 * One edge of the slice graph, both ends named by position rather than by key.
 *
 * By **position**, because a key is `sliceKey(workItemId, stepId)` and a plan
 * may hand two slices of one leaf the same `stepId`: `groupByWorkItem` accepts
 * that and the placement distinguishes them by index, so an edge list keyed by
 * `sliceKey` would silently merge them. The wire builder refuses that duplicate
 * before it projects anything, and converts these positions to keys afterwards;
 * `schedule()` converts them to its own node indices. Neither conversion is
 * this module's business, and doing it here would pick one of them.
 */
export interface StepNodeGraphEdge {
  readonly predecessor: SliceEdgeEnd;
  readonly successor: SliceEdgeEnd;
  readonly type: 'FS';
  readonly provenance: 'workflow' | 'legacy';
}

/**
 * Which of one leaf's slices a dependency on it waits for — the index, in step
 * order, of the slice whose finish releases the successor.
 *
 * The one place the project's {@link DependencyReach} is read. Everything
 * downstream — parent expansion to leaves, successor-side attachment to the
 * first slice plain, floors, cycle detection and the item-anchored arithmetic —
 * takes the answer and does not know which arm produced it.
 *
 * - `whole-item`: the **last** slice, so a dependency waits for the whole work
 *   item. Dany's call on 2026-08-29, having seen the August rule drawn.
 * - `anchor-slice`: the first slice somebody **estimated** — his words on
 *   2026-08-11, "first in list of project roles, then first that is estimated"
 *   — and the last slice when nobody estimated any of them. `days !== null`
 *   rather than `days > 0`, which is what `Scheduled.estimated` means
 *   everywhere else here: an explicit zero is somebody saying this step takes
 *   no time, and the walk honours the statement. Nobody having said anything is
 *   the different fact, and it is the one this walk steps over — a `Design`
 *   step a project lists and this plan left blank must not stand in front of
 *   the `Dev` the wait is really about, or every edge in such a plan decides
 *   nothing.
 *
 * Both arms fall through to the last slice, which is why an unestimated
 * predecessor is reached at its own finish under either reach.
 *
 * That finish used to be the leaf's own start, so such an edge imposed exactly
 * what the leaf's own predecessors imposed and nothing more.
 * `assumed-duration-schedules` (2026-08-29) ended that: an unestimated slice is
 * `ASSUMED_SLICE_WORKDAYS` long, so a leaf nobody has estimated finishes
 * its steps' assumed durations end to end — three unestimated steps run 0→6 —
 * and a dependency on it now imposes a real wait. "Has a duration" and "is
 * estimated" are different questions, and only the `anchor-slice` arm asks the
 * second: its `days !== null` walk still steps over a slice that has a duration
 * nobody stated.
 *
 * `slices` is never empty: `groupByWorkItem` only makes a group because a slice
 * went into it, and the leaf it made none for is what `slicesOf` refuses. So
 * `length - 1` is a real index rather than `-1`.
 *
 * See `docs/adr/0010-a-dependencys-reach-is-a-projects-choice.md`.
 */
export function reachedSliceOf(reach: DependencyReach, slices: readonly EstimatedSlice[]): number {
  if (reach === 'whole-item') return slices.length - 1;
  const estimated = slices.findIndex((slice) => slice.days !== null);
  return estimated === -1 ? slices.length - 1 : estimated;
}

/** A leaf edge as `expandToLeaves` produces it — both ends are leaves. */
export interface LeafEdge {
  readonly predecessorId: string;
  readonly successorId: string;
}

/**
 * Resolve every FS edge of the step-node graph: each leaf's own step chain first, in
 * `leafIds` order, then the external edges in the order they were given.
 * Chain edges have `workflow` provenance; project-reach joins have `legacy`
 * provenance. `nodes` lists every position in the same `leafIds` order: a step
 * node when its slice has a `stepId`, the work-item boundary when that slice
 * is stepless. Edges name their ends by the same leaf and position. ADR 0031.
 *
 * **That order is preserved deliberately, and nothing but this module's own
 * test holds it.** `schedule()` pushes each edge onto its two nodes' adjacency
 * arrays in arrival order, and the placement walks those arrays again, so the
 * order was worth keeping identical to the one the node loop produced when it
 * built the chain inline — that is what makes this a move rather than a
 * rewrite. But the claim that it *matters* is measured rather than argued, and
 * it did not survive: with the two loops swapped, the whole 356-test domain
 * suite that predates this file stays green and **only** `emits every chain
 * before any external edge` fails (364 pass / 1 fail, h2puni, 2026-09-04). So
 * the placement is order-insensitive on every plan that corpus holds, this
 * order is the one under which every existing number was measured, and a red
 * that names only its own test names the test rather than the guard.
 *
 * `slicesOf` is a lookup rather than a map because its two callers hold
 * different things: `schedule()` holds `groupByWorkItem`'s
 * `Map<string, WorkItemSlices>` and owes the "no slice for work item" refusal,
 * and the request builder holds its own grouping. The refusal stays with
 * whoever owns the grouping; this function only asks.
 *
 * It is deliberately NOT generic over the caller's slice type. Nothing here
 * returns a slice — an edge names a leaf and a position — so a type parameter
 * would appear once in the signature and infer nothing, which is what
 * `no-unnecessary-type-parameters` said when the first draft carried one.
 */
export function resolveStepNodeGraph(
  leafIds: readonly string[],
  slicesOf: (leafId: string) => readonly GraphSlice[],
  leafEdges: readonly LeafEdge[],
  reach: DependencyReach,
): { nodes: StepNodeGraphNode[]; edges: StepNodeGraphEdge[] } {
  const nodes: StepNodeGraphNode[] = [];
  const edges: StepNodeGraphEdge[] = [];

  // Every node, estimated or not and joined or not: a node exists because its
  // leaf and step do (ADR 0031), so an isolated one is still in the graph.
  // Proof: skipping unestimated slices here made `lists every node, isolated
  // and unestimated ones included, and a stepless boundary` fail on
  // `- Expected - 21 / + Received + 0`; watched 2026-09-27.
  for (const leafId of leafIds) {
    slicesOf(leafId).forEach((slice, at) => {
      nodes.push(
        slice.stepId === null
          ? { kind: 'boundary', workItemId: leafId, at }
          : { kind: 'step', ref: { workItemId: leafId, stepId: slice.stepId }, at },
      );
    });
  }

  // The chain: step `n` finishes before step `n + 1` starts, within one leaf,
  // in the order the group was given. It is what carries an external wait
  // through to the steps behind a successor's first, which is why the join
  // below may land on that first slice plain.
  for (const leafId of leafIds) {
    const own = slicesOf(leafId);
    // Proof: skipping the chain edge at `at === 1` made the Fast golden
    // `reproduces every stored schedule value for value` fail with
    // `Expected: 5, Received: 3` for `earliestFinish`; watched 2026-09-27.
    for (let at = 1; at < own.length; at += 1) {
      edges.push({
        predecessor: { leafId, at: at - 1 },
        successor: { leafId, at },
        type: 'FS',
        provenance: 'workflow',
      });
    }
  }

  // The join: the predecessor's **reached** slice to the successor's **first**.
  // The reached slice finishes before any of the successor starts, and the
  // successor's own step chain above carries the wait to the steps behind its
  // first.
  //
  // The asymmetry is deliberate and the reach does not touch it: the edge lands
  // on the successor's first slice **plain**, never its first estimated one and
  // never its last, because either would leave an unestimated first step with
  // no predecessor and start the row before the thing it waits for.
  //
  // Proof: the join reverted to the predecessor's **last** node while the reach
  // was `anchor-slice` — the whole-item rule `dep-waits-on-first-role`
  // replaced — and `waits for the first role, not the last` failed on
  // `Expected: 3, Received: 5`, `a branch releases at its anchors` on
  // `Expected: 4, Received: 5` (`schedule-shapes.test.ts`); watched 2026-08-11.
  //
  // Proof: `reachedNodeOf` replaced by `firstNodeOf` — the first slice plain,
  // the rule before August — and four failed: `a chain does not collapse
  // because a project lists a role nobody estimated` on `c2` `earliestStart`
  // `Expected: 4, Received: 0`, `walks past an unestimated role to the first
  // one somebody estimated` on `Expected: 4, Received: 0`, `a branch anchors
  // each leaf on its own first estimate` on `Expected: 5, Received: 0`, and
  // `carries an unestimated predecessor's own wait through to its successor`
  // on `B` `earliestStart` `Expected: 3, Received: 0`; watched 2026-08-11.
  //
  // Proof: `reachedNodeOf` used on the **successor** side too — the reach
  // applied to both ends — and `a parent predecessor expands to its leaves
  // under either reach` failed on `Q`'s projection, `earliestStart` /
  // `earliestFinish` `{5, 11}` against a received `{0, 7}`: the successor's own
  // first step escaped the wait entirely and only its last was held. Watched
  // 2026-08-30.
  for (const { predecessorId, successorId } of leafEdges) {
    const before = reachedSliceOf(reach, slicesOf(predecessorId));
    // Asked for its refusal, not for its value: a successor leaf with no group
    // must throw here rather than have an edge drawn onto a position that does
    // not exist.
    slicesOf(successorId);
    edges.push({
      predecessor: { leafId: predecessorId, at: before },
      successor: { leafId: successorId, at: 0 },
      type: 'FS',
      provenance: 'legacy',
    });
  }

  return { nodes, edges };
}
