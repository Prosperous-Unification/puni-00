import { describe, expect, it } from 'bun:test';

import type { WorkItem } from '../repository';
import {
  type DependencyEdge,
  expandToLeaves,
  indexTree,
  schedule,
  type Scheduled,
  type Slice,
} from './schedule';

/**
 * The engine as it stood at `role-crud` (2026-08-08), kept as the oracle the
 * slice engine is measured against.
 *
 * Copied rather than imported because it no longer exists: the point of this
 * file is that the numbers the previous engine produced are the numbers the new
 * one produces, for every plan that has no resource constraint — which, until
 * leveling arrives, is every plan there is. A reasoned argument that they agree
 * is not the same thing as a thousand plans through both.
 *
 * Only the pass itself is copied. `indexTree` and `expandToLeaves` are imported,
 * because they are unchanged and a second copy of them would let this file pass
 * against a tree the real one no longer builds.
 */
function previousSchedule(
  rows: readonly WorkItem[],
  edges: readonly DependencyEdge[],
  durations: ReadonlyMap<string, number>,
  notBefore: ReadonlyMap<string, number> = new Map(),
): Map<string, Scheduled> {
  const index = indexTree(rows);
  const { leafIds } = index;
  const isLeaf = new Set(leafIds);
  const leafEdges = expandToLeaves(index, edges);

  const incoming = new Map(leafIds.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const { predecessorId, successorId } of leafEdges) {
    outgoing.set(predecessorId, [...(outgoing.get(predecessorId) ?? []), successorId]);
    incoming.set(successorId, (incoming.get(successorId) ?? 0) + 1);
  }
  const ready = leafIds.filter((id) => incoming.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const left = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  if (order.length !== leafIds.length) throw new Error('cycle');

  const predecessorsOf = new Map<string, string[]>();
  const successorsOf = new Map<string, string[]>();
  for (const { predecessorId, successorId } of leafEdges) {
    predecessorsOf.set(successorId, [...(predecessorsOf.get(successorId) ?? []), predecessorId]);
    successorsOf.set(predecessorId, [...(successorsOf.get(predecessorId) ?? []), successorId]);
  }

  const durationOf = (id: string): number => durations.get(id) ?? 0;
  const earliestStart = new Map<string, number>();
  const earliestFinish = new Map<string, number>();
  for (const id of order) {
    const start = Math.max(
      0,
      notBefore.get(id) ?? 0,
      ...(predecessorsOf.get(id) ?? []).map((p) => earliestFinish.get(p) ?? 0),
    );
    earliestStart.set(id, start);
    earliestFinish.set(id, start + durationOf(id));
  }

  const projectFinish = Math.max(0, ...leafIds.map((id) => earliestFinish.get(id) ?? 0));
  const latestFinish = new Map<string, number>();
  const latestStart = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const successors = successorsOf.get(id) ?? [];
    const finish =
      successors.length === 0
        ? projectFinish
        : Math.min(...successors.map((s) => latestStart.get(s) ?? projectFinish));
    latestFinish.set(id, finish);
    latestStart.set(id, finish - durationOf(id));
  }

  const scheduled = new Map<string, Scheduled>();
  for (const id of leafIds) {
    const start = earliestStart.get(id) ?? 0;
    const late = latestStart.get(id) ?? 0;
    scheduled.set(id, {
      duration: durationOf(id),
      estimated: durations.has(id),
      earliestStart: start,
      earliestFinish: earliestFinish.get(id) ?? 0,
      latestStart: late,
      latestFinish: latestFinish.get(id) ?? 0,
      float: late - start,
      critical: late - start === 0,
    });
  }

  for (const row of rows) {
    if (isLeaf.has(row.id)) continue;
    const beneath = (index.leavesUnder.get(row.id) ?? [])
      .map((id) => scheduled.get(id))
      .filter((s): s is Scheduled => s !== undefined);
    const starts = beneath.map((s) => s.earliestStart);
    const finishes = beneath.map((s) => s.earliestFinish);
    const spanStart = Math.min(...starts, Infinity) === Infinity ? 0 : Math.min(...starts);
    const spanFinish = Math.max(0, ...finishes);
    scheduled.set(row.id, {
      duration: 0,
      estimated: beneath.some((s) => s.estimated),
      earliestStart: spanStart,
      earliestFinish: spanFinish,
      latestStart: Math.min(...beneath.map((s) => s.latestStart), spanStart),
      latestFinish: Math.max(0, ...beneath.map((s) => s.latestFinish)),
      float:
        Math.min(...beneath.map((s) => s.float), Infinity) === Infinity
          ? 0
          : Math.min(...beneath.map((s) => s.float)),
      critical: beneath.some((s) => s.critical),
    });
  }
  return scheduled;
}

/** A seeded generator, so a plan that disagrees can be reproduced from its seed alone. */
function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const PERT = (optimistic: number, realistic: number, pessimistic: number): number =>
  (optimistic + 4 * realistic + pessimistic) / 6;

interface GeneratedPlan {
  rows: WorkItem[];
  edges: DependencyEdge[];
  slices: Slice[];
  /** The same estimates the slices carry, summed per leaf, as the previous engine took them. */
  durations: Map<string, number>;
  notBefore: Map<string, number>;
}

/**
 * One random plan: a tree up to three deep, dependencies between the rows that
 * can take them, one to three roles, PERT figures, and a few manual floors.
 *
 * The estimates are PERT thirds on purpose. Whole days would agree through any
 * arithmetic; the sixths are what make the difference between adding a work
 * item's roles up first and accumulating them one slice at a time visible in
 * the last bits.
 */
function generatePlan(seed: number): GeneratedPlan {
  const random = randomFrom(seed);
  const pick = <T>(from: readonly T[]): T => from[Math.floor(random() * from.length)];
  const roleCount = 1 + Math.floor(random() * 3);
  const roleIds = Array.from({ length: roleCount }, (_, i) => `role-${String(i)}`);

  const rows: WorkItem[] = [];
  const newRow = (id: string, parentId: string | null): WorkItem => ({
    id,
    projectId: 'p1',
    parentId,
    position: rows.length * 10,
    name: id,
    notes: '',
    frozenNumber: null,
    startNoEarlierThan: null,
    serviceTeamId: null,
    revision: 0,
  });
  const roots = 2 + Math.floor(random() * 4);
  for (let r = 0; r < roots; r += 1) {
    const rootId = `r${String(r)}`;
    rows.push(newRow(rootId, null));
    const children = Math.floor(random() * 3);
    for (let c = 0; c < children; c += 1) {
      const childId = `${rootId}c${String(c)}`;
      rows.push(newRow(childId, rootId));
      const grandchildren = Math.floor(random() * 2);
      for (let g = 0; g < grandchildren; g += 1) {
        rows.push(newRow(`${childId}g${String(g)}`, childId));
      }
    }
  }

  // Edges strictly forwards through the row order, which cannot close a loop —
  // a cycle is a refusal in both engines and proves nothing about their numbers.
  const edges: DependencyEdge[] = [];
  const wanted = Math.floor(random() * 6);
  for (let e = 0; e < wanted; e += 1) {
    const fromAt = Math.floor(random() * rows.length);
    const toAt = fromAt + 1 + Math.floor(random() * Math.max(1, rows.length - fromAt - 1));
    const from = rows[fromAt];
    // `.at`, not `[]`: `toAt` can run past the end, and the index signature
    // would type the miss as a row rather than as the `undefined` it is.
    const to = rows.at(toAt);
    if (to === undefined || from.id === to.id) continue;
    // Not onto its own descendant: the write path refuses those, and the
    // expansion would put a leaf in front of itself.
    if (to.parentId === from.id || rows.find((row) => row.id === to.parentId)?.parentId === from.id)
      continue;
    edges.push({ predecessorId: from.id, successorId: to.id });
  }

  const hasChildren = new Set(rows.map((row) => row.parentId).filter((id) => id !== null));
  const slices: Slice[] = [];
  const durations = new Map<string, number>();
  for (const row of rows) {
    if (hasChildren.has(row.id)) continue;
    for (const roleId of roleIds) {
      const estimated = random() > 0.25;
      const days = estimated
        ? PERT(pick([0, 1, 2, 3]), pick([1, 2, 3, 5, 8]), pick([2, 4, 7, 9, 13]))
        : null;
      // Nobody is assigned, in every one of the thousand: this is the corpus
      // that says leveling changes nothing until somebody is, and it goes
      // through the levelled engine rather than around it.
      slices.push({ workItemId: row.id, roleId, days, personId: null });
      if (days !== null) durations.set(row.id, (durations.get(row.id) ?? 0) + days);
    }
  }

  const notBefore = new Map<string, number>();
  for (const row of rows) {
    if (hasChildren.has(row.id)) continue;
    if (random() > 0.85) notBefore.set(row.id, Math.floor(random() * 8));
  }

  return { rows, edges, slices, durations, notBefore };
}

describe('the slice engine against the one it replaced', () => {
  it('answers what the previous engine answered, to the last bit, over a thousand plans', () => {
    // The change's central claim. Every field, `toBe`-equal — not `toBeCloseTo`,
    // because slack is a column and `critical` is a red row, and both are read
    // off exact comparisons with zero.
    for (let seed = 1; seed <= 1000; seed += 1) {
      const plan = generatePlan(seed);
      const expected = previousSchedule(plan.rows, plan.edges, plan.durations, plan.notBefore);
      const found = schedule(plan.rows, plan.edges, plan.slices, plan.notBefore).workItems;

      expect(found.size).toBe(expected.size);
      for (const [id, was] of expected) {
        const now = found.get(id);
        if (now === undefined) throw new Error(`seed ${String(seed)}: ${id} lost its schedule`);
        for (const field of Object.keys(was) as (keyof Scheduled)[]) {
          if (now[field] === was[field]) continue;
          throw new Error(
            `seed ${String(seed)}, ${id}.${field}: ${String(was[field])} became ${String(now[field])}`,
          );
        }
      }
    }
  });

  it('generates plans worth measuring, so a green run is not an empty one', () => {
    // The generator is as capable of being wrong as the engine. This asserts the
    // corpus actually contains the shapes the claim is about: multi-role leaves,
    // dependencies, parents, unestimated slices and manual floors.
    let multiRole = 0;
    let withEdges = 0;
    let withParents = 0;
    let unestimated = 0;
    let floored = 0;
    for (let seed = 1; seed <= 1000; seed += 1) {
      const plan = generatePlan(seed);
      const perWorkItem = new Map<string, number>();
      for (const slice of plan.slices) {
        perWorkItem.set(slice.workItemId, (perWorkItem.get(slice.workItemId) ?? 0) + 1);
      }
      if ([...perWorkItem.values()].some((count) => count > 1)) multiRole += 1;
      if (plan.edges.length > 0) withEdges += 1;
      if (plan.rows.some((row) => row.parentId !== null)) withParents += 1;
      if (plan.slices.some((slice) => slice.days === null)) unestimated += 1;
      if (plan.notBefore.size > 0) floored += 1;
    }

    expect(multiRole).toBeGreaterThan(500);
    expect(withEdges).toBeGreaterThan(500);
    expect(withParents).toBeGreaterThan(500);
    expect(unestimated).toBeGreaterThan(500);
    expect(floored).toBeGreaterThan(200);
  });
});
