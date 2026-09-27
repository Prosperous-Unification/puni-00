import { describe, expect, it } from 'bun:test';

import type { PlannedRow } from './derive-numbers';
import type { DependencyReach } from './index';
import type { DependencyEdge, Slice } from './schedule';
import { schedule, sliceKey } from './schedule';
import type { DependencyEndpoint, TypedDependency } from './typed-dependency';

/**
 * Fast over typed finish-to-start dependencies (WBS 010.4.6, tasks 7.1–7.3):
 * an authored edge enters whichever step node it names, a parent expands to
 * every leaf, an unestimated predecessor node takes no time, and legacy links
 * keep their dynamic reach beside typed ones.
 *
 * Every leaf has Dev then QA, nobody is assigned and every width is 1, so the
 * only thing that orders two slices is an edge.
 */
const DEV = 'step-dev';
const QA = 'step-qa';

let position = 0;
const item = (id: string, parentId: string | null = null): PlannedRow => ({
  id,
  parentId,
  position: (position += 10),
  frozenNumber: null,
  priority: null,
});

/** Dev then QA for each leaf, from `[dev, qa]` days; `null` is unestimated. */
const slicesFor = (days: Record<string, [number | null, number | null]>): Slice[] =>
  Object.entries(days).flatMap(([workItemId, [dev, qa]]) => [
    { workItemId, stepId: DEV, days: dev, personId: null, width: 1, poolIds: [] },
    { workItemId, stepId: QA, days: qa, personId: null, width: 1, poolIds: [] },
  ]);

const node = (workItemId: string, stepId: string): DependencyEndpoint => ({
  scope: 'node',
  workItemId,
  stepId,
});
const whole = (workItemId: string): DependencyEndpoint => ({ scope: 'whole', workItemId });
const fs = (
  id: string,
  predecessor: DependencyEndpoint,
  successor: DependencyEndpoint,
): TypedDependency => ({ id, predecessor, successor, type: 'FS' });

const run = (
  rows: readonly PlannedRow[],
  days: Record<string, [number | null, number | null]>,
  typed: readonly TypedDependency[],
  legacy: readonly DependencyEdge[] = [],
  reach: DependencyReach = 'whole-item',
) => schedule(rows, legacy, slicesFor(days), new Map(), new Map(), reach, new Map(), typed);

const startOf = (placed: ReturnType<typeof run>, workItemId: string, stepId: string): number => {
  const found = placed.slices.get(sliceKey(workItemId, stepId));
  if (found === undefined) throw new Error(`no slice ${workItemId}/${stepId}`);
  return found.earliestStart;
};

describe('Fast with typed finish-to-start dependencies', () => {
  it('holds a later successor step and lets the earlier one run', () => {
    // A.dev (3) → B.qa: B.dev starts at once; B.qa waits for A.dev's finish.
    const placed = run([item('A'), item('B')], { A: [3, 2], B: [1, 1] }, [
      fs('r1', node('A', DEV), node('B', QA)),
    ]);
    expect(startOf(placed, 'B', DEV)).toBe(0);
    expect(startOf(placed, 'B', QA)).toBe(3);
  });

  it('lets a Dev handoff overlap the predecessor’s QA', () => {
    // A.dev (2) → B.dev: B.dev waits for A.dev only, not for A.qa (5).
    const placed = run([item('A'), item('B')], { A: [2, 5], B: [1, 1] }, [
      fs('r1', node('A', DEV), node('B', DEV)),
    ]);
    expect(startOf(placed, 'B', DEV)).toBe(2);
    expect(startOf(placed, 'A', QA)).toBe(2);
  });

  it('waits for every leaf of a whole parent predecessor', () => {
    // P over P1 (2+1) and P2 (4+2): whole P → whole B waits for both leaves'
    // QA, the later of which finishes at 6.
    const placed = run(
      [item('P'), item('P1', 'P'), item('P2', 'P'), item('B')],
      { P1: [2, 1], P2: [4, 2], B: [1, 1] },
      [fs('r1', whole('P'), whole('B'))],
    );
    expect(startOf(placed, 'B', DEV)).toBe(6);
  });

  it('gives an unestimated predecessor node no time', () => {
    // A.dev unestimated takes no schedule time, so B.dev starts with it.
    const placed = run([item('A'), item('B')], { A: [null, 2], B: [1, 1] }, [
      fs('r1', node('A', DEV), node('B', DEV)),
    ]);
    expect(startOf(placed, 'B', DEV)).toBe(0);
  });

  it('keeps a legacy link’s dynamic reach beside a typed one', () => {
    // Legacy A → C under anchor-slice anchors at A.dev (2); typed B.qa → C.qa.
    const placed = run(
      [item('A'), item('B'), item('C')],
      { A: [2, 5], B: [1, 4], C: [1, 1] },
      [fs('r1', node('B', QA), node('C', QA))],
      [{ predecessorId: 'A', successorId: 'C' }],
      'anchor-slice',
    );
    expect(startOf(placed, 'C', DEV)).toBe(2);
    expect(startOf(placed, 'C', QA)).toBe(5);
  });
});
