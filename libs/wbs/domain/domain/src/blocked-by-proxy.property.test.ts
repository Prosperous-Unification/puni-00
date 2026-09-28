import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { blockedByProxyOf } from './blocked-by-proxy';
import type { PlannedRow } from './derive-numbers';
import { LEAF_STATUSES, type LeafStatus, type WorkItemStatus } from './progress';
import { type DependencyEdge, indexTree } from './schedule';

const STOPPED: ReadonlySet<WorkItemStatus> = new Set(['on_hold', 'blocked', 'blocked_by_proxy']);
const UNSTARTED: ReadonlySet<WorkItemStatus> = new Set(['unknown', 'draft', 'ready']);

/** Up to eight flat leaves, a status each, and any edges between distinct ones, cycles included. */
const plan = fc
  .array(fc.constantFrom(...LEAF_STATUSES), { minLength: 1, maxLength: 8 })
  .chain((statuses) =>
    fc.record({
      statuses: fc.constant(statuses),
      // Self-pairs are dropped after generation rather than filtered during it:
      // a one-leaf plan has no other kind, and a filter would never finish.
      edges: fc
        .array(fc.tuple(fc.nat(statuses.length - 1), fc.nat(statuses.length - 1)), {
          maxLength: 16,
        })
        .map((pairs) =>
          pairs
            .filter(([from, to]) => from !== to)
            .map(([from, to]): DependencyEdge => ({
              predecessorId: `l${String(from)}`,
              successorId: `l${String(to)}`,
            })),
        ),
    }),
  );

const rowsOf = (count: number): PlannedRow[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `l${String(index)}`,
    parentId: null,
    position: index,
    frozenNumber: null,
    priority: null,
  }));

/**
 * The least fixed point by brute force: sweep every edge until nothing changes.
 * Deliberately not the breadth-first spread under test.
 */
function proxyByIteration(
  statuses: ReadonlyMap<string, LeafStatus>,
  edges: readonly DependencyEdge[],
): Map<string, WorkItemStatus> {
  const answer = new Map<string, WorkItemStatus>(statuses);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { predecessorId, successorId } of edges) {
      const before = answer.get(predecessorId);
      const after = answer.get(successorId);
      if (before === undefined || after === undefined) throw new Error('edge off the plan');
      if (STOPPED.has(before) && UNSTARTED.has(after)) {
        answer.set(successorId, 'blocked_by_proxy');
        changed = true;
      }
    }
  }
  return answer;
}

describe('blockedByProxyOf over any leaf graph', () => {
  it('equals the least fixed point of "an unstarted leaf behind stopped work is stopped"', () => {
    // Soundness and completeness at once: every proxy traces back to a hold
    // through proxies (least), and no unstarted leaf behind a stopped one is
    // missed (fixed point). Transitivity is the completeness half.
    fc.assert(
      fc.property(plan, ({ statuses, edges }) => {
        const leafStatuses = new Map(
          statuses.map((status, index) => [`l${String(index)}`, status]),
        );
        const derived = blockedByProxyOf(
          indexTree(rowsOf(statuses.length)),
          { edges, typed: [] },
          leafStatuses,
        );
        expect(Object.fromEntries(derived)).toEqual(
          Object.fromEntries(proxyByIteration(leafStatuses, edges)),
        );
      }),
      { numRuns: 2_000 },
    );
  });
});
