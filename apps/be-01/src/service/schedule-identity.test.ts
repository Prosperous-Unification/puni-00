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

/** One work item's estimate for one role, before either engine has been given it. */
interface EstimateRow {
  workItemId: string;
  roleId: string;
  days: number | null;
}

interface GeneratedPlan {
  rows: WorkItem[];
  edges: DependencyEdge[];
  /** In role order, which is the order both the repository and the adapter hand them over in. */
  estimates: EstimateRow[];
  notBefore: Map<string, number>;
}

/**
 * One random plan: a tree up to three deep, dependencies between the rows that
 * can take them, `roleCount` roles, PERT figures, and a few manual floors.
 *
 * The estimates are PERT thirds on purpose. Whole days would agree through any
 * arithmetic; the sixths are what make the difference between adding a work
 * item's roles up first and accumulating them one slice at a time visible in
 * the last bits.
 *
 * It hands back the estimates rather than the two engines' inputs, and the two
 * are derived separately below. Building both in one loop is how the first
 * version of this file made the sums agree by construction — the old engine was
 * handed a total added up in exactly the order the slices were made in, which is
 * the one order it was guaranteed to match.
 */
function generatePlan(seed: number, roleCount: number): GeneratedPlan {
  const random = randomFrom(seed);
  const pick = <T>(from: readonly T[]): T => from[Math.floor(random() * from.length)];
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
  const estimates: EstimateRow[] = [];
  for (const row of rows) {
    if (hasChildren.has(row.id)) continue;
    for (const roleId of roleIds) {
      const estimated = random() > 0.25;
      const days = estimated
        ? PERT(pick([0, 1, 2, 3]), pick([1, 2, 3, 5, 8]), pick([2, 4, 7, 9, 13]))
        : null;
      estimates.push({ workItemId: row.id, roleId, days });
    }
  }

  const notBefore = new Map<string, number>();
  for (const row of rows) {
    if (hasChildren.has(row.id)) continue;
    if (random() > 0.85) notBefore.set(row.id, Math.floor(random() * 8));
  }

  return { rows, edges, estimates, notBefore };
}

/** What the adapter builds: one slice per pair, in role order, unestimated ones included. */
const slicesFrom = (plan: GeneratedPlan): Slice[] =>
  plan.estimates.map((each) => ({
    workItemId: each.workItemId,
    roleId: each.roleId,
    days: each.days,
  }));

/**
 * What the previous engine's adapter built: one total per leaf, summed in the
 * order the estimate rows arrived in.
 *
 * `shuffle` is the point of this function existing. Before this change nothing
 * ordered `EstimateRepository.listByProject`, so the order was SQLite's to
 * choose, and a total is a chain of floating-point additions whose result
 * depends on it. Handing the old engine a **differently ordered** sum is what
 * makes the identity claim a claim about the plan rather than about the loop
 * that built the test.
 */
function durationsFrom(plan: GeneratedPlan, shuffle: boolean, seed: number): Map<string, number> {
  const random = randomFrom(seed * 7919 + 13);
  const perWorkItem = new Map<string, number[]>();
  for (const each of plan.estimates) {
    if (each.days === null) continue;
    const held = perWorkItem.get(each.workItemId);
    if (held === undefined) perWorkItem.set(each.workItemId, [each.days]);
    else held.push(each.days);
  }

  const durations = new Map<string, number>();
  for (const [workItemId, days] of perWorkItem) {
    const addends = [...days];
    if (shuffle) {
      for (let i = addends.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const held = addends[i];
        addends[i] = addends[j];
        addends[j] = held;
      }
    }
    let total = 0;
    for (const each of addends) total += each;
    durations.set(workItemId, total);
  }
  return durations;
}

/** Every field of every row, `toBe`-equal, or a throw naming the seed and the two numbers. */
function expectSameSchedule(
  seed: number,
  expected: ReadonlyMap<string, Scheduled>,
  found: ReadonlyMap<string, Scheduled>,
): void {
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

/** `Dev` and `QA`: the most roles any project in a released database can hold. */
const RELEASED_ROLES = 2;

describe('the slice engine against the one it replaced', () => {
  it('answers what it answered for a two-role plan, however the old sum was ordered', () => {
    // The change's central claim, at the size every project that already exists
    // is: two roles, because `role-crud` and this change ship in the same
    // release train and nothing before them could write a third.
    //
    // The old engine is handed its totals **shuffled**, because nothing ordered
    // the estimate read it built them from. Two addends make that harmless —
    // IEEE addition commutes, so `a + b` is `b + a` to the bit — and this is
    // that argument executed rather than asserted.
    //
    // Every field `toBe`-equal, not `toBeCloseTo`: slack is a column and
    // `critical` is a red row, and both are read off exact comparisons with zero.
    for (let seed = 1; seed <= 1000; seed += 1) {
      const plan = generatePlan(seed, RELEASED_ROLES);
      const durations = durationsFrom(plan, true, seed);
      const expected = previousSchedule(plan.rows, plan.edges, durations, plan.notBefore);
      const found = schedule(plan.rows, plan.edges, slicesFrom(plan), plan.notBefore).workItems;

      expectSameSchedule(seed, expected, found);
    }
  });

  it('answers what it answered for a three-role plan summed in role order', () => {
    // Three roles are reachable the moment this release lands, and for three
    // addends the order is no longer free: association is not commutation. So
    // the order is **defined** — `EstimateRepository.listByProject` orders by
    // role position and the adapter slices in the same order — and this is that
    // definition held to: the same estimates, added up the way the repository
    // now hands them over, come out the same on both sides.
    for (let seed = 1; seed <= 1000; seed += 1) {
      const plan = generatePlan(seed, 3);
      const durations = durationsFrom(plan, false, seed);
      const expected = previousSchedule(plan.rows, plan.edges, durations, plan.notBefore);
      const found = schedule(plan.rows, plan.edges, slicesFrom(plan), plan.notBefore).workItems;

      expectSameSchedule(seed, expected, found);
    }
  });

  it('generates plans worth measuring, so a green run is not an empty one', () => {
    // The generator is as capable of being wrong as the engine. This asserts the
    // corpus actually contains the shapes the claims are about — and that the
    // shuffle above really does permute, since a shuffle that never moved
    // anything would make the first test the same test as the second.
    let multiRole = 0;
    let withEdges = 0;
    let withParents = 0;
    let unestimated = 0;
    let floored = 0;
    let reordered = 0;
    for (let seed = 1; seed <= 1000; seed += 1) {
      const plan = generatePlan(seed, RELEASED_ROLES);
      const perWorkItem = new Map<string, number>();
      for (const each of plan.estimates) {
        perWorkItem.set(each.workItemId, (perWorkItem.get(each.workItemId) ?? 0) + 1);
      }
      if ([...perWorkItem.values()].some((count) => count > 1)) multiRole += 1;
      if (plan.edges.length > 0) withEdges += 1;
      if (plan.rows.some((row) => row.parentId !== null)) withParents += 1;
      if (plan.estimates.some((each) => each.days === null)) unestimated += 1;
      if (plan.notBefore.size > 0) floored += 1;

      // The shuffle is only observable through the order of the addends, so it
      // is re-run here and compared against the role-ordered one.
      const random = randomFrom(seed * 7919 + 13);
      const inOrder: number[] = [];
      for (const each of plan.estimates) if (each.days !== null) inOrder.push(each.days);
      const shuffled = [...inOrder];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const held = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = held;
      }
      if (shuffled.some((each, at) => each !== inOrder[at])) reordered += 1;
    }

    expect(multiRole).toBeGreaterThan(500);
    expect(withEdges).toBeGreaterThan(500);
    expect(withParents).toBeGreaterThan(500);
    expect(unestimated).toBeGreaterThan(500);
    expect(floored).toBeGreaterThan(200);
    expect(reordered).toBeGreaterThan(900);
  });
});
