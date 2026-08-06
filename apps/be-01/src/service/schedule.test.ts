import { describe, expect, it } from 'bun:test';

import type { WorkItem } from '../repository';
import type { DependencyEdge } from './schedule';
import { schedule } from './schedule';

let position = 0;
const item = (id: string, parentId: string | null = null): WorkItem => ({
  id,
  projectId: 'p1',
  parentId,
  position: (position += 10),
  name: id,
  notes: '',
  frozenNumber: null,
  startNoEarlierThan: null,
  serviceTeamId: null,
});

const edge = (predecessorId: string, successorId: string): DependencyEdge => ({
  predecessorId,
  successorId,
});

/** Whole days per leaf, the shape `schedule` takes rather than raw estimates. */
const days = (entries: Record<string, number>): Map<string, number> =>
  new Map(Object.entries(entries));

describe('schedule — the forward pass', () => {
  it('starts a leaf with no predecessor on day zero', () => {
    const rows = [item('a')];

    const found = schedule(rows, [], days({ a: 3 }));

    expect(found.get('a')).toMatchObject({ earliestStart: 0, earliestFinish: 3 });
  });

  it('makes a leaf wait for the one it depends on', () => {
    const rows = [item('a'), item('b')];

    const found = schedule(rows, [edge('a', 'b')], days({ a: 3, b: 2 }));

    expect(found.get('b')).toMatchObject({ earliestStart: 3, earliestFinish: 5 });
  });

  it('waits for the later of two predecessors', () => {
    const rows = [item('a'), item('b'), item('c')];

    const found = schedule(rows, [edge('a', 'c'), edge('b', 'c')], days({ a: 3, b: 7, c: 1 }));

    expect(found.get('c')).toMatchObject({ earliestStart: 7, earliestFinish: 8 });
  });

  it('accumulates along a chain', () => {
    const rows = [item('a'), item('b'), item('c')];

    const found = schedule(rows, [edge('a', 'b'), edge('b', 'c')], days({ a: 1, b: 2, c: 4 }));

    expect(found.get('c')).toMatchObject({ earliestStart: 3, earliestFinish: 7 });
  });
});

describe('schedule — float and the critical path', () => {
  /**
   * ```
   * long-1 (5) ─→ long-2 (5)      finishes day 10
   * short  (3)                    finishes day 3, and has 7 days of slack
   * ```
   */
  const parallel = () => {
    const rows = [item('long-1'), item('long-2'), item('short')];
    return schedule(rows, [edge('long-1', 'long-2')], days({ 'long-1': 5, 'long-2': 5, short: 3 }));
  };

  it('gives the long chain no float and marks it critical', () => {
    const found = parallel();

    expect(found.get('long-1')).toMatchObject({ float: 0, critical: true });
    expect(found.get('long-2')).toMatchObject({ float: 0, critical: true });
  });

  it('gives the short branch its slack and does not mark it', () => {
    const found = parallel();

    expect(found.get('short')).toMatchObject({
      earliestStart: 0,
      latestStart: 7,
      float: 7,
      critical: false,
    });
  });

  it('measures float against the project finish, not against a neighbour', () => {
    // `b` can slip two days and still make the day-6 finish `c` sets.
    const rows = [item('a'), item('b'), item('c')];

    const found = schedule(rows, [edge('a', 'b'), edge('a', 'c')], days({ a: 2, b: 2, c: 4 }));

    expect(found.get('b')?.float).toBe(2);
    expect(found.get('c')?.float).toBe(0);
  });
});

describe('schedule — parents', () => {
  it('spans its children rather than summing them', () => {
    // Two independent children of 3 and 4 days: 7 days of effort, 4 days of span.
    // The roll-up already reports the effort; conflating the two is the mistake
    // this separation exists to prevent.
    const rows = [item('parent'), item('kid-a', 'parent'), item('kid-b', 'parent')];

    const found = schedule(rows, [], days({ 'kid-a': 3, 'kid-b': 4 }));

    expect(found.get('parent')).toMatchObject({ earliestStart: 0, earliestFinish: 4 });
  });

  it('starts when the earliest of its descendants starts', () => {
    const rows = [item('parent'), item('kid-a', 'parent'), item('kid-b', 'parent'), item('before')];

    const found = schedule(
      rows,
      [edge('before', 'kid-a')],
      days({ before: 2, 'kid-a': 1, 'kid-b': 5 }),
    );

    // `kid-b` is free to start at 0; `kid-a` waits until 2. The branch spans both.
    expect(found.get('parent')).toMatchObject({ earliestStart: 0, earliestFinish: 5 });
  });

  it('reaches through more than one level', () => {
    const rows = [item('top'), item('mid', 'top'), item('leaf', 'mid')];

    const found = schedule(rows, [], days({ leaf: 6 }));

    expect(found.get('top')).toMatchObject({ earliestStart: 0, earliestFinish: 6 });
    expect(found.get('mid')).toMatchObject({ earliestStart: 0, earliestFinish: 6 });
  });
});

describe('schedule — a dependency declared on a parent', () => {
  it('waits for every leaf beneath the predecessor', () => {
    const rows = [item('phase'), item('p-fast', 'phase'), item('p-slow', 'phase'), item('after')];

    const found = schedule(
      rows,
      [edge('phase', 'after')],
      days({ 'p-fast': 1, 'p-slow': 6, after: 2 }),
    );

    expect(found.get('after')).toMatchObject({ earliestStart: 6, earliestFinish: 8 });
  });

  it('constrains every leaf beneath the successor', () => {
    const rows = [item('first'), item('phase'), item('p-a', 'phase'), item('p-b', 'phase')];

    const found = schedule(rows, [edge('first', 'phase')], days({ first: 4, 'p-a': 1, 'p-b': 2 }));

    expect(found.get('p-a')?.earliestStart).toBe(4);
    expect(found.get('p-b')?.earliestStart).toBe(4);
  });
});

describe('schedule — what it refuses and what it admits', () => {
  it('throws on a cyclic graph rather than returning a schedule', () => {
    // A schedule computed from a cycle is wrong in a way no reader could detect.
    // The write path refuses the edge that would close one; this protects the
    // computation from any graph it is handed, including a restored database.
    const rows = [item('a'), item('b')];

    expect(() => schedule(rows, [edge('a', 'b'), edge('b', 'a')], days({ a: 1, b: 1 }))).toThrow(
      /cycle/i,
    );
  });

  it('reports an unestimated leaf as unestimated, not merely as zero', () => {
    // A zero that means "instant" and a zero that means "nobody has looked" are
    // the same number and opposite facts.
    const rows = [item('done'), item('untouched')];

    const found = schedule(rows, [], days({ done: 2 }));

    expect(found.get('done')).toMatchObject({ duration: 2, estimated: true });
    expect(found.get('untouched')).toMatchObject({ duration: 0, estimated: false });
  });

  it('marks a parent unestimated when nothing beneath it is estimated', () => {
    const rows = [item('parent'), item('kid', 'parent')];

    const found = schedule(rows, [], days({}));

    expect(found.get('parent')?.estimated).toBe(false);
  });

  it('marks a parent estimated when any leaf beneath it is', () => {
    const rows = [item('parent'), item('kid-a', 'parent'), item('kid-b', 'parent')];

    const found = schedule(rows, [], days({ 'kid-a': 3 }));

    expect(found.get('parent')?.estimated).toBe(true);
  });

  it('schedules an empty project without complaint', () => {
    expect(schedule([], [], days({})).size).toBe(0);
  });
});

describe('schedule — on a graph the size of a real plan', () => {
  /** `branches` parents of `perBranch` leaves each, chained one branch to the next. */
  const bigPlan = (branches: number, perBranch: number) => {
    const rows: WorkItem[] = [];
    const edges: DependencyEdge[] = [];
    const durations = new Map<string, number>();
    for (let b = 0; b < branches; b++) {
      rows.push(item(`branch-${String(b)}`));
      for (let l = 0; l < perBranch; l++) {
        const id = `leaf-${String(b)}-${String(l)}`;
        rows.push(item(id, `branch-${String(b)}`));
        durations.set(id, 1);
      }
      // Declared parent to parent, which is the expensive shape: it expands to
      // every pair of leaves across the two branches.
      if (b > 0) edges.push(edge(`branch-${String(b - 1)}`, `branch-${String(b)}`));
    }
    return { rows, edges, durations };
  };

  it('schedules a hundred branches of twenty leaves without falling over', () => {
    // codex, high: the first version rebuilt the whole child index twice per
    // edge and once per parent, and copied adjacency arrays with a spread. This
    // is 2,000 leaves and 99 parent-to-parent edges, which expand to about
    // 39,600 leaf edges. A number rather than an assurance — the claim in
    // `verify.md` used to be "fine for hundreds", untested.
    const { rows, edges, durations } = bigPlan(100, 20);

    const started = performance.now();
    const found = schedule(rows, edges, durations);
    const took = performance.now() - started;

    expect(found.size).toBe(rows.length);
    // The last branch waits for all ninety-nine before it, each one day long.
    expect(found.get('leaf-99-0')).toMatchObject({ earliestStart: 99, earliestFinish: 100 });
    expect(took).toBeLessThan(4000);
  });
});
